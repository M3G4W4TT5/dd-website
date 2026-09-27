# Owner-run scoped configuration and synthetic capture mail; never external delivery.
from django.conf import settings
from django_scopes import scopes_disabled
from pretix.base.models import Event
from pretix.base.services.mail import mail
from i18nfield.strings import LazyI18nString
assert settings.EMAIL_HOST == 'mail-capture' and settings.EMAIL_PORT == 1025
assert settings.DEFAULT_FROM_EMAIL == 'noreply+booking@didde-mie.com'
with scopes_disabled():
 for e in Event.objects.all():
  assert e.testmode and not e.live
  e.settings.contact_mail = 'booking@didde-mie.com'
  e.settings.mail_from = settings.DEFAULT_FROM_EMAIL
  e.cache.clear()
  for language in ['en','da']:
   mail('fixture@example.com', 'DD infrastructure fixture '+e.slug+' '+language,
        LazyI18nString({'en':'Local captured fixture. No order or payment is implied.',
                        'da':'Lokal testmail. Ingen ordre eller betaling er oprettet.'}),
        context={},event=e,locale=language,plain_text_only=True)
  print('Configured monitored Reply-To and queued EN/DA capture for test event:', e.slug)
