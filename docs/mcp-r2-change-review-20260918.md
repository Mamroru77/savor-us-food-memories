# R2 scoped change review — 2026-09-18

Authority: user requested the complete R2 order without intermediate notifications or new questions. This review records scoped candidates and actual tests; it is not phone acceptance. HEAD remains 2b162558deca71e68021d89e2a4005b359bb540c; no commit/push/deployment or real business mutations.

## Baseline

Initial full suite exit 1 was the retained Me A integration versus a pre-A non-menu equality check. docs/mcp-baseline-guard-review-20260918.md documents the exact fail-closed source projection, original fixture SHA and negative mutation tests. All historical assertions remain; no fixture is edited. Reconciled full baseline exit 0, 46804ms: reports/ux-remediation-20260917/r2-full-baseline.{log,exit}.

## D2

The added production-function clearance suite initially failed 18 of 31 cases, and a real DevTools toggle put its hit top 155.05 below the safe threshold 208 (overlapping Search). It now passes 31/31, including exact root preservation, native/hit equivalence, frame containment and 320/375/428 widths, progress, capacity and short pages. Existing map-motion and map-viewport assertions were not edited and both exit 0.

Downward orientation is selected against FULL frame capacity at camera settlement, before opening. mapStack.layout and upward geometry are unchanged. mapStack.orient reflects slot positions and button geometry, not the photo pixels. The root's screenY, coordinates, rootTop-height=-89 and width/320ms contracts remain intact. Native downward content uses a fixed frame with root at top and positive anchorY compensation of frameHeight-89. Same keyed ordinary hits retain the original projection expressions. Only changed native anchorY leaves are patched on settlement/direction change, never during the animation or active drag. Row and button frame patches are bounded. No regroup, new camera command, coordinate rewrite, high-frequency full setData or second renderer.

Before/after same Map interaction evidence: r2-d2-tap.json, r2-d2-after.jpg, r2-d2-geometry.json. Inspected after screenshot: root remains in place, child below and toggle clear of Search. Readback down=true, nativeOffset=calloutOffset=141, rootScreenTop=333, buttonTop=523, safeTop=208. Native root anchoring matches the independent screen/hit model. Bottom card clearance and all device sizes still require matrix evidence; 31 synthetic cases alone do not certify all physical viewports.

## D4

Reproduced a transient image-info failure becoming a permanently ready fallback: r2-d4-red.log. The renderer now removes ONLY the failed promise/ready cache entries; a later existing render request retries. Successful composites remain cached, in-flight work is single-flight, disposal cancels publication and only owned temporary exports are removed. No original photo/storage mutation, timer loop, new canvas or second renderer. New production renderer suite passes recovery, late disposal, temp cleanup and fresh-renderer reconstruction. This addresses the reproduced mechanism, not an unobserved phone symptom.

## E capability → copy

| Existing operation/state | Actual capability | Visible expression |
|---|---|---|
| Memory shared flag / Us filtered collection | Owner diary categorization, not proof of another member's permission | Show in Us / In Us; explicit collection-only caption |
| Remove shared flag | Removes from this collection; does not revoke separately granted space access | Toast explicitly says space access is unchanged |
| Space page membership/publishing | Separate consent, online authorization and explicit sharing | Existing Manage shared space entry and services retained |
| Profile partner text / Together | Local user-entered relationship label; not authenticated membership | Preserved user text, no invented connected status |

The former FAQ incorrectly said binding/sending were not enabled despite the separate Space workflow; replaced with accurate separation of collection and explicit shared-space controls. Both locales updated via TSV and its generated catalog, preserving every user restaurant/note field and Together/Journey/Shared Moments. No real Share/Love/Like/invite/accept/bind action is exercised.

## F1 / F5

F1 native title: presentation helper already owns i18n, so Reports supplies an optional title key only while visible. No new Reports import; the historical lifecycle harness rejects unlisted dependencies, explaining why adding a new page i18n dependency is incompatible with that harness. Eight new locale/theme/Quiet combinations enforce the title, two report builds per show, hidden refresh noninterference, identity redaction and unchanged user text. Red before change; green after; unchanged verify:page-lifecycle exit 0 (8 checks). This does not claim all remaining grammar issues fixed.

F5 pending list: new suite failed 6 !== 8 before change. Four records plus Previous/Next stay within native six-entry capacity; range label names the page and every item is reachable without saving a location. Re-check active state, identity lease and item presence before choosing. Counts 0/1/6/8/17, forward/back navigation and stale identity all pass. Native sheet/phone behavior still requires native acceptance; no live pending restaurant was selected or saved.

## Review chain and discipline

Historical fixture files, applied-hashes history, Tab implementation, draft namespaces, Add draft 111, identity/OPENID/private storage, and VID_1.mp4 are untouched. The active WXML review manifest retains original base hashes and advances only exact current hashes for scoped D2/E changes. Prior WXMLs were map=dce706a162fdffe61892ff2accd3f12bbe087242f62ba4236a4c7605a647d844, sheet=97b7dca3483f585f91699ce459b6191f5e7dafcffb3c9e5c0c38067cca993ad1, us=8acb3506057d7af2bc27f0555d45e65d728c4903dd130fb386b6f9be3aceb866. Tests are registered in verify:all via verify:r2 and depend only on nonignored source/test files, never reports.

## Exact current SHA-256

- `miniprogram/pages/map/index.js`: `24050863098c04480735d93fbbfeba18c2ae8715c25fd2b9aa3f4346bbfc0a24`
- `miniprogram/pages/map/index.wxml`: `4d03e236b35137acff22c18a7b55231cee64cae71094f703833df9d4f3f202cf`
- `miniprogram/utils/mapStack.js`: `b0d82521780e73efc5d66b64475c41268cf2d9913363d8e392e7dfc86fd97737`
- `miniprogram/utils/mapMarkers.js`: `33f3e3259d06b2dbec8aecf4d530deabc28fc360642e8e4018410421235c5663`
- `miniprogram/components/sheet/index.js`: `0b29a14a9f53db6d456bebcb5a3dc69d16167404ff7a6378909af82328602c9a`
- `miniprogram/components/sheet/index.wxml`: `e01a92af08b6a8fa593234ee82d8d9e9d04630c380a43e22f621fe530520c330`
- `miniprogram/pages/us/index.wxml`: `69c0d7964e1e05131aaae552fcc228524c7b32ebccec42fd6ffcf1c60f0a33ac`
- `miniprogram/pages/reports/index.js`: `44e18342fa91a0f1fd68f32a9e8a17a0f2c0cbd769dd85eade70f29b8952368e`
- `miniprogram/utils/secondaryUI.js`: `34d680354754207b24e55a2160e9cac4a8534afbc531041366d6f29e144b8e76`
- `miniprogram/utils/locales.js`: `bd511bb938f3f44cabc2394e529b29ee9b76f7b0f6f767a5a632c90166138e46`
- `tools/lib/locale-translations.tsv`: `edb41261c2a29b5bf05b6d16c5a9f91d1740503f1f5ec176bdd4bb7224be42db`
- `tools/verify-map-search-clearance.cjs`: `fe7d0f84768e12536b9156f94adaf6da7ecc523a3747eeec5a6551defdeb207b`
- `tools/verify-map-photo-recovery.cjs`: `e0b54513ada76deb295bbacea62f223ff065038f797c2cf960094c734440c38e`
- `tools/verify-sharing-copy.cjs`: `efdd1fe861c0f331bdcb750f8fbf90872ff58e5fbdc31ceddba86219668dc61f`
- `tools/verify-reports-title.cjs`: `d8e1b0e20ce8fa1619408cd9c9cc139cc3669c97996e090e6a2328dd9b298a77`
- `tools/verify-pending-pagination.cjs`: `396c705aa2bea8ff3e03b078d2943b7553c8a39f03cc8769546038807e5e4aac`
- `tools/verify-menu-copy.cjs`: `3580b8365b1c55546b10faf76b3d012ef15611c56574f5091d679c4b6b9d180e`
- `tools/lib/reviewed-me-memory-return.cjs`: `31879bd17c43a7ddc4950c10968c4dabfcd8b167d5ec95aeeecdc992e4f788b0`
- `tools/verify-me-review-contract.cjs`: `2d9f92844b6a8bf6a4582203380e284a8682bc9ac1c3cfd9d07d7ac36ecdea60`

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
