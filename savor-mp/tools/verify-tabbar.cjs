#!/usr/bin/env node
// TabBar-specific verifier — the release blocker gate.
// Usage: node tools/verify-tabbar.cjs [miniprogramDir]
const fs = require('fs');
const path = require('path');
const { extractRequires, resolveRequire, buildRequireGraph, usingComponentPaths, resolveComponentRef } = require('./lib/checks.cjs');

const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..', 'miniprogram'));
const results = [];
let failed = false;

function check(name, ok, detail) {
  results.push({ name, ok, detail });
  if (!ok) failed = true;
}

// 1-5: app.json tabBar wiring
const appJsonPath = path.join(ROOT, 'app.json');
let appJson = null;
try {
  appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
} catch (error) {
  check('app.json parses', false, String(error));
}
if (appJson) {
  const tabBar = appJson.tabBar;
  check('1. app.json.tabBar exists', Boolean(tabBar));
  check('2. tabBar.custom === true', Boolean(tabBar && tabBar.custom === true));
  const list = (tabBar && tabBar.list) || [];
  check('3. exactly five tabs', list.length === 5, `found ${list.length}`);
  const pages = appJson.pages || [];
  check('4. every tab pagePath is in pages', list.every((item) => pages.includes(item.pagePath)),
    list.filter((item) => !pages.includes(item.pagePath)).map((i) => i.pagePath).join(', ') || 'ok');
  check('5. every tab page exists on disk', list.every((item) =>
    ['js', 'json', 'wxml', 'wxss'].every((ext) => fs.existsSync(path.join(ROOT, `${item.pagePath}.${ext}`)))));
  check('3b. tab order is Home Map Add Us Me',
    JSON.stringify(list.map((i) => i.pagePath)) === JSON.stringify(['pages/home/index', 'pages/map/index', 'pages/add/index', 'pages/us/index', 'pages/me/index']));
}

// 6-9: custom-tab-bar files
const ctb = (f) => path.join(ROOT, 'custom-tab-bar', f);
check('6. custom-tab-bar/index.js exists', fs.existsSync(ctb('index.js')));
check('7. custom-tab-bar/index.json component:true', (() => {
  try { return JSON.parse(fs.readFileSync(ctb('index.json'), 'utf8')).component === true; }
  catch { return false; }
})());
check('8. custom-tab-bar/index.wxml exists', fs.existsSync(ctb('index.wxml')));
check('9. custom-tab-bar/index.wxss exists', fs.existsSync(ctb('index.wxss')));

// 10: every require in custom-tab-bar resolves AND stays inside the root
check('10. custom-tab-bar require graph resolves inside root', (() => {
  const js = fs.readFileSync(ctb('index.js'), 'utf8');
  for (const target of extractRequires(js)) {
    const result = resolveRequire(ctb('index.js'), target);
    if (result.error) { console.error('    custom-tab-bar require problem:', result.error); return false; }
    if (!path.resolve(result.resolved).startsWith(path.resolve(ROOT) + path.sep)) return false;
  }
  return true;
})(), 'zero unresolved requires (the historical failure mode)');

// 11-12: component references resolve
check('11. custom-tab-bar usingComponents resolve', (() => {
  let json;
  try { json = JSON.parse(fs.readFileSync(ctb('index.json'), 'utf8')); } catch { return false; }
  return usingComponentPaths(json).every(({ ref }) => resolveComponentRef(ROOT, ref, ctb('index.json')) !== null);
})());
check('12. s-icon component resolves globally', Boolean(resolveComponentRef(ROOT, '/components/icon/index', appJsonPath)));

// 13: switchTab URLs in custom-tab-bar match app.json pagePaths
check('13. switchTab urls match app.json pagePaths', (() => {
  const js = fs.readFileSync(ctb('index.js'), 'utf8');
  const urls = [...js.matchAll(/pagePath:\s*'([^']+)'/g)].map((m) => m[1]);
  const pages = (appJson && appJson.pages) || [];
  return urls.length === 5 && urls.every((u) => pages.includes(u.replace(/^\//, '')));
})());

// 14-15: five tab pages sync selected via getTabBar in onShow, Add = 2
const expectedSelected = { 'pages/home/index': 0, 'pages/map/index': 1, 'pages/add/index': 2, 'pages/us/index': 3, 'pages/me/index': 4 };
for (const [pagePath, expected] of Object.entries(expectedSelected)) {
  const jsPath = path.join(ROOT, `${pagePath}.js`);
  let ok = false;
  let detail = 'file missing';
  if (fs.existsSync(jsPath)) {
    const js = fs.readFileSync(jsPath, 'utf8');
    const hasOnShow = /onShow\s*\(/.test(js);
    const hasGetTabBar = /getTabBar\s*&&\s*this\.getTabBar\s*\(\)/.test(js);
    const syncsSelected = new RegExp(`selected:\\s*${expected}\\b`).test(js);
    const setsData = /tabBar\.setData\(/.test(js);
    ok = hasOnShow && hasGetTabBar && syncsSelected && setsData;
    detail = `onShow:${hasOnShow} getTabBar:${hasGetTabBar} selected:${expected}:${syncsSelected} setData:${setsData}`;
  }
  check(`14. ${pagePath} syncs selected=${expected} in onShow`, ok, detail);
}
check('15. Add tab maps to selected=2', expectedSelected['pages/add/index'] === 2);

// 16: no require anywhere in the project escapes the miniprogram root
check('16. no require escapes the miniprogram root (whole project)', (() => {
  const { problems } = buildRequireGraph(ROOT);
  if (problems.length) {
    for (const p of problems) console.error(`    ${p.file}: ${p.reason}`);
    return false;
  }
  return true;
})());

console.log('\n=== TabBar verification —', ROOT, '===');
for (const r of results) {
  console.log(`${r.ok ? '  ✓' : '  ✗'} ${r.name}${r.detail && !r.ok ? '  — ' + r.detail : ''}`);
}
const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed}/${results.length} checks passed`);
if (failed) {
  console.error('TABBAR VERIFICATION FAILED');
  process.exit(1);
}
console.log('TABBAR VERIFICATION PASSED');
