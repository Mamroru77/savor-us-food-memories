# G3 — native-text frame probe

Status: REJECTED on device and removed. This diagnostic did not fix the residual endpoint flash.

## Hypothesis

vbug12 showed a native `cover-view` text sentinel presenting the current command while ordinary page and TabBar WXML still showed an old restored picture. G1 and G2 then showed that `cover-image` cannot carry the real SVG/data-URI or bundled-PNG pixels across that boundary. The remaining narrow question is whether native text can receive a sequence of current frame updates throughout the 480ms window, rather than only a new endpoint label.

## One variable

- Add and Me alone receive one small `cover-view` text probe.
- It displays the existing child identity, key, revision, active bit and integer progress `F0`–`F100`.
- The integer is added to the same `setData` patch already used for each SVG frame. There is no new timer, wait, image, navigation/state publication or glyph branch.
- The real static endpoints and continuous SVG frame `<image>` nodes remain unchanged and visible. Five tabs, business data, CloudBase and Map are untouched.

## Success and failure

- Strong success: while the restored ordinary VP1/page picture is still old, G3 already shows the current K/R and then visibly advances through multiple monotonically increasing F values for approximately 480ms in both directions.
- Partial failure: G3 gets the current command early but only jumps between endpoint values, so the native text path cannot present continuous frame updates.
- Failure: G3 is stale/blank, runs backward without a reversal, hides or changes the real glyph, changes taps/navigation, introduces fallback, or materially degrades the existing morph duration.
- Simulator evidence is a local gate only; it cannot establish device compositor behavior.

## Revert

Remove the two `native-text-probe` inputs, `nativeTextProbe` property, `probeProgress` field/patches, one `cover-view`, one style, the G3 assertion and the `G3` provenance text. No animation/state rollback is required.

## Required device action after local gates

One uncropped Add -> Me -> Add recording with the page top, both purple G3 labels and full TabBar visible. No Console JSON is required for this visual carrier test.

## Local result

- Focused G3 structure check: 8/8 PASS.
- Full `npm run verify:all`: PASS — 229 static, 21 TabBar, assets/icons, 233 cloud mocks, 74 handoff, 44 UI, 8 VP1/G3 and 4 capture-analyzer checks.
- WeChat DevTools compiled both changed WXML files and the changed WXSS file; simulator Console matched no `error|exception|fail` lines.
- Add -> Me: the unchanged real Add/Me glyphs completed in 495/497ms with the 480ms frame budget, no fallback. Both purple native labels were visible at current K/R and F100 after settling.
- Me -> Add: automated samples read F -1/-1 while waiting for first-frame presentation, then F16, F69/74 and F100. The real glyphs completed in 496/500ms with the 480ms frame budget, no fallback.
- Evidence manifest: `reports/captures/devtools-g3-manifest.json`. Simulator evidence does not establish device compositor behavior.

## Device result — vbug15

- Source package: clean `fix-9.13` at `125dc2f`; recording SHA-256 `61d2b06cf26dde7628eb109fd503c47da54f0162e96f94dec3a07d171e3bf326`.
- Add -> Me: at PTS 1.305422s the restored Me page/bar was old and both G3 labels were parked old state. At 1.338556s ordinary WXML had reached current K8/R46 while G3 still showed K0/R39 and K0/R35. G3 caught up at 1.345822s and later advanced F0, F7, F27 and F54/F60.
- Me -> Add: at 3.300433s page, bar and G3 all restored old K0/R45. G3 briefly reached current K9/R51 at 3.366578s, 16.355ms before ordinary WXML, but only after the old endpoint had already been visible.
- Verdict: failure. Native text can present sequential frame progress after receiving a command, but it does not reliably receive the current command before the restored old picture and therefore cannot prevent the flash. The one-frame lead/lag varies by direction.
- Full-frame PTS evidence and contact sheet: `E:/HuaweiMoveData/Users/HUAWEI/Desktop/临时/vbug15-analysis/vbug15-evidence.md`.

The G3 inputs, property, progress patches, `cover-view`, style, assertion and package marker were removed exactly as specified above. VP1, navigation and the real SVG animation remain.
