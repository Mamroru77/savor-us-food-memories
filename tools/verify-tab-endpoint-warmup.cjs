// TabBar Phase 1C: endpoint warmup + the visual/semantic selection split.
//
// W1  the warm plan's URIs are exactly the URIs the morph endpoint asks for
// W2  the same endpoint across several TabBars is warmed once
// W3  a warmed endpoint is marked ready (so the native decode already happened)
// W4  a warm failure is recorded and never blocks the morph path
// W5  clicking before warmup finishes behaves exactly as before
// W6  a tap does not move the visual selection
// W7  the morph-start report moves the visual selection
// W8  semantic and visual selection agree once the morph has started
// W9  a superseded / never-starting transition cannot latch the visual selection
// W10 reducedMotion moves it immediately
// W11 the Phase 1A dedupe still skips a repeated visual publish
// W12 the visual selection never leads the morph start
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert/strict');
const mp = path.join(__dirname, '../miniprogram');
let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('PASS ' + name); }
  catch (e) { failed++; console.error('FAIL ' + name + ': ' + e.message); }
}
const clone = x => JSON.parse(JSON.stringify(x));

function barController(routeIndex) {
  let spec; let route = routeIndex === undefined ? 0 : routeIndex;
  const timers = [];
  const appearance = { dusk: false, quiet: false, labels: ['回忆', '地图', '记录', '我们', '我的'], addLabel: '记录' };
  vm.runInNewContext(fs.readFileSync(path.join(mp, 'custom-tab-bar/index.js'), 'utf8'), {
    Component: s => { spec = s; }, Date, Set, Number, Array, JSON, Object, Boolean, Math,
    getCurrentPages: () => route < 0 ? [] : [{ route: 'pages/' + ['home', 'map', 'add', 'us', 'me'][route] + '/index', _tabAppearance: appearance }],
    setTimeout(fn, ms) { const t = { fn, ms, id: timers.length + 1 }; timers.push(t); return t.id; },
    clearTimeout(id) { const t = timers.find(x => x.id === id); if (t) t.cancelled = true; },
    wx: { switchTab() {} },
  });
  function bar() {
    const b = Object.assign({}, spec.methods, {
      data: clone(spec.data), writes: [], iconReports: [],
      setData(p, cb) {
        this.writes.push(clone(p));
        // Match native setData path semantics: 'viewState.visualSelected' must land nested.
        for (const [key, value] of Object.entries(p)) {
          const keys = key.replace(/\[(\d+)\]/g, '.$1').split('.');
          let target = this.data;
          for (let i = 0; i < keys.length - 1; i++) { if (target[keys[i]] === undefined) target[keys[i]] = /^\d+$/.test(keys[i + 1]) ? [] : {}; target = target[keys[i]]; }
          target[keys[keys.length - 1]] = value;
        }
        if (cb) cb();
      },
      selectAllComponents() { return []; },
    });
    spec.lifetimes.attached.call(b);
    b.writes.length = 0;
    return b;
  }
  return { spec, bar, timers, appearance, setRoute: n => { route = n; } };
}
const state = o => Object.assign({ dusk: false, quiet: false, labels: ['回忆', '地图', '记录', '我们', '我的'], addLabel: '记录', presentationReady: true }, o);

// ---- the child, with the same property set the harness uses --------------------
function iconController() {
  let spec; const saved = global.Component; global.Component = s => { spec = s; };
  const file = path.join(mp, 'components/morph-icon/index.js');
  delete require.cache[require.resolve(file)]; require(file); global.Component = saved;
  function icon(props) {
    const c = Object.assign({}, spec.methods, {
      data: Object.assign({}, Object.fromEntries(Object.entries(spec.properties).map(([k, v]) => [k, v.value])), clone(spec.data), Object.assign({ renderer: 'svg' }, props || {})),
      writes: [], _alive: true,
      setData(p, cb) { this.writes.push(clone(p)); Object.assign(this.data, p); if (cb) cb(); },
      triggerEvent() {}, recordRender() {},
    });
    return c;
  }
  return { spec, icon };
}

// ---- W1 ----------------------------------------------------------------------
test('W1 warm plan URIs equal the URIs the morph endpoint requests', () => {
  const h = barController(0), b = h.bar();
  const plan = b.warmPlan(false);
  assert.equal(plan.length, 5);
  assert.deepEqual(plan.map(p => p.length), [4, 4, 2, 4, 4], 'both glyphs in every colour this item can take');
  const iconSvg = require(path.join(mp, 'utils/icons')).iconSvg;
  const warm = new Set();
  plan.forEach(list => list.forEach(e => warm.add(iconSvg(e.name, { stroke: e.color, strokeWidth: 1.75 }))));
  assert.equal(warm.size, 18, 'four items x four + Add x two');
  // The endpoint the child computes for a Home -> Map morph, verbatim from acceptPresentation.
  const cmd = b.publish(state({ selected: 1, transitionFrom: 0, entryKey: 41, entryActive: true }));
  const icons = b.data.viewState.icons;
  for (const i of [0, 1]) {
    const icon = icons[i];
    const origin = iconSvg(icon.fromName, { stroke: icon.color, strokeWidth: 1.75 });
    const target = iconSvg(icon.name, { stroke: icon.color, strokeWidth: 1.75 });
    assert(warm.has(origin), 'origin endpoint of icon ' + i + ' must be warmed');
    assert(warm.has(target), 'target endpoint of icon ' + i + ' must be warmed');
  }
  assert.equal(cmd, true);
});

// ---- W2 / W3 / W4 --------------------------------------------------------------
test('W2/W3 the same endpoint across two TabBars is claimed once and marked ready', () => {
  const ic = iconController();
  const planA = barController(0).bar().warmPlan(false)[1];   // Map item
  const planB = barController(1).bar().warmPlan(false)[1];   // the same item on another bar
  assert.deepEqual(JSON.parse(JSON.stringify(planA)), JSON.parse(JSON.stringify(planB)), 'cross-realm literals need a JSON round trip');
  const a = ic.icon({ name: 'map', warm: planA });
  a.startWarm();
  const claimedA = (a.data.warmSlots || []).map(s => s.uri);
  assert.equal(claimedA.length, 2, 'batched two at a time');
  const b = ic.icon({ name: 'map', warm: planB });
  b.startWarm();
  assert.equal((b.data.warmSlots || []).length, 0, 'the second bar claims nothing new');
  // settle the first two, then the queue advances
  let guard = 0;
  while ((a.data.warmSlots || []).length && guard++ < 10) {
    const batch = (a.data.warmSlots || []).map(x => x.uri);
    batch.forEach(uri => a.onWarmLoad({ currentTarget: { dataset: { uri } } }));
  }
  const reg = a.getWarmDebug().registry;
  assert.equal(reg.loading, 0, 'nothing left loading');
  assert.equal(reg.ready, 4, 'the Map item warms both glyphs in both colours');
  assert.equal(reg.failed, 0);
  assert.equal(a.getWarmDebug().queue, 0);
});

test('W4 a warm failure is recorded and does not touch the morph path', () => {
  const ic = iconController();
  const plan = barController(0).bar().warmPlan(false)[0];
  const c = ic.icon({ name: 'house', warm: plan });
  c.startWarm();
  const uri = c.data.warmSlots[0].uri;
  c.onWarmError({ currentTarget: { dataset: { uri } } });
  const reg = c.getWarmDebug().registry;
  assert.equal(reg.failed, 1);
  assert.equal(c.data.fallbackOnly, false, 'a warm failure must not put the icon into fallback');
  assert.equal(c.data.painting, false, 'and must not start a morph');
});

test('W5 a click before warmup completes still publishes and morphs', () => {
  const h = barController(0), b = h.bar();
  b.publish(state({ selected: 1, transitionFrom: 0, entryKey: 51, entryActive: true }));
  assert.equal(b.writes.length, 1);
  assert.equal(b.data.viewState.icons[1].name, 'map-pinned');
  assert.equal(b.data.selected, 1);
});

// ---- W6 / W7 / W8 / W12 ---------------------------------------------------------
test('W6 a tap does not move the visual selection', () => {
  const h = barController(0), b = h.bar();
  b.publish(state({ selected: 1, transitionFrom: 0, entryKey: 61, entryActive: true }));
  assert.equal(b.data.selected, 1, 'semantic selection moves immediately');
  assert.equal(b.data.visualSelected, 0, 'visual selection waits for the morph');
  assert.equal(b.data.viewState.visualSelected, 0);
});

test('W7 the morph-start report moves the visual selection', () => {
  const h = barController(0), b = h.bar();
  b.publish(state({ selected: 1, transitionFrom: 0, entryKey: 71, entryActive: true }));
  b.onMorphReport({ currentTarget: { dataset: { index: 1 } }, detail: { mode: 'start' } });
  assert.equal(b.data.visualSelected, 1);
  assert.equal(b.data.viewState.visualSelected, 1);
});

test('W8 semantic and visual selection agree once the morph has started', () => {
  const h = barController(0), b = h.bar();
  b.publish(state({ selected: 1, transitionFrom: 0, entryKey: 81, entryActive: true }));
  b.onMorphReport({ currentTarget: { dataset: { index: 1 } }, detail: { mode: 'start' } });
  assert.equal(b.data.visualSelected, b.data.selected);
});

test('W12 the visual selection never leads the morph start', () => {
  const h = barController(0), b = h.bar();
  // Everything the morph emits BEFORE the first frame must leave the emphasis alone.
  b.publish(state({ selected: 1, transitionFrom: 0, entryKey: 91, entryActive: true }));
  for (const mode of ['static-loaded', 'first-frame-reveal-commit']) {
    b.onMorphReport({ currentTarget: { dataset: { index: 1 } }, detail: { mode } });
    assert.equal(b.data.visualSelected, 0, mode + ' must not move the emphasis');
  }
  b.onMorphReport({ currentTarget: { dataset: { index: 1 } }, detail: { mode: 'start' } });
  assert.equal(b.data.visualSelected, 1);
});

// ---- W9 / W10 -------------------------------------------------------------------
test('W9 a transition that never starts cannot latch the visual selection', () => {
  const h = barController(0), b = h.bar();
  b.publish(state({ selected: 1, transitionFrom: 0, entryKey: 101, entryActive: true }));
  assert.equal(b.data.visualSelected, 0);
  assert.equal(h.timers.length, 0, 'a tap must schedule nothing at all');
  // No morph will run, so the icon reports 'ready' (static path) instead of 'start'.
  b.onMorphReport({ currentTarget: { dataset: { index: 1 } }, detail: { mode: 'ready' } });
  assert.equal(b.data.visualSelected, 1, 'the emphasis still has to arrive');
  assert.equal(b.data.visualSelected, b.data.selected);
});

test('W9b a renderer fallback also releases the emphasis', () => {
  const h = barController(0), b = h.bar();
  b.publish(state({ selected: 1, transitionFrom: 0, entryKey: 102, entryActive: true }));
  b.onMorphReport({ currentTarget: { dataset: { index: 1 } }, detail: { mode: 'static-fallback' } });
  assert.equal(b.data.visualSelected, 1);
});

test('W10 reducedMotion moves the visual selection immediately', () => {
  const h = barController(0), b = h.bar();
  b.publish(state({ selected: 1, transitionFrom: 0, entryKey: 111, entryActive: true, quiet: true }));
  assert.equal(b.data.visualSelected, 1, 'no morph runs, so nothing to wait for');
});

// ---- W11 ------------------------------------------------------------------------
test('W11 the Phase 1A dedupe still skips a repeated visual publish', () => {
  const h = barController(0), b = h.bar();
  b.publish(state({ selected: 1, transitionFrom: 0, entryKey: 121, entryActive: true }));
  const n = b.writes.length;
  b.publish(state({ selected: 1, transitionFrom: 0, entryKey: 121, entryActive: true }));
  assert.equal(b.writes.length, n, 'an identical visual publish must not write');
  assert.equal(b.getPublishDiagnostics().skipped, 1);
});

console.log(passed + ' passed, ' + failed + ' failed; synthetic component harness, no device claim.');
if (failed) process.exitCode = 1;
