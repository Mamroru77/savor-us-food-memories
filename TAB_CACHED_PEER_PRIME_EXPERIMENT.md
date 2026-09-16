# H1 — cached-peer active-command prime

Status: REJECTED on device and removed. It did not fix the restored endpoint flash.

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

## Device result — vbug16

- Source package: clean `fix-9.13` at `924e24e`; recording SHA-256 `d0750b67380fe441211b7ff1971173d7c4277c70bd1d564c4ba0696b5d9dc051`.
- Add -> Me: source Add was current K2/R22 at PTS 2.324333s. At 2.331411s the first Me picture restored old `B2 K0 R11 SEL4 ACTIVE` and its old selected endpoints. The current K3 origin did not appear until 2.381256s, a 49.845ms old-picture interval; the real frame layer appeared later at 2.430422s.
- Me -> Add: source Me was current K3/R30 at 4.045344s. At 4.053167s the first Add picture restored old `B3 K2 R22 SEL2 ACTIVE` and its old selected endpoints. The current K4 origin did not appear until 4.110611s, a 57.444ms interval; the frame layer appeared later at 4.168233s.
- Verdict: failure in both directions. Prepublishing ACTIVE state to hidden peers changed their JS/WXML state but did not replace the native page picture restored before destination presentation. The recorded order remains old endpoint -> current origin -> continuous morph.
- Full-frame PTS evidence and contact sheet: `E:/HuaweiMoveData/Users/HUAWEI/Desktop/临时/vbug16-analysis/vbug16-evidence.md`.

`primeCachedTransition`, its call, H1 trace/test assertions and the package suffix were removed exactly as specified. VP1, immediate navigation, cached parking and the real SVG animation remain.
