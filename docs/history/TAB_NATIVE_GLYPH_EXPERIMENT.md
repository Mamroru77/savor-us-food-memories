# G1 — Add/Me native glyph-layer experiment

Status: REJECTED on device and removed from the working code. This is not a fix.

## Evidence and hypothesis

vbug12 shows the VP2 native `cover-view` displaying the current B/K/R/SEL state while the destination page and VP1 ordinary WXML still display an old snapshot. Hypothesis: the visible old Add/Me endpoint is retained with the ordinary `<image>` layer; rendering those actual glyph pixels through `<cover-image>` will expose the current origin before the 480ms morph without changing state or navigation.

## One variable

- Add and Me glyphs only (`index === 2 || index === 4`) select a `nativeLayer` branch.
- That branch changes only the frame and static endpoint carrier from `<image>` to `<cover-image>`.
- Both branches use the same `src`, load/error handlers, generation/revision data, visibility gates, size and SVG frame sequence.
- The existing cyan VP1 bar marker adds the `G1` package tag for recording provenance; it is diagnostic text, not another rendering path.
- No duplicate glyph overlay, delay, hidden interval, navigation guard, endpoint change or timing change is introduced. Other three Tab glyphs and all Map page code are untouched.

## Gates

1. Local: focused structure assertion, full `verify:all`, WXML compile, simulator refresh, no simulator error/fallback, and a simulator screenshot showing actual Add/Me glyphs.
2. Device, only after local PASS: one continuous approximately five-second Add -> Me -> Add recording with page top and full TabBar visible. No Console JSON is required for this visual falsification.

## Result criteria

- Success: both directions begin from the current logical origin, retain a visible continuous morph, settle at the correct endpoint, and measure approximately 480ms by decoded PTS.
- Failure: any old endpoint flash remains; `cover-image` rejects the SVG data URI; frame/static load falls back; the morph becomes a cut/fade/blank; layout/taps change; or either direction fails.
- Simulator PASS is only a local gate and never a device PASS.

## Revert

Remove `native-layer` from the two TabBar component uses, remove the `nativeLayer` property and mutually exclusive `<cover-image>` branches, remove the focused G1 assertion, and restore the approved UI hashes. Baseline SHA-256 values:

- `custom-tab-bar/index.wxml`: `6d5761671734cbe6a5d62bc28179d8c18bbbd0e92555f09afdd761517e21b00c`
- `components/morph-icon/index.wxml`: `037463e7261d065deb026ce80ec675576e841b6eb81629c40ffa4e262303153b`
- `components/morph-icon/index.js`: `0142ed0bbb6cf08877bf12bb496cfa9a48daf23aa84cecc133af6370c33a1f8d`

## Result

- Focused G1 structure check: 8/8 PASS.
- Full `npm --prefix savor-mp run verify:all`: PASS — 229 static, 21 TabBar, assets/icons, 233 cloud mocks, 74 handoff, 44 UI, 8 probe/G1 and 4 capture-analyzer checks.
- WeChat DevTools compiled both changed WXML files successfully.
- After the user closed device debug, the local automation channel was restarted without clearing cache or reimporting the project. It invoked the production `onTabTap` handler because element selectors do not cross the custom TabBar boundary.
- Add -> Me: both native glyphs loaded and completed 16 frames in 495/498ms with 39/28ms first-frame waits; no fallback or console error.
- Me -> Add: the native glyphs loaded and completed 15/13 frames in 496/496ms with 62/51ms first-frame waits; no fallback or console error.
- Steady-state screenshots retain visible Add/Me glyphs and the `VP1 G1` provenance marker. Evidence: `reports/captures/devtools-g1-manifest.json`.
- With explicit user authorization, DevTools successfully pushed a 1,578,128-byte preview starting at `pages/add/index` to the currently logged-in developer WeChat account.
- These results establish simulator compatibility only. They do not establish the absence of a retained frame on the physical device.
- Device recording `vbug13.mp4` carries the `VP1 G1` provenance marker but shows blank Add and Me glyph pixels while Home, Map and Us remain visible. This occurs on Me at 1.132678s, in the restored Add snapshot at 2.737544s, and in the current Add state at 5.110367s by decoded PTS.
- Logical badges still report normal static target/origin state, so simulator load callbacks did not establish visible device pixels. The explicit blank-output failure criterion was met.
- G1 was therefore removed exactly as described above. VP1 diagnostics, immediate navigation, the original `<image>` carrier and the 480ms real-time morph remain.
