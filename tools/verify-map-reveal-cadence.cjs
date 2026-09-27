'use strict';
// Drawer reveal cadence checks for pages/map/index.js.
//
// Loads the REAL page in a VM with a VIRTUAL CLOCK and a setData whose
// acknowledgement is delayed by a configurable number of milliseconds. The
// animation must be driven by elapsed wall time against ABSOLUTE frame
// deadlines: a slow acknowledgement may reduce the frame count but must never
// lengthen the animation or change its final geometry.
//
// Structural only. Real device FPS is NOT measured here.

const fs = require('fs');
const vm = require('vm');
const assert = require('node:assert/strict');
const stack = require('../miniprogram/utils/mapStack');

const FRAME_MS = 1000 / 60;
const DURATION = stack.DURATION;

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
    if (++guard > 20000) throw new Error('clock guard tripped');
  }
  await yieldToMicrotasks();
}
// Advance the clock one timer at a time until predicate holds.
async function pumpUntil(predicate, label, steps = 400) {
  for (let i = 0; i < steps; i++) {
    if (predicate()) return;
    await yieldToMicrotasks();
    clockStep();
  }
  throw new Error('timed out waiting for ' + label);
}
function resetClock() { vnow = 0; heap = []; timerSeq = 0; }

// ---- page harness ----------------------------------------------------------
const dependencies = {
  '../../utils/identity': { snapshot: () => ({ locked: false }) },
  '../../utils/i18n': { copy: () => ({}), locale: () => 'zh-CN', syncPage: () => {} },
  '../../utils/uiFeedback': {},
  '../../utils/store': { subscribe: () => () => {}, get: () => ({ memories: [], settings: {} }) },
  '../../utils/data': { formatDate: x => x },
  '../../utils/metrics': { getMetrics: () => ({ screenWidth: 375 }) },
  '../../utils/locations': { confirmed: () => true, choose: () => Promise.resolve(null) },
  '../../utils/mapMarkers': { style: () => ({ iconPath: 'fallback.png' }) },
  '../../utils/mapLayout': require('../miniprogram/utils/mapLayout'),
  '../../utils/mapStack': stack,
  '../../utils/mapProjection': require('../miniprogram/utils/mapProjection'),
  '../../utils/restaurantCategory': { summary: () => '' },
};
let spec = null;
vm.runInNewContext(fs.readFileSync('miniprogram/pages/map/index.js', 'utf8'), {
  Page: p => { spec = p; },
  require: id => { if (dependencies[id]) return dependencies[id]; throw new Error('unexpected require ' + id); },
  wx: {}, console, Promise, JSON, Math, Number, Boolean, Object, Array,
  setTimeout: vsetTimeout, clearTimeout: vclearTimeout,
  Date: { now: () => vnow },
}, { filename: 'miniprogram/pages/map/index.js' });

// One expand: a 7-member cluster -> 2 pages of 3 rows. Records every geometry frame
// and its time. markerGroups is supplied so refreshStackFrame() rebuilds the same
// drawer instead of clearing the list.
function expand(ack, target = 1) {
  resetClock();
  const p = Object.assign({}, spec, {
    data: JSON.parse(JSON.stringify(spec.data)),
    active: true, disposed: false,
    drawerRootId: 'root', drawerProgress: 0,
    frames: [], writes: [],
  });
  const members = ['root', 'a', 'b', 'c', 'd', 'e', 'f'].map(id => ({ id, restaurant: id }));
  p.markerGroups = [{ memory: members[0], members }];
  p.data.clusterOpen = target === 1;
  p.data.drawerPage = 0;
  p.data.mapDrawers = [{
    rootId: 'root', rows: [{ id: 'c' }, { id: 'b' }, { id: 'a' }], pages: 2,
    root: { id: 'root' }, open: true, down: false, buttonBox: {},
  }];
  p.setData = function (patch, done) {
    this.writes.push({ t: vnow, patch });
    const progress = patch['mapDrawers[0].progress'];
    if (progress !== undefined) this.frames.push({ t: vnow, progress });
    for (const [key, value] of Object.entries(patch)) {
      const keys = key.replace(/\[(\d+)\]/g, '.$1').split('.');
      let obj = this.data;
      keys.slice(0, -1).forEach(k => { obj = obj[k]; });
      obj[keys[keys.length - 1]] = value;
    }
    if (done) vsetTimeout(done, ack);
  };
  p.startDrawerReveal(target);
  return p;
}

function geometry(p) {
  const d = p.data.mapDrawers[0];
  return JSON.stringify({
    progress: d.progress, height: d.height, rootTop: d.rootTop,
    rows: (d.rows || []).map(r => [r.top, r.opacity]),
  });
}

async function measure(ack, target = 1) {
  const p = expand(ack, target);
  await runClock();
  const frames = p.frames;
  const intervals = [];
  for (let i = 1; i < frames.length; i++) intervals.push(frames[i].t - frames[i - 1].t);
  return {
    ack, p, frames, intervals,
    frameCount: frames.length,
    firstFrameAt: frames.length ? frames[0].t : null,
    lastFrameAt: frames.length ? frames[frames.length - 1].t : null,
    completion: p.writes.length ? p.writes[p.writes.length - 1].t : null,
    averageInterval: intervals.length ? intervals.reduce((a, b) => a + b, 0) / intervals.length : 0,
    geometry: geometry(p),
    finalProgress: p.data.mapDrawers[0].progress,
  };
}

let count = 0;
const failures = [];
// A hung await would drain the event loop and exit 0, looking green inside
// verify:all. Fail loudly instead.
let completed = false;
process.on('beforeExit', () => {
  if (!completed) { console.error('map reveal cadence checks did not run to completion'); process.exitCode = 1; }
});
async function test(name, fn) {
  try { await fn(); count++; console.log('PASS ' + name); }
  catch (error) { failures.push(name); console.error('FAIL ' + name + '\n  ' + String(error && error.message).split('\n')[0]); }
}

(async () => {
  const ACKS = [0, 4, 12, 20, 40];
  const results = {};
  for (const ack of ACKS) results[ack] = await measure(ack);

  // Report the raw cadence so the numbers are auditable, not just asserted.
  console.log('\nack | frames | first | last | completion | avg interval');
  for (const ack of ACKS) {
    const r = results[ack];
    console.log([ack, r.frameCount, r.firstFrameAt, r.lastFrameAt, r.completion, r.averageInterval.toFixed(1)].join(' | '));
  }
  console.log('');

  await test('the animation is driven by elapsed time, so no acknowledgement lengthens it', async () => {
    for (const ack of ACKS) {
      const r = results[ack];
      assert.ok(r.completion <= DURATION + ack + 1,
        'ack=' + ack + ': completion ' + r.completion + 'ms must not accumulate ack per frame (limit ' + (DURATION + ack + 1) + 'ms)');
    }
  });

  await test('frame count is limited by the acknowledgement, not by 16ms + acknowledgement', async () => {
    for (const ack of ACKS) {
      const r = results[ack];
      const expected = Math.floor(DURATION / Math.max(FRAME_MS, ack)) - 1;
      assert.ok(r.frameCount >= expected,
        'ack=' + ack + ': got ' + r.frameCount + ' frames, a cadence bounded by max(16.7, ack) gives at least ' + expected);
    }
  });

  await test('every acknowledgement still ends on exactly the target geometry', async () => {
    for (const ack of ACKS) {
      const r = results[ack];
      assert.equal(r.finalProgress, 1, 'ack=' + ack + ': final progress must be exactly 1');
      assert.equal(r.p.drawerAnimating, false, 'ack=' + ack + ': the animation must be marked finished');
    }
    const reference = results[0].geometry;
    for (const ack of ACKS) assert.equal(results[ack].geometry, reference,
      'ack=' + ack + ': final drawer geometry must be identical to the ack=0 result');
  });

  await test('closing reaches exactly progress 0 for every acknowledgement', async () => {
    const reference = (await measure(0, 0)).geometry;
    for (const ack of [4, 20, 40]) {
      const r = await measure(ack, 0);
      assert.equal(r.finalProgress, 0, 'ack=' + ack + ': a closing animation must reach 0');
      assert.equal(r.geometry, reference, 'ack=' + ack + ': closing geometry must match the ack=0 result');
    }
  });

  await test('a late acknowledgement may not revive a stopped animation', async () => {
    const p = expand(4);
    await pumpUntil(() => p.frames.length >= 1, 'the first frame');
    p.pauseDrawerReveal();
    const writes = p.writes.length;
    await runClock();
    assert.equal(p.writes.length, writes, 'no setData may happen after the animation is paused');
  });

  await test('hiding the page stops the reveal loop without further writes', async () => {
    const p = expand(4);
    await pumpUntil(() => p.frames.length >= 1, 'the first frame');
    p.active = false;
    p.disposed = true;
    const writes = p.writes.length;
    await runClock();
    assert.equal(p.writes.length, writes, 'a hidden page must not keep writing drawer geometry');
  });

  completed = true;
  if (failures.length) {
    console.error('\n' + failures.length + ' FAILED, ' + count + ' passed:');
    for (const name of failures) console.error('  - ' + name);
    process.exitCode = 1;
    return;
  }
  console.log(count + '/' + count + ' map reveal cadence checks passed (synthetic clock; no phone FPS claim).');
})().catch(error => { console.error(error); process.exitCode = 1; });
