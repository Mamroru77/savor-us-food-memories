'use strict';
// Scheduler checks for the disposable map marker renderer.
//
// Loads the REAL miniprogram/utils/mapMarkers.js in a VM with a synthetic canvas,
// cloud download, filesystem and a VIRTUAL CLOCK. Everything here is structural:
// it proves the scheduling shape, never real device milliseconds.
//
// Concurrency is measured from OUTSIDE the module, through the injected native
// layer (concurrent downloadMapPhoto / compressImage / canvasToTempFilePath calls).
// No test-only hooks exist in production code.

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('node:assert/strict');
const REPO = path.resolve(__dirname, '..');

// ---- virtual clock ---------------------------------------------------------
let vnow = 0, heap = [], timerSeq = 0;
function vsetTimeout(fn, ms) {
  const t = { due: vnow + (Number(ms) || 0), fn, id: ++timerSeq, cancelled: false };
  heap.push(t);
  return t;
}
function vclearTimeout(t) { if (t) t.cancelled = true; }
const yieldToMicrotasks = () => new Promise(r => setImmediate(r));
function clockStep() {
  heap = heap.filter(t => !t.cancelled);
  if (!heap.length) return false;
  heap.sort((a, b) => (a.due - b.due) || (a.id - b.id));
  const t = heap.shift();
  vnow = Math.max(vnow, t.due);
  t.fn();
  return true;
}
async function runClock() {
  let guard = 0;
  for (;;) {
    await yieldToMicrotasks();
    if (!clockStep()) break;
    if (++guard > 50000) throw new Error('clock guard tripped');
  }
  await yieldToMicrotasks();
}
// Advance the clock one timer at a time until predicate holds (for tests that must
// observe a state mid-flight, e.g. an export that is deliberately held open).
async function pumpUntil(predicate, label, steps = 500) {
  for (let i = 0; i < steps; i++) {
    if (predicate()) return;
    await yieldToMicrotasks();
    clockStep();
  }
  throw new Error('timed out waiting for ' + label);
}
function resetClock() { vnow = 0; heap = []; timerSeq = 0; }

// ---- synthetic native layer ------------------------------------------------
// The three stage limits the module is expected to honour, measured from outside.
const DOWNLOAD_CAP = 3;
const HEAVY_CAP = 1;
const COMPOSE_CAP = 1;
function harness(options) {
  const o = Object.assign({
    downloadMs: 10, decodeMs: 0, exportMs: 4, compressMs: 0, failFrameFirst: false,
    imageWidth: 0, imageHeight: 0, failCompress: false, noCompressApi: false,
  }, options);
  const events = [];
  const removed = [];
  const decodedSources = [];
  let inflightDownload = 0, maxDownload = 0;
  let inflightExport = 0, maxExport = 0;
  let inflightCompress = 0, maxCompress = 0;
  let compressCalls = 0;
  let frameFailuresLeft = o.failFrameFirst ? 1 : 0;
  let exportSeq = 0;
  const frameDecodes = { normal: 0, selected: 0 };
  let photoDecodes = 0;

  const wx = {
    getImageInfo(req) {
      vsetTimeout(() => req.success({ path: 'info:' + req.src, width: o.imageWidth, height: o.imageHeight }), o.decodeMs);
    },
    compressImage(req) {
      compressCalls++;
      inflightCompress++; if (inflightCompress > maxCompress) maxCompress = inflightCompress;
      events.push('compress-start:' + req.src);
      vsetTimeout(() => {
        events.push('compress-end:' + req.src);
        inflightCompress--;
        if (o.failCompress) req.fail({ errMsg: 'compressImage:fail' });
        else req.success({ tempFilePath: 'derived:' + req.compressedWidth + 'x' + req.compressedHeight + ':' + req.src });
      }, o.compressMs);
    },
    canvasToTempFilePath(opts) {
      const id = ++exportSeq;
      inflightExport++; if (inflightExport > maxExport) maxExport = inflightExport;
      events.push('export-start:' + id);
      vsetTimeout(() => {
        events.push('export-end:' + id);
        inflightExport--;
        opts.success({ tempFilePath: 'composite-' + id });
      }, o.exportMs);
    },
    getFileSystemManager: () => ({ unlinkSync: p => removed.push(p) }),
  };
  if (o.noCompressApi) delete wx.compressImage;

  const cloudRecords = {
    downloadMapPhoto(src) {
      inflightDownload++; if (inflightDownload > maxDownload) maxDownload = inflightDownload;
      events.push('download-start:' + src);
      return new Promise(resolve => vsetTimeout(() => {
        events.push('download-end:' + src);
        inflightDownload--;
        resolve('local:' + src);
      }, o.downloadMs));
    },
  };

  const ctx = {
    setTransform() {}, clearRect() {}, save() {}, clip() {}, restore() {},
    beginPath() {}, moveTo() {}, lineTo() {}, quadraticCurveTo() {}, closePath() {},
    drawImage(img) { events.push('draw:' + (img && img.__src)); },
  };
  const canvas = {
    getContext: () => ctx,
    createImage() {
      const img = { width: 200, height: 200 };
      Object.defineProperty(img, 'src', {
        set(v) {
          img.__src = v;
          const isFrame = /-frame\.png$/.test(v);
          if (isFrame) {
            const variant = /selected-frame\.png$/.test(v) ? 'selected' : 'normal';
            frameDecodes[variant]++;
            const fail = frameFailuresLeft > 0;
            if (fail) frameFailuresLeft--;
            vsetTimeout(() => { if (fail) img.onerror(); else img.onload(); }, o.decodeMs);
          } else {
            photoDecodes++;
            decodedSources.push(v);
            // A derivative reports its own (small) size, like a real decoded image.
            const m = /^derived:(\d+)x(\d+):/.exec(v);
            if (m) { img.width = Number(m[1]); img.height = Number(m[2]); }
            vsetTimeout(() => img.onload(), o.decodeMs);
          }
        },
      });
      return img;
    },
  };

  let current = { wx, cloudRecords, mapTrace: require(path.join(REPO, 'miniprogram', 'utils', 'mapTrace')) };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync('miniprogram/utils/mapMarkers.js', 'utf8'), {
    module, exports: module.exports,
    require(p) {
      if (p === './data') return { isSafeImage: () => true, isCloudImage: v => /^cloud:\/\//.test(String(v)) };
      if (p === './cloudRecords') return current.cloudRecords;
      if (p === './mapTrace') return current.mapTrace;
      if (p === './photoTrace') return require(path.join(REPO, 'miniprogram', 'utils', 'photoTrace'));
      throw new Error('unexpected require ' + p);
    },
    wx: current.wx, console, Promise, JSON, Math, Number, Boolean,
    setTimeout: vsetTimeout, clearTimeout: vclearTimeout,
  }, { filename: 'miniprogram/utils/mapMarkers.js' });

  return {
    api: module.exports, canvas, events, removed, decodedSources,
    get maxDownload() { return maxDownload; },
    get maxExport() { return maxExport; },
    get maxCompress() { return maxCompress; },
    get compressCalls() { return compressCalls; },
    get frameDecodes() { return frameDecodes; },
    get photoDecodes() { return photoDecodes; },
  };
}

const memory = (photo, extra) => Object.assign({ id: 'm:' + photo, photo, restaurant: 'R' }, extra);
const cloudMemories = (n, prefix) => Array.from({ length: n }, (_, i) => memory('cloud://env/photo-' + prefix + i + '.jpg'));
const downloadStarts = h => h.events.filter(e => e.startsWith('download-start:'));
const exportStarts = h => h.events.filter(e => e.startsWith('export-start:'));
const compressStarts = h => h.events.filter(e => e.startsWith('compress-start:'));
const srcOf = e => e.slice(e.indexOf(':') + 1);
// The native layer sees local/derived paths; strip back to the original source so
// assertions can name the marker the user actually owns.
const originOf = s => String(s).replace(/^derived:\d+x\d+:/, '').replace(/^local:/, '');
// The photo a compose painted, taken from the real draw call that precedes its export.
function composeOrder(h) {
  const out = [];
  for (let i = 0; i < h.events.length; i++) {
    if (!h.events[i].startsWith('export-start:')) continue;
    for (let j = i - 1; j >= 0; j--) {
      const e = h.events[j];
      if (e.startsWith('draw:') && !/-frame\.png$/.test(e)) { out.push(e.slice('draw:'.length)); break; }
    }
  }
  return out;
}
// Let pending microtask chains advance without advancing the clock.
async function until(predicate, label, turns = 60) {
  for (let i = 0; i < turns; i++) { if (predicate()) return; await yieldToMicrotasks(); }
  throw new Error('timed out waiting for ' + label);
}

let count = 0;
const failures = [];
// A hung await would drain the event loop and exit 0, looking green inside
// verify:all. Fail loudly instead.
let completed = false;
process.on('beforeExit', () => {
  if (!completed) { console.error('marker renderer scheduler checks did not run to completion'); process.exitCode = 1; }
});
async function run(name, fn) {
  try { await fn(); count++; console.log('PASS ' + name); }
  catch (error) { failures.push({ name, error }); console.error('FAIL ' + name + '\n  ' + String(error && error.message).split('\n')[0]); }
}
const test = (name, fn) => tests.push(() => run(name, fn));
const tests = [];

// ---- A2: bounded download concurrency --------------------------------------
tests.push(() => test('download stage runs at most 3 jobs at once and actually reaches 3', async () => {
  resetClock();
  const h = harness({ downloadMs: 30, decodeMs: 2, exportMs: 4 });
  const r = h.api.createRenderer(h.canvas);
  const jobs = cloudMemories(20, 'p').map(m => r.render(m, false));
  await runClock();
  assert.ok(h.maxDownload <= DOWNLOAD_CAP, 'concurrent downloads must never exceed 3, saw ' + h.maxDownload);
  assert.equal(h.maxDownload, DOWNLOAD_CAP, 'downloads must actually overlap 3 jobs, saw ' + h.maxDownload);
  await Promise.all(jobs);
}));

// ---- A3: compose stays strictly serial ------------------------------------
tests.push(() => test('compose/export never overlaps even when downloads finish out of order', async () => {
  resetClock();
  const h = harness({ downloadMs: 20, decodeMs: 0, exportMs: 6 });
  const r = h.api.createRenderer(h.canvas);
  const jobs = cloudMemories(12, 'c').map(m => r.render(m, false));
  await runClock();
  await Promise.all(jobs);
  assert.equal(h.maxExport, COMPOSE_CAP, 'only one compose/export may be in flight, saw ' + h.maxExport);
  for (let i = 0; i < h.events.length; i++) {
    if (!h.events[i].startsWith('export-start:')) continue;
    const end = h.events.findIndex((e, j) => j > i && e.startsWith('export-end:'));
    const between = h.events.slice(i + 1, end);
    assert.ok(!between.some(e => e.startsWith('draw:')),
      'a compose draw must never land inside another export: ' + between.join(' | '));
  }
  assert.equal(exportStarts(h).length, 12, 'every marker composes exactly once');
}));

// ---- A3: true selected-first among PENDING downloads ----------------------
tests.push(() => test('selected marker takes the next freed download slot instead of the next queued normal', async () => {
  resetClock();
  const h = harness({ downloadMs: 60, decodeMs: 0, exportMs: 2 });
  const r = h.api.createRenderer(h.canvas);
  const normals = cloudMemories(19, 'n');
  const jobs = normals.map(m => r.render(m, false));
  await yieldToMicrotasks();
  assert.equal(h.maxDownload, DOWNLOAD_CAP, 'the first 3 downloads should already be active');
  const selected = memory('cloud://env/selected.jpg');
  const selJob = r.render(selected, true);
  await yieldToMicrotasks();
  assert.equal(downloadStarts(h).length, DOWNLOAD_CAP, 'a full download stage must not start a 4th download');
  await runClock();
  await Promise.all(jobs.concat([selJob]));
  const order = downloadStarts(h).map(srcOf);
  assert.equal(order.length, 20, 'all 20 sources download exactly once');
  assert.equal(order[DOWNLOAD_CAP], selected.photo,
    'the 4th download slot must go to the selected marker, got ' + order[DOWNLOAD_CAP]);
  assert.equal(order.filter(s => s === selected.photo).length, 1, 'the selected source downloads exactly once');
  assert.equal(new Set(order).size, 20, 'no source is downloaded twice');
}));

// ---- A4: selected priority never starves normals --------------------------
tests.push(() => test('normals resume as soon as the selected queue drains', async () => {
  resetClock();
  const h = harness({ downloadMs: 20, decodeMs: 0, exportMs: 2 });
  const r = h.api.createRenderer(h.canvas);
  const normals = cloudMemories(8, 's');
  const jobs = normals.map(m => r.render(m, false));
  await yieldToMicrotasks();
  const selected = [memory('cloud://env/sel-a.jpg'), memory('cloud://env/sel-b.jpg')];
  const selJobs = selected.map(m => r.render(m, true));
  await runClock();
  await Promise.all(jobs.concat(selJobs));
  const order = downloadStarts(h).map(srcOf);
  assert.equal(order.length, 10, 'every source downloads exactly once');
  const selPositions = selected.map(m => order.indexOf(m.photo)).sort((a, b) => a - b);
  assert.deepEqual(selPositions, [3, 4], 'both selected jobs take the first two freed slots');
  assert.equal(order.filter(s => !selected.some(m => m.photo === s)).length, 8, 'no normal is starved');
}));

// ---- B5: selected priority reaches the HEAVY stage too ---------------------
tests.push(() => test('a selected marker also takes the next freed heavy slot, not the next queued normal', async () => {
  resetClock();
  const h = harness({ downloadMs: 2, decodeMs: 0, exportMs: 2, compressMs: 30, imageWidth: 4000, imageHeight: 3000 });
  const r = h.api.createRenderer(h.canvas);
  const normals = cloudMemories(19, 'hn');
  const jobs = normals.map(m => r.render(m, false));
  await pumpUntil(() => compressStarts(h).length >= 1, 'the first re-encode to start');
  const selected = memory('cloud://env/heavy-sel.jpg');
  const selJob = r.render(selected, true);
  await runClock();
  await Promise.all(jobs.concat([selJob]));
  const order = compressStarts(h).map(e => originOf(srcOf(e)));
  assert.equal(order.length, 20, 'every large source is re-encoded exactly once');
  assert.equal(order[HEAVY_CAP], selected.photo,
    'the 2nd heavy slot must go to the selected marker, got ' + order[HEAVY_CAP]);
  assert.equal(order.filter(s => s === selected.photo).length, 1, 'the selected source is re-encoded exactly once');
  const composed = composeOrder(h).map(originOf);
  assert.equal(composed.indexOf(selected.photo), HEAVY_CAP,
    'the selected marker also composes early, compose order = ' + JSON.stringify(composed));
}));

// ---- A5: single-flight, cache/ready semantics preserved -------------------
tests.push(() => test('three concurrent requests for one key download and compose exactly once', async () => {
  resetClock();
  const h = harness({ downloadMs: 15, decodeMs: 1, exportMs: 3 });
  const r = h.api.createRenderer(h.canvas);
  const m = memory('cloud://env/dup.jpg');
  const a = r.render(m, false), b = r.render(m, false), c = r.render(m, false);
  assert.equal(a, b, 'identical in-flight requests must share one promise');
  assert.equal(b, c, 'identical in-flight requests must share one promise');
  await runClock();
  const path = await a;
  assert.equal(path, 'composite-1');
  assert.equal(downloadStarts(h).length, 1, 'one download for one key');
  assert.equal(exportStarts(h).length, 1, 'one compose for one key');
  assert.equal(h.photoDecodes, 1, 'one photo decode for one key');
  assert.equal(r.peek(m, false), path);
  assert.equal(await r.render(m, false), path, 'a warm key resolves from cache');
  assert.equal(downloadStarts(h).length, 1, 'a warm key performs no new IO');
  assert.equal(exportStarts(h).length, 1, 'a warm key performs no new compose');
}));

// ---- B: frame image decoded once per variant ------------------------------
tests.push(() => test('normal frame decodes once and selected frame decodes once per renderer', async () => {
  resetClock();
  const h = harness({ downloadMs: 4, decodeMs: 0, exportMs: 1 });
  const r = h.api.createRenderer(h.canvas);
  const jobs = cloudMemories(10, 'fn').map(m => r.render(m, false))
    .concat(cloudMemories(5, 'fs').map(m => r.render(m, true)));
  await runClock();
  await Promise.all(jobs);
  assert.equal(h.frameDecodes.normal, 1, 'the normal frame must decode exactly once, saw ' + h.frameDecodes.normal);
  assert.equal(h.frameDecodes.selected, 1, 'the selected frame must decode exactly once, saw ' + h.frameDecodes.selected);
  assert.equal(exportStarts(h).length, 15, 'every marker still composes');
}));

// ---- B: a failed frame decode must not be cached forever ------------------
tests.push(() => test('a failed frame decode is retried by the next request', async () => {
  resetClock();
  const h = harness({ downloadMs: 4, decodeMs: 0, exportMs: 1, failFrameFirst: true });
  const r = h.api.createRenderer(h.canvas);
  const m = memory('cloud://env/retry-frame.jpg');
  const first = r.render(m, false);
  await runClock();
  assert.equal(await first, h.api.fallback(false), 'a failed frame decode yields the fallback');
  assert.equal(r.peek(m, false), undefined, 'a failed decode must not become permanently ready');
  assert.equal(h.frameDecodes.normal, 1);
  const second = r.render(m, false);
  await runClock();
  const path = await second;
  assert.notEqual(path, h.api.fallback(false), 'the retry must succeed');
  assert.equal(h.frameDecodes.normal, 2, 'the failed frame decode must be retried, not cached forever');
  assert.equal(r.peek(m, false), path);
}));

// ---- B1: a large original is never handed to the canvas decoder -----------
tests.push(() => test('a 4000x3000 original is decoded as a <=384px derivative, never at full size', async () => {
  resetClock();
  const h = harness({ downloadMs: 4, decodeMs: 0, exportMs: 1, imageWidth: 4000, imageHeight: 3000 });
  const r = h.api.createRenderer(h.canvas);
  const jobs = cloudMemories(6, 'big').map(m => r.render(m, false));
  await runClock();
  await Promise.all(jobs);
  assert.equal(h.decodedSources.length, 6, 'six photo decodes, saw ' + h.decodedSources.length);
  for (const src of h.decodedSources) {
    assert.ok(/^derived:/.test(src), 'the canvas must decode a derivative, got ' + src);
    const [, w, hh] = /^derived:(\d+)x(\d+):/.exec(src);
    assert.ok(Math.max(Number(w), Number(hh)) <= 384, 'derivative long edge must be <= 384, got ' + w + 'x' + hh);
  }
  assert.ok(h.decodedSources.every(s => s.startsWith('derived:384x288:')),
    '4000x3000 must become 384x288, got ' + h.decodedSources[0]);
  assert.equal(h.compressCalls, 6, 'each large original is re-encoded once');
  assert.equal(exportStarts(h).length, 6, 'every marker still composes');
}));

// ---- B: heavy stage concurrency -------------------------------------------
tests.push(() => test('re-encodes never overlap while downloads keep overlapping 3', async () => {
  resetClock();
  const h = harness({ downloadMs: 10, decodeMs: 1, exportMs: 2, compressMs: 20, imageWidth: 4000, imageHeight: 3000 });
  const r = h.api.createRenderer(h.canvas);
  const jobs = cloudMemories(20, 'h').map(m => r.render(m, false));
  await runClock();
  await Promise.all(jobs);
  assert.equal(h.maxDownload, DOWNLOAD_CAP, 'downloads still overlap 3, saw ' + h.maxDownload);
  assert.equal(h.maxCompress, HEAVY_CAP, 're-encodes must never overlap, saw ' + h.maxCompress);
  assert.equal(h.compressCalls, 20, 'every large original is re-encoded once');
  assert.equal(exportStarts(h).length, 20, 'every marker still composes');
}));

// ---- B: an already-small original is never re-encoded ---------------------
tests.push(() => test('an already-small original is decoded directly, with no re-encode', async () => {
  resetClock();
  const h = harness({ downloadMs: 4, decodeMs: 0, exportMs: 1, imageWidth: 300, imageHeight: 225 });
  const r = h.api.createRenderer(h.canvas);
  const jobs = cloudMemories(3, 'small').map(m => r.render(m, false));
  await runClock();
  await Promise.all(jobs);
  assert.equal(h.compressCalls, 0, 'a 300x225 source must not be re-encoded');
  assert.ok(h.decodedSources.every(s => s.startsWith('local:')), 'the original is decoded directly, got ' + h.decodedSources.join(','));
  assert.equal(exportStarts(h).length, 3);
}));

// ---- B2: a failed re-encode must not strand the marker --------------------
tests.push(() => test('a failed re-encode falls back to the original instead of stranding the marker', async () => {
  resetClock();
  const h = harness({ downloadMs: 4, decodeMs: 0, exportMs: 1, imageWidth: 4000, imageHeight: 3000, failCompress: true });
  const r = h.api.createRenderer(h.canvas);
  const m = memory('cloud://env/noderiv.jpg');
  const job = r.render(m, false);
  await runClock();
  const path = await job;
  assert.notEqual(path, h.api.fallback(false), 'the marker must still get a photo');
  assert.equal(r.peek(m, false), path, 'the fallback composite becomes ready');
  assert.ok(h.decodedSources.every(s => s.startsWith('local:')),
    'the original is decoded when no derivative exists, got ' + h.decodedSources.join(','));
}));

// ---- B2: a platform without the re-encode API still renders ---------------
tests.push(() => test('a platform without the re-encode API still renders from the original', async () => {
  resetClock();
  const h = harness({ downloadMs: 4, decodeMs: 0, exportMs: 1, imageWidth: 4000, imageHeight: 3000, noCompressApi: true });
  const r = h.api.createRenderer(h.canvas);
  const m = memory('cloud://env/noapi.jpg');
  const job = r.render(m, false);
  await runClock();
  const path = await job;
  assert.notEqual(path, h.api.fallback(false), 'the marker must still get a photo');
  assert.equal(h.compressCalls, 0, 'no re-encode API means no re-encode call');
  assert.ok(h.decodedSources.every(s => s.startsWith('local:')), 'the original is decoded');
}));

// ---- B3: the derivative is disposable scratch, never a source ------------
tests.push(() => test('dispose removes the derivative and the download, never a source path', async () => {
  resetClock();
  const h = harness({ downloadMs: 4, decodeMs: 0, exportMs: 1, imageWidth: 4000, imageHeight: 3000 });
  const r = h.api.createRenderer(h.canvas);
  const jobs = cloudMemories(2, 'scratch').map(m => r.render(m, false));
  await runClock();
  await Promise.all(jobs);
  r.dispose();
  assert.ok(h.removed.some(p => p.startsWith('derived:')), 'the derivative must be cleaned up, removed=' + JSON.stringify(h.removed));
  assert.ok(h.removed.some(p => p.startsWith('local:')), 'the download must be cleaned up');
  assert.ok(!h.removed.some(p => /^cloud:\/\//.test(p)), 'source identifiers are never deleted');
  assert.ok(!h.removed.some(p => p.startsWith('info:')), 'a resolved local source is never deleted');
}));

// ---- A6: dispose semantics -------------------------------------------------
tests.push(() => test('dispose stops pending work, blocks compose and cleans owned downloads', async () => {
  resetClock();
  const h = harness({ downloadMs: 50, decodeMs: 0, exportMs: 4 });
  const r = h.api.createRenderer(h.canvas);
  const jobs = cloudMemories(10, 'd').map(m => r.render(m, false));
  await yieldToMicrotasks();
  assert.equal(h.maxDownload, DOWNLOAD_CAP, 'three downloads are active when dispose lands');
  const exportsBefore = exportStarts(h).length;
  r.dispose();
  await runClock();                       // let the in-flight downloads finish and bail
  const settled = await Promise.all(jobs);
  assert.equal(settled.length, 10, 'every pending promise must settle');
  assert.ok(settled.every(p => p === h.api.fallback(false)), 'disposed work resolves to the fallback');
  assert.equal(exportStarts(h).length, exportsBefore, 'a disposed renderer must never compose again');
  assert.deepEqual(h.removed.slice().sort(), ['local:cloud://env/photo-d0.jpg', 'local:cloud://env/photo-d1.jpg', 'local:cloud://env/photo-d2.jpg'],
    'downloads owned by the disposed renderer must be cleaned');
}));

tests.push(() => test('dispose during an in-flight export discards and removes the late composite', async () => {
  resetClock();
  const h = harness({ downloadMs: 0, decodeMs: 0, exportMs: 40 });
  const r = h.api.createRenderer(h.canvas);
  const m = memory('cloud://env/late.jpg');
  const job = r.render(m, false);
  await pumpUntil(() => exportStarts(h).length === 1, 'the export to start');
  r.dispose();  await runClock();
  assert.equal(await job, h.api.fallback(false), 'a late composite is never published');
  assert.ok(h.removed.includes('composite-1'), 'the late composite is removed, removed=' + JSON.stringify(h.removed));
  assert.equal(r.peek(m, false), undefined);
}));

tests.push(() => test('repeated dispose is safe and never deletes source photos', async () => {
  resetClock();
  const h = harness({ downloadMs: 4, decodeMs: 0, exportMs: 1 });
  const r = h.api.createRenderer(h.canvas);
  const jobs = cloudMemories(3, 'k').map(m => r.render(m, false));
  await runClock();
  await Promise.all(jobs);
  r.dispose(); r.dispose();
  assert.deepEqual(h.removed.filter(p => p.startsWith('composite-')).sort(), ['composite-1', 'composite-2', 'composite-3'],
    'each owned composite is removed exactly once');
  assert.ok(!h.removed.some(p => /^cloud:\/\//.test(p)), 'source identifiers are never deleted');
}));

(async () => {
  let unhandled = 0;
  process.on('unhandledRejection', () => { unhandled++; });
  for (const t of tests) await t();
  await yieldToMicrotasks(); await yieldToMicrotasks();
  if (unhandled !== 0) failures.push({ name: 'no unhandled rejection', error: new Error('saw ' + unhandled) });
  completed = true;
  if (failures.length) {
    console.error('\n' + failures.length + ' FAILED, ' + count + ' passed:');
    for (const f of failures) console.error('  - ' + f.name);
    process.exitCode = 1;
    return;
  }
  console.log(count + '/' + count + ' marker renderer scheduler checks passed (synthetic; no device timing claim).');
})();
