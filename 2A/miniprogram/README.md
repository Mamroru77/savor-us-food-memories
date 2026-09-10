# Savor · WeChat Mini Program

Native WeChat Mini Program port of the Savor web concept (Home · Map · ＋ · Us · Me). It shares the web app's data model,
copy and visual language, but is built only with WXML / WXSS / JavaScript and WeChat APIs. No React runtime, no WebView shell,
no Leaflet, no Framer Motion, no npm dependencies.

## 1. Import into WeChat DevTools

1. Open **WeChat DevTools → Import Project** and choose this `miniprogram/` folder as the project root.
2. AppID: `project.config.json` ships with `touristappid` (test mode). Replace it with your own AppID before uploading.
3. Base library: **2.32.3 or newer** is recommended (3.7.0 configured). Minimum useful version is 2.20.1
   (`wx.getWindowInfo`, `wx.chooseMedia`, `wx.shareFileMessage`, `<map>` custom callouts).
4. Compile. Everything works in the simulator; photos, file sharing and the map are best checked on a real device (see §13).

No `npm install` is required for the mini program.

## 2. Directory

```
miniprogram/
├─ app.js / app.json / app.wxss      entry, global config, design tokens (Pearl / Dusk themes)
├─ project.config.json / sitemap.json
├─ images/                          bundled sample photos (7 jpg, ~380 KB) + transparent pin.png for map markers
├─ components/
│  ├─ icon/                          Lucide-style SVG icons rendered as data URIs (utils/icons.js)
│  ├─ page-header/                   custom navigation bar (status bar + capsule aware)
│  └─ memory-row/                    list row shared by Home, Library, Weekly, Map fallback
├─ custom-tab-bar/                   Home · Map · ＋ · Us · Me
├─ pages/
│  ├─ home / map / add / us / me     the five tabs
│  ├─ memory                         memory detail
│  ├─ library                        all memories, search, filters, export / import
│  └─ sheet                          profile · together · preferences · settings · privacy · weekly · journey · notifications · help
└─ utils/
   ├─ data.js                        model, sample content, validation, repair, migration, stats
   ├─ store.js                       observable store persisted to wx storage
   ├─ image.js                       chooseMedia, compression, USER_DATA_PATH files, cleanup, backup conversion
   ├─ icons.js                       icon paths + SVG data-URI encoder
   └─ format.wxs                     date / plural helpers for WXML
```

## 3. Web → Mini Program architecture

| Web (`src/`) | Mini program | Notes |
| --- | --- | --- |
| `App.tsx` gallery of five phones | five tab pages + `custom-tab-bar/` | the device *is* the phone; the ＋ tab keeps the raised button |
| `SavorProvider` context + `localStorage` | `utils/store.js` + `wx.setStorageSync` | pages `store.bind()` in `onShow`/`onLoad`, release in `onHide`/`onUnload`; writes are debounced and versioned |
| `data.ts` | `utils/data.js` | same fields, ids, sample memories, `savor-diary-v1` / `savor-draft-v1` keys |
| `Sheets.tsx` bottom sheets | `pages/memory`, `pages/library`, `pages/sheet?type=…` | native page stack instead of in-device sheets; invalid `type` / `id` fall back gracefully |
| Leaflet + CARTO tiles | `<map>` + always-on `customCallout` photo pins | see §7 |
| Framer Motion | WXSS transitions + `hover-class`; `--motion` token becomes `0s` when *Quiet motion* is on | |
| Lucide React | `components/icon` (`utils/icons.js`) | same 24×24 stroke paths, colour / fill / stroke props |
| `readPhoto()` canvas resize → base64 | `wx.chooseMedia` → `wx.compressImage` → copy into `USER_DATA_PATH/savor/` | see §6 |
| `<input type=file>` JSON import / `<a download>` export | `wx.chooseMessageFile` / `wx.shareFileMessage` (+ clipboard fallback) | see §8 |
| CSS px on a 300 px canvas | rpx at **2.5×** (750 rpx ≙ 300 px) | typography, radii, spacing all derived from the web values |
| DM Sans / Instrument Serif (Google Fonts) | system sans + system serif stack | no network fonts; hierarchy preserved through size / weight |

## 4. Pages

* **Home** – intro, "This week" card (meals / places counters react to additions), five recent memories, notifications dot.
* **Map** – native map centred on Paris, photo pins, search (restaurant / city / country / tag), All · Favorites · Shared filter,
  place card (distance for Paris, neighbourhood elsewhere), bookmark, recenter, results count, empty state, list fallback if the map fails.
* **Add** – up to four photos (replace, add more, remove last, preview), restaurant with suggestions from known places,
  "New place in" city picker for unknown places, notes, date (≤ today), rating, tags (max 6, suggestions from preferences),
  validation, draft autosave/restore, success feedback, then back to Home.
* **Us** – together card (love heart, days together), Our Journey card, Shared Moments gallery with like buttons, "See all".
* **Me** – profile, lifetime stats card with chart, Preferences · Memories · Privacy · Settings · Help & Feedback.
* **Memory** – photo carousel with thumbnails, date + rating, location (respects *Location in details*), notes, tags,
  Love / Save place / Share with us, **Send to a friend** (`open-type="share"`), Remove memory with confirmation.
* **Library** – All · Shared · Favorites tabs, search, count, Export backup, Import.
* **Sheet** – profile edit (avatar via chooseMedia), together, preferences, settings (Pearl/Dusk, reminders, quiet motion),
  privacy (private by default, location, privacy guide, permissions), weekly, journey, notifications, help + feedback notes.

"Shared" (a memory shown in *Us*) and "Send to a friend" (WeChat forwarding) are kept as two separate concepts, as on the web.

## 5. Data storage

* Key `savor-diary-v1` → `{ version: 2, memories, profile, settings, feedback }` written with `wx.setStorageSync` (debounced 120 ms,
  flushed on `App.onHide`).
* Loading runs `migrateDiary()`: JSON errors → defaults; each memory goes through `normalizeMemory()` (missing fields filled,
  ratings clamped, coordinates repaired from the city table, unsafe image values replaced, duplicates by id dropped).
  One bad record can never block launch.
* Draft key `savor-draft-v1` (photos, restaurant, notes, date, rating, tags, city) is validated the same way.
* Storage quota errors show a single modal recommending an export; the app keeps running in memory.

## 6. Photos

* Picked with `wx.chooseMedia` (`sizeType: compressed`, album + camera). Files larger than ~900 KB or 1200 px are further
  reduced with `wx.compressImage`, then **copied** into `wx.env.USER_DATA_PATH/savor/` — temp paths are never stored.
* Cancel and privacy refusal resolve silently; authorization refusal offers `wx.openSetting`; other failures show a friendly error.
* Deleting a memory removes its files unless another memory / the avatar still references them. `App.onLaunch` sweeps orphans
  (files not referenced by the diary, draft or profile). Missing files fall back to the bundled sample photo at render time.
* Sample photos are bundled (`images/`), so the core UI never depends on the network.

## 7. Map

* `<map>` (Tencent Maps inside WeChat) with `enable-poi/building` off. Memories are markers with a transparent 2×2 icon and an
  **always-visible custom callout** (`<cover-view slot="callout">`) that draws the circular photo pin, matching the web's
  43 px photo marker.
* Search / filter changes call `includePoints` (debounced 320 ms) or `moveToLocation`; Recenter restores Paris.
* If the component reports an error the page swaps in a scrollable list of the same memories so nothing is lost.
* No location permission is requested (`show-location` is off), so no `requiredPrivateInfos` entry is needed.

## 8. Import / Export (web ↔ mini program)

* **Export** writes `savor-memories-YYYY-MM-DD.json` (`{ version, app: "savor", exportedAt, memories }`) to the user directory and
  offers it via `wx.shareFileMessage`; if unsupported or failing it copies the JSON to the clipboard (≤ 4 MB).
  User photos are embedded as `data:image/...;base64` (files > 1.5 MB become the sample photo reference), and bundled sample
  photos are written as their public Pexels URLs — exactly the values the web `isMemory()` accepts.
* **Import** uses `wx.chooseMessageFile` (JSON, ≤ 10 MB, ≤ 500 memories). Accepts the web format, the mini program format, or a
  bare array. Records are repaired with `normalizeMemory()`, duplicates by id skipped, base64 photos written to local files,
  Pexels sample URLs mapped back to bundled images.

## 9. Permissions & privacy APIs used

| Capability | API | When |
| --- | --- | --- |
| Album / camera | `wx.chooseMedia` | Add photos, change avatar |
| Chat files | `wx.chooseMessageFile`, `wx.shareFileMessage` | Import / Export |
| Clipboard (write) | `wx.setClipboardData` | Export fallback only |
| Local files | `FileSystemManager`, `wx.env.USER_DATA_PATH` | photo persistence, backup file |
| Map | `<map>` component | Map tab (no `getLocation`) |

Nothing else is declared. `app.json` sets `"__usePrivacyCheck__": true`; when a privacy API (`chooseMedia`) is first used WeChat
shows the official privacy popup. Refusal is handled (no crash, photo simply not added). Before publishing, fill in the
**用户隐私保护指引** in the MP admin console declaring: 相册（仅写入）/摄像头, 选中的照片或视频信息, 剪切板. The Privacy page exposes
`wx.openPrivacyContract` and `wx.openSetting`.

## 10. Server domains

None are required for core use. All sample photos, icons and fonts are bundled. Only backups imported from the web app may still
reference `https://images.pexels.com/...` for user-added memories that used sample images; `<image>` loads these without a
domain whitelist, but you may add `images.pexels.com` to **downloadFile 合法域名** if you later use `wx.downloadFile`.

## 11. Verified in this workspace

* JS syntax of every file (`node --check`), JSON validity, WXSS brace balance.
* WXML: tag balance, `wx:for` always has `wx:key`, every `bind*/catch*` handler exists in its page, every custom tag is registered,
  every `/images/...` reference and icon name exists, `app.json` pages / tabBar / usingComponents paths exist.
* Runtime tests against a `wx` stub: corrupt storage → defaults; legacy web-shaped data migration (repair, dedupe, photo
  localisation, output passes strict `isMemory`); add / update / delete / persistence; export → base64 → import → local file with
  duplicate skipping; delete and orphan sweep only remove unreferenced files; released subscribers never fire again.

## 12. Not verified here

* **WeChat DevTools compile** and **real-device runs** could not be executed in this environment (no DevTools / CLI available).
  Layout on notch / Dynamic Island devices, capsule alignment, `<map>` rendering, `chooseMedia`, `shareFileMessage` and the privacy
  popup need a device pass. The code paths for cancel / deny / unsupported are all present.

## 13. Known platform differences

* The map is Tencent Maps: coverage and styling for Paris / Tokyo / Kyoto is basic compared with CARTO tiles, and the web's
  grayscale tile filter has no equivalent. Pins, cards, search and filters behave the same.
* Web fonts (DM Sans, Instrument Serif) are not loaded; the system serif / sans stack keeps the hierarchy.
* Bottom sheets are full pages with a custom header; the Add tab's close button returns to Home and keeps the draft.
* Photos live in the mini program's private directory (200 MB cap) instead of base64 in storage — faster, but device-bound;
  export a backup to move them.
* `onShareAppMessage` uses a memory's local photo as `imageUrl`; WeChat may substitute its default preview for very large files.
