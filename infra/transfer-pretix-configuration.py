"""Run inside a pinned Pretix Django shell; transfers only reviewed configuration."""
import hashlib
import json
import os
from pathlib import Path
import tempfile
from datetime import timezone

from django.apps import apps
from django.core import serializers
from django.core.management import call_command
from django.db import transaction
from django.utils.dateparse import parse_datetime
from django_scopes import scopes_disabled

MODELS = ['Organizer', 'Event', 'TaxRule', 'ItemCategory', 'Item', 'ItemVariation', 'Discount',
          'SubEvent', 'SubEventItem', 'SubEventItemVariation', 'Quota', 'Question',
          'QuestionOption', 'Organizer_SettingsStore', 'Event_SettingsStore']
EVENTS = {'studio', 'dance-with-dd-dev', 'street-dance-workshop-dd-dev'}
SETTINGS = set('''attendee_data_explanation_text attendee_emails_asked attendee_emails_required
attendee_names_asked attendee_names_required banner_text banner_text_bottom
cancel_allow_user_paid checkout_phone_helptext checkout_success_text confirm_texts
contact_mail contact_url event_info_text event_list_type frontpage_text imprint_url
invoice_additional_text invoice_address_asked invoice_address_custom_field
invoice_address_custom_field_helptext invoice_address_explanation_text
invoice_address_required invoice_address_vatid_required_countries invoice_email_attachment
invoice_footer_text invoice_include_expire_date invoice_introductory_text invoice_name_required
invoice_renderer invoice_renderer_highlight_order_code locale locales low_availability_percentage
mail_from mail_send_order_approved_attendee mail_send_order_approved_free_attendee
mail_send_order_free_attendee mail_send_order_paid_attendee mail_send_order_placed_attendee
mail_text_download_reminder_attendee max_items_per_order name_scheme name_scheme_titles
order_phone_asked order_phone_required presale_has_ended_text primary_color region
show_quota_left ticket_download ticketoutput_passbook__enabled ticketoutput_pdf__enabled
timezone voucher_explanation_text waiting_list_enabled waiting_list_phones_explanation_text
cookie_consent'''.split())
PLUGINS = {'pretix.plugins.statistics', 'pretix.plugins.checkinlists',
           'pretix.plugins.stripe', 'pretix.plugins.ticketoutputpdf'}
model = lambda name: apps.get_model('pretixbase', name)
LABELS = {model(n)._meta.label_lower for n in MODELS}


def digest(records):
    return hashlib.sha256(json.dumps(records, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def comparison_digest(records):
    # Django may emit the same zero-millisecond instant as either .000Z or Z.
    normalized = json.loads(json.dumps(records))
    for record in normalized:
        m = apps.get_model(record['model'])
        for key, value in record['fields'].items():
            if value and m._meta.get_field(key).get_internal_type() == 'DateTimeField':
                record['fields'][key] = parse_datetime(value).astimezone(timezone.utc).isoformat(timespec='microseconds')
    return digest(normalized)


def validate(records):
    if not isinstance(records, list) or len(records) > 10000:
        raise ValueError('Invalid or oversized configuration')
    identities = set()
    for record in records:
        if set(record) != {'model', 'pk', 'fields'} or record['model'] not in LABELS:
            raise ValueError('Unapproved configuration model')
        identity = (record['model'], record['pk'])
        if identity in identities:
            raise ValueError('Duplicate configuration identity')
        identities.add(identity)
    for record in records:
        m = apps.get_model(record['model'])
        for key, value in record['fields'].items():
            field = m._meta.get_field(key)
            if field.get_internal_type() == 'FileField' and value:
                raise ValueError('Referenced media requires a separate deliberate asset transfer')
            if field.is_relation and value not in (None, [], ''):
                refs = value if field.many_to_many else [value]
                for ref in refs:
                    if (field.related_model._meta.label_lower, ref) not in identities:
                        raise ValueError('Configuration references an excluded object')
        fields = record['fields']
        if record['model'].endswith('_settingsstore') and fields['key'] not in SETTINGS:
            raise ValueError('Unapproved setting; credential/integration settings are excluded')
        if 'plugins' in fields and set(filter(None, fields['plugins'].split(','))) - PLUGINS:
            raise ValueError('Unreviewed plugin')
        if record['model'] == 'pretixbase.event' and (not fields['testmode'] or fields['live']):
            raise ValueError('Only test-mode unpublished events may be transferred')


def export():
    organizer = model('Organizer').objects.get(slug='dd-studio')
    events = model('Event').objects.filter(organizer=organizer, slug__in=EVENTS)
    if set(events.values_list('slug', flat=True)) != EVENTS:
        raise ValueError('Expected three source events')
    selected = {}
    for name in MODELS:
        m = model(name)
        if name == 'Organizer':
            rows = m.objects.filter(pk=organizer.pk)
        elif name == 'Event':
            rows = events
        elif name == 'Organizer_SettingsStore':
            rows = m.objects.filter(object=organizer, key__in=SETTINGS)
        elif name == 'Event_SettingsStore':
            rows = m.objects.filter(object__in=events, key__in=SETTINGS)
        elif name in {'ItemVariation', 'SubEventItem', 'SubEventItemVariation', 'QuestionOption'}:
            path = {'ItemVariation': 'item__event', 'SubEventItem': 'subevent__event',
                    'SubEventItemVariation': 'subevent__event', 'QuestionOption': 'question__event'}[name]
            rows = m.objects.filter(**{path+'__in': events})
        else:
            rows = m.objects.filter(event__in=events)
        selected[name] = list(rows.order_by('pk'))
    objects = [obj for name in MODELS for obj in selected[name]]
    records = json.loads(serializers.serialize('json', objects))
    # Admin notes are not needed for hosted booking configuration.
    for record in records:
        if 'comment' in record['fields']:
            record['fields']['comment'] = ''
    validate(records)
    print(json.dumps({'format': 'dd-pretix-configuration-v1', 'sha256': digest(records),
                      'counts': {n: len(selected[n]) for n in MODELS}, 'records': records}))


def import_configuration():
    package = json.loads(Path(os.environ.get('DD_CONFIGURATION_FILE', '/run/configuration/events.json')).read_text())
    if set(package) != {'format', 'sha256', 'counts', 'records'} or package['format'] != 'dd-pretix-configuration-v1':
        raise ValueError('Invalid configuration package')
    records = package['records']
    validate(records)
    if digest(records) != package['sha256']:
        raise ValueError('Configuration checksum mismatch')
    # Fresh configuration import only; never overwrite existing events or orders.
    if model('Organizer').objects.exists() or model('Event').objects.exists() or model('Order').objects.exists():
        raise ValueError('Hosted organizer/event/order state already exists; inspect instead of overwriting')
    if not model('User').objects.filter(email='admin@didde-mie.com', is_active=True, is_staff=True).exists():
        raise ValueError('Create the hosted owner account first')
    with transaction.atomic():
        with tempfile.TemporaryDirectory(prefix='dd-configuration-') as directory:
            path = Path(directory) / 'configuration.json'
            path.write_text(json.dumps(records))
            path.chmod(0o600)
            call_command('loaddata', str(path), verbosity=0)
        # Django loaddata resets sequences; verify identities and all retained fields.
        actual = []
        for record in records:
            obj = apps.get_model(record['model']).objects.get(pk=record['pk'])
            actual.append(json.loads(serializers.serialize('json', [obj]))[0])
        if comparison_digest(actual) != comparison_digest(records):
            differences = [(before['model'], before['pk'], sorted(k for k in before['fields']
                            if before['fields'][k] != after['fields'][k]))
                           for before, after in zip(records, actual) if before != after]
            raise ValueError('Imported configuration differs in model/id/fields: ' + str(differences[:5]))
        assert not model('Order').objects.exists()
        assert not model('Event').objects.filter(testmode=False).exists()
        assert not model('Event').objects.filter(live=True).exists()
    print('PASS: configuration imported and field-for-field verified; 3 unpublished test events; no orders imported.')
    print('Configuration counts:', json.dumps(package['counts'], sort_keys=True))


with scopes_disabled():
    if globals().get('TRANSFER_MODE', 'export') == 'export':
        export()
    else:
        import_configuration()
