'use strict';
// Drawer motion driver checks for pages/map/index.js.
//
// Loads the REAL page in a VM with a virtual clock and drives a real cluster toggle,
// then compares the two motion drivers:
//   JS  (drawerCssMotion=false) - startDrawerReveal writes a frame patch per ~16ms
//   CSS (drawerCssMotion=true)  - one state flip; a transform transition does the rest
//
// What this file can prove: how many JS->native writes each driver makes, and that the
// CSS driver's static layout plus its closed-state offset land on exactly the pixels the
// JS driver reaches. What it CANNOT prove: whether cover-view honours transform
// transitions on a real device. That is a device question, not a Node question.

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('node:assert/strict');

const REPO = path.resolve(__dirname, '..');
const PAGE = path.join(REPO, 'miniprogram', 'pages', 'map', 'index.js');
const WXML = path.join(REPO, 'miniprogram', 'pages', 'map', 'index.wxml');
const WXSS = path.join(REPO, 'miniprogram', 'pages', 'map', 'index.wxss');
const stack = require(path.join(REPO, 'miniprogram', 'utils', 'mapStack'));

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
      photoFor: m => m.photo || '', style: s => ({ iconPath: '/images/markers/landmark-' + (s ? 'selected' : 'normal') + '-fallback.png', width: s ? 80 : 48, height: s ? 89.375 : 53.625, anchor: { x: 0.5, y: 0.965 }, zIndex: s ? 9999 : 100 }),
      fallback: s => '/images/markers/landmark-' + (s ? 'selected' : 'normal') + '-fallback.png',
    },
    '../../utils/mapLayout': require(path.join(REPO, 'miniprogram', 'utils', 'mapLayout')),
    '../../utils/mapStack': stack,
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

// `anchorY` far down the screen -> drawer opens upward; near the top -> downward.
// This suite exercises the NATIVE CALLOUT renderer, so it pins that mode explicitly: the
// page's default is the overlay arm, and a suite that silently inherited it would stop
// measuring the driver it is named after.
function makePage(spec, count, anchorY, cssMotion) {
  const members = [];
  for (let i = 0; i < count; i++) members.push({ id: i === 0 ? 'root' : 'other-' + i, restaurant: 'R' + i, date: '2026-01-01', photo: 'wxfile://tmp/' + i + '.jpg' });
  const groups = [{ memory: members[0], members }];
  const p = Object.assign({}, spec, {
    data: JSON.parse(JSON.stringify(spec.data)),
    active: true, disposed: false,
    allMemories: members, markerGroups: groups,
    writes: [],
  });
  p.data.quiet = false;
  p.data.drawerRenderMode = 'native-callout';
  p.data.drawerCssMotion = cssMotion;
  p.data.clusterOpen = false;
  p.data.selectedId = 'root';
  p.data.markers = [{ memoryId: 'root', customCallout: { anchorY: 0 }, iconPath: '/images/markers/stack-anchor.png' }];
  p.stackPositions = { root: { x: 200, y: anchorY } };
  p.pinRenderer = { peek: () => '/tmp/composed.png', render: () => Promise.resolve('/tmp/composed.png'), dispose() {} };
  p.setData = function (patch, done) {
    this.writes.push({ t: vnow, keys: Object.keys(patch), bytes: JSON.stringify(patch).length });
    for (const [key, value] of Object.entries(patch)) assignPath(this.data, key, value);
    if (done) vsetTimeout(done, 0);
  };
  return p;
}

// A "frame write" is the drawer-geometry patch the JS loop emits ~20 times per open.
const frameWrites = p => p.writes.filter(w => w.keys.some(k => /^mapDrawers\[\d+\]\.(progress|height|rootTop|rows\[\d+\]\.(top|opacity))$/.test(k)));
const drawerWrites = p => p.writes.filter(w => w.keys.some(k => k === 'mapDrawers' || /^mapDrawers\[/.test(k)));

const tests = [];
let count = 0;
const failures = [];
async function test(name, fn) {
  try { await fn(); count++; console.log('PASS ' + name); }
  catch (error) { failures.push(name); console.error('FAIL ' + name + '\n  ' + String(error && error.message).split('\n')[0]); }
}

// D1 — the CSS driver must cost O(1) writes, not one per frame.
tests.push(() => test('a CSS-driven open costs one state write, not a frame loop', async () => {
  resetClock();
  const spec = loadPage();
  const p = makePage(spec, 4, 900, true);        // anchor low -> opens upward
  p.onDrawerToggle({ currentTarget: { dataset: { index: 0 } } });
  await runClock();
  const frames = frameWrites(p).length, total = drawerWrites(p).length;
  console.log('    measured: CSS open -> ' + total + ' drawer write(s), ' + frames + ' of them frame writes');
  assert.equal(frames, 0, 'the CSS driver must never emit a frame patch, saw ' + frames);
  assert.ok(total <= 3, 'a CSS open must cost O(1) drawer writes, saw ' + total);
  assert.equal(p.data.mapDrawers.length, 1);
  assert.equal(p.data.mapDrawers[0].targetOpen, true);
}));

// D1 (contrast) — the JS driver still costs a frame per ~16ms, which is the cost being removed.
tests.push(() => test('the JS driver still costs about twenty frame writes per open', async () => {
  resetClock();
  const spec = loadPage();
  const p = makePage(spec, 4, 900, false);
  p.onDrawerToggle({ currentTarget: { dataset: { index: 0 } } });
  await runClock();
  const frames = frameWrites(p).length;
  console.log('    measured: JS open -> ' + drawerWrites(p).length + ' drawer write(s), ' + frames + ' of them frame writes');
  assert.ok(frames >= 15, 'the JS driver should still show the per-frame cost, saw ' + frames);
  assert.ok(frames <= 30, 'the JS driver should not exceed one frame per 16ms, saw ' + frames);
}));

// D2 — both drivers must land on exactly the same open pixels.
tests.push(() => test('the CSS driver ends on the same open geometry as the JS driver', async () => {
  resetClock();
  const spec = loadPage();
  const css = makePage(spec, 4, 900, true);
  css.onDrawerToggle({ currentTarget: { dataset: { index: 0 } } });
  await runClock();
  const js = makePage(spec, 4, 900, false);
  js.onDrawerToggle({ currentTarget: { dataset: { index: 0 } } });
  await runClock();
  const a = css.data.mapDrawers[0], b = js.data.mapDrawers[0];
  assert.equal(a.height, b.height, 'open height must match');
  assert.equal(a.rootTop, b.rootTop, 'open rootTop must match');
  assert.equal(a.rows.length, b.rows.length, 'row count must match');
  a.rows.forEach((row, i) => {
    assert.equal(row.top, b.rows[i].top, 'open row ' + i + ' top must match');
    assert.equal(row.opacity, 1, 'an open row must be fully opaque');
  });
  assert.equal(a.toggleShiftY !== 0, true, 'the toggle must have a closed-state offset to travel');
}));

// D3 — the closed endpoint the CSS driver travels to must be the real collapsed layout.
// 4 members -> the anchor plus 3 drawer rows, which is the maximum a page can show.
//
// Rows are compared in RENDERED coordinates, because the two WXML branches place a row
// differently: the upward branch writes `top:frameHeight-height+pin.top` (a relative
// value) while the downward branch writes `top:pin.top-rootTop` (a mirrored absolute
// value, produced by mapStack.orient mutating the frame in place). Asserting on
// `row.top` directly would silently compare two different coordinate systems.
tests.push(() => test('the CSS closed offset lands the rows on the collapsed stack', async () => {
  resetClock();
  const spec = loadPage();
  for (const [anchorY, down] of [[900, false], [300, true]]) {
    const p = makePage(spec, 4, anchorY, true);
    p.onDrawerToggle({ currentTarget: { dataset: { index: 0 } } });
    await runClock();
    const d = p.data.mapDrawers[0];
    assert.equal(d.down, down, 'fixture must select the expected orientation');
    assert.equal(d.rows.length, 3, 'the fixture must produce three drawer rows');
    const f0 = stack.layout(3, 0), f1 = stack.layout(3, 1);   // raw, paging-free
    // The rendered top of a row, using the same expression as its WXML branch.
    const rendered = row => down ? row.top - d.rootTop : d.frameHeight - d.height + row.top;
    // Where the JS frame loop put the same row at progress p.
    const atProgress = (f, j) => down
      ? (2 * f.rootTop - f.slots[j].top) - f.rootTop
      : d.frameHeight - f.height + f.slots[j].top;
    d.rows.forEach((row, i) => {
      const j = 3 - 1 - i;                          // rows are painted in reverse order
      assert.equal(rendered(row), atProgress(f1, j),
        'open row ' + i + ' must land on the open layout (down=' + down + ')');
      assert.equal(rendered(row) + row.shiftY, atProgress(f0, j),
        'closed row ' + i + ' must land on the collapsed layout (down=' + down + ')');
      assert.equal(row.opacity, 1, 'an OPEN row must be fully opaque');
      assert.notEqual(row.shiftY, 0, 'an open drawer must still carry a closed-state offset');
    });
  }
}));

// D3b — a drawer that was never opened must already be in its invisible end state.
tests.push(() => test('a closed drawer renders its rows transparent with the offset applied', async () => {
  resetClock();
  const spec = loadPage();
  const p = makePage(spec, 4, 900, true);
  p.refreshStackFrame();                            // build the drawer without ever opening it
  await runClock();
  const d = p.data.mapDrawers[0];
  assert.equal(d.targetOpen, false, 'the drawer must be closed');
  assert.equal(d.rows.length, 3, 'rows stay mounted while closed so the transition has something to move');
  assert.ok(d.rows.every(r => r.opacity === 0), 'every closed row must be transparent');
  assert.ok(d.rows.every(r => r.shiftY !== 0), 'every closed row must carry its travel offset');
  assert.notEqual(d.toggleShiftY, 0, 'the closed toggle must carry its travel offset');
}));

// D4 — reduceMotion must not animate.
tests.push(() => test('reduceMotion disables the CSS transition and still reaches the end state', async () => {
  resetClock();
  const spec = loadPage();
  const p = makePage(spec, 3, 900, true);
  p.data.quiet = true;
  p.onDrawerToggle({ currentTarget: { dataset: { index: 0 } } });
  await runClock();
  const d = p.data.mapDrawers[0];
  assert.equal(d.targetOpen, true, 'the logical state must still flip');
  assert.equal(d.rows.every(r => r.opacity === 1), true, 'reduceMotion must jump straight to the open state');
  const wxss = fs.readFileSync(WXSS, 'utf8');
  assert.ok(wxss.includes('.quiet .native-stack-row-motion,.quiet .native-stack-toggle-motion { transition:none; }'),
    'reduceMotion must switch the transition off');
}));

// D5 — the transition must reproduce mapStack's own duration and curve, not a new one.
tests.push(() => test('the CSS transition reuses the 320ms mapStack curve', async () => {
  assert.equal(stack.DURATION, 320, 'mapStack.DURATION must stay 320ms');
  const wxss = fs.readFileSync(WXSS, 'utf8');
  assert.ok(wxss.includes('.native-stack-row-motion { transition:transform 320ms cubic-bezier(.333333,0,.666667,1),opacity 320ms cubic-bezier(.333333,0,.666667,1); }'),
    'the row transition must use 320ms and the existing cubic curve');
  assert.ok(wxss.includes('.native-stack-toggle-motion { transition:transform 320ms cubic-bezier(.333333,0,.666667,1); }'),
    'the toggle must travel on the same clock');
}));

// D6 — the markup must actually switch drivers, and the JS markup must survive intact.
tests.push(() => test('the markup switches driver and keeps the JS path reachable', async () => {
  const w = fs.readFileSync(WXML, 'utf8');
  assert.ok(w.includes("class=\"native-stack-row{{drawerCssMotion ? ' native-stack-row-motion' : ''}}\""), 'rows must opt into the transition only for the CSS driver');
  assert.ok(w.includes("class=\"native-stack-toggle{{drawerCssMotion ? ' native-stack-toggle-motion' : ''}}\""), 'the toggle must opt in too');
  assert.ok(w.includes("transform:translate3d(0,' + (drawer.targetOpen ? 0 : pin.shiftY) + 'px,0);"), 'rows must carry their own closed-state offset');
  assert.ok(w.includes("transform:translate3d(0,' + (drawer.targetOpen ? 0 : drawer.toggleShiftY) + 'px,0)"), 'the toggle must carry its own closed-state offset');
  // The JS driver still owns these positions; they must not have been replaced.
  assert.ok(w.includes('top:{{drawer.frameHeight-drawer.height+pin.top}}px'), 'the JS row position must remain');
  assert.ok(w.includes('top:{{pin.top-drawer.rootTop}}px'), 'the mirrored JS row position must remain');
}));

// D7 — the visible ink and the tappable rect must travel on the SAME transform.
// Under the native-callout renderer the ink is a cover-view while the hit region is an
// ordinary view, so nothing at runtime ties them together: the only guarantee available is
// that both read one shared offset variable out of the same data object.
// Under the overlay renderer they are the same element, which is strictly stronger.
tests.push(() => test('the overlay hit region travels with the visible drawer, not behind it', async () => {
  const w = fs.readFileSync(WXML, 'utf8');
  const toggleOffsets = (w.match(/drawer\.targetOpen \? 0 : drawer\.toggleShiftY/g) || []).length;
  const rowOffsets = (w.match(/drawer\.targetOpen \? 0 : pin\.shiftY/g) || []).length;
  assert.ok(toggleOffsets >= 3, 'visible toggle and hit region must share one offset, found ' + toggleOffsets);
  assert.ok(rowOffsets >= 3, 'visible row and hit region must share one offset, found ' + rowOffsets);
  assert.ok(w.includes("class=\"pin-stack-toggle{{drawer.transformDriver ? ' pin-stack-ink-toggle-motion' : ''}}\""),
    'the toggle must opt into the transition under a transform driver');
  assert.ok(w.includes("class=\"pin-stack-row{{drawer.transformDriver ? ' pin-stack-ink-motion' : ''}}\""),
    'the row must opt into the transition under a transform driver');
  assert.ok(w.includes("class=\"pin-stack{{drawer.overlayMode ? ' pin-stack-ink' : ''}}\""),
    'the overlay must switch to its visible form by mode');
  const wxss = fs.readFileSync(WXSS, 'utf8');
  assert.ok(wxss.includes('.pin-stack-ink-motion { transition:transform 320ms cubic-bezier(.333333,0,.666667,1),opacity 320ms cubic-bezier(.333333,0,.666667,1); }'),
    'the ink must move on the same 320ms curve as the callout driver');
  assert.ok(wxss.includes('.quiet .pin-stack-ink-motion,.quiet .pin-stack-ink-toggle-motion { transition:none; }'),
    'reduceMotion must switch the ink off as well');
  resetClock();
  const spec = loadPage();
  const p = makePage(spec, 4, 900, true);
  p.refreshStackFrame();
  await runClock();
  const d = p.data.mapDrawers[0];
  assert.notEqual(d.toggleShiftY, 0, 'a closed drawer must carry a real travel for the hit region to follow');
  assert.ok(d.rows.every(r => r.shiftY !== 0), 'every closed row must carry a real travel too');
}));

// D8 — a collapsed drawer must not leave invisible rows accepting taps.
tests.push(() => test('a collapsed drawer exposes no tappable row', async () => {
  const w = fs.readFileSync(WXML, 'utf8');
  assert.ok(w.includes("pointer-events:{{pin.opacity > 0.2 ? 'auto' : 'none'}}"),
    'row hit testing must follow the row\'s own opacity');
  resetClock();
  const spec = loadPage();
  const p = makePage(spec, 4, 900, true);
  p.refreshStackFrame();
  await runClock();
  const closed = p.data.mapDrawers[0];
  assert.ok(closed.rows.length === 3, 'rows stay mounted while closed');
  assert.ok(closed.rows.every(r => r.opacity <= 0.2),
    'every closed row must sit below the tap threshold, saw ' + JSON.stringify(closed.rows.map(r => r.opacity)));
  p.onDrawerToggle({ currentTarget: { dataset: { index: 0 } } });
  await runClock();
  const opened = p.data.mapDrawers[0];
  assert.ok(opened.rows.every(r => r.opacity > 0.2),
    'an open drawer must expose its rows to taps, saw ' + JSON.stringify(opened.rows.map(r => r.opacity)));
}));

// D9 — a reversal must settle, and must not leave the drawer between states.
tests.push(() => test('a rapid open/close/open settles in the open state with no stuck intermediate', async () => {
  resetClock();
  const spec = loadPage();
  const p = makePage(spec, 4, 900, true);
  const tap = () => p.onDrawerToggle({ currentTarget: { dataset: { index: 0 } } });
  tap(); await runClock();
  assert.equal(p.data.mapDrawers[0].targetOpen, true, 'the first tap must open it');
  tap(); await runClock();
  const closed = p.data.mapDrawers[0];
  assert.equal(closed.targetOpen, false, 'the second tap must close it');
  assert.ok(closed.rows.every(r => r.opacity === 0), 'the closed state must be fully transparent');
  assert.ok(closed.rows.every(r => r.shiftY !== 0), 'the closed state must still carry its travel offset');
  tap(); await runClock();
  const open = p.data.mapDrawers[0];
  assert.equal(open.targetOpen, true, 'the third tap must reopen it');
  assert.ok(open.rows.every(r => r.opacity === 1), 'the open state must be fully opaque');
  assert.equal(open.height, closed.height, 'reopening must land on the same geometry it started from');
  assert.equal(frameWrites(p).length, 0, 'the CSS driver must emit no frame patch even across a reversal');
  assert.ok(drawerWrites(p).length <= 12, 'three toggles must stay O(1) writes each, saw ' + drawerWrites(p).length);
}));

// D10 — paging must survive the CSS driver, and must page the drawer the user actually tapped.
// The CSS driver reports open=true for EVERY cluster, so a selector that trusts `open` would
// page whichever cluster happens to sit first in the array.
tests.push(() => test('paging targets the open cluster on the CSS driver, not the first one', async () => {
  resetClock();
  const spec = loadPage();
  const p = makePage(spec, 8, 900, true);   // anchor + 7 others -> 3 pages
  // A second, closed cluster placed FIRST in the array. `find(d => d.open)` would pick it.
  const decoy = { memory: { id: 'decoy', restaurant: 'D', photo: 'wxfile://tmp/d.jpg' },
    members: [{ id: 'decoy', restaurant: 'D', photo: 'wxfile://tmp/d.jpg' },
      { id: 'decoy-b', restaurant: 'D', photo: 'wxfile://tmp/db.jpg' }] };
  p.markerGroups = [decoy, p.markerGroups[0]];
  p.data.markers = [
    { memoryId: 'decoy', customCallout: { anchorY: 0 }, iconPath: '/images/markers/stack-anchor.png' },
    { memoryId: 'root', customCallout: { anchorY: 0 }, iconPath: '/images/markers/stack-anchor.png' },
  ];
  p.stackPositions = { decoy: { x: 120, y: 700 }, root: { x: 200, y: 900 } };
  p.refreshStackFrame();
  await runClock();
  p.onDrawerToggle({ currentTarget: { dataset: { index: 1 } } });   // open the SECOND cluster
  await runClock();
  const before = p.data.mapDrawers.map(d => ({ id: d.rootId, page: d.page, open: d.targetOpen }));
  assert.equal(before[1].open, true, 'the second cluster must be the open one');
  p.onDrawerPage({ currentTarget: { dataset: { step: '1' } } });
  await runClock();
  const after = p.data.mapDrawers.map(d => ({ id: d.rootId, page: d.page }));
  assert.equal(after[0].page, 0, 'the closed cluster must not be paged');
  assert.equal(after[1].page, 1, 'the open cluster must advance one page');
  assert.equal(p.data.mapDrawers[1].targetOpen, true, 'paging must not close the drawer');
  assert.equal(frameWrites(p).length, 0, 'paging on the CSS driver must not start a frame loop');
  // Only the open cluster may mount a paging strip.
  const strips = p.data.mapDrawers.filter(d => d.stripOpen).map(d => d.rootId);
  assert.deepEqual(strips, ['root'], 'only the open cluster may mount a paging strip, saw ' + JSON.stringify(strips));
}));

(async () => {
  let completed = false;
  process.on('beforeExit', () => { if (!completed) { console.error('map drawer motion checks did not run to completion'); process.exitCode = 1; } });
  for (const run of tests) await run();
  completed = true;
  if (failures.length) {
    console.error('\n' + failures.length + ' FAILED, ' + count + ' passed:');
    for (const name of failures) console.error('  - ' + name);
    process.exitCode = 1;
    return;
  }
  console.log(count + '/' + count + ' map drawer motion checks passed (synthetic; cover-view CSS support is a device question).');
})().catch(error => { console.error(error); process.exitCode = 1; });
