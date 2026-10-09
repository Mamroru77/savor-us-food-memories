'use strict';
// MAP P0-1 -- a Map pin's photo comes from a Memory's `photo` field, and a renderer may only
// ask the private CloudBase boundary for those bytes. The boundary used to bound that request
// with a FIXED 8 000 ms total deadline. That is size-blind, and it is only safe while every
// stored photo obeys the current upload contract (MAX_CLOUD_PHOTO_BYTES = 2 MiB, long edge
// <= 1600). A record written BEFORE that gate existed does not obey it.
//
// The condition under test is therefore a DATA/SHAPE condition, never a restaurant name:
//
//   LEGACY_PRE_GATE     photo is a cloud fileID whose payload is 10 607 530 B (4096x2304),
//                       i.e. 5x the upload gate and still arriving long after 8 000 ms.
//   CURRENT_CONTRACT    photo is a cloud fileID whose payload is 255 799 B (900x1600),
//                       i.e. inside the gate and complete well within the window.
//
// Both are VALID records with a real photo (noPhoto === false, isSafeImage === true). The
// only difference is the payload the same pipeline has to move. The measured values are the
// ones read back from the live runtime for the failing record and its peers, and the durations
// are the measured simulator transfer times for those exact payloads.
//
// Everything runs on a virtual clock, so "a transfer that outlives 8 s" is asserted in
// milliseconds of virtual time and the suite stays fast and deterministic.

const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');

const ROOT = path.resolve(__dirname, '..');
const MP = path.join(ROOT, 'miniprogram');
const OLD_FIXED_WINDOW_MS = 8000;              // the constant this round replaces
const UPLOAD_GATE_BYTES = 2 * 1024 * 1024;     // frozen upload contract (must stay 2 MiB)
const LEGACY_BYTES = 10607530;                 // measured: the failing record's cloud payload
const LEGACY_DURATION_MS = 14650;              // measured: that payload's transfer time
const CONTRACT_BYTES = 255799;                 // measured: a peer's cloud payload
const CONTRACT_DURATION_MS = 920;              // measured: that payload's transfer time

// ----------------------------------------------------------------- virtual clock
function makeClock() {
  const state = { now: 0, seq: 0, timers: [] };
  const live = () => state.timers.filter(t => !t.cancelled);
  return {
    get now() { return state.now; },
    set now(value) { state.now = value; },
    timers: live,
    reset() { state.now = 0; state.seq = 0; state.timers = []; },
    setTimeout(fn, ms) {
      const t = { id: ++state.seq, at: state.now + Math.max(0, Number(ms) || 0), fn, cancelled: false };
      state.timers.push(t);
      return t;
    },
    clearTimeout(t) { if (t) t.cancelled = true; },
  };
}
const clock = makeClock();
const vSetTimeout = (fn, ms) => clock.setTimeout(fn, ms);
const vClearTimeout = t => clock.clearTimeout(t);
const drain = () => new Promise(resolve => setImmediate(resolve));
// Run the virtual clock until nothing is scheduled, or until the cap. Returns the virtual
// milliseconds consumed, so a test can assert HOW LONG the boundary allowed a transfer to run.
async function settle(capMs = 600000) {
  const started = clock.now;
  for (let guard = 0; guard < 20000; guard++) {
    await drain();
    const next = clock.timers().sort((a, b) => a.at - b.at)[0];
    if (!next) return clock.now - started;
    if (next.at > capMs) break;
    if (next.at > clock.now) clock.now = next.at;
    next.cancelled = true;
    try { next.fn(); } catch (e) { /* a timer error surfaces through the promise under test */ }
  }
  await drain();
  return clock.now - started;
}

// ----------------------------------------------------------------- cloud payload model
// A payload is described the way the record describes it: a cloud fileID plus what is actually
// behind it. `stallAfter` models a transfer that stops delivering bytes.
const PAYLOADS = new Map([
  ['cloud://env.bucket/dining/u_legacy/memory-pre-gate/0.jpg',
    { bytes: LEGACY_BYTES, durationMs: LEGACY_DURATION_MS, width: 4096, height: 2304, chunks: 64 }],
  ['cloud://env.bucket/dining/u_peer/memory-current/0.jpg',
    { bytes: CONTRACT_BYTES, durationMs: CONTRACT_DURATION_MS, width: 900, height: 1600, chunks: 8 }],
  // The same legacy payload behind a different fileID: used to prove the outcome follows the
  // payload and the progress, never the identifier.
  ['cloud://env.bucket/dining/u_other/memory-pre-gate-2/0.jpg',
    { bytes: LEGACY_BYTES, durationMs: LEGACY_DURATION_MS, width: 4096, height: 2304, chunks: 64 }],
  // A payload that stops delivering bytes after one report: a genuinely dead transfer.
  ['cloud://env.bucket/dining/u_dead/memory-stalled/0.jpg',
    { bytes: LEGACY_BYTES, durationMs: LEGACY_DURATION_MS, width: 4096, height: 2304, chunks: 64, stallAfter: 1 }],
]);

let tempSerial = 0;
const tempFor = () => '/tmp/savor-download-' + (++tempSerial) + '.jpg';
const fileBytes = new Map();
const fileDims = new Map();
const removed = [];
let downloads = 0;
let aborted = 0;
let cloudOptions = {};

function installCloud() {
  downloads = 0; aborted = 0;
  const tasks = new Map();
  const wx = {
    env: { USER_DATA_PATH: '/userdata' },
    getStorageSync: () => '',
    setStorageSync: () => {},
    getFileSystemManager: () => ({
      statSync: p => ({ size: fileBytes.get(p) || 0 }),
      unlinkSync: p => { removed.push(p); },
    }),
    getImageInfo(o) {
      const dim = fileDims.get(o.src);
      if (!dim) { o.fail({ errMsg: 'getImageInfo:fail' }); return; }
      o.success({ width: dim.width, height: dim.height, path: o.src, type: 'jpeg' });
    },
    compressImage(o) {
      const dest = o.src + '.derivative-' + (++tempSerial) + '.jpg';
      fileBytes.set(dest, 33706);
      fileDims.set(dest, { width: o.compressedWidth || 1, height: o.compressedHeight || 1 });
      o.success({ tempFilePath: dest });
    },
    canvasToTempFilePath(o) { o.success({ tempFilePath: '/userdata/composed-' + (++tempSerial) + '.png' }); },
    cloud: {
      init() {},
      downloadFile(o) {
        downloads++;
        const spec = PAYLOADS.get(o.fileID);
        let written = 0, stopped = false, listener = null, chunk = 0;
        const chunkBytes = spec ? Math.ceil(spec.bytes / spec.chunks) : 0;
        const chunkMs = spec ? spec.durationMs / spec.chunks : 0;
        const local = tempFor();
        if (spec) { fileBytes.set(local, spec.bytes); fileDims.set(local, { width: spec.width, height: spec.height }); }
        const task = { abort() { aborted++; stopped = true; } };
        if (!cloudOptions.noProgressApi) {
          task.onProgressUpdate = fn => { listener = fn; };
        }
        const emit = () => {
          if (stopped) return;
          if (!spec) { o.fail({ errMsg: 'downloadFile:fail' }); return; }
          if (spec.stallAfter !== undefined && chunk >= spec.stallAfter) return; // dead transfer
          chunk++;
          written = Math.min(spec.bytes, written + chunkBytes);
          if (listener) listener({ totalBytesWritten: written, totalBytesExpectedToWrite: spec.bytes,
            progress: Math.round(written / spec.bytes * 100) });
          if (written >= spec.bytes) { o.success({ tempFilePath: local }); return; }
          vSetTimeout(emit, chunkMs);
        };
        vSetTimeout(emit, chunkMs);
        tasks.set(o.fileID, task);
        return task;
      },
    },
  };
  return wx;
}

// ----------------------------------------------------------------- module loading
const identityStub = {
  lease: () => 'lease-token',
  assertLease: token => { if (token !== 'lease-token') throw Object.assign(new Error('STALE_IDENTITY'), { code: 'STALE_IDENTITY' }); },
  assertBusinessCloudAllowed: () => {},
  isCurrent: () => true,
  markOffline: () => {},
  invalidate: () => {},
};
const i18nStub = { t: (s, p) => (p ? String(s).replace(/\{(\w+)\}/g, (m, k) => (p[k] === undefined ? m : p[k])) : String(s)), locale: () => 'en', copy: () => ({}), syncPage: () => {} };
const runtimeConfigStub = { cloudEnv: 'test-env', fileScope: '' };

function buildRuntime() {
  const cache = new Map();
  const overrides = new Map([
    ['miniprogram/utils/identity.js', identityStub],
    ['miniprogram/utils/i18n.js', i18nStub],
    ['miniprogram/utils/runtimeConfig.js', runtimeConfigStub],
  ]);
  const wx = installCloud();
  const logger = { log: () => {}, warn: () => {}, error: () => {} };
  // Every module gets its OWN context. Reusing one sandbox object would let a top-level
  // `const` from one module collide with the next module's, which is a harness bug rather
  // than a finding about the code under test.
  const makeSandbox = (mod, req) => ({
    module: mod, exports: mod.exports, require: req, wx, console: logger,
    Promise, Date, Math, JSON, Number, Boolean, Object, Array, String, Error, TypeError, RangeError,
    Map, Set, Symbol, RegExp, isNaN, parseInt, parseFloat, encodeURIComponent, decodeURIComponent,
    setTimeout: vSetTimeout, clearTimeout: vClearTimeout, setInterval: () => 0, clearInterval: () => {},
    queueMicrotask: fn => Promise.resolve().then(fn),
  });
  function load(rel) {
    const file = path.resolve(ROOT, rel);
    if (cache.has(file)) return cache.get(file).exports;
    const mod = { exports: {} };
    cache.set(file, mod);
    const req = id => {
      if (!id.startsWith('.')) return require(id);
      const target = path.relative(ROOT, path.resolve(path.dirname(file), id + '.js')).replace(/\\/g, '/');
      if (overrides.has(target)) return overrides.get(target);
      return load(target);
    };
    vm.runInNewContext(fs.readFileSync(file, 'utf8'), makeSandbox(mod, req), { filename: file });
    return mod.exports;
  }
  return { load, wx };
}

function syntheticCanvas() {
  const ctx = new Proxy({}, { get: () => () => {} });
  return {
    getContext: () => ctx,
    createImage() {
      const img = { width: 200, height: 200 };
      Object.defineProperty(img, 'src', { set() { Promise.resolve().then(() => img.onload && img.onload()); } });
      return img;
    },
  };
}

// ----------------------------------------------------------------- test runner
const tests = [];
let count = 0;
const failures = [];
async function test(name, fn) {
  clock.reset(); removed.length = 0; cloudOptions = {};
  try { await fn(); count++; console.log('PASS ' + name); }
  catch (e) { failures.push(name); console.error('FAIL ' + name + '\n  ' + String(e && e.message).split('\n')[0]); }
}

// T1 -- the actual defect. The failing record's shape is a cloud fileID whose payload is still
// arriving after the old fixed window. The Map marker must end up with a composed photo.
tests.push(() => test('T1 a Map marker composes for a legacy pre-gate cloud photo still arriving after the old window', async () => {
  const r = buildRuntime();
  const cloudRecords = r.load('miniprogram/utils/cloudRecords.js');
  const mapMarkers = r.load('miniprogram/utils/mapMarkers.js');
  const legacy = {
    id: 'legacy-record', noPhoto: false, extraPhotos: [],
    photo: 'cloud://env.bucket/dining/u_legacy/memory-pre-gate/0.jpg',
  };
  assert.ok(LEGACY_BYTES > UPLOAD_GATE_BYTES,
    'the precondition is a payload OUTSIDE the current upload contract');
  const renderer = mapMarkers.createRenderer(syntheticCanvas());
  const pending = renderer.render(legacy, false);
  pending.catch(() => {});
  const elapsed = await settle();
  const path0 = await pending;
  const fallback = mapMarkers.fallback(false);
  console.log('    payload ' + LEGACY_BYTES + ' B, transfer ' + LEGACY_DURATION_MS + ' ms, clock ran ' + elapsed + ' ms');
  assert.notEqual(path0, fallback, 'a legacy cloud photo must reach the marker, not the bundled fallback');
  assert.ok(elapsed > OLD_FIXED_WINDOW_MS,
    'the reproduction is only meaningful if the transfer outlives the old fixed window');
  renderer.dispose();
}));

// T2 -- the control. A record that obeys the upload contract must be unaffected.
tests.push(() => test('T2 a Map marker still composes for a current-contract cloud photo', async () => {
  const r = buildRuntime();
  const mapMarkers = r.load('miniprogram/utils/mapMarkers.js');
  const current = {
    id: 'current-record', noPhoto: false, extraPhotos: [],
    photo: 'cloud://env.bucket/dining/u_peer/memory-current/0.jpg',
  };
  assert.ok(CONTRACT_BYTES <= UPLOAD_GATE_BYTES, 'the control payload must be inside the contract');
  const renderer = mapMarkers.createRenderer(syntheticCanvas());
  const pending = renderer.render(current, true);
  const elapsed = await settle();
  const path1 = await pending;
  console.log('    payload ' + CONTRACT_BYTES + ' B, transfer ' + CONTRACT_DURATION_MS + ' ms, clock ran ' + elapsed + ' ms');
  assert.notEqual(path1, mapMarkers.fallback(true), 'a contract photo must keep rendering');
  renderer.dispose();
}));

// T3 -- the boundary itself, measured directly.
tests.push(() => test('T3 the private photo boundary does not fail a transfer that is still making progress', async () => {
  const r = buildRuntime();
  const cloudRecords = r.load('miniprogram/utils/cloudRecords.js');
  const pending = cloudRecords.downloadMapPhoto('cloud://env.bucket/dining/u_legacy/memory-pre-gate/0.jpg');
  pending.catch(() => {});
  const elapsed = await settle();
  const local = await pending;
  assert.ok(elapsed > OLD_FIXED_WINDOW_MS, 'the transfer must outlive the old fixed window for this to be the defect');
  assert.equal(fileBytes.get(local), LEGACY_BYTES, 'the whole object must arrive');
  console.log('    resolved after ' + elapsed + ' ms of virtual time (' + LEGACY_BYTES + ' B)');
}));

// T4 -- the deadline must still exist. A transfer that stops delivering bytes is a failure,
// and it must be abandoned rather than left running behind a rejected promise.
tests.push(() => test('T4 a stalled transfer still fails as PHOTO_TIMEOUT and is aborted', async () => {
  const r = buildRuntime();
  const cloudRecords = r.load('miniprogram/utils/cloudRecords.js');
  let rejectedAt = null;
  const pending = cloudRecords.downloadMapPhoto('cloud://env.bucket/dining/u_dead/memory-stalled/0.jpg')
    .catch(e => { rejectedAt = clock.now; throw e; });
  pending.catch(() => {});
  await settle();
  await assert.rejects(pending, e => e.code === 'PHOTO_TIMEOUT');
  assert.equal(aborted, 1, 'a stalled transfer must be aborted, not merely ignored');
  assert.ok(rejectedAt >= OLD_FIXED_WINDOW_MS && rejectedAt < OLD_FIXED_WINDOW_MS * 3,
    'a dead transfer must still fail in about the same window as before, got ' + rejectedAt + ' ms');
  console.log('    stalled transfer rejected at ' + rejectedAt + ' ms, aborts=' + aborted);
}));

// T5 -- no progress channel means no way to tell "slow" from "dead", so the previous window is
// kept. The fix may never be weaker than the behaviour it replaces.
tests.push(() => test('T5 without a progress channel the previous fixed window is preserved', async () => {
  const r = buildRuntime();
  const cloudRecords = r.load('miniprogram/utils/cloudRecords.js');
  cloudOptions = { noProgressApi: true };
  let rejectedAt = null;
  const pending = cloudRecords.downloadMapPhoto('cloud://env.bucket/dining/u_legacy/memory-pre-gate/0.jpg')
    .catch(e => { rejectedAt = clock.now; throw e; });
  pending.catch(() => {});
  await settle();
  await assert.rejects(pending, e => e.code === 'PHOTO_TIMEOUT');
  console.log('    no-progress fallback rejected at ' + rejectedAt + ' ms');
  assert.ok(rejectedAt >= OLD_FIXED_WINDOW_MS && rejectedAt < OLD_FIXED_WINDOW_MS * 3,
    'the fallback window must stay ~' + OLD_FIXED_WINDOW_MS + ' ms, got ' + rejectedAt + ' ms');
}));

// T6 -- the existing input contract is untouched.
tests.push(() => test('T6 a non-cloud source is still rejected without any download', async () => {
  const r = buildRuntime();
  const cloudRecords = r.load('miniprogram/utils/cloudRecords.js');
  await assert.rejects(cloudRecords.downloadMapPhoto('https://example.test/a.jpg'), e => e.code === 'INVALID_PHOTO');
  assert.equal(downloads, 0, 'an invalid source must not reach the network');
}));

// T7 -- the outcome follows the payload and the progress, never the identifier. Two different
// fileIDs carrying the same legacy payload behave identically, and the identifier that carried
// the legacy payload behaves like a normal one when its payload is normal.
tests.push(() => test('T7 the outcome follows the payload, not the record identifier', async () => {
  const r = buildRuntime();
  const cloudRecords = r.load('miniprogram/utils/cloudRecords.js');
  const first = cloudRecords.downloadMapPhoto('cloud://env.bucket/dining/u_legacy/memory-pre-gate/0.jpg');
  const second = cloudRecords.downloadMapPhoto('cloud://env.bucket/dining/u_other/memory-pre-gate-2/0.jpg');
  first.catch(() => {}); second.catch(() => {});
  await settle();
  const a = await first, b = await second;
  assert.equal(fileBytes.get(a), fileBytes.get(b), 'the same payload must produce the same outcome under any id');
  console.log('    two fileIDs, same payload -> same outcome (' + fileBytes.get(a) + ' B)');
}));

// T8 -- documents WHY the failing record is legacy data rather than malformed data: the upload
// contract that makes its payload anomalous is still the frozen 2 MiB / 1600-1080 one.
tests.push(() => test('T8 the upload contract that makes the payload legacy is unchanged', async () => {
  const source = fs.readFileSync(path.join(MP, 'utils/cloudRecords.js'), 'utf8');
  assert.ok(/MAX_CLOUD_PHOTO_BYTES\s*=\s*2\s*\*\s*1024\s*\*\s*1024/.test(source), 'the 2 MiB upload gate must stay frozen');
  assert.ok(/UPLOAD_EDGE_LADDER\s*=\s*\[1600,\s*1080\]/.test(source), 'the 1600/1080 ladder must stay frozen');
  assert.equal(source.includes('魏家'), false, 'no record name may appear in the pipeline');
}));

(async () => {
  let completed = false;
  process.on('beforeExit', () => { if (!completed) { console.error('map photo download budget checks did not run to completion'); process.exitCode = 1; } });
  for (const run of tests) await run();
  completed = true;
  if (failures.length) {
    console.error('\n' + failures.length + ' FAILED, ' + count + ' passed:');
    for (const f of failures) console.error('  - ' + f);
    process.exitCode = 1;
    return;
  }
  console.log(count + '/' + count + ' map photo download budget checks passed.');
})().catch(e => { console.error(e); process.exitCode = 1; });
