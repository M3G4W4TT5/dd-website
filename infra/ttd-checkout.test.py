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
'''
        result = subprocess.run(['node', '-e', harness + javascript + checks], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)

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


if __name__ == '__main__':
    unittest.main()
