# Owner-run installed-code inspection, no message payloads or credentials.
import inspect
from django.conf import settings
from django.db import connection
from django_scopes import scopes_disabled
from pretix.base.models import Event
from pretix.base.services import mail
print('mail service signature:',inspect.signature(mail.mail))
source=inspect.getsource(mail.mail)
lines=source.splitlines()
for i,line in enumerate(lines):
 if any(word in line.lower() for word in ['reply','from_mail','envelope','default_from']):
  print('\n'.join(lines[max(0,i-2):i+3]))
for attr in ['EMAIL_BACKEND','EMAIL_HOST','EMAIL_PORT','DEFAULT_FROM_EMAIL']:
 print(attr,getattr(settings,attr,None))
with connection.cursor() as c:
 c.execute('SELECT current_user,rolsuper FROM pg_roles WHERE rolname=current_user');print('runtime:',c.fetchone())
with scopes_disabled():
 for e in Event.objects.all():
  print('event',e.slug,'testmode',e.testmode,'live',e.live,'sender',e.settings.mail_from,'contact',e.settings.contact_mail)
