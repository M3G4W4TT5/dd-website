"""Adapter contract checks without Django, credentials, or a hosted checkout."""
import ast
import json
from pathlib import Path
import subprocess
import unittest

SOURCE = Path(__file__).with_name('pretix-settings.py').read_text()
TREE = ast.parse(SOURCE)
SCRIPT = ast.literal_eval(next(n.value for n in TREE.body if isinstance(n, ast.Assign) and any(isinstance(t, ast.Name) and t.id == 'TTD_CARD_SCRIPT' for t in n.targets)))


class CardAdapter(unittest.TestCase):
    def test_international_postcodes_and_card_only_dispatch(self):
        javascript = SCRIPT.removeprefix('\n<script>\n').removesuffix('\n</script>\n')
        harness = r'''
const assert = require('node:assert/strict');
let submitted, updated, valid = true;
const country = {value:'GB', reportValidity:()=>valid};
const postal = {value:' SW1A 1AA ', reportValidity:()=>valid};
const absent = {checked:false, addEventListener:()=>{}};
const fields = {dataset:{customer:JSON.stringify({name:'Anne <Buyer>',email:'anne@example.test',phone:'+4512345678'})},querySelector:(s)=>s==='select'?country:s==='input[type=text]'?postal:absent};
global.window = {addEventListener:()=>{}};
global.document = {readyState:'complete',getElementById:()=>fields};
global.pretixstripe = window.pretixstripe = {card:{update:(v)=>updated=v},pm_request:function(...args){ submitted=args; return 'upstream'; }};
'''
        checks = r'''
assert.equal(updated.hidePostalCode,true);
assert.equal(country.required,false);
assert.equal(postal.required,false);
assert.equal(pretixstripe.pm_request('card', {}),'upstream');
assert.equal(submitted[2].billing_details.address.postal_code,'SW1A 1AA');
assert.equal(submitted[2].billing_details.address.country,'GB');
assert.equal(submitted[2].billing_details.name,'Anne <Buyer>');
country.value='DK';postal.value='2100';pretixstripe.pm_request('card',{});
assert.equal(submitted[2].billing_details.address.postal_code,'2100');
absent.checked=true;country.value='HK';pretixstripe.pm_request('card',{});
assert.equal(submitted[2].billing_details.address.country,'HK');
assert.equal(submitted[2].billing_details.address.postal_code,undefined);
assert.equal(postal.disabled,true);
pretixstripe.pm_request('sepa_debit',{}, {billing_details:{name:'Original'}});
assert.deepEqual(submitted[2],{billing_details:{name:'Original'}});
const previous = submitted;valid=false;pretixstripe.pm_request('card',{});assert.equal(submitted,previous);
assert.equal(country.required,false);
assert.equal(postal.required,false);
'''
        result = subprocess.run(['node', '-e', harness + javascript + checks], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_trusted_order_prefill_is_escaped_and_phone_is_serialized(self):
        from html.parser import HTMLParser
        from types import SimpleNamespace, ModuleType
        from unittest.mock import patch
        class Phone:
            def __str__(self): return '+4520123456'
        class Parser(HTMLParser):
            def handle_starttag(self, tag, attrs):
                values = dict(attrs)
                if values.get('id') == 'ttd-card-billing': self.customer = json.loads(values['data-customer'])
        function = next(n for n in TREE.body if isinstance(n, ast.FunctionDef) and n.name == 'ttd_billing_fields')
        namespace = {'ttd_theme': lambda event: ('green', '#116E3A', '#DAF2E5')}
        exec(compile(ast.Module(body=[function], type_ignores=[]), '<adapter>', 'exec'), namespace)
        modules = {}
        for name, attributes in {
            'django_countries': {'countries': [('DK', 'Denmark'), ('GB', 'United Kingdom')]},
            'pretix.base.models': {'InvoiceAddress': SimpleNamespace(objects=None)},
            'pretix.presale.views.cart': {'cart_session': lambda request: {}},
        }.items():
            module = ModuleType(name)
            module.__dict__.update(attributes)
            modules[name] = module
        order = SimpleNamespace(email='fixture@example.test', phone=Phone(), invoice_address=SimpleNamespace(name='<script>alert(1)</script>', country='GB', zipcode='SW1A 1AA'))
        with patch.dict('sys.modules', modules):
            html = namespace['ttd_billing_fields'](SimpleNamespace(LANGUAGE_CODE='en'), None, order)
        self.assertNotIn('<script>alert', html)
        self.assertIn('value="GB" selected', html)
        self.assertIn('value="SW1A 1AA"', html)
        self.assertNotIn(' required', html)
        parser = Parser(); parser.feed(html)
        self.assertEqual(parser.customer['phone'], '+4520123456')
        self.assertEqual(parser.customer['name'], '<script>alert(1)</script>')

    def test_scoped_theme(self):
        from types import SimpleNamespace
        function = next(n for n in TREE.body if isinstance(n, ast.FunctionDef) and n.name == 'ttd_theme')
        namespace = {}
        exec(compile(ast.Module(body=[function], type_ignores=[]), '<adapter>', 'exec'), namespace)
        theme = namespace['ttd_theme']
        self.assertIsNone(theme(None))
        self.assertIsNone(theme(SimpleNamespace(organizer=SimpleNamespace(slug='other'), slug='studio')))
        self.assertEqual(theme(SimpleNamespace(organizer=SimpleNamespace(slug='dd-studio'), slug='studio'))[0], 'green')
        self.assertEqual(theme(SimpleNamespace(organizer=SimpleNamespace(slug='dd-studio'), slug='workshop'))[0], 'purple')


class NativeEmailAdapter(unittest.TestCase):
    def test_native_copy_links_and_other_organizers_are_preserved(self):
        import re
        from types import SimpleNamespace, ModuleType
        from unittest.mock import patch
        originals = []
        class Renderer:
            def render(self, *args):
                originals.append(args)
                return '<html><body><a href="https://checkout.example/order#token=original">Existing copy</a></body></html>'
        module = ModuleType('pretix.base.email')
        module.TemplateBasedMailRenderer = Renderer
        selected = [n for n in TREE.body if isinstance(n, ast.FunctionDef) and n.name in ('ttd_theme', 'configure_ttd_mail')]
        namespace = {'re': re, 'TTD_LOGOS': {'green': 'GREEN', 'purple': 'PURPLE'}}
        exec(compile(ast.Module(body=selected, type_ignores=[]), '<adapter>', 'exec'), namespace)
        with patch.dict('sys.modules', {'pretix.base.email': module}):
            namespace['configure_ttd_mail']()
        renderer = Renderer()
        renderer.event = SimpleNamespace(organizer=SimpleNamespace(slug='dd-studio'), slug='studio')
        renderer.organizer = renderer.event.organizer
        html = renderer.render('Plain original', 'Signature', 'Subject', None, None, {'url': 'untouched'})
        self.assertIn('data:image/png;base64,GREEN', html)
        self.assertIn('href="https://checkout.example/order#token=original"', html)
        self.assertEqual(originals[-1], ('Plain original', 'Signature', 'Subject', None, None, {'url': 'untouched'}))
        renderer.event = SimpleNamespace(organizer=SimpleNamespace(slug='other'), slug='studio')
        self.assertNotIn('TTD Studio', renderer.render('Plain', '', '', None, None, None))
        renderer.event = None
        renderer.organizer = SimpleNamespace(slug='dd-studio')
        self.assertIn('data:image/png;base64,GREEN', renderer.render('Campaign', '', '', None, None, None))


class HostedSettingsPatch(unittest.TestCase):
    def test_default_is_read_only_and_a_live_event_stops_all_writes(self):
        import importlib.util
        from contextlib import nullcontext
        from types import SimpleNamespace, ModuleType
        from unittest.mock import patch
        spec = importlib.util.spec_from_file_location('ttd_settings', Path(__file__).with_name('configure-ttd-checkout.py'))
        settings = importlib.util.module_from_spec(spec); spec.loader.exec_module(settings)
        writes = []
        class Settings:
            def get(self, key, as_type=str): return False if as_type is bool else ''
            def set(self, key, value): writes.append((key, value))
        events = {slug: SimpleNamespace(slug=slug, testmode=True, settings=Settings()) for slug in settings.PATCH['events']}
        modules = {}
        for name, attributes in {'django.db': {'transaction': SimpleNamespace(atomic=nullcontext)}, 'django_scopes': {'scope': lambda **kw: nullcontext()}, 'pretix.base.models': {'Organizer': SimpleNamespace(objects=SimpleNamespace(get=lambda **kw: SimpleNamespace(slug=kw['slug']))), 'Event': SimpleNamespace(objects=SimpleNamespace(select_for_update=lambda: SimpleNamespace(get=lambda **kwargs: events[kwargs['slug']])))}}.items():
            module = ModuleType(name); module.__dict__.update(attributes); modules[name] = module
        with patch.dict('sys.modules', modules), patch('builtins.print'):
            settings.configure()
            self.assertEqual(writes, [])
            list(events.values())[-1].testmode = False
            with self.assertRaisesRegex(RuntimeError, 'sandbox'):
                settings.configure(True)
            self.assertEqual(writes, [])
        self.assertEqual(set(settings.PATCH['events']), {'studio', 'street-dance-workshop-dd-dev', 'dance-with-dd-dev'})
        for slug, changes in settings.PATCH['events'].items():
            self.assertTrue(set(changes) <= settings.ALLOWED)
            self.assertNotIn('invoice_address_required', changes)
            if slug != 'studio':
                self.assertEqual(changes['allow_modifications'], 'no')
                self.assertFalse(changes['cancel_allow_user'])
                self.assertFalse(changes['cancel_allow_user_paid'])


if __name__ == '__main__':
    unittest.main()
