# H1 — cached-peer active-command prime

Status: local gates passed; device visual acceptance pending. It is not a claimed fix.

## Hypothesis

The cached destination already has correct parked endpoints before a tap, but the current transition's ACTIVE command is not published until destination `onShow/seedTransition`, after WeChat has restored an old page/TabBar picture. If that exact ACTIVE command is published to hidden cached TabBar peers immediately before native navigation, the actual cached destination may resume with the current command early enough to avoid the old selected endpoint.

## One variable

- Scope only Add <-> Me.
- Immediately before `wx.switchTab`, publish the existing `{selected, transitionFrom, entryKey, entryActive:true}` transition patch to every live TabBar peer except the tapped source instance.
- Do not infer which peer owns the destination. Do not query children, wait for `setData`, wait for image load, add a timer, delay navigation, or change the visible source presentation.
- Real SVG endpoints, continuous 480ms wall-clock motion, five tabs, business/CloudBase data and Map remain unchanged. `VP1 H1` only identifies the package in video.

## Success and failure

- Success: in one uncropped Add -> Me -> Add device recording, the visible source remains unchanged until native navigation; the first destination page/VP1 frame already carries the new H1 entry K and correct selection/origin; both real glyphs then make the continuous forward/reverse morph without displaying the destination's prior selected endpoint.
- Failure: either direction first shows the old page/bar/glyph state, the source changes before leaving, a wrong peer/selection becomes visible, navigation is delayed or blocked, or the real morph/five tabs/Map regress.
- Simulator and callbacks are local gates only. They cannot establish device compositor success.

## Revert

Remove `primeCachedTransition`, its single call, H1 trace/test assertions and the `H1` package suffix. No renderer/state-machine rollback is required.

## Required device action after local gates

One uncropped Add -> Me -> Add recording with page top and the full VP1 TabBar visible. No Console JSON is required unless local logs expose an unexpected state.

## Local result

- Full `npm run verify:all`: PASS — 229 static, 21 TabBar, assets/icons, 233 cloud mocks, 74 handoff, 44 UI, 7 VP1 and 4 capture-analyzer checks.
- WeChat DevTools refreshed the project and compiled the changed WXML. Simulator Console matched no `error|exception|fail` lines.
- The element automation API cannot pierce the native custom TabBar. The supported runtime evaluator invoked the real `onTabTap` handler after prewarming Me and Add; this is handler-level simulator evidence, not a physical tap or device result.
- Add -> Me: peer primes completed before `wx.switchTab` with `prepareMs=18`; the real Add/Me SVG glyphs completed in 504/509ms with a 480ms frame budget.
- Me -> Add: peer primes completed before `wx.switchTab` with `prepareMs=14`; the real glyphs completed in 502/502ms with a 480ms frame budget.
- Screenshots and exact environment are recorded in `reports/captures/devtools-h1-manifest.json`.
- Commit `c4e1401` was pushed and its 1,577,583-byte preview package was delivered to the logged-in developer WeChat account. Delivery is not device acceptance.
