# Us identity-state review

Date: 2026-09-22. Scope: `miniprogram/pages/us/index.wxml` and its paired `index.wxss` only.

## Decision

The `fb00388` Us delta was not accepted wholesale. It combined intended inline identity and empty-avatar states with an unreviewed replacement of the visible shared-space button by a heading icon and removal of the previously reviewed scope explanation. That deletion violated the existing secondary-UI contract and made `verify:secondary-ui` fail.

This repair restores the reviewed bilingual `space-management secondary-button`, the separate `copy.s325a78d28f` scope explanation, and the prior settings-button geometry. It retains the inline identity status and explicit blank states for missing owner/partner avatars. Chain WXML from SHA-256 `3abe216ebf9f2a3e867d475ae51ea40812a98d5168eb08b201e83bd991e45adc` to `003c8f20dda7746f5cde5c2920e954b1c6e1a51f42341aacea0a15c6633845ff`, and WXSS from `a021a8dba2129f3ea269521c4b84b38e341eecb1275de0f62d020aa92a73882e` to `be9dfb4344b05dd822587ace1daa0ffe15802aafd8540bce4a50ab9a643bb579`.

No Us event destination, sharing permission, cloud protocol, Store contract, identity partition format, or Stage 6/7 migration contract is changed.

## Evidence

- Before repair, `verify:secondary-ui` failed because `space-management secondary-button` was absent; after repair all 15 checks pass.
- The restored scope explanation is the exact binding reviewed in `docs/reviews/ux-remediation-20260917.md`.
- The production Journey clearance verifier passes all 12 envelopes.
- `verify:identity` covers cold-start hiding, partition switching, stale leases, late cloud results, and offline re-verification redaction.
- `verify:ui`, `verify:visual-language`, and repository static verification cover markup and shared visual/source contracts.

Native iOS/Android rendering of the inline status and empty-avatar states remains device-acceptance work.
