// TabBar Zero-Rewind + standalone morph-icon endpoint warmup contracts.
//
// W1  production custom-tab-bar renders direct <s-icon> endpoints with zero offscreen warmup overhead
// W2  standalone morph-icon claims and deduplicates shared warm endpoints across instances
// W3  a warmed morph-icon endpoint is marked ready
// W4  a warm failure is recorded on standalone morph-icon and never blocks its morph path
// W5  a publish lands directly on the route's active <s-icon> with zero backward rewind
// W6  semantic and visual selection agree immediately on Zero-Rewind bars (no lag or rewind)
// W7  tap arrival fires alternating enterPulse (1 <-> 2)
// W8  route icons hold fromName === name and fromColor === color across switches
// W9  boot / unkeyed show does not fire enterPulse
// W10 reducedMotion (quiet) keeps enterPulse === 0
// W11 the Phase 1A dedupe still skips a repeated visual publish
// W12 programmatic jump (from === selected) keeps enterPulse === 0
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
        // Match native setData path semantics: nested dot keys land nested.
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
  return {
    spec, bar, timers, appearance,
    setRoute: n => { route = n; },
    tap: (b, n) => b.onTabTap({ currentTarget: { dataset: { index: n, path: '/pages/' + ['home', 'map', 'add', 'us', 'me'][n] + '/index' } } }),
  };
}
const state = o => Object.assign({ dusk: false, quiet: false, labels: ['回忆', '地图', '记录', '我们', '我的'], addLabel: '记录', presentationReady: true }, o);

function localWarmPlan(dusk) {
  const on = !!dusk;
  const list = [
    { rest: 'house', chosen: 'house-heart' },
    { rest: 'map', chosen: 'map-pinned' },
    { rest: 'utensils', chosen: 'utensils-crossed', add: true },
    { rest: 'users', chosen: 'users-round' },
    { rest: 'user', chosen: 'user-round' },
  ];
  return list.map(item => {
    const active = item.add ? (on ? '#302a23' : '#111510') : (on ? '#dec8a7' : '#171a16');
    const inactive = item.add ? (on ? '#302a23' : '#111510') : (on ? '#a9a69f' : '#828480');
    const colors = item.add ? [active] : [active, inactive];
    const out = [];
    for (const color of colors) for (const name of [item.rest, item.chosen]) out.push({ name, color });
    return out;
  });
}

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
test('W1 production custom-tab-bar renders direct official endpoints with zero offscreen warmup', () => {
  const wxml = fs.readFileSync(path.join(mp, 'custom-tab-bar/index.wxml'), 'utf8');
  assert(wxml.includes('<s-icon') && !wxml.includes('<s-morph') && !wxml.includes('warmEndpoints'));
  const iconSvg = require(path.join(mp, 'utils/icons')).iconSvg;
  const warm = new Set();
  localWarmPlan(false).forEach(list => list.forEach(e => warm.add(iconSvg(e.name, { stroke: e.color, strokeWidth: 1.75 }))));
  assert.equal(warm.size, 18);

  const h = barController(1), b = h.bar();
  const cmd = b.publish(state({ selected: 1, transitionFrom: 0, entryKey: 41, entryActive: true }));
  const icons = b.data.viewState.icons;
  for (const i of [0, 1]) {
    const uri = iconSvg(icons[i].name, { stroke: icons[i].color, strokeWidth: 1.75 });
    assert(warm.has(uri), 'active/inactive direct endpoint of icon ' + i + ' is a valid official endpoint');
  }
  assert.equal(cmd, true);
});

// ---- W2 / W3 / W4 (standalone morph-icon warmup contract preserved) --------
test('W2/W3 standalone morph-icon claims shared warm endpoints once and marks ready', () => {
  const ic = iconController();
  const planA = localWarmPlan(false)[1];
  const planB = localWarmPlan(false)[1];
  const a = ic.icon({ name: 'map', warm: planA });
  a.startWarm();
  assert.equal((a.data.warmSlots || []).length, 2, 'batched two at a time');
  const b = ic.icon({ name: 'map', warm: planB });
  b.startWarm();
  assert.equal((b.data.warmSlots || []).length, 0, 'the second instance claims nothing new');
  let guard = 0;
  while ((a.data.warmSlots || []).length && guard++ < 10) {
    const batch = (a.data.warmSlots || []).map(x => x.uri);
    batch.forEach(uri => a.onWarmLoad({ currentTarget: { dataset: { uri } } }));
  }
  const reg = a.getWarmDebug().registry;
  assert.equal(reg.loading, 0);
  assert.equal(reg.ready, 4);
  assert.equal(reg.failed, 0);
});

test('W4 standalone morph-icon records warm failure without entering fallback', () => {
  const ic = iconController();
  const c = ic.icon({ name: 'house', warm: localWarmPlan(false)[0] });
  c.startWarm();
  const uri = c.data.warmSlots[0].uri;
  c.onWarmError({ currentTarget: { dataset: { uri } } });
  const reg = c.getWarmDebug().registry;
  assert.equal(reg.failed, 1);
  assert.equal(c.data.fallbackOnly, false);
  assert.equal(c.data.painting, false);
});

test('W5 Zero-Rewind publish lands directly on active Lucide icon', () => {
  const h = barController(1), b = h.bar();
  b.publish(state({ selected: 1, transitionFrom: 0, entryKey: 51, entryActive: true }));
  assert.equal(b.writes.length, 1);
  assert.equal(b.data.viewState.icons[1].name, 'map-pinned');
  assert.equal(b.data.viewState.icons[1].icon, 'lucide-map-pinned');
  assert.equal(b.data.selected, 1);
});

// ---- W6 / W7 / W8 / W9 / W10 / W12 -----------------------------------------
test('W6 semantic and visual selection agree immediately (0 rewind lag)', () => {
  const h = barController(1), b = h.bar();
  b.publish(state({ selected: 1, transitionFrom: 0, entryKey: 61, entryActive: true }));
  assert.equal(b.data.selected, 1);
  assert.equal(b.data.visualSelected, 1);
  assert.equal(b.data.viewState.visualSelected, 1);
});

test('W7 tap arrival triggers alternating enterPulse 1 <-> 2', () => {
  const h = barController(1), b = h.bar();
  b.publish(state({ selected: 1, transitionFrom: 0, entryKey: 71, entryActive: true }));
  assert.equal(b.data.enterPulse, 1);
  b.publish(state({ selected: 1, transitionFrom: 3, entryKey: 72, entryActive: true }));
  assert.equal(b.data.enterPulse, 2);
});

test('W8 route icons hold fromName === name and fromColor === color across switches', () => {
  const h = barController(1), b = h.bar();
  b.publish(state({ selected: 1, transitionFrom: 0, entryKey: 81, entryActive: true }));
  for (const icon of b.data.viewState.icons) {
    assert.equal(icon.fromName, icon.name);
    assert.equal(icon.fromColor, icon.color);
  }
});

test('W9 boot / unkeyed publish schedules 0 timers and leaves enterPulse === 0', () => {
  const h = barController(1), b = h.bar();
  b.publish(state({ selected: 1, transitionFrom: -1, entryKey: 0, entryActive: true }));
  assert.equal(h.timers.length, 0);
  assert.equal(b.data.enterPulse, 0);
});

test('W10 reducedMotion (quiet) suppresses arrival GPU spring', () => {
  const h = barController(1), b = h.bar();
  b.publish(state({ selected: 1, transitionFrom: 0, entryKey: 111, entryActive: true, quiet: true }));
  assert.equal(b.data.visualSelected, 1);
  assert.equal(b.data.enterPulse, 0);
});

test('W11 the Phase 1A dedupe still skips a repeated visual publish', () => {
  const h = barController(0), b = h.bar();
  b.publish(state({ selected: 1, transitionFrom: 0, entryKey: 121, entryActive: true }));
  const n = b.writes.length;
  b.publish(state({ selected: 1, transitionFrom: 0, entryKey: 121, entryActive: true }));
  assert.equal(b.writes.length, n, 'an identical visual publish must not write');
  assert.equal(b.getPublishDiagnostics().skipped, 1);
});

test('W12 programmatic jump (from === selected) keeps enterPulse === 0', () => {
  const h = barController(1), b = h.bar();
  b.publish(state({ selected: 1, transitionFrom: 1, entryKey: 131, entryActive: true }));
  assert.equal(b.data.enterPulse, 0);
});

console.log(passed + ' passed, ' + failed + ' failed; synthetic harness, no device claim.');
if (failed) process.exitCode = 1;
