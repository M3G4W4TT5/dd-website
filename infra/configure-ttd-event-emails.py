#!/usr/bin/env python3
"""Inspect the separate approved native email patch; --apply requires release approval.

Run inside the configured pinned Pretix container with the adjacent JSON package.
No sends, attachment changes, payment settings or order mutations are performed.
A drifted effective template stops the entire transaction before any writes.
"""
import argparse
import json
import os
from pathlib import Path

PATCH = json.loads(Path(__file__).with_name('ttd-event-email-settings.json').read_text())
EVENTS = {'street-dance-workshop-dd-dev', 'dance-with-dd-dev'}
ALLOWED = {'mail_text_' + name for name in ('order_placed', 'order_paid', 'order_free', 'resend_link', 'order_custom_mail', 'order_placed_require_approval', 'order_approved_free')}
REPLACEMENTS = {
    'en': {'You can change your order details and view the status of your order at': 'You can view the status of your order at'},
    'da': {text: 'Du kan se status på din bestilling på' for text in (
        'Du kan ændre din bestilling og dens status på',
        'Du kan ændre informationer og se status på din bestilling på',
        'Du kan ændre din bestilling og se dens status på',
        'Du kan ændre dine bestillingsoplysninger og se status på din bestilling her:',
    )},
}


def approved_text(text, language):
    for before, after in REPLACEMENTS[language].items():
        text = text.replace(before, after)
    return text


def configure(apply=False):
    from django.db import transaction
    from i18nfield.strings import LazyI18nString
    from django_scopes import scope
    from pretix.base.models import Event, Organizer
    if PATCH['organizer'] != 'dd-studio' or set(PATCH['events']) != EVENTS:
        raise RuntimeError('Unreviewed organizer/events')
    organizer = Organizer.objects.get(slug=PATCH['organizer'])
    with scope(organizer=organizer), transaction.atomic():
        pending = []
        for slug, changes in PATCH['events'].items():
            if set(changes) != ALLOWED:
                raise RuntimeError('Unreviewed email settings keys')
            event = Event.objects.select_for_update().get(organizer=organizer, slug=slug)
            if not event.testmode:
                raise RuntimeError('Event is not in sandbox test mode')
            for key, languages in changes.items():
                if set(languages) != {'en', 'da'}:
                    raise RuntimeError('Unreviewed languages')
                # get() resolves event/organizer/default inheritance. Retain all other languages.
                current = dict(event.settings.get(key, as_type=LazyI18nString).data)
                updated = dict(current)
                for language, change in languages.items():
                    if change['after'] != approved_text(change['before'], language) or change['before'] == change['after']:
                        raise RuntimeError('Unapproved email text change')
                    if current.get(language) not in (change['before'], change['after']):
                        raise RuntimeError(f'Effective template drift: {slug}/{key}/{language}; inspect and review again')
                    updated[language] = change['after']
                pending.append((event, key, current, updated))
        # Validate both events and every template before the first write.
        for event, key, current, updated in pending:
            print(f'{event.slug}/{key}: ' + ('already matches' if current == updated else 'approved wording replacement only'))
            if apply and current != updated:
                event.settings.set(key, LazyI18nString(updated))
                if event.settings.get(key, as_type=LazyI18nString).data != updated:
                    raise RuntimeError('Effective email verification failed')
        print('Verified' if apply else 'Inspection only; no settings written')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'production_settings')
    import django
    django.setup()
    configure(args.apply)
