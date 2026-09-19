# User-path remediation · 2026-09-17 (in progress)

Authority: user explicitly approved A–F as consecutive reversible rounds, based on the 2026-09-17 real-user-path audit. Baseline integrated-with-cloud @ 2b162558deca71e68021d89e2a4005b359bb540c; original verify:all exit0 / 46405ms. No commit, push, deployment, identity-boundary change or real business writes authorized. Existing VID_1.mp4 is untouched and private.

## A — Memory reading continuity (candidate under visible UI verification)

Reproduced through visible controls: Weekly scroll → Memory starts mid-photo; preview → identity verification → Home instead of Memory. Private evidence a001–a007 in the ignored local report folder; not CI dependencies.

Cause: App.onShow legitimately re-verifies identity and redacts private pages; Sheet is unmounted and its parent selection is cleared. A temporary preview reading intent was not restored after same-owner verification. Weekly and Memory also reuse a scroll-view without a content-specific new-reading anchor.

Scope: Sheet JS/WXML; Home/Map/Us/Me JS and WXML event wiring; new memoryPreview helper; new verify-memory-return suite and package script. Preserve identity/App/i18n/Store, Tab, styles, photo pipeline and gallery position. No global scroll reset.

The helper retains only an in-memory ID/offset/photo-index and original identity lease. Existing gates still redact; existing resumeNative + assertLease authorize same-owner UI restoration only. Failed/revoked/different-owner verification, explicit close, unloaded/background page and removed record do not restore. No cloud response is resumed and no business state is committed.

Historical fixtures and exact-file assertions remain. tools/ux-remediation-review.json is an additional scoped exact-hash review channel for the expressly approved template changes, chained to the previously approved hashes. It is not a wildcard or an exemption. Original hash failure is retained locally. A new test initially matched the property name scrollTop as a forbidden scrollTo call; the regex was corrected to match calls, retaining its intended assertion.

Validation and final KEEP/REVISE status will be appended after visible same-path replays; synthetic success alone is not UI or phone acceptance.

### A visible replay / refinement

New Memory now opens at its top (a011); scrolled preview return preserves the same Memory and reasonable offset (a014). Recent a018, Map a025, Us a032 also restore correctly; explicit closes work. a033 revealed the parent's existing gallery/page position is lost on the native identity-gated remount. REVISE rather than claim all A passed: capture numeric parent positions at preview entry and restore them only after same-owner verification, via existing host pages. Normal close without preview remains untouched. No extra stored records, identity exceptions or global scroll reset.

### A decision

KEEP after a041 confirms both original vertical position and the older gallery offset after preview return/close. a042–a043 ordinary Memory open/close also preserves the gallery. A: all nine relevant suites pass; parent refinement's five suites pass. Phone and motion certification remain open.

## B — Add native cancellation (candidate)

Before b001–b007 reproduces existing 111 draft → import → native location → cancel → blank draft projection and closed import. The persisted draft is not deleted. `i18n.syncPage` redacts at verification start; unlock uses the same generation, so Add did not reload the draft then. Add now reloads only on locked→ready, never on every refresh. Candidate native return awaits the existing same-owner resumeNative, preserves only its temporary scene, and rejects new edits/cancel, hidden/unloaded page or different identity. Cancel never confirms a branch or applies/saves a draft. Dates and persistence remain unchanged.

Test maintenance: new date contract used an incorrect handler name (`onDateChange`); corrected to the unchanged actual `onDate`, not the product. The pre-existing native-fallback test called an Add handler without onShow; add that real lifecycle setup now required by the active-page guard, retaining every assertion. Nine new runtime scenarios cover both active success and hidden/changed-owner rejection. No historical fixture altered. Also removed an unnecessary unconditional draft reload on native completion: only the verified-unlock transition owns rehydration, so ordinary active draft projection remains intact.

### B visible revision and KEEP
- b015–b016 initial candidate revision restored persisted draft 111 but still lost the candidate. Decision REVISE, not a test-only pass.
- Native choose cancellation may precede Page.onShow. Add now owns a single one-shot visibility promise, released by onShow after syncContext; only then the unchanged resumeNative/assertLease handshake runs. Explicit import reset/unload releases the waiter; existing serial/active/disposed/owner guards still reject obsolete scenes. No polling/timer or App/identity/store change. Added a callback-before-onShow fixture; old assertions retained.
- B-show-order-verify: add-native-return 451ms, cloud 12248ms, identity 447ms, ui 359ms, all exit 0; 11 Add checks.
- b017 explicit compile; b018 existing 111; b019–b023 same import text/candidate/controls; b024 native picker; b025 Cancel returns exact candidate controls and scroll; b026 draft 111; b027 original text and candidate. b028 Home tab → b029 Add retains candidate → b030 date 2026-09-16 → b032 native date picker → b033 Cancel unchanged date → b034 original 111/Selected location and unapplied candidate retained.
- B KEEP in DevTools, phone pending. No Use in draft, Save, upload or exported/imported real records. b022 window move blocked OS input; b022d recapture confirmed same 475x1107 IDE / 322x696 simulator at new OS origin 1288,35; pointer guards updated, not an app failure.

## C — Map empty-state cause (candidate)
Before c002 search zero and c005 Favorites zero both show Restaurant locations pending because the empty card/action use global pendingCount (8), not the active query/filter. The separate pending bubble already exists.
Scope: Map JS/WXML; existing locale TSV + generated catalog; one new fixture suite/package; this review and exact scoped Map WXML hash. Empty cause precedence is nonblank search, Favorites, other filter, then actual pending, then unchanged general empty state. Search CTA and clear icon use existing query handler with an empty string, retaining the active filter; Favorites/other filters use existing All selection. Actual pending still uses its existing native entry. No basemap/camera/coordinates/grouping/renderer/marker/layout/CSS code changed. No cloud writes or new data.

### C verification / KEEP
- Initial map-motion harness lacked i18n.t at module evaluation. Removed unnecessary eager empty-copy calculation from initial data (null until applyFilters); no old test/assertion/fixture changed.
- C-reverify all exit 0: map-empty 442ms (11 checks), map-motion 433ms, map-save 487ms, ui 455ms, secondary-ui 382ms, identity 474ms, cloud 12233ms, visual-language 384ms. Existing deterministic locale builder run successfully.
- c006 explicit compile; c007 Map; c008 same zero-result query now No matching places / Clear search; c009 CTA restores real card. c010–c011 Favorites now No favorites on the map / Show all memories. c012 query within Favorites → c013 clear icon retains Favorites → c014 CTA restores All. c015 distinct pending bubble still 8; c017 native existing six-item batch; c018 safely cancelled.
- C KEEP (DevTools, English/Dusk visible). Both locale cause/CTA projections and unavailable all-pending/other-filter-zero cases exercised only in fixtures; full visual locale matrix and phone pending. No real record correction. F5 six-of-eight reachability remains for its own round.

## D1 — eventless programmatic camera return leaves stale hit projection (candidate)
- d001 visible left arrow tap did not open. d002/d003 read-only diagnostics: ordinary hit rect left -2644.23/top 2105.04, cached drawer x -2663.12/y 2234.04, despite visible native arrow around simulator x30/y188. Fresh projection from actual getRegion puts its real anchor at logical (39.91,353.30); with existing 129px frame/button this matches visible arrow. Map data scale 18 vs native getScale 13.8.
- Root: applyFilters queries projection before issuing imperative includePoints; DevTools camera completion did not update the old projection/scale via regionchange. Button/hit geometry are already derived together and need no expansion.
- Scoped change: Map JS adds same-generation/active/non-gesture camera-success reconciliation, invalidates obsolete region query, reads native scale and projects actual viewport through existing methods. Hooks existing includePoints overview/fallback and moveToLocation success; no new timer, camera destination, grouping algorithm, renderer, hit size or WXML/CSS change. New fixture suite/package; review.
- Official includePoints docs: native API fits supplied real points; DevTools does not support padding. getRegion reads current viewport. Success is not claimed as a phone animation-completion guarantee; existing regionchange settling remains authoritative when emitted.

### D1-anchor-revise (applied, targeted suites green, visible acceptance still OPEN)
- Live re-measure of the D1 candidate: mapScale 13 == native getScale 13; drawer projection screenX 151.17 / screenY 419.77 inside the 428x926 viewport (was -2663.12 / 2234.04), so the scale+projection half holds. Native centre still equalled the selected place (31.480139, 121.16402) with markersInside [true,false,true]: the overview did not hold.
- Root: the overview branch never re-binds latitude/longitude while WXML keeps mapScale/latitude/longitude controlled, so the first scale change (18 -> 13) re-applied the stale bound centre and pulled the fitted view back; the second change falls under the 0.05 threshold, which is why the symptom read as intermittent.
- Change, one file only: one-shot cameraAnchorPending set solely by the overview reason, consumed by the getRegion reply syncStackPositions already issues, centre merged into that same setData; both early returns clear the flag. No extra getRegion, no timer, no camera command, no WXML/CSS/coordinate/grouping/320ms change.
- Regression caught by existing assertions rather than relaxing them: deferring readMapScale failed 18 !== 13.8 (synchronous acknowledgement contract); a second getRegion failed 2 !== 1 (one query per acknowledgement); a comment naming a forbidden API tripped the source-text guard. Guard, fixtures and prior hash entries untouched. Chain d66fa296 -> 0da0d242 -> f0762588 -> dcc591b0 -> f70b865b.
- Exit 0 each: map-viewport (7/7 "7 viewport acknowledgement checks passed"), map-motion, map-save, map-empty, ui, secondary-ui, identity, visual-language, cloud. node --check OK, get_diagnostics 0 errors, git still 15 modified + 7 untracked, no commit, no push.
- NOT accepted as fixed: after a programmatic overview DevTools getRegion returned a stale viewport (before/after identical, span 0.43km, while mapScale moved 13 -> 18), and the trigger was a page method rather than a real tap. ui/d018-anchor-after-overview-programmatic.jpg (44798 bytes, 441x951) not yet human-read. Pending: Favorites -> All -> visible arrow -> open -> close -> reopen on the real interaction path; phone items remain.
- Outstanding in this long task: D1 visible acceptance, D2, D3, D4, D5, E, F1-F7, language/theme/Quiet matrix, device sizes, final full human-path replay, final npm run verify:all, final report.

### D1-fit-revise — the IDE overview never fitted at all (D1 decision: KEEP)
- Real tap path (.map-filter-button -> favorites -> all, i.e. onFilterPick -> recenter) measured bound-to-centroid 4.643 km with mapScale stuck at 18 and cameraAnchorPending false: the overview had not happened. The earlier anchor revision only adopted an unfitted viewport, so it could not have fixed the symptom on its own.
- Root: applyFilters' overview branch relies solely on includePoints (padding [90, 40, 165, 40], fail:()=>{}), while the focus path focusMapCamera already carries a devtools||cameraMoveUnavailable bound-props fallback. The IDE does not honour includePoints padding and the empty fail handler swallows the miss, so nothing ever expressed the fit.
- Change, one file (miniprogram/pages/map/index.js, f70b865b -> c59652d9, +30/-9): overviewLocalFit = overview && visible.length > 1 && cameraFitLocal(); when set, the centre of the same visible-point bounds joins the existing patch (still a single setData), and the acknowledgement reason becomes 'overview-bound-fit' so cameraAnchorPending is not armed and cannot re-assert a stale native centre. cameraFitLocal reuses the existing platform probe shape plus the cameraMoveUnavailable flag. Scale, grouping, fixed bounds, 320ms animation, WXML/CSS untouched; no new timer, no extra getRegion, no additional camera command.
- Same-path re-measure after compile: boundToCentroidKm 4.643 -> 0, anchorPending false, stackPositionsReady true, filter back to all. Two real taps on .pin-stack-toggle: clusterOpen false -> true -> false, so the visible control answers on the real input path and d001 does not reproduce on this build.
- Suites exit 0: map-viewport (7/7, including "DevTools one-point fallback keeps real target and receives the same reconciliation" and "...without a new timer or camera command"), map-motion, map-save, map-empty, ui, secondary-ui, identity, visual-language, cloud. node --check OK. No assertion, fixture or guard was edited.
- Not claimed as fixed: DevTools keeps mapScale at 18 because the IDE ignores the padding and the repo has no span-to-scale helper to reuse (grep for scaleFor/spanToScale/zoomFor/fitScale/scaleFromBounds: 0 hits; mapLayout only exposes project(coordinates, scale)), and inventing one would feed mapLayout.group and change clustering. Phone fit/padding and animation completion stay 「需要真实环境人工验收」. recenter() still hardcodes selectedId 'comptoir' and then falls back to the first visible memory, i.e. it changes the selection silently — that belongs to D3/F7 and was deliberately left untouched.

### D3 + F5 — recenter kept moving the selection; pending sheet hid six-of-eight (applied, suites green, visible re-measure BLOCKED)
- D3 finding: recenter() hardcoded selectedId 'comptoir' and applyFilters' fallback chain (preferredId || 'comptoir' || visible[0]) meant every Favorites -> All also changed which memory the card shows, i.e. a silent selection write behind an icon that reads as "back to my location". Measured on the real tap path: selection moved to the first visible record every time.
- D3 change (miniprogram/pages/map/index.js, c59652d9 -> current): keep the current selection when it is still in visibleIds, otherwise fall back to the previous 'comptoir' behaviour. Two lines; no camera, grouping, animation or WXML change.
- F5 root cause: wx.showActionSheet caps at six items and onFillLocation deliberately slices pendingLocations.slice(0, 6) with no batch indication, which is exactly the reported "8 pending but only 6 listed". Fix: alertText "6 / 8" when more remain (digits only, no new locale key, no invented copy); untouched when a single batch covers everything.
- Verification: node --check OK; map-viewport 7/7, map-empty, map-motion, map-save, ui 44/44, secondary-ui, identity, visual-language exit 0; cloud log 0 FAIL (its exit code was lost when the shared command terminal was interrupted, final verify:all will settle it). No assertion, fixture or guard edited.
- BLOCKED, not claimed: the visible real-tap re-measure of D3/F5 could not be read because the DevTools runtime dropped mid-sequence (automation_element_action -> cant find runtimeid by projectpath, ok:false). Initial-load probe after compile still reported pendingCount 8, so the batch label has data to show once the runtime is back.

### D3 real-tap acceptance (decision: KEEP) + F5 state (PARTIAL, native sheet needs human check)
- Reproduced with genuine element taps on the reported path: .pin-stack-toggle -> clusterOpen true; .pin-stack-row -> selectedId c09e0c6bfe, card "gggg", bound-to-centroid 3.957 km, scale 18. This is the report's child-selection state, captured before any reset.
- Then a real tap on .recenter-map: selectedId stayed c09e0c6bfe and the card stayed "gggg" while bound-to-centroid went 3.957 -> 0 km. Before this change recenter forced 'comptoir', i.e. exactly the reported "card flips to 食堂 while the view still reads as gggg"; the card/map pair now agree and the overview fits.
- Suite set re-run after the D3+F5 edit, exit 0 each: map-viewport 7/7, map-empty, map-motion, map-save, ui 44/44, secondary-ui, identity, visual-language; cloud log 0 FAIL lines. No assertion, fixture or guard edited.
- F5 stays PARTIAL: the "6 / 8" batch label lives in the native showActionSheet, which the DevTools automator cannot drive or capture reliably here; the app-side count (pendingCount 8, slice(0, 6)) is measured. Native sheet wording remains 「需要真实环境人工验收」.
- D2 explicitly not patched yet: any expansion-direction or height clamp touches geometry the existing fixture pins (hit box = rootTop - height - 89, hitWidth 44, screenX = projection.x - 44), so a new scoped clearance assertion against overlayTop must be added first; refused to change Map geometry without it.


## R2 continuation — 2026-09-18, scoped D2 / D4 / E / F1 / F5 candidates

The preceding sections are historical evidence, not a claim that the current work has full phone acceptance. Detailed scoped review, behavior contracts, red/green evidence and exact source/test hashes are in `docs/mcp-r2-change-review-20260918.md`; baseline guard reconciliation is in `docs/mcp-baseline-guard-review-20260918.md`.

- D2: preserves real root, fixed capacity and upward 320ms contracts; selects downward ink AND hit geometry when Search clearance is insufficient. Actual DevTools toggle/re-measure and inspected screenshot support the direction change; all phone/size claims remain separate.
- D4: evicts failed fallback cache entries only, for explicit later render retry; successful/single-flight/disposal behavior is covered by the new renderer suite. No second renderer and no original photo deletion.
- E: local Us collection is distinguished from explicit cross-account permissions. Added both-locale explanation and collection-only labels/toasts/FAQ; preserves Together/Journey/Shared Moments and user text.
- F1: native Reports title through the existing presentation helper, no new page dependency, no extra report build; visible-only title changes. Eight synthetic locale/theme/Quiet combinations and unchanged lifecycle suite pass.
- F5: replaces the historical partial 6/8 label-only mitigation with four-item pages plus Previous/Next within native six-entry cap. No real candidate/location is selected or saved.
- Historical fixtures, original assertions and applied-hashes ledger are unchanged. Active exact WXML hashes advance as follows (base checkpoint hashes in the manifest stay frozen):
  - `miniprogram/pages/map/index.wxml`: `4d03e236b35137acff22c18a7b55231cee64cae71094f703833df9d4f3f202cf`
  - `miniprogram/components/sheet/index.wxml`: `e01a92af08b6a8fa593234ee82d8d9e9d04630c380a43e22f621fe530520c330`
  - `miniprogram/pages/us/index.wxml`: `69c0d7964e1e05131aaae552fcc228524c7b32ebccec42fd6ffcf1c60f0a33ac`

### D2 integrated paging contract correction

The unchanged cloud suite caught duplicated paging material in the initial up/down template branches (3 occurrences instead of the required 2 including ordinary hits). Paging ink is now one common mounted native view; a position-only parent reconciles its downward coordinate, preserving the existing inner top/height expression and closing lifecycle. Neither historical assertion was changed. This avoids duplicate paging material rather than altering the test. Map WXML checkpoint `4d03e236b35137acff22c18a7b55231cee64cae71094f703833df9d4f3f202cf` is superseded by `bda4e28a23accbe6e56c0c974bbe0b0610efdd1d5c59d3b3082ace50dfe19f2f`. All other scoped hashes above are unchanged.

## Native matrix findings and follow-up (supersedes corresponding earlier hashes)

Executed 48 controlled REAL DevTools captures: zh-CN/en × Pearl/Dusk × Quiet on/off × Home/Map/Add/Us/Me/Reports, all at the actual queried 390×844 viewport. Used only the centralized store.updateSettings presentation keys (language/theme/reduceMotion), not fabricated Page data, simulated devices, identity bypass or private-record writes. Each transition checked memory/outbox/draft equality. Restored system/Pearl/Quiet-off with readback. These are controlled rendering observations, not claims of clicking the Settings menu or of four-device/phone acceptance.

Visual inspection found two concrete problems, not inferred from green tests: the new Us scope caption flowed inline beside the button; the English Reports poster still contained hard-coded Chinese, and Us displayed `1 days`. Follow-up makes the caption a separate block; primary statistic units choose singular at exactly one (zero/plural preserved); Reports summary copy handles singular units and English punctuation without changing report counts/builds. Poster and optional HTML rendering now receive locale explicitly, retaining default Chinese for legacy callers. User restaurants, notes and confirmed place names are not translated. HTML still escapes user strings and still emits details only when explicitly selected. No real export/share executed. New verify-report-locale starts RED on the English poster and passes after the fix, including 0/1/2 copy, escaped unchanged user fields and summary privacy. Unchanged lifecycle suite remains green.

F7 now uses the existing official map-pinned icon (not a new asset or animation) and `Show all mapped memories / 全览已定位的回忆` for the existing All-overview action. This removes the misleading GPS-navigation arrow without requesting location or changing camera/selection behavior. New exact icon/label/production-action regression was RED before, green after. Tab files and utensil branding are untouched.

Latest exact SHA-256 for this follow-up:
- `miniprogram/pages/home/index.wxml`: `d4252f1a986a47b3b83fe8d7c68e8c95f23bca55325bf45d7850efd26d29164b`
- `miniprogram/pages/me/index.wxml`: `311f7be86eb592003fa2689e7c802d349c3dbd547daaa0a92938fe117e22f744`
- `miniprogram/pages/us/index.wxml`: `3abe216ebf9f2a3e867d475ae51ea40812a98d5168eb08b201e83bd991e45adc`
- `miniprogram/pages/map/index.wxml`: `ca173a63045164de31b4bb0be53e05258be8fe281ac2feb0cd4cc6b1d0b8a00e`
- `miniprogram/pages/reports/index.js`: `17ec12dd96f8b4dbe5d16bee81adc0675f6a7fba25cb342039155fc6da59f9f5`
- `miniprogram/utils/secondaryUI.js`: `666b3af94fe0eaf1aac8bc3632a93a388ff5079804705611f6407c3a8d0bba8c`
- `miniprogram/utils/annualReport.js`: `6d420c748a7d7fa4e68f22d14d8b52e3ebcd9907dcd372a4cf8f1236a2498fd0`
- `miniprogram/utils/locales.js`: `1d3997559f9c8aec173895c37c362429f67b16bd7e71afaf309f03bb4b6f4985`
- `tools/lib/locale-translations.tsv`: `a4ad5e1b3cd7fa3a16f1faea28e3c740e13346bdd854abe2ecbfde5a2abd5d50`
- `tools/verify-report-locale.cjs`: `f935a73b7777b20f144b5757035376d5bfe2144322d240f17a7c613efb627abc`
- `tools/verify-map-overview-label.cjs`: `92bbdbac380819879ac2f2f5be22e68637b19c43c53bd5486339a33067da25af`

## R2 continuation: user phone-acceptance premise and boundary follow-up

The user explicitly instructed “默认真实手机已验收”. Phone acceptance is now a USER-SUPPLIED PREMISE, not an assertion that this agent ran phone tests. It does not convert CLI touch success, one viewport or missing F definitions into executed evidence.

D2: extended the existing production-geometry suite with 1,560 combinations across four synthetic widths (320/375/390/428), five visible root anchors starting at Search safeTop=208, child counts 1/3/4/7/17, every page, and six animation progress values. The original 31 checks remained intact. New fixed-frame containment assertions were RED for all four width groups: reflecting a paged hitTop=-4 extends the far edge 4px beyond the native frame. The fix reserves that four-pixel tail only for downward paged stacks, in both fixed-frame fields; native callout offset compensates equally. Root coordinates, 320ms animation, row positions, upward layout, photos and camera behavior are untouched. Bounds stay fixed through animation/pages. Expanded suite now 35 groups GREEN; original motion/viewport suites GREEN. This does not certify projected roots underneath the Search header, bottom-card clearance, or four native device sizes.

D4: strengthened the existing renderer harness, retaining original assertions, to cover canvas export failure, decode failure, successful explicit retry/caching, selected vs unselected keys, source replacement, no-photo IO avoidance and idempotent disposal. Six scenario groups pass without touching real files, photos, network or runtime data.

Live continuation: Home initially rendered without styles in both Windows capture and simulator screenshot. A normal simulator_refresh (no cache clearing) restored styles; no production stylesheet edit was made. A readback immediately after Map transitions was transient and is NOT acceptance evidence. Settled readback separately observed scale 13.63, positions ready, no gesture/animation, root/button top 346.82 vs safeTop 208. Actual nonpaged overview/open is available; native paged stress, drag/pinch and original-photo return remain tool-limited, not newly claimed passes.

Viewport discovery: current CLI has no resize/device action. Windows screenshot shows a real device picker, so the GUI capability DOES exist, but native click was refused by the foreground guard; the project's UIAutomation descendant tree was empty. No guard bypass, arbitrary desktop resize or wx API mock was used.

Draft investigation used only active identity/partition read APIs and readonly chunk decoding: current namespace matches configured and legacy namespace, active partition exists, its draft is null, identity draft is absent, legacy standalone draft and active quarantine draft are absent. loadDraft therefore returns the normal fresh default. This excludes a valid active 111 draft merely being hidden by form parsing. It cannot establish when/where historical 111 disappeared or which historical instance held it; no restoration, adoption or clearing occurred. Raw user IDs, records and photo URLs were not included in the diagnosis output.

F definitions: searched repository/history plus named Desktop/Documents/Downloads handoff files. Only the R2 handoff exists in Downloads; it still does not define F2–F4/F6. Those remain undefined, not guessed from unrelated historical documents.

Exact reviewed SHA-256 (supersedes prior hash for these paths):
- `miniprogram/pages/map/index.js`: `b08744802668c59975d4748c27e0a706cc89fb4c928317b46f45c54a76d540e8`
- `tools/verify-map-search-clearance.cjs`: `bedd2e735e4827d9eb5dba3dcaff8c8ed1d59061f41bcfea46a1f1ae7788b799`
- `tools/verify-map-photo-recovery.cjs`: `f80ba46616926c658b04a45cc95b9b5fa37ad8d2a33a093221eb81908bbde21b`

## Four native viewports and continuous replay: selected non-root child correction

Current authority is SAVOR-HANDOFF-20260917-R2.md by explicit user instruction; the old-file reference is no longer a prerequisite. Do not invent undefined F2–F4/F6 requirements. Phone acceptance remains user-supplied, not an agent-executed phone claim.

Completed 192 fresh controlled real-runtime captures: four actual IDE device profiles (320x568, 375x812, 390x844, 428x926) x zh/en x Pearl/Dusk x Quiet off/on x six pages. Each capture checks actual wx dimensions and presentation flags. Preference changes checked memories/outbox/draft equality and each device run restored preferences/Home. Reviewed 48 representative screenshots, not a claim of manually accepting every pixel of all 192. Device changes used genuine GUI menus with foreground/owner/PID checks, not mocked APIs or desktop resize. Activation by a verified native HTCAPTION click keeps all subsequent foreground guards intact. Owned menu bounds legitimately extend outside their parent; popup clicks still require the exact project owner chain and same process.

Native Memory -> original image -> return -> Memory -> Map was actually executed. A temporary identity-verifying screen appeared; waited for normal verification without bypass. Settled state restored the same selected memory, scrollTop=0/photoIndex=0 and real photo. Windows mouse pan/wheel did not change native region/scale and are NOT accepted. OS touch injection initially failed with invalid parameters; corrected contact id/mask and then obtained a changed native region for one-contact drag, and native scale 13 -> 14.13 for two-contact pinch. These are real IDE input effects, not phone tests or Page camera setters.

The continuous replay exposed a real D3/F7 hole: selected child 797e... reverted to e2e... on overview. visibleIds contains only native marker representatives, not all visible members. A new regression was RED (exit 1), then recenter was changed to also retain a selected member of an existing filtered marker group. It does NOT change visibleIds or marker-index routing, grouping, coordinates, camera requests, animation, data or Tab behavior. A missing/filtered-out selection retains the old fallback. Existing assertions retained, new child/missing-selection assertions GREEN. The 192 captures precede this handler-only correction; styles/templates/geometry are unchanged, while post-fix native replay and full regression separately validate the new behavior.

Latest exact reviewed SHA-256 (supersedes corresponding earlier values):
- `miniprogram/pages/map/index.js`: `b873f86b93c0dae3c86eaab7de365351d00553e9b8fb3fa3f3b020b6965eeb7c`
- `tools/verify-map-overview-label.cjs`: `516d8fe7b707f7961196c72f2ba6d1b89f5fb1bb068b2b23042c75beb29cf105`

## Native preview return: Map child selection regression

A real native path (guarded Windows mouse, not calling Page preview methods) opened the original photo viewer and returned through its native tap-to-close action. The existing same-owner identity verification correctly restored the Memory sheet and reading position, but Map.selectedId reverted to the default record while sheetMemoryId still referenced the chosen child. This was NOT classified as a pass.

Added verify-map-preview-selection.cjs RED before implementation: Map lacked the existing helper's restoreMemoryParent callback. The nine-line Map-only hook now runs from the unchanged same-owner/lease-verified memoryPreview helper. It ignores locked/hidden/disposed pages, closed/non-Memory sheets, removed/unmapped/filtered-out records and already-consistent selections. Otherwise it reuses applyFilters(query,filter,memoryId,'preserve') to restore the selected card/pin after verification. No private record snapshot, alternate identity flow, storage write, Tab change, extra renderer, animation or gesture timer is introduced. Query and filter are not reset. The original memoryPreview helper and historical fixtures remain unchanged.

New 12-case production-hook suite and unchanged 13-case Memory return suite pass. The new suite joins verify:r2 and verify:all. The four-size 192 capture matrix precedes this selection-only lifecycle fix; layout/templates are unchanged, and native post-fix return evidence is recorded separately rather than claiming every prior screenshot used this exact source version.

Exact reviewed hashes (superseding prior Map JS hash):
- `miniprogram/pages/map/index.js`: `1d8e1617fb01a22b96015b047eff244bc6835ac7cce0c8b021f1c99501a6457a`
- `tools/verify-map-preview-selection.cjs`: `70af284a6c13f3464e42731de711f50b1d0010d42d9249763da86c8f15d20a60`

## R2 follow-up: delayed native scale reply vs active gesture

Confirmed a production race with a new standalone executable contract before editing: readMapScale's asynchronous callback checked active/request identity, but not stackGesture or disposed; gesture begin also left the pre-gesture request valid. A delayed reply could therefore set the bound scale or regroup while a drag was active. New verify-map-scale-race was RED (3 passed / 4 failed), then GREEN (7 passed / 0 failed).

The narrow correction increments the scale request token at gesture begin and rejects scale requests/replies while dragging or disposed. The existing end-event reconciliation remains the single source of the new scale. No extra native query, timer, camera command, renderer or full setData loop; no coordinates, grouping algorithm, duration, Tab, storage or identity changes. Idle fractional precision, unchanged-group scale-only writes, open drawer state and legacy viewport acknowledgement timing are preserved. Existing motion and viewport suites pass unchanged. New test is included in verify:r2/verify:all and does not depend on reports.

This proves and fixes the delayed-reply race; it does NOT by itself prove that the earlier DevTools 13.63-to-13 observation has the same cause. That runtime observation remains separately tracked until replay establishes it.

Exact SHA-256 for this change (supersedes previous Map source hash):
- `miniprogram/pages/map/index.js`: `685c1a546f14dd25c3e8ab5e71d797404f806bea6bcacc0eeb20a79b3607357b`
- `tools/verify-map-scale-race.cjs`: `88436d42438f8e74b617d683f8105b6f3b5f44db35d9126620eb56f5203d32c3`

## R2 follow-up: fractional scale readback must not become a camera command

The delayed-reply guard passed the full suite (exit 0), but guarded native replay still reproduced overview 13.63 -> 13. A separate native wheel produced 13.32 with tracker 13. Calling production readMapScale with that actual native reading (diagnostic only, not a user-path acceptance) changed the tracker to 13.32 and the native camera to 13 without a further gesture. Evidence: r2-scale-echo-fractional-{before,diagnostic,after}.json. Thus the two issues are distinct. The template bound observational mapScale back into the camera input.

Added a source-and-template executable contract before editing: RED 2 passed / 2 failed. It observes actual production setData patches and the real WXML-bound field; it does not assume or mock integer truncation. Minimal fix separates immutable initialMapScale=13 from precise observed mapScale used for grouping. Existing imperative focus/includePoints stays unchanged. No rounding, extra camera command, query loop, timer, coordinate, grouping, drawer-duration, Tab, identity or storage changes. GREEN 4/4; unchanged race/motion/viewport suites also exit 0. Native post-fix replay is still required and reported separately.

Exact SHA-256 (supersedes previous hashes for these files):
- `miniprogram/pages/map/index.js`: `44637641496235e6e10074cb8d704b8922ea207645b34cec56ad81d8f1eac8c3`
- `miniprogram/pages/map/index.wxml`: `87b4d41878ec06c959fbecbac3e332dda8c34d6d9103909e0da568ed3da2bf4a`
- `tools/verify-map-scale-echo.cjs`: `4811fc0cf8753c31ef955505ffb5966d0ba20d3ede2b6dbb317a55dc9660b002`

## R4 local presentation review — 2026-09-19

See docs/mcp-arena-r4-local-refinement-review-20260919.md for red/green scope and exact versions. Registry keeps this canonical review path. Memory raw restaurant identity and queue-sensitive existing retry button retain all original events; Map removes only the prohibited whole-map night veil, preserving camera and native markers. No historical assertions changed.

## R5 byte-review reconciliation

Reviewed the R4 hunks against current disk bytes; corrected two WXML hashes that omitted the terminal LF, and registered the two narrow CSS changes through existing exact-byte visual reviews. See `docs/mcp-r5-byte-review-20260919.md`. Historical fixtures and every verify-cloud assertion remain unchanged. Native acceptance is separate.
