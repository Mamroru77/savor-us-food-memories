// Native <map> camera geometry for Savor. Pure functions only — no wx, no page state —
// so the whole camera contract can be exercised from Node.
//
// Everything here rests on ONE runtime-verified model. On SDK 3.17.3 the map's Web
// Mercator world is TILE * 2^scale pixels wide for 360 degrees of longitude, and the
// <map> component's viewport is exactly the window. Measured on the DevTools runtime at
// scale 13 in a 428x926 window, getRegion() reported a longitude span of 0.073432 deg
// and a Mercator span of 0.002773, which this model converts back to 428.0 px and
// 926.0 px — to the pixel. That model is what lets the camera be aimed at a *chosen*
// level and composed into the *unobstructed* part of the screen instead of guessed at.
//
// The platform exposes no camera animation API at all: the only camera channels are the
// bound latitude/longitude/scale props and MapContext.includePoints, and the prop
// channel is instantaneous (measured: 161 samples over 900ms, one distinct centre).
// So this module computes only WHERE a command should land. It never synthesises
// motion, and nothing here may pretend the platform can interpolate.
const TILE = 256;
const MAX_MERCATOR_LATITUDE = 85.05112878;
const SCALE_MIN = 3;
const SCALE_MAX = 18;

// The closest an overview may ever land. A degenerate marker set (one marker, or several
// on the same coordinate) has no span to fit, so the platform's own fit is meaningless
// there — and an unclamped fit would jump to the maximum level. 16 is a neighbourhood
// view: with the measured usable band on a 428x926 window that is roughly 0.7-0.8 km
// across, which reads as "here is the area", not "here is the doorway".
const OVERVIEW_MAX_SCALE = 16;
const HOTSPOT_RADIUS_KM = 15;
const HOTSPOT_CORE_KM = 0.5;
const HOTSPOT_MAX_SCALE = 15;

// Padding before the first live measurement. Over-reserving is the SAFE direction: a
// marker fitted a little small is fine, a marker hidden under chrome is the bug this
// exists to prevent. This mirrors the CSS contract (search bar / 130rpx tool column /
// 340rpx card + 20rpx offset + --tab-clearance 170rpx+26rpx + the real safe-area inset)
// and is replaced by a real measurement within one frame — see syncCameraPadding().
const BOOTSTRAP_CARD_RPX = 556;

function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function finite(value, fallback) { return Number.isFinite(value) ? value : fallback; }

function mercator(latitude) {
  const phi = clamp(finite(Number(latitude), 0), -MAX_MERCATOR_LATITUDE, MAX_MERCATOR_LATITUDE) * Math.PI / 180;
  return Math.log(Math.tan(Math.PI / 4 + phi / 2));
}
function inverseMercator(y) { return (2 * Math.atan(Math.exp(y)) - Math.PI / 2) * 180 / Math.PI; }

function pixelsPerLongitude(scale) { return TILE * Math.pow(2, scale) / 360; }
function pixelsPerMercator(scale) { return TILE * Math.pow(2, scale) / (2 * Math.PI); }

function wrapLongitude(longitude) {
  let lng = Number(longitude);
  if (!Number.isFinite(lng)) return 0;
  while (lng > 180) lng -= 360;
  while (lng < -180) lng += 360;
  return lng;
}

// The part of the component that is not covered by the header/search, the tool column,
// the place card or the tab bar. `padding` is [top, right, bottom, left] in component
// pixels — the same order MapContext.includePoints takes. Never below 1px: a padding
// that eats the whole viewport must degrade to "one pixel of usable map", not to NaN.
function usable(viewport, padding) {
  const pad = padding || [0, 0, 0, 0];
  return {
    width: Math.max(1, finite(Number(viewport.width), 1) - finite(Number(pad[3]), 0) - finite(Number(pad[1]), 0)),
    height: Math.max(1, finite(Number(viewport.height), 1) - finite(Number(pad[0]), 0) - finite(Number(pad[2]), 0)),
    left: finite(Number(pad[3]), 0),
    top: finite(Number(pad[0]), 0),
  };
}

// Centre of the unobstructed region, in component pixels.
function usableCentre(viewport, padding) {
  const pad = padding || [0, 0, 0, 0];
  return {
    x: (finite(Number(pad[3]), 0) + finite(Number(viewport.width), 0) - finite(Number(pad[1]), 0)) / 2,
    y: (finite(Number(pad[0]), 0) + finite(Number(viewport.height), 0) - finite(Number(pad[2]), 0)) / 2,
  };
}

// Geographic bounds of real marker coordinates. Longitudes are unwrapped onto the
// shorter arc, so a pair either side of the antimeridian is a 0.002 deg span and not a
// 359.998 deg one. Coordinates that are not finite are dropped rather than treated as 0:
// a placeholder or a half-written record must never drag the fit to the Gulf of Guinea.
function bounds(coordinates) {
  const list = (coordinates || []).filter(c => c && Number.isFinite(Number(c[0])) && Number.isFinite(Number(c[1])));
  if (!list.length) return null;
  const reference = Number(list[0][1]);
  let north = -Infinity, south = Infinity, west = Infinity, east = -Infinity;
  list.forEach(c => {
    const lat = Number(c[0]);
    let lng = Number(c[1]);
    let delta = lng - reference;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    lng = reference + delta;
    north = Math.max(north, lat); south = Math.min(south, lat);
    east = Math.max(east, lng); west = Math.min(west, lng);
  });
  return { north, south, west, east };
}

function boundsCentre(box) {
  return [inverseMercator((mercator(box.north) + mercator(box.south)) / 2), wrapLongitude((box.west + box.east) / 2)];
}

// The scale at which `box` exactly fills the unobstructed region. Infinity when the box
// has no span (one marker, or several on the same coordinate): nothing can be "fitted"
// to a point, and callers clamp that to OVERVIEW_MAX_SCALE.
function fitScale(box, viewport, padding) {
  const region = usable(viewport, padding);
  const lngSpan = Math.abs(box.east - box.west);
  const mercSpan = Math.abs(mercator(box.north) - mercator(box.south));
  if (!(lngSpan > 0) && !(mercSpan > 0)) return Infinity;
  const byWidth = lngSpan > 0 ? Math.log2(region.width * 360 / (TILE * lngSpan)) : Infinity;
  const byHeight = mercSpan > 0 ? Math.log2(region.height * 2 * Math.PI / (TILE * mercSpan)) : Infinity;
  return Math.min(byWidth, byHeight);
}

// Two corners whose bounding box is exactly one unobstructed viewport wide/tall at
// `scale`. includePoints() fits this box into the PADDED region, so the box centre lands
// on the centre of the unobstructed region — which is how a focused marker or an
// overview ends up composed into the part of the map the user can actually see, without
// a single hardcoded offset.
function cornersFor(centre, scale, viewport, padding) {
  const region = usable(viewport, padding);
  const latitude = finite(Number(centre[0]), 0), longitude = finite(Number(centre[1]), 0);
  const dLng = region.width * 360 / (TILE * Math.pow(2, scale));
  const dMerc = region.height * 2 * Math.PI / (TILE * Math.pow(2, scale));
  const y = mercator(latitude);
  return [
    { latitude: inverseMercator(y - dMerc / 2), longitude: wrapLongitude(longitude - dLng / 2) },
    { latitude: inverseMercator(y + dMerc / 2), longitude: wrapLongitude(longitude + dLng / 2) },
  ];
}

// The map centre that puts `point` at screen pixel `(screenX, screenY)` within `viewport`.
function centreForScreenPoint(point, scale, viewport, screenX, screenY) {
  const dx = finite(Number(screenX), 0) - finite(Number(viewport.width), 0) / 2;
  const dy = finite(Number(screenY), 0) - finite(Number(viewport.height), 0) / 2;
  const dLng = dx * 360 / (TILE * Math.pow(2, scale));
  const dMerc = dy * 2 * Math.PI / (TILE * Math.pow(2, scale));
  return [inverseMercator(mercator(finite(Number(point[0]), 0)) + dMerc), wrapLongitude(finite(Number(point[1]), 0) - dLng)];
}

// The map centre that puts `point` at the centre of the UNOBSTRUCTED region instead of
// the centre of the component. Used only where the bound props are the camera (the IDE):
// includePoints composes by padding, the props compose by offset.
function centreForPoint(point, scale, viewport, padding) {
  const centre = usableCentre(viewport, padding);
  return centreForScreenPoint(point, scale, viewport, centre.x, centre.y);
}

// Ideal vertical anchor (screen Y of the cluster root pin tip) so the cluster's drawer
// unfolds into the maximum unobstructed space between search bar and bottom card:
//   - If an upward drawer fits inside the unobstructed band, place the root in the lower
//     portion so the entire upward stack + chevron sit centered between search bar and card.
//   - If a tall 3-row+paging drawer exceeds the band height (so buildDrawers flips downward),
//     place the root right below the search bar so its downward stack unfolds into clear sky
//     instead of disappearing behind the bottom card.
function clusterAnchorY(viewport, padding, drawerHeight) {
  const region = usable(viewport, padding);
  const midY = region.top + region.height / 2;
  const maxY = Math.max(midY, region.top + region.height - 12);
  const height = finite(Number(drawerHeight), 0);
  if (height > 0 && (maxY - height) < region.top) {
    return clamp(region.top + 89 + 12, region.top + 89, midY);
  }
  const idealY = region.top + (region.height + height) / 2;
  return clamp(idealY, midY, maxY);
}

// The map centre that frames a cluster root marker for an unobstructed upward drawer open.
function centreForCluster(point, scale, viewport, padding, drawerHeight) {
  const centre = usableCentre(viewport, padding);
  return centreForScreenPoint(point, scale, viewport, centre.x, clusterAnchorY(viewport, padding, drawerHeight));
}

// The camera padding, from MEASURED obstructions. Nothing here is a fixed guess: the
// search bar's bottom, the tool column's left edge and the place card's top all move
// with the device, the locale and the card's collapsed state.
function paddingFrom(measured) {
  const viewport = measured.viewport || { width: 0, height: 0 };
  const width = finite(Number(viewport.width), 0);
  const height = finite(Number(viewport.height), 0);
  return [
    Math.max(0, Math.round(finite(Number(measured.searchBottom), 0))),
    Math.max(0, Math.round(width - finite(Number(measured.toolLeft), width))),
    Math.max(0, Math.round(height - finite(Number(measured.cardTop), height))),
    Math.max(0, Math.round(finite(Number(measured.gutter), 0))),
  ];
}

function bootstrapPadding(viewport, searchBottom) {
  const width = finite(Number(viewport.width), 375);
  const rpx = width / 750;
  const safeBottom = Math.max(0, finite(Number(viewport.safeBottom), 0));
  return [
    Math.max(0, Math.round(finite(Number(searchBottom), 0))),
    Math.round(130 * rpx),
    Math.round(BOOTSTRAP_CARD_RPX * rpx) + Math.round(safeBottom),
    0,
  ];
}

// The overview camera plan for a set of real marker coordinates.
//   centre  — geographic centre of the marker bounds
//   level   — the scale the fit should land on
//   padding — the padding the level was computed against
//   points  — the includePoints payload (a bbox at that level, not the raw markers)
//
// The bbox is not a reinterpretation of the data: when the natural fit is inside the
// clamp range, a box built for `floor(natural)` spans at least as much as the markers
// do and is centred on them, so the platform lands on the same view it would have
// chosen by itself. Outside that range the clamp is the whole point — a degenerate set
// no longer jumps to the maximum level, and an intercontinental set stays at the
// platform's own floor instead of asking for a scale the component cannot show.
function overview(coordinates, viewport, padding, observedScale) {
  const box = bounds(coordinates);
  if (!box) return null;
  const centre = boundsCentre(box);
  const natural = fitScale(box, viewport, padding);
  const level = clamp(Math.floor(natural), SCALE_MIN, OVERVIEW_MAX_SCALE);
  return { centre, level, padding, points: cornersFor(centre, level, viewport, padding) };
}

function distanceKm(a, b) {
  const lat1 = finite(Number(a && a[0]), 0) * Math.PI / 180;
  const lat2 = finite(Number(b && b[0]), 0) * Math.PI / 180;
  let dLngDeg = finite(Number(b && b[1]), 0) - finite(Number(a && a[1]), 0);
  if (dLngDeg > 180) dLngDeg -= 360;
  if (dLngDeg < -180) dLngDeg += 360;
  const dLat = lat2 - lat1;
  const dLng = dLngDeg * Math.PI / 180;
  const sLat = Math.sin(dLat / 2);
  const sLng = Math.sin(dLng / 2);
  const h = sLat * sLat + Math.cos(lat1) * Math.cos(lat2) * sLng * sLng;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

// First-open high-frequency hotspot: finds the densest 15 km neighborhood (ignoring distant
// single outliers), selects the most recent memory inside its densest 0.5 km core, and
// frames the entire neighborhood inside the unobstructed map band.
function hotspot(items, viewport, padding) {
  const valid = (items || []).filter(item => {
    const c = item && item.coordinates;
    return c && Number.isFinite(Number(c[0])) && Number.isFinite(Number(c[1]));
  });
  if (!valid.length) return null;
  let bestNeighbors = null;
  let bestCore = -1;
  for (let i = 0; i < valid.length; i++) {
    const origin = valid[i].coordinates;
    const neighbors = [];
    let coreCount = 0;
    for (let j = 0; j < valid.length; j++) {
      const d = distanceKm(origin, valid[j].coordinates);
      if (d <= HOTSPOT_RADIUS_KM) {
        neighbors.push(valid[j]);
        if (d <= HOTSPOT_CORE_KM) coreCount++;
      }
    }
    if (
      !bestNeighbors
      || neighbors.length > bestNeighbors.length
      || (neighbors.length === bestNeighbors.length && coreCount > bestCore)
    ) {
      bestNeighbors = neighbors;
      bestCore = coreCount;
    }
  }
  let selected = bestNeighbors[0];
  let selectedCore = -1;
  for (let i = 0; i < bestNeighbors.length; i++) {
    const candidate = bestNeighbors[i];
    let coreCount = 0;
    for (let j = 0; j < bestNeighbors.length; j++) {
      if (distanceKm(candidate.coordinates, bestNeighbors[j].coordinates) <= HOTSPOT_CORE_KM) coreCount++;
    }
    if (coreCount > selectedCore) {
      selected = candidate;
      selectedCore = coreCount;
    }
  }
  const box = bounds(bestNeighbors.map(m => m.coordinates));
  const rawCentre = boundsCentre(box);
  const hasViewport = viewport && finite(Number(viewport.width), 0) > 0 && finite(Number(viewport.height), 0) > 0;
  const level = hasViewport
    ? clamp(Math.floor(fitScale(box, viewport, padding)), SCALE_MIN, HOTSPOT_MAX_SCALE)
    : 13;
  const centre = hasViewport ? centreForPoint(rawCentre, level, viewport, padding) : rawCentre;
  return { selected, items: bestNeighbors, count: bestNeighbors.length, rawCentre, centre, level, padding };
}

// Whole levels only: the bound `scale` prop floors fractional values, so a level the
// camera cannot express must never be asked for.
function levelWithin(scale) { return clamp(Math.round(finite(Number(scale), SCALE_MIN)), SCALE_MIN, SCALE_MAX); }

// Screen position of a coordinate for a camera that is at `centre` with `scale`. PURE: it needs
// no native round-trip, which is what makes it usable once per camera frame. The model is the
// same one verified to the pixel in the header of this file, so a per-frame analytic projection
// and the native `getRegion` reply agree.
function projectPoint(coordinates, centre, scale, viewport) {
  const width = finite(Number(viewport && viewport.width), 0);
  const height = finite(Number(viewport && viewport.height), 0);
  return {
    x: width / 2 + (finite(Number(coordinates[1]), 0) - finite(Number(centre[1]), 0)) * pixelsPerLongitude(scale),
    y: height / 2 - (mercator(finite(Number(coordinates[0]), 0)) - mercator(finite(Number(centre[0]), 0))) * pixelsPerMercator(scale),
  };
}

// The scale a region implies. `getRegion` is the only camera read that returns a bound box, and
// the box plus the viewport is exactly the information the analytic projection needs — so ONE
// round-trip yields both the centre and the scale, instead of a region call plus a scale call.
function scaleForSpan(longitudeSpan, viewport) {
  const width = finite(Number(viewport && viewport.width), 0);
  const span = Math.abs(finite(Number(longitudeSpan), 0));
  if (!(width > 0) || !(span > 0)) return null;
  return clamp(Math.log2(width * 360 / (TILE * span)), SCALE_MIN, SCALE_MAX);
}

// ---------------------------------------------------------------- A->B travel
//
// The platform has no camera animation API, but the bound centre props ARE a camera
// channel and the native map follows them write by write: measured on the DevTools
// runtime, 30 writes 20 ms apart produced 26 distinct native centres along a monotone
// path (one write = one position, applied within ~26 ms). So a continuous A->B move is
// a sequence of ordinary centre writes — no new dependency, no fake easing, and the
// same code path on the IDE and on a device.
//
// The only thing that must NOT happen is the derived work: each centre write also
// raises a regionchange, measured at 2 begin/end pairs per write, and the page's
// regionchange handler rebuilds projections, re-reads the scale and can regroup
// markers. A transition therefore runs behind an explicit token that suppresses that
// work and reconciles exactly once when the camera settles.

// Ground distance of a pan, in device pixels at the given scale. This is what the user
// perceives, so it — not a raw degree delta — is what the duration is derived from.
function panPixels(from, to, scale) {
  const dx = (finite(Number(to[1]), 0) - finite(Number(from[1]), 0)) * pixelsPerLongitude(scale);
  const dy = (mercator(finite(Number(to[0]), 0)) - mercator(finite(Number(from[0]), 0))) * pixelsPerMercator(scale);
  return Math.sqrt(dx * dx + dy * dy);
}

// Adaptive and restrained: a near pan is almost imperceptible, a medium one reads as a
// clear glide, a far one is longer but still quick, and nothing is ever cinematic.
const PAN_NEAR_MS = 160;
const PAN_FAR_MS = 640;
const PAN_MS_PER_PIXEL = 0.55;
function panDurationMs(distancePx) {
  return Math.round(clamp(PAN_NEAR_MS + finite(Number(distancePx), 0) * PAN_MS_PER_PIXEL, PAN_NEAR_MS, PAN_FAR_MS));
}

// The project's existing motion curve (mapStack.ease / the bottom card's
// cubic-bezier(1/3, 0, 2/3, 1)): smooth, no bounce, no overshoot. Reused rather than
// invented so the camera speaks the same language as the drawer and the card.
function panProgress(progress) {
  const t = clamp(finite(Number(progress), 0), 0, 1);
  return t * t * (3 - 2 * t);
}

// Interpolated centre at `progress` (0..1) along the straight geographic line. Latitude
// is interpolated in Mercator, so the ground speed stays even instead of accelerating
// through the middle of a long pan.
function panPoint(from, to, progress) {
  const k = panProgress(progress);
  const y = mercator(finite(Number(from[0]), 0)) + (mercator(finite(Number(to[0]), 0)) - mercator(finite(Number(from[0]), 0))) * k;
  const lng = finite(Number(from[1]), 0) + (finite(Number(to[1]), 0) - finite(Number(from[1]), 0)) * k;
  return [inverseMercator(y), wrapLongitude(lng)];
}

module.exports = {
  TILE, SCALE_MIN, SCALE_MAX, OVERVIEW_MAX_SCALE, HOTSPOT_RADIUS_KM, HOTSPOT_CORE_KM, HOTSPOT_MAX_SCALE,
  mercator, inverseMercator, pixelsPerLongitude, pixelsPerMercator, wrapLongitude,
  usable, usableCentre, bounds, boundsCentre, fitScale, cornersFor,
  centreForScreenPoint, centreForPoint, clusterAnchorY, centreForCluster,
  paddingFrom, bootstrapPadding, overview, distanceKm, hotspot, levelWithin,
  panPixels, panDurationMs, panProgress, panPoint, projectPoint, scaleForSpan, PAN_NEAR_MS, PAN_FAR_MS,
};
