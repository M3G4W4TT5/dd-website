"""Response integration against pinned Pretix SecurityMiddleware, without its DB/runtime.

Only unrelated app dependencies are substituted. Actual request hash merging,
policy building and response serialization execute from the upstream fixture.
"""
import ast
import base64
import hashlib
import re
import unittest
from functools import cached_property
from pathlib import Path
from types import SimpleNamespace, ModuleType
from unittest.mock import patch

ROOT = Path(__file__).parent
UPSTREAM = ROOT / 'tests/fixtures/pretix-2026.7.0-middleware.py'


class ResponseCSP(unittest.TestCase):
    def test_actual_emitted_blocks_are_authorized_by_pinned_response_middleware(self):
        upstream = ast.parse(UPSTREAM.read_text())
        names = {'_sanitize_csp', '_parse_csp', '_render_csp', '_merge_csp', 'add_to_response_csp_via_request', 'calculate_csp_hash', 'SecurityMiddleware'}
        selected = [n for n in upstream.body if isinstance(n, (ast.FunctionDef, ast.ClassDef)) and n.name in names]
        namespace = dict(VALID_CSP_DIRECTIVES=['default-src','script-src','object-src','frame-src','style-src','connect-src','img-src','font-src','media-src','form-action'], CSP_ILLEGAL_CHARS=re.compile(r'[\s,;]'), base64=base64, hashlib=hashlib, MiddlewareMixin=object,
                         settings=SimpleNamespace(DEBUG=False, VITE_DEV_MODE=False, LOG_CSP=False, CSP_ADDITIONAL_HEADER='', SITE_URL='https://checkout.example.test', STATIC_URL='/static/', MEDIA_URL='/media/'),
                         resolve=lambda path: SimpleNamespace(url_name='event.checkout', kwargs={'step': 'payment'}),
                         global_settings_object=lambda request: SimpleNamespace(settings=SimpleNamespace(leaflet_tiles=None)),
                         get_fonts=lambda *a, **kw: {})
        exec(compile(ast.Module(body=selected, type_ignores=[]), str(UPSTREAM), 'exec'), namespace)
        middleware_module = ModuleType('pretix.base.middleware'); middleware_module.__dict__.update(namespace)
        handlers = {}
        class Signal:
            def connect(self, receiver, **kwargs): handlers[kwargs['dispatch_uid']] = receiver
        class StripeCC:
            def payment_form_render(self, request, total, order=None): return '<div id="stripe-card"></div>'
        class OrderPaymentStart:
            form = cached_property(lambda self: '')
        def module(name, **attrs):
            m = ModuleType(name); m.__dict__.update(attrs); return m
        modules = {'pretix.base.middleware': middleware_module,
                   'pretix.presale.signals': module('signals', global_html_head=Signal(), global_html_page_header=Signal()),
                   'django.utils.safestring': module('safe', mark_safe=lambda s: s),
                   'django.utils.functional': module('functional', cached_property=cached_property),
                   'pretix.presale.views.order': module('order', OrderPaymentStart=OrderPaymentStart),
                   'pretix.plugins.stripe.payment': module('payment', StripeCC=StripeCC)}
        tree = ast.parse((ROOT / 'pretix-settings.py').read_text())
        functions = {'ttd_theme', 'ttd_csp_block', 'ttd_checkout_style', 'configure_ttd_presentation', 'configure_ttd_card'}
        script = next(n for n in tree.body if isinstance(n, ast.Assign) and any(isinstance(t, ast.Name) and t.id == 'TTD_CARD_SCRIPT' for t in n.targets))
        adapter = {'TTD_LOGOS': {'green': 'GREEN', 'purple': 'PURPLE'}, 'ttd_billing_fields': lambda *a: '<label class="ttd-no-postal">No postcode</label>'}
        exec(compile(ast.Module(body=[script] + [n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name in functions], type_ignores=[]), '<adapter>', 'exec'), adapter)
        with patch.dict('sys.modules', modules):
            adapter['configure_ttd_presentation'](); adapter['configure_ttd_card']()
            middleware = namespace['SecurityMiddleware']()
            for slug in ('studio', 'dance-with-dd-dev'):
                request = SimpleNamespace(path_info='/checkout/', event=SimpleNamespace(slug=slug, organizer=SimpleNamespace(slug='dd-studio')))
                middleware.process_request(request)
                provider = StripeCC(); provider.event = request.event
                html = handlers['ttd_checkout_style'](None, request) + provider.payment_form_render(request, 500)
                class Response(dict): status_code = 200
                response = Response({'Content-Type': 'text/html', 'Content-Security-Policy': 'script-src https://js.stripe.com; frame-src https://js.stripe.com'})
                middleware.process_response(request, response)
                csp = namespace['_parse_csp'](response['Content-Security-Policy'])
                blocks = re.findall(r'<(style|script)>(.*?)</\1>', html, flags=re.S)
                self.assertEqual(len(blocks), 2)
                for tag, content in blocks:
                    digest = "'sha256-" + base64.b64encode(hashlib.sha256(content.encode()).digest()).decode() + "'"
                    self.assertIn(digest, csp[tag + '-src'])
                    changed = namespace['calculate_csp_hash'](content + ' ')
                    self.assertNotIn(changed, csp[tag + '-src'])
                self.assertNotIn('unsafe-inline', response['Content-Security-Policy'])
                self.assertEqual(csp['object-src'], ["'none'"])
                self.assertIn('https://js.stripe.com', csp['script-src'])
                self.assertIn("'self'", csp['style-src'])
                self.assertNotIn(' style=', html)
            # Unscoped organizers neither emit content nor alter response hash permissions.
            request.event.organizer.slug = 'other'
            middleware.process_request(request)
            self.assertEqual(handlers['ttd_checkout_style'](None, request), '')
            self.assertEqual(provider.payment_form_render(request, 500), '<div id="stripe-card"></div>')
            self.assertEqual(request._csp_to_merge, {})


if __name__ == '__main__': unittest.main()
