# I1 — TabBar root-portal render experiment

Status: REJECTED on device and precisely removed. This was not a fix.

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

## Device result

- Valid source: clean `3a57be3c95ad9242161b5199274d10b3e0681227`, with `VP1 I1` visible before capture; OPPO PKB110, Android 16, WeChat 8.0.76, base library 3.17.3.
- Add -> Me: the current Add page remained through PTS 2.900000s. From 2.916667s through 2.983333s, the complete page and TabBar were blank. Me first appeared at 3.000000s: an 83.333ms blank interval.
- Me -> Add: the first Add frames at 8.200000s and 8.216667s restored old `B2 K1 R11 SEL2 ACTIVE` and its prior selected endpoint. Current `B2 K3 R18 SEL2 ACTIVE` appeared at 8.233333s, 33.333ms after the first old frame.
- Add/Me morphs still completed in 483–486ms with a 480ms frame budget and no SVG fallback. Correct animation timing did not compensate for the blank/old restored frames.
- Verdict: reject. I1 violates the explicit no-blank constraint and does not eliminate the reverse old endpoint flash.

Full-frame evidence: `E:/HuaweiMoveData/Users/HUAWEI/Desktop/临时/adb-tab-loop/vbug-i1-valid/evidence.md`.
