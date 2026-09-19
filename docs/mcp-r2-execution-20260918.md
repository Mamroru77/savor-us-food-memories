# R2 execution checkpoint — 2026-09-18

This is an execution checkpoint, not final acceptance. User authorized the R2 order without further questions. No commit, push, deployment, cloud write, identity change, private-data mutation, fixture edit or Tab implementation change was performed.

## Baseline: BLOCKED / located

- Completed `npm run verify:all`, exit **1**. Evidence: `reports/ux-remediation-20260917/resume-20260918-verify-all.{log,exit}`.
- Failure is `tools/verify-menu-copy.cjs:12`: its whole-file non-menu equality check predates the retained A Memory preview/reading-position integration in Me.
- `resume-menu-contract.diff` identifies preview cancellation, parent-scroll restoration, native preview handling and sheet reading-position reset as the non-menu differences. The menu row count/order/icon/route assertion precedes the failing non-menu assertion.
- Do not remove the A behavior to satisfy an obsolete whole-file guard. Do not claim the full baseline passed, change its historical fixture, or delete the assertion. Reconciliation remains unresolved.
- Independent reruns: `verify:map-motion` exit 0; `verify:map-viewport` exit 0; `verify:page-lifecycle` exit 0, **8** checks. This corrects the earlier read-only summary's count of seven lifecycle checks.

## D2: PARTIAL — regression and DevTools reproduction completed, repair not implemented

Added `tools/verify-map-search-clearance.cjs`, standalone while intentionally RED. It executes production `buildDrawers()` against synthetic anchors; it is not a simulated rewrite of the layout. It checks widths 320/375/428, children 1/3/4, progress 0/0.5/1, shorter last pages, hit width, unchanged coordinates and a roomy upward-expansion control.

- Result: **13 passed / 18 failed**, exit 1 (`resume-d2-red.{log,exit}`).
- Three-child fully open case: button top -32 versus safe top 180. One-child fully open: 170 versus 180.
- No registration into `verify:all` yet; no existing CI script or assertion changed. Run directly with `node tools/verify-map-search-clearance.cjs`.
- IDE diagnostics for the new test: zero matching errors/warnings.

DevTools reproduction, current user data unchanged:

1. Restored CLI and runtime, navigated to Map as setup (not claimed as a Tab human-path pass).
2. Read geometry: safe top 208, root screenY 385.04923960965795; collapsed button top 256.04923960965795.
3. Executed actual `automation_element_action tap` on `.pin-stack-toggle` (not a Page-method call).
4. Read geometry: clusterOpen true, progress 1, height 230, button top **155.04923960965795**.
5. Captured and inspected `resume-d2-before.jpg` (411x888): Search obscures the expanded upper controls.

Evidence: `resume-map-before.json`, `resume-d2-tap.json`, `resume-d2-native.json`, `resume-d2-screen.json`, `resume-d2-before.jpg` under the report directory. These are DevTools evidence, not phone acceptance.

Production Map geometry and WXML were not edited. Directional expansion still requires coordinated native callout bounds/offset, rows, button and transparent hit geometry, not a hit-only displacement. Keep full-capacity bounds fixed throughout the 320ms animation, retain the genuine root coordinates, and preserve the upward path contracts. A direction must be selected from full capacity (not changed mid-animation or on a short last page). Bottom-card/viewport clearance also needs validation; top clearance alone is not a complete fix.

## Automation recovery

- Installed CLI 0.3.9, equal version, login not expired, no CLI token required.
- Installer diagnostic's `cli_unavailable` was a path-with-spaces invocation failure. The installed cmd entry was inspected; invoking its same Electron bootstrap with correctly quoted arguments succeeds, without changing installation files.
- Executable: `D:/software data/微信web开发者工具/微信开发者工具.exe`; CLI entry: `resources/app.asar.unpacked/js/common/cli/skill-index.js`; `ELECTRON_RUN_AS_NODE=1`.
- Under Git Bash, set `MSYS_NO_PATHCONV=1`; otherwise `/pages/map/index` is converted and navigation fails. Corrected navigation succeeded.
- `--project` uses lower-case drive `e:\HuaweiMoveData\Users\HUAWEI\Desktop\savor-audit-repairs-20260915`.
- Runtime first missing: `simulator_open_page` restored it, but route readback was Home, not Map. Always read actual route after successful tool replies.
- Direct `.tab-item[data-index="1"]` lookup returned no such element. No Tab source was changed or bypassed; subsequent Map navigation was setup only.
- Local helper recovered at `/home/user/mcp/wx.py`. Read-only evaluate expressions collect route/count/geometry, not private text or photo URLs.

## Later R2 stages

D4: source review only. Existing renderer disposal/query-generation protections and cache behavior were inspected. Current Map screenshot displays photos, but hide/show/Memory-return lifecycle recovery was not accepted. No second renderer introduced.

D5/E/F/matrix/final continuous replay: not completed; retain R2 statuses, do not promote them. F1 lifecycle suite currently passes. Its harness rejects unlisted dependencies and has no i18n dependency, while the navigation-title stub does exist. This is a specific lead for reproducing the rolled-back import change, not a freshly executed proof of that historical failure.

## Exact review hashes

- New D2 regression: `d2e054bf7874f1fc412fa8100901d8f47fa7d12a97c983672a3e86cc41117801`.
- Map JS unchanged from takeover: `9b72853e3287dfb50a83720f0104afc7855851663813d377c096a175fb8b1fc8`.
- Reports JS unchanged from takeover: `4a0d0530d14d6cb15b630a080c81c60cadf36b8cad80b2b3e62bc19da7c78e6d`.
- Hash evidence: `resume-review-hashes.txt`. Original 15 modified files remain; protected untracked `VID_1.mp4` remains. New work consists of the regression suite, documentation and ignored diagnostic evidence. Historical applied-hashes ledger untouched.

Next substantive engineering item remains D2 directional implementation and same-path replay; this checkpoint does not certify a repair or request new user authorization.
