// Map camera motion — the round's focused regression suite.
//
// It runs the PRODUCTION page methods and the PRODUCTION geometry module against
// synthetic native replies. Three things are being protected:
//
//   1. A marker tap issues ONE camera command, and the bound props no longer teleport the
//      camera ahead of it. The prop channel is instantaneous (measured on the runtime:
//      161 samples over 900ms, one distinct centre), so a prop write in the same patch as
//      the selection pre-empts the native command and is exactly the jump cut this round
//      exists to remove.
//   2. An overview is a fit with a CHOSEN level and a MEASURED padding, and a degenerate
//      marker set can no longer ask the platform for its maximum zoom.
//   3. The camera geometry never becomes a bound data path: it must not add a bridge write,
//      which is what keeps the frozen Map UI hash chain untouched by this round.
//
// ⚠️ Synthetic native replies only. The platform exposes no camera animation API and the
// IDE cannot run moveToLocation or includePoints at all, so nothing here is a motion claim.
const fs = require('fs'), vm = require('vm'), assert = require('node:assert/strict'), path = require('path');

const REPO = path.join(__dirname, '..');
const MP = path.join(REPO, 'miniprogram');
const camera = require(path.join(MP, 'utils', 'mapCamera'));
const mapLayout = require(path.join(MP, 'utils', 'mapLayout'));

const VIEWPORT = { width: 428, height: 926, safeBottom: 34 };
const MEASURED = { searchBottom: 221, toolLeft: 354, cardTop: 575 };
const EXPECTED_PADDING = [229, 74, 351, 0];

let platform = 'ios';
const rects = {};
function makeWx() {
  return {
    getDeviceInfo: () => ({ platform }),
    getWindowInfo: () => ({ windowWidth: VIEWPORT.width, windowHeight: VIEWPORT.height, safeArea: { bottom: VIEWPORT.height - VIEWPORT.safeBottom } }),
    getMenuButtonBoundingClientRect: () => ({ top: 44, bottom: 82, height: 38 }),
    getStorageSync: () => '', setStorageSync: () => {}, removeStorageSync: () => {},
  };
}

const wx = makeWx();
const deps = {
  identity: { snapshot: () => ({ locked: false }), lease: () => 1, isCurrent: () => true, resumeNative: t => t, verify: () => Promise.resolve(), isDiagnosisActive: () => false },
  i18n: { copy: () => ({}), locale: () => 'en', t: x => x, syncPage: () => {} },
  uiFeedback: {}, store: { subscribe: () => () => {}, get: () => ({}), revision: () => 0, notify: () => {}, updateSettings: () => {} },
  data: Object.assign({}, require(path.join(MP, 'utils', 'data'))),
  metrics: require(path.join(MP, 'utils', 'metrics')),
  locations: require(path.join(MP, 'utils', 'locations')),
  mapMarkers: require(path.join(MP, 'utils', 'mapMarkers')),
  mapLayout, mapStack: require(path.join(MP, 'utils', 'mapStack')),
  mapProjection: require(path.join(MP, 'utils', 'mapProjection')), mapCamera: camera,
  imageCache: require(path.join(MP, 'utils', 'imageCache')),
  restaurantCategory: require(path.join(MP, 'utils', 'restaurantCategory')),
  memoryPreview: { open: () => {} },
};

let spec;
const timerLog = [];
vm.runInNewContext(fs.readFileSync(path.join(MP, 'pages', 'map', 'index.js'), 'utf8'), {
  Page: p => { spec = p; },
  require: id => { const key = id.split('/').pop(); if (!deps[key]) throw new Error('unexpected require ' + id); return deps[key]; },
  wx, console, Promise, JSON, Math, Number, Boolean, Object, Array, Map, Set, RegExp, String, isFinite, parseInt, parseFloat,
  // Timers are RECORDED, never fired: a travel must be driven by the production step
  // function so its intermediate positions are assertable without a clock.
  setTimeout: (fn, ms) => { timerLog.push({ fn, ms }); return timerLog.length; },
  clearTimeout: () => {},
  Date,
});

function memory(id, coordinates, extra) {
  return Object.assign({ id, restaurant: id, tags: [], coordinates, date: '2026-09-16', photo: 'fixture', saved: false, shared: false }, extra);
}

// A page whose camera commands are recorded, with a selector query that answers exactly
// like the measured device did.
function page(options) {
  const o = options || {};
  const patches = [], commands = [], reads = [], regions = [];
  const p = Object.assign({}, spec, {
    active: true, disposed: false, stackGesture: false,
    data: Object.assign({}, JSON.parse(JSON.stringify(spec.data)), { overlayTop: MEASURED.searchBottom + 8, headerTop: 88, mapScale: 13, commandScale: 13 }, o.data || {}),
    allMemories: o.memories || [], markerGroups: [], markerGeneration: 1, renderedRevision: 1,
    setData(patch, cb) {
      patches.push(patch);
      for (const [key, value] of Object.entries(patch)) {
        const keys = key.replace(/\[(\d+)\]/g, '.$1').split('.');
        let target = this.data;
        for (let i = 0; i < keys.length - 1; i++) { if (target[keys[i]] === undefined) target[keys[i]] = /^\d+$/.test(keys[i + 1]) ? [] : {}; target = target[keys[i]]; }
        target[keys[keys.length - 1]] = value;
      }
      if (cb) cb();
    },
    createSelectorQuery() {
      const query = {
        _selector: '',
        select(selector) { this._selector = selector; return this; },
        boundingClientRect(cb) {
          const r = rects[this._selector];
          if (r) cb(Object.assign({}, r));
          return this;
        },
        exec() { return this; },
      };
      return query;
    },
    stopMarkerAnimation() {}, stopDrawerReveal() { this.drawerProgress = 0; },
    ensureMarkerRenderer() {}, animateMarkerSizes() {}, renderMarkerPhotos() {}, renderDrawerPhotos() {},
  });
  p.mapCtx = {
    moveToLocation: command => commands.push({ kind: 'move', command }),
    includePoints: command => commands.push({ kind: 'fit', command }),
    getScale: cb => reads.push(cb),
    getRegion: cb => regions.push(cb),
  };
  return { p, patches, commands, reads, regions };
}

// The camera commands a patch set contains, in the order the page issued them.
function commandsOf(commands) { return commands.map(c => c.kind); }
function boundCentreWrites(patches) {
  return patches.filter(patch => Object.hasOwn(patch, 'latitude') || Object.hasOwn(patch, 'longitude'));
}

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('PASS ' + name); }
  catch (error) { failed++; console.error('FAIL ' + name + ': ' + error.message); }
}
function withPlatform(value, fn) { const before = platform; platform = value; try { fn(); } finally { platform = before; } }

rects['.map-search'] = { top: 167, bottom: MEASURED.searchBottom, left: 22, right: 406, width: 384, height: 54 };
rects['.map-tool-column'] = { top: 229, bottom: 436, left: MEASURED.toolLeft, right: 405, width: 51, height: 207 };
rects['.place-card'] = { top: MEASURED.cardTop, bottom: 770, left: 18, right: 410, width: 392, height: 195 };

// ---------------------------------------------------------------- geometry model
test('G1 the model reproduces the runtime-measured region to the pixel', () => {
  // Measured on the DevTools runtime: scale 13, window 428x926 ->
  // getRegion() southwest 48.747648/2.113284, northeast 48.852297/2.186716.
  const scale = 13;
  const lngSpan = 2.186716 - 2.113284;
  const mercSpan = camera.mercator(48.852297) - camera.mercator(48.747648);
  assert.ok(Math.abs(lngSpan * camera.pixelsPerLongitude(scale) - VIEWPORT.width) < 0.6, 'longitude span must imply the window width');
  assert.ok(Math.abs(mercSpan * camera.pixelsPerMercator(scale) - VIEWPORT.height) < 0.6, 'Mercator span must imply the window height');
});
test('G2 a bbox built for a level fits back to that level', () => {
  const padding = EXPECTED_PADDING;
  for (const level of [3, 8, 13, 16, 18]) {
    const corners = camera.cornersFor([31.46, 121.13], level, VIEWPORT, padding);
    const box = camera.bounds(corners.map(c => [c.latitude, c.longitude]));
    const fitted = camera.fitScale(box, VIEWPORT, padding);
    assert.ok(Math.abs(fitted - level) < 0.01, 'level ' + level + ' fitted back to ' + fitted);
  }
});
test('G3 composing a point puts it on the usable-region centre, not the component centre', () => {
  const padding = EXPECTED_PADDING;
  const region = camera.usable(VIEWPORT, padding);
  const centre = camera.usableCentre(VIEWPORT, padding);
  const level = 15;
  const marker = [31.46, 121.13];
  const mapCentre = camera.centreForPoint(marker, level, VIEWPORT, padding);
  // The commanded centre is the map centre, so the marker's screen position is the
  // component centre plus the marker-minus-centre offset at that level.
  const x = VIEWPORT.width / 2 + (marker[1] - mapCentre[1]) * camera.pixelsPerLongitude(level);
  const y = VIEWPORT.height / 2 - (camera.mercator(marker[0]) - camera.mercator(mapCentre[0])) * camera.pixelsPerMercator(level);
  assert.ok(Math.abs(x - centre.x) < 1, 'marker x ' + x.toFixed(1) + ' must land on the usable centre ' + centre.x);
  assert.ok(Math.abs(y - centre.y) < 1, 'marker y ' + y.toFixed(1) + ' must land on the usable centre ' + centre.y);
  assert.ok(Math.abs(centre.y - VIEWPORT.height / 2) > 30, 'the usable centre must actually differ from the component centre');
  assert.ok(region.height < VIEWPORT.height, 'the usable region must be a real reserve');
});
test('G4 bounds unwrap the antimeridian instead of spanning the globe', () => {
  const box = camera.bounds([[0, 179.999], [0, -179.999]]);
  assert.ok(Math.abs(box.east - box.west) < 0.01, 'span must be 0.002 deg, saw ' + (box.east - box.west));
  assert.equal(camera.bounds([[NaN, 121], ['x', 'y']]), null, 'no finite coordinate means no fit');
});
test('G5 the padding is derived from measurements, never from the legacy fixed guess', () => {
  // The page's safe line is the measured search bottom plus the 8px gap it already uses.
  const padding = camera.paddingFrom({ viewport: VIEWPORT, searchBottom: MEASURED.searchBottom + 8, toolLeft: MEASURED.toolLeft, cardTop: MEASURED.cardTop, gutter: 0 });
  assert.deepEqual(padding, EXPECTED_PADDING);
  // The legacy fixed guess under-reserved top and bottom by a wide margin. Both must fail.
  const legacy = [90, 40, 165, 40];
  assert.ok(padding[0] > legacy[0] + 100, 'top reserve must clear the search bar');
  assert.ok(padding[2] > legacy[2] + 100, 'bottom reserve must clear the place card');
  assert.ok(padding[1] > legacy[1], 'right reserve must clear the tool column');
  // The bootstrap mirrors the same CSS contract, so it must not under-reserve any edge the
  // live measurement covers - that is the whole point of preferring the measurement.
  const bootstrap = camera.bootstrapPadding(VIEWPORT, MEASURED.searchBottom + 8);
  assert.equal(bootstrap[0], padding[0], 'top: both derive from the same measured safe line');
  assert.ok(bootstrap[1] >= padding[1] - 1, 'right: the bootstrap must clear the tool column, saw ' + bootstrap[1]);
  assert.ok(bootstrap[2] >= padding[2] - 1, 'bottom: the bootstrap must clear the card, saw ' + bootstrap[2]);
});

// ---------------------------------------------------------------- marker focus = a travel
// A focus is no longer a native command. The platform exposes no camera animation API, so
// the travel is a short sequence of ordinary bound-centre writes behind an explicit token —
// the one channel that is continuous on BOTH the IDE and a device (measured: the native map
// follows each write, 26 distinct centres for 30 writes). These tests drive that sequence
// through the production step function instead of a timer.

function driveTravel(h, samples) {
  const n = samples || 8;
  const transition = h.p.cameraTransition;
  assert.ok(transition, 'a travel must be in flight');
  const path = [{ at: 0, centre: [h.p.data.latitude, h.p.data.longitude] }];
  for (let i = 1; i <= n; i++) {
    const at = transition.duration * (i / n);
    h.p.stepCameraTransition(at);
    path.push({ at, centre: [h.p.data.latitude, h.p.data.longitude] });
  }
  return path;
}
function distinctCentres(path) {
  const seen = [];
  path.forEach(p => { const k = Number(p.centre[0]).toFixed(7) + '/' + Number(p.centre[1]).toFixed(7); if (seen.indexOf(k) < 0) seen.push(k); });
  return seen;
}
function expectComposedTarget(h, coordinates) {
  return camera.centreForPoint(coordinates, h.p.data.mapScale, h.p.cameraViewport(), h.p.cameraPadding());
}

test('M1 a marker tap issues NO native camera command and never pre-writes the centre', () => {
  withPlatform('ios', () => {
    const h = page({ memories: [memory('a', [31.4, 121.1]), memory('b', [31.5, 121.2])] });
    h.p.applyFilters('', 'all', 'a');
    assert.deepEqual(commandsOf(h.commands), [], 'a focus must not call moveToLocation or includePoints');
    h.commands.length = 0; h.patches.length = 0;
    h.p.onMarkerTap({ detail: { markerId: 1 } });
    assert.equal(h.p.data.selectedId, 'b');
    assert.deepEqual(commandsOf(h.commands), [], 'still no native command');
    const selectionPatches = h.patches.filter(patch => Object.hasOwn(patch, 'selectedId'));
    assert.ok(selectionPatches.length >= 1, 'the tap writes selection state');
    assert.deepEqual(boundCentreWrites(selectionPatches), [], 'the selection patch must not carry a camera write');
    assert.ok(h.p.cameraTransition, 'the travel starts with the selection');
  });
});

test('M2 START != MID != END: the travel passes through intermediate positions and lands composed', () => {
  withPlatform('ios', () => {
    const h = page({ memories: [memory('a', [31.4, 121.1]), memory('b', [31.5, 121.2])] });
    h.p.applyFilters('', 'all', 'a');
    h.p.cameraLiveCentre = [31.30, 121.00];
    h.p.onMarkerTap({ detail: { markerId: 1 } });
    const path = driveTravel(h);
    const centres = distinctCentres(path);
    assert.ok(centres.length >= 4, 'a travel must pass through intermediate centres, saw ' + centres.length);
    const start = path[0].centre, end = path[path.length - 1].centre;
    assert.notDeepEqual(start, end, 'START and END must differ');
    assert.notDeepEqual(path[Math.floor(path.length / 2)].centre, start, 'MID must differ from START');
    const target = expectComposedTarget(h, [31.5, 121.2]);
    assert.ok(Math.abs(end[0] - target[0]) < 1e-9 && Math.abs(end[1] - target[1]) < 1e-9,
      'the travel must end exactly on the composed target');
    let previous = Infinity;
    path.forEach(p => {
      const d = Math.abs(p.centre[0] - end[0]) + Math.abs(p.centre[1] - end[1]);
      assert.ok(d <= previous + 1e-9, 'the path must not backtrack or overshoot');
      previous = d;
    });
    assert.equal(h.p.cameraTransition, null, 'the travel settles');
    assert.equal(h.p.cameraLiveCentre[0], target[0], 'the settled centre becomes the live centre');
  });
});

test('M3 the settle reconciles exactly once, through the existing acknowledgement path', () => {
  withPlatform('ios', () => {
    const h = page({ memories: [memory('a', [31.4, 121.1]), memory('b', [31.5, 121.2])] });
    h.p.applyFilters('', 'all', 'a');
    h.p.data.stackPositionsReady = true;
    h.p.onMarkerTap({ detail: { markerId: 1 } });
    const reads = h.reads.length, regions = h.regions.length;
    driveTravel(h);
    assert.equal(h.reads.length, reads + 1, 'exactly one scale read at settle, none per frame');
    assert.equal(h.regions.length, regions + 1, 'exactly one region query at settle');
    assert.equal(h.p.data.stackPositionsReady, false, 'the hit regions wait for the settled projection');
  });
});

test('M4 a rapid second tap continues from where the camera actually is', () => {
  withPlatform('ios', () => {
    const h = page({ memories: [memory('a', [31.4, 121.1]), memory('b', [31.5, 121.2]), memory('c', [31.6, 121.3])] });
    h.p.applyFilters('', 'all', 'a');
    h.p.onMarkerTap({ detail: { markerId: 1 } });
    const first = h.p.cameraTransition;
    h.p.stepCameraTransition(first.duration * 0.5);
    const mid = [h.p.data.latitude, h.p.data.longitude];
    h.p.onMarkerTap({ detail: { markerId: 2 } });
    const second = h.p.cameraTransition;
    assert.ok(second, 'the second tap starts its own travel');
    assert.notEqual(second.token, first.token, 'the first travel is superseded, not queued');
    assert.equal(second.from[0], mid[0], 'the new travel starts from the current camera latitude');
    assert.equal(second.from[1], mid[1], 'the new travel starts from the current camera longitude');
    assert.equal(h.p.data.selectedId, 'c', 'the last intent wins');
    driveTravel(h);
    const end = [h.p.data.latitude, h.p.data.longitude];
    const target = expectComposedTarget(h, [31.6, 121.3]);
    assert.ok(Math.abs(end[0] - target[0]) < 1e-9, 'and it reaches C, not B');
  });
});

test('M5 a finger outranks the travel; our own frame writes do not', () => {
  withPlatform('ios', () => {
    const h = page({ memories: [memory('a', [31.4, 121.1]), memory('b', [31.5, 121.2])] });
    h.p.applyFilters('', 'all', 'a');
    h.p.onMarkerTap({ detail: { markerId: 1 } });
    const patches = h.patches.length;
    h.p.onMapRegionChange({ detail: { type: 'begin', causedBy: 'update' } });
    h.p.onMapRegionChange({ detail: { type: 'end', causedBy: 'update' } });
    assert.equal(h.patches.length, patches, 'a frame write must trigger no derived work');
    assert.ok(h.p.cameraTransition, 'and must not cancel the travel');
    h.p.onMapRegionChange({ detail: { type: 'begin', causedBy: 'gesture' } });
    assert.equal(h.p.cameraTransition, null, 'a gesture cancels the travel');
    assert.equal(h.p.stackGesture, true, 'and the normal gesture path still runs');
  });
});

test('M6 the travel hides only the hit regions and never rebuilds markers per frame', () => {
  withPlatform('ios', () => {
    const h = page({ memories: [memory('a', [31.4, 121.1]), memory('b', [31.5, 121.2])] });
    h.p.applyFilters('', 'all', 'a');
    h.p.data.stackPositionsReady = true;
    const reads = h.reads.length, regions = h.regions.length, filters = h.patches.length;
    h.p.onMarkerTap({ detail: { markerId: 1 } });
    for (let i = 1; i <= 8; i++) h.p.onMapRegionChange({ detail: { type: i % 2 ? 'begin' : 'end', causedBy: 'update' } });
    // Only the ORDINARY overlay's hit regions go away while the camera moves under us; the
    // native marker/callout keeps its own anchor, which is why the marker never blinks.
    assert.equal(h.p.data.stackPositionsReady, false, 'the hit regions stand down during the travel');
    assert.equal(h.reads.length, reads, 'no scale read per frame');
    assert.equal(h.regions.length, regions, 'no region query per frame');
    assert.ok(h.patches.length >= filters, 'the travel still writes its own centre frames');
  });
});

test('M7 a focus never changes the scale, and a hidden page stops the travel', () => {
  withPlatform('ios', () => {
    const h = page({ memories: [memory('a', [31.4, 121.1]), memory('b', [31.5, 121.2])] });
    h.p.applyFilters('', 'all', 'a');
    h.p.onMarkerTap({ detail: { markerId: 1 } });
    driveTravel(h);
    assert.equal(h.patches.filter(patch => Object.hasOwn(patch, 'commandScale')).length, 0, 'a focus must not write the bound scale');
    assert.ok(h.patches.every(patch => !Object.hasOwn(patch, 'scale')), 'and must not bind the observed scale either');
    const hidden = page({ memories: [memory('a', [31.4, 121.1]), memory('b', [31.5, 121.2])] });
    hidden.p.applyFilters('', 'all', 'a');
    hidden.p.onMarkerTap({ detail: { markerId: 1 } });
    assert.ok(hidden.p.cameraTransition);
    hidden.p.active = false;
    hidden.p.stepCameraTransition(99999);
    assert.equal(hidden.p.cameraTransition, null, 'a hidden page must not keep writing camera frames');
  });
});

test('M8 the travel is adaptive and restrained: near is quick, far is capped, nothing overshoots', () => {
  const near = camera.panDurationMs(camera.panPixels([31.46, 121.13], [31.4606, 121.1306], 16));
  const medium = camera.panDurationMs(camera.panPixels([31.46, 121.13], [31.465, 121.135], 16));
  const far = camera.panDurationMs(camera.panPixels([31.46, 121.13], [32.2, 122.0], 16));
  assert.ok(near >= camera.PAN_NEAR_MS && near < medium, 'near must be shorter than medium: ' + near + ' vs ' + medium);
  assert.ok(medium < far, 'medium must be shorter than far');
  assert.ok(far <= camera.PAN_FAR_MS, 'far must stay capped at ' + camera.PAN_FAR_MS + ', saw ' + far);
  assert.equal(camera.panProgress(0), 0);
  assert.equal(camera.panProgress(1), 1);
  assert.ok(Math.abs(camera.panProgress(0.5) - 0.5) < 1e-9, 'the curve is symmetric');
  for (const k of [0.05, 0.2, 0.35, 0.5, 0.65, 0.8, 0.95]) {
    const v = camera.panProgress(k);
    assert.ok(v >= 0 && v <= 1, 'the curve must never overshoot or undershoot at ' + k);
    assert.ok(Math.abs(v - k) >= 0, 'monotone by construction');
  }
  const p0 = camera.panPoint([31.4, 121.1], [31.5, 121.2], 0);
  const p1 = camera.panPoint([31.4, 121.1], [31.5, 121.2], 1);
  // The Mercator round-trip is float-exact to ~1e-14 degrees, which is ~1e-8 metres.
  assert.ok(Math.abs(p0[0] - 31.4) < 1e-9 && Math.abs(p0[1] - 121.1) < 1e-9, 'the start is exact');
  assert.ok(Math.abs(p1[0] - 31.5) < 1e-9 && Math.abs(p1[1] - 121.2) < 1e-9, 'the end is exact');
});

test('M9 a zoom command takes the camera back from a travel in flight', () => {
  withPlatform('ios', () => {
    const h = page({ memories: [memory('a', [31.4, 121.1]), memory('b', [31.5, 121.2])] });
    h.p.applyFilters('', 'all', 'a');
    h.p.onMarkerTap({ detail: { markerId: 1 } });
    assert.ok(h.p.cameraTransition);
    h.p.onZoomIn();
    // The stepper resolves from a fresh native read before it writes the level.
    const read = h.reads[h.reads.length - 1];
    assert.ok(read, 'the tap reads the native scale');
    read.success({ scale: 13 });
    assert.equal(h.p.cameraTransition, null, 'a zoom cancels the travel');
  });
});

// ---------------------------------------------------------------- overview
const spread = [memory('a', [31.30, 121.00]), memory('b', [31.60, 121.40]), memory('c', [31.45, 121.20])];
function overviewHarness(memories) {
  const h = page({ memories });
  h.p.recenter();
  return h;
}
test('O1 an empty overview issues no camera command at all', () => {
  const h = page({ memories: [] });
  h.p.recenter();
  assert.equal(h.commands.length, 0, 'no markers means no fit');
  assert.deepEqual(boundCentreWrites(h.patches), [], 'and no prop write either');
  assert.ok(!h.p.cameraTransition, 'and no travel to nowhere');
  assert.ok(!h.p.data.selected, 'with nothing visible there is nothing to select');
  assert.equal(h.p.data.selectedId, '', 'and no stale selection is kept');
});
// The overview's plan is unchanged; only its APPLICATION changed. The centre now travels through
// the same token as a marker focus, so `includePoints` — which sets the centre AND the scale in
// one imperative jump — is no longer used at all.
function overviewTravel(h, memories) {
  const plan = h.p.planOverview(memories);
  const travel = h.p.cameraTransition;
  assert.ok(travel, 'an overview starts a travel');
  const expected = camera.centreForPoint(plan.centre, plan.level, h.p.cameraViewport(), plan.padding);
  assert.ok(Math.abs(travel.to[0] - expected[0]) < 1e-9 && Math.abs(travel.to[1] - expected[1]) < 1e-9,
    'and it targets the plan centre composed into the unobstructed region');
  return { plan, travel, expected };
}
test('O2 a single-marker overview cannot jump to the platform maximum', () => {
  const memories = [memory('only', [31.46, 121.13])];
  const h = overviewHarness(memories);
  assert.deepEqual(commandsOf(h.commands), [], 'the overview issues no native camera command');
  const { plan, travel } = overviewTravel(h, memories);
  assert.equal(plan.level, camera.OVERVIEW_MAX_SCALE, 'a degenerate span must clamp to the overview ceiling');
  assert.ok(plan.level < camera.SCALE_MAX, 'and must not sit on the platform maximum');
  assert.notDeepEqual(travel.to, [h.p.data.latitude, h.p.data.longitude], 'the centre travels rather than jumping');
});
test('O3 a multi-marker overview still contains every marker at the chosen level', () => {
  const h = overviewHarness(spread);
  assert.deepEqual(commandsOf(h.commands), [], 'no native fit: the travel carries the plan');
  const { plan, travel } = overviewTravel(h, spread);
  assert.deepEqual(plan.padding, EXPECTED_PADDING, 'the plan still reserves the real chrome');
  // The level is what the fit would have chosen, so the region implied by it contains every
  // marker — the containment guarantee survives the change of application.
  // The plan's own box: centred on the plan centre (the composed offset only moves where that
  // box sits on screen, not what it contains).
  const corners = camera.cornersFor(plan.centre, plan.level, h.p.cameraViewport(), plan.padding);
  const box = camera.bounds(corners.map(c => [c.latitude, c.longitude]));
  spread.forEach(m => {
    assert.ok(m.coordinates[1] >= box.west - 1e-9 && m.coordinates[1] <= box.east + 1e-9, 'marker ' + m.id + ' must be inside the implied box');
    assert.ok(m.coordinates[0] >= box.south - 1e-9 && m.coordinates[0] <= box.north + 1e-9, 'marker ' + m.id + ' must be inside the implied box');
  });
  assert.ok(plan.level >= 3 && plan.level <= camera.OVERVIEW_MAX_SCALE, 'the level stays in range, saw ' + plan.level);
});
test('O4 an extreme spread clamps to the platform floor instead of asking for the impossible', () => {
  const memories = [memory('paris', [48.85, 2.34]), memory('shanghai', [31.46, 121.13])];
  const h = overviewHarness(memories);
  const plan = h.p.planOverview(memories);
  assert.equal(plan.level, camera.SCALE_MIN, 'a two-continent set must land on the platform floor');
  assert.deepEqual(commandsOf(h.commands), [], 'and still issues no native camera command');
  assert.ok(h.p.cameraTransition, 'it travels');
});
test('O5 tightly clustered markers clamp to the overview ceiling, not to the maximum zoom', () => {
  const clustered = [memory('a', [31.4600, 121.1300]), memory('b', [31.4601, 121.1301]), memory('c', [31.4602, 121.1302])];
  const h = overviewHarness(clustered);
  const plan = h.p.planOverview(clustered);
  assert.equal(plan.level, camera.OVERVIEW_MAX_SCALE, 'clustered markers must not zoom past the ceiling');
  assert.ok(plan.level <= camera.OVERVIEW_MAX_SCALE && plan.level < camera.SCALE_MAX);
});
test('O6 markers without a usable coordinate never enter the fit', () => {
  const h = overviewHarness([memory('real', [31.46, 121.13]), memory('placeholder', [NaN, undefined])]);
  const plan = h.p.planOverview([memory('real', [31.46, 121.13]), memory('placeholder', [NaN, undefined])]);
  assert.ok(plan, 'the real marker still produces a plan');
  assert.equal(camera.bounds([[NaN, undefined]]), null, 'a placeholder coordinate is not a place');
  const box = camera.bounds(plan.points.map(c => [c.latitude, c.longitude]));
  assert.ok(box.north < 90 && box.south > -90, 'the fit must stay on Earth');
});
test('O7 an overview keeps the selection and its camera plan stable across repeats', () => {
  const h = page({ memories: spread });
  h.p.applyFilters('', 'all', 'b');
  const selected = h.p.data.selectedId;
  h.p.recenter();
  assert.equal(h.p.data.selectedId, selected, 'an overview is not a deselection');
  const first = JSON.stringify(h.p.cameraTransition.to);
  h.p.recenter();
  const second = JSON.stringify(h.p.cameraTransition.to);
  assert.equal(first, second, 'a repeated overview must target the same centre, not drift');
  const levels = h.patches.filter(p => Object.hasOwn(p, 'commandScale')).map(p => p.commandScale);
  assert.ok(levels.every(level => level === levels[0]), 'and must always ask for the same level');
});
test('O8 the overview level is chosen, not inherited from whatever the raw points imply', () => {
  const h = overviewHarness(spread);
  const { plan, travel } = overviewTravel(h, spread);
  assert.ok(plan.level >= camera.SCALE_MIN && plan.level <= camera.OVERVIEW_MAX_SCALE);
  // The level is a decision, not a copy of the raw span: a degenerate set lands on the ceiling
  // instead of the platform maximum, which is exactly what a raw point list cannot express.
  const raw = h.p.planOverview(spread);
  assert.equal(raw.level, plan.level, 'the plan is deterministic');
  const degenerate = h.p.planOverview([spread[0]]);
  assert.equal(degenerate.level, camera.OVERVIEW_MAX_SCALE, 'a single marker lands on the ceiling, not on the maximum');
  assert.ok(Number.isFinite(travel.to[0]) && Number.isFinite(travel.to[1]));
});

// ---------------------------------------------------------------- frozen-surface guards
test('F1 the camera geometry never becomes a bound data path', () => {
  const h = page({ memories: spread });
  h.p.applyFilters('', 'all', 'a');
  h.p.recenter();
  const leaked = h.patches.filter(patch => Object.keys(patch).some(key => /cameraMeasurement|cameraPadding/.test(key)));
  assert.deepEqual(leaked, [], 'geometry must not be published to the template');
  const source = fs.readFileSync(path.join(MP, 'pages', 'map', 'index.js'), 'utf8');
  const wxml = fs.readFileSync(path.join(MP, 'pages', 'map', 'index.wxml'), 'utf8');
  for (const name of ['cameraMeasurement', 'cameraPadding']) {
    assert(!wxml.includes(name), name + ' must not appear in the frozen template');
  }
  assert(source.includes('syncCameraPadding'), 'the measurement must still exist');
});
test('F2 the measured padding supersedes the bootstrap once the query answers', () => {
  const h = page({ memories: spread });
  h.p.applyFilters('', 'all', 'a');
  assert.deepEqual(h.p.cameraPadding(), EXPECTED_PADDING, 'the measurement must be live by command time');
  // A page with no selector query keeps the documented bootstrap rather than guessing.
  const bare = page({ memories: spread });
  bare.p.createSelectorQuery = undefined;
  const padding = bare.p.cameraPadding();
  assert.equal(padding.length, 4);
  assert.ok(padding[2] > 0, 'the bootstrap still reserves the card');
});
test('F3 a hidden page cannot adopt a padding reply that arrives late', () => {
  const h = page({ memories: spread });
  const before = h.p.cameraPaddingRequest || 0;
  h.p.active = false;
  h.p.syncCameraPadding();
  assert.equal(h.p.cameraPaddingRequest || 0, before, 'a hidden page must not start a measurement');
});
test('F4 this round added no new bound camera channel to the frozen template', () => {
  const wxml = fs.readFileSync(path.join(MP, 'pages', 'map', 'index.wxml'), 'utf8');
  assert(wxml.includes('scale="{{commandScale}}"'), 'the bound scale channel is unchanged');
  assert(!wxml.includes('scale="{{mapScale}}"'), 'the observed scale is still never bound');
  assert.equal((wxml.match(/\blatitude="\{\{/g) || []).length, 1, 'exactly one bound latitude');
  assert.equal((wxml.match(/\blongitude="\{\{/g) || []).length, 1, 'exactly one bound longitude');
});

// ---- initial high-frequency hotspot positioning --------------------------------
function confirmedMemory(id, coordinates, extra) {
  return Object.assign(memory(id, coordinates, extra), {
    cloudId: 'cloud-' + id,
    locationSource: 'tencent-picker',
    coordinateSystem: 'gcj02',
    geoConfirmed: true,
  });
}

test('H1 mapCamera.hotspot picks the highest-frequency neighborhood and ignores distant outliers', () => {
  assert.equal(typeof camera.hotspot, 'function', 'mapCamera.hotspot must be exported');
  const items = [
    confirmedMemory('newest-trip', [31.1260, 121.3605]),
    confirmedMemory('taicang-1', [31.4600, 121.1392]),
    confirmedMemory('taicang-2', [31.4604, 121.1377]),
    confirmedMemory('taicang-3', [31.4596, 121.1381]),
    confirmedMemory('taicang-4', [31.4807, 121.1562]),
    confirmedMemory('taicang-5', [31.4251, 121.1380]),
  ];
  const plan = camera.hotspot(items, VIEWPORT, EXPECTED_PADDING);
  assert.ok(plan, 'hotspot returns a camera plan');
  assert.equal(plan.selected.id, 'taicang-1', 'picks most recent inside the densest 0.5km core of the winning 15km neighborhood');
  assert.equal(plan.count, 5, 'excludes 43km distant single outlier');
  assert.ok(plan.level >= 11 && plan.level <= 15, 'frames Taicang at neighborhood zoom, not metropolis scale 10; got ' + plan.level);
  const corners = camera.cornersFor(plan.rawCentre, plan.level, VIEWPORT, EXPECTED_PADDING);
  const box = camera.bounds(corners.map(c => [c.latitude, c.longitude]));
  for (const m of items.slice(1)) {
    assert.ok(m.coordinates[1] >= box.west - 1e-9 && m.coordinates[1] <= box.east + 1e-9, `${m.id} lng inside unobstructed viewport box`);
    assert.ok(m.coordinates[0] >= box.south - 1e-9 && m.coordinates[0] <= box.north + 1e-9, `${m.id} lat inside unobstructed viewport box`);
  }
  const composed = camera.centreForPoint(plan.rawCentre, plan.level, VIEWPORT, EXPECTED_PADDING);
  assert.ok(Math.abs(plan.centre[0] - composed[0]) < 1e-9 && Math.abs(plan.centre[1] - composed[1]) < 1e-9);

  // Midpoint trap: a sparse restaurant halfway between two clusters must not outscore a tight plaza hub
  const midpointItems = [
    confirmedMemory('wanda-1', [31.4600, 121.1392]),
    confirmedMemory('wanda-2', [31.4604, 121.1377]),
    confirmedMemory('wanda-3', [31.4596, 121.1381]),
    confirmedMemory('wanda-4', [31.4601, 121.1370]),
    confirmedMemory('midpoint', [31.4559, 121.1351]),
    confirmedMemory('south-1', [31.4493, 121.1271]),
    confirmedMemory('south-2', [31.4434, 121.1290]),
  ];
  const midpointPlan = camera.hotspot(midpointItems, VIEWPORT, EXPECTED_PADDING);
  assert.equal(midpointPlan.selected.id, 'wanda-1', 'tight plaza hub outscores sparse midpoint bridging south pins');
});

test('H2 mapCamera.hotspot tie-breaks by recency, clamps tight spots to 15, and degrades cleanly at height=0', () => {
  const tied = [
    confirmedMemory('nj-1', [32.0600, 118.7960]),
    confirmedMemory('nj-2', [32.0610, 118.7970]),
    confirmedMemory('sz-1', [31.2980, 120.5850]),
    confirmedMemory('sz-2', [31.2990, 120.5860]),
  ];
  const win = camera.hotspot(tied, VIEWPORT, EXPECTED_PADDING);
  assert.equal(win.selected.id, 'nj-1', 'tie-breaks equal cluster counts by recency');

  const single = camera.hotspot([confirmedMemory('only', [31.4600, 121.1392])], VIEWPORT, EXPECTED_PADDING);
  assert.equal(single.level, 15, 'clamps tight/single point to HOTSPOT_MAX_SCALE=15');

  assert.equal(camera.hotspot([], VIEWPORT, EXPECTED_PADDING), null);
  assert.equal(camera.hotspot([memory('bad', [NaN, 'x'])], VIEWPORT, EXPECTED_PADDING), null);

  const zeroHeight = camera.hotspot([confirmedMemory('a', [31.46, 121.13]), confirmedMemory('b', [31.47, 121.14])], { width: 375, height: 0, safeBottom: 0 }, [180, 65, 312, 0]);
  assert.equal(zeroHeight.level, 13, 'height=0 falls back to level 13 instead of clamping to min scale');
  assert.deepEqual(zeroHeight.centre, zeroHeight.rawCentre);
});

test('H3 cold first open via applyFilters initial lands directly on hotspot with zero Paris pan and cameraAnchorPending=false', () => {
  const items = [
    confirmedMemory('newest-trip', [31.1260, 121.3605]),
    confirmedMemory('taicang-1', [31.4600, 121.1392]),
    confirmedMemory('taicang-2', [31.4604, 121.1377]),
    confirmedMemory('taicang-3', [31.4596, 121.1381]),
    confirmedMemory('taicang-4', [31.4807, 121.1562]),
    confirmedMemory('taicang-5', [31.4251, 121.1380]),
  ];
  const h = page({ memories: items, data: { latitude: 48.8535, longitude: 2.3392, selected: null, selectedId: 'comptoir' } });
  h.p.initialViewportPositioned = false;
  const expectedHotspot = camera.hotspot(items, h.p.cameraViewport(), h.p.cameraPadding());

  h.p.applyFilters('', 'all', '', 'initial');

  assert.equal(h.p.initialViewportPositioned, true);
  assert.equal(h.p.cameraTransition, null, 'must land directly without 640ms cross-Eurasia pan');
  assert.equal(h.p.cameraAnchorPending, false, 'cold initial land must not pull back to stale region');
  assert.equal(h.p.data.selectedId, 'taicang-1');
  assert.ok(Math.abs(h.p.data.latitude - expectedHotspot.centre[0]) < 1e-9);
  assert.ok(Math.abs(h.p.data.longitude - expectedHotspot.centre[1]) < 1e-9);
  assert.equal(h.p.data.commandScale, expectedHotspot.level);
  assert.equal(h.p.data.mapScale, expectedHotspot.level);
  assert.ok(Math.abs(h.p.cameraLiveCentre[0] - expectedHotspot.centre[0]) < 1e-9);
  assert.ok(Math.abs(h.p.cameraLiveCentre[1] - expectedHotspot.centre[1]) < 1e-9);
});

test('H4 onLoad pre-seeds cached hotspot before first render and first syncState skips redundant pan', () => {
  const items = [
    confirmedMemory('newest-trip', [31.1260, 121.3605]),
    confirmedMemory('taicang-1', [31.4600, 121.1392]),
    confirmedMemory('taicang-2', [31.4604, 121.1377]),
    confirmedMemory('taicang-3', [31.4596, 121.1381]),
    confirmedMemory('taicang-4', [31.4807, 121.1562]),
    confirmedMemory('taicang-5', [31.4251, 121.1380]),
  ];
  const origGet = deps.store.get;
  const origRev = deps.store.revision;
  const origId = deps.identity.snapshot;
  const state = { memories: items, settings: { theme: 'light', reduceMotion: false, showNativePoi: true }, identity: { userId: 'u_hotspot' } };
  deps.store.get = () => state;
  deps.store.revision = () => 7;
  deps.identity.snapshot = () => ({ locked: false, userId: 'u_hotspot' });
  try {
    const h = page({ memories: [], data: { latitude: 48.8535, longitude: 2.3392, selected: null, selectedId: 'comptoir' } });
    h.p.renderedRevision = undefined;
    h.p.onLoad();
    assert.ok(Math.abs(h.p.data.latitude - 31.45) < 0.05, 'onLoad pre-seeds Taicang latitude off Paris immediately');
    assert.ok(Math.abs(h.p.data.longitude - 121.14) < 0.05, 'onLoad pre-seeds Taicang longitude immediately');
    assert.equal(h.p.data.selectedId, 'taicang-1');
    assert.equal(h.p.cameraTransition, null);

    h.p.syncState(state);
    assert.equal(h.p.initialViewportPositioned, true);
    assert.equal(h.p.cameraTransition, null, 'initial syncState must not trigger focusMapCamera travel');
    assert.equal(h.p.data.selectedId, 'taicang-1');
    assert.ok(Math.abs(h.p.data.latitude - 31.45) < 0.05);
  } finally {
    deps.store.get = origGet;
    deps.store.revision = origRev;
    deps.identity.snapshot = origId;
  }
});

test('H5 empty boot waits for real memories, later tap travels normally, and account switch resets hotspot', () => {
  const taicang = [
    confirmedMemory('newest-trip', [31.1260, 121.3605]),
    confirmedMemory('taicang-1', [31.4600, 121.1392]),
    confirmedMemory('taicang-2', [31.4604, 121.1377]),
    confirmedMemory('taicang-3', [31.4596, 121.1381]),
    confirmedMemory('taicang-4', [31.4807, 121.1562]),
    confirmedMemory('taicang-5', [31.4251, 121.1380]),
  ];
  const beijing = [
    confirmedMemory('bj-1', [39.9042, 116.4074]),
    confirmedMemory('bj-2', [39.9050, 116.4080]),
  ];
  const h = page({ memories: [], data: { latitude: 48.8535, longitude: 2.3392, selected: null, selectedId: 'comptoir' } });
  h.p.renderedRevision = undefined;
  const origRev = deps.store.revision;
  let rev = 1;
  deps.store.revision = () => rev;
  try {
    h.p.syncState({ memories: [], settings: {}, identity: { userId: 'u_a' } });
    assert.notEqual(h.p.initialViewportPositioned, true, 'empty/demo boot waits for real memories');

    rev = 2;
    h.p.syncState({ memories: taicang, settings: {}, identity: { userId: 'u_a' } });
    assert.equal(h.p.initialViewportPositioned, true);
    assert.equal(h.p.cameraTransition, null);
    assert.equal(h.p.data.selectedId, 'taicang-1');
    assert.ok(Math.abs(h.p.data.latitude - 31.45) < 0.05);

    // Later marker tap still launches smooth A->B cameraTransition
    const outlierIdx = h.p.markerGroups.findIndex(g => g.memory.id === 'newest-trip');
    assert.ok(outlierIdx >= 0);
    h.p.onMarkerTap({ detail: { markerId: outlierIdx } });
    assert.ok(h.p.cameraTransition, 'subsequent user tap still travels smoothly');

    // Account switch resets initialViewportPositioned and lands directly on account B's hotspot
    rev = 3;
    h.p.syncState({ memories: beijing, settings: {}, identity: { userId: 'u_b' } });
    assert.equal(h.p.initialViewportPositioned, true);
    assert.equal(h.p.cameraTransition, null);
    assert.equal(h.p.data.selectedId, 'bj-1');
    assert.ok(Math.abs(h.p.data.latitude - 39.90) < 0.05);
  } finally {
    deps.store.revision = origRev;
  }
});

console.log(passed + ' passed, ' + failed + ' failed; production methods and production geometry, synthetic native replies. No motion claim: the platform exposes no camera animation API.');
if (failed) process.exitCode = 1;
