# Product journey QA — end-to-end functional completion pass

Date: 2026-09-30
Scope: functional verification of the frozen product UI system. **No visual design was reopened and no
production file was changed.** Every journey was driven through the product's own handlers on the running
mini program (428×926, identity verified, PEARL + EN baseline unless stated).

## 1. Journey matrix

| # | JOURNEY | RESULT | EVIDENCE |
|---|---|---|---|
| 1 | Cold start | **PASS** | transient `identityReady:false` / `verifying` / `locked:true` + pill, then verified; theme, locale, POI, Quiet, profile and 16 memories all restored |
| 2 | Home → Map | **PASS** | the first three records and their photos are identical on both surfaces; Map's `selectedId` == Home's first row; POI restored; scale sane |
| 3 | Map search | **PASS** | hit → 1 marker, miss → 0 markers and no stale selection, POI toggle independent, clear → 13 markers restored, scale never reset |
| 4 | Add new memory | **PASS** | draft fields update correctly, rating/ratingSource consistent, location identity intact |
| 5 | Save success | **PASS** | READY → WORKING → SUCCESS; the record appears on Home/Map/Us/Me on first entry with no repair |
| 6 | Save failure / retry | **PASS** | actionable message, draft fully preserved, 0 records created on failure, retry succeeds with exactly 1 record |
| 7 | Photo failure | **PASS** | shared handler on all four surfaces, idempotent, per-source isolation, cleared on re-entry so the image retries |
| 8 | Draft recovery | **PASS** | every draft field survives Add → Home → Add; no duplication; identity-scoped draft key |
| 9 | Edit / replace / remove photo | **PASS** | 0→1, replace, add, replace-main-with-2+, remove extra, remove main, remove all, out-of-range no-op; persisted draft matches |
| 10 | Location / country semantics | **PASS** | 上海市 → `上海市, 中国`; TW/HK/Macao semantics asserted by `verify-cloud` |
| 11 | Localization EN/ZH | **PASS** | all five tabs re-read the catalog; identity `正在验证…` everywhere; Add `原图`; no stale previous-language string |
| 12 | PEARL / DUSK | **PASS** | all five tabs report `dusk:true` after the switch; no page keeps the previous surface |
| 13 | Quiet / reduced motion | **PASS** | all five tabs report `quiet:true`; save state and More details remain understandable |
| 14 | Rapid tab switching | **PASS** | 12 rapid switches, 0 errors, correct final route, 17 memories intact, identity verified, no stale pill |
| 15 | Cold restart after save | **PASS** | the record, stats, POI, locale and theme all survive; no transient draft reappears |

## 2. Cold-start result

`simulator_refresh` (process restart, storage kept):

| Phase | Observed |
|---|---|
| TRANSIENT (immediately after launch) | `route: pages/home/index`, `identityReady:false`, `identity.status:'verifying'`, `locked:true`, locale `en` |
| ~1.5 s | `identityReady:true`, `status:'verified'`, `locked:false` |
| READY | theme `pearl`, language `en`, `showNativePoi:true`, `reduceMotion:false`, profile `Jamie Lin / Where next? / Alex / 2026-09-16`, 16 memories, `headerTop:88` |

**START → READY.** No blank page, no wrong language, no wrong theme, no wrong tab, no stale loading
state. The identity pill is the only transient surface and it correctly redacts while verifying.

## 3. Home → Map continuity

| Surface | Records |
|---|---|
| Home recent | `3aa6e0ce`(later replaced) → `5bfe462e`, `de6acf3f`, `c710cf1a`, `2ffbb161` … |
| Map markers | `5bfe462e`, `de6acf3f`, `c710cf1a`, `cf6d4b30`, `22ecec2f` … (6 roots of 13) |
| Map selected | `5bfe462e` == Home's first row; `selectedPhoto` == the same cloud path as Home's first row |

Markers are the marker *roots* (the drawer clusters co-located memories), so 13 memories legitimately
produce fewer roots; the **ids and photos of the shared records match**. No stale `selectedId`, no
cross-tab data mismatch.

## 4. Add creation result

Driven through the page's own handlers (`onRestaurant`, `onNotes`, `onDate`, `onRating`, `onGeoField`,
`onTagConfirm`, `changeDraft('photos')`, `onSave`):

| Field | Draft after edit |
|---|---|
| restaurant | `QA journey …` |
| notes | `end-to-end journey probe` |
| date | `2026-09-29` |
| rating / ratingSource | `4` / `single` |
| location | city `上海市`, country `中国`, address `上海市静安区南京西路1266号`, `[31.2295, 121.457]`, `geoConfirmed:true` |
| tags | `['QA-probe']` |
| photos | `['/images/japanese.jpg']` |

No field lost data and no state reset while editing.

## 5. Save success result

`READY → WORKING → SUCCESS`: `saving` false → **true** → false, then the page auto-navigated to Home.
Exactly **one** record was created (16 → 17, `createdCount: 1`) with no error.

| Surface | New record visible on FIRST entry? |
|---|---|
| HOME | **yes** — position 0 of Recent, photo `/images/japanese.jpg` |
| MAP | **yes** — marker position 0, 13 → 14 markers |
| US | **yes** — Shared Moments position 0, date `Sep 29, 2026`; meals 16 → 17, places 15 → 16 |
| ME | **yes** — meals 17, places 16 (identical to Us) |

**No surface required reopening, a manual refresh, or tab re-entry.** The draft was cleared after the
save (`restaurant:''`, 0 photos).

## 6. Save failure / retry result

A one-shot transport failure injected at `wx.cloud.callFunction` (the real `createCloudMemory` path ran
untouched):

| Check | Observed |
|---|---|
| message visible | `无法连接 mealRecords，请检查网络并部署云函数。草稿已保留，可安全重试。` |
| draft preserved | restaurant, notes, date, rating `5`, ratingSource `single`, 1 photo — all intact |
| records created on failure | **0** |
| retry | succeeded, `error:''`, 18 → 19 memories, **`createdCount: 1`** (no duplicate) |
| after retry | route → Home, record carries rating 5 / `single` / the photo |

The project's own diagnosis switch (`identity.enableDiagnosis()`) was also exercised: it blocks the save
with the frozen message, preserves the draft and creates nothing. During that mode the store withholds
business data (fail-closed redaction) — verified **not** to be data loss: after the session ended the
count returned to 17 with the target record intact.

## 7. Photo failure result

The shared handler was dispatched with a synthetic failing source on each surface:

| Surface | handler present | before | after (×2 calls) |
|---|---|---|---|
| Home | yes | 0 | **1** (idempotent) |
| Map | **yes** (added by GLOBAL-P0-2) | 0 | **1** (idempotent) |
| Us | yes | 0 | **1** (idempotent) |
| Me | yes | 0 | **1** (idempotent) |

Only the failing source is keyed, so **one failed image cannot poison unrelated images**; each page
carries its own `imageErrors`; and Map now clears `imageErrors` on re-entry (1 → **0** after Home → Map),
so a previously failed photo retries instead of staying stale.

## 8. Draft recovery result

Add → Home → Add:

| Field | before leave | after return |
|---|---|---|
| restaurant | `DRAFT-PROBE-ONLY` | `DRAFT-PROBE-ONLY` |
| notes | `draft boundary probe` | `draft boundary probe` |
| date | `2026-09-28` | `2026-09-28` |
| rating / ratingSource | `3` / `single` | `3` / `single` |
| photos | 1 | 1 |

Memory count unchanged (17) → no draft duplication. **Intended persistence boundary:** the draft is
persisted under `savor-draft-v1` and is **identity-scoped** (`draft.actorUserId` must equal the current
lease owner, otherwise `DRAFT_IDENTITY_MISMATCH`), so it survives tab switches and app restarts but never
leaks across accounts; `onSave` success calls `clearDraft()`.

## 9. Location / country result

| Input | city | country | displayed |
|---|---|---|---|
| `上海市静安区南京西路1266号` | 上海市 | 中国 | `上海市, 中国` |
| `台湾高雄市苓雅區` | 高雄市 | 中国台湾 | `高雄市, 中国台湾` |
| `中国台湾台北市` | 台北市 | 中国台湾 | `台北市, 中国台湾` |
| `香港中环` | 香港 | 中国 | `香港, 中国` |
| `澳门大堂区` | 澳门 | 中国 | `澳门, 中国` |
| `江苏省苏州市太仓市` | 苏州市 | 中国 | `苏州市, 中国` |

The same stored record renders the same line on Home rows, the Map card, Us and Me (they all call
`locations.display`). No country value is ever `台湾` / `香港` / `澳门` — asserted in `verify-cloud`.

## 10. Localization result

Switched to `zh-CN` at runtime; every tab re-read the catalog on entry (no stale English):

| Surface | Observed |
|---|---|
| Home | `留住此刻。` / `收藏每一顿美食，也收藏相伴的回忆。` |
| Map | `美食地图` / `去回忆发生的地方看看。` / POI `隐藏地图地标` |
| Add | `记录一顿美好` / rating `评分`, cleared `未评分`, original `原图` |
| Us | `我们` / `我们的旅程` / `已经相伴` / `共享时光` / `查看全部` |
| Me | `云端工具` / `年度报告` / `双人空间与 Wishlist` … |
| identity pill (all five) | `正在验证…` |

## 11. PEARL / DUSK result

After switching to DUSK, all five tabs reported `dusk:true`; the Me surface screenshot shows dark
surfaces with no residual PEARL panel, readable photos and a correctly highlighted tab. The theme
persists across tabs and across a cold restart. No theme-specific state bug.

## 12. Quiet result

With `reduceMotion:true` all five tabs reported `quiet:true`. Meaning is never carried by animation: the
save state is conveyed by the button label + progress text, More details by the disclosure label, Map
interaction by the controls, and press feedback remains. Final state matches normal mode.

## 13. Rapid-tab result

`Home → Map → Add → Us → Me → Home` ×2 at ~90 ms intervals: **0 navigation errors**, the executed order
matches the requested order exactly, final route = Home, `tabSelected:4` on Me, 17 memories intact,
identity `verified`, `identityReady:true` (no stale pill), no duplicated fetch or draft.

## 14. Cold-restart result

After the save, `simulator_refresh`: 17 memories, the record intact (restaurant / city 上海市 /
country 中国 / date / rating 4 / ratingSource single / tags / photo / `geoConfirmed`), stats 17 meals /
16 places, `showNativePoi:true`, locale `en`, theme `pearl`, identity `verified`, and **no transient
draft reappearing** (the live draft was empty).

## 15. Cross-tab data consistency matrix

Canonical test memory `f88b7b6abf12baabada5194bbd2e729f` (created by the real Add flow, then removed by
the production delete path after the run):

| Field | Canonical value |
|---|---|
| id | `f88b7b6abf12baabada5194bbd2e729f` |
| restaurant | `QA journey 1790756686855` |
| location / address | `上海市静安区南京西路1266号` |
| city / country | `上海市` / `中国` |
| date | `2026-09-29` |
| rating / ratingSource | `4` / `single` |
| tags | `['QA-probe']` |
| photo count | 1 |
| main photo | `/images/japanese.jpg` |
| shared / personal | personal (not liked) |

| Surface | id | name | date | photo | location | counts |
|---|---|---|---|---|---|---|
| HOME | **MATCH** (pos 0) | **MATCH** | n/a (row shows no date) | **MATCH** | n/a | 17 memories |
| MAP | **MATCH** (marker pos 0) | **MATCH** | n/a | **MATCH** | **MATCH** `上海市, 中国` | 14 markers |
| ADD after save | n/a | **MATCH** (draft cleared) | n/a | **MATCH** (0 draft photos) | n/a | — |
| US | **MATCH** (shared pos 0) | **MATCH** | **MATCH** `Sep 29, 2026` | **MATCH** | n/a | 17 meals / 16 places |
| ME | n/a | n/a | n/a | n/a | n/a | **MATCH** 17 meals / 16 places |

**No MISMATCH on any surface.** The only row that is `NOT APPLICABLE` is Me, which shows archive
aggregates rather than per-record rows — its numbers equal Us's exactly.

> One earlier probe iteration wrote a record whose `city` I had overridden on top of a leftover draft's
> location, producing a record with `city 苏州市` but a Shanghai address. That was a **probe artifact,
> not a product defect**: the leftover draft (from a previous session) already carried Shanghai's
> address, coordinates and `locationSource`, and my probe only replaced the city. It was deleted and
> recreated with a single consistent location source, which produced `上海市, 中国` with a matching
> address. Reported rather than silently normalized.

## 16. Bugs discovered

**None.** No FUNCTIONAL-P0, no FUNCTIONAL-P1, no VISUAL-REGRESSION and no TEST/TOOLING defect was found
in the end-to-end journey.

Two behaviours were investigated and confirmed to be **correct by design**, not defects:

1. During identity diagnosis mode the store reports 0 memories. This is the identity fence's fail-closed
   redaction; after the mode ends the count returns to 17 with the record intact — **no data loss**.
2. Map shows fewer markers than the memory count. Markers are marker *roots*; the drawer clusters
   co-located memories, so 13 memories legitimately produce 6 roots. The ids and photos of the shared
   records match Home.

## 17. Fixes applied

**None.** No production file was modified during this pass. The only writes were to the dev store during
the Add/photo probes, and all of them were reverted through production paths:
3 synthetic records deleted via `store.deleteMemory` (19 → 16, back to the original count), the draft
cleared via `store.clearDraft()`, and the settings restored to `pearl / en / reduceMotion:false /
showNativePoi:true`.

## 18. Regression guards added

**None.** The brief's rule is to guard each real bug, and there was no bug. Existing coverage already
protects every contract this pass exercised: `verify-cloud` (page registration hashes, identity state,
country semantics, Add save/rating/location, the POI preference), `verify-map-*` (search, clearance,
drawer, zoom, overview), `verify-ui` (per-page image `binderror`), `verify-visual-language`,
`verify-memory-return`, `verify-icons` and `verify-store-boundaries`.

## 19. Verification results

| Command | Result |
|---|---|
| `npm run verify` | **EXIT 0** — FINAL STATIC VALIDATION: PASS |
| `verify:cloud` | **EXIT 0** — 272/272, all UI registration gates green |
| `verify:ui` | **EXIT 0** — 43/43 |
| `verify:icons` | **EXIT 0** |
| `npm run verify:all` | **EXIT 0** — log `.workbuddy-ai/scratch/journey/verify-all.log` |

## 20. Frozen-page checkpoint impact

**None.** No frozen production file changed, so no registration checkpoint needed to be reopened and
none was advanced. All five registrations remain exactly as approved:

| Page | Checkpoint | Registered sha256 |
|---|---|---|
| Home | `home-identity-review.json` | `02ae8dcf…` / `650a891e…` |
| Map | `map-identity-review.json` | `4522d594…` / `c13016f3…` |
| Add | `add-page-review.json` | `10f6501a…` / `df572eae…` |
| Us | `us-identity-review.json` | `dcae6d39…` / `98bd3268…` |
| Me | `me-profile-review.json` | `af025665…` / `4f287a95…` |

## 21. Recommendation

**PRODUCT JOURNEY — READY.**

All fifteen journeys pass end to end on the frozen UI, the cross-tab data consistency matrix shows no
mismatch, no production file was touched, and the full verification set is green. Nothing was committed,
pushed or deployed.
