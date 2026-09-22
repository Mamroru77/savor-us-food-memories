# Me profile-state review

Date: 2026-09-22. Scope: `miniprogram/pages/me/index.wxml` and its paired `index.wxss` only.

## Decision

The current WXML/WXSS pair is the intended coordinated Me identity/profile implementation, not an unexplained snapshot drift. Keep the historical approved checkpoints unchanged. Chain WXML from the reviewed UX checkpoint SHA-256 `311f7be86eb592003fa2689e7c802d349c3dbd547daaa0a92938fe117e22f744` to `6067ab5f1ee6958d64484bbc9218dc355ddc66ec9777a57c08d836e87c6095b1`, and WXSS from `3e8e458dac2352384c3025b527970ea04e58d2320e67673477b2c2a494b7abc4` to `dc58197e9b2ddddd1ac32e6c141b82e36127c62d072c43f86c4d7f6308645bd7`.

The WXML chain has two deliberate steps:

- `fb00388` produced intermediate hash `6d6652d072b5ec9819091ef62942f314ae568ce7e2d6035748ca259579847e03`, adding inline identity status, an explicit empty-avatar state, and the then-current native avatar bridge.
- `e1c8ebb` produced the current hash by removing only `bind:nativeavatar` after avatar lifecycle ownership moved to the shared `nativeFlow`; Me, Sheet, and ProfileEditor no longer need the event bridge.

The Stage 5 owner-lifecycle repair remains in `profile-editor` and its focused verifiers; none of its four files is changed by this review. No explicit Profile Save behavior, avatar projection, cloud protocol, Store contract, identity partition format, or Stage 6/7 migration contract is changed.

## Evidence

- `verify:native-flow` passes all owner resume, cancellation, replacement, and stale-owner checks.
- `verify:avatar` passes 34 production-boundary checks, including Me/Sheet/ProfileEditor persistence, explicit close, storage failure, migration, and owner changes.
- `verify:identity` covers cold-start hiding, partition switching, stale leases, late cloud results, and offline re-verification redaction.
- `verify:ui` checks balanced Me markup and duplicate attributes before reaching its separate control-height baseline.
- `verify:visual-language` and the repository static verification cover the shared visual/source contracts.

Native iOS/Android avatar chooser and inline-status rendering remain device-acceptance work.
