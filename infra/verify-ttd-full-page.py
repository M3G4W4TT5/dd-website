#!/usr/bin/env python3
"""Pinned full outer-template regression; isolated no-network SQLite only.

Uses real provider consumers, ORM contact/invoice records and Django templates.
No gateway calls, mail delivery, hosted sessions or real orders. Synthetic local
orders exist only in the disposable fixture DB. Optional /out saves specimens.
"""
import os
import json
from decimal import Decimal
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
from html.parser import HTMLParser

if os.environ.get('DATA_DIR') != '/tmp/ttd-verification':
    raise RuntimeError('Isolated fixture container only')
os.environ['DJANGO_SETTINGS_MODULE'] = 'production_settings'
import django
django.setup()
from django.conf import settings
if settings.DATABASES['default']['ENGINE'] != 'django.db.backends.sqlite3' or not str(settings.DATABASES['default']['NAME']).startswith('/tmp/ttd-verification/'):
    raise RuntimeError('Fixture database only')
from django.core.management import call_command
call_command('migrate', verbosity=0, interactive=False)
print('PASS isolated migrations', flush=True)
from django.contrib.sessions.backends.db import SessionStore
from django.test import RequestFactory
from django.http import HttpResponse
from django.template.loader import render_to_string
from django.utils import timezone, translation
from django.urls import resolve
from django_scopes import scope
from i18nfield.strings import LazyI18nString
from pretix.base.models import Organizer, Event, Order, OrderPayment, InvoiceAddress
from pretix.base.payment import GiftCardPayment
from pretix.base.middleware import SecurityMiddleware, calculate_csp_hash
from pretix.multidomain.urlreverse import eventreverse
from pretix.presale.checkoutflow import PaymentStep
from pretix.presale.views.cart import cart_session
from pretix.presale.views.order import OrderPaymentStart, OrderPayChangeMethod
from pretix.plugins.stripe.payment import StripeCC
from pretix.presale.signals import process_response
from pretix.presale.style import get_theme_vars_css
import production_settings

class Page(HTMLParser):
    def __init__(self):
        super().__init__(); self.ids = {}; self.text = []; self.blocks = []; self.tag = None; self.block = ''
    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if 'id' in attrs: self.ids[attrs['id']] = attrs
        if tag in ('script','style'): self.tag = tag; self.block = ''
    def handle_data(self, value):
        if self.tag: self.block += value
        else: self.text.append(value)
    def handle_endtag(self, tag):
        if tag == self.tag:
            self.blocks.append((tag,self.block)); self.tag = None

organizer = Organizer.objects.create(slug='dd-studio', name='TTD fixture')
checks = 0
for slug in ('studio','street-dance-workshop-dd-dev','dance-with-dd-dev'):
    event = Event.objects.create(organizer=organizer, slug=slug, name=LazyI18nString({'en':'TTD fixture','da':'TTD test'}), date_from=timezone.now(), currency='DKK', testmode=True, live=True, plugins='pretix.plugins.stripe')
    event.settings.set('payment_stripe__enabled', True)
    event.settings.set('primary_color', '#116E3A' if slug == 'studio' else '#7349CD')
    event.settings.set('locales', ['en','da'])
    if slug=='studio': event.settings.set('name_scheme','given_family')
    with scope(organizer=organizer):
        order = Order.objects.create(event=event, sales_channel=organizer.sales_channels.get(identifier='web'), email='order@example.test', phone='+4520123456', total=Decimal('500'), status='n', code=f'TEST{event.pk}', secret='syntheticonly', datetime=timezone.now())
        InvoiceAddress.objects.create(order=order, name_parts={'_scheme':'given_family' if slug=='studio' else 'full','full_name':'<Buyer " & >'}, country='GB', zipcode='SW1A 1AA')
        payment = OrderPayment.objects.create(order=order, provider='stripe', amount=Decimal('500'), state=OrderPayment.PAYMENT_STATE_CREATED)
        for language in ('en','da'):
            for path in ('initial','existing','retry'):
                for saved in (False,True):
                    with translation.override(language):
                        url = eventreverse(event, 'presale:event.checkout', kwargs={'step':'payment'}) if path == 'initial' else eventreverse(event,'presale:event.order.pay',kwargs={'order':order.code,'secret':order.secret,'payment':payment.pk})
                        request = RequestFactory().get(url)
                        request.event=event; request.organizer=organizer; request.host='localhost'; request.LANGUAGE_CODE=language; request.session=SessionStore(); request.resolver_match=resolve(request.path_info)
                        request.sales_channel=SimpleNamespace(identifier='web',type_instance=SimpleNamespace(testmode_supported=True))
                        request.customer=None
                        request.pci_dss_payment_page=True
                        cs = cart_session(request)
                        # Deliberately conflicting cart catches order-to-cart leakage.
                        cs['email']='cart@example.test'; cs['contact_form_data']={'email':'cart@example.test','phone':'+447700900123'}
                        ia = InvoiceAddress.objects.create(name_parts={'_scheme':'full','full_name':'<Cart " & >'},country='DK',zipcode='2100')
                        cs['invoice_address']=ia.pk
                        if saved:
                            request.session['payment_stripe_card_payment_method_id']='pm_synthetic'
                            request.session['payment_stripe_card_brand']='<unsafe brand>'
                            request.session['payment_stripe_card_last4']='1234'
                        middleware=SecurityMiddleware(lambda request: HttpResponse()); middleware.process_request(request)
                        provider=StripeCC(event)
                        with patch('pretix.plugins.stripe.payment.stripe_verify_domain.apply_async'), patch.object(event,'get_payment_providers',return_value={'stripe':provider}):
                            if path == 'initial':
                                consumer=PaymentStep(event); consumer.request=request; consumer.__dict__['_total_order_value']=Decimal('500')
                                with patch.object(consumer,'_is_allowed',return_value=True): forms=consumer.provider_forms
                                template='pretixpresale/event/checkout_payment.html'; context={'providers':forms,'selected':'stripe','prev_url':'#'}
                            elif path == 'existing':
                                consumer=OrderPaymentStart(); consumer.request=request; consumer.__dict__['order']=order; consumer.__dict__['payment']=payment
                                form=consumer.form
                                assert '_ttd_payment_order' not in request.__dict__
                                template=consumer.template_name; context={'form':form,'order':order,'provider':provider}
                            else:
                                consumer=OrderPayChangeMethod(); consumer.request=request; consumer.__dict__['order']=order; consumer.__dict__['open_fees']=[]
                                with patch.object(provider,'order_change_allowed',return_value=True): forms=consumer.provider_forms
                                template=consumer.template_name; context={'providers':forms,'order':order}
                            context['cart']={'itemcount':1,'positions':[],'total':Decimal('500'),'expires':timezone.now()+timezone.timedelta(hours=1)}
                            html=render_to_string(template,context,request=request)
                        response=HttpResponse(html)
                        for _, result in process_response.send(event,request=request,response=response):
                            if result is not None: response=result
                        response=middleware.process_response(request,response)
                        page=Page(); page.feed(response.content.decode())
                        assert 'stripe-card' in page.ids, (slug,path,'escaped mount')
                        assert 'ttd-card-billing' in page.ids
                        assert 'ttd-billing-error' in page.ids
                        assert not any('<div class="form-horizontal stripe-container">' in t or '(function ()' in t for t in page.text)
                        customer=json.loads(page.ids['ttd-card-billing']['data-customer'])
                        assert customer['email']==('cart@example.test' if path=='initial' else 'order@example.test'), customer
                        assert customer['phone']==('+447700900123' if path=='initial' else '+4520123456')
                        assert customer['name']==('<Cart " & >' if path=='initial' else '<Buyer " & >')
                        assert page.ids['ttd-billing-postal']['value']==('2100' if path=='initial' else 'SW1A 1AA')
                        assert '<unsafe brand>' not in html
                        assert ('stripe-current-card' in page.ids)==saved
                        assert 'stripe_card_payment_method_id' in page.ids
                        assert html.count('class="ttd-checkout-brand"')==1
                        csp=response['Content-Security-Policy']; authorized=0
                        for tag,body in page.blocks:
                            if '.ttd-no-postal' in body or 'ttd-card-billing' in body:
                                assert calculate_csp_hash(body) in csp, (tag,slug,path)
                                authorized+=1
                        assert authorized==2
                        assert 'unsafe-inline' not in csp
                        assert 'https://js.stripe.com' in csp
                        checks+=1
                        print(f'PASS full outer {slug}/{language}/{path}/{"saved" if saved else "new"}',flush=True)
                        out=Path('/out')
                        if out.exists() and language=='en':
                            suffix='-saved' if saved else ''
                            (out/f'{slug}-{path}{suffix}.html').write_text(html)
                            (out/f'{slug}-{path}{suffix}.csp').write_text(csp)
                            (out/f'{slug}-theme.css').write_text(get_theme_vars_css(event, widget=False))
        # Native confirmation and management outer templates inherit branding.
        for kind, template in [('confirmation','checkout_confirm'),('management','order')]:
            context={'event':event,'order':order,'cart':{'itemcount':1,'positions':[],'total':Decimal('500')}}
            html=render_to_string(f'pretixpresale/event/{template}.html',context,request=request)
            assert html.count('class="ttd-checkout-brand"')==1
            assert ('#116E3A' if slug=='studio' else '#7349CD') in html
            if Path('/out').exists(): (Path('/out')/f'{slug}-{kind}.html').write_text(html)
            print(f'PASS full native {slug}/{kind} branding',flush=True)
        # Gift-card HTML stays native and contains no card billing/script.
        gift=GiftCardPayment(event)
        gift_html=gift.payment_form_render(request,Decimal('500'),order=order)
        assert 'ttd-card-billing' not in gift_html
        context={'providers':[{'provider':gift,'form':gift_html,'fee':Decimal('0')}], 'cart':{'itemcount':1,'positions':[],'total':Decimal('500')}}
        html=render_to_string('pretixpresale/event/checkout_payment.html',context,request=request)
        assert '<input' in gift_html and gift_html in html
        print(f'PASS native gift-card provider isolation {slug}',flush=True)

# Other organizers retain byte-equal upstream Stripe rendering and full DOM.
other=Organizer.objects.create(slug='other',name='Unrelated fixture')
event=Event.objects.create(organizer=other,slug='event',name=LazyI18nString({'en':'Other fixture'}),date_from=timezone.now(),currency='DKK',testmode=True,live=True,plugins='pretix.plugins.stripe')
with scope(organizer=other):
    request=RequestFactory().get(eventreverse(event,'presale:event.checkout',kwargs={'step':'payment'}))
    request.event=event; request.organizer=other; request.host='localhost'; request.LANGUAGE_CODE='en'; request.session=SessionStore(); request.resolver_match=resolve(request.path_info); request.customer=None
    request.sales_channel=SimpleNamespace(identifier='web',type_instance=SimpleNamespace(testmode_supported=True))
    middleware=SecurityMiddleware(lambda request:HttpResponse()); middleware.process_request(request)
    provider=StripeCC(event)
    with patch('pretix.plugins.stripe.payment.stripe_verify_domain.apply_async'):
        form=provider.payment_form_render(request,Decimal('500'))
        assert form==StripeCC.payment_form_render.__wrapped__(provider,request,Decimal('500'))
    html=render_to_string('pretixpresale/event/checkout_payment.html',{'providers':[{'provider':provider,'form':form,'fee':Decimal('0')}],'cart':{'itemcount':1,'positions':[],'total':Decimal('500')}},request=request)
    page=Page(); page.feed(html)
    assert 'stripe-card' in page.ids
    assert 'ttd-card-billing' not in html and 'ttd-checkout-brand' not in html
    assert not request._csp_to_merge
    print('PASS unrelated organizer byte-equal upstream Stripe + full outer DOM + no TTD CSP',flush=True)
print(f'PASS {checks} full outer page cases; real pinned consumers/templates/CSP; gateway and browser iframe unverified',flush=True)
