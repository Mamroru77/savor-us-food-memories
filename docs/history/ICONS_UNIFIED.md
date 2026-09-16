# Approved Lucide icon unification

User approved the full SVG review, stamp glyph treatment and replacement of Sparkles with Lightbulb.

## Implemented
- 45 canonical official Lucide SVGs, all reviewed, with source URLs / SHA-256 and ISC license.
- One source set generates `utils/icons.js`, `utils/lucideMorphNodes.js`, and `tools/_gen/icons.json`.
- 24 existing `lucide-*` compatibility names reference canonical shapes without duplicating source path definitions. This intentionally preserves the approved Tab/lab bindings.
- Ordinary icon component default and all explicit WXML strokes: 1.75, rounded caps/joins. Existing sizes, colors, star/heart selected fills and hit areas retained.
- Add picker `▾` replaced with ChevronDown. No import feature was resumed.
- Lightbulb for preference tips; Bell for notification symbols; NotebookPen for Save. No remaining Sparkles in runtime icon data or UI.
- Map error placeholder: MapPinOff. LoaderCircle, CircleQuestionMark and Trash canonical names replace old aliases.
- Native stack buttons use official ChevronUp/Down inside existing round containers.
- Stamp Utensils, Check and Image glyphs updated. S brand, frame, photo aperture, anchors and pixel dimensions retained. Four PNGs were compared with 2068cc6: no pixel changes outside declared icon regions (`tools/fixtures/regression/icon-unification-validation.json`).
- Removed unused legacy pin.png / stack-chevron.svg and home-filled shape. Baseline guard permits only that explicit obsolete PNG removal; current native map assets are now required by asset validation.
- Nested asset paths are included in asset-reference scanning.

## Preserved
Five Tab endpoint pairs; 380ms morph, replay fix, Quiet and fallback; map hybrid architecture; map/card 320ms timings. No cloud functions, storage, privacy, photo lifecycle, import behavior or business write paths changed. Me JS changes only the Help menu icon name.

Currency, prose separators, translation text, user content, parser star/currency syntax, Chinese regexes, brand S, transparent anchors, photographs and actual data charts are not icon substitutes. Tencent basemap and WeChat system controls are outside project SVG control.

## Rebuild / verification
- `npm run build:icons`: offline, built-in Node modules only.
- `python tools/build-map-icons.py`: developer-only PNG export; requires CairoSVG / Pillow environment. Not a mini-program runtime dependency.
- `npm run verify:all`: existing static / Tab / asset / 195 mock scenarios plus new `verify:icons` checks for 45 source hashes and paths, 24 aliases, all 75 s-icon template declarations, semantics, native SVG/PNG contracts and deterministic code generation.
- Original project and extracted release must both pass before delivery.

Native WeChat rendering/performance and live CloudBase acceptance are NOT claimed by these checks. No cloud deployment is required.
