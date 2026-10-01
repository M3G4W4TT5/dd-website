#!/usr/bin/env python3
"""Inspect/apply only the reviewed TTD settings inside the Pretix container.

Run with its existing production_settings and database connection. Default is
read-only. --apply is reserved for the approved hosted sandbox release. No new
credentials, public access, payment methods, orders, or messages are created.
"""
import argparse
import json
import os
from pathlib import Path

PATCH = json.loads(Path(__file__).with_name('ttd-checkout-settings.json').read_text())
ALLOWED = {'region', 'primary_color', 'allow_modifications', 'cancel_allow_user', 'cancel_allow_user_paid'}


def configure(apply=False):
    from django.db import transaction
    from django_scopes import scope
    from pretix.base.models import Event, Organizer
    organizer = Organizer.objects.get(slug=PATCH['organizer'])
    with scope(organizer=organizer), transaction.atomic():
        events = []
        for slug, changes in PATCH['events'].items():
            if not changes.keys() <= ALLOWED:
                raise RuntimeError('Unreviewed settings key')
            event = Event.objects.select_for_update().get(organizer=organizer, slug=slug)
            if not event.testmode:
                raise RuntimeError('Event is not in sandbox test mode')
            events.append((event, changes))
        # Validate every event before any setting is changed.
        for event, changes in events:
            delta = {key: value for key, value in changes.items() if event.settings.get(key, as_type=type(value)) != value}
            print(event.slug + ': ' + ('already matches' if not delta else json.dumps(delta, sort_keys=True)))
            if apply:
                for key, value in delta.items():
                    event.settings.set(key, value)
                if any(event.settings.get(key, as_type=type(value)) != value for key, value in changes.items()):
                    raise RuntimeError('Settings verification failed')
                print(event.slug + ': verified')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'production_settings')
    import django
    django.setup()
    configure(args.apply)
