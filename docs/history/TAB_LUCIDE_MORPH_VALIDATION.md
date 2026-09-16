# Tab Lucide replacement and WeChat continuous-morph adaptation

## Delivered production change
Five tabs now use official Lucide House, MapPinned, Plus, UsersRound and UserRound paths, consistent 1.75 round strokes. Selected state retains color/label emphasis, not solid fill. Routing, five-tab count, labels, center Add shape, themes and Quiet remain. TabBar JS still has zero imports/business dependencies.

## Morphicons integration (validation-only)
- Pure morphicons@1.7.1 core bundled to CommonJS, about 15KB uncompressed, licensed MIT. Source and license are in miniprogram/vendor. Lucide sources/ISC attribution are under images/icons/lucide.
- `utils/morphEngine.js` feeds Lucide IconNode data into resampleIcon / buildPlan / interpPolar. Real intermediate path geometry is generated, rather than crossfading endpoints.
- `components/morph-icon` draws those paths using native Canvas 2D moveTo/lineTo/stroke. No browser DOM, framework driver, inline SVG manipulation, Path2D or per-frame setData.
- Uses canvas.requestAnimationFrame where available, otherwise a bounded 16ms timer for the 320ms animation. Mid-flight retargeting starts from a copied current shape. Quiet snaps to target. Hide/detach cancels work. Unsupported Canvas falls back to the static SVG icon and explicitly reports `static-fallback`.
- Current fixed 64 samples/subpath preserve geometry approximately. This is a polyline rendering of the core shape, not a claim of mathematically exact Bezier rasterization. Device stroke quality is part of acceptance.
- Only the validation page mounts the Canvas component. Production TabBar / already accepted native map controls remain on their safe SVG/PNG paths until native acceptance succeeds.

## Coverage
Developer-only page: `pages/morph-lab/index` (not a sixth tab).
14 pairs cover the five Tab icons and the prior X, directional chevrons, SlidersHorizontal, Check, Bookmark, Heart, Plus/Minus, LoaderCircle and CircleCheck families.
Some pairs (different Tab symbols, Heart → Star, loading → success) test geometry only. They do not imply or execute any business state change, and are not production behavior. The static closing X has no inherent second semantic state; Plus ↔ X tests its topology without imposing new UI behavior.

## Run in WeChat DevTools
1. Import updated savor-mp as usual. Normal compile shows the five updated SVG tabs.
2. From the compile-mode dropdown, add a mode with launch page `pages/morph-lab/index` (no query). Alternatively, while the app is running:
   `wx.navigateTo({url:'/pages/morph-lab/index'})`
3. Select each pair, press “正向 / 反向”, then “120ms 中途反向”. Toggle Quiet and light/dark. Switch away/back to verify lifecycle cleanup.
4. Press “生成脱敏验证记录”; copy the selectable JSON together with the observed visual result. No record IDs, locations or private image URLs are in this report.

Completion reports contain frames, durationMs, planMs, cpuMaxMs, p95IntervalMs and scheduler. `ready` or `static-fallback` is NOT a continuous-morph pass. Inspect at least a few intermediate frames and actual mid-flight reversal. Frame timing alone does not prove correct visuals. Suggested triage: repeated p95 frame intervals above 33ms warrant investigation; do not treat this threshold as a device guarantee.

The developer page invokes no business/storage/network API. The app's usual startup initialization still occurs. It does not save test results to restaurant records or the cloud.

## Executed vs pending
Executed here:
- Static checks, existing privacy/cloud contracts, five-tab/zero-import gate.
- 14-pair finite/distinct intermediate shape validation.
- Canvas-method mock draws with mid-flight reversal, floating-point tolerance, Quiet, detach, static fallback and no per-frame setData.
- Node math timings in reports/morph-adaptation-validation.json, explicitly not native FPS.
- Browser interactive preview in design-references/lucide-morph-preview.html, explicitly not WeChat rendering acceptance.

NOT executed here:
- Real WeChat DevTools / physical device Canvas performance, crispness and lifecycle acceptance.
- Native map cover-image path animation. Canvas validation does not prove native-map-layer sprite updates; these arrows remain static exported SVG assets with the existing stack motion.
- Production rollout of continuous path morphing to all tabs and controls.

No cloud deployment, paid service, credentials or framework installation required. Continuous icon morphing should only be promoted after real runtime acceptance, not on mock evidence alone.
