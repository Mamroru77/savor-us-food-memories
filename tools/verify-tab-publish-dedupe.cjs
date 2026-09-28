// TabBar publish dedupe: a publish whose visual payload repeats the previous one must not reach
// the children, and a publish whose payload differs must always go through.
//
// The real duplicate pair this exists for is showSelection (the target page's onShow) followed by
// updateAppearance (i18n.syncPage) — measured on a Home -> Map switch as three publishes carrying
// byte-identical icon commands. This suite pins the dedupe itself, not the device behaviour.
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert/strict');
const mp = path.join(__dirname, '../miniprogram');
let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('PASS ' + name); }
  catch (e) { failed++; console.error('FAIL ' + name + ': ' + e.message); }
}
const clone = x => JSON.parse(JSON.stringify(x));

function controller(routeIndex) {
  let spec; let route = routeIndex === undefined ? 0 : routeIndex;
  const calls = [], timers = [];
  const appearance = { dusk: false, quiet: false, labels: ['回忆', '地图', '记录', '我们', '我的'], addLabel: '记录' };
  vm.runInNewContext(fs.readFileSync(path.join(mp, 'custom-tab-bar/index.js'), 'utf8'), {
    Component: s => { spec = s; }, Date, Set, Number, Array, JSON, Object, Boolean, Math,
    getCurrentPages: () => route < 0 ? [] : [{ route: 'pages/' + ['home', 'map', 'add', 'us', 'me'][route] + '/index', _tabAppearance: appearance }],
    setTimeout(fn, ms) { timers.push({ fn, ms }); return timers.length; }, clearTimeout() {},
    wx: { switchTab(o) { calls.push(o); } },
  });
  function bar() {
    const b = Object.assign({}, spec.methods, {
      data: clone(spec.data), writes: [], dones: 0,
      setData(p, cb) { this.writes.push(p); Object.assign(this.data, p); if (cb) cb(); },
      selectAllComponents() { return []; },
    });
    spec.lifetimes.attached.call(b);
    // attached() runs seedTransition(), which publishes the first state. Count from there so a
    // test's expected count is about the publishes it drives, not the mount.
    b.mountWrites = b.writes.length;
    b.writes.length = 0;
    return b;
  }
  return { spec, bar, calls, timers, appearance, setRoute: n => { route = n; } };
}
// The full published state a page would send, so a publish is judged only by its visual payload.
const state = (o) => Object.assign({ dusk: false, quiet: false, labels: ['回忆', '地图', '记录', '我们', '我的'], addLabel: '记录', presentationReady: true }, o);

// ---- the pure key ------------------------------------------------------------
test('the visual key ignores revision and is stable for identical visuals', () => {
  const c = controller(0), b = c.bar();
  const icons = [{ revision: 1, key: 5, active: true, name: 'map', fromName: 'house', quiet: false, duration: 480, color: '#171a16' }];
  const other = [{ revision: 99, key: 5, active: true, name: 'map', fromName: 'house', quiet: false, duration: 480, color: '#171a16' }];
  assert.equal(b.visualPublishKey(state({ selected: 1 }), icons), b.visualPublishKey(state({ selected: 1 }), other));
  const changed = [{ revision: 1, key: 5, active: true, name: 'map-pinned', fromName: 'house', quiet: false, duration: 480, color: '#171a16' }];
  assert.notEqual(b.visualPublishKey(state({ selected: 1 }), icons), b.visualPublishKey(state({ selected: 1 }), changed));
});

// ---- P1 ---------------------------------------------------------------------
test('P1 two publishes with the same visual state collapse to one', () => {
  const c = controller(0), b = c.bar();
  b.publish(state({ selected: 1, transitionFrom: 0, entryKey: 11, entryActive: true }));
  const afterFirst = b.writes.length;
  b.publish(state({ selected: 1, transitionFrom: 0, entryKey: 11, entryActive: true }));
  assert.equal(afterFirst, 1);
  assert.equal(b.writes.length, 1, 'the second identical publish must not write');
  assert.equal(b.getPublishDiagnostics().skipped, 1);
});

test('P1b a skipped publish still runs its completion callback', () => {
  const c = controller(0), b = c.bar();
  b.publish(state({ selected: 1, transitionFrom: 0, entryKey: 11, entryActive: true }));
  let done = 0;
  b.publish(state({ selected: 1, transitionFrom: 0, entryKey: 11, entryActive: true }), () => { done++; });
  assert.equal(done, 1, 'callers awaiting the view commit must not hang on a skip');
});

// ---- P2 ---------------------------------------------------------------------
test('P2 a different visual state still publishes', () => {
  const c = controller(0), b = c.bar();
  b.publish(state({ selected: 1, transitionFrom: 0, entryKey: 11, entryActive: true }));
  b.publish(state({ selected: 2, transitionFrom: 1, entryKey: 12, entryActive: true }));
  assert.equal(b.writes.length, 2);
  assert.equal(b.getPublishDiagnostics().skipped, 0);
});

// ---- P3 ---------------------------------------------------------------------
test('P3 the same selected tab with a different active state is never skipped', () => {
  const c = controller(0), b = c.bar();
  b.publish(state({ selected: 1, transitionFrom: 0, entryKey: 11, entryActive: true }));
  b.publish(state({ selected: 1, transitionFrom: 1, entryKey: 0, entryActive: false }));   // parked
  assert.equal(b.writes.length, 2, 'active -> inactive must publish');
  assert.equal(b.getPublishDiagnostics().skipped, 0);
});

test('P3b the same selected tab with a different presentation is never skipped', () => {
  const c = controller(0), b = c.bar();
  b.publish(state({ selected: 1, transitionFrom: 0, entryKey: 11, entryActive: true }));
  b.publish(state({ selected: 1, transitionFrom: 2, entryKey: 12, entryActive: true }));   // different from/to pair
  assert.equal(b.writes.length, 2, 'a different morph pair must publish');
  assert.equal(b.getPublishDiagnostics().skipped, 0);
});

test('P3c a labels-only change is never skipped', () => {
  const c = controller(0), b = c.bar();
  b.publish(state({ selected: 1, transitionFrom: 0, entryKey: 11, entryActive: true }));
  b.publish(state({ selected: 1, transitionFrom: 0, entryKey: 11, entryActive: true, labels: ['Home', 'Map', 'Add', 'Us', 'Me'] }));
  assert.equal(b.writes.length, 2, 'the bar text is part of the visual state');
});

// ---- P4 ---------------------------------------------------------------------
test('P4 a reducedMotion change is never skipped', () => {
  const c = controller(0), b = c.bar();
  b.publish(state({ selected: 1, transitionFrom: 0, entryKey: 11, entryActive: true, quiet: false }));
  b.publish(state({ selected: 1, transitionFrom: 0, entryKey: 11, entryActive: true, quiet: true }));
  assert.equal(b.writes.length, 2, 'quiet changes what every child renders');
  assert.equal(b.getPublishDiagnostics().skipped, 0);
});

test('P4b a dusk change is never skipped', () => {
  const c = controller(0), b = c.bar();
  b.publish(state({ selected: 1, transitionFrom: 0, entryKey: 11, entryActive: true, dusk: false }));
  b.publish(state({ selected: 1, transitionFrom: 0, entryKey: 11, entryActive: true, dusk: true }));
  assert.equal(b.writes.length, 2);
});

test('P4c a presentationReady change is never skipped', () => {
  const c = controller(0), b = c.bar();
  b.publish(state({ selected: 1, transitionFrom: 0, entryKey: 11, entryActive: true, presentationReady: false }));
  b.publish(state({ selected: 1, transitionFrom: 0, entryKey: 11, entryActive: true, presentationReady: true }));
  assert.equal(b.writes.length, 2, 'mounting the bar is not a duplicate');
});

// ---- P5 ---------------------------------------------------------------------
test('P5 a skipped publish leaves every child presentation exactly as published', () => {
  const c = controller(0), b = c.bar();
  b.publish(state({ selected: 1, transitionFrom: 0, entryKey: 11, entryActive: true }));
  const published = clone(b.data.viewState.icons);
  const revision = b.data.viewState.revision;
  b.publish(state({ selected: 1, transitionFrom: 0, entryKey: 11, entryActive: true }));
  assert.deepEqual(clone(b.data.viewState.icons), published, 'the published viewState must not move');
  assert.equal(b.data.viewState.revision, revision, 'a skip must not burn a revision');
  // The declarative contract the children rely on: presentation === viewState.icons[index].
  b.data.viewState.icons.forEach((icon, i) => assert.deepEqual(clone(icon), published[i]));
  assert.equal(published.length, 5);
});

// ---- the real duplicate pair --------------------------------------------------
test('the real showSelection -> updateAppearance pair publishes once', () => {
  const c = controller(1);                 // already on Map, like the measured switch
  const b = c.bar();
  // A cached bar sits in the parked state before the transition arrives.
  b.publish(state({ selected: 1, transitionFrom: 1, entryKey: 0, entryActive: false }));
  const before = b.writes.length;
  b.showSelection(1, c.appearance);
  assert.equal(b.writes.length, before + 1, 'showSelection publishes the transition');
  b.updateAppearance(1, c.appearance);     // i18n.syncPage
  b.updateAppearance(1, c.appearance);     // a second store sync
  assert.equal(b.writes.length, before + 1, 'neither updateAppearance carries a new visual state');
  assert.equal(b.getPublishDiagnostics().skipped, 2);
});

test('a mount that already published the state does not re-publish for showSelection', () => {
  const c = controller(1);
  const b = c.bar();                       // attached() already published the mount state
  assert.equal(b.mountWrites, 1);
  b.showSelection(1, c.appearance);        // identical visual payload
  assert.equal(b.writes.length, 0, 'the mount state already owns these commands');
});

test('a genuine later transition is still published after skips', () => {
  const c = controller(1);
  const b = c.bar();
  b.publish(state({ selected: 1, transitionFrom: 1, entryKey: 0, entryActive: false }));
  b.showSelection(1, c.appearance);
  b.updateAppearance(1, c.appearance);
  c.setRoute(0);
  b.showSelection(0, c.appearance);        // Map -> Home
  assert.equal(b.writes.length, 3, 'the dedupe must not latch');
  assert.equal(b.data.viewState.icons[0].name, 'house-heart');
  assert.equal(b.data.viewState.icons[1].name, 'map');
});

console.log(passed + ' passed, ' + failed + ' failed; synthetic component harness, no device claim.');
if (failed) process.exitCode = 1;
