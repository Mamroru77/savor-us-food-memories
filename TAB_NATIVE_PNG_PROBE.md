# G2 — local-PNG native-layer probe

Status: all local gates passed; device visual acceptance pending. This is a diagnostic package, not a claimed fix.

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

## Required device action after local gates

One uncropped Add -> Me -> Add recording with the top page marker and full TabBar visible. No Console JSON is required for this visual carrier test.

## Local result

- Focused G2 structure check: 8/8 PASS.
- Full `npm run verify:all`: PASS — 229 static, 21 TabBar, assets/icons, 233 cloud mocks, 74 handoff, 44 UI, 8 VP1/G2 and 4 capture-analyzer checks.
- WeChat DevTools compiled both changed WXML files and the changed WXSS file; simulator Console matched no error/exception/fail lines.
- Home -> Me: both bundled PNG arrows and the unchanged real glyphs were visible; the two changing real glyphs completed in 507/508ms with a 480ms frame budget.
- Me -> Add: both bundled PNG arrows and the unchanged real glyphs were visible; Add/Me completed in 498/501ms with a 480ms frame budget.
- Evidence manifest: `reports/captures/devtools-g2-manifest.json`. Simulator evidence does not establish device compositor behavior.
