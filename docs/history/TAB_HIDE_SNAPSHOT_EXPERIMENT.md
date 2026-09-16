# J1 — hidden-source TabBar snapshot experiment

Status: REJECTED on device and precisely removed. This was not a fix.

## Hypothesis

The native page cache restores the source page's last visible render picture before current WXML is presented. After that source page actually enters `pageLifetimes.hide`, parking its TabBar at the destination endpoint may make the next restored picture match the return transition origin.

## One variable

- A TabBar that initiated `wx.switchTab` parks itself at the destination static endpoint only when its page receives `hide`.
- The click handler still calls `wx.switchTab` immediately and does not change visible source data before navigation.
- The five buttons, SVG endpoints, continuous morph, 480ms wall-clock duration, Map and business/data code are unchanged.
- `VP1 J1` is package provenance only.

## Result criteria

- Success: Add -> Me and Me -> Add show no prior selected endpoint before the current origin, with no pre-leave change, blank frame, navigation delay or animation regression.
- Failure: either direction still restores an old page/TabBar/endpoint, or any early visual mutation, blank, fallback, navigation or timing regression appears.
- Local tests and the simulator are gates only; acceptance requires PTS-ordered true-device video and matching runtime logs.

## Revert

Remove the `hide` publication, `_pendingLeave` bookkeeping, `J1` provenance token and the two focused assertions; restore the approved hashes. No animation, navigation or page code needs rollback.

## Device result

- Valid source: clean `a4b2bc55df8f1c1f30322f5770b50f980c994fa6`, with `VP1 J1` visible; OPPO PKB110, Android 16, WeChat 8.0.76, base library 3.17.3.
- Add -> Me: 2.833333s still showed Add `B2 K7 R43 SEL2 ACTIVE`. The first Me frame at 2.850000s restored old `B3 K2 R13 SEL4 ACTIVE` and its selected endpoint through 2.900000s. The current `K8/R44` animation origin appeared at 2.916667s: a 66.667ms old-endpoint interval.
- Me -> Add did not show that old endpoint in this capture, but success requires both directions; the forward failure is decisive.
- Both geometric morphs still completed in 484–488ms with a 480ms frame budget and no fallback. Correct animation timing did not update the native cached restore picture.
- Verdict: reject. Publishing after `pageLifetimes.hide` changes hidden WXML state but does not reliably replace the next native restored frame.

Full-frame and cropped PTS evidence: `E:/HuaweiMoveData/Users/HUAWEI/Desktop/临时/adb-tab-loop/vbug-j1-a4b2bc5-cycle2b/evidence.md`.
