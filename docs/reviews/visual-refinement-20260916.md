# Visual refinement · 2026-09-16 · R6–R7

## Scope and sequence

Fresh baseline: integrated-with-cloud at cb23417d605e4ad3875c8aa56ba51e7c1c3d5448. This continues the first five rounds; it is not a redesign. Read the README, visual-language review, status/acceptance records, app configuration/tokens, nine requested pages, shared components/Tab and relevant verification tools before changing application styles.

R6 first reported P0/P1/P2/KEEP, with native evidence. P0 is not yet established, not globally excluded. P1-01 is duplicate Add bottom clearance; P2 is deferred. Preserve Home Weekly proportions, Us relationship/Journey structure, Me statistics, Sheet shell, Memory Row ratio, Map logic and the rejected Tab optimization rollback. Tencent basemap complexity is excluded.

## R6 evidence and limits

- Baseline: 9 routes, 14 screenshots, 39 successful native calls.
- Explore: 13 Sheet types, Add import/required validation, Map collapse/filter/no-result; one settings-element call failed. A transient identity-gate screenshot is not a settled Add state; attempted input focus did not prove a keyboard.
- Chinese Dusk: 9 routes/12 screenshots from matrix-v2; subsequent Sheet call failed because navigation was not settled. The restoration timeout was not treated as success; a separate recovery restored pearl/system and matched external memory/draft fingerprints.
- English Pearl plus Add render samples: matrix-v4, 74 successful calls. The theme, language, memory and draft restoration checks all returned true.
- Add samples use three existing photo sources, repeated to nine only for render coverage, synthetic long text, six tags/five stars, tag popover, saving/error/uploading flags. No saveDraft/changeDraft/onSave/upload/cloud record write is performed by those samples. They are NOT business acceptance.
- Initial storage comparison using an App variable checked zero keys after navigation: INVALID, explicitly discarded. External-file checkpoints replaced it.
- Images are DevTools-scaled screenshots; fine pixel/phone judgments are not certified.

## R7 — one issue group: Add end-of-form spacing

Before: Add page padding reserves --tab-clearance in addition to the sibling tab-spacer. At 390×844, the Save lower edge is y=554; shared spacer starts at y=697 and is 147px high.

Change: only `.add-screen` padding-bottom becomes existing `var(--space-sm)`. Shared spacer, safe-area calculation, button geometry and all fields/handlers remain unchanged. No JS/WXML/Tab/Map/token changes in application code.

After: Chinese Pearl and Dusk Save lower edge y≈684.67, English Pearl y=685. Shared spacer stays 147px; Save stays 350×52px. Redundant local gap drops from 143px to 12px; approximately 131px less dead scroll space.

Native before/after review: default Chinese/Dusk/English and repeated existing-photo/long-tag/popover/save-error/saving render samples. The end action is closer to the content/Tab boundary without overlap; primary photo composition and controls are retained. Decision: KEEP this scoped visual change, subject to final source regression. Do not expand this round into photo layout, typography or Tab architecture.

Native evidence is private/ignored under reports/visual-refinement-20260916/round6 and round7/after. The user-facing comparison is Savor_R7_Add_前后对照.jpg; no private screenshots are published in Git.

## Regression policy

The initial verify:all stopped on the intentional Add stylesheet hash difference, before business tests. Do not delete the assertion, skip Add, or rewrite any of the 16 historical fixture files. A separate tools/visual-refinements.json identifies the frozen base hash, reviewed current hash and this record; verify-cloud still checks exact bytes for every baseline file and only accepts this additional review channel for existing WXSS files. Existing historical approvals and fixtures remain unchanged.

A new visual contract requires a single Add clearance owner and preserves the shared spacer. Relevant suites passed before/after the change. Final verify:all result and source integrity are recorded in ignored round7 evidence and the current status record.

## Remaining work, not acceptance claims

Real phone/narrow keyboard; actual photo failures/upload/save success/draft restoration; broader 0/1/many, partner/no-partner and long profile data; full Sheet/Dusk/English cross-product and real motion. English Reports native navigation title still appears Chinese in the current screenshot: P1 localization consistency for a later group. Map no-result wording and image-failure fallback semantics remain review candidates, not silently fixed here.
