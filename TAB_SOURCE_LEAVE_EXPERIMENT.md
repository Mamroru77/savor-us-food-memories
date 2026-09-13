# E1 — rejected source-visible-state experiment (removed)

E1 was removed from this local test version after device evidence showed that it changed the source page before native navigation. VP1 diagnostics remain active.

## Evidence motivating the experiment
vbug9 visibly restores B2 K17/R102 + page visit6, then shows parked R120, then new K21/R127 and visit7. Old text, selected labels and icon states appear together. Background state updates were acknowledged earlier but did not prevent old rendered state from appearing. This does not identify an internal WeChat snapshot mechanism conclusively.

## Removed behavior
`onTabTap` no longer publishes destination endpoints on Add or Me before `wx.switchTab`. The E1-only failure restore path, trace events, debug field and `VP1 E1` badge suffix are also removed. Navigation remains immediate and VP1, the 480ms wall-clock morph, cached-state diagnostics, five tabs, Map and business code are unchanged.

## Explicit risks / rejection criteria
The source may visibly jump before leaving. The native retained frame may still ignore the update because navigation does not wait. Both are valid experiment failures, not grounds to add a navigation delay or blank artwork. Do not expand to other tabs without successful native comparison.

## Verification
The handoff suite now checks all 20 directed tab changes: native navigation is invoked immediately, no preparation timer is created, and neither the visible source bar nor a cached peer is changed by the tap. Device/compositor acceptance is still NOT_EXECUTED.

```js
JSON.stringify(getCurrentPages().slice(-1)[0].getTabBar().getTransitionDebug(), null, 2)
```

The remaining generic tests still cover native failures, stale callbacks, destination morph commands, cached endpoints, wall-clock timing and VP1 bindings.

## VP2 render-structure contrast (completed and removed)

- Hypothesis: the stale pixels restored on Add/Me belong to the ordinary WXML/WebView snapshot rather than the current JavaScript state.
- One variable: when the active Tab is Add or Me, render a small `cover-view` VP2 sentinel above the existing VP1 TabBar sentinel, bound to the same B/K/R/SEL/ACTIVE values. Existing page VP1 remains the page/visit reference. Icon nodes, transition state, timing and navigation are unchanged.
- Evidence: vbug12 records Add -> Me -> Add. In both directions VP2 displayed the current K/R/SEL state while the destination page and ordinary VP1 WXML still displayed their old state. The old debug session disconnected before its JSON could be saved; a later session is not treated as matching evidence.
- If VP1 is stale while VP2 is current, the stale boundary is below the native cover layer. If both show the same old IDs, the whole page/container is being restored. If both IDs are current while only the glyph is old, isolate the morph icon static/frame layers next.
- Result: the success condition was met visually using decoded frame PTS. The stale boundary is below the native cover layer; page WXML and ordinary TabBar WXML can also catch up on different frames. This does not identify a production fix by itself.
- Revert completed: the VP2 WXML/WXSS node and focused verifier were removed. Map code, Map animation, navigation and morph timing remain untouched.
