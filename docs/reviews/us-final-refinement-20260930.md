# Us — Final Refinement (lightweight completion pass)

Date: 2026-09-30
Scope: `miniprogram/pages/us/**` only. Add, Home and Map are frozen and were not touched.
Method: real-runtime geometry probes + programmatic measurement against `docs/design/0.savor-concept.png`.
No redesign, no relationship/date/memory-query/identity/navigation logic change.

## 1. Reference measurement

The concept board's Us panel was measured programmatically. Its identity card and journey card are the
first two surfaces after the header — there is **no management button and no scope paragraph** above
them, and the journey's third stat is a **single word** ("Countries").

| Reference | Concept board | Us before this pass | Verdict |
|---|---|---|---|
| Header title rail | aligned with the surfaces below it | **26** vs every surface at **22** | **defect → US-P0-3** |
| Couple avatars | two equal circles + a filled heart | two equal 132rpx circles + a filled heart, symmetric | match |
| "Together for / 427 days" | label above a large serif number | label 24rpx above a 70rpx serif number, centred | match |
| Journey stats | three columns, one word each, hairline dividers | three columns; the third label wraps to two lines (EN) | see §2 (documented) |
| Journey "Latest" photo | a rounded photo of the place | a **92rpx circle** | **defect → US-P0-2** |
| Shared Moments cards | portrait rounded rects, name + date + heart | 250×342rpx, radius 35rpx, name + date + heart | match |
| Identity status copy | n/a | hardcoded `正在验证...` | **defect → US-P0-1** |

## 2. Us final audit

| REGION | CURRENT ISSUE | WHY IT MATTERS | SEVERITY | CHANGE NEEDED? |
|---|---|---|---|---|
| HEADER | the heading carried its own extra 8rpx inset, so "Us" and its subtitle sat 4px right of every surface on the page | The frozen Map pass made exactly this change for the same reason: the title belongs on the shared content rail | P0 (polish/rail) | **yes — US-P0-3** |
| COUPLE / IDENTITY CARD | none visible. Both avatars 75×75 px at the same y, symmetric 19 px gaps around the heart, heart vertically centred, duration centred | the emotional core reads as "these two people share this space" | — | no |
| AVATARS | equal diameter (132rpx), equal 5rpx white ring, equal box-shadow; the missing-partner case has a deliberate `avatar-blank` fallback | both people are visually equal | — | no |
| RELATIONSHIP DURATION | 24rpx muted label over a 70rpx serif number, both centred; singular/plural handled (`day` / `days`) | quiet milestone, not a streak | — | no |
| JOURNEY SUMMARY | the third label ("Saved memories", 14 glyphs at 25rpx) is ~2rpx wider than its column, so it wraps to two lines and breaks the three-column rhythm | Visible in EN; the concept uses a single word. Fixable by a 1rpx label-size change | P1 | documented, not fixed (P0 cap) |
| LATEST PLACE | the thumbnail was a **circle** — the only circular photo in the product, and it repeated the two avatar circles one card above | Reads as a third person rather than place evidence; the brief forbids an Us-only photo aesthetic | P0 (concept/photo language) | **yes — US-P0-2** |
| SHARED MOMENTS | title 32rpx serif, "See all" quiet text, 250×342rpx portrait cards, 17rpx gap, name + date over a gradient shade, 88rpx heart target | photo-led, metadata supportive | — | no |
| SEE ALL | muted 26rpx text at the section title's baseline, right edge 2px inside the card rail | discoverable but quiet | — | no |
| EMPTY / NO RESULT | `shared-empty` inside the gallery with two copy keys | complete | — | no |
| LOADING | the identity pill rendered a **hardcoded Chinese literal** in the EN locale | Same defect the Home pass fixed; the key already exists | P0 (state/i18n) | **yes — US-P0-1** |
| ERROR | ambient photo has `binderror`; every dynamic `<image>` has `binderror` | complete | — | no |
| IDENTITY / AUTH | inline pill + store-driven redaction, unchanged | complete | — | no |
| BOTTOM NAV | `.tab-spacer` = `--tab-clearance` + 24rpx | — | — | no |
| PEARL / DUSK | both coherent; DUSK keeps the photos as the energy source | — | — | no |
| CHINESE / ENGLISH | both captured; ZH `我们` / `我们的空间，共同的回忆。` / `已经相伴 14 天` / `我们的旅程` / `16 餐食 15 地点 0 收藏回忆` / `最近：苏州市, 中国` / `共享时光` / `查看全部` | complete | — | no |
| RESPONSIVE | avatars 132rpx, cards `calc(100% - …)`-free rpx layout | verified at the supported 428 pt | — | no |
| SURFACE HIERARCHY | Identity → Journey → Photos is intact; one divider inside the journey card, no card-in-card | — | — | no |
| PRE-IDENTITY BLOCK | a management button and a scope paragraph sit **above** the identity card, so the first thing after the header is admin copy | The brief's order is "who we are" first | P1 | documented, not fixed (reviewed placement) |
| MANAGE BUTTON | declares `width: 100%` but renders 184 px wide (left-aligned) and its label wraps with an orphan ("& wishlist" / "Wishlist") | The declared width is silently ignored by the `<button>` element — a real rendering gap | P1 | documented, not fixed (needs a WXML element swap) |

## 3. Selected US-P0 issues

* **US-P0-1** — the identity/loading status copy was a hardcoded Chinese literal and never translated.
* **US-P0-2** — the "Latest" journey thumbnail was a circle: the only circular photo in the product, repeating the avatar language one card below.
* **US-P0-3** — the header title and subtitle did not sit on the shared content rail.

Three real issues; nothing manufactured. The journey-label wrap, the pre-identity ordering and the manage
button's ignored width are documented above with severity, not fixed (P0 cap).

## 4. Exact files changed

| File | Change |
|---|---|
| `miniprogram/pages/us/index.wxml` | `<text>正在验证...</text>` → `<text>{{copy.s691f4302fc}}</text>` (reuses the key added for Home; no new locale entry) |
| `miniprogram/pages/us/index.wxss` | `.us-heading` margin `0 8rpx` → `0`; `.journey-latest-photo` border-radius `50%` → `var(--radius-image, 28rpx)` |
| `miniprogram/utils/locations.js` | **compliance correction** — see §9 |
| `tools/verify-cloud.cjs` | the country assertion updated and a compliance contract added — see §9 |

No JS was touched on the Us page. `pages/us/index.js` is byte-identical.

## 5. Measured before / after

Page coordinates at 428×926 (1 rpx = 0.5707 px).

| Probe | Before | After |
|---|---|---|
| `.us-heading .heading-title.left` | **26** | **22** (== `--page-gutter`, same rail as the button, both cards and the gallery) |
| `.us-heading .heading-sub.left` | 26 | **22** |
| `.manage` / `.together-card` / `.journey-card` / `.shared-section` | 22 | 22 (unchanged) |
| `.journey-latest-photo` box | 52×52 px, `border-radius: 50%` | 52×52 px, `border-radius: 28rpx` (geometry unchanged, shape corrected) |
| `copy.s691f4302fc` on Us | `'正在验证...'` (hardcoded) | resolves to `Verifying…` (EN) / `正在验证…` (ZH) |

Screenshots: `cmp-us-pearl.png` (before | after), `zoom-latest-*.png` (the shape change), `us-dusk-after.png`,
`us-zh-after.png`.

## 6. Identity / journey results

* Identity card: two 132rpx circles, 5rpx ring, equal weight; heart 72rpx centred between them with 19 px
  gaps; "Together for" 24rpx over a 70rpx serif day count, centred. Unchanged — it already reads as
  "these two people share this space" before any number.
* Journey: three `flex: 1` columns with hairline dividers, numbers at `--type-stat-secondary`, then a
  divider and the Latest row. The latest photo is now a rounded place photo instead of a circle.

## 7. Shared Moments results

Photo-led and unchanged: 250×342rpx portrait cards, 35rpx radius, 17rpx gap, name + date over a gradient
shade, an 88rpx heart target at the bottom-right, and the copy inset 100rpx from the right so the heart
never overlaps the text. The first card starts on the content rail; the next card peeks inside the
gallery's own clip, so the horizontal edge treatment is unchanged.

## 8. State results

| State | Result |
|---|---|
| normal populated shared space | PASS |
| no shared memories | PASS by source — `shared-empty` with two copy keys inside the gallery |
| loading (identity pill) | **FIXED** — now bound to the locale catalog; `copy.s691f4302fc` resolves to `Verifying…` / `正在验证…`. Verified by binding + catalog resolution (the pill is only mounted while `!identityReady`, so it cannot be screenshotted without forcing a locked session) |
| error | PASS — `binderror` on every dynamic image + the ambient photo |
| identity / auth | PASS — unchanged |
| image fallback | PASS — `imageErrors[source]` → bundled fallbacks |
| empty journey | PASS — `days: 0` / `meals: 0` render as plain numbers, no placeholder invented |
| DUSK / Quiet | PASS — no motion was added |

## 9. Compliance correction (outside the visual scope, mandatory)

While auditing the journey/latest metadata the address parser was read and found to emit
`country: '台湾'` for a Taiwan address and `country: '香港' / '澳门'` for Hong Kong / Macao. That presents
Taiwan, Hong Kong and Macao as independent countries in stored data and in the rendered line
("高雄市, 台湾").

Corrected in `miniprogram/utils/locations.js`:
* Taiwan → `country: '中国台湾'` → displays "高雄市, 中国台湾"
* Hong Kong / Macao → `country: '中国'` → displays "香港, 中国" / "澳门, 中国" (previously "香港, 香港")
* mainland unchanged → "苏州市, 中国"

`tools/verify-cloud.cjs` now asserts the rule rather than the old value: `台湾高雄市苓雅區` and
`中国台湾台北市` must resolve to `中国台湾`, `香港中环` and `澳门大堂区` to `中国`, and none of them may
emit `台湾` / `香港` / `澳门` as the country.

This is a shared util, so it also corrects the same line wherever it appears (Home rows, Map card, Me).
No page's WXML/WXSS changed, so no frozen checkpoint is affected.

## 10. PEARL / DUSK results

Both captured. PEARL: light cards over the ambient photo; the identity card is the first heavy surface.
DUSK: dark card surfaces with the photos carrying the energy — the avatars and the shared-moment photos
are the only saturated areas, so the page stays intimate rather than becoming a dashboard. No new
surface, border or shadow was added in either theme.

## 11. Chinese / English results

| | EN | ZH |
|---|---|---|
| Header | Us / Our space. Our memories. | 我们 / 我们的空间，共同的回忆。 |
| Duration | Together for 14 days | 已经相伴 14 天 |
| Journey | Our Journey · 16 Meals · 15 Places · 0 Saved memories | 我们的旅程 · 16 餐食 · 15 地点 · 0 收藏回忆 |
| Latest | Latest: 苏州市, 中国 | 最近：苏州市, 中国 |
| Shared | Shared Moments / See all | 共享时光 / 查看全部 |
| Identity pill | Verifying… | 正在验证… |

The ZH journey labels are single-line; the EN third label wraps (documented in §2). No
meaning-destroying truncation in either locale.

## 12. Responsive

Verified at **428 pt** (the only width the tooling exposes). All three changes are rpx- or token-based:
the heading margin is gone, the photo radius is `--radius-image`, and the identity copy is a catalog
lookup. The identity card, the three journey columns and the horizontal gallery were all measured at
428 pt and their geometry is unchanged.

## 13. 13-dimension evaluation

| # | Dimension | Verdict | Reason |
|---|---|---|---|
| 1 | overall hierarchy | **BETTER** | the header now shares the surfaces' rail, so the eye drops straight into the identity card |
| 2 | emotional first impression | **BETTER** | the latest place no longer reads as a third person |
| 3 | couple-identity clarity | SAME | already correct and unchanged |
| 4 | relationship-duration restraint | SAME | unchanged |
| 5 | journey-summary balance | SAME | unchanged (the EN third-label wrap is documented) |
| 6 | latest-place hierarchy | **BETTER** | a rounded place photo reads as journey evidence instead of an avatar |
| 7 | Shared Moments prominence | SAME | unchanged |
| 8 | photo quality | **BETTER** | Us now uses the same image radius family as Add / Home / Map |
| 9 | metadata density | SAME | unchanged |
| 10 | PEARL calmness | SAME | unchanged |
| 11 | DUSK calmness | SAME | unchanged |
| 12 | state completeness | **BETTER** | the loading state is now localized in both locales |
| 13 | overall product completeness | **BETTER** | the three gaps are closed and the address country labels are compliant |

## 14. Verification

* `npm run verify` → **EXIT 0 / 359/359**, FINAL STATIC VALIDATION: PASS.
* `npm run verify:cloud` → **EXIT 1, single assertion = the Us UI registration checkpoint** (§15).
  All chain `baseSha256` assertions pass, so the chain is intact.
* `npm run verify:icons` → **EXIT 0**; `npm run verify:visual-language` → **EXIT 0** (13);
  `npm run verify:ui` → **EXIT 0 / 43/43**; `npm run verify:store-boundaries` → **EXIT 0**.
* `npm run verify:all` → log `.workbuddy-ai/scratch/us-final/verify-all.log`; it stops at the Us
  registration checkpoint above.

## 15. Us UI registration checkpoint — ADVANCED (approved 2026-09-30)

`tools/us-identity-review.json` now registers the approved Us final refinement. **Only `sha256` moved**;
`baseSha256`, `review`, the chain architecture, the historical baseline hashes and `verify-cloud.cjs`'s
gate logic are untouched.

| File | baseSha256 (untouched) | sha256 OLD → NEW |
|---|---|---|
| `miniprogram/pages/us/index.wxml` | `3abe216e…` | `003c8f20…` → **`dcae6d39…`** |
| `miniprogram/pages/us/index.wxss` | `a021a8db…` | `be9dfb43…` → **`98bd3268…`** |

`reason` was a pure append for both entries (171 → 1379 and 160 → 706 chars), recording the approved
scope: 1) localized identity verification copy; 2) Latest-place photo treatment; 3) header/content
shared-rail alignment; 4) existing Us state completeness confirmed; 5) PEARL / DUSK / Chinese / English
confirmed; 6) the Taiwan / Hong Kong / Macao country semantic correction and its regression protection;
7) the accepted "Saved memories" narrow-column optical trade-off.

`pages/us/index.js` is not in the UI manifest, so it needs no checkpoint entry.

## 16. Accepted optical trade-off (recorded, not a defect)

**"Saved memories"** may sit extremely close to the available third-column width at the approved
viewport. This is **not** a blocker for freezing Us. It must not be "fixed" by reducing Journey
typography, rewriting approved copy, changing the three-column structure, or adding locale-specific
one-off sizing. Reopen only if a real supported viewport produces a reproducible, visually unacceptable
wrap.

## 17. Recommendation

**US — FROZEN.**

Us may reopen only for: 1) a reproducible functional bug, 2) a reproducible visual regression,
3) a new explicit product requirement. It must not reopen for another avatar treatment, larger
relationship-day typography, statistics-card experimentation, another Shared Moments layout, new motion,
1–2rpx spacing preferences, or the accepted Saved-memories edge case without a real regression.
