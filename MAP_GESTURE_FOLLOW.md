# Map gesture follow and reference cleanup

Supersedes the hide-during-gesture behavior documented in MAP_STACK_REBUILD.md.

- Gesture begin no longer clears stackPositionsReady. Existing root, children and SVG arrow stay mounted and visible.
- While dragging, sample native getRegion and reproject approximately every 50ms; at most one projection is in flight. Follow for 350ms after region end for final native bounds. Transient query failure retains the last valid position instead of blanking all pins.
- onHide/unload stops follow timers and invalidates asynchronous work.
- Removed the extra floating “收起标记” button absent from the reference. Close via the top SVG arrow. The existing header can still occlude a tall stack; automatic camera avoidance is not implemented.
- Reference geometry retained: identical 80×89 stamp slots, 101px vertical stride, 32px white SVG arrow circle, stable root baseline, staggered upward expansion and reverse collapse. Real record count determines visible children, not the reference's illustrative four pins. Actual photos remain actual photos.
- Card height transitions and explicit mapError fallback retained.

Validation: 197 static, 21 TabBar, assets, 180 mocks; includes repeated gesture sampling, retained visibility and timer cleanup. Native screenshots/video of continuous drag were not produced here. getRegion timing depends on native runtime; sampling is not a promise of pixel-perfect frame-synchronous map anchoring. Native drag/zoom and top-arrow reachability still need acceptance.
