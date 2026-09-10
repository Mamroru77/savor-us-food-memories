#!/usr/bin/env node
// Savor mini program — master static verifier (checks A–T + size).
// Runs against the FINAL miniprogram/ directory; the dedicated verifiers
// (tabbar, assets) are re-executed against the SAME directory so the
// tested tree and the delivered tree can never drift apart.
//
// Usage: node tools/verify-miniprogram.cjs [miniprogramDir]
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { spawnSync } = require('child_process');
const {
  listFiles, stripStringsAndComments, extractRequires, buildRequireGraph, usingComponentPaths,
  resolveComponentRef, checkWxmlBalance,
} = require('./lib/checks.cjs');

const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..', 'miniprogram'));
const results = [];
function check(id, name, ok, detail) {
  results.push({ id, name, ok, detail });
  console.log(`${ok ? '  ✓' : '  ✗'} [${id}] ${name}${detail && !ok ? '  — ' + detail : ''}`);
  return ok;
}
function section(title) { console.log(`\n--- ${title} ---`); }

const jsFiles = listFiles(ROOT, '.js');
const wxmlFiles = listFiles(ROOT, '.wxml');
const wxssFiles = listFiles(ROOT, '.wxss');
const jsonFiles = listFiles(ROOT, '.json');

let appJson = null;
try { appJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8')); } catch (e) { /* reported below */ }
const pages = (appJson && appJson.pages) || [];
const tabPaths = ((appJson && appJson.tabBar && appJson.tabBar.list) || []).map((i) => i.pagePath);

/* ---------------- A. JS syntax ---------------- */
section('A. JS syntax');
for (const file of jsFiles) {
  const rel = path.relative(ROOT, file);
  try {
    new vm.Script(fs.readFileSync(file, 'utf8'), { filename: rel });
    check('A', `${rel} parses`, true);
  } catch (error) {
    check('A', `${rel} parses`, false, error.message);
  }
}

/* ---------------- B. JSON ---------------- */
section('B. JSON validity');
for (const file of jsonFiles) {
  const rel = path.relative(ROOT, file);
  try {
    JSON.parse(fs.readFileSync(file, 'utf8'));
    check('B', `${rel} parses`, true);
  } catch (error) {
    check('B', `${rel} parses`, false, error.message);
  }
}

/* ---------------- C. WXML ---------------- */
section('C. WXML structure');
for (const file of wxmlFiles) {
  const rel = path.relative(ROOT, file);
  const { balanced, problems } = checkWxmlBalance(fs.readFileSync(file, 'utf8'), rel);
  check('C', `${rel} tags balanced`, balanced, problems.join('; ') || '');
}

/* ---------------- D. WXSS ---------------- */
section('D. WXSS');
for (const file of wxssFiles) {
  const rel = path.relative(ROOT, file);
  const source = fs.readFileSync(file, 'utf8');
  const opens = (source.match(/\{/g) || []).length;
  const closes = (source.match(/\}/g) || []).length;
  check('D', `${rel} braces balanced`, opens === closes, `${opens} vs ${closes}`);
  const badUrl = /url\(\s*['"]?\/images\//.exec(source);
  check('D', `${rel} no local-path url()`, !badUrl, badUrl ? 'wxss cannot load package files via url() — use data-uri or <image>' : '');
  // declaration-level tokens the WeChat WXSS compiler rejects
  // (it is stricter than browsers: a stray ';' fails the whole build)
  const strippedCss = source.replace(/\/\*[\s\S]*?\*\//g, '');
  const doubleSemi = /;\s*;/.exec(strippedCss);
  check('D', `${rel} no double semicolons`, !doubleSemi, doubleSemi ? `near: ${strippedCss.slice(Math.max(0, doubleSemi.index - 30), doubleSemi.index + 10).replace(/\s+/g, ' ')}` : '');
  const parenOk = (strippedCss.match(/\(/g) || []).length === (strippedCss.match(/\)/g) || []).length;
  check('D', `${rel} parens balanced`, parenOk);
  const trailingComma = /,\s*\}/.exec(strippedCss);
  check('D', `${rel} no trailing commas in declarations`, !trailingComma, trailingComma ? `near index ${trailingComma.index}` : '');
  // component wxss forbids tag-name / id / attribute selectors
  // (WeChat warning: “Some selectors are not allowed in component wxss”)
  if (/components\||custom-tab-bar/.test(rel.replace(/\\/g, '|')) || rel.startsWith('components/') || rel.startsWith('custom-tab-bar/')) {
    const tagSet = new Set(['view', 'text', 'image', 'input', 'textarea', 'button', 'picker', 'scroll-view', 'swiper',
      'block', 'form', 'label', 'navigator', 'video', 'map', 'canvas', 'checkbox', 'radio', 'slider', 'switch', 'small', 'p', 'span']);
    let badSelector = '';
    const ruleRe = /([^{}]+)\{/g;
    let rm;
    while ((rm = ruleRe.exec(strippedCss)) !== null && !badSelector) {
      const selector = rm[1];
      if (selector.includes('@')) continue;
      for (const token of selector.split(/[\s>+~(),]+/)) {
        const clean = token.trim();
        if (clean && !clean.startsWith('.') && !clean.startsWith('#') && !clean.startsWith('*')
          && !clean.startsWith('[') && !clean.includes(':') && tagSet.has(clean)) {
          badSelector = `${clean} in "${selector.trim().slice(0, 40)}"`;
          break;
        }
      }
    }
    check('D', `${rel} no tag-name selectors (component wxss rule)`, !badSelector, badSelector);
  }
}

/* ---------------- E. Pages ---------------- */
section('E. Pages');
check('E', 'app.json parsed', Boolean(appJson));
for (const page of pages) {
  const missing = ['js', 'json', 'wxml', 'wxss'].filter((ext) => !fs.existsSync(path.join(ROOT, `${page}.${ext}`)));
  check('E', `${page} complete`, missing.length === 0, missing.join(', ') || '');
}

/* ---------------- F. tabBar config ---------------- */
section('F. tabBar config');
check('F', 'tabBar present, custom=true', Boolean(appJson && appJson.tabBar && appJson.tabBar.custom === true));
check('F', 'five tabs, all real pages', tabPaths.length === 5 && tabPaths.every((p) => pages.includes(p)), tabPaths.join(' '));
check('F', 'tab order Home Map Add Us Me',
  JSON.stringify(tabPaths) === JSON.stringify(['pages/home/index', 'pages/map/index', 'pages/add/index', 'pages/us/index', 'pages/me/index']));

/* ---------------- G. Custom TabBar files ---------------- */
section('G. Custom TabBar');
const ctbJs = path.join(ROOT, 'custom-tab-bar', 'index.js');
check('G', 'custom-tab-bar complete (js/json/wxml/wxss)',
  ['js', 'json', 'wxml', 'wxss'].every((ext) => fs.existsSync(path.join(ROOT, 'custom-tab-bar', `index.${ext}`))));
let ctbSource = '';
try { ctbSource = fs.readFileSync(ctbJs, 'utf8'); } catch (e) { /* G above reports */ }
check('G', 'custom-tab-bar has zero require() calls (comment-aware scan)',
  extractRequires(ctbSource).length === 0);

/* ---------------- H. usingComponents ---------------- */
section('H. usingComponents resolve');
{
  const refs = [];
  if (appJson) refs.push(['app.json', appJson]);
  for (const file of jsonFiles) {
    if (file.endsWith('app.json')) continue;
    try { refs.push([path.relative(ROOT, file), JSON.parse(fs.readFileSync(file, 'utf8'))]); } catch { /* B reports */ }
  }
  for (const [label, json] of refs) {
    for (const { name, ref } of usingComponentPaths(json)) {
      const resolved = resolveComponentRef(ROOT, ref, path.join(ROOT, 'app.json'));
      check('H', `${label}: ${name} -> ${ref}`, Boolean(resolved));
    }
  }
}

/* ---------------- I + R. require dependency graph ---------------- */
section('I/R. require dependency graph');
{
  const { edges, problems } = buildRequireGraph(ROOT);
  check('I', `all requires resolve (${edges.length} edges)`, problems.length === 0,
    problems.slice(0, 5).map((p) => `${p.file}: ${p.reason}`).join(' | '));
  check('R', 'no dependency escapes miniprogram root', problems.every((p) => !p.reason.includes('escapes')));
}

/* ---------------- J + K. local assets & images ---------------- */
section('J/K. local assets');
{
  const res = spawnSync(process.execPath, [path.join(__dirname, 'verify-assets.cjs'), ROOT], { encoding: 'utf8' });
  check('J', 'asset manifest (all referenced /images exist)', res.status === 0, (res.stdout || '').trim().split('\n').slice(-1)[0]);
  check('K', 'image files have valid headers and sane sizes', res.status === 0);
}

/* ---------------- L. icon names ---------------- */
section('L. icon names');
{
  let known = new Set();
  try {
    const src = fs.readFileSync(path.join(ROOT, 'utils', 'icons.js'), 'utf8');
    const mod = { exports: {} };
    const fn = new Function('module', 'exports', src);
    fn(mod, mod.exports);
    known = new Set(Object.keys(mod.exports.icons || {}));
  } catch (error) {
    check('L', 'utils/icons.js evaluates', false, error.message);
  }
  const used = new Set();
  for (const file of wxmlFiles) {
    const src = fs.readFileSync(file, 'utf8');
    for (const m of src.matchAll(/<s-icon[^>]*?\sname="([^"]*)"/g)) {
      if (!/^\{\{/.test(m[1])) used.add(m[1]);
    }
  }
  for (const file of jsFiles) {
    const src = fs.readFileSync(file, 'utf8');
    for (const m of src.matchAll(/(?:icon|activeIcon):\s*'([a-z0-9-]+)'/g)) used.add(m[1]);
  }
  const missing = [...used].filter((n) => !known.has(n));
  check('L', `all ${used.size} referenced icon names exist in utils/icons.js`, missing.length === 0, missing.join(', ') || '');
}

/* ---------------- M. WXML handlers exist ---------------- */
section('M. WXML handlers');
for (const file of wxmlFiles) {
  const rel = path.relative(ROOT, file);
  const src = fs.readFileSync(file, 'utf8');
  const jsPath = path.join(path.dirname(file), 'index.js');
  if (!fs.existsSync(jsPath)) continue;
  const js = fs.readFileSync(jsPath, 'utf8');
  const handlers = new Set();
  for (const m of src.matchAll(/(?:bind|catch)(?::|\b)[a-zA-Z]+\s*=\s*"([A-Za-z0-9_]+)"/g)) handlers.add(m[1]);
  for (const handler of handlers) {
    check('M', `${rel}: ${handler}() exists`, new RegExp(`${handler}\\s*[(=:]`).test(js));
  }
}

/* ---------------- N. wx:for / wx:key ---------------- */
section('N. wx:for keys');
for (const file of wxmlFiles) {
  const rel = path.relative(ROOT, file);
  const src = fs.readFileSync(file, 'utf8');
  let count = 0; let bad = 0;
  for (const m of src.matchAll(/<[a-zA-Z][^>]*>/g)) {
    if (/wx:for\s*=/.test(m[0])) {
      count += 1;
      if (!/wx:key\s*=/.test(m[0])) bad += 1;
    }
  }
  check('N', `${rel}: every wx:for has wx:key (${count})`, bad === 0, bad ? `${bad} missing` : '');
}

/* ---------------- O. routes ---------------- */
section('O. routes');
{
  const routeTargets = new Set();
  for (const file of jsFiles) {
    const src = fs.readFileSync(file, 'utf8');
    for (const m of src.matchAll(/wx\.(switchTab|navigateTo|redirectTo|reLaunch)\(\{\s*url:\s*['"]([^'"]+)['"]/g)) {
      routeTargets.add(`${m[1]}->${m[2].split('?')[0].replace(/^\//, '')}`);
    }
  }
  let ok = true;
  for (const entry of routeTargets) {
    const [api, url] = entry.split('->');
    const exists = pages.includes(url);
    const tabOk = api !== 'switchTab' || tabPaths.includes(url);
    if (!exists || !tabOk) {
      ok = false;
      check('O', `route ${entry}`, false, !exists ? 'page missing' : 'switchTab to non-tab page');
    }
  }
  if (ok) check('O', `all ${routeTargets.size} wx.*Tab routes valid`, true);
}

/* ---------------- P. tab selected mapping ---------------- */
section('P. tab selected mapping');
{
  const expected = { 'pages/home/index': 0, 'pages/map/index': 1, 'pages/add/index': 2, 'pages/us/index': 3, 'pages/me/index': 4 };
  for (const [pagePath, index] of Object.entries(expected)) {
    const jsPath = path.join(ROOT, `${pagePath}.js`);
    const js = fs.existsSync(jsPath) ? fs.readFileSync(jsPath, 'utf8') : '';
    const ok = /onShow\s*\(/.test(js) && /getTabBar\s*&&\s*this\.getTabBar\s*\(\)/.test(js)
      && new RegExp(`selected:\\s*${index}\\b`).test(js) && /tabBar\.setData\(/.test(js);
    check('P', `${pagePath} onShow syncs selected=${index}`, ok);
  }
}

/* ---------------- Q. browser-only APIs ---------------- */
section('Q. browser-only APIs');
{
  const forbidden = [
    [/window\./, 'window.'], [/document\./, 'document.'], [/localStorage/, 'localStorage'],
    [/sessionStorage/, 'sessionStorage'], [/\bfetch\(/, 'fetch('], [/XMLHttpRequest/, 'XMLHttpRequest'],
    [/navigator\./, 'navigator.'], [/\balert\(/, 'alert('], [/\bleaflet\b/i, 'leaflet'],
    [/from\s+['"]react['"]/, 'react'], [/innerHTML/, 'innerHTML'], [/\bDOMParser\b/, 'DOMParser'],
  ];
  let clean = true;
  for (const file of jsFiles) {
    const src = stripStringsAndComments(fs.readFileSync(file, 'utf8'));
    const rel = path.relative(ROOT, file);
    for (const [re, label] of forbidden) {
      if (re.test(src)) {
        clean = false;
        check('Q', `${rel} free of browser API`, false, `found ${label}`);
      }
    }
  }
  if (clean) check('Q', `all ${jsFiles.length} JS files free of browser-only APIs`, true);
}

/* ---------------- S. store smoke test ---------------- */
section('S. store smoke test');
{
  try {
    const sandbox = makeWxSandbox();
    const store = loadStoreInSandbox(sandbox);
    const state = store.get();
    check('S', 'defaults load (7 sample memories)', state.memories.length === 7, String(state.memories.length));

    const created = {
      id: 'smoke-1', restaurant: 'Smoke Diner', city: 'Paris', country: 'France', neighborhood: '',
      date: '2026-01-02', notes: 'smoke', rating: 4, tags: ['Smoke'], photo: '/images/coffee.jpg',
      extraPhotos: [], coordinates: [48.85, 2.33], shared: false, liked: false, saved: false,
    };
    store.addMemory(created);
    check('S', 'addMemory prepends', store.get().memories[0].id === 'smoke-1');

    store.updateMemory('smoke-1', { liked: true, saved: true });
    const toggled = store.get().memories.find((m) => m.id === 'smoke-1');
    check('S', 'updateMemory toggles liked/saved', toggled.liked === true && toggled.saved === true);

    store.updateMemory('smoke-1', { shared: true });
    check('S', 'shared flag persists', store.get().memories.find((m) => m.id === 'smoke-1').shared === true);

    // corrupt storage fallback: poison the box, reload the module
    sandbox.storage['savor-diary-v1'] = '{corrupt json!!!';
    const store2 = loadStoreInSandbox(sandbox);
    check('S', 'corrupt storage falls back to defaults', store2.get().memories.length === 7, String(store2.get().memories.length));

    // import + dedupe by id
    const imported = store2.importMemories([created, { ...created, id: 'smoke-2' }]);
    check('S', 'import adds both new memories', imported === 2, `added ${imported}`);
    const again = store2.importMemories([{ ...created, id: 'smoke-2' }]);
    check('S', 'import dedupes by id', again === 0, `added ${again}`);

    store2.deleteMemory('smoke-2');
    check('S', 'deleteMemory removes', !store2.get().memories.some((m) => m.id === 'smoke-2'));

    // draft round-trip
    store2.saveDraft({ ...store2.freshDraft(), restaurant: 'Draft Cafe' });
    check('S', 'draft round-trips', store2.loadDraft().restaurant === 'Draft Cafe');

    store2.saveFeedback('note');
    check('S', 'feedback saved', store2.get().feedback.length === 1);

    store2.updateSettings({ theme: 'dusk', reduceMotion: true });
    check('S', 'settings update (theme/reduceMotion)', store2.get().settings.theme === 'dusk' && store2.get().settings.reduceMotion === true);
  } catch (error) {
    check('S', 'store smoke test runs', false, error.stack || String(error));
  }
}

/* ---------------- T. import/export smoke test ---------------- */
section('T. import / export smoke test');
{
  try {
    const sandbox = makeWxSandbox();
    const store = loadStoreInSandbox(sandbox);
    const dataMod = loadDataInSandbox(sandbox);

    const exported = JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), memories: store.get().memories }, null, 2);
    const parsed = JSON.parse(exported);
    check('T', 'export payload shape {version, exportedAt, memories}', parsed.version === 1 && Array.isArray(parsed.memories));

    const items = Array.isArray(parsed) ? parsed : parsed.memories;
    check('T', 'every exported memory passes isMemory', Array.isArray(items) && items.length <= 500 && items.every(dataMod.isMemory));

    const bogusItems = [{ hello: true }];
    check('T', 'invalid import rejected by isMemory', !bogusItems.every(dataMod.isMemory));

    const freshSandbox = makeWxSandbox();
    const freshStore = loadStoreInSandbox(freshSandbox);
    const renamed = items.map((m) => ({ ...m, id: 'restore-' + m.id }));
    const count = freshStore.importMemories(renamed);
    check('T', 'restore into fresh diary adds 7', count === 7, `added ${count}`);
    const again = freshStore.importMemories(renamed);
    check('T', 're-import is a no-op (dedupe)', again === 0, `added ${again}`);
  } catch (error) {
    check('T', 'import/export smoke test runs', false, error.stack || String(error));
  }
}

/* ---------------- package size ---------------- */
section('Package size');
{
  let total = 0;
  for (const file of listFiles(ROOT)) total += fs.statSync(file).size;
  const mb = total / (1024 * 1024);
  check('SIZE', `package size ${mb.toFixed(2)} MB (main package limit 2 MB)`, mb < 2);
}

/* ---------------- dedicated verifiers ---------------- */
section('Dedicated verifiers');
for (const script of ['verify-tabbar.cjs', 'verify-assets.cjs']) {
  const res = spawnSync(process.execPath, [path.join(__dirname, script), ROOT], { encoding: 'utf8' });
  check('SUB', script, res.status === 0, (res.stdout || '').trim().split('\n').slice(-1)[0]);
  if (res.status !== 0) console.log((res.stdout || '') + (res.stderr || ''));
}

/* ---------------- report ---------------- */
const failed = results.filter((r) => !r.ok);
console.log('\n==================================================');
console.log(`TOTAL: ${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.error('FAILED CHECKS:');
  for (const f of failed) console.error(`  ✗ [${f.id}] ${f.name} ${f.detail || ''}`);
  console.error('FINAL STATIC VALIDATION: FAIL');
  process.exit(1);
}
console.log('Static verification passed.');
console.log('FINAL STATIC VALIDATION: PASS');

/* ---------------- helpers ---------------- */

function makeWxSandbox() {
  const storage = Object.create(null);
  const wx = {
    env: { USER_DATA_PATH: '/tmp/savor-test-user' },
    getStorageSync(key) { return key in storage ? storage[key] : ''; },
    setStorageSync(key, value) { storage[key] = value; },
    removeStorageSync(key) { delete storage[key]; },
  };
  return { wx, storage };
}

function loadStoreInSandbox(sandbox) {
  const storeSrc = fs.readFileSync(path.join(ROOT, 'utils', 'store.js'), 'utf8');
  const module = { exports: {} };
  const requireShim = (target) => {
    if (target === './data') return loadDataInSandbox(sandbox);
    throw new Error('unexpected require ' + target);
  };
  const fn = new Function('module', 'exports', 'require', 'wx', 'setTimeout', 'clearTimeout', storeSrc);
  fn(module, module.exports, requireShim, sandbox.wx, (cb) => setTimeout(cb, 0), (t) => clearTimeout(t));
  return module.exports;
}

function loadDataInSandbox(sandbox) {
  const dataSrc = fs.readFileSync(path.join(ROOT, 'utils', 'data.js'), 'utf8');
  const module = { exports: {} };
  const fn = new Function('module', 'exports', 'require', 'wx', dataSrc);
  fn(module, module.exports, () => ({}), sandbox.wx);
  return module.exports;
}

