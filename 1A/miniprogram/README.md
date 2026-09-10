# Savor · WeChat Mini Program

Native WeChat mini program port of the Savor web concept (*Food memories. Shared forever.*).
No WebView shell, no React runtime, no Leaflet, no Framer Motion, no browser storage — only
WXML / WXSS / JavaScript, native components and native WeChat APIs.

---

## 1. Open it in WeChat DevTools

1. WeChat DevTools → **Import project**.
2. Directory: this `miniprogram/` folder (it is the project root, `miniprogramRoot: "./"`).
3. AppID: use **Test / tourist AppID** — `project.config.json` ships `"appid": "touristappid"`.
   Replace it with a real AppID before uploading.
4. Base library: **3.0.0 or newer** (developed against 3.7.0).
5. `Details → Local settings`: keep *ES6 to ES5* and *Enhanced compilation* on. "Do not verify
   legal domain names" is not required — the app makes **no network requests**.

Static self-check (no IDE needed), run from the repository root:

```bash
node tools/validate-miniprogram.cjs
```

## 2. Directory

```
miniprogram/
├─ app.js / app.json / app.wxss     entry, global config, design tokens
├─ project.config.json, sitemap.json
├─ images/                          all sample photos + map pins (packaged, no CDN)
├─ components/
│  ├─ icon/         SVG (data-URI) icon set — replaces lucide-react
│  ├─ page-header/  custom navigation bar (status bar + capsule aware)
│  └─ memory-row/   the shared memory list row
├─ custom-tab-bar/  Home · Map · ＋ · Us · Me
├─ pages/
│  ├─ home/  map/  add/  us/  me/   the five tab screens
│  ├─ memory/                        memory detail (photos, actions, delete, forward)
│  ├─ library/                       memory library: filters, search, import, export
│  └─ sheet/                         profile · together · preferences · settings ·
│                                    privacy · weekly · journey · notifications · help
└─ utils/
   ├─ data.js    model, samples, validation, normalisation/migration, statistics
   ├─ store.js   observable store persisted in wx storage
   ├─ image.js   chooseMedia, compression, persistent files, cleanup, backup files
   ├─ icons.js   SVG icon markup → data URI
   └─ format.wxs date formatting inside WXML
```

## 3. Web → mini program mapping

| Web (React / Vite) | Mini program |
| --- | --- |
| `SavorProvider` + `useSavor` context | `utils/store.js` observable store; pages `bind()` in `onShow`, release in `onHide`/`onUnload` |
| `localStorage['savor-diary-v1']` | `wx.setStorageSync('savor-diary-v1')` with schema migration |
| `sessionStorage['savor-draft-v1']` | `wx.setStorageSync('savor-draft-v1')` |
| In-device `Sheets.tsx` drawers | real page stack: `pages/memory`, `pages/library`, `pages/sheet?type=…` |
| Bottom nav in `Phone.tsx` | `custom-tab-bar` + `wx.switchTab` |
| Leaflet + CARTO tiles | native `<map>` with markers and always-on `customCallout` photo pins |
| Framer Motion | WXSS transitions, `hover-class`, respects the *Quiet motion* setting |
| lucide-react | `components/icon` rendering inline SVG data URIs |
| `<input type="file">` + Canvas resize | `wx.chooseMedia` → `wx.compressImage` → `FileSystemManager.copyFileSync` |
| Blob download / file input | `wx.shareFileMessage` (clipboard fallback) / `wx.chooseMessageFile` |
| Toast component | `wx.showToast`, destructive confirms use `wx.showModal` |
| Google Fonts (DM Sans / Instrument Serif) | system stack: `-apple-system / PingFang SC` + `Georgia / Songti SC` for display type |

## 4. Pages

| Page | Contents |
| --- | --- |
| `pages/home` | Savor intro, notification bell with unread dot, weekly card with live stats, five most recent memories, empty state |
| `pages/map` | native map, photo pins, selection, place card with distance/neighbourhood, bookmark, search over restaurant / city / country / tag, All-Favorites-Shared filter, results count, recenter, empty and map-error fallbacks |
| `pages/add` | up to four photos (replace / append / remove), restaurant with known-place detection, city picker, notes, date picker, rating, tags with suggestions, validation, autosaved draft, save feedback |
| `pages/us` | couple card with "a little love", days together, Our Journey stats, shared moments gallery with like, See all, forward-to-friend |
| `pages/me` | profile header, statistics card with chart, menu into Preferences / Memories / Privacy / Settings / Help |
| `pages/memory` | photo gallery + `wx.previewImage`, rating, location (respects setting), notes, tags, Love / Save / Share-with-us, forward to a chat, delete with confirmation |
| `pages/library` | tabs (all / shared / favorites), search, count, list, export backup, import backup, error surface |
| `pages/sheet` | nine panels selected by `?type=`; an unknown type falls back to `settings` instead of a blank screen |

## 5. Data storage

* Key `savor-diary-v1` holds `{ schema, memories, profile, settings, feedback }` — the same shape
  the web app writes, so a hand-copied payload stays readable on both sides.
* On load every record goes through `normalizeMemory` / `normalizeProfile` / `normalizeSettings`:
  missing fields are filled, out-of-range values clamped, duplicates dropped, invalid records
  skipped. A single bad memory can never stop the app from opening; an unreadable payload falls
  back to the sample diary.
* Drafts live under `savor-draft-v1` and are restored when Add opens.
* Feedback notes are capped at the 50 most recent entries.
* Storage failures (quota, locked storage) warn once and keep the session usable.

## 6. Photos

* `wx.chooseMedia` (album + camera, `sizeType: ['compressed']`); files above ~600 KB additionally
  go through `wx.compressImage` (max width 1080).
* Chosen temp files are copied into `${wx.env.USER_DATA_PATH}/savor/` immediately — a
  `tempFilePath` is never stored as a permanent address.
* Deleting a memory unlinks its own files (packaged sample images are never touched).
* On launch, and from *Privacy → Free up unused photo files*, orphaned files are removed.
* Missing files degrade to the packaged fallback photo instead of a broken image.

## 7. Map

* Native `<map>` with one marker per visible memory; the photo bubble is a
  `customCallout` (`display: ALWAYS`) drawn with `cover-view` / `cover-image`.
* `includePoints` frames search and filter results; recenter returns to Paris.
* No tile provider, no `<web-view>`; the CARTO / OpenStreetMap raster layer used on the web is
  intentionally not reproduced.
* `binderror` shows an inline notice while search, filters and the place card keep working.

## 8. Import / export

* **Export** writes `savor-memories-YYYY-MM-DD.json` (`{ version, exportedAt, memories }`) into the
  user data directory and forwards it with `wx.shareFileMessage`; if that is unavailable or fails,
  the JSON is copied to the clipboard.
* **Import** uses `wx.chooseMessageFile` (`.json`, ≤10 MB), rejects malformed JSON, non-Savor
  payloads and files over 500 memories, and skips IDs that already exist.
* Backups from the web build import here: `data:image/...;base64,…` photos are decoded once and
  written to real files, so huge strings never enter page data.
* Mini program exports import into the web build; photos stored as local file paths cannot be
  resolved by a browser and fall back to the sample image there.

## 9. Permissions & privacy

Declared / used capabilities, and nothing more:

| Capability | Where | Notes |
| --- | --- | --- |
| Album & camera (`wx.chooseMedia`) | Add, profile avatar | Cancel resolves silently; a denied permission opens a modal offering `wx.openSetting` |
| Chat files (`wx.chooseMessageFile`) | Library import | Guarded with `wx.canIUse` |
| File share (`wx.shareFileMessage`) | Library export | Clipboard fallback |
| Clipboard (`wx.setClipboardData`) | Export fallback | Only after an explicit tap |
| Local storage / FileSystemManager | Everywhere | Device-only, no account, no server |

No location permission is requested: the map only renders your own memory coordinates and never
calls `wx.getLocation`. Before release, list album/camera use in the *User Privacy Protection
Guidelines* on the MP platform (required since the 2023 privacy rules), because `wx.chooseMedia`
is a regulated interface.

## 10. Server domains

**None.** Every sample photo, avatar, icon and map pin is packaged. There is no `wx.request`,
`wx.downloadFile` or `wx.uploadFile` call, so no `request` / `downloadFile` domain has to be
configured. If you later import a web backup that references `https://images.pexels.com/…`, those
URLs are rendered by `<image>` (which is not domain-restricted) and simply need connectivity.

## 11. Requirements & performance

* Base library ≥ 3.0.0; `wx.canIUse` guards `compressImage`, `chooseMessageFile`, `shareFileMessage`.
* `lazyCodeLoading: "requiredComponents"`, single package (~550 KB, well under the 2 MB limit).
* `setData` carries derived view models only — no base64, no full-state dumps; list rows are
  keyed by memory id; the store never writes into an unloaded page.

## 12. Verification status

Executed:

* ✅ Static validation (`node tools/validate-miniprogram.cjs`): JS syntax for all 20 scripts, JSON
  validity, WXML tag balance + `{{ }}` binding balance + `wx:for`/`wx:key`, WXSS brace balance,
  page/tabBar/component path resolution, packaged asset references, absence of browser APIs and
  remote web assets, package size.
* ✅ Manual code audit of every page, component and utility against the web build.

Not executed in this environment:

* ❌ WeChat DevTools compile / preview (the IDE and its CLI are not available here).
* ❌ Real-device testing on iOS / Android.
* ❌ Automated UI or end-to-end tests.

Please run one DevTools compile plus a device preview before shipping.

## 13. Known platform differences

* WeChat's map is not the CARTO grayscale raster style; the light-grey Leaflet look can only be
  approximated. Overseas coverage/labels differ from OpenStreetMap.
* Native map is rendered by the OS layer: only `cover-view`/`cover-image` may sit on top of it, so
  callouts use simplified markup and the frosted-glass blur is weaker over the map area.
* `backdrop-filter` is not reliable on all Android WebViews; glass surfaces fall back to a slightly
  more opaque background.
* DM Sans and Instrument Serif are not loaded from Google Fonts; the display type uses
  Georgia / Songti SC, so serif headings differ slightly in width.
* Bottom sheets are replaced by pushed pages, following WeChat's navigation conventions.
* Exported JSON cannot be written to a user-chosen folder; WeChat only allows forwarding the file
  into a chat (or the clipboard fallback).
