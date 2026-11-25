// Behavioral & structural contract for the Zero-Rewind + 280ms GPU Soft Tactile Spring TabBar.
// Tests run in a clean VM / static harness; native real-device smoothness is verified separately.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const mp = path.join(root, 'miniprogram');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('PASS ' + name);
  } catch (err) {
    failed++;
    console.error('FAIL ' + name + ': ' + (err && err.stack ? err.stack : err));
  }
}

const clone = (x) => JSON.parse(JSON.stringify(x));

function tabController(initialRoute = 0, initAppearance = {}) {
  let spec;
  let route = initialRoute;
  const calls = [];
  const timers = [];
  const appearance = Object.assign(
    { dusk: false, quiet: false, labels: ['回忆', '地图', '记录', '我们', '我的'], addLabel: '记录' },
    initAppearance
  );
  vm.runInNewContext(fs.readFileSync(path.join(mp, 'custom-tab-bar/index.js'), 'utf8'), {
    Component: (s) => { spec = s; },
    Date, Set, Number, Array, JSON, Object, Boolean, Math,
    getCurrentPages: () => (route < 0
      ? []
      : [{ route: 'pages/' + ['home', 'map', 'add', 'us', 'me'][route] + '/index', _tabAppearance: appearance }]),
    setTimeout(fn, ms) {
      const t = { fn, ms, id: timers.length + 1, cancelled: false };
      timers.push(t);
      return t.id;
    },
    clearTimeout(id) {
      const t = timers.find((x) => x.id === id);
      if (t) t.cancelled = true;
    },
    wx: { switchTab(o) { calls.push(o); } },
  });

  function bar() {
    const b = {
      ...spec.methods,
      data: clone(spec.data),
      writes: [],
      setData(p, cb) {
        this.writes.push(clone(p));
        for (const [key, value] of Object.entries(p)) {
          const keys = key.replace(/\[(\d+)\]/g, '.$1').split('.');
          let target = this.data;
          for (let i = 0; i < keys.length - 1; i++) {
            if (target[keys[i]] === undefined) target[keys[i]] = /^\d+$/.test(keys[i + 1]) ? [] : {};
            target = target[keys[i]];
          }
          target[keys[keys.length - 1]] = value;
        }
        if (cb) cb();
      },
      selectAllComponents() { return []; },
    };
    spec.lifetimes.attached.call(b);
    return b;
  }

  return {
    spec,
    bar,
    calls,
    timers,
    appearance,
    setRoute: (n) => { route = n; },
    tap: (b, n) => b.onTabTap({
      currentTarget: { dataset: { index: n, path: '/pages/' + ['home', 'map', 'add', 'us', 'me'][n] + '/index' } },
    }),
  };
}

// ---- ZR1: Route ownership & zero rewind across all 5 tabs --------------------
test('ZR1 route ownership & zero rewind across all 5 tabs and cached returns', () => {
  const h = tabController(0);
  const bars = [0, 1, 2, 3, 4].map((i) => {
    h.setRoute(i);
    return h.bar();
  });

  const expectedChosen = ['house-heart', 'map-pinned', 'utensils-crossed', 'users-round', 'user-round'];
  for (let i = 0; i < 5; i++) {
    const b = bars[i];
    assert.equal(b.data.selected, i, `bar ${i} selected === route`);
    assert.equal(b.data.visualSelected, i, `bar ${i} visualSelected === route`);
    assert.equal(b.data.viewState.icons[i].name, expectedChosen[i]);
    assert.equal(b.data.viewState.icons[i].icon, 'lucide-' + expectedChosen[i]);
    for (let k = 0; k < 5; k++) {
      assert.equal(b.data.viewState.icons[k].fromName, b.data.viewState.icons[k].name, `bar ${i} slot ${k} has zero geometry rewind`);
      assert.equal(b.data.viewState.icons[k].fromColor, b.data.viewState.icons[k].color, `bar ${i} slot ${k} has zero color rewind`);
    }
  }

  let from = 0;
  h.setRoute(0);
  bars[0].showSelection(0);
  for (const to of [1, 2, 3, 4, 0, 1, 3, 4, 2, 0]) {
    const peerSnapshots = bars.map((b, idx) => (idx === to ? null : clone({ selected: b.data.selected, viewState: b.data.viewState })));
    h.tap(bars[from], to);
    h.setRoute(to);
    bars[to].showSelection(to);
    h.calls.at(-1).success();

    assert.equal(bars[to].data.selected, to);
    assert.equal(bars[to].data.visualSelected, to);
    for (let k = 0; k < 5; k++) {
      assert.equal(bars[to].data.viewState.icons[k].fromName, bars[to].data.viewState.icons[k].name, `switch ${from}->${to} slot ${k} never rewinds`);
      assert.equal(bars[to].data.viewState.icons[k].fromColor, bars[to].data.viewState.icons[k].color, `switch ${from}->${to} slot ${k} never color-rewinds`);
    }
    for (let i = 0; i < 5; i++) {
      if (i === to) continue;
      assert.equal(bars[i].data.selected, peerSnapshots[i].selected, `peer ${i} keeps its own selected=${peerSnapshots[i].selected} during ${from}->${to}`);
      assert.deepEqual(clone(bars[i].data.viewState), peerSnapshots[i].viewState, `peer ${i} viewState untouched (0 cross-WebView parking)`);
    }
    from = to;
  }
});

// ---- ZR2: Alternating GPU spring pulse 1 <-> 2 & quiet/boot/programmatic suppression ----
test('ZR2 alternating GPU spring pulse 1 <-> 2 and quiet/boot/programmatic suppression', () => {
  const h = tabController(0);
  const homeBar = h.bar();
  homeBar.showSelection(0);
  assert.equal(homeBar.data.entryKey, 0);
  assert.equal(homeBar.data.enterPulse, 0, 'cold boot on Home does not bounce');

  h.setRoute(1);
  const mapBar = h.bar();
  h.setRoute(0);
  h.tap(homeBar, 1);
  h.setRoute(1);
  mapBar.showSelection(1);
  assert.equal(mapBar.data.enterPulse, 1, 'first tap into Map fires enterPulse 1');

  const writesAfterShow = mapBar.writes.length;
  mapBar.showSelection(1);
  mapBar.updateAppearance(1, h.appearance);
  assert.equal(mapBar.writes.length, writesAfterShow, 'repeated showSelection / updateAppearance for same entryKey dedupes cleanly');
  assert.equal(mapBar.data.enterPulse, 1, 'enterPulse does not re-trigger on duplicate notifications');

  // Visit Us then return to Map -> pulse alternates 1 -> 2 -> 1
  h.tap(mapBar, 3);
  h.calls.at(-1).success();
  h.setRoute(3);
  const usBar = h.bar();
  usBar.showSelection(3);

  h.tap(usBar, 1);
  h.calls.at(-1).success();
  h.setRoute(1);
  mapBar.showSelection(1);
  assert.equal(mapBar.data.enterPulse, 2, 'second tap into cached Map alternates to enterPulse 2');

  h.tap(mapBar, 2);
  h.calls.at(-1).success();
  h.setRoute(2);
  const addBar = h.bar();
  addBar.showSelection(2);
  assert.equal(addBar.data.enterPulse, 1, 'tap into Add fires enterPulse 1');

  h.tap(addBar, 1);
  h.calls.at(-1).success();
  h.setRoute(1);
  mapBar.showSelection(1);
  assert.equal(mapBar.data.enterPulse, 1, 'third tap into cached Map alternates back to 1');

  // Programmatic Save -> Home (no recent tap targeting 0) suppresses spring
  h.setRoute(0);
  homeBar.showSelection(0);
  assert.equal(homeBar.data.enterPulse, 0, 'programmatic switchTab without tap produces enterPulse 0');

  // Quiet mode suppresses spring
  const qh = tabController(0, { quiet: true });
  const qHome = qh.bar();
  qh.tap(qHome, 3);
  qh.calls.at(-1).success();
  qh.setRoute(3);
  const qUs = qh.bar();
  qUs.showSelection(3);
  assert.equal(qUs.data.enterPulse, 0, 'quiet mode suppresses arrival spring');
});

// ---- ZR3: Production custom-tab-bar unloads <s-morph> & warmSlots -----------
test('ZR3 custom-tab-bar renders lightweight <s-icon>, 0 require, 0 tap timers, morph-icon preserved', () => {
  const tabJson = JSON.parse(fs.readFileSync(path.join(mp, 'custom-tab-bar/index.json'), 'utf8'));
  assert.equal(tabJson.usingComponents['s-icon'], '/components/icon/index');
  assert(!Object.prototype.hasOwnProperty.call(tabJson.usingComponents, 's-morph'), 'custom-tab-bar must unload s-morph');

  const tabWxml = fs.readFileSync(path.join(mp, 'custom-tab-bar/index.wxml'), 'utf8');
  assert(tabWxml.includes('<s-icon'), 'uses direct <s-icon');
  assert(tabWxml.includes('stroke="1.75"'), 'uses uniform 1.75 stroke');
  assert(!tabWxml.includes('<s-morph'), 'must not render <s-morph in production TabBar');
  assert(!tabWxml.includes('warmEndpoints'), 'must not prewarm 18 offscreen endpoints in TabBar');

  const tabJs = fs.readFileSync(path.join(mp, 'custom-tab-bar/index.js'), 'utf8');
  assert(!/\brequire\s*\(/.test(tabJs.replace(/\/\/[^\n]*/g, '')), 'custom-tab-bar must have zero require() calls');

  const h = tabController(0);
  const home = h.bar();
  const before = clone(home.data);
  h.tap(home, 1);
  assert.equal(h.calls.length, 1, 'wx.switchTab invoked immediately');
  assert.equal(h.timers.length, 0, 'Zero-Rewind TabBar schedules 0 timers');
  assert.deepEqual(clone(home.data), before, 'onTabTap never mutates visible source bar before switchTab');

  // Preserve morph-icon / morphEngine / morph-lab on disk untouched
  assert(fs.existsSync(path.join(mp, 'components/morph-icon/index.js')));
  assert(fs.existsSync(path.join(mp, 'utils/morphEngine.js')));
  assert(fs.existsSync(path.join(mp, 'pages/morph-lab/index.js')));
});

// ---- ZR4: CSS Soft Tactile Spring contract ---------------------------------
test('ZR4 280ms C1-continuous GPU spring keyframes, Add halo rock-solid, Quiet suppression', () => {
  const wxss = fs.readFileSync(path.join(mp, 'custom-tab-bar/index.wxss'), 'utf8');
  const wxml = fs.readFileSync(path.join(mp, 'custom-tab-bar/index.wxml'), 'utf8');

  for (const kf of ['tab-spring-a', 'tab-spring-b', 'tab-add-spring-a', 'tab-add-spring-b']) {
    const m = wxss.match(new RegExp(`@keyframes\\s+${kf}\\s*\\{([\\s\\S]*?)\\n\\}`));
    assert(m, `defines @keyframes ${kf}`);
    assert(/0%\s*\{[^}]*scale\(1\)/.test(m[1]), `${kf} starts continuously at scale(1)`);
    assert(/100%\s*\{[^}]*scale\(1\)/.test(m[1]), `${kf} settles at scale(1)`);
  }

  for (const cls of ['tab-spring-a', 'tab-spring-b', 'tab-add-spring-a', 'tab-add-spring-b']) {
    assert(new RegExp(`\\.${cls}\\s*\\{[^}]*animation:\\s*${cls}\\s+280ms`).test(wxss), `${cls} runs 280ms GPU animation`);
  }

  // Add orb button keeps fixed geometry and press opacity-only; only .tab-add-icon springs
  assert(wxml.includes('class="tab-add-icon'));
  assert(!wxml.includes('tab-add-button {{viewState'));
  assert(wxss.includes('.tab-press { opacity: 0.7; }'));
  assert(wxss.includes('.add-press { opacity: 0.85; }'));
  const press = wxss.match(/\.add-press\s*\{([^}]+)\}/)[1];
  assert(!/transform|box-shadow|width|height|margin|padding/.test(press), 'add-press remains opacity-only');
  assert(wxss.includes('width: 130rpx;') && wxss.includes('height: 130rpx;') && wxss.includes('margin-top: -14rpx;'));

  // Quiet disables transition, animation and transform
  assert(wxss.includes('.theme-quiet .tab-add-icon'));
  assert(/\.theme-quiet[\s\S]*transition:\s*none\s*!important;\s*animation:\s*none\s*!important/.test(wxss));
  assert(/\.theme-quiet[\s\S]*transform:\s*none\s*!important/.test(wxss));

  // Dual-layer label crossfade & Dusk color intact
  assert(wxss.includes('#cfb48d'));
  assert(wxml.includes('class="tab-label-stack"') && wxml.includes('tab-label-sizer') && wxml.includes('tab-label-inactive') && wxml.includes('tab-label-active'));
});

// ---- ZR5: Dusk/language appearance sync, stale rejection & literal guard ----
test('ZR5 Dusk colors, appearance isolation and stale tap rejection intact', () => {
  const tabJs = fs.readFileSync(path.join(mp, 'custom-tab-bar/index.js'), 'utf8');
  assert(tabJs.includes("next.dusk?'#302a23':'#111510'"), 'retains verify-cloud Dusk Add literal');

  const h = tabController(1);
  const mapBar = h.bar();
  mapBar.showSelection(1);
  mapBar.updateAppearance(1, { dusk: true, labels: ['Home', 'Map', 'Add', 'Us', 'Me'], selected: 4, entryKey: 999, enterPulse: 2 });
  assert.equal(mapBar.data.selected, 1, 'updateAppearance cannot inject selected');
  assert.equal(mapBar.data.entryKey, 0, 'updateAppearance cannot inject entryKey');
  assert.equal(mapBar.data.enterPulse, 0, 'updateAppearance cannot trigger spring');
  assert.equal(mapBar.data.dusk, true);
  assert.equal(mapBar.data.viewState.icons[1].color, '#dec8a7', 'Dusk active color');
  assert.equal(mapBar.data.viewState.icons[0].color, '#a9a69f', 'Dusk inactive color');
  assert.equal(mapBar.data.viewState.icons[2].color, '#302a23', 'Dusk Add color');

  h.tap(mapBar, 3);
  assert.equal(mapBar.showSelection(1), false, 'stale route showSelection rejected during newer pending tap');
});

// ---- ZR6: Add/Us/Home onShow prioritization & setData coalescing intact -------
test('ZR6 Add/Us/Home prioritize showSelection before page setData and coalesce onShow', () => {
  for (const pageName of ['add', 'us', 'home']) {
    const js = fs.readFileSync(path.join(mp, 'pages', pageName, 'index.js'), 'utf8');
    const onShowMatch = js.match(/onShow\s*\(\)\s*\{([\s\S]*?)\n\s*\},/);
    assert(onShowMatch, `${pageName} has onShow`);
    const body = onShowMatch[1];
    const showSelPos = body.indexOf('tabBar.showSelection(');
    const setDataPos = body.indexOf('this.setData(');
    assert(showSelPos >= 0 && setDataPos >= 0 && showSelPos < setDataPos,
      `${pageName} onShow calls tabBar.showSelection before page setData`);
    const directSetDataCalls = (body.match(/this\.setData\(/g) || []).length;
    assert.equal(directSetDataCalls, 1, `${pageName} onShow coalesces metadata into 1 direct setData call`);
  }
});

console.log(`${passed} passed, ${failed} failed; synthetic harness, no device claim.`);
if (failed) process.exitCode = 1;
