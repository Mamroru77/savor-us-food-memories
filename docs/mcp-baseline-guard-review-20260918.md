# R2 baseline guard reconciliation — 2026-09-18

The full baseline failed before this turn at verify-menu-copy's non-menu equality, not Reports. Retained A intentionally changed Me outside MENU_ROWS. Reverting that behavior would regress previously accepted Memory reading continuity.

Resolution: preserve every existing menu assertion and the immutable historical fixture. Before the original assertion, project only the already-reviewed A hunks back to the historical menu-only view. This projection first demands the exact current Me SHA-256 a94224efd485a4e9aa9267c0d309d19e04a61b536fc9990573d120a10aae93c4. Each reviewed hunk must occur exactly once. Arbitrary changes, including menus, routes, preview cancellation or restoration, fail closed; this is not a wildcard source exemption. Future Me changes require a fresh explicit review.

Historical fixture SHA-256 remains 899d7486a1b7b089e715660ad6b81d24060381cf657c4784eb3d32e34ba6103e. tools/verify-me-review-contract.cjs asserts the equality and original fixture hash, exercises four negative mutations, and runs the existing production-function Memory return tests. The original menu checks also continue to run against projected source whose menu bytes are unchanged. No business source change is involved.

Review authority: R2 A KEEP and docs/reviews/ux-remediation-20260917.md A scope includes Me JS. Original failure and exact diff are retained under ignored reports as evidence, never required by CI. The previous checkpoint left this conflict unresolved; this narrowly-scoped review projection replaces that blocker without deleting an assertion or modifying a fixture. New helper, test and this review are ordinary nonignored repository files.
