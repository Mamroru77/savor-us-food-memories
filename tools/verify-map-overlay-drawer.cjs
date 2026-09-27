'use strict';
// Ordinary-view overlay drawer checks for pages/map/index.js.
//
// The drawer's animated ink used to live inside the native map's customCallout, so every
// 320ms expand travelled the JS -> native map bridge. This file drives the REAL page in a
// VM with a virtual clock and pins the replacement architecture:
//
//   native-callout  the native map still owns the ink; the ordinary overlay is hit-only
//   view-overlay    the native map keeps only a STATIC root marker; every animated pixel
//                   is an ordinary view, so the motion never touches the map compositor
//
// What this can prove: the write counts, the geometry equivalence and the gesture
// semantics. What it CANNOT prove: whether an ordinary view composites more smoothly than
// a cover-view on a real device. That is a device question.

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('node:assert/strict');

const REPO = path.resolve(__dirname, '..');
const PAGE = path.join(REPO, 'miniprogram', 'pages', 'map', 'index.js');
const WXML = path.join(REPO, 'miniprogram', 'pages', 'map', 'index.wxml');
const WXSS = path.join(REPO, 'miniprogram', 'pages', 'map', 'index.wxss');
const stack = require(path.join(REPO, 'miniprogram', 'utils', 'mapStack'));
const projection = require(path.join(REPO, 'miniprogram', 'utils', 'mapProjection'));

// ---- virtual clock ---------------------------------------------------------
let vnow = 0, heap = [], timerSeq = 0;
function vsetTimeout(fn, ms) {
  const t = { due: vnow + (Number(ms) || 0), fn, id: ++timerSeq, cancelled: false };
  heap.push(t); return t;
}
function vclearTimeout(t) { if (t) t.cancelled = true; }
const yieldToMicrotasks = () => new Promise(r => setImmediate(r));
async function runClock() {
  let guard = 0;
  for (;;) {
    await yieldToMicrotasks();
    heap = heap.filter(t => !t.cancelled);
    if (!heap.length) break;
    heap.sort((a, b) => (a.due - b.due) || (a.id - b.id));
    const t = heap.shift();
    vnow = Math.max(vnow, t.due);
    t.fn();
    if (++guard > 200000) throw new Error('clock guard tripped');
  }
  await yieldToMicrotasks();
}
function resetClock() { vnow = 0; heap = []; timerSeq = 0; }
// Advance virtual time by at most `ms`, running everything due inside the window. Lets a
// test observe the state BEFORE an in-flight composition resolves.
async function pumpClock(ms) {
  const end = vnow + ms; let guard = 0;
  for (;;) {
    await yieldToMicrotasks();
    heap = heap.filter(t => !t.cancelled);
    if (!heap.length) break;
    heap.sort((a, b) => (a.due - b.due) || (a.id - b.id));
    if (heap[0].due > end) break;
    const t = heap.shift(); vnow = Math.max(vnow, t.due); t.fn();
    if (++guard > 200000) throw new Error('clock guard tripped');
  }
  await yieldToMicrotasks();
}

// ---- page harness ----------------------------------------------------------
function loadPage() {
  let spec = null;
  const deps = {
    '../../utils/identity': { snapshot: () => ({ locked: false }) },
    '../../utils/i18n': { copy: () => ({}), locale: () => 'zh-CN', syncPage: () => {}, t: x => x },
    '../../utils/uiFeedback': {},
    '../../utils/store': { subscribe: () => () => {}, get: () => ({ memories: [], settings: {} }) },
    '../../utils/data': { formatDate: x => x, photos: { meal: '' } },
    '../../utils/metrics': { getMetrics: () => ({ screenWidth: 375, headerTop: 54 }) },
    '../../utils/locations': { confirmed: () => true, choose: () => Promise.resolve(null) },
    '../../utils/mapMarkers': {
      photoFor: m => m.photo || '',
      style: s => ({
        iconPath: '/images/markers/landmark-' + (s ? 'selected' : 'normal') + '-fallback.png',
        width: s ? 80 : 48, height: s ? 89.375 : 53.625, anchor: { x: 0.5, y: 0.965 }, zIndex: s ? 9999 : 100,
      }),
      fallback: s => '/images/markers/landmark-' + (s ? 'selected' : 'normal') + '-fallback.png',
    },
    '../../utils/mapLayout': require(path.join(REPO, 'miniprogram', 'utils', 'mapLayout')),
    '../../utils/mapStack': stack,
    '../../utils/mapProjection': projection,
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

// `anchorY` far down the screen -> drawer opens upward; near the top -> downward.
function makePage(spec, count, anchorY, options) {
  const opts = options || {};
  const members = [];
  for (let i = 0; i < count; i++) members.push({
    id: i === 0 ? 'root' : 'other-' + i, restaurant: 'R' + i, date: '2026-01-01',
    coordinates: [48.85 + i * 0.001, 2.34 + i * 0.001], photo: 'wxfile://tmp/' + i + '.jpg',
  });
  const groups = [{ memory: members[0], members }];
  const p = Object.assign({}, spec, {
    data: JSON.parse(JSON.stringify(spec.data)),
    active: true, disposed: false,
    allMemories: members, markerGroups: groups,
    writes: [],
  });
  p.data.quiet = false;
  p.data.drawerCssMotion = Boolean(opts.cssMotion);
  if (opts.mode !== undefined) p.data.drawerRenderMode = opts.mode;
  p.data.clusterOpen = false;
  p.data.selectedId = 'root';
  p.data.markers = [{ memoryId: 'root', customCallout: { anchorY: 0 }, iconPath: '/images/markers/stack-anchor.png' }];
  p.stackPositions = { root: { x: 200, y: anchorY } };
  p.pinRenderer = {
    peek: () => '/tmp/composed.png', render: () => Promise.resolve('/tmp/composed.png'),
    dispose() {}, traceJobId: () => 0,
  };
  p.setData = function (patch, done) {
    this.writes.push({ t: vnow, keys: Object.keys(patch), bytes: JSON.stringify(patch).length });
    for (const [key, value] of Object.entries(patch)) assignPath(this.data, key, value);
    if (done) vsetTimeout(done, 0);
  };
  return p;
}

const drawerWrites = p => p.writes.filter(w => w.keys.some(k => k === 'mapDrawers' || /^mapDrawers\[/.test(k)));
const frameWrites = p => p.writes.filter(w => w.keys.some(k => /^mapDrawers\[\d+\]\.(progress|height|rootTop|rows\[\d+\]\.(top|opacity))$/.test(k)));
const markerWrites = p => p.writes.filter(w => w.keys.some(k => k === 'markers' || /^markers\[/.test(k)));

// Drives the REAL marker build, so the marker-shape assertions describe shipped data
// rather than a hand-written fixture. No selectorQuery is provided, so the canvas lookup
// returns early and the renderer stub below stays in place.
async function buildMarkers(p, preferredId) {
  p.pendingLocations = [];
  p.applyFilters('', 'all', preferredId === undefined ? 'root' : preferredId, 'preserve');
  await runClock();
  return p;
}

// ---- the two coordinate systems, computed independently --------------------
//
// The native callout places a row inside a frame anchored at
//   calloutTop = screenY - frameHeight + calloutOffset
// with the per-branch expressions the WXML uses. The ordinary overlay places it at
//   overlayTop + overlayRowTop
// The two must land on the same device pixel: that is the whole equivalence claim.
function calloutTopOf(d) { return d.screenY - d.frameHeight + (d.calloutOffset || 0); }
function calloutRowTopOf(d, row) { return d.down ? row.top - d.rootTop : d.frameHeight - d.height + row.top; }
function calloutRootTopOf(d) { return d.down ? 0 : d.frameRootTop; }
function calloutToggleTopOf(d) { return d.down ? d.buttonBox.top - d.rootTop : d.frameHeight - d.height + d.buttonBox.top; }

// The ORIGINAL toggle asset rule, transcribed from the two native-callout WXML branches.
// The two orientations are NOT the same condition, which is the trap this file pins:
//   upward   branch: targetOpen ? down : up
//   downward branch: !targetOpen ? down : up
function originalToggleAsset(down, targetOpen, dusk) {
  const suffix = dusk ? '-dusk' : '';
  const showDown = down ? !targetOpen : targetOpen;
  return '/images/markers/stack-button-' + (showDown ? 'down' : 'up') + suffix + '.png';
}
// Where the callout actually paints the button, given the wrapper the overlay uses.
function composedOverlayToggleTop(d) { return d.overlayTop + d.overlayToggleTop + d.toggleGlyphTop; }
function composedOverlayToggleLeft(d) { return d.screenX + d.buttonBox.hitLeft + d.toggleGlyphLeft; }

// The pre-round-4 overlay hit geometry, kept as the "old implementation" reference.
function legacyOverlayRowTopOf(d, row) { return d.screenY - d.height + row.top; }

const tests = [];
let count = 0;
const failures = [];
async function test(name, fn) {
  try { await fn(); count++; console.log('PASS ' + name); }
  catch (error) { failures.push(name); console.error('FAIL ' + name + '\n  ' + String(error && error.message).split('\n')[0]); }
}

// D1 — the whole point: an overlay-mode open must not cross the native map bridge.
tests.push(() => test('D1 an overlay-driven open costs no frame writes', async () => {
  resetClock();
  const spec = loadPage();
  const p = makePage(spec, 4, 900, { mode: 'view-overlay' });
  p.onDrawerToggle({ currentTarget: { dataset: { index: 0 } } });
  await runClock();
  const frames = frameWrites(p).length;
  console.log('    measured: overlay open -> ' + drawerWrites(p).length + ' drawer write(s), ' + frames + ' of them frame writes');
  assert.equal(frames, 0, 'the overlay driver must never emit a frame patch, saw ' + frames);
  assert.ok(drawerWrites(p).length <= 3, 'an overlay open must cost O(1) drawer writes, saw ' + drawerWrites(p).length);
  assert.equal(p.data.mapDrawers[0].targetOpen, true, 'the logical state must still flip');
}));

// D2 — with the ink gone from the callout, no animation step may touch the marker array.
// A marker write here would mean the native map is being asked to re-lay-out mid-motion.
tests.push(() => test('D2 opening and closing never writes the markers array', async () => {
  resetClock();
  const spec = loadPage();
  const p = makePage(spec, 4, 900, { mode: 'view-overlay' });
  const tap = () => p.onDrawerToggle({ currentTarget: { dataset: { index: 0 } } });
  tap(); await runClock();
  tap(); await runClock();
  tap(); await runClock();
  const writes = markerWrites(p).length;
  console.log('    measured: 3 toggles -> ' + writes + ' marker write(s)');
  assert.equal(writes, 0, 'drawer motion must not write the markers array, saw ' + writes);
}));

// D3 — overlay mode must not hand the native map a callout that carries animation.
tests.push(() => test('D3 overlay mode gives the cluster no animated customCallout', async () => {
  resetClock();
  const spec = loadPage();
  const p = makePage(spec, 4, 900, { mode: 'view-overlay' });
  await buildMarkers(p);
  assert.equal(p.data.markers.length, 1, 'the four nearby memories must group into one cluster');
  assert.equal(p.markerGroups[0].members.length, 4, 'the cluster must own all four members');
  const marker = p.data.markers[0];
  assert.equal(marker.customCallout, undefined,
    'overlay mode must not mount a callout for the animated drawer, got ' + JSON.stringify(marker.customCallout));
  // And the native-callout arm must still mount it, or the two arms are not an A/B.
  resetClock();
  const native = makePage(loadPage(), 4, 900, { mode: 'native-callout', cssMotion: true });
  await buildMarkers(native);
  assert.ok(native.data.markers[0].customCallout,
    'the native-callout arm must keep its callout');
  const w = fs.readFileSync(WXML, 'utf8');
  assert.ok(w.includes("slot=\"callout\" wx:if=\"{{drawerRenderMode === 'native-callout'}}\""),
    'the callout block must be gated on native-callout mode');
}));

// D4 — the overlay must reach exactly the native callout's pixels, computed independently
// from mapStack rather than from the drawer's own fields.
tests.push(() => test('D4 overlay rows land on the native callout geometry', async () => {
  resetClock();
  const spec = loadPage();
  for (const [anchorY, down] of [[900, false], [300, true]]) {
    const p = makePage(spec, 4, anchorY, { mode: 'view-overlay' });
    p.onDrawerToggle({ currentTarget: { dataset: { index: 0 } } });
    await runClock();
    const d = p.data.mapDrawers[0];
    assert.equal(d.down, down, 'fixture must select the expected orientation');
    assert.equal(d.rows.length, 3, 'the fixture must produce three drawer rows');
    assert.equal(d.overlayTop, calloutTopOf(d),
      'the overlay container must sit exactly where the callout frame sits (down=' + down + ')');
    assert.equal(d.overlayHeight, d.frameHeight, 'the overlay container must be the fixed native frame');
    // Independently: where does the raw stack layout put the open row?
    const f1 = stack.layout(3, 1);
    d.rows.forEach((row, i) => {
      const j = 3 - 1 - i;                                  // rows are painted in reverse order
      const expected = down
        ? (d.screenY - stack.HEIGHT) + (2 * f1.rootTop - f1.slots[j].top) - f1.rootTop
        : (d.screenY - f1.height) + f1.slots[j].top;
      assert.equal(d.overlayTop + row.overlayRowTop, expected,
        'overlay row ' + i + ' must land on the open layout (down=' + down + ')');
    });
    assert.equal(d.overlayTop + d.overlayRootTop, d.screenY - stack.HEIGHT,
      'the overlay root must stay anchored on the real coordinate');
    assert.equal(d.overlayTop + d.overlayRootTop, d.screenY - 89,
      'the root anchor is the pin height, not the animated frame height');
  }
}));

// D5 / D6 — the closed and open endpoints of the transform.
tests.push(() => test('D5 a collapsed overlay row is transparent, offset and untappable', async () => {
  resetClock();
  const spec = loadPage();
  const p = makePage(spec, 4, 900, { mode: 'view-overlay' });
  p.refreshStackFrame();
  await runClock();
  const d = p.data.mapDrawers[0];
  assert.equal(d.targetOpen, false, 'the drawer must be closed');
  assert.equal(d.rows.length, 3, 'rows stay mounted while closed so the transition has something to move');
  assert.ok(d.rows.every(r => r.opacity === 0), 'every closed row must be transparent');
  assert.ok(d.rows.every(r => r.shiftY !== 0), 'every closed row must carry its travel offset');
  assert.notEqual(d.toggleShiftY, 0, 'the closed toggle must carry its travel offset');
  const w = fs.readFileSync(WXML, 'utf8');
  assert.ok(w.includes("pointer-events:{{pin.opacity > 0.2 ? 'auto' : 'none'}}"),
    'row hit testing must follow the row opacity');
}));

tests.push(() => test('D6 an open overlay row is opaque, home and tappable', async () => {
  resetClock();
  const spec = loadPage();
  const p = makePage(spec, 4, 900, { mode: 'view-overlay' });
  p.onDrawerToggle({ currentTarget: { dataset: { index: 0 } } });
  await runClock();
  const d = p.data.mapDrawers[0];
  assert.ok(d.rows.every(r => r.opacity === 1), 'every open row must be fully opaque');
  assert.ok(d.rows.every(r => r.opacity > 0.2), 'every open row must be tappable');
  assert.equal(d.rows.length, 3, 'an open drawer keeps its rows mounted');
  // The visible row and the tappable row are the same element: one rect, one offset.
  const w = fs.readFileSync(WXML, 'utf8');
  assert.ok(w.includes("transform:translate3d(0,' + (drawer.targetOpen ? 0 : pin.shiftY) + 'px,0)"),
    'the row must carry its own closed-state offset');
}));

// D7 — the invariant that makes the architecture safe: when the overlay is hidden the
// native map must still show something for the cluster.
tests.push(() => test('D7 during a gesture the overlay hides but the cluster root stays visible', async () => {
  resetClock();
  const spec = loadPage();
  const p = makePage(spec, 4, 900, { mode: 'view-overlay' });
  await buildMarkers(p);
  const marker = p.data.markers[0];
  assert.ok(marker.width > 1 && marker.height > 1,
    'the native cluster marker must keep a visible size, got ' + marker.width + 'x' + marker.height);
  assert.notEqual(marker.iconPath, '/images/markers/stack-anchor.png',
    'the cluster must not fall back to the invisible 1px anchor');
  // Cross-realm: the page's literal has the VM's Object.prototype, so compare fields.
  assert.equal(marker.anchor.x, 0.5, 'the cluster anchor must stay horizontally centred');
  assert.equal(marker.anchor.y, 1,
    'the cluster anchor must stay bottom-centre, or the projected coordinate and the overlay frame drift apart');
  p.mapCtx = null;                                     // a pan needs no projection at all
  p.onMapRegionChange({ detail: { type: 'begin' } });
  await runClock();
  assert.equal(p.data.stackPositionsReady, false, 'the ordinary overlay must be hidden during a gesture');
  assert.equal(p.stackGesture, true, 'the gesture must be flagged');
  const after = p.data.markers[0];
  assert.ok(after.width > 1, 'the native cluster marker must survive the gesture, got ' + after.width);
  // The native-callout arm keeps the legacy invisible anchor: the callout draws the stack.
  resetClock();
  const native = makePage(loadPage(), 4, 900, { mode: 'native-callout', cssMotion: true });
  await buildMarkers(native);
  assert.equal(native.data.markers[0].width, 1, 'the native-callout arm must keep the 1px anchor');
  assert.equal(native.data.markers[0].iconPath, '/images/markers/stack-anchor.png',
    'the native-callout arm must keep the legacy anchor art');
}));

// D8 — one projection after the gesture, never one per frame.
tests.push(() => test('D8 settling after a gesture projects exactly once', async () => {
  resetClock();
  const spec = loadPage();
  const p = makePage(spec, 4, 900, { mode: 'view-overlay' });
  const queries = [];
  const rect = { left: 0, top: 0, width: 375, height: 700 };
  const region = { southwest: { latitude: 48.0, longitude: 2.0 }, northeast: { latitude: 49.0, longitude: 3.0 } };
  p.mapCtx = {
    getRegion: opt => { queries.push(opt); },
    getScale: opt => opt.fail && opt.fail(),
  };
  p.createSelectorQuery = () => ({ select: () => ({ boundingClientRect: cb => ({ exec: () => cb(rect) }) }) });
  p.onMapRegionChange({ detail: { type: 'end' } });
  await runClock();
  assert.equal(queries.length, 1, 'a settle must issue exactly one getRegion, saw ' + queries.length);
  queries.shift().success(region);
  await runClock();
  assert.equal(p.data.stackPositionsReady, true, 'the overlay must come back after the settle');
  const anchor = projection.project(p.allMemories[0].coordinates, region, rect);
  const d = p.data.mapDrawers[0];
  assert.equal(d.screenX, anchor.x - 44, 'the overlay must be re-anchored on the new projection');
  assert.equal(d.screenY, anchor.y, 'the overlay must be re-anchored on the new projection');
}));

// D9 — restoring an open drawer must not replay the opening animation.
tests.push(() => test('D9 a drawer open before a gesture comes back open without replaying', async () => {
  resetClock();
  const spec = loadPage();
  const p = makePage(spec, 4, 900, { mode: 'view-overlay' });
  p.onDrawerToggle({ currentTarget: { dataset: { index: 0 } } });
  await runClock();
  assert.equal(p.data.mapDrawers[0].targetOpen, true, 'the drawer must start open');
  const openedHeight = p.data.mapDrawers[0].height;
  const before = p.writes.length;

  p.onMapRegionChange({ detail: { type: 'begin' } });
  await runClock();
  p.onMapRegionChange({ detail: { type: 'end' } });
  await runClock();

  const d = p.data.mapDrawers[0];
  assert.equal(d.targetOpen, true, 'the drawer must still be logically open after the gesture');
  assert.equal(d.height, openedHeight, 'the restored drawer must be at its open geometry');
  assert.ok(d.rows.every(r => r.opacity === 1), 'the restored drawer must be fully open, not mid-animation');
  assert.equal(frameWrites(p).length, 0, 'a restore must not start a frame loop');
  assert.equal(p.drawerResumeTarget, undefined, 'an overlay drawer must not queue a replay');
  assert.ok(p.writes.length - before <= 6, 'a gesture round-trip must stay O(1) writes, saw ' + (p.writes.length - before));
}));

// D10 — both orientations must reproduce the old implementation pixel for pixel.
tests.push(() => test('D10 overlay geometry matches the pre-overlay hit geometry', async () => {
  resetClock();
  const spec = loadPage();
  for (const [anchorY, down] of [[900, false], [300, true]]) {
    const p = makePage(spec, 4, anchorY, { mode: 'view-overlay' });
    p.onDrawerToggle({ currentTarget: { dataset: { index: 0 } } });
    await runClock();
    const d = p.data.mapDrawers[0];
    assert.equal(d.down, down, 'fixture must select the expected orientation');
    d.rows.forEach((row, i) => {
      assert.equal(d.overlayTop + row.overlayRowTop, legacyOverlayRowTopOf(d, row),
        'overlay row ' + i + ' must match the legacy hit geometry (down=' + down + ')');
    });
    assert.equal(d.overlayTop + d.overlayRootTop, d.screenY - d.height + d.rootTop,
      'overlay root must match the legacy hit geometry (down=' + down + ')');
    // The toggle WRAPPER is the touch box, so it must sit on the legacy hit position; the
    // VISUAL button is a child of it and is pinned to the callout pixel by D17. Asserting the
    // wrapper against the callout button instead would silently bless an inner-offset
    // double count, which is exactly how the 8px regression got in.
    assert.equal(d.overlayTop + d.overlayToggleTop, d.screenY - d.height + d.buttonBox.hitTop,
      'overlay toggle wrapper must match the legacy hit geometry (down=' + down + ')');
    assert.equal(d.overlayTop + d.overlayRootTop, calloutTopOf(d) + calloutRootTopOf(d),
      'overlay root must match the native callout root (down=' + down + ')');
  }
}));

// D11 — paging must stay aligned with the rows it pages, and keep targeting the open cluster.
tests.push(() => test('D11 paging stays aligned and pages the open cluster', async () => {
  resetClock();
  const spec = loadPage();
  const p = makePage(spec, 8, 900, { mode: 'view-overlay' });   // anchor + 7 others -> 3 pages
  const decoy = {
    memory: { id: 'decoy', restaurant: 'D', coordinates: [48.8, 2.3], photo: 'wxfile://tmp/d.jpg' },
    members: [{ id: 'decoy', restaurant: 'D', coordinates: [48.8, 2.3], photo: 'wxfile://tmp/d.jpg' },
      { id: 'decoy-b', restaurant: 'D', coordinates: [48.8, 2.31], photo: 'wxfile://tmp/db.jpg' }],
  };
  p.markerGroups = [decoy, p.markerGroups[0]];
  p.data.markers = [
    { memoryId: 'decoy', customCallout: { anchorY: 0 }, iconPath: '/images/markers/stack-anchor.png' },
    { memoryId: 'root', customCallout: { anchorY: 0 }, iconPath: '/images/markers/stack-anchor.png' },
  ];
  p.stackPositions = { decoy: { x: 120, y: 700 }, root: { x: 200, y: 900 } };
  p.refreshStackFrame();
  await runClock();
  p.onDrawerToggle({ currentTarget: { dataset: { index: 1 } } });
  await runClock();
  assert.equal(p.data.mapDrawers[1].targetOpen, true, 'the second cluster must be the open one');
  const stripTop = p.data.mapDrawers[1].overlayPageTop;
  assert.ok(Number.isFinite(stripTop), 'the overlay must place the paging strip itself, got ' + stripTop);
  const open = p.data.mapDrawers[1];
  assert.ok(stripTop >= 0 && stripTop + 30 <= open.overlayHeight,
    'the paging strip must stay inside the overlay frame, got ' + stripTop + ' of ' + open.overlayHeight);
  p.onDrawerPage({ currentTarget: { dataset: { step: '1' } } });
  await runClock();
  const after = p.data.mapDrawers.map(d => ({ id: d.rootId, page: d.page }));
  assert.equal(after[0].page, 0, 'the closed cluster must not be paged');
  assert.equal(after[1].page, 1, 'the open cluster must advance one page');
  assert.equal(p.data.mapDrawers[1].targetOpen, true, 'paging must not close the drawer');
  assert.equal(frameWrites(p).length, 0, 'paging on the overlay driver must not start a frame loop');
  const strips = p.data.mapDrawers.filter(d => d.stripOpen).map(d => d.rootId);
  assert.deepEqual(strips, ['root'], 'only the open cluster may mount a paging strip, saw ' + JSON.stringify(strips));
  // The visible strip and the tappable strip are the same rect.
  const w = fs.readFileSync(WXML, 'utf8');
  assert.ok(w.includes('catchtap="onDrawerPage"'), 'the paging arrow must own its own tap');
}));

// D12 — the overlay must own its ink with ordinary views, not cover-views.
tests.push(() => test('D12 the overlay ink is ordinary view/image, never cover-view', async () => {
  const w = fs.readFileSync(WXML, 'utf8');
  const overlay = w.slice(w.indexOf('class="map-stack-overlay"'));
  const end = overlay.indexOf('<!-- offline / error fallback');
  const block = end > 0 ? overlay.slice(0, end) : overlay;
  assert.ok(block.length > 0, 'the overlay block must exist');
  assert.equal(/cover-(view|image)/.test(block), false,
    'the ordinary overlay must not contain cover-view/cover-image');
  assert.ok(block.includes('<image'), 'the overlay must draw its photos with an ordinary image');
  assert.ok(block.includes('pin-stack-ink'), 'the overlay must switch to its visible form by mode');
  const wxss = fs.readFileSync(WXSS, 'utf8');
  assert.ok(wxss.includes('.pin-stack-ink'), 'the overlay ink styles must exist');
  assert.ok(wxss.includes('transition:transform 320ms cubic-bezier(.333333,0,.666667,1)'),
    'the overlay motion must reuse the 320ms mapStack curve');
  assert.ok(wxss.includes('.quiet .pin-stack-ink-motion'), 'reduceMotion must switch the overlay motion off');
}));

// D13 — moving the root's ink onto the native marker is only safe if the root can still
// RECEIVE a photo there. The callout arm deliberately refuses to paint an individual photo
// on a cluster anchor (it is invisible); the overlay arm must not inherit that refusal, or
// every cluster would show the generic fallback pin instead of its restaurant.
tests.push(() => test('D13 the native cluster root still receives its own photo', async () => {
  resetClock();
  const spec = loadPage();
  const p = makePage(spec, 4, 900, { mode: 'view-overlay' });
  // A cold renderer: nothing composed yet, so the marker must start on the bundled pin and
  // then be upgraded by the ordinary apply path once the composition resolves.
  let composed = null;
  p.pinRenderer = {
    peek: () => composed,
    render: () => new Promise(res => vsetTimeout(() => { composed = '/tmp/composed-root.png'; res(composed); }, 5)),
    dispose() {}, traceJobId: () => 0,
  };
  p.pendingLocations = [];
  p.applyFilters('', 'all', 'root', 'preserve');
  await pumpClock(0);                                   // the composition is still in flight
  assert.equal(p.data.markers[0].groupCount > 1, true, 'the fixture must still be a cluster');
  const before = p.data.markers[0].iconPath;
  assert.equal(before, '/images/markers/landmark-selected-fallback.png',
    'the first pass has no composition yet, so it must start on the bundled pin, got ' + before);
  await runClock();
  const after = p.data.markers[0].iconPath;
  console.log('    measured: cluster root iconPath ' + before + ' -> ' + after);
  assert.equal(after, '/tmp/composed-root.png',
    'the cluster root must show its own composed photo, got ' + after);
  // The callout arm must keep refusing: its anchor is invisible and the callout draws the root.
  resetClock();
  const native = makePage(loadPage(), 4, 900, { mode: 'native-callout', cssMotion: true });
  native.pinRenderer = {
    peek: () => '/tmp/composed-root.png',
    render: () => Promise.resolve('/tmp/composed-root.png'),
    dispose() {}, traceJobId: () => 0,
  };
  await buildMarkers(native);
  await buildMarkers(native);
  await runClock();
  assert.equal(native.data.markers[0].iconPath, '/images/markers/stack-anchor.png',
    'the callout arm must never paint an individual photo on its transparent anchor');
}));

// D14 — the container must never animate: only its children may carry the drawer clock.
tests.push(() => test('D14 the overlay container stays static while its children travel', async () => {
  resetClock();
  const spec = loadPage();
  const p = makePage(spec, 4, 900, { mode: 'view-overlay' });
  p.refreshStackFrame();
  await runClock();
  const closed = p.data.mapDrawers[0];
  p.onDrawerToggle({ currentTarget: { dataset: { index: 0 } } });
  await runClock();
  const open = p.data.mapDrawers[0];
  assert.equal(open.overlayTop, closed.overlayTop, 'the container top must not move with the drawer');
  assert.equal(open.overlayHeight, closed.overlayHeight, 'the container height must not move with the drawer');
  assert.equal(open.overlayRootTop, closed.overlayRootTop, 'the root must not move with the drawer');
  assert.equal(open.screenX, closed.screenX, 'the projected anchor must not move with the drawer');
  assert.equal(open.screenY, closed.screenY, 'the projected anchor must not move with the drawer');
  // What DOES differ is the closed-state travel the children carry.
  assert.notEqual(closed.toggleShiftY, 0, 'the toggle must carry a travel');
  assert.notEqual(open.toggleShiftY, 0, 'an open drawer keeps its travel so the reverse works');
  assert.equal(open.rows.every(r => r.shiftY !== 0), true, 'rows keep their travel too');
  // And the container position must be exactly the callout frame's, not the live frame's.
  assert.equal(open.overlayTop, open.screenY - open.frameHeight + open.calloutOffset,
    'the container must sit on the fixed native frame');
}));

// D15 — the button must be the ORIGINAL asset for all eight state combinations. The two
// callout branches disagree on purpose, so an overlay that reuses only the upward condition
// shows the wrong chevron in every downward drawer.
tests.push(() => test('D15 the toggle asset matches the original rule in all eight states', async () => {
  resetClock();
  const spec = loadPage();
  const seen = [];
  for (const [anchorY, down] of [[900, false], [300, true]]) {
    for (const open of [false, true]) {
      for (const dusk of [false, true]) {
        const p = makePage(spec, 4, anchorY, { mode: 'view-overlay' });
        p.data.dusk = dusk;
        if (open) p.onDrawerToggle({ currentTarget: { dataset: { index: 0 } } });
        else p.refreshStackFrame();
        await runClock();
        const d = p.data.mapDrawers[0];
        assert.equal(d.down, down, 'fixture orientation');
        assert.equal(d.targetOpen, open, 'fixture open state');
        const expected = originalToggleAsset(down, open, dusk);
        const actual = dusk ? d.toggleAssetDusk : d.toggleAsset;
        seen.push((down ? 'down' : 'up') + '/' + (open ? 'open' : 'closed') + '/' + (dusk ? 'dusk' : 'light') + ' -> ' + actual);
        assert.equal(actual, expected,
          'wrong toggle asset for down=' + down + ' open=' + open + ' dusk=' + dusk);
      }
    }
  }
  seen.forEach(s => console.log('    ' + s));
  const distinct = new Set(seen.map(s => s.split(' -> ')[1]));
  assert.equal(distinct.size, 4, 'all four assets must be reachable, saw ' + JSON.stringify([...distinct]));
}));

// D16 — the callout baseline itself must not drift: pin both original expressions verbatim,
// so the overlay can never be "made to match" by quietly editing the reference.
tests.push(() => test('D16 the callout still carries both original branch expressions', async () => {
  const w = fs.readFileSync(WXML, 'utf8');
  const up = "dusk ? (drawer.targetOpen ? '/images/markers/stack-button-down-dusk.png' : '/images/markers/stack-button-up-dusk.png') : (drawer.targetOpen ? '/images/markers/stack-button-down.png' : '/images/markers/stack-button-up.png')";
  const down = "dusk ? (!drawer.targetOpen ? '/images/markers/stack-button-down-dusk.png' : '/images/markers/stack-button-up-dusk.png') : (!drawer.targetOpen ? '/images/markers/stack-button-down.png' : '/images/markers/stack-button-up.png')";
  assert.ok(w.includes(up), 'the upward callout branch must keep its original asset expression');
  assert.ok(w.includes(down), 'the downward callout branch must keep its original asset expression');
  // And the overlay must read ONE shared value rather than re-deriving the rule inline.
  const overlay = w.slice(w.indexOf('class="map-stack-overlay"'));
  const block = overlay.slice(0, overlay.indexOf('<!-- offline'));
  assert.ok(block.includes("src=\"{{dusk ? drawer.toggleAssetDusk : drawer.toggleAsset}}\""),
    'the overlay toggle must read the shared asset field');
  assert.equal(/stack-button-(up|down)(-dusk)?\.png/.test(block), false,
    'the overlay must not re-derive the asset rule inline');
}));

// D17 — the composed button pixel, not just the wrapper. D10 compared the wrapper offset,
// which left an inner-offset double count invisible.
tests.push(() => test('D17 the overlay composes the toggle onto the callout pixel', async () => {
  resetClock();
  const spec = loadPage();
  for (const [anchorY, down] of [[900, false], [300, true]]) {
    const p = makePage(spec, 4, anchorY, { mode: 'view-overlay' });
    p.onDrawerToggle({ currentTarget: { dataset: { index: 0 } } });
    await runClock();
    const d = p.data.mapDrawers[0];
    assert.equal(d.down, down, 'fixture orientation');
    const expectedTop = calloutTopOf(d) + calloutToggleTopOf(d);
    console.log('    ' + (down ? 'down' : 'up') + ': composed top=' + composedOverlayToggleTop(d) + ' callout top=' + expectedTop);
    assert.equal(composedOverlayToggleTop(d), expectedTop,
      'the composed button top must equal the callout button top (down=' + down + ')');
    assert.equal(composedOverlayToggleLeft(d), d.screenX + d.buttonBox.left,
      'the composed button left must equal the callout button left (down=' + down + ')');
    assert.equal(d.buttonBox.size, 32, 'the button size must stay the original 32px');
  }
}));

// D18 — the ink button must be the bare asset: the PNG already contains the disc and the
// chevron, so any CSS background/border/radius/shadow behind it is a second button.
tests.push(() => test('D18 the overlay button draws no CSS circle behind the asset', async () => {
  const wxss = fs.readFileSync(WXSS, 'utf8');
  const rule = (wxss.match(/\.map-stack-overlay\s+\.pin-stack-ink\s+\.pin-stack-toggle\s*\{[^}]*\}/) || [''])[0];
  assert.ok(rule, 'the ink toggle must declare its own rule');
  console.log('    ink toggle rule: ' + rule.replace(/\s+/g, ' '));
  assert.equal(/background\s*:\s*(?!transparent)/.test(rule), false,
    'no background may be painted behind the ink button, saw ' + rule);
  assert.equal(/border-radius\s*:/.test(rule), false,
    'the ink button must not re-add a CSS circle radius');
  assert.equal(/box-shadow\s*:\s*(?!none)/.test(rule), false,
    'no visible shadow may be painted behind the ink button, saw ' + rule);
  assert.equal(/border\s*:\s*0/.test(rule), true,
    'the ink toggle must drop the 1px border, or the absolutely positioned asset is inset by 1px');
  // The asset must be an ordinary <image>, never a cover-image or an s-icon replacement.
  const w = fs.readFileSync(WXML, 'utf8');
  const overlay = w.slice(w.indexOf('class="map-stack-overlay"'));
  const block = overlay.slice(0, overlay.indexOf('<!-- offline'));
  assert.ok(block.includes('class="pin-stack-toggle-glyph"'), 'the overlay button must be an <image> glyph');
  assert.equal(/cover-image/.test(block), false, 'the overlay must never use cover-image');
  assert.equal(/<s-icon[^>]*chevron/.test(block), false, 'the overlay must not substitute an icon font chevron');
  // Pressed feedback and the untouched hit box must survive the visual restoration.
  assert.ok(block.includes("opacity:{{pressedStackRoot === drawer.rootId ? 0.85 : 1}}"),
    'the original pressed opacity must be preserved');
  assert.ok(block.includes('left:{{drawer.buttonBox.hitLeft}}px') && block.includes('width:{{drawer.buttonBox.hitWidth}}px'),
    'the hit box must keep using buttonBox.hitLeft/hitWidth');
  assert.ok(block.includes('height:{{drawer.buttonBox.hitHeight}}px'),
    'the hit box must keep using buttonBox.hitHeight');
}));

(async () => {
  let completed = false;
  process.on('beforeExit', () => { if (!completed) { console.error('map overlay drawer checks did not run to completion'); process.exitCode = 1; } });
  for (const run of tests) await run();
  completed = true;
  if (failures.length) {
    console.error('\n' + failures.length + ' FAILED, ' + count + ' passed:');
    for (const name of failures) console.error('  - ' + name);
    process.exitCode = 1;
    return;
  }
  console.log(count + '/' + count + ' map overlay drawer checks passed (synthetic; ordinary-view compositing is a device question).');
})().catch(error => { console.error(error); process.exitCode = 1; });
