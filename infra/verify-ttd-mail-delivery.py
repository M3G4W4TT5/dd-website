#!/usr/bin/env python3
"""Pinned native mail task/MIME/routing regression; no network, synthetic SQLite."""
import os
from io import BytesIO
from types import SimpleNamespace
from unittest.mock import patch
from pathlib import Path
import tempfile
import smtplib

if os.environ.get('DATA_DIR') != '/tmp/ttd-verification':
    raise RuntimeError('Isolated fixture only')
os.environ['DJANGO_SETTINGS_MODULE'] = 'production_settings'
import django
django.setup()
from django.conf import settings
assert settings.DATABASES['default']['ENGINE'] == 'django.db.backends.sqlite3'
from django.core.management import call_command
call_command('migrate', verbosity=0, interactive=False)
from django.core.mail import EmailMultiAlternatives
from django.core.mail.backends.smtp import EmailBackend
from django.utils import timezone
from django_scopes import scope, scopes_disabled
from i18nfield.strings import LazyI18nString
from pretix.base.models import Organizer, Event, Order
from pretix.base.models.mail import OutgoingMail
from pretix.base.services.mail import mail_send_task
from pretix.base.email import CheckPrivateNetworkSmtpBackend
import production_settings as adapter

policy = dict(delivery='controlled', release_enabled='false', host='smtp.purelymail.com', port='465', user='booking@didde-mie.com', password='synthetic-password-only', recipient_allowlist='dev@memoryone.eu')
# Check actual file parser/gates without any credential or socket access.
with tempfile.TemporaryDirectory() as directory:
    cfg = Path(directory) / 'mail.cfg'
    for changes, valid in [({},True),({'release_enabled':'true'},False),({'delivery':'enabled','release_enabled':'true'},True),({'host':'outside.test'},False),({'recipient_allowlist':'other@example.test'},False),({'password':''},False)]:
        values = policy | changes
        cfg.write_text('[ttd-mail]\n' + ''.join(f'{k}={v}\n' for k,v in values.items()))
        with patch.dict(os.environ, PRETIX_CONFIG_FILE=str(cfg)):
            try: adapter.ttd_mail_policy()
            except RuntimeError: assert not valid
            else: assert valid
with patch.object(adapter, 'ttd_mail_policy', return_value=policy):
    adapter.configure_ttd_mail_delivery()
organizer = Organizer.objects.create(slug='dd-studio', name='Synthetic TTD')
other = Organizer.objects.create(slug='other', name='Unrelated')
records = []
for org, slug in [(organizer,'studio'),(organizer,'dance-with-dd-dev'),(organizer,'street-dance-workshop-dd-dev'),(organizer,'unrelated'),(other,'dance-with-dd-dev')]:
    event = Event.objects.create(organizer=org, slug=slug, name=LazyI18nString({'en':'Synthetic event'}), date_from=timezone.now(), currency='DKK', testmode=True, live=True)
    with scope(organizer=org):
        order = Order.objects.create(event=event, sales_channel=org.sales_channels.get(identifier='web'), email='dev@memoryone.eu', total=100, status='p', datetime=timezone.now())
        records.append((event,order))

# Exercise complete native mail_send_task: ticket attachment, HTML/CID generation,
# final To/Cc/Bcc guard, sender, native sent/failed/retry states and isolation.
wire=[]
def smtp_send(backend, messages):
    messages=list(messages)
    wire.extend((backend, m, m.message().as_bytes()) for m in messages)
    return len(messages)
def make(event,order,to='dev@memoryone.eu',cc=None,bcc=None):
    with scope(organizer=event.organizer):
        return OutgoingMail.objects.create(event=event,order=order,to=[to],cc=cc or [],bcc=bcc or [],subject='Synthetic native paid mail',body_plain='Native order link https://example.test/order',body_html='<html><body>Native HTML</body></html>',sender='Native <noreply+booking@didde-mie.com>',headers={'Reply-To':'unapproved@example.test'},should_attach_tickets=True)
def run(m):
    with scopes_disabled():
        with patch.object(mail_send_task, 'retry', side_effect=__import__('celery').exceptions.MaxRetriesExceededError):
            return mail_send_task.run(outgoing_mail=m.pk)
def ticket(order,**kwargs):
    return [('ticket.pdf',SimpleNamespace(file=BytesIO(b'%PDF-1.4 synthetic ticket only'),type='application/pdf'))]
checks=0
with patch.object(EmailBackend,'send_messages',smtp_send), patch('pretix.base.services.mail.get_tickets_for_order',ticket):
    for event,order in records:
        m=make(event,order); before=len(wire); assert run(m)
        m.refresh_from_db(); assert m.status=='sent' and len(wire)==before+1
        backend,email,raw=wire[-1]
        selected=event.organizer.slug=='dd-studio' and event.slug in {'dance-with-dd-dev','street-dance-workshop-dd-dev'}
        assert isinstance(backend,CheckPrivateNetworkSmtpBackend)==selected
        if selected:
            assert backend.host=='smtp.purelymail.com' and backend.use_ssl and not backend.use_tls
            assert email.from_email=='TTD Studio <noreply+booking@didde-mie.com>'
            assert email.reply_to==['booking@didde-mie.com'] and 'Reply-To' not in email.extra_headers
        assert b'application/pdf' in raw and b'https://example.test/order' in raw
        assert len(m.actual_attachments)==1
        before=len(wire); assert run(m) is False; assert len(wire)==before # no resend of SENT task
        checks+=1
    event,order=records[1]
    for to,cc,bcc in [('other@example.test',[],[]),('dev@memoryone.eu',['other@example.test'],[]),('dev@memoryone.eu',[],['other@example.test'])]:
        m=make(event,order,to,cc,bcc); assert run(m)
        assert wire[-1][0].host=='mail-capture'; checks+=1
    # Final plugin recipient rewrite is also checked at the final boundary.
    m=make(event,order)
    backend=m.get_mail_backend()
    changed=EmailMultiAlternatives('Synthetic','body','sender@example.test',['other@example.test'])
    backend.send_messages([changed]); assert wire[-1][0].host=='mail-capture'; checks+=1
    event.testmode=False; event.save()
    m=make(event,order); assert run(m); assert wire[-1][0].host=='mail-capture'; checks+=1
    # Explicit production release policy supports real recipients only after gate.
    policy.update(delivery='enabled',release_enabled='true')
    m=make(event,order,'customer@example.test'); assert run(m)
    assert wire[-1][0].host=='smtp.purelymail.com'; checks+=1
    policy.update(delivery='controlled',release_enabled='false')
    event.testmode=True; event.save()
    for error,expected in [(smtplib.SMTPResponseException(550,b'Synthetic permanent rejection'),'failed'),(smtplib.SMTPResponseException(421,b'Synthetic retry'),'awaiting_retry')]:
        m=make(event,order)
        with patch.object(EmailBackend,'send_messages',side_effect=error):
            if expected == 'awaiting_retry':
                from celery.exceptions import Retry
                with scopes_disabled(), patch.object(mail_send_task,'retry',side_effect=Retry):
                    try: mail_send_task.run(outgoing_mail=m.pk)
                    except Retry: pass
            else: run(m)
        m.refresh_from_db(); assert m.status==expected; checks+=1
print(f'PASS pinned native mail task/MIME/routing/status checks: {checks}; no network or mail sent')
