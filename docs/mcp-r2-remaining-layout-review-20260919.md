# R2 remaining layout review — 2026-09-19

## Scope and provenance

The original 192 captures have now all been visually inspected (24 sheets, eight states each). They are historical mixed-build captures, not uniform-build acceptance. Eight 390-width Map captures actually show the Memory sheet; they do not demonstrate the unobstructed Map and require replacement evidence. Original files are retained.

Additional findings: the 375/en/Pearl/Quiet-on selected pin has a fallback while its card has the real photo; cause not yet established. English Us Journey labels approach/overlap the footer photo. Map search/recenter boxes intersect at 390 (search bottom 210px, control top 208px); larger widths require recheck.

## Us scoped amendment

- Frozen approved checkpoint, unchanged: `d4a9b1b32f4efaf3f88061269ec38f886a39ddf3aae76c5106a91ede0fafbbe3`.
- Reviewed `miniprogram/pages/us/index.wxss`: `a021a8dba2129f3ea269521c4b84b38e341eecb1275de0f62d020aa92a73882e`.
- Preserve Together/Journey/Shared Moments, typography, tokens, real photo, bindings and business semantics. Journey uses normal flow instead of absolute positioning with fixed height; its minimum height remains 300rpx. No text/photo hiding or filter is introduced.
- Dedicated `tools/verify-us-journey-clearance.cjs` RED exit 1 before change, GREEN exit 0 after. These are source layout envelopes, not a native browser engine.
- Actual 390/en before: statistics bottom 622px, footer top 609px, photo top 610.67px. After: statistics bottom 621px, footer top 629px, photo top 630.67px. Card grows from 156px to 176px. Native clearance is 8px. First post-reload query returned null; that capture is NOT green evidence. The subsequent explicit Us navigation and measured rectangles are the valid observation.
- Historical `tools/fixtures/regression/*` and historical assertions remain unchanged. Add this exact-hash entry to the existing separate visual-refinements mechanism; retain the frozen approved base.

## Map control clearance amendment

- Pre-edit Map JS: `44637641496235e6e10074cb8d704b8922ea207645b34cec56ad81d8f1eac8c3`.
- Intermediate Map JS: `8ab8172e95e534c76926f8247a859665fbb7325df7b074a4cd6d3252b9322003`; final callback-style selector API: `720002f595b6f475a892205211da10346aa1f3ab5d1bcc1e70eace4ae7001a82`. This preserves compatibility with existing callback-style projection tests without changing their assertions.
- Measure the actual search rectangle after view updates and set the shared overlay boundary to search bottom + 8px. Update only `overlayTop` and hit-region alignment when the value changes. Reject inactive/disposed/gesture/stale replies. No camera, marker, canvas, grouping, animation duration, permissions or data mutation is added.
- Dedicated new `tools/verify-map-control-clearance.cjs` RED exit 1 before implementation. Green/native verification pending at this checkpoint.
- The pre-existing initialMapScale binding and scale-race/echo suites were present when this continuation freshly read source; they are NOT authored by this layout amendment. Native verification must use the current independent initial scale binding, not call observed mapScale a bound command.

## Remaining work at this checkpoint

Verify both changes in the affected four-device/eight-state matrix; replace the eight obscured 390 Map states; reproduce the selected-pin fallback; exercise actual native fractional pan/zoom; establish real-record multipage availability; rerun all tests, diagnostics and diff checks; restore Home/390/system/Pearl/Quiet-off and verify business data/draft unchanged. Phone acceptance remains the user's stated premise, not assistant-run phone evidence.
