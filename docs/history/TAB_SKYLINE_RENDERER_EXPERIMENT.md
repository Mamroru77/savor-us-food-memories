# K1 — Add/Me Skyline renderer experiment

Status: PENDING LOCAL AND DEVICE EVIDENCE. This is an experiment, not a confirmed fix.

## Hypothesis

PTS evidence shows the target page's old WebView picture before current WXML state, including old page, TabBar revision and endpoints. Rendering only the Add and Me test pages through Skyline may bypass that WebView restore path while leaving the existing TabBar state machine unchanged.

## One variable

- Set `renderer: skyline` and its compiler-required `componentFramework: glass-easel` only on Add and Me, the two pages used by the repeatable device probe.
- Keep five tabs, immediate `wx.switchTab`, all WXML/JS business logic, SVG endpoints, continuous 480ms morph and Map unchanged.
- `VP1 K1` records package provenance only.
- Do not change the developer-tool project setting unless the compiler explicitly requires it.

## Result criteria

- Success: both directions first display the current transition origin and then one continuous morph, with unchanged layout/taps and no old page/bar/endpoint, blank or fallback.
- Failure: compile/runtime incompatibility, layout or interaction drift, any old cached frame, blank, navigation delay, fallback or timing regression.
- Simulator results are a compile/layout gate only; acceptance requires PTS-ordered true-device video and matching logs.

## Revert

Remove the two page `renderer` and `componentFramework` fields, `K1` provenance token and its focused assertion; restore the approved WXML hash. No state-machine, animation or Map rollback is required.
