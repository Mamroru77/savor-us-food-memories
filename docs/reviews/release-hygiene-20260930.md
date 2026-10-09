# Release hygiene fix — pre-hardware cleanup pass

> ⚠️ **SUPERSEDED IN PART — this is a dated historical report, not the current state.**
> Current state: [`docs/README.md`](../README.md).
>
> | Claim in this report | Status today |
> |---|---|
> | §8 Q1: the location failure literal is a "Chinese-only literal … resolves to itself and shows Chinese in both locales" | **DISPROVED (2026-10-01).** `i18n.t()` matches on `row.en === value \|\| row.zh === value`, and that literal **is** a catalog `zh` value (key `sada9a9ba03`), so it resolves to its English string. All six `i18n.t('<CJK>')` sites in the repo resolve; there was no leak. The call site was nonetheless normalised to reference its English key — rendered copy is unchanged in EN and ZH |
> | §8 STOP block: "Permission-recovery UI change requires approval … Not implemented, per the brief" | **IMPLEMENTED (2026-10-01)** under explicit authorization, in a scope narrower than sketched here: the recovery affordance is gated by authorized platform signals and lives only on `pages/add/index`; Me was audited and left unchanged. See `permission-recovery-20261001.md` |

Date: 2026-09-30
Scope: the four deterministic release findings from the Release Readiness QA that can be resolved
without hardware. **No frozen page visual surface was modified.** Real-device verification remains
outstanding and is **not** claimed here.

## 1. Exact files changed

| File | Change |
|---|---|
| `miniprogram/app.json` | removed `"pages/morph-lab/index"` from `pages` (10 → 9 entries) |
| `miniprogram/sitemap.json` | `allow *` → `disallow *` |
| `miniprogram/components/sheet/index.js` | `readingPosition` property declaration aligned with its three sibling page-binding properties |
| `tools/verify-cloud.cjs` | the app-registration assertion flipped to **require** that the dev lab is absent |
| `tools/fixtures/regression/ui-approved-updates.json` | `miniprogram/app.json`'s `sha256` advanced + `reason` appended |

No page WXML/WXSS, no page JS, no icon asset, no Morphicons runtime file changed.

## 2. morph-lab release result

Pre-edit confirmation, all four checks:

| Check | Result |
|---|---|
| Production navigation targets morph-lab | **none** — 0 external references outside its own directory |
| A component depends on the page registration | **none** |
| Morphicons production runtime depends on this page | **none** — no reference in `components/`, `utils/` or `vendor/` |
| Icon registry / morph components intact | **yes** — untouched |

**Smallest release-safe change taken:** only the production page registration was removed. The physical
`pages/morph-lab/index.{js,json,wxml,wxss}` files **remain** on disk, because
`tools/verify-cloud.cjs` still requires `morph-lab/index.js` for its `pairs` data (the Morphicons adapter
geometry test), and keeping them also keeps the icon template count and the UI-baseline hashes stable.

**Empirical proof of unreachability** (running mini program):

```
wx.navigateTo({url:'/pages/morph-lab/index'})
→ { reachable: false, errMsg: 'navigateTo:fail page "pages/morph-lab/index" is not found' }
```

`app.json` now registers 9 pages; the tabBar still has its 5 entries.

## 3. readingPosition exact root cause

**The value passed is `null`, and the component's own default is `null` — but the property was declared
`type: Object`, which rejects `null`.**

Evidence:

* The four pages that bind it (`home`, `map`, `us`, `me`) all set `sheetReadingPosition: null` in their
  initial data and again in `onSheetChange` / `onSheetClose` — so the binding resolves to `null`, a
  **non-object**.
* `components/sheet/index.js` declared it as `readingPosition: { type: Object, value: null }` — a
  self-contradictory contract: the declared **default is null** while the declared **type rejects null**.
* The same component already documents the correct convention two lines above, for its three sibling
  page-binding properties:

  ```js
  // type: null = accept any — page bindings resolve a tick later and
  // transient nulls must not spam the console with type warnings.
  type:      { type: null, value: '' },
  memoryId:  { type: null, value: '' },
  filter:    { type: null, value: '' },
  readingPosition: { type: Object, value: null },   // ← the odd one out
  ```

  Those three never warn (confirmed in the console: only `readingPosition` warned), which is direct
  evidence that the declaration — not the value — was the defect.

So the answer to "which primitive": **`null`** (deliberately, as the documented "no reading position yet"
value), not `undefined`, `false`, a string or a number.

## 4. readingPosition fix

The property contract now matches its siblings:

```js
// Same convention as its three siblings above: the documented "no reading
// position yet" value is null, so the contract is Object-or-null and a
// bare `type: Object` rejected the component's own default on every page
// entry. This is the property contract, not a coercion of the value.
readingPosition: { type: null, value: null },
```

This is a **property-contract correction at the shared source**, not a coercion of the value and not a
silenced warning: the value `null` is now a *valid* value for a contract that already documented null as
its default. No sheet visual, layout, motion, copy or behaviour changed; `components/sheet/index.js` is
not hash-pinned by any review chain, so no checkpoint was involved.

## 5. Runtime console result

Clean pass across Home → Map → Add → Us → Me after a recompile:

| Metric | Result |
|---|---|
| `readingPosition` type warnings | **0** (was: one per page entry) |
| Runtime errors (`grep -in error`) | **0** |
| Remaining warnings | only `[Perf]` framework timings (`App.onLaunch 117 ms` warm, `Page.onLoad/onShow` 52–144 ms) |
| Other component/property warnings | none |

The warning is gone because the contract is correct, not because output was suppressed — no other
warning took its place.

## 6. Sitemap classification

All 9 registered pages require a verified identity and render user-specific diary content:

| Page | Class |
|---|---|
| `pages/home/index` | PRIVATE / USER-SPECIFIC (tab) |
| `pages/map/index` | PRIVATE / USER-SPECIFIC (tab) |
| `pages/add/index` | PRIVATE / USER-SPECIFIC (tab) |
| `pages/us/index` | PRIVATE / USER-SPECIFIC (tab) |
| `pages/me/index` | PRIVATE / USER-SPECIFIC (tab) |
| `pages/account/index` | UTILITY / SETTINGS (identity-gated) |
| `pages/space/index` | PRIVATE / USER-SPECIFIC (identity-gated) |
| `pages/workspace/index` | UTILITY / SETTINGS (identity-gated) |
| `pages/reports/index` | PRIVATE / USER-SPECIFIC (identity-gated) |
| ~~`pages/morph-lab/index`~~ | DEV-ONLY — removed from the page registry in this pass |

**There is no PUBLICLY INDEXABLE page in this product.** No landing, marketing or public-read page exists.

## 7. Final sitemap policy

```json
{
  "desc": "Savor food diary — every page is private, identity-gated, user-specific content, so nothing is exposed to search indexing.",
  "rules": [{ "action": "disallow", "page": "*" }]
}
```

Verified against the actual registered pages: 9 of 9 are private/utility, so `disallow *` is the smallest
policy that keeps every private, account-specific, diary, utility and dev surface out of search indexing.
No SEO requirement was invented.

## 8. Permission-recovery audit

| # | Question | Finding |
|---|---|---|
| 1 | Exact error / message | **Location** (`utils/locations.js`): a user cancel → `Location selection cancelled.`; any other failure → **`无法打开腾讯地图选点，请检查定位授权和小程序隐私设置后重试。`** — a **Chinese-only literal** passed through `i18n.t()`, but the catalog is keyed by the English string, so it resolves to itself and shows Chinese in **both** locales. **Photo** (`utils/photos.js`): a cancel is classified via `isCancelled()` and treated as "no result, no error"; a real failure (including `auth deny`) is classified and thrown, then surfaced through the page's shared error display. **Avatar** (`utils/avatar.js`): a cancel returns `''` silently; a real failure becomes `AVATAR_CHOOSE_FAILED`. |
| 2 | Retry from the same control | **YES** — the photo controls, the location field and the avatar picker stay enabled; re-tapping re-invokes the chooser. No lockout state exists. |
| 3 | Permanent denial → stable explanatory state | **PARTIAL** — the user gets a message on every attempt, but there is no persistent state and no in-app route to change the permission. Recovery depends on WeChat's own settings UI. |
| 4 | Would `wx.openSetting` require a new button / row / modal | **YES.** `wx.openSetting` must be called from a user tap, so it needs a tappable affordance. The candidate hosts are the Add photo controls, the Add location field and the Me avatar — all inside frozen pages. |
| 5 | Which frozen production files would change | Implementing recovery in **Add** would change `pages/add/index.wxml` (and possibly `.wxss`) → Add's frozen registration. In **Me** it would change `pages/me/index.wxml` → Me's frozen registration. A shared-component approach would still need a page-level tap handler in a frozen page. |

### STOP — PERMISSION-RECOVERY UI CHANGE REQUIRES APPROVAL

* **Exact affected page(s):** `pages/add/index` (location + photo) and/or `pages/me/index` (avatar).
* **Exact proposed interaction:** make the existing permission-failure message on the frozen surface
  tappable, and on tap call `wx.openSetting` then re-invoke the same picker. This adds no new row, no new
  card and no new modal — but it does add an `aria-role="button"` tap target and therefore a WXML change
  on a frozen page.
* **Exact files:** `pages/add/index.wxml` (+ `pages/add/index.js` for the handler), or
  `pages/me/index.wxml` (+ `pages/me/index.js`). `pages/me/index.js` additionally sits behind the
  whole-file frozen gate `tools/lib/reviewed-me-memory-return.cjs`, so a Me-side fix would need a new
  approved hash as well.
* **Why retry alone is insufficient:** after a **permanent** denial WeChat no longer shows its own
  permission dialog, so re-tapping the control keeps failing with the same message and the user has no
  in-app way to reach the setting that would unblock them. Retry alone cannot recover a permanent denial.

Not implemented, per the brief. The Chinese-only location message noted in Q1 is also left unchanged
because the brief forbids copy changes in this pass; it is recorded here as a small follow-up.

## 9. Frozen-UI impact

**None.** All five frozen page WXML hashes are byte-identical to their approved registrations:

| Page | Approved sha256 | Live |
|---|---|---|
| Home | `02ae8dcf…` | identical |
| Map | `4522d594…` | identical |
| Add | `10f6501a…` | identical |
| Us | `dcae6d39…` | identical |
| Me | `af025665…` | identical |

The sheet fix is isolated to a shared component's **JS property declaration** with no visual effect —
explicitly permitted by the brief. `components/sheet/index.js` is not covered by any review chain, so no
checkpoint applied to it.

One hash-chain record **did** need to move: `tools/fixtures/regression/ui-approved-updates.json` holds
the approved `sha256` of `miniprogram/app.json` (the chain's first link, `expected = approved[file].sha256`).
Removing the page registration changes `app.json`, so its recorded hash was advanced
`fcad4880…` → `52ef7f0e…` with a `reason` append. **`app.json` is release configuration, not a page
visual surface**, and no page's `sha256`/`baseSha256`/`review` was touched. Flagged explicitly because it
is a hash-chain file.

## 10. WATCH-item status

| Item | Status |
|---|---|
| `uploadWithSourceMap: true` | **CONFIRMED** — still true; source maps ship with the upload. Affects upload payload only, not runtime. **NOT BLOCKING** |
| No privacy-protection config entry in `project.config.json` | **NEEDS MANUAL CONSOLE CHECK** — confirm whether the platform requires a privacy-protection guideline entry for the album / camera / location capabilities before submission |
| Possible orphan cloud-storage objects after upload-success / record-write-failure | **CONFIRMED** — no garbage-collection path exists; an uploaded object whose record write fails stays unreferenced. Cost/hygiene only. **NOT BLOCKING** |
| CloudBase database indexes | **NEEDS MANUAL CONSOLE CHECK** — not readable from local tooling |
| CloudBase access rules | **NEEDS MANUAL CONSOLE CHECK** — not readable from local tooling; the client-side evidence is that all six functions enforce identity server-side |

None of the five became blocking, so none was changed.

## 11. Verification results

| Command | Result |
|---|---|
| `verify:icons` | **EXIT 0** — 49 SVGs / 29 aliases / 88 template declarations (unchanged, because the lab files remain) |
| `verify:visual-language` | **EXIT 0** — 13 contracts |
| `verify:ui` | **EXIT 0** — 43/43 |
| `verify:store-boundaries` | **EXIT 0** — 11/11 |
| `verify:memory-return` | **EXIT 0** — 13 checks |
| `verify:cloud` | **EXIT 0** — 272/272 |
| `npm run verify` | **EXIT 0** — FINAL STATIC VALIDATION: PASS, `✓ [SIZE] package size 1.61 MiB` |
| `npm run verify:all` | **EXIT 0** — 53 suites, 0 errors |

Runtime console: **0** `readingPosition` warnings, **0** runtime errors across Home → Map → Add → Us → Me.

## Final recommendation

**READY FOR REAL-DEVICE QA.**

All four hardware-independent findings are resolved and the full verification set is green:
the dev lab no longer ships as a production page (empirically unreachable), the sheet's property contract
is corrected at the shared source (0 warnings, not silenced), the sitemap exposes nothing to search
indexing, and the permission-recovery item is audited and **stopped for approval** because its fix
requires a frozen page's WXML.

The real-device blocker from the previous pass is **unchanged and still open**: no iOS / Android evidence
exists for safe area, notch / Dynamic Island, bottom gesture area, the native map compositor,
`cover-view` stacking, keyboard, pickers, blur, font rendering or icon sharpness. Nothing here should be
read as verifying any of those.
