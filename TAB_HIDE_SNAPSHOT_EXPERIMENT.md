# J1 — hidden-source TabBar snapshot experiment

Status: PENDING DEVICE EVIDENCE. This is an experiment, not a confirmed fix.

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
