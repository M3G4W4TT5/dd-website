# Flower spinner prototype

Isolated visual review candidate based on `codex/ttd-mobile-event-revisions` at
`acdb688b1618a088ddda6f58145a562da323e1ca`. Both visual candidates are retained
here separately from the booking app.

Open `index.html` in a browser. It is self-contained and makes no network calls.
`preview.html` is the same animation as an in-chat fragment. To edit, update
`preview.template.html`, then run `python3 prototypes/flower-spinner/build-preview.py`
from the repository root.

## Timing variants

The original remains in `index.html` / `preview.html` unchanged. The Quick variant
is saved separately as `quick.html` / `quick-preview.html`, and `comparison.html`
provides the in-chat variant picker. All are rebuilt by `build-preview.py`.

| Timing | Original | Quick |
| --- | --- | --- |
| Spin duration | 2.048 seconds | 1.024 seconds |
| Clockwise turns per spin | 2 | 1 |
| Spin easing and peak angular speed | Same | Same |
| Complete spin + heartbeat phase | 3.2 seconds | 1.6 seconds |
| Smooth colour blend | 0.448 seconds | 0.448 seconds |
| Full four-colour loop | 12.8 seconds | 6.4 seconds |

Quick shortens the heartbeat and rest intervals proportionally to achieve exactly
twice as many transitions in the same time. The colour blend retains its approved
speed, running from the beginning of the heartbeat until just before the next spin.

## Original behaviour

- One 3.2-second phase: 2.048 seconds of rotation (two clockwise turns with
  acceleration/deceleration), a short stop, then a double heartbeat.
- Scale: 1 → 1.18 → 0.98 → 1.10 → 1. Colour blends smoothly over 0.448 seconds
  during the heartbeat, using an ease-in-out transition. The flower stays opaque;
  intermediate shades connect each pair of brand colours without an instant switch.
- Four phases form one 12.8-second colour loop: green `#116e3a`, purple `#7349cd`,
  red `#dc3e16`, yellow `#e3b936`, then back to green.
- The flower is 120 CSS pixels on a transparent background. It uses the exact
  source alpha silhouette, including the globe cut-outs, with its original
  square canvas and centred rotation axis. Source edges and tiny flecks remain.
- Reduced-motion preference displays a static green flower. Pause and Replay
  are review controls only; they are not proposed booking-site controls.

`flower-mask.png` is a 512-pixel alpha-only derivative of the supplied
`dd-logos-final/dd-soft-edge-upscaled/flower.png`. See `provenance.json` for the
source hash and processing details. The supplied original is untouched.

Quick was approved on 2026-10-02 and integrated as the standard page-transition
loader in `apps/booking/src/components/PageTransition.tsx` and `apps/booking/src/app/styles.css`.
The public mask at `apps/booking/public/branding/page-transition-flower-mask.png`
is an identical copy of `flower-mask.png`. Existing navigation phases, overlay
timing, stall fallback, and reduced-motion navigation are preserved.
The original and Quick standalone prototypes remain available. Release status is
tracked by the pull request and hosted deployment workflow separately from these
prototype checks.

Review checks (2026-10-02): rendered in Chrome at 736px and 320px, including
light/dark appearances and the sandboxed chat wrapper. Confirmed exact brand
colours at each phase boundary, both heartbeat peaks, live animation progression,
pause/replay behaviour, static reduced-motion fallback, no horizontal overflow,
no browser script errors, and no remote requests. Mask alpha matches the
deterministic resize of the supplied source. This verifies the prototype only;
booking-page transitions have not been integrated or tested with this spinner.

Integration checks (2026-10-02): booking typecheck and production build passed.
The production build was checked locally during delayed contact → privacy and
privacy → terms navigation at 1440×900 and 390×844. The mask returned HTTP 200;
the flower was centred with no mobile overflow, animated while waiting, and
paused at idle after navigation. Reduced motion hides the overlay and disables
the flower animations, retaining ordinary page navigation. The former square
markup and keyframes have been removed. These are local checks; no hosted release
was performed.
