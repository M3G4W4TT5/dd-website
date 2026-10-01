import importlib.util
import json
import unittest
from contextlib import nullcontext
from pathlib import Path
from types import SimpleNamespace, ModuleType
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('event_emails', Path(__file__).with_name('configure-ttd-event-emails.py'))
settings = importlib.util.module_from_spec(spec); spec.loader.exec_module(settings)


class EmailSettings(unittest.TestCase):
    def setUp(self):
        self.writes = []
        class I18n:
            def __init__(self, value): self.data = dict(value)
        self.I18n = I18n
        class EventSettings:
            def __init__(inner, changes): inner.values = {key: {**{lang: change['before'] for lang, change in langs.items()}, 'de': 'Unchanged extra language {url}'} for key, langs in changes.items()}
            def get(inner, key, as_type=None): return I18n(inner.values[key])
            def set(inner, key, value): self.writes.append(key); inner.values[key] = value.data
        self.events = {slug: SimpleNamespace(slug=slug, testmode=True, settings=EventSettings(changes)) for slug, changes in settings.PATCH['events'].items()}
        self.modules = {}
        for name, attrs in {'django.db': {'transaction': SimpleNamespace(atomic=nullcontext)}, 'i18nfield.strings': {'LazyI18nString': I18n}, 'django_scopes': {'scope': lambda **kw: nullcontext()}, 'pretix.base.models': {'Organizer': SimpleNamespace(objects=SimpleNamespace(get=lambda **kw: SimpleNamespace(slug=kw['slug']))), 'Event': SimpleNamespace(objects=SimpleNamespace(select_for_update=lambda: SimpleNamespace(get=lambda **kw: self.events[kw['slug']])))}}.items():
            m = ModuleType(name); m.__dict__.update(attrs); self.modules[name] = m

    def run_settings(self, apply=False):
        with patch.dict('sys.modules', self.modules), patch('builtins.print'): settings.configure(apply)

    def test_read_only_then_exact_idempotent_activation_preserves_other_languages(self):
        self.run_settings(); self.assertEqual(self.writes, [])
        self.run_settings(True); self.assertEqual(len(self.writes), 14)
        self.run_settings(True); self.assertEqual(len(self.writes), 14)
        for event in self.events.values():
            for value in event.settings.values.values():
                self.assertEqual(value['de'], 'Unchanged extra language {url}')
                self.assertNotIn('You can change', value['en']); self.assertNotIn('Du kan ændre', value['da'])

    def test_late_drift_and_live_event_prevent_all_writes(self):
        event = list(self.events.values())[-1]
        key = list(event.settings.values)[-1]
        original = event.settings.values[key]['da']
        event.settings.values[key]['da'] += ' New owner copy'
        with self.assertRaisesRegex(RuntimeError, 'drift'): self.run_settings(True)
        self.assertEqual(self.writes, [])
        event.settings.values[key]['da'] = original; event.testmode = False
        with self.assertRaisesRegex(RuntimeError, 'sandbox'): self.run_settings(True)
        self.assertEqual(self.writes, [])

    def test_package_changes_only_approved_phrases_and_preserves_placeholders(self):
        import re
        before = json.loads((Path(__file__).parents[1] / 'docs/review/ttd-emails/native-event-effective-before.json').read_text())
        for slug, changes in settings.PATCH['events'].items():
            snapshot = {t['name']: t['value'] for t in before['events'][slug]}
            self.assertEqual(set(changes), settings.ALLOWED)
            for key, langs in changes.items():
                for lang, change in langs.items():
                    self.assertEqual(change['before'], snapshot[key + ('_1' if lang == 'da' else '_0')])
                    self.assertEqual(change['after'], settings.approved_text(change['before'], lang))
                    self.assertEqual(re.findall(r'\{[^}]+\}', change['before']), re.findall(r'\{[^}]+\}', change['after']))


if __name__ == '__main__': unittest.main()
