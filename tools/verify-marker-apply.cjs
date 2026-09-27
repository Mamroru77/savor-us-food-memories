'use strict';
// Marker photo APPLY checks for pages/map/index.js.
//
// Loads the REAL page and the REAL marker renderer into VMs with a virtual clock
// and a synthetic native layer, then drives real zoom / grouping transitions.
//
// Question answered here: when a composed photo is ready, can it actually reach the
// marker the user is looking at? A completed result that is thrown away leaves the
// bundled fallback on screen even though the photo exists.
//
// Structural only. Real device timing and real canvas/cloud costs are NOT measured.

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('node:assert/strict');

const REPO = path.resolve(__dirname, '..');
const PAGE = path.join(REPO, 'miniprogram', 'pages', 'map', 'index.js');
const MARKERS = path.join(REPO, 'miniprogram', 'utils', 'mapMarkers.js');

// ---- virtual clock ---------------------------------------------------------
let vnow = 0, heap = [], timerSeq = 0;
function vsetTimeout(fn, ms) {
  const t = { due: vnow + (Number(ms) || 0), fn, id: ++timerSeq, cancelled: false };
  heap.push(t); return t;
}
function vclearTimeout(t) { if (t) t.cancelled = true; }
const yieldToMicrotasks = () => new Promise(r => setImmediate(r));
function nextTimer() {
  heap = heap.filter(t => !t.cancelled);
  if (!heap.length) return null;
  heap.sort((a, b) => (a.due - b.due) || (a.id - b.id));
  return heap.shift();
}
async function runClock() {
  let guard = 0;
  for (;;) { await yieldToMicrotasks(); const t = nextTimer(); if (!t) break; vnow = Math.max(vnow, t.due); t.fn(); if (++guard > 400000) throw new Error('clock guard tripped'); }
  await yieldToMicrotasks();
}
// Advance virtual time by at most `ms`, running everything due inside the window.
async function pumpClock(ms) {
  const end = vnow + ms; let guard = 0;
  for (;;) {
    await yieldToMicrotasks();
    heap = heap.filter(t => !t.cancelled);
    if (!heap.length) break;
    heap.sort((a, b) => (a.due - b.due) || (a.id - b.id));
    if (heap[0].due > end) break;
    const t = heap.shift(); vnow = Math.max(vnow, t.due); t.fn();
    if (++guard > 400000) throw new Error('clock guard tripped');
  }
  await yieldToMicrotasks();
}
function resetClock() { vnow = 0; heap = []; timerSeq = 0; }

// ---- synthetic native layer ------------------------------------------------
const COST = { imageInfo: 12, photo: 10, frame: 6, export: 18 };
let S = null;
function freshState() {
  resetClock();
  S = { counts: { info: 0, decode: 0, export: 0 }, removed: [], held: new Map(), composites: [] };
  return S;
}

function makeCanvas() {
  const ctx = new Proxy({}, { get: () => () => {} });
  return {
    width: 0, height: 0,
    getContext: () => ctx,
    createImage() {
      const img = { width: 1200, height: 900, _src: '' };
      Object.defineProperty(img, 'src', {
        set(v) {
          img._src = v; S.counts.decode++;
          const isFrame = /-frame\.png$/.test(v);
          const fire = () => { if (img.onload) img.onload(); };
          if (!isFrame && S.held.has(v)) S.held.get(v).push(fire);
          else vsetTimeout(fire, isFrame ? COST.frame : COST.photo);
        },
        get() { return img._src; },
      });
      return img;
    },
  };
}
// Keep a source's decode pending until the test releases it, so a render can be
// made to finish at an exact point relative to a zoom / grouping change.
function hold(src) { if (!S.held.has(src)) S.held.set(src, []); }
function release(src) {
  const queue = S.held.get(src); S.held.delete(src);
  (queue || []).forEach(fire => vsetTimeout(fire, 0));
}

function makeWx() {
  return {
    getImageInfo({ src, success }) { S.counts.info++; vsetTimeout(() => success({ path: src, width: 1200, height: 900 }), COST.imageInfo); },
    canvasToTempFilePath({ success }) {
      S.counts.export++;
      const n = S.counts.export, file = '/tmp/composite-' + n + '.png';
      S.composites.push(file);
      vsetTimeout(() => success({ tempFilePath: file }), COST.export);
    },
    getFileSystemManager: () => ({ unlinkSync: p => S.removed.push(p) }),
  };
}

function loadMapMarkers() {
  const sandbox = {
    module: { exports: {} }, exports: {},
    require: id => {
      if (id === './data') return { isSafeImage: () => true, isCloudImage: () => false };
      if (id === './cloudRecords') return { downloadMapPhoto: () => Promise.reject(new Error('no cloud in this fixture')) };
      if (id === './mapTrace') return require(path.join(REPO, 'miniprogram', 'utils', 'mapTrace'));
      if (id === './photoTrace') return require(path.join(REPO, 'miniprogram', 'utils', 'photoTrace'));
      throw new Error('unexpected require ' + id);
    },
    wx: makeWx(), console, Promise, JSON, Math, Number, Boolean, Object, Array,
    setTimeout: vsetTimeout, clearTimeout: vclearTimeout, Date: { now: () => vnow },
  };
  sandbox.module.exports = sandbox.exports;
  vm.runInNewContext(fs.readFileSync(MARKERS, 'utf8'), sandbox, { filename: MARKERS });
  return sandbox.module.exports;
}

function loadPage(mapMarkersApi) {
  let spec = null;
  const deps = {
    '../../utils/identity': { snapshot: () => ({ locked: false }) },
    '../../utils/i18n': { copy: () => ({}), locale: () => 'zh-CN', syncPage: () => {}, t: x => x },
    '../../utils/uiFeedback': {},
    '../../utils/store': { subscribe: () => () => {}, get: () => ({ memories: [], settings: {} }) },
    '../../utils/data': { formatDate: x => x, photos: { meal: '' } },
    '../../utils/metrics': { getMetrics: () => ({ screenWidth: 375, headerTop: 54 }) },
    '../../utils/locations': { confirmed: () => true, choose: () => Promise.resolve(null) },
    '../../utils/mapMarkers': mapMarkersApi,
    '../../utils/mapLayout': require(path.join(REPO, 'miniprogram', 'utils', 'mapLayout')),
    '../../utils/mapStack': require(path.join(REPO, 'miniprogram', 'utils', 'mapStack')),
    '../../utils/mapProjection': require(path.join(REPO, 'miniprogram', 'utils', 'mapProjection')),
    '../../utils/restaurantCategory': { summary: () => '' },
  };
  vm.runInNewContext(fs.readFileSync(PAGE, 'utf8'), {
    Page: p => { spec = p; },
    require: id => { if (deps[id]) return deps[id]; throw new Error('unexpected require ' + id); },
    wx: {}, console, Promise, JSON, Math, Number, Boolean, Object, Array,
    setTimeout: vsetTimeout, clearTimeout: vclearTimeout, Date: { now: () => vnow },
  }, { filename: PAGE });
  return spec;
}

function assignPath(root, key, value) {
  const parts = key.replace(/\[(\d+)\]/g, '.$1').split('.');
  let node = root;
  for (let i = 0; i < parts.length - 1; i++) { node = node[parts[i]]; if (node === undefined || node === null) return; }
  node[parts[parts.length - 1]] = value;
}

// `quiet` mirrors the product's reduceMotion flag. Turning it on here isolates
// marker-PHOTO writes from the separate marker size animation, which is not what
// this file is measuring.
function makePage(spec, memories) {
  const p = Object.assign({}, spec, {
    data: JSON.parse(JSON.stringify(spec.data)),
    active: true, disposed: false,
    allMemories: memories,
    markerGroups: [],
    writes: [],
  });
  p.data.quiet = true;
  // This suite is about the native marker PHOTO pipeline, which is the same in both drawer
  // renderers. Pin the mode so the anchor-shape expectations below stay about the callout
  // arm and never silently inherit the overlay arm's visible cluster root.
  p.data.drawerRenderMode = 'native-callout';
  p.setData = function (patch, done) {
    this.writes.push({ keys: Object.keys(patch) });
    for (const [key, value] of Object.entries(patch)) assignPath(this.data, key, value);
    if (done) vsetTimeout(done, 0);
  };
  return p;
}

function memory(id, lat, lon) {
  return {
    id, restaurant: 'R' + id, city: 'C', country: 'F', tags: [],
    coordinates: [lat, lon], date: '2026-01-01',
    photo: 'wxfile://tmp/' + id + '.jpg',
  };
}
const FALLBACK = id => '/images/markers/landmark-normal-fallback.png';

function markerOf(p, memoryId) { return (p.data.markers || []).find(m => m.memoryId === memoryId); }
function photoApplied(p, memoryId) {
  const m = markerOf(p, memoryId);
  return Boolean(m && typeof m.iconPath === 'string' && m.iconPath.startsWith('/tmp/composite-'));
}

// ---- fixtures --------------------------------------------------------------
// Two restaurants ~1.5km apart in longitude: singletons at every supported scale
// (a selected marker is 80px wide, so the grouping threshold is 74px, not 58px).
const FAR = [48.8535, 2.3392];
const NEAR = [48.8535, 2.3400];
const NEAR_B = [48.8535, 2.3412];
// Well separated singletons at every supported scale.
const APART = [[48.8535, 2.3392], [48.8535, 2.3592], [48.8450, 2.3800], [48.8700, 2.3300]];

const tests = [];
let count = 0;
const failures = [];
async function test(name, fn) {
  try { await fn(); count++; console.log('PASS ' + name); }
  catch (error) { failures.push(name); console.error('FAIL ' + name + '\n  ' + String(error && error.message).split('\n')[0]); }
}

// A1 — a completed render whose generation went stale must still reach the marker
// that is STILL the current singleton with the same source and selection.
tests.push(() => test('a stale-generation result still applies to the same current singleton', async () => {
  freshState();
  const api = loadMapMarkers(), spec = loadPage(api);
  const memories = [memory('A', APART[0][0], APART[0][1])];
  const p = makePage(spec, memories);
  p.markerCanvas = makeCanvas(); p.initMarkerRenderer();

  hold(memories[0].photo);
  p.applyFilters('', 'all', 'A', 'preserve');
  await pumpClock(20);
  assert.equal(S.counts.decode, 1, 'A decode should be in flight');
  assert.equal(S.counts.export, 0, 'A must not have composed yet');

  // A native gesture bumps the generation while the compose is still running. The
  // page skips renderMarkerPhotos for the whole gesture, so the newest generation
  // has no completion handler attached at all.
  p.stackGesture = true;
  p.applyFilters('', 'all', 'A', 'preserve');
  await pumpClock(20);                 // the rebuild lands while the gesture is active
  p.stackGesture = false;

  release(memories[0].photo);
  await runClock();

  assert.ok(photoApplied(p, 'A'), 'A is still the current singleton with the same source; its ready photo must be applied (got ' + (markerOf(p, 'A') || {}).iconPath + ')');
}));

// A2 — a result for a memory that is now a cluster member must never be painted
// onto the stack anchor.
tests.push(() => test('a result whose memory is now clustered is not painted on the anchor', async () => {
  freshState();
  const api = loadMapMarkers(), spec = loadPage(api);
  const memories = [memory('A', NEAR[0], NEAR[1]), memory('B', NEAR_B[0], NEAR_B[1])];
  const p = makePage(spec, memories);
  p.markerCanvas = makeCanvas(); p.initMarkerRenderer();

  hold(memories[0].photo);
  p.applyFilters('', 'all', 'A', 'preserve');          // mapScale 13 -> A and B cluster
  await pumpClock(20);
  const clustered = p.markerGroups.some(g => g.members.length > 1);
  assert.ok(clustered, 'the fixture must cluster A and B at the default scale');

  p.setData({ mapScale: 16.9 });                        // singletons
  p.applyFilters('', 'all', 'A', 'preserve');
  await pumpClock(20);
  assert.equal(p.markerGroups.filter(g => g.members.length === 1).length, 2, 'both must be singletons now');
  p.setData({ mapScale: 13 });
  p.applyFilters('', 'all', 'A', 'preserve');           // back to a cluster
  assert.ok(p.markerGroups.some(g => g.members.length > 1), 'A and B must cluster again');

  release(memories[0].photo);
  await runClock();

  const anchor = markerOf(p, 'A');
  assert.ok(anchor, 'the anchor marker for the cluster representative must exist');
  assert.equal(anchor.groupCount > 1, true, 'the representative must still be a stack anchor');
  assert.equal(anchor.iconPath, '/images/markers/stack-anchor.png', 'a stack anchor must never receive an individual photo');
  assert.ok(!(p.data.markers || []).some(m => typeof m.iconPath === 'string' && m.iconPath.startsWith('/tmp/composite-')), 'no marker may show a photo while the group is a stack');
}));

// A3 — a photo swap must never let the previous source's composite win.
tests.push(() => test('a result for a replaced source is never applied to the new photo', async () => {
  freshState();
  const api = loadMapMarkers(), spec = loadPage(api);
  const memories = [memory('A', APART[0][0], APART[0][1]), memory('B', APART[1][0], APART[1][1])];
  const p = makePage(spec, memories);
  p.markerCanvas = makeCanvas(); p.initMarkerRenderer();

  hold(memories[0].photo);
  p.applyFilters('', 'all', 'A', 'preserve');
  await pumpClock(20);
  assert.equal(p.markerGroups.filter(g => g.members.length === 1).length, 2, 'the fixture must start as two singletons');

  const oldSource = memories[0].photo;
  memories[0].photo = 'wxfile://tmp/A-replaced.jpg';   // same memory, new photo
  p.markerGeneration = (p.markerGeneration || 0) + 1;  // any later event
  release(oldSource);
  await runClock();

  assert.ok(!photoApplied(p, 'A'), 'the superseded source must never be painted onto the replaced photo');
}));

// A4 — zoom jitter around a grouping threshold must settle with every ready photo bound.
tests.push(() => test('zoom oscillation settles with every ready singleton rebound', async () => {
  freshState();
  const api = loadMapMarkers(), spec = loadPage(api);
  const memories = [memory('A', NEAR[0], NEAR[1]), memory('B', NEAR_B[0], NEAR_B[1])];
  const p = makePage(spec, memories);
  p.markerCanvas = makeCanvas(); p.initMarkerRenderer();

  p.applyFilters('', 'all', 'A', 'preserve');
  for (const scale of [13.9, 14.0, 13.99, 14.01]) {
    p.setData({ mapScale: scale });
    p.applyFilters('', 'all', 'A', 'preserve');
    await pumpClock(5);
  }
  await pumpClock(60);
  p.setData({ mapScale: 16.9 });
  p.applyFilters('', 'all', 'A', 'preserve');
  await runClock();

  const singletons = p.markerGroups.filter(g => g.members.length === 1).map(g => g.memory.id);
  assert.equal(singletons.length, 2, 'the settled scale must make both memories singletons');
  for (const id of singletons) {
    assert.ok(photoApplied(p, id), 'singleton ' + id + ' must show its photo after the zoom settles, not the bundled fallback');
  }
}));

// A4b — the device trace must name WHY a photo did or did not reach a marker, and must
// never carry a path or a file id while doing it. This is the field set a device run is
// read for, so it is pinned here rather than left to inspection.
tests.push(() => test('the apply trace names the settled rebound and stores no paths', async () => {
  freshState();
  const api = loadMapMarkers(), spec = loadPage(api);
  api.trace.setEnabled(true);
  api.trace.clear();
  try {
    const memories = [memory('A', APART[0][0], APART[0][1])];
    const p = makePage(spec, memories);
    p.markerCanvas = makeCanvas(); p.initMarkerRenderer();

    hold(memories[0].photo);
    p.applyFilters('', 'all', 'A', 'preserve');
    await pumpClock(20);
    // The compose lands while a native gesture is in flight, so the page defers it.
    p.stackGesture = true;
    release(memories[0].photo);
    await pumpClock(40);
    const deferred = api.trace.snapshot().some(e => e.applyResult === 'gesture-deferred');
    assert.ok(deferred, 'the completion must have been recorded as deferred by the gesture');
    assert.ok(!photoApplied(p, 'A'), 'nothing may be bound while the gesture is active');

    // The gesture ends and the region settles: this is the existing settle event that
    // must hand the already-composed photo back to the marker.
    p.stackGesture = false;
    p.rebindReadyMarkerPhotos();
    await pumpClock(5);

    const results = Array.from(new Set(api.trace.snapshot().map(e => e.applyResult).filter(Boolean)));
    assert.ok(results.indexOf('ready-cache-rebound') >= 0,
      'the settle must name the rebound case, saw ' + JSON.stringify(results));
    assert.ok(photoApplied(p, 'A'), 'the marker must end up with its composed photo');

    const snapshot = api.trace.snapshot();
    snapshot.forEach(entry => {
      Object.keys(entry).forEach(field => {
        assert.ok(api.trace.FIELDS.indexOf(field) >= 0, 'the trace may only store declared fields, saw ' + field);
      });
      assert.equal(typeof entry.jobId, 'number', 'every record must carry a numeric job id');
    });
    const text = JSON.stringify(snapshot);
    assert.equal(text.indexOf('wxfile://'), -1, 'no local path may be stored');
    assert.equal(text.indexOf('cloud://'), -1, 'no cloud id may be stored');
    assert.equal(text.indexOf('/tmp/'), -1, 'no temp path may be stored');
    assert.equal(text.indexOf('/images/'), -1, 'no bundled path may be stored');
  } finally { api.trace.setEnabled(false); }
}));

// A5 — the enhancement budget must not permanently strand markers past the cap.
tests.push(() => test('every singleton eventually receives a photo, not just the first batch', async () => {
  freshState();
  const api = loadMapMarkers(), spec = loadPage(api);
  const memories = [];
  for (let i = 0; i < 60; i++) memories.push(memory('M' + String(i).padStart(2, '0'), 48.60 + i * 0.02, 2.10 + i * 0.02));
  const p = makePage(spec, memories);
  p.markerCanvas = makeCanvas(); p.initMarkerRenderer();

  p.setData({ mapScale: 17 });                       // wide apart: every one is a singleton
  p.applyFilters('', 'all', 'M00', 'preserve');
  await pumpClock(200);
  // Later events must be able to advance past the first batch.
  for (let pass = 0; pass < 6; pass++) {
    p.applyFilters('', 'all', p.data.selectedId, 'preserve');
    await pumpClock(400);
  }
  await runClock();

  const singletons = p.markerGroups.filter(g => g.members.length === 1).map(g => g.memory.id);
  const missing = singletons.filter(id => !photoApplied(p, id));
  assert.equal(missing.length, 0, 'markers stranded on the bundled fallback: ' + missing.length + ' of ' + singletons.length + ' (' + missing.slice(0, 8).join(', ') + ')');
}));

// A5b — the >48 proof, stated as the failure it replaces. The old page applied
// `.slice(0,48)` on EVERY enhancement pass, so with 60 singletons the last 12 were never
// handed to the renderer at all and stayed on the bundled fallback for the whole session.
// Raising the renderer's own LIMIT cannot repair that, because the request never left the
// page - so this test observes the REQUESTS, not just the results, and asserts the
// requested set crosses the old cap instead of repeating the same first 48.
tests.push(() => test('sixty singletons cross the old 48-request cap instead of repeating it', async () => {
  freshState();
  const api = loadMapMarkers(), spec = loadPage(api);
  const memories = [];
  for (let i = 0; i < 60; i++) memories.push(memory('N' + String(i).padStart(2, '0'), 48.60 + i * 0.02, 2.10 + i * 0.02));
  const p = makePage(spec, memories);
  p.markerCanvas = makeCanvas(); p.initMarkerRenderer();

  const requested = new Set();
  const inner = p.pinRenderer.render.bind(p.pinRenderer);
  p.pinRenderer.render = (m, selected) => { requested.add(m.id); return inner(m, selected); };

  p.setData({ mapScale: 17 });                       // wide apart: every one is a singleton
  p.applyFilters('', 'all', 'N00', 'preserve');
  await pumpClock(200);
  for (let pass = 0; pass < 6; pass++) {
    p.applyFilters('', 'all', p.data.selectedId, 'preserve');
    await pumpClock(400);
  }
  await runClock();

  const singletons = p.markerGroups.filter(g => g.members.length === 1).map(g => g.memory.id);
  assert.equal(singletons.length, 60, 'the fixture must present 60 singletons, saw ' + singletons.length);

  const neverRequested = singletons.filter(id => !requested.has(id));
  assert.equal(neverRequested.length, 0,
    'memories never handed to the renderer: ' + neverRequested.length + ' (' + neverRequested.slice(0, 8).join(', ') + ')');
  assert.ok(requested.size > 48, 'the requested set must exceed the old cap, saw ' + requested.size);

  // The specific 12 the old cap could never reach must both be requested and land.
  const tail = singletons.slice(48);
  assert.equal(tail.length, 12, 'the fixture must place 12 singletons past the old cap');
  assert.ok(tail.every(id => requested.has(id)), 'every singleton past the old cap must be requested');
  assert.ok(tail.every(id => photoApplied(p, id)), 'the last 12 singletons must end up with a photo, not the fallback');
  console.log('  measured: ' + requested.size + '/60 singletons requested, tail ' + tail.length + ' requested and applied');
}));

// C1 — a burst of ready photos must not cost one whole-array write each.
tests.push(() => test('ten photos that become ready together cost one marker write, not ten', async () => {
  freshState();
  const api = loadMapMarkers(), spec = loadPage(api);
  const memories = [];
  for (let i = 0; i < 10; i++) memories.push(memory('B' + i, 48.60 + i * 0.02, 2.10 + i * 0.02));
  const p = makePage(spec, memories);
  p.markerCanvas = makeCanvas(); p.initMarkerRenderer();
  p.setData({ mapScale: 17 });                       // wide apart: ten singletons

  const saved = { export: COST.export, photo: COST.photo, imageInfo: COST.imageInfo, frame: COST.frame };
  COST.export = 0; COST.photo = 0; COST.imageInfo = 0; COST.frame = 0;                   // every compose lands in one virtual instant
  p.applyFilters('', 'all', 'B0', 'preserve');
  const before = p.writes.length;
  await runClock();
  const markerWrites = p.writes.slice(before).filter(w => w.keys.includes('markers')).length;
  COST.export = saved.export; COST.photo = saved.photo; COST.imageInfo = saved.imageInfo; COST.frame = saved.frame;

  const applied = memories.filter(m => photoApplied(p, m.id)).length;
  console.log('    measured: 10 simultaneous photos -> ' + markerWrites + ' marker write(s), ' + applied + ' applied');
  assert.equal(applied, 10, 'all ten photos must still be applied, applied=' + applied);
  assert.ok(markerWrites <= 2, 'ten simultaneous photos must batch into <= 2 marker writes, saw ' + markerWrites);
}));

// C2 — a selected photo must not wait behind the batch window.
tests.push(() => test('a selected photo is published immediately, without waiting a frame', async () => {
  freshState();
  const api = loadMapMarkers(), spec = loadPage(api);
  const memories = [memory('S', 48.8535, 2.3392), memory('N', 48.8450, 2.3800)];
  const p = makePage(spec, memories);
  p.markerCanvas = makeCanvas(); p.initMarkerRenderer();
  p.setData({ mapScale: 17 });

  const saved = { export: COST.export, photo: COST.photo, imageInfo: COST.imageInfo, frame: COST.frame };
  COST.export = 0; COST.photo = 0; COST.imageInfo = 0; COST.frame = 0;
  p.applyFilters('', 'all', 'S', 'preserve');
  await pumpClock(8);                                // strictly less than one batch frame
  const applied = photoApplied(p, 'S');
  COST.export = saved.export; COST.photo = saved.photo; COST.imageInfo = saved.imageInfo; COST.frame = saved.frame;
  assert.ok(applied, 'the selected photo must be applied inside the frame it became ready');
}));

// C3 — a normal photo is published on the next tick, not held for a fixed pause.
tests.push(() => test('a lone normal photo is published on the next tick, not after a fixed pause', async () => {
  freshState();
  const api = loadMapMarkers(), spec = loadPage(api);
  const memories = [memory('N', 48.8535, 2.3392)];
  const p = makePage(spec, memories);
  p.markerCanvas = makeCanvas(); p.initMarkerRenderer();
  p.setData({ mapScale: 17 });

  const saved = { export: COST.export, photo: COST.photo, imageInfo: COST.imageInfo, frame: COST.frame };
  COST.export = 0; COST.photo = 0; COST.imageInfo = 0; COST.frame = 0;
  p.applyFilters('', 'all', 'N', 'preserve');
  await pumpClock(0);
  const applied = photoApplied(p, 'N');
  COST.export = saved.export; COST.photo = saved.photo; COST.imageInfo = saved.imageInfo; COST.frame = saved.frame;
  assert.ok(applied, 'the first photo of a quiet period must not wait a whole frame');
}));

(async () => {
  let completed = false;
  process.on('beforeExit', () => { if (!completed) { console.error('marker apply checks did not run to completion'); process.exitCode = 1; } });
  for (const run of tests) await run();
  if (failures.length) {
    console.error('\n' + failures.length + ' FAILED, ' + count + ' passed:');
    for (const name of failures) console.error('  - ' + name);
    process.exitCode = 1;
    completed = true;
    return;
  }
  console.log(count + '/' + count + ' marker apply checks passed (synthetic clock; no device claim).');
  completed = true;
})().catch(error => { console.error(error); process.exitCode = 1; });
