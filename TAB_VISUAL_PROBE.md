# VP1 — TEMPORARY native visual handoff probe

Baseline:51d2e2e. This diagnostic release does NOT claim to fix the residual native endpoint flash or improve FPS. Remove its markers after diagnosis; it is not final UI.

## Why
vbug8 shows targets at2.281s and origins at2.337s. before/after logs show Me bar5 had correct parked endpoints, matching image loads and committedRevision300 long before tap. Need on-screen identifiers to distinguish page/layer snapshot, wrong visible bar, and retained image content. Logic callbacks alone cannot establish displayed pixels.

## Markers
- Add and Me pages only: cyan VP1 P:add#1 / P:me#1, V=onShow visit count. Route prefix + counter identify a page instance. Page stamp performs one extra setData at show (no timers).
- Above all TabBars: VP1 identifies the diagnostic build; B=bar instance, K=entry key, R=parent publication revision, SEL=selected index0–4, ACTIVE/PARK.
- Above each glyph: I=icon instance, K=entry key, R=child command revision. S=logical static layer (cyan); S O=origin, S T=target, ERR=fallback. F G=logical frame layer (amber), generation G.
- S T in a parked bar is expected: parked from==to. It does not necessarily mean that Tab itself is selected.
- These are WXML labels driven by the same logical visibility gates, not measurements of actual compositor presentation. A label/glyph mismatch narrows the hypothesis but does not prove one native subsystem is faulty.

## Isolation
Glyph clipping unchanged. Added a same-size positioned wrapper only on presentation-driven icons; badges are absolute siblings outside the clipped glyph box. Badge pointer-events:none, no handlers, aria-hidden. Existing tab dimensions, click handlers, artwork, clock, navigation and Map are unchanged. Page badge is fixed at headerTop and does not change page layout. Native legibility/placement remains to verify. Badges can overlay a narrow strip of page content; use only for diagnosis.
No per-frame diagnostic setData/timer/event was added. Icon/bar marker fields ride existing command publications. Stable lazy icon IDs handle observer-before-attached ordering, so visible IDs match exported IDs. Diagnostics add real rendering overhead: NOT an FPS benchmark.

## Device steps
1. Use this package. Confirm VP1 is visible. Keep original full-resolution recording with page top marker and bottom TabBar markers; do not crop.
2. Visit Me, wait2s; return Add, wait2s.
3. Record ~1s on Add, tap Me once, hold2s. No breakpoint, no further tab tap.
4. Export full JSON using existing getTransitionDebug call below; use Copy rather than a screenshot. Check visualProbeBuild=VP1. Send video + text. No new before snapshot required for this visual identity test.
5. Analyze the original video and copied JSON locally with `node tools/analyze-tab-capture.cjs VIDEO LOG_JSON --out OUTPUT_DIR`. Keep the full-frame contact sheet and manifest; do not infer variable-frame-rate timing from frame number/FPS.

```js
JSON.stringify(getCurrentPages().slice(-1)[0].getTabBar().getTransitionDebug(), null, 2)
```

If any marker overlaps a glyph/is clipped/missing, send one screenshot; do not proceed with a long capture.

## Verification
The current local working copy requires 229 static /21 Tab /233 mock /74 handoff /44 UI plus 7 visible probe checks and the capture-analyzer self-check. Tests cover marker gates, no touch footprint, unchanged clipping, actual bar identity, page visit counters and pre-attached stable IDs.
Native visual placement, root-cause attribution and final acceptance remain NOT_EXECUTED. UI checks do not approve temporary diagnostic styling as final design.
