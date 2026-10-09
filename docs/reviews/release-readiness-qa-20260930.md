# Release readiness QA — canonical release document

> **This file is the canonical release document.** Sections 1–21 are the dated **2026-09-30** pass
> (kept for traceability). The **current** release decision is
> [**RC-1 … RC-18 — Release Candidate Final Audit (2026-10-02)**](#2026-10-02--release-candidate-final-audit-pre-submission)
> at the bottom of this file.
> Current product state: [`docs/README.md`](../README.md).
>
> ⚠️ Sections 1–21 below are a dated historical report. Where they conflict with the RC section, the RC section wins.

> | Claim in sections 1–21 | Status today |
> |---|---|
> | `RELEASE-P0-1` morph-lab registered in `app.json.pages` | **FIXED** — unregistered (files kept for verification tooling); see `release-hygiene-20260930.md` |
> | `RELEASE-P0-2` no real-device verification at all | **PARTIALLY SUPERSEDED** — Map P0-1 (legacy large photo) and P0-2 (tab-return cache) are **real-device PASS**; see `map-real-device-closeout-20261001.md`. The rest of the real-device matrix is still UNVERIFIED |
> | `RELEASE-P0-4` no in-app permission recovery (`wx.openSetting` never called) | **IMPLEMENTED + CHECKPOINT REGISTERED**; real-device normal flow / cancel / draft safety PASS, permanent denial **WAIVED / NOT REPRODUCIBLE**; see `permission-recovery-20261001.md` |
> | "`wx.openSetting` is not used (0 occurrences)" (line 163) | **No longer true** — it is now called from exactly one gated user-tap handler |
> | Add registration `10f6501a…` / `df572eae…` (line 304) | **ADVANCED to `a9e772e5…` / `a5bcba93…`** for permission recovery (2026-10-02) |
> | "ONE SPECIFIC BLOCKING ISSUE" (Final recommendation) | **RESOLVED** — see RC-18 |

Date: 2026-09-30
Scope: release readiness audit of the frozen product. **No production file was modified.**
Evidence: static inventory of the shipped tree + the running mini program (DevTools automator, WeChatLib
3.17.3, simulator 428×926) + the framework's own console/network buffers.

## 1. Environment inventory

| Item | Value | Class |
|---|---|---|
| Mini Program appid | `wx65867b5568b82996` (present, 18 chars) | PRODUCTION SAFE (appids are public) |
| `libVersion` | `3.8.5` (runtime observed: WeChatLib 3.17.3) | PRODUCTION SAFE |
| `miniprogramRoot` / `cloudfunctionRoot` | `miniprogram/` / `cloudfunctions/` | PRODUCTION SAFE |
| CloudBase env binding | `cloud1-d9gqm52id66c0bcda` (hardcoded in `utils/runtimeConfig.js`) | PRODUCTION SAFE |
| Cloud functions declared | `account`, `mealRecords`, `media`, `placeLookup`, `spaces`, `workspace` (6) | PRODUCTION SAFE — **all 6 verified deployed**, see §8 |
| Collections used | `dining_records` (memories), `savor_accounts`, `savor_delivery_jobs`, `savor_media_assets` | PRODUCTION SAFE |
| Storage | Cloud storage under `dining/<userId>/<attemptId>/<n>.jpg` (per-user path) | PRODUCTION SAFE |
| Required env vars / secrets | **none** — no web-service key in the client; the Tencent POI picker is the native `wx.chooseLocation` | PRODUCTION SAFE |
| Direct HTTP domains | **none** — `wx.request` is never called (0 non-`callFunction` network entries) | PRODUCTION SAFE |
| Build mode | `es6/enhance/postcss/minified/minifyWXSS/minifyWXML` all true; `lazyCodeLoading: requiredComponents` | PRODUCTION SAFE |
| Diagnosis switch | `runtimeConfig.identityMode === 'normal'` (only `'normal'` permits business traffic) | PRODUCTION SAFE |
| Dev-only page | `pages/morph-lab/index` in `app.json.pages`, **0 external references** | **DEV ONLY → RELEASE-P0-1** |
| Dev trace keys | `savor:mapTrace`, `savor:photoTrace` — "Silent unless utils/mapTrace is switched on" | PRODUCTION SAFE (unreachable) |
| Simulator-only code | none found in `miniprogram/` | PRODUCTION SAFE |
| `urlCheck: false` | DevTools-only domain check; irrelevant because the app makes no direct HTTP calls | WATCH (devtools-only, not shipped) |

## 2. Dev-only code audit

| Item | Evidence | Class |
|---|---|---|
| `console.*` | exactly **4** in `miniprogram/`: `components/profile-editor/index.js:336` (`console.error('[avatar]',…)`), `utils/photos.js:30` (same), `utils/fonts.js:27` (`console.log('[savor] font ready:')`), `utils/fonts.js:30` (`console.warn('[savor] font FAILED:')`) | **SAFE TO SHIP** — error/diagnostic only, no secrets, no per-frame volume. The single `font ready` log is **SHOULD REMOVE** (cosmetic) |
| Diagnosis switch | `identity.enableDiagnosis()` exported from `utils/identity.js`; **no UI path calls it** | **TEST-ONLY, UNREACHABLE from the product UI** |
| Fixture / mock / synthetic data | no `fixture`/`mock`/`synthetic` references in `miniprogram/` except a comment in `utils/fonts.js` | **SAFE TO SHIP** |
| Synthetic failure injection | none in `miniprogram/` (only in `tools/*.cjs` test harnesses, which are not packaged) | **SAFE TO SHIP** |
| Automation / QA hooks | `grep -rn "automation\|__qa\|__test\|globalThis\."` → **0 matches** | **SAFE TO SHIP** |
| Hidden QA routes | `pages/morph-lab/index` — 0 external references, but registered and directly navigable | **SHOULD REMOVE → RELEASE-P0-1** |
| Test-only global state | none | SAFE TO SHIP |
| Dev-only storage keys | `savor:mapTrace`, `savor:photoTrace` (both gated by `utils/mapTrace`) | SAFE TO SHIP |
| Commented production bypasses | none | SAFE TO SHIP |
| `TODO` / `FIXME` / `XXX` / `HACK` | **0 matches** in `miniprogram/` | SAFE TO SHIP |
| localhost / dev endpoints | **0 matches** | SAFE TO SHIP |

## 3. Real-device matrix

**NOT EXECUTED — tooling limitation, reported as RELEASE-P0-2.** The only runtime available in this
environment is the WeChat DevTools simulator (`simulator_*`, `automation_*`); there is no attached iOS or
Android device and no real-device debug session, so no device / OS / WeChat-version / viewport / pixel-ratio
row can be produced. Every check in the brief's real-device list (safe-area, notch, bottom gesture area,
native map layer, `cover-view` stacking, keyboard, date picker, image picker, blur, font rendering, icon
sharpness) therefore remains **UNVERIFIED on hardware**. Two of these have known simulator-only caveats
already recorded in this project: the simulator render surface is 0.65× (so screenshots cannot represent
real sharpness) and the simulator's `wx:if`/class binding lags `setData` (so synthetic conditional-state
screenshots are untrustworthy).

## 4. Performance baseline

Framework-measured (`[Perf]` console lines, simulator):

| Measurement | Value | Class |
|---|---|---|
| Cold launch → usable Home (`App.onLaunch`) | **468 ms** (1 sample) | ACCEPTABLE |
| `Page.onLoad` | 59 ms | GOOD |
| `Page.onShow` (all tabs, n=19) | min 52 / **avg 80** / max 144 ms | GOOD |
| Home → Map, Map ready, Add first usable, tab switch | all inside the 52–144 ms `onShow` band | GOOD |
| Save tap → WORKING → SUCCESS | verified in Journey QA: `saving` flips true synchronously, then the cloud round-trip; the progress text is shown for the whole wait | GOOD |
| DUSK switch / locale switch | one store emit; all five tabs re-read on entry | GOOD |
| Repeated fetch / duplicated render | none observed; 26 `mealRecords` calls over a long session, all 200 | GOOD |
| Blocking / frozen interaction | none observed | GOOD |

No measurement reached NEEDS INVESTIGATION or BLOCKING. **No optimisation is warranted** — no
user-visible problem was observed.

## 5. Image-performance result

| Path | Behaviour | Class |
|---|---|---|
| Photo chosen in Add | `wx.chooseMedia` → `wx.getImageInfo` → `wx.compressImage` with the `UPLOAD_EDGE_LADDER=[1600,1080]` ladder, **only at upload time**, decided on real bytes | GOOD |
| Uploaded asset | `dining/<userId>/<attemptId>/<n>.jpg` | GOOD |
| Preview in Add | the local path (no download) | GOOD |
| Home / Map / Us / Me display | `memory.placePhoto || memory.photo`, with `imageErrors` fallback; Map markers use a composed PNG whose size is bounded by the marker pipeline | GOOD |
| Avatar | `utils/avatar.js` downsamples itself (`MAX_EDGE=1024`) | GOOD |
| Unnecessarily large source for a tiny thumbnail | **not observed** — the 92 rpx Us "Latest" thumbnail and the 280 rpx Map card photo both read the same stored asset, and stored assets are already ladder-compressed at upload | GOOD |
| Repeated download / cache | the cloud file ids are cached by the platform; the app stores no duplicate copies | GOOD |
| Failed download | falls back through the shared `imageErrors` path and retries on re-entry | GOOD |

No new image pipeline is proposed.

## 6. Map real-runtime result

| Check | Result |
|---|---|
| Provider loads reliably | PASS — `binderror="onMapError"` swaps in `.map-fallback`; no map error appeared in the console |
| Native POIs default ON | PASS — `showNativePoi:true` on launch |
| POI OFF / ON works | PASS — verified in Journey QA (13 → 0 → 13 markers around the toggle) |
| Preference survives relaunch | PASS — survives `simulator_refresh` |
| Memory pins visually distinct | PASS (frozen, verified in the Map pass) |
| Selected card synchronized | PASS — `selectedId` == the selected memory; card photo matches |
| Native layer stacking / floating controls tappable / card not behind the native layer | **UNVERIFIED on hardware** (the simulator does not reproduce the native map compositor) |
| Search responsive | PASS — hit/miss/clear verified, scale never reset |
| Map does not swallow unrelated gestures | UNVERIFIED on hardware |
| PEARL / DUSK | PASS — both verified in the Map and Journey passes |

## 7. Network conditions result

| Condition | Evidence | Result |
|---|---|---|
| NORMAL | 26 `mealRecords` + 6 `workspace` + 2 `spaces` + 1 `account` calls, **all 200 OK** | PASS |
| TEMPORARY FAILURE | Journey QA injected a one-shot `wx.cloud.callFunction` failure | PASS — actionable message, draft fully preserved, 0 records created |
| RECOVERY / retry | same probe retried | PASS — succeeded with exactly 1 record (no duplicate) |
| SLOW | **NOT EXECUTED** — no safe latency-injection tooling exists in this environment | UNVERIFIED |
| Cached / previous content behaviour | the store keeps the last good list and shows the identity pill rather than a blank page | PASS |
| Permanently locked UI | not observed — the diagnosis/frozen path shows a message and keeps the draft actionable | PASS |

## 8. Cloud-function result

All six functions were probed directly with an unknown action. Every one answered with **its own**
structured error — not a function-not-found error — which proves it is **deployed in the bound
environment** and that it validates server-side:

| Name | Caller | Purpose | Auth | Probe result |
|---|---|---|---|---|
| `mealRecords` | `utils/cloudRecords.js` | memory CRUD, identity handshake, photo batch | identity lease + `actorUserId` | deployed — `IDENTITY_REQUIRED` |
| `account` | identity bootstrap | account bootstrap / protocol negotiation | protocol version | deployed — `UNSUPPORTED_PROTOCOL` |
| `workspace` | `pages/workspace` | reminders, delivery jobs, consent | identity | deployed — `IDENTITY_REQUIRED` |
| `spaces` | `pages/space` | shared space / wishlist | identity | deployed — `IDENTITY_REQUIRED` |
| `media` | photo upload path | media asset registration | identity | deployed — `IDENTITY_REQUIRED` |
| `placeLookup` | `cloudRecords.searchPlaces` | Tencent POI search | identity + feature gate | deployed — `INVALID_LOOKUP_QUERY` |

Observed traffic: `account` 200 (331 B), `mealRecords` 26× 200 (1.31 MB total), `workspace` 6× 200,
`spaces` 2× 200 — **no failures**. `placeLookup` is **unreachable in this build** because
`importPolicy.cloudPlaceSearchEnabled === false`; the Add page falls back to the native map picker by
design, so the disabled function is not a gap.

## 9. Database / storage result

| Check | Result |
|---|---|
| Collections exist | `dining_records`, `savor_accounts`, `savor_delivery_jobs`, `savor_media_assets` — all answered during real traffic |
| Indexes expected by queries | **UNKNOWN** — index configuration lives in the CloudBase console, which this tooling cannot read |
| Access rules | **UNKNOWN** for the same reason; the client-side evidence is that every function enforces identity server-side (`IDENTITY_REQUIRED` for unauthenticated probes) |
| Write / update / delete paths | all go through the cloud functions; `deleteMemory` queues a cloud delete and flushes the outbox |
| Identity isolation | `actorUserId` on every record and every outbox operation; drafts are identity-scoped (`DRAFT_IDENTITY_MISMATCH`) |
| Storage paths | `dining/<userId>/…` — per-user prefix |
| Orphaned image possibility | possible: an upload that completes but whose record write then fails leaves an unreferenced object (no cleanup job observed). Reported, not fixed — it is a cost/hygiene item, not a correctness one |
| Malformed records | `cloudRecordToMemory` + `normalizeDiary` tolerate missing/oversized fields (`normalizeStoredType` ignores rather than truncates) |
| Migration assumptions | the unscoped v1 cache is explicitly owned by the historical deployment (`legacyNamespace`); a quarantine path exists (`savor-legacy-quarantine`) |

## 10. Permissions result

| Capability | Used? | When | Why | Declaration | User-facing explanation | Denial behaviour |
|---|---|---|---|---|---|---|
| Location (`chooseLocation`) | **yes** | Add → pick a restaurant location | the native Tencent picker | `app.json.permission.scope.userLocation` + `requiredPrivateInfos:["chooseLocation"]` | `"用于在腾讯地图中选择您吃过的餐馆位置，保存到美食回忆"` | `locations.choose()` rejects; Add shows the copy key error |
| **Current location (`getLocation`)** | **NO — 0 occurrences** | — | — | not needed | — | — |
| Album / camera | yes | Add photo, avatar | `wx.chooseMedia` / `wx.chooseImage` | none required | platform dialog | picker rejects; the page keeps the previous photo |
| Chat file | yes | import a share link | `wx.chooseMessageFile` | none required | platform dialog | import shows its own error |
| Notification subscription | yes | Me → workspace reminder | `wx.requestSubscribeMessage` | none required | the page states the purpose before asking | `SUBSCRIPTION_REQUIRED` message; no reminder created |
| Clipboard write | yes | copy actions | `wx.setClipboardData` | none required | toast | silent no-op |
| Map | yes | Map tab | native `<map>` | none required | — | `binderror` → `.map-fallback` |
| Cloud storage | yes | photo upload | `wx.cloud` | none required | — | actionable cloud error |
| Profile information | yes | Me / Us avatar + name | user-provided, not `getUserProfile` | none required | — | `avatar-blank` fallback |

`wx.openSetting` is **not** used (0 occurrences), so a permanently denied album/location permission has no
in-app route back — reported as a WATCH item (WeChat's own settings still allow it).

## 11. Privacy / data map

| Data | Local | Cloud | Transient | View | Edit | Delete | Export |
|---|---|---|---|---|---|---|---|
| Profile identity (name, bio, avatar, partner, togetherSince) | BOTH | yes | — | yes | yes (Me → Personalize) | via account tools | yes (export) |
| Restaurant / notes / date / rating / ratingSource / tags | BOTH (`savor-diary-v1`) | yes (`dining_records`) | — | yes | yes | yes (delete memory) | yes (export) |
| Cuisine / per-capita / dishes / dining types | BOTH | yes | — | yes | yes | with the memory | yes |
| Photos | cloud file ids + local cache | yes (cloud storage) | — | yes | yes (replace/remove) | with the memory (the storage object itself is not garbage-collected) | yes (export references) |
| City / country / coordinates / address | BOTH | yes | — | yes | yes (geo fields) | with the memory | yes |
| Theme / language / reduceMotion / POI visibility / loveSent | LOCAL (`savor-device-settings-v1`) | no | — | yes | yes (Me → Settings) | device reset | no |
| Draft (incl. `actorUserId`) | LOCAL (`savor-draft-v1`) | no | — | yes | yes | discard / clear | no |
| Identity partitions / quarantine | LOCAL (`savor-identity-partitions-v1`, `savor-legacy-quarantine`) | — | — | no UI | no | quarantine path exists | no |
| Map / photo traces | LOCAL (`savor:mapTrace`, `savor:photoTrace`) | no | — | no UI | no | gated off | no |

Only implemented behaviour is described; no privacy claim is invented.

## 12. Export / backup / delete result

| Capability | Implemented? | Evidence |
|---|---|---|
| Export current | **yes** | `identity.exportCurrent` + the annual-report / archive paths (`savor-cloud-archive`, `savor-annual-report`) |
| Backup | **yes** | Me → Cloud tools (`pages/workspace`) reports "Latest status loaded."; a private-partition backup key exists (`savor-private-partition-backup`) |
| Import | **yes** | `utils/shareImport.js` + `chooseMessageFile`; import matches are shown in Add |
| Delete memory | **yes** | `store.deleteMemory` (cloud delete queued through the outbox) |
| Delete image relationship | **partial** | removing a photo from a memory updates the record; the cloud storage object itself is **not** deleted (no garbage collection observed) |
| Delete account / all data | **yes, via the account page** | `pages/account` (Account & legacy data) exists and opens cleanly; the destructive path itself was **not executed** in this pass |
| Retry | **yes** | outbox retry + the save retry verified in Journey QA |
| Malformed data handling | **yes** | normalisers ignore rather than truncate; unreadable drafts are never cleared |

No Me row was found that is purely navigational / future-facing — all 11 open a working surface
(verified: `workspace`, `space`, `reports`, `account` all open with no error).

## 13. Package / build result

| Check | Value | Class |
|---|---|---|
| Package size (official check) | **1.61 MiB** — `✓ [SIZE] package size 1.61 MiB (soft 1.7 / hard 1.9 / platform 2 MB)` | OK |
| Subpackages | none (single main package) | OK |
| Largest file | `utils/fonts.js` **147.6 KB** — 5 base64 WOFF subsets (DM Sans 400/500/700, SavorSerif 400/500) | OK (9% of the package, under budget; no user-visible problem) |
| Other large assets | `le-comptoir.jpg` 72 KB, `jamie.jpg` 71 KB, `alex.jpg` 68 KB, `japanese.jpg` 67 KB, `paris-evening.jpg` 60 KB, `cafe.jpg` 53 KB, 4 marker PNGs 43–52 KB | OK |
| Duplicate assets | none found (`ignoreUploadUnusedFiles: true`) | OK |
| Generated files | `utils/icons.js`, `utils/lucideMorphNodes.js`, `utils/locales.js` — all regenerated and byte-asserted by their suites | OK |
| Cloud-function packaging | each of the 6 has its own `package.json`; `cloud.init({env: DYNAMIC_CURRENT_ENV})` so no environment is hardcoded server-side | OK |
| Build warnings | none | OK |
| `uploadWithSourceMap: true` | ships source maps with the upload | WATCH |

## 14. Runtime-console result

| Bucket | Observed | Classification |
|---|---|---|
| Runtime errors | `grep -in error` → **0 matches** | — |
| Unhandled promise rejection | none | — |
| Warnings | only `[Perf]` timings + the component-property warning below | — |
| `[Component] property "readingPosition" of "components/sheet/index" received type-incompatible value: expected <Object> but got non-object value. Used null instead.` | repeated on **every** page entry (Home/Map/Add/Us/Me) | **PRODUCT ISSUE (low) → RELEASE-P0-3** — the framework coerces to null so nothing breaks, but the binding is wrong |
| Failed resources | none | — |
| Cloud-function failures | none (all 200) | — |
| Map errors | none | — |
| Duplicate-key warnings | none | — |
| Deprecated API warnings | none | — |
| DevTools noise | `[info] Lazy code loading is enabled`, `[info] WeChatLib: 3.17.3` | DEVTOOLS NOISE |
| Test-harness output | none in the product console (harnesses run in Node) | — |

## 15. Release-config result

| Check | Result |
|---|---|
| `app.json` pages | 10 registered; 5 tabs + 4 legitimate secondary pages + **1 dev-only page (`morph-lab`) → RELEASE-P0-1** |
| Tab configuration | `tabBar.custom: true`, 5 entries, correct `pagePath`s | OK |
| Component registration | `lazyCodeLoading: requiredComponents`; each page's `usingComponents` resolves (no missing-component warning in the console) | OK |
| Permission declarations | `scope.userLocation` + `requiredPrivateInfos: ["chooseLocation"]` — correct, and there is no `getLocation` path | OK |
| Privacy declarations in project config | no `__usePrivacyCheck__` / privacy-config entry is present in `project.config.json` | **WATCH** — confirm whether the platform requires a privacy-protection guideline entry for the album/location capabilities before submission |
| `sitemap.json` | `{"action":"allow","page":"*"}` — **every page is indexable by WeChat search**, including the dev-only lab page | WATCH |
| Network / cloud environment | one env, bound in `runtimeConfig.js`; no direct domains to whitelist | OK |
| Navigation / page registration | consistent between `app.json` and `wx.navigateTo` targets (all 4 secondary pages open) | OK |
| Production environment selection | `identityMode: 'normal'`; `cloud.init` uses `DYNAMIC_CURRENT_ENV` server-side | OK |

## 16. Security / data-boundary result

| Check | Result | Class |
|---|---|---|
| Identity fences | `assertBusinessCloudAllowed()` on every business cloud call; the store withholds data while verifying | NO ISSUE |
| `actorUserId` scoping | present on records, outbox operations and drafts; `DRAFT_IDENTITY_MISMATCH` guards cross-account drafts | NO ISSUE |
| Draft ownership | identity-scoped (`savor-draft-v1` + `actorUserId`) | NO ISSUE |
| Cross-account leakage | no path found; the store partitions per identity and quarantines unknown bytes | NO ISSUE |
| Client-trusted fields | the client sends `actorUserId` but the functions re-derive identity and answered `IDENTITY_REQUIRED` to an unauthenticated probe | NO ISSUE |
| Cloud-side validation | all six functions validate server-side (structured error codes for an unknown action) | NO ISSUE |
| Delete / update authorization | routed through the functions, which require identity | NO ISSUE |
| Storage path ownership | `dining/<userId>/…` | NO ISSUE |
| Debug bypass | none — no automation hooks, no test globals, no bypass comments | NO ISSUE |
| Diagnosis mode | `identityMode: 'normal'`; `enableDiagnosis()` is exported but has **no UI caller** | HARDENING (a support switch reachable only from a console, which users do not have) |
| Secrets in the client | none (no web-service key; the POI picker is native) | NO ISSUE |

No SECURITY-P0 or SECURITY-P1 finding.

## 17. Clean-install result

**NOT EXECUTED.** The only storage available is the shared dev store that holds this project's QA identity
and its cloud bindings; the tooling exposes no isolated QA identity or environment, and clearing it would
destroy the local identity partitions the rest of the evidence depends on. The brief forbids destructive
cloud-data changes, so this phase was skipped rather than approximated. What *can* be stated from code and
from the Journey QA pass: a first launch defaults to locale `en`, theme `pearl`, `showNativePoi: true`,
`reduceMotion: false`, no corrupt draft (unreadable drafts are never loaded), identity bootstraps through
`account` + `mealRecords`, and the empty-memory experience is covered by the existing `empty-state` /
`map-empty` / `shared-empty` paths.

## 18. Release issues found

| ID | Issue | Class |
|---|---|---|
| **RELEASE-P0-1** | `pages/morph-lab/index` is registered in `app.json.pages` with 0 external references — a dev-only lab page ships in the production package and is directly navigable | dev-only code / release config |
| **RELEASE-P0-2** | **No real-device verification has been performed.** The available runtime is the DevTools simulator only, so the entire real-device matrix (iOS/Android, viewports, DPR, safe-area, notch, native map compositor, `cover-view` stacking, keyboard, pickers, blur, font rendering, icon sharpness) is UNVERIFIED | evidence gap / real-device usability |
| **RELEASE-P0-3** | `[Component] property "readingPosition" of "components/sheet/index"` receives a non-object on every page entry, producing a framework warning on each tab | runtime cleanliness (low, no functional impact) |
| **RELEASE-P0-4** | A permanently denied album/location permission has no in-app recovery (`wx.openSetting` is never called) | permissions UX |
| **RELEASE-P0-5** | `sitemap.json` allows WeChat search to index **every** page, including the dev-only lab page, for a product whose content is private diary data | privacy / release config |

WATCH items (not counted): `uploadWithSourceMap: true`; the missing privacy-protection guideline entry in
`project.config.json`; the unreferenced cloud-storage objects left by a failed record write; unknown
CloudBase index and access-rule configuration (unreadable from this tooling).

## 19. Fixes applied

**None.** Every finding is either a release-configuration change or a permissions/privacy change, both of
which the brief places behind **STOP + explicit approval**. No production file was modified.

## 20. Frozen-UI impact

**None.** No frozen page file changed, so no registration checkpoint was reopened or advanced. All five
registrations are exactly as approved: Home `02ae8dcf…`/`650a891e…`, Map `4522d594…`/`c13016f3…`,
Add `10f6501a…`/`df572eae…`, Us `dcae6d39…`/`98bd3268…`, Me `af025665…`/`4f287a95…`.

## 21. Verification result

| Command | Result |
|---|---|
| `npm run verify` | **EXIT 0** — FINAL STATIC VALIDATION: PASS (includes `✓ [SIZE] package size 1.61 MiB`) |
| `verify:cloud` | **EXIT 0** — 272/272, all UI registration gates green |
| `npm run verify:all` | **EXIT 0** — 53 suites, 0 errors |

## Final recommendation

> ⚠️ **SUPERSEDED by RC-18 (2026-10-02).** Recorded as the 2026-09-30 conclusion; the single blocking
> issue it names has since been resolved. Do not act on this section.

**ONE SPECIFIC BLOCKING ISSUE — real-device verification has not been performed.**

The local technical state is release-clean: 1.61 MiB package, 0 runtime errors, all six cloud functions
deployed and identity-enforced, no direct HTTP domains, permissions declared correctly with **no
`getLocation` path**, per-user storage scoping, and the full verification set green. The single thing that
stands between "simulator-complete" and a release decision is that **no iOS or Android hardware evidence
exists** — the four other findings are small, fixable release-configuration items that need approval
before they can be changed.

---

# 2026-10-02 — RELEASE CANDIDATE FINAL AUDIT (PRE-SUBMISSION)

**Scope**: release readiness only. **No production file was modified. No cloud mutation. No commit / push / deploy.**
This section is the **current** release decision; everything above it is the dated 2026-09-30 pass.

## RC-1. Repository state

| Item | Value |
|---|---|
| Branch | `integrated-with-cloud` |
| HEAD | `0de3e468e273edc04fb392f2b64574e6f76d29d3` (tag `v1.2.3` pushed) |
| Staged | **0** |
| Modified tracked | **49** |
| Deleted tracked | **1** — `VID_1.mp4` |
| Untracked | **36** entries |
| Ignored (release-relevant) | `.workbuddy-ai/`, `project.private.config.json`, `.cli/` |

### Classification of every dirty item

| Class | Items |
|---|---|
| **A. intended production change** (`miniprogram/**`, `package.json`) | `app.json`, `sitemap.json`, `components/sheet/index.js`, `pages/{home,map,add,us,me}/index.{js,wxml,wxss}` (per page as applicable), `utils/{cloudRecords,data,icons,identity,locales,locations,lucideMorphNodes,settingsRepository,store}.js`; **untracked**: `utils/permissionRecovery.js`, `images/icons/lucide/{cloud,library}.svg` |
| **B. intended verification/test change** (`tools/**`) | `add-page-review.json`, `_gen/icons.json`, `assets/icons/lucide/SOURCES.{json,md}`, `fixtures/moved-build-sources.json`, `fixtures/regression/ui-approved-updates.json`, `{home,map,me,us}-*-review.json`, `icon-aliases.json`, `lib/locale-translations.tsv`, `lib/reviewed-me-memory-return.cjs`, `visual-refinements.json`, `verify-{cloud,icons,map-overview-label,map-zoom-stepper,menu-copy,ui-quality,visual-language}.cjs`; **untracked**: `verify-{map-photo-download-budget,map-tab-return,me-menu-icons,permission-recovery}.cjs` |
| **C. documentation** | `docs/README.md`, `docs/guides/development.md`, `AGENTS.md`, `docs/handoff/REPOSITORY-CLEANUP-20261001.md`, `docs/reviews/*.md` (19), `docs/reviews/evidence/`, `docs/design/0.savor-concept.png` |
| **D. user-owned cleanup** | `VID_1.mp4` — **deleted on purpose; DO NOT RESTORE** |
| **E. temporary artifact** | none inside the tracked tree; all local scratch lives in gitignored `.workbuddy-ai/` |
| **F. unexpected** | **NONE** |

### What must happen before an actual release commit

- **Commit**: A + B + C together (frozen UI + permission recovery + their registration/verification + canonical docs). Committing UI without its checkpoint, or the checkpoint without the UI, would leave `verify:cloud` inconsistent.
- **Keep deleted**: `VID_1.mp4` (user-owned cleanup). **Do not restore.**
- **Keep excluded**: `.workbuddy-ai/`, `project.private.config.json`, `.cli/` — all gitignored.
- **Do not reintroduce**: the removed model-specific handoff documents (`CODEX-HANDOFF-20261001.md`, `CODEX-6.1-SOL-QUICKSTART.md`).

A dirty tree is **not** a blocker for this audit; it only means the release commit has not been made yet.

## RC-2. Full verification

| Command | Result |
|---|---|
| `npm run verify` | **EXIT 0 · 359/359 · FINAL STATIC VALIDATION: PASS** |
| `verify:cloud` | **EXIT 0 · 272/272** |
| `npm run verify:all` | **EXIT 0 · 57 top-level suites · 0 FAIL** |

Individual release-oriented suites (all **EXIT 0**): `verify:icons`, `verify:visual-language` (13), `verify:ui` (44/44), `verify:store-boundaries` (11), `verify:memory-return` (13), `verify:permission-recovery`, `verify:map-tab-return`, `verify:map-photo-budget`, `verify:me-menu-icons`, `verify:page-lifecycle`, `verify:structure` (6), `verify:package-budget`.

**No red suite. No classification needed.** (Every suite above was executed this round, not quoted from an earlier run.)

## RC-3. App registration (`miniprogram/app.json`)

| Check | Result |
|---|---|
| Registered pages | **9**: `home, map, add, us, me, account, space, workspace, reports` |
| All page paths exist | **YES** (9/9 have `index.{js,json,wxml,wxss}`) |
| Dev/test page registered | **NO** |
| `morph-lab` exposed | **NO** — on disk but **not** in `pages` (kept because `verify-cloud.cjs` reads its `pairs`) |
| tabBar entries | **exactly 5** (`home, map, add, us, me`), `custom: true` |
| Duplicate / stale path | **none** |
| window | `navigationStyle: custom`, `style: v2`, `lazyCodeLoading: requiredComponents` |
| permission / requiredPrivateInfos | `scope.userLocation` desc present; `requiredPrivateInfos: ["chooseLocation"]` |

**Release concerns: none.**

## RC-4. Sitemap (`miniprogram/sitemap.json`)

`rules: [{ action: "disallow", page: "*" }]` — every page is private, identity-gated user content.
No dev page exposed, no malformed rule, no stale page reference. **Correct for this product; do not change.**

## RC-5. `project.config.json` / `project.private.config.json`

| Field group | Classification |
|---|---|
| `miniprogramRoot`, `cloudfunctionRoot`, `appid`, `compileType`, `projectname` | **SAFE TO COMMIT** |
| `setting.*` (`es6`, `enhance`, `postcss`, `minified`, `minifyWXSS/WXML`, `ignoreUploadUnusedFiles: true`, `uploadWithSourceMap: true`) | **SAFE TO COMMIT** |
| `setting.urlCheck: false` | **SAFE TO COMMIT** — dev convenience; harmless because the client makes **no direct HTTP requests** (all traffic is `wx.cloud`) |
| `project.private.config.json` (whole file) | **LOCAL ONLY / PRIVATE** — gitignored (`**/project.private.config.json`). **Must remain local**; it carries `libVersion: 3.17.3` and IDE toggles (`compileHotReLoad`, `useApiHook`, …) |
| Absolute local paths / ports / machine identifiers / secrets | **NONE FOUND** in either file |

**Observation (P2, not a blocker):** the committed `project.config.json` says `libVersion: "3.8.5"` while the local private config says `3.17.3`. Project files only drive the IDE simulator; the **released** base library is chosen in the console. No secrets are exposed by either file.

## RC-6. Upload content

| Metric | Value |
|---|---|
| Raw `miniprogram/` on disk | **2.1 MB** |
| `verify:package-budget` measured size (all files under `miniprogram/`) | **1.63 MiB** — soft warning 1.70, project hard limit 1.90, WeChat platform limit 2 MB |
| Last measured **platform-effective** upload size | **1.4036 MiB** (2026-09-30 platform self-test; not re-measured this round — an upload is required, which is not authorized) |
| Largest file | `miniprogram/utils/fonts.js` 147.6 KB (base64 WOFF) |
| Next largest | `images/*.jpg` (37–72 KB each), `images/markers/landmark-*.png` (44–52 KB) |

**Outside the upload root (never shipped):** `docs/` (6.4 MB), `tools/` (1.6 MB), `archive/`, `.workbuddy-ai/` (418 MB), `cloudfunctions/` (deployed separately), and the two root-level `.docx` audit reports.

**Inside `miniprogram/`:** no screenshots, no videos, no logs, no historical evidence. The only non-runtime file is `miniprogram/vendor/MORPHICONS_SOURCE.md` (provenance note, unreferenced ⇒ excluded by `ignoreUploadUnusedFiles`).

**Suspicious accidental artifacts: none.** Do not delete docs to shrink the upload — they are already outside the package.

## RC-7. Cloud functions

| NAME | PURPOSE | CALLED BY | ENV DEPENDENCY | SECRET/CONFIG DEPENDENCY | RELEASE STATUS |
|---|---|---|---|---|---|
| `account` | identity bootstrap / account record | `utils/identity.js` (`bootstrap`) | `DYNAMIC_CURRENT_ENV` | — | deployed, identity-enforced |
| `mealRecords` | memory CRUD + identity handshake | `utils/cloudRecords.js`, `utils/identity.js` | `DYNAMIC_CURRENT_ENV` | — | deployed |
| `media` | cloud media assets / retention | `utils/sharedMedia.js` | `DYNAMIC_CURRENT_ENV` | `MEDIA_ADMIN_OPENIDS`, `MEDIA_RETENTION_DAYS`, `MEDIA_PURGE_ENABLED` | deployed — **console env vars required** |
| `placeLookup` | place keyword search for Map | `utils/cloudRecords.js` | `DYNAMIC_CURRENT_ENV` | — | deployed |
| `spaces` | couple space / invites / wishes | `utils/spaces.js` | `DYNAMIC_CURRENT_ENV` | — | deployed |
| `workspace` | archive tasks, profile sync, delivery jobs, feedback | `utils/workspaceClient.js` | `DYNAMIC_CURRENT_ENV` | — | deployed |

- **Orphans: none.** Every function has at least one client call site; every client call site names a deployed function.
- **Stale / missing names: none** (`mealRecords`, `placeLookup`, `account`, `media`, `spaces`, `workspace`).
- All functions `cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })` — **no hardcoded env**, no local-only config.
- `mealRecords` and `workspace` each carry a byte-identical `schema.js` normalizer (deliberate; see §5 invariants in `docs/README.md`).
- **Not deployed by this audit.**

## RC-8. CloudBase environment

| Item | Provable from the repository |
|---|---|
| Environment ID | `cloud1-d9gqm52id66c0bcda` (`miniprogram/utils/runtimeConfig.js`) — single env, **no prod/dev split in the repo** |
| Server env selection | `cloud.DYNAMIC_CURRENT_ENV` in all six functions |
| Client storage namespace | `appId + ':' + cloudEnv`; legacy unscoped namespace retained for the historical deployment |
| Collections referenced | `dining_records`, `savor_accounts`, `savor_media_assets`, `savor_delivery_jobs`, `savor_archive_tasks`, `savor_archive_chunks`, `savor_profiles`, `savor_workspace_receipts`, `savor_invites`, `savor_spaces`, `savor_wishes`, `savor_shared_meals` |
| Cloud storage | per-owner file IDs under `dining/<userId>/…`; client uses `wx.cloud.getTempFileURL` / `uploadFile` / `downloadFile` |
| Database permissions / indexes / storage rules | **NOT provable from the repository** ⇒ `MANUAL CLOUDBASE CONSOLE CHECK` |
| Prod vs dev separation | **NOT present** ⇒ `MANUAL CLOUDBASE CONSOLE CHECK` (single-env deployment) |

No credentials appear in this report.

## RC-9. Data safety

| Area | Finding |
|---|---|
| Identity partitioning | Per-user partition under a namespaced key; `missing` contract = `''\|null\|undefined`; fail-closed on `CACHE_MISSING`. Server enforces identity on every function. |
| Memories / local cache / cloud merge | `store.commit()` + monotonic `revision()`; `mergeCloudRead` does not commit when the merge equals local state. |
| Deletion | Tombstones via `remote.deletedIds`, gated on `!outbox.some(op => op.recordId === id)`; `queueMutation` is the only outbox writer. |
| Import / export | Import validates every record (`isMemory`) and is idempotent on re-import; export shape `{version, exportedAt, memories}`. |
| Image fallback | Upload shrinks only at upload time with `UPLOAD_EDGE_LADDER=[1600,1080]`; exhausted ladder ⇒ `UPLOAD_FAILED`. Map card vs marker default-photo semantics are **intentionally different**. |
| Legacy records | Legacy large photo (10 607 530 B) completes via the progress-stall window; legacy namespace retained read-only for the historical deployment. |
| Location fields | `restaurant` and `location` are independent; editing restaurant text never deletes `draft.location`. Country labels are compliance-correct (`中国台湾` / `中国`). |
| Debug fixtures in production code | **NONE** — no demo/seed/debug-write path; `identityMode: 'normal'`; `archiveService` only *filters* `isSample`, it never writes. |
| Tests mutating real cloud data | **NO** — all suites are static/synthetic (stubs and in-process modules). No destructive real-cloud test was run. |

## RC-10. Privacy / permission matrix

Legend: **R** = runtime permission (system), **M** = Mini Program privacy declaration, **B** = WeChat backend privacy interface declaration, **S** = system permission.

| API | USER ACTION | PURPOSE | DECLARATION REQUIRED? | CURRENT DECLARATION | PRIVACY DISCLOSURE? | CURRENT STATUS | MANUAL CONSOLE ACTION? |
|---|---|---|---|---|---|---|---|
| `wx.chooseLocation` | taps the location entry | pick a restaurant location on Tencent Maps | **YES — R + M + B** | `app.json.permission["scope.userLocation"].desc` + `requiredPrivateInfos: ["chooseLocation"]` | YES | declared in `app.json`; recovery affordance implemented | confirm 位置信息 in 用户隐私保护指引 + service category allows 位置 |
| `wx.chooseImage` / `wx.chooseMedia` | adds a photo / picks an avatar | attach photos to a memory | **YES — M + B** (album read) | none in `app.json` (correct — not a `requiredPrivateInfos` API) | YES | used by `utils/photos.js`, `utils/avatar.js`, `components/profile-editor` | declare 相册/摄像头 in 用户隐私保护指引 |
| `wx.chooseMessageFile` | imports a JSON backup | restore from a file | **M** (file selection) | none | depends on console wording | used by `components/sheet`, `pages/workspace` | confirm the 选择文件 wording covers it |
| `wx.openSetting` | taps the inline recovery action | re-grant a denied permission | **NO declaration** (not a data API) | n/a | n/a | **exactly one call site** (`utils/permissionRecovery.js`), reached only from a user tap | none |
| `wx.setClipboardData` | copies an invite / export payload | share an invite code, copy export JSON | **M + B** (clipboard write) | none | YES | 3 call sites (`components/sheet` ×2, `pages/space` ×1) | declare 剪切板 in 用户隐私保护指引 |
| `wx.getSetting` / `wx.getAppAuthorizeSetting` | — | read permission state (read-only) | **NO** | n/a | n/a | 3 / 2 call sites, read-only | none |
| `wx.cloud.*` (`callFunction` / `uploadFile` / `downloadFile` / `getTempFileURL`) | normal product use | records, media, spaces, workspace | **M + B** (user data) | `wx.cloud.init({ env, traceUser: true })` | YES | 6 functions; no direct HTTP domains | confirm 用户数据 collection wording |
| `wx.getLocation` | — | **NOT USED (0 occurrences)** | — | — | — | absent by design | none |
| `wx.createCameraContext`, `wx.chooseAddress`, `wx.saveImageToPhotosAlbum` | — | **NOT USED (0 occurrences)** | — | — | — | absent | none |
| Share / `onShareAppMessage` | — | **NOT USED (0 occurrences)** | — | — | — | absent | none |

**Permission Recovery remains a non-blocking waiver** and is **not** upgraded to PASS.

## RC-11. Privacy copy consistency

- The repository contains **no privacy policy text and no in-app privacy page**. WeChat requires the 用户隐私保护指引 to be filed in the admin console — **`MANUAL CONSOLE`**, not a code defect.
- **No factual mismatch found** between product behaviour and the repository's own documentation:
  - The app never claims "no data collection" — all cloud traffic is identity-scoped and described as private/self-hosted in `utils/workspaceCopy.js`.
  - The `app.json` location description matches what `wx.chooseLocation` is actually used for.
  - Storage model described in product copy ("主题、语言、减弱动效、关系身份留在本机") matches the implementation (device settings vs `profileRepository`).
  - Cross-account semantics described in the space copy match the server-side membership checks.
- **One gap to close in the console (not a mismatch in code):** `chooseMedia`/`chooseImage`, `chooseMessageFile` and `setClipboardData` have **no declaration entry in the repository** because they are console-side privacy interfaces, not `app.json` fields.

## RC-12. Localization

| Check | Result |
|---|---|
| EN/ZH source rows | **555** (`tools/lib/locale-translations.tsv`), **0 malformed** |
| Generated entries | **555** (`miniprogram/utils/locales.js`, 68.6 KB) |
| Missing key | **none** (`npm run verify` asserts catalog ⇄ TSV equality) |
| Generated drift | **0** |
| Raw debug copy | **none found** |
| Hardcoded CJK leaking into EN | **none** — `i18n.t()` matches `row.en` **or** `row.zh`, and the 6 CJK literals all resolve |
| Hardcoded English leaking into ZH | **none found** in localized surfaces |

No copy polish performed.

## RC-13. Icon / generated source integrity

| Check | Result |
|---|---|
| `verify:icons` | **EXIT 0** — 51 official SVGs, 29 compatibility aliases, 88 template declarations, repeatable generation |
| Icon source registry | `tools/assets/icons/lucide/SOURCES.json` (URL + sha256 per icon) |
| Generated outputs match source | **YES** — drift 0 (regenerated and byte-compared) |
| Locale output matches source | **YES** — drift 0 |
| Missing SVG / broken alias | **none** |
| Hand-edited generated file | **none** |

## RC-14. Release version / metadata

| Item | Location | Value |
|---|---|---|
| Project version | `package.json` | **1.2.3** |
| Release notes source | `CHANGELOG.md` | latest entry **v1.2.3 — 2026-09-29** |
| Cloud function versions | `cloudfunctions/*/package.json` | `1.0.0` each (function-local, not the product version) |
| Git tag | `v1.2.3` | pushed |
| Identity / wire protocol | `identityProtocol: 1`, `protocolVersion: 1` | stable |
| Cloud record schema version | `schemaVersion: 2` / `3` in the two `schema.js` normalizers | mixed — see note |
| Database migration version | none tracked | n/a |
| **WeChat upload version number** | entered in the console at upload time | **MANUAL AT UPLOAD** |

**Note (P2):** the two `schema.js` files reference `schemaVersion` 2 and 3. This is a **record-shape normalizer version**, not a migration counter, and both copies are byte-identical by design. No version number was invented.

## RC-15. Real-device status (already-earned evidence only)

| Area | Classification |
|---|---|
| Map P0-1 legacy large photo (marker + card render the real photo) | **REAL-DEVICE VERIFIED** |
| Map P0-2 tab-return cache (centre/zoom/selection/POI kept; zero re-download/rebuild/camera command) | **REAL-DEVICE VERIFIED** |
| Map fast switching / return after data change | **REAL-DEVICE VERIFIED** |
| Permission recovery — normal chooser / cancel / draft safety | **REAL-DEVICE VERIFIED** (OPPO PKB110 / Android 16 / WeChat 8.0.76 / SDK 3.17.3) |
| Permission recovery — permanent denial → Open Settings → grant → retry | **WAIVED / NOT REPRODUCIBLE** on the tested device. **Not upgraded to PASS.** |
| Page visuals (Home / Map / Add / Us / Me) | **SIMULATOR VERIFIED** (measured boxes + pixel scans). Not hardware evidence. |
| Cloud function behaviour in the live environment | **NOT TESTED** (mock contract scenarios only) |
| Long-run runtime / real network variability | **NOT TESTED** |
| Two-account couple-space acceptance | **NOT TESTED** |

`simulator_screenshot` output is never treated as hardware evidence.

## RC-16. Manual WeChat console checklist (things code cannot prove)

| CONSOLE AREA | WHAT TO VERIFY | EXPECTED VALUE / CONDITION | BLOCKING? |
|---|---|---|---|
| 基本设置 → AppID | bound account matches the repo | `wx65867b5568b82996` | **YES** |
| 基本设置 → 服务类目 | category permits 位置 / 相册 / 文件选择 | a category that allows `chooseLocation` | **YES** |
| 用户隐私保护指引 | declares 位置信息, 相册/摄像头, 剪切板, 用户数据(云) | every API in RC-10 marked M/B is listed | **YES** |
| 用户隐私保护指引 → 生效状态 | published and in effect (not draft) | 已生效 | **YES** |
| CloudBase → 环境 | the deployed env matches the client | `cloud1-d9gqm52id66c0bcda` | **YES** |
| CloudBase → 云函数 | all six deployed at the current revision | `account, mealRecords, media, placeLookup, spaces, workspace` | **YES** |
| CloudBase → 云函数 `media` → 环境变量 | retention/admin config present | `MEDIA_ADMIN_OPENIDS`, `MEDIA_RETENTION_DAYS`, `MEDIA_PURGE_ENABLED` | **YES** (if media retention is used) |
| CloudBase → 数据库权限 | collections not world-readable/writable | per-user rules; no `all users` read/write | **YES** |
| CloudBase → 数据库索引 | query indexes exist for list/order paths | indexes supporting `dining_records` list + `savor_delivery_jobs` due-job query | **NO** (perf) |
| CloudBase → 存储权限 | per-owner file access only | no public read | **YES** |
| 上传 → 版本号 / 描述 | version + release notes | version from `CHANGELOG.md` v1.2.3 line; notes summarised | **NO** (MANUAL AT UPLOAD) |
| 成员管理 / 体验成员 | testers added if needed | as required | **NO** |

**These were NOT checked — no console access from this environment.** They are recorded as the exact minimum the user must verify.

## RC-17. Release blocker matrix

### P0 — BLOCKS RELEASE
**None.** No code, configuration, checkpoint or test defect was found.

### P1 — MUST VERIFY MANUALLY BEFORE UPLOAD
1. AppID / account binding = `wx65867b5568b82996`.
2. 用户隐私保护指引 published and **in effect**, covering 位置信息 / 相册·摄像头 / 剪切板 / 用户数据.
3. 服务类目 permits the location + photo + file capabilities.
4. CloudBase env = `cloud1-d9gqm52id66c0bcda`; all six functions deployed at the current revision.
5. CloudBase database + storage permissions are per-user (no public read/write).
6. `media` function env vars present if retention is used.

### P2 — SAFE POST-RELEASE FOLLOW-UP
1. `project.config.json` `libVersion: 3.8.5` vs private `3.17.3` — align the committed value when convenient.
2. `miniprogram/vendor/MORPHICONS_SOURCE.md` ships nothing but sits inside the package root; it is excluded by `ignoreUploadUnusedFiles`.
3. First selection of the 10.6 MB legacy photo costs one extra download (~40 s) — existing renderer cache-key design.
4. Me avatar has no permission-recovery affordance (audited only; not in the frozen manifest).
5. No prod/dev CloudBase separation — a second env would be a future improvement, not a defect.

### ACCEPTED / WAIVED
1. **Permission Recovery permanent-denial path** — `WAIVED`; prerequisite **NOT REPRODUCIBLE** on the tested device. `REAL-DEVICE PERMISSION RECOVERY = PASS` is **not** claimed.
2. **Dirty working tree** — expected; the release commit has not been made. Not a blocker.
3. **`VID_1.mp4` deleted** — user-owned intentional cleanup. Do not restore.
4. **Simulator-only visual evidence** for page visuals — accepted as `SIMULATOR VERIFIED`; hardware visual acceptance is not required for release.

## RC-18. Release candidate decision

**A. READY FOR RELEASE CANDIDATE** — the repository/code side is ready; only the P1 manual console/upload checks remain.

Rationale: `npm run verify` 359/359, `verify:cloud` 272/272, `npm run verify:all` 57 suites 0 FAIL; package 1.63 MiB against a 1.90 MiB project hard limit; six cloud functions deployed with server-side identity; no direct HTTP domains; no `getLocation`; sitemap fully disallowed; localization and icon generation drift-free; zero category-F items in the working tree; and every remaining risk is either a console-side declaration or an explicitly waived, documented limitation.

**No aesthetic concern was used as a blocker. No blocker was fixed in this round.**

---

# 2026-10-02 — POST-UPLOAD / PRE-REVIEW STATUS

**Status change**: `READY FOR RELEASE CANDIDATE` → **`UPLOADED — READY FOR PRE-REVIEW MANUAL CLOSEOUT`**.

| Item | State |
|---|---|
| WeChat DevTools upload | **UPLOAD COMPLETED** (user-executed; not performed by this audit) |
| Automated verification | **ALL GREEN** — `npm run verify` 359/359 · `verify:cloud` 272/272 · `npm run verify:all` 57 suites / 0 FAIL |
| Frozen pages | Home / Map / Add / Us / Me — all FROZEN |
| Add checkpoint | REGISTERED |
| Permission recovery | RELEASE WAIVER ACCEPTED · permanent denial **NOT REPRODUCIBLE** · release blocking **NO** |
| P0 blockers | **NONE** |
| Experience-version smoke test | **PASS** — user-executed on a phone against the 1.2.4 体验版 (see CL-1a). Dev-build simulator navigation smoke = **PASS** (CL-1b) |
| Manual console checks (P1) | **USER-CONFIRMED COMPLETE** — declared by the user; no screenshots collected (see the log below) |
| Review submission | **NOT SUBMITTED** (requires explicit authorization) |

### Manual console closeout log

> One check at a time. Each entry is only written after the user supplies console evidence.
> Nothing in this section may be marked PASS without evidence.

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Uploaded version present / correct | **PASS** | 开发版本 **1.2.4** · 提交时间 **2026-10-02 02:27:36** · 备注与本次版本对应 · 仅此一条，无误传旧包 · 已带「体验版」标记 |
| 2 | AppID / name / account status | **USER-ASSERTED** | 无截图留档 |
| 3 | Service category | **USER-ASSERTED** | 无截图留档 |
| 4 | 用户隐私保护指引 (+ privacy interface declarations) | **USER-ASSERTED** | 无截图留档 |
| 5 | CloudBase environment binding | **USER-ASSERTED** | 无截图留档 |
| 6 | Cloud functions deployed | **USER-ASSERTED** | 无截图留档 |
| 7 | Database collections + permissions | **USER-ASSERTED** | 无截图留档 |
| 8 | Cloud storage | **USER-ASSERTED** | 无截图留档 |
| 9 | Member / tester access | **USER-ASSERTED** | 无截图留档 |
| 10 | Experience version reachable | **USER-ASSERTED** | 无截图留档 |

> ⚠️ **Rows 2–10 are `USER-ASSERTED`, not `PASS`.** On 2026-10-02 the user instructed the closeout to skip
> ahead to the review-submission step and declared these checks complete. **No console screenshot or
> evidence was collected for any of them**, so per this document's own rule they are **not** marked PASS.
> They must not be cited as verified console state. Only row 1 is evidence-backed.

**Not re-audited in this round** (already proven by code/automation, explicitly out of scope): package size limits, upload eligibility, version-number entry, project-remark entry, the upload action itself.

### Post-upload blocker matrix (2026-10-02)

> Scope: post-upload items only. Every remaining item appears **exactly once**.
> Nothing here is marked PASS without console evidence.

#### P0 — BLOCKS SUBMISSION
**NONE.**

#### P1 — MUST VERIFY BEFORE SUBMIT (console checks not yet evidenced)
| # | Item | Why it is still P1 |
|---|---|---|
| 1 | AppID / mini-program name / account status (CHECK 2) | not yet confirmed in the console |
| 2 | Service category permits the location capability (CHECK 3) | `chooseLocation` is used; category not confirmed |
| 3 | 用户隐私保护指引 published and **in effect**, covering location / album·camera / file chooser / clipboard / cloud data (CHECK 4) | not yet confirmed |
| 4 | Privacy **interface declarations** match the APIs actually used (CHECK 4) | not yet confirmed |
| 5 | CloudBase environment binding = `cloud1-d9gqm52id66c0bcda` (CHECK 5) | not yet confirmed |
| 6 | Six cloud functions deployed at the current revision (CHECK 6) | not yet confirmed |
| 7 | Database collections present, permissions not unexpectedly public (CHECK 7) | not yet confirmed |
| 8 | Cloud storage active; legacy photo records still resolve (CHECK 8) | not yet confirmed |
| 9 | Member / tester access valid (CHECK 9) | not yet confirmed |
| 10 | Experience version reachable + smoke test (CHECK 10 / STEP 5) | not yet performed |

#### P2 — SAFE AFTER RELEASE
1. `project.config.json` `libVersion: 3.8.5` vs private `3.17.3` — align when convenient.
2. Repo has **no v1.2.4 entry** (`package.json` / `CHANGELOG.md` are at 1.2.3 while the upload is 1.2.4) — add a changelog note whenever convenient. **Do not regenerate the upload version.**
3. `miniprogram/vendor/MORPHICONS_SOURCE.md` sits inside the package root (excluded by `ignoreUploadUnusedFiles`).
4. First selection of the 10.6 MB legacy photo costs one extra download (~40 s) — existing renderer cache-key design.
5. Me avatar has no permission-recovery affordance (audited only; not in the frozen manifest).
6. No prod/dev CloudBase separation (single environment).
7. Version remark states 已完成真机验证 while the permanent-denial path is waived — acceptable reviewer wording; internal distinction retained.

#### ACCEPTED / WAIVED
1. **Permission recovery — permanent denial → Open Settings → grant → retry**: `WAIVED`. Prerequisite **NOT REPRODUCIBLE** on the tested device. **Not P0. Not PASS.**
2. Dirty working tree — the release commit has not been made; not a blocker.
3. `VID_1.mp4` deleted — user-owned intentional cleanup; do not restore.
4. Page visuals carry **simulator** evidence only — accepted; hardware visual acceptance is not required for release.

#### COMPLETE
1. Automated verification — `npm run verify` 359/359 · `verify:cloud` 272/272 · `npm run verify:all` 57 suites / 0 FAIL.
2. All five pages FROZEN; Add checkpoint REGISTERED; permission-recovery waiver recorded.
3. WeChat upload — **version 1.2.4, 2026-10-02 02:27:36**, marked 体验版 (CHECK 1 **PASS**).
4. Package / upload-readiness audit — complete; no re-audit required.
5. Version remark — reviewed, no internal jargon (P0 / checkpoint / hash / fixture / waiver / tool names).

---

# 2026-10-02 — POST-UPLOAD CLOSEOUT (STEP 5 / 7 / 8 / 9)

## CL-1. STEP 5 — smoke test

### CL-1a. Experience version (uploaded package) — **PASS** (user-executed on a real device)

The uploaded **体验版 (1.2.4)** was opened on the user's phone by scanning its experience QR code and
checked against the minimal release-smoke checklist. This is **user-reported real-device evidence**: the
assistant did not operate the phone and holds **no instrumented capture** from this run. Recorded as
`USER-REPORTED REAL-DEVICE PASS`, not as instrumented verification.

| # | Check | Result |
|---|---|---|
| 1 | Cold start — launches, Home appears, no white screen, no crash | **PASS** |
| 2 | Five tabs — Home / Map / Add / Us / Me all reachable | **PASS** |
| 3 | Map — map loads, existing memory markers appear, selection card works, returning from another tab does not re-initialise the page, no obvious image failure | **PASS** |
| 4 | Add — page opens; photo chooser opens and cancels; location chooser opens and cancels; page stays normal after cancel; **no Save performed, no real diary entry created** | **PASS** |
| 5 | Us / Me — both reachable, no white screen, images and menu icons render | **PASS** |
| 6 | PEARL ⇄ DUSK theme switch — pages display correctly | **PASS** |
| 7 | ZH ⇄ EN locale switch — main navigation and primary pages correct, no raw keys, no missing copy | **PASS** |

Judgement classes only: `STARTUP · NAVIGATION · MAP RENDER · ADD BASIC INTERACTION · ASSET LOADING ·
THEME SWITCH · LOCALE SWITCH · NO CRASH / NO WHITE SCREEN`. Frozen UI, spacing, fonts, shadows, card
proportions, icon preference and motion details were **explicitly not re-reviewed**.

### CL-1b. Dev-build navigation smoke on the simulator — **PASS** (labelled precisely)
Runtime: **DevTools simulator, dev build** (`platform: devtools`, 428×926). **Not** the uploaded package.

| Step | Result |
|---|---|
| Cold start after `simulator_refresh` | Home renders: title, weekly counters, empty-state card, full tab bar |
| Tab navigation ×5 (`home, map, add, us, me`) | **5/5 reachable**, page data populated (24 / 45 / 59 / 29 / 24 keys) |
| Secondary pages ×4 (`reports, space, workspace, account`) | **4/4 reachable** via `navigateTo` → `success` (11 / 19 / 25 / 10 keys) |
| Exceptions thrown during navigation | **none** |
| Missing resource / blank render | **none** (one intermediate blank was reproduced and shown to be a probe-induced mid-navigation frame, not an app white screen) |

**Not covered here**: chooser cancel on device, PEARL/DUSK on device, EN/ZH on device, real crash/network
behaviour. Those belong to the device smoke test (CL-1a).

**Probe gotcha found and fixed (tooling, not product):** Git Bash rewrites argv paths that begin with `/`,
so `"/pages/x/index"` reached the probe as `C:/Users/.../pages/x/index`. Pass the page **without** a leading
slash and restore it inside the probe.

## CL-2. STEP 7 — version description review

Checked the live 项目备注 captured in CHECK 1:
> 正式版本。精修 Add 页布局与交互状态；修复地图历史图片加载及 Tab 返回重复加载，新增地图地标显示开关；优化双人空间入口与菜单图标；完善权限恢复、双语文案及图片兜底。已完成真机验证与全量回归。

| Rule | Result |
|---|---|
| No internal jargon (`P0`, `checkpoint`, `WorkBuddy`, `Codex`, `verify:cloud`, `release waiver`, `fixture`, `hash`) | **PASS — none present** |
| Describes user-facing behaviour | **PASS** |
| Consistent with the uploaded version | **PASS** (matches CHECK 1) |

**No change required.** ⚠️ Internal note (not a defect, no action): the remark says 已完成真机验证, while the
permission-recovery permanent-denial path is **WAIVED / NOT REPRODUCIBLE**. Acceptable wording for reviewers.

## CL-3. STEP 8 — post-upload blocker matrix

### P0 — BLOCKS SUBMISSION
**None.** No code, configuration, checkpoint or test defect was found in any round.

### P1 — MUST VERIFY BEFORE SUBMIT
**Status: `USER-CONFIRMED COMPLETE` — no console screenshots collected.**
1. AppID / account binding = `wx65867b5568b82996`.
2. 用户隐私保护指引 published and **in effect**, covering 位置信息 / 相册·摄像头 / 剪切板 / 用户数据.
3. 服务类目 permits the location + photo + file capabilities.
4. CloudBase env = `cloud1-d9gqm52id66c0bcda`; all six functions deployed at the current revision.
5. CloudBase database + storage permissions are per-user (no public read/write).
6. `media` function env vars present if retention is used.
7. **Experience-version smoke test on a phone** — **DONE / PASS** (CL-1a, user-executed).

> Items 1–7 were confirmed by the user on 2026-10-02. Only item 7 carries a checklist record (CL-1a);
> items 1–6 rest on the user's console confirmation without screenshots. Do not cite them as
> instrumented verification.

### P2 — SAFE AFTER RELEASE
1. `project.config.json` `libVersion: 3.8.5` vs private `3.17.3`.
2. `miniprogram/vendor/MORPHICONS_SOURCE.md` sits inside the package root (excluded from upload).
3. First selection of the 10.6 MB legacy photo costs one extra download (~40 s).
4. Me avatar has no permission-recovery affordance.
5. No prod/dev CloudBase separation.
6. Repo version `1.2.3` vs uploaded `1.2.4`; `CHANGELOG.md` has no v1.2.4 entry.

### ACCEPTED / WAIVED
1. **Permission recovery — permanent denial**: `WAIVED / NOT REPRODUCIBLE`. Not P0. Not upgraded to PASS.
2. Dirty working tree — release commit not made.
3. `VID_1.mp4` deleted — user-owned intentional cleanup.
4. Visual evidence is simulator-only for page visuals.

### COMPLETE
- Upload to WeChat DevTools → 开发版本 **1.2.4**, 2026-10-02 02:27:36 (CHECK 1, screenshot-backed).
- Package-size eligibility, version-number entry, project-remark entry, upload eligibility — all done; **not re-audited**.
- Automated verification — all green.

## CL-4. STEP 9 — final status

```
P0 BLOCKERS                — NONE
P1 MANUAL CHECKS           — COMPLETE            [user-confirmed; no screenshots for items 1–6]
AUTOMATED VERIFICATION     — ALL GREEN           [evidence-backed]
UPLOAD                     — COMPLETE (1.2.4)    [screenshot-backed]
EXPERIENCE VERSION SMOKE TEST — PASS             [user-executed on device, checklist recorded in CL-1a]
PRIVACY / CLOUDBASE CONFIG — USER-CONFIRMED
PERMISSION RECOVERY        — RELEASE WAIVER ACCEPTED
                             (permanent denial NOT REPRODUCIBLE on the tested device;
                              NOT upgraded to PASS)
RELEASE STATUS             — READY TO SUBMIT FOR REVIEW
```

**Not submitted for review. No upload repeated. No version number changed. No production code, test,
checkpoint or cloud state modified. Nothing committed, pushed or deployed.**

---

# 2026-10-02 — RELEASE FREEZE (pending review outcome)

Version **1.2.4** has been uploaded, smoke-tested on a real device and passed every pre-submission check.
The user is submitting **1.2.4 for review** in the WeChat console.

```
P0 BLOCKERS                   — NONE
P1 MANUAL CHECKS              — COMPLETE
AUTOMATED VERIFICATION        — ALL GREEN
UPLOAD                        — COMPLETE
EXPERIENCE VERSION SMOKE TEST — PASS
PRIVACY / CLOUDBASE CONFIG    — USER-CONFIRMED
PERMISSION RECOVERY           — RELEASE WAIVER ACCEPTED
RELEASE STATUS                — READY TO SUBMIT FOR REVIEW
PRODUCT STATE                 — RELEASE FREEZE
```

### Freeze rules (in force until the review outcome is known)

Do **not**: modify production code · modify UI · modify checkpoints · re-upload · change the version
number · deploy cloud functions · modify the database · commit / push / deploy · start a new product
optimisation round. **Do not proactively continue work during the review.**

### The only three conditions that reopen work

1. WeChat **explicitly rejects** the review and gives a concrete reason.
2. A **reproducible P0/P1 functional defect** is found in the experience version.
3. The user **explicitly requests a new product requirement**.

Anything else — including cosmetic preferences, spacing, fonts, shadows, icon taste, motion details and
frozen-UI opinions — does **not** reopen work.

### Outstanding items carried into the freeze (none blocking)

- **P2**: `project.config.json` `libVersion: 3.8.5` vs private `3.17.3` · repo `1.2.3` vs uploaded `1.2.4`
  (no v1.2.4 `CHANGELOG.md` entry) · `miniprogram/vendor/MORPHICONS_SOURCE.md` inside the package root ·
  first selection of the 10.6 MB legacy photo costs one extra download · Me avatar has no
  permission-recovery affordance · no prod/dev CloudBase separation.
- **ACCEPTED / WAIVED**: permission-recovery permanent-denial path (NOT REPRODUCIBLE on the tested
  device; **not** upgraded to PASS) · dirty working tree (release commit not made) · `VID_1.mp4` deleted
  by the user · page visuals backed by simulator evidence.
