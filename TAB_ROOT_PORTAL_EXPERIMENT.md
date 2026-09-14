# I1 — TabBar root-portal render experiment

Status: DEVICE RESULT PENDING. This is not yet a confirmed fix.

## Hypothesis

Device recordings show an old cached page and TabBar picture before current WXML state is presented. Moving the existing TabBar subtree into `root-portal` may keep it out of the page render subtree that supplies that restored picture.

## One variable

- Wrap the existing TabBar root in one always-enabled `root-portal`.
- Keep the five buttons, handlers, static and animated SVG layers, endpoints, 480ms wall-clock motion and immediate `wx.switchTab` unchanged.
- `VP1 I1` records package provenance only.
- Map and all business, CloudBase, data and API code remain unchanged.

The connected device uses base library 3.17.3; the bundled WeChat DevTools component reference declares `root-portal` support from base library 2.25.2 in WebView and Skyline.

## Result criteria

- Success: Add -> Me and Me -> Add first show the current transition origin and then one continuous morph, with no old page/TabBar endpoint first.
- Failure: either direction still shows an old page/bar/key/revision or old selected endpoint, or introduces blank glyphs, layout/tap changes, fallback, navigation delay or animation regression.
- Simulator results are a local compile/runtime gate only, never device acceptance.

## Revert

Remove the opening and closing `root-portal`, remove the `I1` provenance token and its focused assertion, and restore the approved WXML hash. No state-machine or animation rollback is required.
