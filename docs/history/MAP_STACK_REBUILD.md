# Map reference stack rebuild

Supersedes MAP_TAP_FIX_UPDATE.md and the native customCallout interaction approach.

## Scope
User requested stopping diagnostics and rebuilding reference upward expansion, plus Map card transitions. No history reset of unrelated features; no backend changes.

- Multi-member groups now use ordinary view/image controls **outside** the native map callout. They are positioned from native getRegion bounds and the map's measured size using Web Mercator. No stored coordinates are changed.
- Native map remains the map. Group anchors remain transparent numeric 1×1 markers; singleton markers retain native taps. Map rotation/tilt disabled to keep projection valid.
- White arrow sits above the first stamp when collapsed and at the top when open. Up to three children rise with staggered smooth interpolation. Root baseline remains fixed; closing reverses the displacement.
- Existing S/landmark framed photo/fallback artwork is retained, consistent with the supplied reference; no claim of new artwork generation.
- During map gestures overlays are hidden, then reprojected after region end, avoiding stale clickable positions. This is deliberate; continuous gesture tracking is not implemented.
- Projection failure hides the overlay instead of inventing coordinates. Native region/projection compatibility still needs device acceptance.
- Expanded card and compact strip stay mounted. Card height animates 340→80rpx / reverse in 320ms, content fades and the strip slides/fades. Photo stays square rather than vertically squashing. Quiet disables transitions.
- Existing independent close control is retained for stacks clipped by the header. Automatic camera avoidance is not implemented.

## Checks and acceptance limits
Run npm run verify:all. Updated structural assertions specifically require a sibling view overlay rather than obsolete callout markup; behavior/privacy/cloud tests retained. Added projection/antimeridian and mounted-card transition checks. Mock tests cannot verify native hit testing or visual smoothness.

Manual acceptance: real arrow open/close; sequential upward motion and fixed root; child selects card; root reselects root; drag/zoom then alignment; repeated card toggle; Quiet; small-screen header overlap. No cloud deployment or cache clearing needed.
