# Map — Final Refinement (lightweight completion pass)

Date: 2026-09-30
Scope: `miniprogram/pages/map/**` + the Map display preference in the shared settings pattern.
Home and Add are frozen and were not touched.
Method: real-runtime geometry probes + programmatic pixel measurement against `docs/design/0.savor-concept.png`.

**Revision 2 (same day):** MAP-P0-1 was corrected. The first pass hardcoded `enable-poi="{{false}}"`,
which encoded the wrong product decision — native POI / landmark names are geographic context and must
stay available, with the user choosing whether to simplify the map. See §3.

## 1. Reference measurement

The concept board's Map panel was measured programmatically: screen box **x 362..658, y 108..773**
(297 px) ⇒ **1 concept px = 2.525 rpx**.

| Reference | Concept board | Map before this pass | Verdict |
|---|---|---|---|
| Header title "Map First" left rail | 45 rpx | 40.3 rpx | see MAP-P0-3 |
| Search field left / right rail | 45 / 45 rpx | 33.3 / 33.3 rpx | see MAP-P0-3 |
| Title ↔ search field alignment | **both 45 rpx — one rail** | **40.3 vs 33.3 rpx — 7 rpx apart** | **defect → MAP-P0-3** |
| Search field inner padding to the magnifier | 28 rpx | 30 rpx | match |
| Map canvas | quiet base layer with faint roads | ~25 provider POI markers + ~20 dark POI labels in one viewport | MAP-P0-1 (revised — see §3) |
| Selected place card | name / category / place line / date + bookmark + photo | same, plus the product's own Correct / Open map actions | match (actions are existing product behaviour) |
| DUSK header scrim | n/a (board is pearl only) | decays from the first pixel | **defect → MAP-P0-2** |

## 2. Map final audit

| REGION | CURRENT ISSUE | WHY IT MATTERS | SEVERITY | CHANGE NEEDED? |
|---|---|---|---|---|
| HEADER | the title carried its own extra 8 rpx inset on top of the header padding, so it sat 7 rpx right of the search field it belongs to, and the whole header was off the shared page gutter | The concept starts the "Map First" glyph on the field's own left edge; a broken rail reads as unfinished | P0 (polish/hierarchy) | **yes — MAP-P0-3** |
| SEARCH | height 95 rpx, radius 37 rpx, 88 rpx targets, clear + filter states, placeholder localised | lightweight utility, not a form field | — | no |
| MAP CANVAS | the provider POI layer made the base map loud by default and the memory pin had to compete with it | "Do not let the base map become the visual subject" | P0 (memory hierarchy) | **yes — MAP-P0-1 (revised)** |
| MEMORY PINS | photo tiles with the stack toggle; selected state adds the toggle + badge; touch targets are the drawer's own 44×40 px hit regions | reads as memory objects, not generic markers | — | no (frozen by the map review chain) |
| CLUSTERS | 4 drawers for 6 markers; a drawer holds up to 3 rows with a paging strip; the root stays anchored | works; no counter-style cluster exists | — | no |
| SELECTED PIN | the drawer toggle is the selected affordance, 320 ms, no bounce/glow/pulse | calm | — | no |
| LOCATION / RECENTER | 88 rpx circle, aria "Show all mapped memories", stacks a 72 rpx stepper below on one axis | No location-permission path exists (`recenter()` is an overview, not `getLocation`) | — | no |
| SELECTED PLACE CARD | 340 rpx, name 42 rpx serif, two metadata lines, date, bookmark, Correct / Open map, 280 rpx photo inset 30 rpx | matches the board's structure | — | no |
| PIN → CARD CONTINUITY | `selectedId` drives both the drawer and the card from one `applyFilters` pass | single source, no stale path | — | no |
| EMPTY / NO RESULT | `map-empty` is only mounted when `visible.length === 0`, and `selected` falls back to `visible[0]`, so an empty card can never render with a null state | verified by source; complete | — | no |
| LOADING / ERROR | identity pill, `map-fallback` (icon + title + text + retry) with no remote dependency | complete. The identity pill still carries a hardcoded Chinese literal on Map/Us/Me — a cross-page item | P2 | no (documented) |
| MAP PROVIDER / TILE FALLBACK | `binderror="onMapError"` swaps in `.map-fallback` | complete | — | no |
| BOTTOM NAV | card bottom = `--tab-clearance` + 20 rpx; measured card bottom 770 against a 795 tab-bar top | — | — | no |
| MOTION | drawer 320 ms transform driver, card collapse 320 ms, `quiet` disables all of it | restrained | — | no |
| IMAGE FALLBACK | `place-photo` has no `binderror`, unlike every other page's photos | Real gap, not reproducible with the current data set | P2 | no (documented) |
| PEARL / DUSK | DUSK's header subtitle sat at **~1.8:1** contrast | The scrim decays from the first pixel while the map tiles stay light in both themes; **no text colour can recover** (pure white tops out at 3.65:1) | P0 (map readability) | **yes — MAP-P0-2** |
| CHINESE / ENGLISH | 美食地图 / 去回忆发生的地方看看。/ 搜索餐厅、地点或标签 / 尚未记录类别 / 2026年9月28日 / 校正位置 / 在腾讯地图打开 | complete, no meaning-destroying truncation | — | no |
| RESPONSIVE | search and controls are rpx; card image/text split is `calc(100% - 310rpx)` | verified at the supported 428 pt | — | no |

## 3. Selected MAP-P0 issues

* **MAP-P0-1 — native POI visibility is a user preference, default ON.** (Revised in this pass.)
  The first pass hardcoded `enable-poi="{{false}}"`. That was wrong: it obtained pin hierarchy by
  removing useful geographic context by default. Native POI / landmark names are **context**; Savor's
  photo pins are the **product content** and stay more prominent through the existing pin treatment and
  selection hierarchy — no pin redesign. `enable-poi` is now driven by product state, the default is ON,
  and the user can switch it OFF from a secondary map-display utility in the existing tool column.
* **MAP-P0-2** — the DUSK header subtitle was effectively unreadable (~1.8:1) because the DUSK top scrim decayed from its first pixel.
* **MAP-P0-3** — the header title and the search field sat on two different left rails, and the header was off the shared page gutter.

## 4. POI state model

| | |
|---|---|
| State | `showNativePoi` (boolean) |
| Product default | **`true`** — declared in `utils/data.js` `defaultSettings`, so every device starts with native POIs visible |
| Scope | presentation only. It binds `enable-poi` and nothing else: memory data, markers, `selectedId`, filtering, geocoding, place identity, card identity, search semantics and the camera are untouched |
| Control | one 88 rpx control appended to the existing `.map-tool-column` (below the recenter + zoom stepper). Glyph is `map-pin` when ON and `map-pin-off` when OFF, so the state never depends on colour alone. No dimming: both states are valid product modes, not enabled/disabled |
| Accessible label | ON → `Hide map places` / `隐藏地图地标`; OFF → `Show map places` / `显示地图地标`, through the existing locale catalog |
| Motion | none added; the existing `ui-pressed` feedback only. Provider POIs are never animated |

## 5. Exact files changed

| File | Change |
|---|---|
| `miniprogram/pages/map/index.wxml` | `enable-poi` now bound to `showNativePoi`; one POI toggle added to the tool column |
| `miniprogram/pages/map/index.wxss` | `.map-head` padding `35rpx` → `var(--page-gutter)`; `.map-heading` margin `0 8rpx` → `0`; `.dusk .map-top-fade` gains a 55% hold stop; `.poi-toggle` added |
| `miniprogram/pages/map/index.js` | `data.showNativePoi: true`; `syncState` reads `state.settings.showNativePoi !== false`; `onToggleNativePoi()` writes it through `store.updateSettings` |
| `miniprogram/utils/data.js` | `defaultSettings.showNativePoi: true` |
| `miniprogram/utils/settingsRepository.js` | `showNativePoi` added to `DEVICE_KEYS` (device-level, no owner lease) |
| `miniprogram/utils/identity.js` | `normalizeDeviceSettings` whitelists a boolean `showNativePoi` |
| `tools/lib/locale-translations.tsv` | +2 lines (`Hide map places` / `Show map places`) |
| `miniprogram/utils/locales.js` | regenerated by `npm run build:locales` |
| `tools/verify-visual-language.cjs` | +1 contract: the Map header rail + both-theme scrim hold (RED-proven) |
| `tools/verify-visual-language.cjs` | +1 contract: native POI visibility is a user preference that defaults ON (RED-proven) |
| `tools/verify-icons.cjs` | template-declaration count 87 → 88; both POI toggle icons must resolve; the pass message now prints the asserted count instead of a stale literal |

## 6. Preference persistence — reused, not invented

The project already has an established **local, device-level UI-preference** pattern:
`theme` / `language` / `reduceMotion` are declared in `data.defaultSettings`, listed in
`settingsRepository.DEVICE_KEYS` (so they need no owner lease), whitelisted in
`identity.normalizeDeviceSettings`, and written through `store.updateSettings`. The POI choice rides
exactly that path, so it is remembered per device with no new settings architecture, no new storage key
and no cloud projection change (`profileRepository.PREFERENCES` is an explicit list and was not touched).

Because the default lives in `defaultSettings` and the stored value is per device, a user who hides POIs
only changes **their own device**. The product default stays ON.

## 7. Measured before / after

Page coordinates at 428×926 (1 rpx = 0.5707 px).

| Probe | Before | After |
|---|---|---|
| `.map-heading .heading-title.left` | 23 | **22** |
| `.map-search.left` | 19 | **22** (same rail as the title) |
| `.map-search.width` | 390 | 384 |
| `.poi-toggle` | — | l 353.7, t **384.7**, 51.3 × 51.3 (88 rpx), bottom 436 — 138.7 px clear of the place card at 574.7 |
| `.map-top-fade` backdrop under the subtitle (DUSK) | 113–133 | 25–54 |
| DUSK subtitle contrast (worst / mean) | **1.8 / ~1.9 : 1** | **5.43 / 7.49 : 1** |
| PEARL subtitle contrast (worst / mean), unchanged | 5.36 / 5.56 | 5.36 / 5.56 |
| Provider POI markers in one viewport, default | ~25 | **~25 (ON by default, as required)** |
| Provider POI markers, after the user switches OFF | ~25 | **0** |

Screenshots: `cmp-poi-pearl.png`, `cmp-poi-dusk.png` (ON | OFF), `poi-on-zh.png`,
`cmp-map-pearl.png`, `cmp-map-dusk.png`, `map-search-hit.png`, `map-search-empty.png`.

## 8. State behaviour results

Measured with the real handler on the running page (428×926, PEARL, EN):

| Requirement | Result |
|---|---|
| 1. First entry → POI ON | PASS — `showNativePoi: true`, `settings.showNativePoi: true` |
| 2. Toggle OFF → provider POIs disappear, Savor pins remain | PASS — flag `true → false`; `markers` 6 → **6** |
| 3. Toggle ON again → POIs return, Savor pins remain | PASS — flag `false → true`; `markers` **6** |
| 4. Selected memory stays selected | PASS — `selected.id` unchanged (`5bfe462e…`) through both flips |
| 5. Selected-place card unchanged | PASS — same record, same card |
| 6. Current search query unchanged | PASS — `query` unchanged |
| 7. Map centre / zoom do not reset | PASS — `mapScale` 13 → 13; no camera command is issued by the toggle |
| 8. Recenter / overview still works | PASS — untouched code path |
| Not a page reload | PASS — the toggle only writes a settings value; the page keeps its identity, markers and selection |

## 9. PEARL / DUSK results

Both states captured in both themes. The approved DUSK scrim correction is intact (worst 5.43:1).
The toggle uses the same floating-control material as the recenter and gets the same `.dusk` surface
override, so it reads correctly in DUSK without a new treatment. Provider POI colour/theme behaviour was
not touched — no supported native option was used for it.

## 10. Chinese / English, accessibility

| State | EN | ZH |
|---|---|---|
| ON (tapping hides them) | `Hide map places` | `隐藏地图地标` |
| OFF (tapping shows them) | `Show map places` | `显示地图地标` |

Both resolved live from the catalog in the running page (`copy.seb662620b5` / `copy.s156290796b`), and
both are asserted by the new contract. The state is carried by the glyph (`map-pin` / `map-pin-off`), so
it is understandable without colour. Touch target 88 rpx, matching the recenter.

## 11. 13-dimension evaluation (final)

| # | Dimension | Verdict | Reason |
|---|---|---|---|
| 1 | overall hierarchy | **BETTER** | the pin is the subject; the base map is context at the user's chosen level |
| 2 | map-as-background restraint | **BETTER** | the loud layer is now opt-in, not removed |
| 3 | pin prominence | **BETTER** | unchanged pin treatment, no longer the only thing competing for attention by default |
| 4 | selected-pin clarity | SAME | the drawer toggle was already the selection affordance |
| 5 | search clarity | **BETTER** | shares the title's rail |
| 6 | selected-card hierarchy | SAME | untouched |
| 7 | metadata density | SAME | untouched |
| 8 | photo prominence | SAME | untouched |
| 9 | spatial continuity | SAME | untouched |
| 10 | PEARL calmness | SAME | unchanged |
| 11 | DUSK calmness | **BETTER** | the header scrim reads as one intentional band |
| 12 | state completeness | **BETTER** | the POI choice is now a complete, remembered, accessible state |
| 13 | overall product completeness | **BETTER** | hierarchy obtained by user choice, not by deleting information |

## 12. Updated regression guard

`tools/verify-visual-language.cjs` now carries **13** contracts. The Map pair asserts the requirement,
never a variable name and never `enable-poi = false`:

1. **Map header keeps one rail and both themes hold their top scrim** — the header padding must resolve
   to the shared page gutter, the heading must add no inset, and both the pearl and dusk scrims must
   hold a stop (≥ 30% for dusk).
2. **Map native POI visibility is a user preference that defaults ON** — it extracts the bound name from
   `enable-poi="{{ … }}"`, then asserts: the binding is not a literal; the page default is `true`; the
   device-level default is `true`; the preference is written through `updateSettings`; Savor's `markers`
   binding is not conditioned on the flag; and the control carries the `Hide map places` /
   `Show map places` accessible label pair from the catalog.

**RED proof, both cases replayed against the same assertions:**

* pre-revision source (`enable-poi="{{false}}"`) → `enable-poi must be bound to product state, not a hardcoded literal`
* bound correctly but the page default OFF → `the page default must show native POIs`

`tools/verify-icons.cjs` additionally asserts that **both** POI toggle glyphs resolve, so neither state
can silently paint an empty circle.

## 13. Verification

* `npm run verify:visual-language` → **EXIT 0**, 13 contracts.
* `npm run verify:icons` → **EXIT 0** (generator re-run, no drift).
* `npm run verify:ui` → **EXIT 0 / 43/43**.
* `npm run verify` → **EXIT 0 / 359/359**, FINAL STATIC VALIDATION: PASS.
* `npm run verify:store-boundaries` → **EXIT 0**.
* `npm run verify:cloud` → **EXIT 1, single assertion = the Map UI registration checkpoint** (see §14).
  All chain `baseSha256` assertions pass, so the chain is intact.
* `npm run verify:all` → log `.workbuddy-ai/scratch/map-final/verify-all-poi.log`.

## 14. Map UI registration checkpoint — ADVANCED (approved 2026-09-30)

`tools/map-identity-review.json` now registers the approved final Map implementation. **Only `sha256`
moved**; `baseSha256`, `review`, the chain structure and `verify-cloud.cjs` are untouched, and
`reviewed-map-veil-removal.cjs`'s hardcoded base hashes still hold.

| File | baseSha256 (untouched) | sha256 OLD → NEW |
|---|---|---|
| `miniprogram/pages/map/index.wxml` | `464c48ae…` | `d1de466e…` → **`e2bcd85a…`** |
| `miniprogram/pages/map/index.wxss` | `1af64be70016…` | `d6182bec…` → **`c13016f3…`** |

`reason` was a pure append for both entries (original prefixes preserved verbatim, 1710 → 2897 and
1269 → 2118 chars), recording MAP-P0-1 / MAP-P0-2 / MAP-P0-3 and the icon refinement, plus the search-icon
finding: the glyph was **already** the project's Lucide `search` through the existing registry, so the
correction is purely optical (37rpx → 42rpx).

`pages/map/index.js` is not in the UI manifest, so the preference plumbing needs no checkpoint entry.

## 15. Icon refinement (Revision 3, same day)

Scope: the Map page's three icon presentations only. No structure, card, pin, search or state logic,
and no checkpoint file, was touched.

### 15.1 The two right-side utility circles were near-duplicates

`map-pinned` (recenter) and `map-pin` (POI toggle) are both Lucide teardrop pins; the only difference is
the base bar under `map-pinned`. At 22.8 px vs 20.5 px the two floating circles read as the same glyph.

The POI toggle legitimately needs the pin family — `map-pin` / `map-pin-off` is the only true on/off
"places" pair in the registry, and the ON/OFF distinction must not depend on colour. So the recenter
moved instead:

| Control | Before | After | Why |
|---|---|---|---|
| Upper right (recenter, aria "Show all mapped memories") | `map-pinned` | **`map`** | A folded map is the only registry glyph that means "the whole map / all memories" without implying a capability the product lacks. Its rectangle-and-folds silhouette is unmistakable next to a teardrop pin. It also removes an on-screen duplicate: the selected Map tab morphs `map` → **`map-pinned`**, so the old recenter was drawing the same glyph as the tab bar's selected icon. |
| Lower right (POI toggle) | `map-pin` / `map-pin-off` | **unchanged** | Already semantically exact and already the required non-colour-coded pair. |

`navigation` (the arrow shown in the concept board's circular control) was **rejected**: it is the
conventional "locate me" glyph, and this product has no geolocation path (`show-location="{{false}}"`,
no `getLocation`) — it would imply a function the button does not have. Semantic clarity was the stated
first criterion.

Comparison of the pair:

| Criterion | Before | After |
|---|---|---|
| Semantic match | pin = "a place" for both | map = "all memories" / pin = "map places" |
| Silhouette contrast | same teardrop, differing base bar | rectangle-with-folds vs teardrop — no shared contour |
| Small-size readability (20–23 px) | the two bases blur together | both shapes stay legible |
| PEARL readability | good | good |
| DUSK readability | good | good (both are outlines on the same floating surface) |

### 15.2 The search icon was ALREADY from the Morphicons/Lucide pipeline

Explicit answer: **yes.** `<s-icon name="search">` resolves through `utils/icons.js` → `iconSvg()`,
which is generated by `tools/build-icons.cjs` from the 49 pinned Lucide SVGs, and renders as a
`data:image/svg+xml;charset=utf-8,…` URI inside a plain `<image>`. There is no bitmap, no scaled raster,
no one-off hack. The magnifier's own path is Lucide `search`:
`<path d="m21 21-4.34-4.34"/><circle cx="11" cy="11" r="8"/>`.

**Root cause of the softness — three real contributors, in order of weight:**

1. **Optical weight, not resolution.** At `size="37"` the box was 21 px for a 24-unit viewBox, so the
   `stroke-width="1.75"` token landed at **1.53 px**. The magnifier is also the only glyph on the page
   made of a single thin open *curve*. Its neighbours are either axis-aligned (`+`, `−`, which land on
   the pixel grid and read solid) or ink-dense (`sliders-horizontal`, the pins). A 1.5 px ring next to a
   solid cross reads as washed out even when it is a mathematically perfect vector.
2. **Non-integer raster scale.** 21 px for a 24-unit grid is 0.875; at DPR 3 that is 2.625 device px per
   unit, so every curve edge is anti-aliased across a fractional pixel. No size removes this entirely
   for a 1.75-unit stroke on a 24-unit grid, but a larger box reduces the fraction.
3. **Capture, not render.** The DevTools render surface here is **279×600 for a 428×926 window (0.65)** —
   `optimize:false` still returns 279×600. Any 1.5 px stroke is downsampled to ~1 px in a screenshot, so
   the simulator capture cannot represent the real render's sharpness. That is why it *looked* blurrier
   in evidence than it is on a device.

**Fix:** `size="37"` → **`size="42"`**. The box becomes 23 px, the token stroke becomes a true 1.68 px
(+10 % optical weight), and the icon now reads at the same ink density as the placeholder text and the
filter glyph beside it. No other property changed — same family, same `stroke="1.75"`, same colour
tokens, same `aspectFit` rendering path.

| | Before | After |
|---|---|---|
| Rendered box (428 pt) | 21 px | **23 px** |
| Effective stroke | 1.53 px | **1.68 px** |
| Raster scale (24-unit grid) | 0.875 | 0.958 |
| Source | Lucide `search` SVG | Lucide `search` SVG (unchanged) |

### 15.3 Icon family consistency (all three)

| | Search | Recenter | POI toggle |
|---|---|---|---|
| Family | Lucide (Morphicons registry) | Lucide | Lucide |
| Stroke token | 1.75 | 1.75 | 1.75 |
| Rendered box | 23 px | 22.8 px | 20.5 px |
| Colour token | `#565752` / dusk `#d7d1c7` | `#1b1c1a` / dusk `#eeeae3` | same as recenter |
| Container | 95 rpx bar, left padding 30 rpx | 88 rpx circle | 88 rpx circle |

No icon is bolder, blurrier or more detailed than the others: all three are the same family at the same
stroke token, and the only size differences are the pre-existing ones.

### 15.4 Files changed in this step

| File | Change |
|---|---|
| `miniprogram/pages/map/index.wxml` | recenter `name="map-pinned"` → `name="map"`; search `size="37"` → `size="42"` |
| `tools/verify-icons.cjs` | +1 assertion: the Map recenter must not reuse a pin glyph beside the pin-family POI toggle (RED-proven) |

Nothing else: no WXSS, no JS, no checkpoint, no other page.

### 15.5 Verification for this step

* `npm run verify:icons` → **EXIT 0** (88 template declarations, generator re-run, no drift).
* RED proof: restoring `name="map-pinned"` on the recenter fails with
  `the Map recenter must not reuse a pin glyph (map-pinned) beside the pin-family POI toggle`.
* `npm run verify:visual-language` → **EXIT 0**, 13 contracts.
* `npm run verify:ui` → **EXIT 0 / 43/43**; `npm run verify` → **EXIT 0 / 359/359**.
* `npm run verify:all` → log `.workbuddy-ai/scratch/map-final/verify-all-icons.log`; the single expected
  red remains the Map UI registration checkpoint (§14), which was **not** touched in this step.

## 16. Stale-assertion cleanup (Revision 4) and final status

Two pre-existing assertions pinned the recenter's **superseded** glyph (`name="map-pinned"`), which the
approved icon refinement replaced with `map`. They were updated to protect the product contract instead
of a spelling. **No production file was touched in this step.**

| File | Old assertion | New semantic contract |
|---|---|---|
| `tools/verify-map-zoom-stepper.cjs` (test `UI: vertical stepper, no scale number, existing icon system, one tool column`) | `assert(column.includes('name="map-pinned"'), 'recenter keeps its icon')` | The pin family is **derived from the POI control's own bound glyphs**, then: `assert(!pinFamily.test(overviewGlyph))` — the overview control must not reuse the POI control's pin family — followed by `assert.equal(overviewGlyph, 'map')` — the overview control uses the map glyph. The existing `recenter stays inside the shared column` and `recenter keeps its handler` assertions are untouched. |
| `tools/verify-map-overview-label.cjs` | `assert(control.includes('name="map-pinned"'))` | Same two rules, plus the original `{{copy.<Show all mapped memories key>}}` label and `bindtap="recenter"` handler assertions, now with explicit failure messages. |

The distinction the tests now communicate: **overview ≠ POI visibility**. Because the pin family is
read from the POI control rather than hardcoded, re-pointing either control at the other's family fails
here instead of the two silently agreeing with each other. Both `map` and `map-pinned` are **not**
accepted — the equality assertion pins the approved glyph exactly.

**RED / GREEN proof** (both suites replayed as child processes against an injected in-memory WXML; no
file written):

| Case | `verify-map-zoom-stepper` | `verify-map-overview-label` |
|---|---|---|
| RED 1 — old product state, overview = `map-pinned` | **exit 1** (23 passed, 1 failed) | **exit 1** — *the overview control must not reuse the POI control pin-family glyph (map-pinned)* |
| RED 2 — overview = `search` (not a pin, but not the approved glyph) | **exit 1** (23 passed, 1 failed) | **exit 1** — *the overview control uses the map glyph* |
| GREEN — approved state, overview = `map` | **exit 0** (24 passed, 0 failed) | **exit 0** |

RED 2 proves the approved-glyph assertion is independently live, not dead code behind the family rule.

## 17. Final status

**MAP — FROZEN** (2026-09-30).

Map may reopen only for: 1) a reproducible functional bug, 2) a reproducible visual regression,
3) a new explicit product requirement. It must not reopen for icon preference, POI styling preference,
spacing polish, or another concept-matching pass.

Known cross-surface follow-ups, explicitly **not** Map visual blockers and not reopened here:
`place-photo` has no `binderror` while every other page's photos do; the identity pill's
`正在验证...` literal is still hardcoded on Map / Us / Me.
