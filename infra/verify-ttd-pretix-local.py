#!/usr/bin/env python3
"""Isolated pinned Pretix check. NEVER run against hosted settings/database.

Requires a new no-network container, DATA_DIR=/tmp/ttd-verification and ephemeral
SQLite. Mount this repository read-only at /review. Optional /out writes native
email drafts only. No orders, payment requests or email delivery are created.
"""
import importlib.util
import json
import os
from pathlib import Path
from types import SimpleNamespace
from decimal import Decimal
from unittest.mock import patch

if os.environ.get('DATA_DIR') != '/tmp/ttd-verification':
    raise RuntimeError('Run only in the isolated ephemeral fixture container')
os.environ['DJANGO_SETTINGS_MODULE'] = 'production_settings'
import django
django.setup()
from django.conf import settings
if settings.DATABASES['default']['ENGINE'] != 'django.db.backends.sqlite3' or not str(settings.DATABASES['default']['NAME']).startswith('/tmp/ttd-verification/'):
    raise RuntimeError('Refusing a non-fixture database')
from django.core.management import call_command
call_command('migrate', verbosity=0, interactive=False)
print('PASS ephemeral SQLite migrations', flush=True)
from django.urls import resolve
from pretix.multidomain.urlreverse import eventreverse
from django_scopes import scope
from django.test import RequestFactory
from django.http import HttpResponse
from django.contrib.sessions.backends.db import SessionStore
from django.utils import timezone, translation
from i18nfield.strings import LazyI18nString
from pretix.base.models import Organizer, Event
from pretix.base.middleware import SecurityMiddleware, calculate_csp_hash
from pretix.presale.signals import global_html_head
from pretix.plugins.stripe.payment import StripeCC
from pretix.base.email import ClassicMailRenderer
import production_settings
import re

root = Path('/review')
organizer = Organizer.objects.create(slug='dd-studio', name='TTD local fixture')
snapshot = json.loads((root / 'docs/review/ttd-emails/native-event-effective-before.json').read_text())
events = {}
for slug in ['studio', *snapshot['events']]:
    event = Event.objects.create(organizer=organizer, slug=slug, name=LazyI18nString({'en':'TTD local fixture','da':'TTD lokal test'}), date_from=timezone.now(), currency='DKK', testmode=True)
    event.settings.set('locales', ['en','da'])
    event.settings.set('primary_color', '#116E3A' if slug == 'studio' else '#7349CD')
    event.settings.set('mail_html_renderer', 'classic')
    if slug in snapshot['events']:
        grouped = {}
        for item in snapshot['events'][slug]:
            grouped.setdefault(item['name'][:-2], {})['da' if item['name'].endswith('_1') else 'en'] = item['value']
        for key, value in grouped.items(): event.settings.set(key, LazyI18nString(value))
    events[slug] = event

# Native card renderer, trusted prefill, actual presale signal and actual response
# middleware. Suppress only unrelated Apple Pay domain-verification task dispatch.
for slug, event in events.items():
    for language in ('en','da'):
        with translation.override(language):
            request = RequestFactory().get(eventreverse(event, 'presale:event.checkout', kwargs={'step': 'payment'}))
            request.event = event; request.organizer = organizer; request.host = 'localhost'
            request.LANGUAGE_CODE = language; request.session = SessionStore()
            request.resolver_match = resolve(request.path_info)
            request.sales_channel = SimpleNamespace(identifier='web')
            middleware = SecurityMiddleware(lambda request: HttpResponse())
            middleware.process_request(request)
            order = SimpleNamespace(email='fixture@example.test',phone='+4520123456',invoice_address=SimpleNamespace(name='<Trusted Buyer>',country='GB',zipcode='SW1A 1AA'))
            with patch('pretix.plugins.stripe.payment.stripe_verify_domain.apply_async'):
                card = StripeCC(event).payment_form_render(request, Decimal('500.00'), order)
            heads = ''.join(str(result or '') for _, result in global_html_head.send(sender=event, request=request))
            response = middleware.process_response(request, HttpResponse(heads + card))
            html = response.content.decode()
            csp = response['Content-Security-Policy']
            authorized = 0
            for tag, content in re.findall(r'<(style|script)>(.*?)</\1>', html, re.S):
                if tag == 'style' and '.ttd-no-postal' in content or tag == 'script' and 'ttd-card-billing' in content:
                    assert calculate_csp_hash(content) in csp
                    authorized += 1
            assert authorized == 2
            assert 'unsafe-inline' not in csp
            assert '&lt;Trusted Buyer&gt;' in html
            assert 'value="SW1A 1AA"' in html
            assert 'class="ttd-no-postal"' in html
            assert 'style="display:block;margin-top:12px"' not in html
            print(f'PASS native card + response CSP {slug}/{language}', flush=True)

# Actual scoped checkout settings activator with real ORM.
spec = importlib.util.spec_from_file_location('checkout_patch', root / 'infra/configure-ttd-checkout.py')
checkout = importlib.util.module_from_spec(spec); spec.loader.exec_module(checkout)
checkout.configure(False)
checkout.configure(True)
checkout.configure(True)
print('PASS real checkout settings activation + idempotence', flush=True)

# Actual inherited settings and JSON patch activator, not a settings stub.
spec = importlib.util.spec_from_file_location('email_patch', root / 'infra/configure-ttd-event-emails.py')
module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
module.configure(False)
module.configure(True)
module.configure(True)
print('PASS real native email settings activation + idempotence', flush=True)

# Actual pinned ClassicMailRenderer, Markdown, Django template and CSS inliner,
# plus the installed candidate branding wrapper. No order/ticket fixture is
# represented as attachment or delivery proof. Native placeholders stay intact.
out = Path('/out')
for slug in snapshot['events']:
    with scope(organizer=organizer):
        event = Event.objects.get(pk=events[slug].pk)
    with translation.override('en'):
        renderer = ClassicMailRenderer(event, organizer=organizer)
        for item in snapshot['events'][slug]:
            language = 'da' if item['name'].endswith('_1') else 'en'
            key = item['name'][:-2]
            with translation.override(language):
                value = event.settings.get(key, as_type=LazyI18nString).data[language]
                html = renderer.render(value, '', 'Local native email draft', None, None, None)
                assert 'data:image/png;base64,' in html
                assert 'You can change your order' not in html
                assert 'Du kan ændre' not in html
                if out.exists():
                    html = re.sub(r'data:image/png;base64,[A-Za-z0-9+/=]+', 'ttd-event-logo.png', html)
                    banner = '<div style="background:white;padding:12px;font:14px Arial">LOCAL NATIVE DRAFT · actual pinned ClassicMailRenderer and candidate event settings · unresolved placeholders · no order, ticket attachments or delivery proof</div>'
                    html = re.sub(r'(<body[^>]*>)', r'\1' + banner, html, count=1)
                    # Normalize insignificant line-end whitespace in review artifacts only.
                    html = '\n'.join(line.rstrip() for line in html.splitlines()) + '\n'
                    (out / (slug + '-' + item['name'].replace('mail_text_', 'native-') + '.html')).write_text(html)
        print(f'PASS actual native email constructors/settings {slug}', flush=True)
print('PASS isolated native verification complete; no payments/orders/mail sends', flush=True)
