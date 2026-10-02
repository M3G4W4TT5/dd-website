"""Build the self-contained prototype and matching in-chat fragment."""
from pathlib import Path
import base64

directory = Path(__file__).resolve().parent
mask = 'data:image/png;base64,' + base64.b64encode((directory / 'flower-mask.png').read_bytes()).decode()
fragment = (directory / 'preview.template.html').read_text().replace('__FLOWER_MASK_DATA_URL__', mask)
(directory / 'preview.html').write_text(fragment)

# Minimal standalone host; the in-chat fragment uses the host's utilities.
shell_start = '''<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>TTD flower spinner prototype</title>
<style>
:root { color-scheme: light dark; }
body { margin: 0; padding: 24px; font: 14px/1.5 system-ui, sans-serif;
  background: light-dark(#faf8f5, #171817); color: light-dark(#272923, #e9ebe7); }
main { max-width: 736px; margin: 0 auto; }
.text-center { text-align: center; }
.text-muted { color: light-dark(#65665f, #a8aea5); }
.text-small { font-size: 12px; }
.viz-row { display: flex; align-items: center; justify-content: center; gap: 12px; flex-wrap: wrap; }
.btn { font: inherit; padding: 8px 14px; border: 1px solid light-dark(#d5d8ce, #4c5049);
  border-radius: 8px; color: inherit; background: transparent; cursor: pointer; }
.btn:disabled { opacity: .5; cursor: default; }
.btn-ghost { border-color: transparent; }
</style></head><body><main>
'''
(directory / 'index.html').write_text(shell_start + fragment + '\n</main></body></html>\n')

# Keep the original template and output unchanged. Quick has half as many turns
# in half the spin time, so its rotational speed profile has the same magnitude.
quick = fragment
for before, after in [
    ('ttd-flower-', 'ttd-quick-flower-'),
    ('3.2s', '1.6s'),
    ('12.8s', '6.4s'),
    ('720deg', '360deg'),
    ('20.5%, 42%', '24%, 42%'),
    ('45.5%, 67%', '49%, 67%'),
    ('70.5%, 92%', '74%, 92%'),
    ('95.5%, 100%', '99%, 100%'),
    ('two turns easing', 'one turn easing'),
    ("prototype: 'flower-spinner', cycleSeconds: 3.2", "prototype: 'flower-spinner-quick', cycleSeconds: 1.6"),
]:
    quick = quick.replace(before, after)
(directory / 'quick-preview.html').write_text(quick)
(directory / 'quick.html').write_text(shell_start.replace('TTD flower spinner prototype', 'TTD quick flower spinner prototype') + quick + '\n</main></body></html>\n')

# Independent local pause controls in the comparison; selecting a variant does
# not send messages or synchronize playback with the other variant.
def comparison_variant(content):
    return content.replace('window.openai', 'window.flowerComparisonLocalState')

comparison = '<div class="viz-carousel" aria-label="Flower spinner timing variants">\n'
comparison += '<section data-variant="Quick" aria-label="Quick flower spinner">\n' + comparison_variant(quick) + '\n</section>\n'
comparison += '<section data-variant="Original" aria-label="Original flower spinner" hidden>\n' + comparison_variant(fragment) + '\n</section>\n</div>\n'
(directory / 'comparison.html').write_text(comparison)
print('Built original, Quick, and comparison previews')
