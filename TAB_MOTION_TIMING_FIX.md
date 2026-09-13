# Tab motion timing: slower, image-ready gated

User again reports the Tab transition feels faster and asks for more Add candidates.

## Timing change implemented
- Five production Tabs share `morphDuration: 480`; both Tab template branches bind this value.
- Native Canvas remains excluded from production Tabs. The isolated diagnostic Canvas lab retains its previous 380ms timing.
- A transition first submits t=0 SVG, using a generation-keyed image node. It waits for both the image `load` event and the view update callback before advancing.
- A frozen SVG source frame remains in the icon box while the first animation image loads; no native Canvas layer is added.
- Subsequent steps consume up to 32ms of the visual budget and are scheduled only after the preceding frame update commits. Delays extend playback rather than skipping the remaining morph. Nominal duration is 480ms; slower devices can take longer.
- First image/commit timeout: 1200ms, then exact static SVG fallback. This is a fail-soft exception, not an animation completion or a claim of native rendering success.
- Stale load/error events are rejected using per-transition generation IDs. Hide, detach, Quiet and reversal invalidate outstanding callbacks and timers.

## Scope preserved
Current Add Pen/PenLine and the other four official endpoint pairs; sizes, materials, click behavior, immediate navigation, SVG-only Tab layer, native map architecture, card/map 320ms timings, cloud and privacy behavior.

## Preview scope
Six additional external Add candidates (G–L) have been added to the existing A–F review, 12 total. They are not production icons and are not silently added to the runtime registry. Current Add remains Pen/PenLine until the user chooses a replacement.

## Verification and limitations
Four new mock regressions cover shared 480ms config, delayed first-image load, delayed subsequent commits, missing/stale callbacks and timeout cleanup. Existing regression suites remain active. Original and extracted release suites must pass before delivery.

Image load plus view commit is the available readiness signal, not proof of the device's exact screen-presentation timestamp. Native visual/performance and duplicate-layer acceptance remain NOT EXECUTED. Browser preview timing cannot substitute for WeChat acceptance. No cloud deployment required.
