# Tab stage 1 — endpoint handoff diagnostics

Baseline: 7e611a6. User authorized ordered work after vbug4 review.

This is a diagnostic release, NOT a claimed fix for the remaining native endpoint flash or frame stutter.

## Scope
- Only production changes: components/morph-icon/index.js and custom-tab-bar/index.js.
- Each icon stores up to64 local JS snapshots: attached, component page show/hide, setup entry, command receipt (old and next identities), view callback, static image load (accepted/rejected endpoint), command readiness, first frame queued/committed/reveal callback, motion finish, fallback.
- Snapshots include icon id, command/key/revision, from/to, expected static endpoint, logical layer, fallback, setup, hidden, settled key, pending flag and generation.
- Expected static endpoint/logical layer are JS/WXML state, NOT proof of native pixels being displayed. Ready/commit does not prove compositor presentation.
- Frame aggregates: encoder time, setData callback delay, maximum callback interval. These do not isolate native decode/GPU time or measure compositor FPS.
- No extra setData, per-frame triggerEvent, polling or console output. Only explicit getTransitionDebug() queries child components, labels them by dataset index, and exports snapshots for registered bars. Query failure is isolated from navigation. Never infer visible ownership from the newest/global bar.
- Existing nav-independent-v1 trace format is retained. Additional diagnosticBuild is render-handoff-v1 and renderInstances holds the per-instance diagnostics.
- Navigation, WXML/CSS, five pairs, fixed-step480ms scheduler, Map320ms and business logic are unchanged.

## Run
Use this package in real-device debugging. Record Home -> Map -> Add -> Us -> Me, stopping ~2s per tab. Immediately export:

```js
JSON.stringify(getCurrentPages().slice(-1)[0].getTabBar().getTransitionDebug(), null, 2)
```

Copy the full output (not a truncated screenshot) into a text file. Repeat the cached reverse sequence and export separately. This limits overwriting per-icon64-row buffers.

## Acceptance / next gates
Source and actual extracted ZIP must both pass verification before delivery. Six added tests cover diagnostic layer transitions, command identities, bounded copy/URI exclusion, rejected source loads, indexed query errors with responsive navigation, lifecycle recording.
Native endpoint acceptance remains pending. Use observed pre-flash state to choose the smallest handoff fix. Only after this evidence gate proceed to wall-clock scheduler and then measured frame cost reductions / isolated Canvas experiment if needed. A wall-clock change alone cannot guarantee smoothness.
