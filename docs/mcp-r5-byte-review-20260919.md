# R5 precise byte review — 2026-09-19

Current baseline fails verify:cloud on the Sheet WXML exact hash. Disk byte analysis proves both recorded WXML hashes were computed with ONLY their final newline removed: Sheet e37b8753… vs disk 7b757d30…, Map 388252a1… vs disk 464c48ae…. Both files contain LF, zero CRLF; this is not an unproven encoding guess. The bridge read text omits the terminal LF. Use returned sha256 versions or disk bytes for source review, never the reconstructed read text hash.

Freshly reviewed diffs retain the previously registered A/E/D2/scale behavior. New R4 hunks are precisely raw restaurant text before the photo, queue-dependent retry class, and removal of the whole-map veil. Sheet CSS adds one normal-flow multiline identity rule; Map CSS removes the one rgba(0,0,0,.3) veil rule. No other CSS changes. Those two CSS files also needed entries in the existing visual-refinements review mechanism; base hashes remain frozen approved checkpoints.

This correction changes only exact review metadata and documentation. No product code or historical fixture/assertion changes; verify-cloud still compares actual full disk bytes, has its same file scope and validates its same base chain. Unknown future content must continue to fail. Existing R4 behavioral suite remains required; this metadata repair does not certify native UX.

Exact reviewed disk SHA-256:
- `miniprogram/components/sheet/index.wxml`: `7b757d302bfc8c6400d210defe10a5a82f97a6353267796b9d4ec145d2bba42c`
- `miniprogram/components/sheet/index.wxss`: `98e1fa0cf519ba5bed0fa2a27ada91455a4610058968dcbcca5254674aed3e23`
- `miniprogram/pages/map/index.wxml`: `464c48ae3efc36197a54de494efaaddee5616023d4457d5241381437193c9db1`
- `miniprogram/pages/map/index.wxss`: `1af64be700166e451ffd3c411f3bb8c936de0d2daf38e5f8eb0a4008e95259de`

## Legacy contrast contract collision
After the first exact-byte repair, unchanged verify-cloud line 456 required the removed veil selector to exist. This conflicts with the user's explicit unfiltered-base-map requirement. Keep its original regex assertion and all palette assertions, and use a narrowly named historical-view projection, following the existing reviewed-Me pattern. The helper accepts only the exact reviewed Map CSS and WXML hashes, requires the runtime veil absent, and reconstructs only the deleted historical CSS rule in memory for that legacy assertion. It is never imported by the app. A dedicated suite verifies runtime absence and rejects mutated CSS, mutated WXML and an intercepting-veil addition. No historical fixture or assertion is removed, no page is skipped, no runtime style is reintroduced. R4's actual-runtime absence contract remains unchanged. Any future source change fails closed until explicitly reviewed.
