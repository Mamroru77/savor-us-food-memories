# Map identity-state review

Date: 2026-09-22. Scope: `miniprogram/pages/map/index.wxml` and its paired `index.wxss` only.

## Decision

The current WXML/WXSS pair is the intended coordinated Map identity-state implementation, not an unexplained snapshot drift. Keep the historical approved checkpoints unchanged. Chain WXML from the reviewed UX checkpoint SHA-256 `464c48ae3efc36197a54de494efaaddee5616023d4457d5241381437193c9db1` to `cf92efbb3250d1378d88f72adcd551d2d44916ca651e619c61ceb0deced25ccf`, and WXSS from the reviewed visual checkpoint `1af64be700166e451ffd3c411f3bb8c936de0d2daf38e5f8eb0a4008e95259de` to `78193d835eba8e7c753d7e3158010fdb7f575324334eb58226daacf63cd4a176`.

The delta introduced in `fb00388` replaces the blocking identity gate with an inline verification status backed by menu-button geometry from `pages/map/index.js`. Identity locking clears the active Store projection; Map rebuilds pending locations, visible memories, native markers, drawers, and selection from that empty projection. Existing stale marker-render generations and inactive/disposed guards remain unchanged.

No map geometry, camera command, event binding, cloud protocol, Store contract, identity partition format, or Stage 6/7 migration contract is changed by this review.

## Evidence

- The prior WXML and WXSS checkpoints are exactly `7a45387`; the current hashes are exactly `fb00388` and current HEAD.
- `verify:identity` covers cold-start hiding, partition switching, stale leases, late cloud results, and offline re-verification redaction.
- Map-focused checks cover deferred private-state handling, native-return selection guards, marker generations, camera behavior, stacks, and rendering cleanup.
- `verify:ui` checks balanced Map markup and duplicate attributes before reaching its separate control-height baseline.
- `verify:visual-language` and the repository static verification cover the shared visual/source contracts.

Native iOS/Android rendering and native map behavior remain device-acceptance work; this checkpoint does not claim pixel or performance acceptance.
