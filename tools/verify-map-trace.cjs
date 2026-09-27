'use strict';
// Dev-only Map trace checks.
//
// The trace exists so a real-device run can answer "was the photo too large?" versus
// "did it compose and then fail to bind?" without guessing. It must therefore be
// (a) completely inert when off and (b) structurally incapable of storing anything
// identifying. Both are asserted here against the REAL modules.
//
// What this file proves: the record shape, the privacy allowlist, the stage sequence
// and the apply-outcome vocabulary. What it cannot prove: anything about device timing.

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('node:assert/strict');

const REPO = path.resolve(__dirname, '..');
const MARKERS = path.join(REPO, 'miniprogram', 'utils', 'mapMarkers.js');
const PAGE = path.join(REPO, 'miniprogram', 'pages', 'map', 'index.js');
const TRACE = require(path.join(REPO, 'miniprogram', 'utils', 'mapTrace'));

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
    if (++guard > 50000) throw new Error('clock guard tripped');
  }
  await yieldToMicrotasks();
}
function resetClock() { vnow = 0; heap = []; timerSeq = 0; }

// ---- renderer harness ------------------------------------------------------
const HOSTILE_CLOUD = 'cloud://prod-env.6f00-abc/secret-owner-1234/real-photo.jpg';
const HOSTILE_LOCAL = 'wxfile://tmp/1234567890-openid-oXyZabcdefghij.jpg';

function makeWx({ width, height, compress = true, derivative = true }) {
  const stat = new Map();
  stat.set(HOSTILE_LOCAL, 5_242_880);                     // the downloaded original
  stat.set('derived:' + HOSTILE_LOCAL, 41_000);           // the disposable derivative
  return {
    getImageInfo({ src, success }) {
      vsetTimeout(() => success({ path: src, width, height }), 2);
    },
    ...(compress ? {
      compressImage({ src, compressedWidth, compressedHeight, success, fail }) {
        if (!derivative) { vsetTimeout(() => fail({}), 2); return; }
        vsetTimeout(() => success({ tempFilePath: 'derived:' + src }), 3);
      },
    } : {}),
    canvasToTempFilePath({ success }) {
      vsetTimeout(() => success({ tempFilePath: 'out-' + (++makeWx.seq) + '.png' }), 4);
    },
    getFileSystemManager: () => ({
      unlinkSync() {},
      statSync(p) { if (!stat.has(p)) throw new Error('ENOENT'); return { size: stat.get(p) }; },
    }),
  };
}
makeWx.seq = 0;

function loadRenderer(options) {
  const wx = makeWx(options);
  // The trace reads the ambient `wx` for the storage switch and for file sizes, so it is
  // evaluated inside the SAME context as the renderer - exactly one instance per runtime,
  // as in the miniprogram. Loading it on the host instead would silently disable
  // fileBytes(), which is the kind of false green this suite exists to prevent.
  const traceModule = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(REPO, 'miniprogram', 'utils', 'mapTrace.js'), 'utf8'),
    { module: traceModule, exports: traceModule.exports, require() { throw new Error('mapTrace has no dependencies'); }, wx, console },
    { filename: 'miniprogram/utils/mapTrace.js' });
  const trace = traceModule.exports;

  const module = { exports: {} };
  const cloudRecords = {
    downloadMapPhoto() {
      return new Promise(resolve => vsetTimeout(() => resolve(HOSTILE_LOCAL), 5));
    },
  };
  const ctx = { setTransform() {}, clearRect() {}, save() {}, clip() {}, restore() {},
    beginPath() {}, moveTo() {}, lineTo() {}, quadraticCurveTo() {}, closePath() {}, drawImage() {} };
  const canvas = {
    getContext: () => ctx,
    createImage() {
      const img = { width: 1024, height: 768 };
      Object.defineProperty(img, 'src', {
        set(v) {
          const m = /^derived:(\d+)x(\d+):/.exec(v);
          if (m) { img.width = Number(m[1]); img.height = Number(m[2]); }
          vsetTimeout(() => img.onload(), 1);
        },
      });
      return img;
    },
  };
  vm.runInNewContext(fs.readFileSync(MARKERS, 'utf8'), {
    module, exports: module.exports,
    require(id) {
      if (id === './data') return { isSafeImage: () => true, isCloudImage: v => /^cloud:\/\//.test(String(v)) };
      if (id === './cloudRecords') return cloudRecords;
      if (id === './mapTrace') return trace;
      throw new Error('unexpected require ' + id);
    },
    wx, console, Promise, JSON, Math, Number, Boolean, Object, Array, RegExp,
    // The renderer reads Date.now() for its dev-only stage timings. Binding it to the
    // virtual clock keeps those numbers exact instead of wall-clock noise.
    Date: { now: () => vnow },
    setTimeout: vsetTimeout, clearTimeout: vclearTimeout,
  }, { filename: MARKERS });
  return { api: module.exports, canvas, trace };
}

// ---- page harness (classification only) ------------------------------------
const PAGE_DEPS = {
  '../../utils/identity': { snapshot: () => ({ locked: false }) },
  '../../utils/i18n': { copy: () => ({}), locale: () => 'zh-CN', syncPage: () => {}, t: x => x },
  '../../utils/uiFeedback': {},
  '../../utils/store': { subscribe: () => () => {}, get: () => ({ memories: [], settings: {} }) },
  '../../utils/data': { formatDate: x => x, photos: { meal: '' } },
  '../../utils/metrics': { getMetrics: () => ({ screenWidth: 375, headerTop: 54 }) },
  '../../utils/locations': { confirmed: () => true, choose: () => Promise.resolve(null) },
  '../../utils/mapLayout': require(path.join(REPO, 'miniprogram', 'utils', 'mapLayout')),
  '../../utils/mapStack': require(path.join(REPO, 'miniprogram', 'utils', 'mapStack')),
  '../../utils/mapProjection': require(path.join(REPO, 'miniprogram', 'utils', 'mapProjection')),
  '../../utils/restaurantCategory': { summary: () => '' },
  '../../utils/cloudRecords': {},
  '../../utils/mapMarkers': Object.assign({}, require(path.join(REPO, 'miniprogram', 'utils', 'mapMarkers'))),
};
function loadPage() {
  let spec = null;
  vm.runInNewContext(fs.readFileSync(PAGE, 'utf8'), {
    Page: p => { spec = p; },
    require: id => { if (PAGE_DEPS[id]) return PAGE_DEPS[id]; throw new Error('unexpected require ' + id); },
    wx: {}, console, Promise, JSON, Math, Number, Boolean, Object, Array, RegExp, Map, Set,
    setTimeout: vsetTimeout, clearTimeout: vclearTimeout, Date: { now: () => vnow },
  }, { filename: PAGE });
  return spec;
}
function page(spec, memories) {
  const p = Object.assign({}, spec, {
    data: Object.assign({}, JSON.parse(JSON.stringify(spec.data)), { markers: [], selectedId: '' }),
    active: true, disposed: false, stackGesture: false, markerGeneration: 1,
    markerGroups: memories.map(m => ({ memory: m, members: [m] })),
    writes: [],
    setData(patch, done) { Object.assign(this.data, patch); this.writes.push(patch); if (done) done(); },
  });
  p.data.markers = memories.map(m => ({ memoryId: m.id, stampSelected: false, iconPath: 'fallback.png' }));
  return p;
}
const memory = id => ({ id, photo: HOSTILE_CLOUD, restaurant: 'R' });

// ---- runner ----------------------------------------------------------------
const tests = [];
let count = 0;
const failures = [];
async function run(name, fn) {
  try { await fn(); count++; console.log('PASS ' + name); }
  catch (error) { failures.push({ name, error }); console.error('FAIL ' + name + '\n  ' + String(error && error.message).split('\n')[0]); }
}
const test = (name, fn) => tests.push(() => run(name, fn));

// ---- Part 1: the module itself ---------------------------------------------
test('tracing is off until a developer switches it on', () => {
  TRACE.clear(); TRACE.setEnabled(false);
  assert.equal(TRACE.on(), false, 'default state must be off');
  assert.equal(TRACE.newJob(true), 0, 'a disabled trace allocates no job id');
  TRACE.record(0, { applyResult: 'applied' });
  assert.deepEqual(TRACE.snapshot(), [], 'a disabled trace stores nothing');
  const empty = TRACE.summary();
  assert.equal(empty.jobs, 0);
  assert.deepEqual(empty.byResult, {});
  assert.deepEqual(empty.byStage, {});
  assert.equal(empty.limit, TRACE.LIMIT);
  // The timing aggregates must exist and be zeroed, not merely absent.
  TRACE.TIMINGS.forEach(field => {
    assert.equal(empty.timingSum[field], 0, field + ' must aggregate to zero');
    assert.equal(empty.timingMax[field], 0, field + ' must max to zero');
    assert.equal(empty.timingCount[field], 0, field + ' must count zero samples');
  });
});

test('every stage timing is an allowlisted numeric field', () => {
  TRACE.clear(); TRACE.setEnabled(true);
  const jobId = TRACE.newJob(false);
  const stages = { downloadMs: 40, downsampleMs: 12, decodeMs: 10, composeMs: 6, exportMs: 18, totalMs: 74 };
  TRACE.record(jobId, stages);
  const [entry] = TRACE.snapshot();
  TRACE.TIMINGS.forEach(field => {
    assert.ok(TRACE.FIELDS.indexOf(field) >= 0, field + ' must be a declared field');
    assert.ok(TRACE.NUMERIC.indexOf(field) >= 0, field + ' must be stored as a number');
    assert.equal(entry[field], stages[field], field + ' must survive a record');
  });
  // A hostile value in a timing slot must not become a string.
  TRACE.record(jobId, { downloadMs: HOSTILE_LOCAL });
  assert.equal(TRACE.snapshot()[0].downloadMs, 0, 'a non-numeric timing degrades to 0');
  // The summary aggregates them, so a device snapshot reads at a glance.
  const summary = TRACE.summary();
  assert.equal(summary.timingSum.decodeMs, 10);
  assert.equal(summary.timingMax.exportMs, 18);
  assert.equal(summary.timingCount.totalMs, 1);
});

test('the ready-cache rebound has its own apply result token', () => {
  TRACE.clear(); TRACE.setEnabled(true);
  TRACE.record(TRACE.newJob(true), { applyResult: 'ready-cache-rebound' });
  assert.equal(TRACE.snapshot()[0].applyResult, 'ready-cache-rebound',
    'a rebound from the ready cache must not collapse to "other"');
  assert.ok(TRACE.ALLOWED.applyResult.indexOf('ready-cache-rebound') >= 0);
});

test('a record may only carry allowlisted fields and enum tokens', () => {
  TRACE.clear(); TRACE.setEnabled(true);
  const jobId = TRACE.newJob(true);
  TRACE.record(jobId, {
    sourceKind: 'cloud', stage: 'download', applyResult: 'applied',
    originalWidth: 4000, originalHeight: 3000, originalBytes: 5_242_880,
    derivativeWidth: 384, derivativeHeight: 288, derivativeBytes: 41_000,
    // Everything below must be rejected or replaced.
    photo: HOSTILE_CLOUD, path: HOSTILE_LOCAL, restaurant: '用户 Café',
    openid: 'oXyZabcdefghij', fileID: HOSTILE_CLOUD, anythingElse: 'x',
  });
  const [entry] = TRACE.snapshot();
  assert.deepEqual(Object.keys(entry).sort(), ['applyResult', 'derivativeBytes', 'derivativeHeight',
    'derivativeWidth', 'jobId', 'originalBytes', 'originalHeight', 'originalWidth',
    'selected', 'sourceKind', 'stage'].sort(), 'only declared fields may be stored');
  assert.equal(entry.selected, true);
  assert.equal(entry.originalWidth, 4000);
  assert.equal(entry.derivativeWidth, 384);
  assert.equal(entry.derivativeBytes, 41_000);
});

test('a hostile source, path, restaurant or openid never reaches a snapshot', () => {
  TRACE.clear(); TRACE.setEnabled(true);
  const jobId = TRACE.newJob(false);
  TRACE.record(jobId, {
    sourceKind: HOSTILE_CLOUD, stage: HOSTILE_LOCAL, applyResult: 'oXyZabcdefghij',
    reason: '用户 Café',
  });
  const text = JSON.stringify(TRACE.snapshot()) + JSON.stringify(TRACE.summary());
  ['cloud://', 'wxfile://', 'secret-owner', 'openid', 'oXyZabcdefghij', '用户', 'real-photo']
    .forEach(needle => assert.equal(text.indexOf(needle), -1, 'a snapshot must never contain ' + needle));
  const [entry] = TRACE.snapshot();
  assert.equal(entry.sourceKind, 'other', 'an unknown source kind is not stored verbatim');
  assert.equal(entry.stage, 'other');
  assert.equal(entry.applyResult, 'other');
  assert.equal(entry.reason, 'other');
});

test('numbers are clamped to finite non-negative integers', () => {
  TRACE.clear(); TRACE.setEnabled(true);
  const jobId = TRACE.newJob(false);
  TRACE.record(jobId, { originalWidth: -5, originalHeight: NaN, originalBytes: Infinity, derivativeWidth: 3.7 });
  const [entry] = TRACE.snapshot();
  assert.equal(entry.originalWidth, 0);
  assert.equal(entry.originalHeight, 0);
  assert.equal(entry.originalBytes, 0);
  assert.equal(entry.derivativeWidth, 4);
});

test('the record buffer is bounded', () => {
  TRACE.clear(); TRACE.setEnabled(true);
  for (let i = 0; i < TRACE.LIMIT + 25; i++) TRACE.newJob(false);
  assert.equal(TRACE.snapshot().length, TRACE.LIMIT, 'the buffer must not grow without bound');
  assert.ok(TRACE.snapshot()[TRACE.LIMIT - 1].jobId > TRACE.snapshot()[0].jobId, 'the oldest records are dropped');
});

test('source kinds are classified without storing the source', () => {
  assert.equal(TRACE.sourceKindOf('/images/markers/landmark-normal-frame.png'), 'bundled');
  assert.equal(TRACE.sourceKindOf(HOSTILE_CLOUD), 'cloud');
  assert.equal(TRACE.sourceKindOf(HOSTILE_LOCAL), 'local');
  assert.equal(TRACE.sourceKindOf(''), 'local');
});

// ---- Part 2: renderer stages -----------------------------------------------
test('a large cloud photo reports its original and derivative sizes, stage by stage', async () => {
  resetClock();
  const h = loadRenderer({ width: 4000, height: 3000 });
  h.trace.clear(); h.trace.setEnabled(true);
  const renderer = h.api.createRenderer(h.canvas);
  const job = renderer.render(memory('A'), false);
  await runClock();
  const path = await job;
  assert.notEqual(path, h.api.fallback(false), 'the photo must compose');

  const [entry] = h.trace.snapshot();
  assert.equal(entry.sourceKind, 'cloud', 'a cloud source is labelled, not recorded');
  assert.equal(entry.originalWidth, 4000);
  assert.equal(entry.originalHeight, 3000);
  assert.equal(entry.originalBytes, 5_242_880, 'the size of the original the decoder used to receive');
  assert.equal(entry.derivativeWidth, 384, 'the derivative is bounded by SOURCE_LONG_EDGE');
  assert.equal(entry.derivativeHeight, 288);
  assert.equal(entry.derivativeBytes, 41_000);
  assert.equal(entry.stage, 'export', 'the last stage reached is the export');
  assert.equal(entry.selected, false);
  // The per-stage timings a device run is read for. Injected costs: download 5,
  // getImageInfo 2 + compressImage 3, photo decode 1 + frame decode 1, export 4.
  assert.equal(entry.downloadMs, 5, 'downloadMs must cover the network stage');
  assert.equal(entry.downsampleMs, 5, 'downsampleMs must cover the size probe and re-encode');
  assert.equal(entry.decodeMs, 2, 'decodeMs must cover the photo and frame decodes');
  assert.equal(entry.composeMs, 0, 'the synchronous draws cost no virtual time');
  assert.equal(entry.exportMs, 4, 'exportMs must cover canvasToTempFilePath');
  assert.equal(entry.totalMs, 16, 'totalMs must span enqueue to export');
  const text = JSON.stringify(h.trace.snapshot());
  assert.equal(text.indexOf('cloud://'), -1, 'the cloud id is never stored');
  assert.equal(text.indexOf('wxfile://'), -1, 'the local path is never stored');
});

test('an already small original is not reported as downsampled', async () => {
  resetClock();
  const h = loadRenderer({ width: 300, height: 200 });
  h.trace.clear(); h.trace.setEnabled(true);
  const renderer = h.api.createRenderer(h.canvas);
  const job = renderer.render(memory('S'), false);
  await runClock();
  await job;
  const [entry] = h.trace.snapshot();
  assert.equal(entry.originalWidth, 300);
  assert.equal(entry.derivativeWidth, undefined, 'no derivative is claimed when none was made');
  assert.equal(entry.stage, 'export');
});

test('a failed derivative is reported by reason and still composes', async () => {
  resetClock();
  const h = loadRenderer({ width: 4000, height: 3000, derivative: false });
  h.trace.clear(); h.trace.setEnabled(true);
  const renderer = h.api.createRenderer(h.canvas);
  const job = renderer.render(memory('F'), false);
  await runClock();
  assert.notEqual(await job, h.api.fallback(false), 'a missing derivative must not strand the marker');
  const [entry] = h.trace.snapshot();
  assert.equal(entry.reason, 'derivative-failed');
  assert.equal(entry.derivativeWidth, undefined);
});

test('with tracing off the renderer records nothing at all', async () => {
  resetClock();
  const h = loadRenderer({ width: 4000, height: 3000 });
  h.trace.setEnabled(false);
  const renderer = h.api.createRenderer(h.canvas);
  const job = renderer.render(memory('O'), false);
  await runClock();
  await job;
  // Length rather than deepEqual: the snapshot comes from another VM realm, so its
  // Array.prototype differs from the host's and assert/strict compares prototypes.
  assert.equal(h.trace.snapshot().length, 0, 'an off trace is inert');
});

// ---- Part 3: page apply classification -------------------------------------
test('a stale-generation result that still matches the current marker is rebound, not dropped', () => {
  TRACE.clear(); TRACE.setEnabled(true);
  const spec = loadPage();
  const m = memory('A');
  const p = page(spec, [m]);
  const jobId = TRACE.newJob(false);
  // The marker is unchanged; only the generation moved on.
  p.markerGeneration = 7;
  assert.equal(p.markerPhotoSkipReason('A', m.photo, false), '', 'the current marker still matches');
  p.applyMarkerPhotos([{ memoryId: 'A', path: 'ready-A.png', selected: false, jobId, stale: true }]);
  assert.equal(TRACE.snapshot()[0].applyResult, 'stale-but-rebound');
});

test('a fresh result is reported as applied', () => {
  TRACE.clear(); TRACE.setEnabled(true);
  const spec = loadPage();
  const m = memory('A');
  const p = page(spec, [m]);
  const jobId = TRACE.newJob(false);
  p.applyMarkerPhotos([{ memoryId: 'A', path: 'ready-A.png', selected: false, jobId, stale: false }]);
  assert.equal(TRACE.snapshot()[0].applyResult, 'applied');
  assert.equal(p.data.markers[0].iconPath, 'ready-A.png');
});

test('the skip vocabulary distinguishes clustered, replaced and superseded', () => {
  TRACE.clear(); TRACE.setEnabled(true);
  const spec = loadPage();
  const m = memory('A');
  const p = page(spec, [m]);
  assert.equal(p.markerPhotoSkipReason('A', m.photo, false), '', 'a matching singleton is bindable');
  // Now clustered. The verdict is renderer-specific, so pin BOTH: under the native callout
  // the anchor is invisible and an individual photo must never be painted on it; under the
  // ordinary overlay the same marker IS the cluster's visible root, and binding is exactly
  // what has to happen or every cluster would show the generic pin.
  p.markerGroups = [{ memory: m, members: [m, memory('B')] }];
  p.data.drawerRenderMode = 'native-callout';
  assert.equal(p.markerPhotoSkipReason('A', m.photo, false), 'clustered');
  p.data.drawerRenderMode = 'view-overlay';
  assert.equal(p.markerPhotoSkipReason('A', m.photo, false), '', 'an overlay cluster root must be bindable');
  p.data.drawerRenderMode = 'native-callout';
  // Singleton again, but the photo was replaced while the job was in flight.
  p.markerGroups = [{ memory: m, members: [m] }];
  assert.equal(p.markerPhotoSkipReason('A', 'wxfile://tmp/other.jpg', false), 'source-changed');
  // The selected variant changed under the job.
  p.data.markers[0].stampSelected = true;
  assert.equal(p.markerPhotoSkipReason('A', m.photo, false), 'superseded');
  // The memory left the viewport entirely.
  assert.equal(p.markerPhotoSkipReason('ZZ', m.photo, false), 'superseded');
});

test('a queued photo whose variant changed is superseded rather than mis-bound', () => {
  TRACE.clear(); TRACE.setEnabled(true);
  const spec = loadPage();
  const m = memory('A');
  const p = page(spec, [m]);
  const jobId = TRACE.newJob(false);
  p.data.markers[0].stampSelected = true;          // selection changed inside the batch window
  p.applyMarkerPhotos([{ memoryId: 'A', path: 'ready-A.png', selected: false, jobId, stale: false }]);
  assert.equal(TRACE.snapshot()[0].applyResult, 'superseded');
  assert.equal(p.data.markers[0].iconPath, 'fallback.png', 'the wrong stamp must not be bound');
});

test('a page that is disposed or gesturing reports why the photo was deferred', async () => {
  TRACE.clear(); TRACE.setEnabled(true); resetClock();
  const spec = loadPage();
  const m = memory('A');
  const p = page(spec, [m]);
  let settle = null;
  p.pinRenderer = {
    peek: () => undefined,
    render: () => { const j = new Promise(r => { settle = r; }); j.traceJobId = TRACE.newJob(false); return j; },
  };
  p.renderMarkerPhotos([m], '', 1);
  p.stackGesture = true;
  settle('ready-A.png');
  await yieldToMicrotasks(); await yieldToMicrotasks();
  assert.equal(TRACE.snapshot()[0].applyResult, 'gesture-deferred');

  TRACE.clear();
  let settle2 = null;
  p.stackGesture = false;
  p.pinRenderer = {
    peek: () => undefined,
    render: () => { const j = new Promise(r => { settle2 = r; }); j.traceJobId = TRACE.newJob(false); return j; },
  };
  p.renderMarkerPhotos([m], '', 1);
  p.disposed = true;
  settle2('ready-A.png');
  await yieldToMicrotasks(); await yieldToMicrotasks();
  assert.equal(TRACE.snapshot()[0].applyResult, 'disposed');
});

(async () => {
  let completed = false;
  process.on('beforeExit', () => {
    if (!completed) { console.error('map trace checks did not run to completion'); process.exitCode = 1; }
  });
  for (const t of tests) await t();
  TRACE.setEnabled(false);
  completed = true;
  if (failures.length) {
    console.error('\n' + failures.length + ' FAILED, ' + count + ' passed:');
    for (const f of failures) console.error('  - ' + f.name);
    process.exitCode = 1;
    return;
  }
  console.log(count + '/' + count + ' map trace checks passed (synthetic; no device claim).');
})().catch(error => { console.error(error); process.exitCode = 1; });
