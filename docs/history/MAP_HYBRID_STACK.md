# Map hybrid native visual / ordinary hit regions

Supersedes MAP_GESTURE_FOLLOW.md and the ordinary painted overlay in MAP_STACK_REBUILD.md.

## Changes
- Native customCallout paints all grouped stamps, upward stack motion and the top arrow, anchored to the real 1×1 transparent group marker. Singletons remain native markers.
- Ordinary sibling views are now transparent hit regions only. No photo or arrow is painted in these views. The native subtree intentionally has no tap handlers; native child event dispatch is not relied upon.
- Native and hit regions consume the same mapDrawers rootTop, height and row-top geometry. Only hit regions need projected viewport x/y.
- Gesture begin invalidates pending projections and unmounts hit regions only. No visible callout is hidden. Gesture end schedules one hit-region alignment after 80ms. Repeated 50ms getRegion polling is removed.
- Hide/unload cancels pending alignment; a stale viewport response cannot restore old hit regions during a new gesture. Projection failure leaves native artwork available, but hit regions may stay disabled until a later alignment.
- Arrow geometry is authored in stack-button-up/down.svg; native cover-image uses their 96×96 PNG exports displayed at 32×32. Direction changes use two native assets, not font glyphs or reliance on cover-image CSS rotation. SVG sources are included.
- Stack interpolation and card transitions retain 320ms; Quiet bypass remains. No database, coordinate, cloud, import or other-page changes.

## Local checks
197 static checks, 21 TabBar checks, asset checks, 182 mock scenarios. Tests require separated native ink / transparent hit layers, shared geometry, native marker numeric dimensions, no polling during gestures, one end alignment, timer cancellation and stale-response rejection. Existing privacy/photo lifecycle and bidirectional animation tests remain.

## Native acceptance NOT executed here
This is a hybrid candidate, not verified native touch acceptance. On the actual WeChat runtime verify:
1. Closed group: arrow and root align with their transparent hit areas; real mouse/finger taps work.
2. Two-member group: opening and closing visibly move the child and keep root at its real anchor. Root/child choose the expected bottom card.
3. Pan while open: native stamps remain visible and move with the map without JS projection lag. After release, hit regions reactivate at the correct location.
4. Rapid successive drag/zoom does not reactivate stale hit areas; rotation/tilt remain disabled for projection assumptions.
5. Larger groups page correctly. Tall native callouts can still be clipped by the header; automatic camera avoidance is not implemented.
6. Actual hit-layer precedence over native callouts and smooth intermediate frames are runtime-dependent and must not be inferred from mocks.

No cloud deployment or cache clearing is needed. Previous full latest ZIP is replaced only after extracted-package checks pass.
