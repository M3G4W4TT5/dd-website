"""Run inside an isolated Pretix 2026.7 Django shell; synthetic data only."""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from threading import Barrier
from zoneinfo import ZoneInfo

from django.db import close_old_connections
from django_scopes import scopes_disabled
from pretix.base.models import (
    Discount, Event, Item, Order, Organizer, Quota, SalesChannel, SubEvent,
    Team, TeamAPIToken,
)
from rest_framework.test import APIClient


with scopes_disabled():
    organizer = Organizer.objects.create(name='Synthetic Rental Test', slug='synthetic-rental-test')
    local_day = (datetime.now(ZoneInfo('Europe/Copenhagen')) + timedelta(days=20)).date()
    start = datetime(local_day.year, local_day.month, local_day.day, 8,
                     tzinfo=ZoneInfo('Europe/Copenhagen'))
    event = Event.objects.create(organizer=organizer, slug='studio', name='Synthetic Studio',
                                 testmode=True, live=True, has_subevents=True,
                                 currency='DKK', date_from=start, date_to=start + timedelta(hours=14))
    item = Item.objects.create(event=event, name='Synthetic hour', active=True,
                               admission=False, default_price=Decimal('250.00'))
    subevents = []
    for hour in range(14):
        slot = SubEvent.objects.create(event=event, name=f'Hour {hour + 1}', active=True,
                                       date_from=start + timedelta(hours=hour),
                                       date_to=start + timedelta(hours=hour + 1))
        quota = Quota.objects.create(event=event, subevent=slot, name=f'Hour {hour + 1}', size=1)
        quota.items.set([item])
        subevents.append(slot)
    discount = Discount.objects.create(
        event=event, active=True, internal_name='Synthetic 14 hours, pay for 12',
        all_sales_channels=True, subevent_mode='distinct', condition_all_products=False,
        condition_min_count=14, condition_min_value=Decimal('0.00'),
        benefit_same_products=True, benefit_discount_matching_percent=Decimal('100.00'),
        benefit_only_apply_to_cheapest_n_matches=2)
    discount.condition_limit_products.set([item])
    SalesChannel.objects.get_or_create(organizer=organizer, identifier='web',
                                       defaults={'type': 'web', 'label': 'Web', 'position': 0})
    team = Team.objects.create(organizer=organizer, name='Synthetic checkout', all_events=False,
                               all_event_permissions=False, all_organizer_permissions=False,
                               limit_event_permissions={'event.orders:read': True,
                                                        'event.orders:write': True},
                               limit_organizer_permissions={})
    team.limit_events.set([event])
    token = 'synthetic-rental-test-token'
    TeamAPIToken.objects.create(team=team, name='Synthetic checkout', token=token)

base = '/api/v1/organizers/synthetic-rental-test/events/studio/orders/'


def client():
    result = APIClient()
    result.credentials(HTTP_AUTHORIZATION='Token ' + token)
    return result


def payload(code, selected, explicit=False, simulate=False):
    positions = [{'item': item.pk, 'subevent': slot.pk} for slot in selected]
    if explicit:
        for position in positions[-2:]:
            position.update({'price': '0.00', 'discount': discount.pk})
    return {'code': code, 'testmode': True, 'status': 'n', 'sales_channel': 'web',
            'email': 'synthetic@example.invalid', 'send_email': False,
            'valid_if_pending': False,
            'expires': (datetime.now(timezone.utc) + timedelta(minutes=20)).isoformat(),
            'positions': positions, 'simulate': simulate,
            'api_meta': {'ttd_checkout_intent': 'a' * 64}}


def post(body):
    return client().post(base, body, format='json')


def check(response, expected, label):
    assert response.status_code == expected, (label, response.status_code,
                                              sorted(response.data) if isinstance(response.data, dict) else 'non-object')
    return response.data


# Pinned 2026.7's automatic order-create discount applies to only one position.
auto = check(post(payload('RAUT12345', subevents, simulate=True)), 201,
             'automatic discount simulation')
assert len([p for p in auto['positions'] if p.get('discount') is not None]) == 1

# The application supplies the two verified final discounted positions.
full = payload('RFULL12345', subevents, explicit=True)
simulated = check(post({**full, 'simulate': True}), 201, 'explicit simulation')
created = check(post(full), 201, 'explicit create')
for result in (simulated, created):
    assert Decimal(result['total']) == Decimal('3000.00')
    assert [p['subevent'] for p in result['positions']] == [s.pk for s in subevents]
    assert [p['subevent'] for p in result['positions'] if p.get('discount') is not None] == \
        [s.pk for s in subevents[-2:]]
    assert all(p['discount'] == discount.pk and Decimal(p['price']) == 0
               for p in result['positions'] if p.get('discount') is not None)

check(client().post(base + 'RFULL12345/mark_expired/', {}, format='json'), 200,
      'expire pending full-day order')
with scopes_disabled():
    assert Order.objects.get(code='RFULL12345').status == 'e'

# Two independent submissions compete for the same two scarce positions.
barrier = Barrier(2)


def compete(code):
    close_old_connections()
    barrier.wait(timeout=10)
    result = post(payload(code, subevents[:2]))
    close_old_connections()
    return result.status_code


with ThreadPoolExecutor(max_workers=2) as pool:
    statuses = sorted(pool.map(compete, ['RRACE12345', 'RRACE67890']))
assert statuses == [201, 400], statuses
with scopes_disabled():
    pending = list(Order.objects.filter(event=event, status='n'))
    assert len(pending) == 1
    assert list(pending[0].positions.order_by('positionid').values_list('subevent_id', flat=True)) == \
        [s.pk for s in subevents[:2]]
winner = pending[0].code
check(client().post(base + winner + '/mark_expired/', {}, format='json'), 200,
      'expire winning hold')
check(post(payload('RREUSE12345', subevents[:2])), 201, 'reuse released inventory')
with scopes_disabled():
    Order.objects.filter(event=event, code='RREUSE12345').update(status='p')
check(client().post(base + 'RREUSE12345/mark_expired/', {}, format='json'), 400,
      'paid order must reject expiry')
with scopes_disabled():
    assert Order.objects.get(event=event, code='RREUSE12345').status == 'p'
print('PASS pinned Pretix 2026.7: automatic-discount regression, explicit 14-hour total and positions, atomic scarce-slot race, expiry release, paid-order expiry guard')
