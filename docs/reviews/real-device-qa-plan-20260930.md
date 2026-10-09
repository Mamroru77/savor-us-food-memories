# Real-device QA — hardware evidence pass

Date: 2026-09-30
Status: **evidence collection NOT STARTED.** No physical iOS or Android device is attached to this
environment, so **no hardware check has been performed and none is claimed.** This document is the
executable capture plan plus the matrix that must be filled in from the user's own device evidence.

## 0. How this round works

| Step | Owner | State |
|---|---|---|
| 1. Generate the preview entry point | this pass | **DONE** — see §1 |
| 2. Prepare the exact capture matrix | this pass | **DONE** — §2–§12 |
| 3. Capture evidence on a physical device | **user** | **NOT STARTED** |
| 4. Analyse only the supplied evidence | this pass, next round | pending |
| 5. Produce PASS / FAIL / UNVERIFIED | this pass, next round | pending |

**Rule being enforced:** simulator output is used only as a *baseline for comparison* and is never
labelled real-device evidence. Nothing below is marked PASS.

## 1. Preview entry point (generated)

`create_preview_qrcode` succeeded and the platform reported the upload it would serve:

| Item | Value |
|---|---|
| QR image | `.workbuddy-ai/scratch/hardware/preview-qr.jpg` (470×470, JPEG) |
| **Platform-measured package** | **1,471,729 B = 1.4036 MiB** |
| Headroom to the 2 MB platform limit | **625,423 B** |
| Local directory total (includes files excluded from upload) | 1.6113 MiB |

The 0.21 MiB gap between the local directory and the platform's upload is `ignoreUploadUnusedFiles`
excluding unreferenced files — the **1.4036 MiB figure is the authoritative one** and it is lower than
every earlier local estimate. This is the first time the platform itself has measured the package.

**To use it:** open WeChat on the physical device → scan the QR → the mini program opens in preview.
For a full debug console instead, use the DevTools *真机调试* (real-device debugging) entry, which gives
the same UI plus a device-side console — **that console is where the `readingPosition` warning should be
re-checked on hardware** (Test Set E).

## 2. Devices to record (minimum release evidence)

| | DEVICE A | DEVICE B |
|---|---|---|
| Platform | physical iPhone | physical Android |
| OS | current supported iOS | current supported Android |
| WeChat | current release | current release |
| Method | preview QR **or** real-device debugging | preview QR **or** real-device debugging |

If only one device is available initially: test it completely and keep the other platform **UNVERIFIED**.
Android must never be inferred from iOS, or the reverse.

Record per device, **without any personal identifiers** (no IMEI, no serial, no phone number, no account id):

```
manufacturer / model:      (e.g. "Apple iPhone 14" / "Xiaomi 13")
OS version:
WeChat version:
viewport (if available):
DPR (if available):
test method:               Preview QR | Real-device debugging
```

## 3. Evidence handoff convention

Put every file in one folder and name it `<set>-<device>-<theme>-<locale>-<n>.<ext>`, e.g.:

```
A-home-ios-pearl-en-1.png
B-map-ios-pearl-poiON-1.png
B-map-ios-pan-1.mp4
C-add-android-dusk-zh-1.png
```

Then hand over the folder path. Only the supplied files will be analysed; anything not supplied stays
**UNVERIFIED**.

## 4. TEST SET A — Home

Capture a full-screen Home screenshot in **PEARL**, then switch to **DUSK** and capture again.
Inspect: status-bar / notch clearance · header top position · subtitle rendering · weekly snapshot ·
Recent rows · photo crop · bottom safe area · custom TabBar · centre Add button · PEARL surface.

## 5. TEST SET B — Map (highest priority — cannot be substituted by DevTools)

Capture four stills:

1. PEARL — native POI **ON**
2. PEARL — native POI **OFF**
3. DUSK — native POI **ON**
4. selected memory + bottom card

Plus **one screen recording** covering: pan map · zoom map · tap a memory pin · change the selected pin ·
toggle native POIs · tap overview / "Show all mapped memories" · scroll and interact near the bottom card.

Check specifically: native `<map>` compositor · `cover-view` / `cover-image` stacking · search bar above
the map · right floating controls above the map · selected card above the map · bottom navigation above the
map · no native-map layer leaking through controls · taps reach the intended control · map gestures do not
swallow card/utility interaction · Savor pins remain distinct from provider POIs · overview icon sharp ·
POI pin icon sharp · search SVG sharp.

## 6. TEST SET C — Add

Capture three stills: top of Add · photo + Restaurant region · Date / Rating / Tags / Save region.
Plus **one interaction recording**: choose photo · preview photo · choose restaurant location · focus
Notes · open keyboard · dismiss keyboard · choose Date · tap all five Rating positions · add/remove a tag ·
expand More details · Save.

Check: the keyboard does not hide the active field unexpectedly · scroll-to-field works · the native Date
picker returns correctly · `chooseLocation` returns correctly · the image picker returns correctly · the
five Rating targets stay on one row · no layout jump · bottom navigation stays safe · Save stays reachable ·
DUSK stays readable.

## 7. TEST SET D — Us

Capture the complete Us page in **PEARL** and in **DUSK**. Check: two avatars · relationship duration ·
Journey columns · Latest photo · Shared Moments horizontal cards · bottom safe area · text rendering.
Verify **English and Chinese at least once on one physical device**.

## 8. TEST SET E — Me

Capture: profile / stats · settings list · bottom navigation. Interact with: profile / avatar · one
settings row · one secondary page · back navigation.

Check: avatar picker · sheet component · row tap areas · chevrons · safe area ·
**`readingPosition` warning absent in the device-debug console**.

## 9. TEST SET F — Safe area / notch · TEST SET G — Font rendering

**F (each device).** TOP: the title/header never collides with the status bar or notch. BOTTOM: the TabBar
never collides with the home indicator / system navigation; scroll content reaches its endpoint; the Save
button, card and last row stay visible and tappable. Capture any device where this fails.

**G.** On hardware inspect: Savor serif page titles · body font · Chinese · English · numbers · SVG
strokes. Check: custom fonts loaded · no persistent FOUT · no clipping · no unexpectedly synthetic bold ·
no icon blur · no baseline corruption. Judge structural and perceptual correctness — **do not** compare
subpixel anti-aliasing literally against simulator screenshots.

## 10. TEST SET H — PEARL / DUSK · TEST SET I — EN / ZH

**H.** Switch the theme on hardware, then navigate Home → Map → Add → Us → Me. Check: the change persists ·
no stale PEARL page inside DUSK · no DUSK text on a PEARL surface · map controls update coherently ·
photos remain readable · the TabBar updates correctly.

**I.** Switch the locale on hardware and navigate all five tabs. Check: no stale previous-language strings ·
no Chinese-only location failure copy on the normal success path · no title clipping · no menu subtitle
clipping · Journey stats stay stable · Add Rating stays one row.

## 11. TEST SET J — Permissions

Normal flows first: **photo/camera**, **location picker**, **avatar**. Check: the system dialog appears when
expected · cancel is non-destructive · successful authorisation returns correctly · retry remains possible.

If practical, also test **permanent denial** and record exactly: platform · capability · resulting message ·
whether the user can recover through WeChat's own settings · whether that is acceptable for release.

Two known limitations are already proven and **must not be fixed during evidence collection**:

1. Permanent denial cannot be recovered by retry alone — adding `wx.openSetting` requires a user tap, and
   implementing it would change the frozen Add and/or Me WXML.
2. The location failure message contains a **Chinese-only literal that appears in both locales**.

Decide from the evidence whether either must block release.

## 12. TEST SET K — Performance feel

On both physical devices, rate each as **SMOOTH / ACCEPTABLE / BAD**: cold launch · tab switching ·
map pan/zoom · selected card update · Add photo preview · keyboard · Save transaction · Shared Moments
scrolling · settings / sheets. If BAD, provide a screen recording and the approximate interaction.
No laboratory benchmark is required and no optimisation will be based on subjective milliseconds alone.

## 13. Simulator baseline (comparison only — NOT device evidence)

Recorded in earlier passes, for reference when reading the hardware results:

| Metric | Simulator value |
|---|---|
| Cold launch (`App.onLaunch`) | 468 ms |
| Warm launch | 117 ms |
| `Page.onLoad` | 59 ms |
| `Page.onShow` (n=19) | min 52 / avg 80 / max 144 ms |
| Runtime errors | 0 |
| `readingPosition` warnings (after the shared-source fix) | 0 |
| Package (platform-measured) | 1.4036 MiB |

Simulator caveats that make it a poor substitute: the render surface is 0.65× (so screenshots cannot
represent real sharpness), it does not reproduce the native map compositor, and its `wx:if`/class binding
lags `setData`.

## 14. Hardware regression classification

| Class | Meaning |
|---|---|
| HARDWARE-P0 | unusable · data loss · primary interaction impossible · native layer hides critical UI |
| HARDWARE-P1 | significant layout / input / permission / rendering defect |
| HARDWARE-P2 | noticeable but non-blocking platform-specific issue |
| EXPECTED PLATFORM DIFFERENCE | normal iOS / Android rendering difference |
| NOT A BUG | simulator-vs-hardware anti-aliasing · normal native picker difference · expected system UI variation |

For every defect the analysis will return: DEVICE · OBSERVED · EXPECTED · REPRO STEPS · EVIDENCE ·
SEVERITY · LIKELY ROOT CAUSE · FILES LIKELY AFFECTED · FROZEN UI IMPACT · SMALLEST FIX.
**If a frozen page WXML/WXSS must change, work stops for explicit approval.**

## 15. Final hardware matrix

| CHECK | iOS | ANDROID | EVIDENCE | RESULT |
|---|---|---|---|---|
| safe area | — | — | none supplied | **UNVERIFIED** |
| notch / status bar | — | — | none supplied | **UNVERIFIED** |
| bottom gesture area | — | — | none supplied | **UNVERIFIED** |
| Home | — | — | none supplied | **UNVERIFIED** |
| Map compositor | — | — | none supplied | **UNVERIFIED** |
| cover-view layering | — | — | none supplied | **UNVERIFIED** |
| Map gestures | — | — | none supplied | **UNVERIFIED** |
| Map controls | — | — | none supplied | **UNVERIFIED** |
| SVG sharpness | — | — | none supplied | **UNVERIFIED** |
| Add keyboard | — | — | none supplied | **UNVERIFIED** |
| photo picker | — | — | none supplied | **UNVERIFIED** |
| location picker | — | — | none supplied | **UNVERIFIED** |
| Date picker | — | — | none supplied | **UNVERIFIED** |
| Rating | — | — | none supplied | **UNVERIFIED** |
| Save | — | — | none supplied | **UNVERIFIED** |
| Us | — | — | none supplied | **UNVERIFIED** |
| Me | — | — | none supplied | **UNVERIFIED** |
| Sheet | — | — | none supplied | **UNVERIFIED** |
| PEARL | — | — | none supplied | **UNVERIFIED** |
| DUSK | — | — | none supplied | **UNVERIFIED** |
| EN | — | — | none supplied | **UNVERIFIED** |
| ZH | — | — | none supplied | **UNVERIFIED** |
| permission normal flow | — | — | none supplied | **UNVERIFIED** |
| permanent-denial recovery | — | — | none supplied | **UNVERIFIED** |
| performance feel | — | — | none supplied | **UNVERIFIED** |

## 16. What happens next

1. Scan the generated QR (or start a real-device debugging session) on DEVICE A.
2. Walk Test Sets A–K, capturing per §3's naming convention.
3. Hand over the evidence folder.
4. This pass then analyses **only the supplied files** and returns the matrix filled with
   PASS / FAIL / UNVERIFIED, the classified defects, and exactly one recommendation:
   `REAL-DEVICE QA — PASS`, `ONE SPECIFIC HARDWARE BLOCKER`, or `REAL-DEVICE QA — INCOMPLETE`.

## Final recommendation

**REAL-DEVICE QA — INCOMPLETE.**

No physical iOS or Android device is attached to this environment and **no device evidence has been
supplied**, so every row of the hardware matrix is UNVERIFIED. The capture plan, the preview entry point
and the platform-measured package size are ready; the hardware pass itself is blocked on the user's device
evidence and nothing here should be read as a hardware PASS.
