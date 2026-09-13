# G2 — local-PNG native-layer probe

Status: REJECTED on device and precisely removed. This was a diagnostic package, not a fix.

## Hypothesis

G1 may have failed because device `cover-image` did not render its SVG data URI, rather than because the native image layer is unavailable in the TabBar. A bundled PNG whose source changes with the current ACTIVE/PARK state can distinguish those cases without replacing or hiding the real glyph.

## One variable

- The real Add/Me static endpoints and 480ms SVG morph stay on their original `<image>` path.
- Add and Me alone receive one small sibling `<cover-image>` probe using already bundled `chevron-right.png` for ACTIVE and `chevron-left.png` for PARK.
- The probe has no background or border: visible arrow pixels, not the element box, are the evidence.
- `VP1 G2` identifies the package. Navigation, timing, state publication, five tabs, business data and Map are unchanged.

## Success and failure

- Strong success: in a restored frame where ordinary VP1 still says PARK/old K/R, the native arrow already points right for the current ACTIVE command; the real glyph remains visible and morphs continuously.
- Partial failure: PNG pixels render, but the arrow remains stale in lockstep with ordinary VP1.
- Failure: either native arrow is blank, either real glyph becomes blank/hidden, layout or taps change, or the 480ms morph is degraded.
- Simulator results are only a local gate and never device acceptance.

## Revert

Remove the two `native-probe` inputs, the `nativeProbe` property, the single native probe element and its style, the G2 structure assertion, and the `G2` provenance text. No animation/state rollback is required.

## Device result

Source: `vbug14.mp4`, SHA-256 `298D6223F46A4A43DC7A916952446CE70FE98277A69ACF76F7B9312F0BA1AF38`. The HEVC recording is VFR; all times below are decoded presentation timestamps, not frame/fps estimates.

- Add -> Me: at PTS 1.254500s the restored Me view says `P:me#1 V5 / B2 K18 R126 SEL4 ACTIVE`, but both PNG arrows still point left. At 1.312867s the current right arrows arrive: 58.367ms later.
- Me -> Add: at PTS 2.623778s the restored Add view says `P:add#1 V4 / B1 K0 R136 SEL2 ACTIVE`, but both arrows still point left. At 2.706156s the current right arrows arrive: 82.378ms later.
- PNG pixels render, but remain stale with the restored page/TabBar instance. No frame showed old ordinary VP1 with a current native arrow. This exactly matches the predeclared partial-failure condition.

Decision: reject the carrier-bypass hypothesis and remove G2. Do not promote a pre-bundled PNG morph or Canvas substitution on this evidence; changing the image format did not bypass the restored layer.

## Local result

- Focused G2 structure check: 8/8 PASS.
- Full `npm run verify:all`: PASS — 229 static, 21 TabBar, assets/icons, 233 cloud mocks, 74 handoff, 44 UI, 8 VP1/G2 and 4 capture-analyzer checks.
- WeChat DevTools compiled both changed WXML files and the changed WXSS file; simulator Console matched no error/exception/fail lines.
- Home -> Me: both bundled PNG arrows and the unchanged real glyphs were visible; the two changing real glyphs completed in 507/508ms with a 480ms frame budget.
- Me -> Add: both bundled PNG arrows and the unchanged real glyphs were visible; Add/Me completed in 498/501ms with a 480ms frame budget.
- Evidence manifest: `reports/captures/devtools-g2-manifest.json`. Simulator evidence does not establish device compositor behavior.

## Rollback result

Removed only the two `native-probe` inputs, `nativeProbe` property, probe element/style, G2 assertion and `G2` provenance. VP1, the original `<image>` glyphs, continuous SVG morph, 480ms clock, immediate navigation, five tabs and Map remain unchanged.

Post-rollback `npm run verify:all` passed (229 static, 21 TabBar, assets/icons, 233 cloud mocks, 74 handoff, 44 UI, 7 VP1 and 4 capture-analyzer checks). WeChat DevTools recompiled the affected WXML/WXSS files; simulator Console had no `error|exception|fail` match. The four runtime source hashes exactly match the pre-G2 baseline.
