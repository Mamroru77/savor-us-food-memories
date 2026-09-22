# Home identity-state review

Date: 2026-09-22. Scope: `miniprogram/pages/home/index.wxml` and its paired `index.wxss` only.

## Decision

The current WXML/WXSS pair is the intended coordinated Home identity-state implementation, not an unexplained snapshot drift. Keep the historical approved checkpoints unchanged. Chain WXML from the reviewed UX checkpoint SHA-256 `d4252f1a986a47b3b83fe8d7c68e8c95f23bca55325bf45d7850efd26d29164b` to `63f2b4a6ba4b520820632d00ac1f7ea4a78e0c38b1e9259b3cd3d10fd91a958d`, and WXSS from `a9be695bf2427cd13066e910312a2adf878936d41721873fde6baa60bae381b3` to `8d3342ae23b22bccdbeccc66d67d42f29f91accbd56051bd7b608481995be47a`.

The delta introduced in `fb00388` replaces the blocking identity gate with an inline verification status backed by menu-button geometry from `pages/home/index.js`. The Home Store subscription still treats identity generation or lock changes as privacy invalidations: it synchronizes identity state and immediately clears cached memory IDs, recent rows, counts, photo, notifications, and open sheet state, including while the page is hidden.

No event binding, cloud protocol, Store contract, identity partition format, or Stage 6/7 migration contract is changed by this review.

## Evidence

- The prior WXML checkpoint is exactly `7a45387`; the current WXML and WXSS hashes are exactly `fb00388` and current HEAD.
- `verify:audit` covers immediate Home redaction on identity generation/lock change and verifies that WXML-facing history is reduced to IDs plus five recent rows.
- `verify:identity` covers cold-start hiding, partition switching, stale leases, late cloud results, and offline re-verification redaction.
- `verify:ui` checks balanced Home markup and duplicate attributes before reaching its separate control-height baseline.
- `verify:visual-language` and the repository static verification cover the shared visual/source contracts.

Native iOS/Android rendering of the inline status remains device-acceptance work; this checkpoint does not claim pixel or performance acceptance.
