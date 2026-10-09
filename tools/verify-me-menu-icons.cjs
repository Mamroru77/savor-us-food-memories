#!/usr/bin/env node
// Me P1-2 -- secondary-menu icon semantics.
//
// The Me secondary menu is ONE `wx:for` over `menuRows`, so MENU_ROWS *is* the rendered list and
// there is no second row source to miss. This guard reads the real definition (never a line
// number) and checks the product contract the user asked for:
//
//   1. every rendered secondary-menu row carries an icon
//   2. every icon resolves to a registered glyph with real geometry
//   3. canonical icons are UNIQUE across distinct rows -- no two destinations share a glyph
//   4. no alias (lucide-*) resolves to an empty SVG
//   5. the generated icon output is still exactly what tools/build-icons.cjs produces
//
// It also pins the approved title -> icon mapping: that mapping is the reviewed decision, and a
// rename or a silent swap must fail here rather than ship.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const mp = path.join(root, 'miniprogram');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

const pageSource = read('miniprogram/pages/me/index.js');
const wxml = read('miniprogram/pages/me/index.wxml');
const { icons, iconSvg } = require(path.join(mp, 'utils/icons'));
const aliases = require('./icon-aliases.json');
const nodes = require(path.join(mp, 'utils/lucideMorphNodes'));

// ---- the real menu definition, extracted exactly as the other Me suites extract it.
const menuBlock = pageSource.match(/const MENU_ROWS = (\[[\s\S]*?\n\]);/);
assert(menuBlock, 'the reviewed MENU_ROWS block must be present');
const rows = JSON.parse(JSON.stringify(vm.runInNewContext(menuBlock[1])));
assert.ok(rows.length > 1, 'the menu must actually have rows');

// ---- 1. the rendered menu is generated from MENU_ROWS and nowhere else.
// One generated list in the whole page, iterating menuRows, with one row-icon binding. If a row
// were ever built outside MENU_ROWS these counts would move, so the guard covers the full
// rendered menu rather than only the definition.
assert.equal((wxml.match(/wx:for=/g) || []).length, 1, 'the Me page must have exactly one generated list');
assert.match(wxml, /wx:for="\{\{menuRows\}\}"/, 'that list must iterate menuRows');
assert.equal((wxml.match(/name="\{\{item\.icon\}\}"/g) || []).length, 1, 'exactly one row-icon binding');
assert.match(wxml, /class="profile-menu glass content-card"/, 'the menu container must exist');
assert.match(wxml, /class="profile-menu-row"/, 'rows must render the reviewed row class');
assert.match(pageSource, /menuRows: MENU_ROWS\b/, 'the first render must already carry MENU_ROWS');

// ---- 2 + 3. every row has a registered icon, and canonical icons are unique.
const canonical = name => (Object.prototype.hasOwnProperty.call(aliases, name) ? aliases[name] : name);
const seen = new Map();
const mapping = [];
for (const [index, row] of rows.entries()) {
  const where = 'row ' + (index + 1) + ' (' + row.title + ')';
  assert.equal(typeof row.icon, 'string', where + ' must carry an icon name');
  assert.ok(row.icon.trim().length > 0, where + ' must carry a non-empty icon name');
  const body = icons[row.icon];
  assert.ok(typeof body === 'string' && body.length > 0, where + ' icon "' + row.icon + '" must be registered and non-empty');
  const uri = iconSvg(row.icon);
  assert.ok(uri && uri.indexOf('data:image/svg+xml') === 0, where + ' icon must resolve to an SVG data URI');
  assert.match(decodeURIComponent(uri), /<(path|line|rect|circle|ellipse|polyline|polygon) /, where + ' icon must contain real geometry');
  const key = canonical(row.icon);
  assert.ok(nodes[key], where + ' canonical icon "' + key + '" must be an official registered shape');
  if (seen.has(key)) {
    assert.fail('two Me menu rows share the same icon glyph "' + key + '": "' + seen.get(key) + '" and "' + row.title + '"');
  }
  seen.set(key, row.title);
  mapping.push(row.title + ' -> ' + key);
}
assert.equal(seen.size, rows.length, 'every distinct row must own a distinct canonical icon');

// ---- 4. no alias resolves to an empty SVG (the morph fallback path depends on this).
for (const [alias, target] of Object.entries(aliases)) {
  assert.ok(typeof icons[alias] === 'string' && icons[alias].length > 0, 'alias "' + alias + '" must resolve to a non-empty icon');
  assert.equal(icons[alias], icons[target], 'alias "' + alias + '" must resolve to its canonical shape');
}

// ---- the approved mapping. A row rename or a silent icon swap must be re-reviewed, not shipped.
const APPROVED = new Map([
  ['Cloud tools', 'cloud'],
  ['Annual reports', 'calendar-days'],
  ['Shared space & wishlist', 'users'],
  ['Account & legacy data', 'shield-check'],
  ['Sync status', 'arrow-up-from-line'],
  ['Personalize', 'pencil'],
  ['Preferences', 'utensils'],
  ['Memories', 'library'],
  ['Privacy', 'lock-keyhole'],
  ['Settings', 'settings'],
  ['Help & Feedback', 'circle-question-mark'],
]);
assert.equal(rows.length, APPROVED.size, 'the menu row count changed; re-review the approved icon mapping');
for (const row of rows) {
  assert.ok(APPROVED.has(row.title), 'unreviewed Me menu row: "' + row.title + '"');
  assert.equal(canonical(row.icon), APPROVED.get(row.title), 'icon for "' + row.title + '" must stay as approved');
}

// ---- 5. generated output is in sync with the generator (no hand-edited glyphs).
const generated = ['miniprogram/utils/icons.js', 'miniprogram/utils/lucideMorphNodes.js', 'tools/_gen/icons.json'];
const before = generated.map(f => read(f));
const run = require('node:child_process').spawnSync(process.execPath, [path.join(__dirname, 'build-icons.cjs')], { encoding: 'utf8' });
assert.equal(run.status, 0, 'icon generator must succeed: ' + String(run.stderr || ''));
generated.forEach((f, i) => assert.equal(read(f), before[i], 'generator drift: ' + f));

console.log('PASS ' + rows.length + ' Me secondary-menu rows each resolve to a distinct registered icon');
for (const line of mapping) console.log('     ' + line);
console.log('PASS every lucide-* alias resolves to its canonical non-empty shape');
console.log('PASS generated icon output matches tools/build-icons.cjs (no hand-edited glyphs)');
console.log('Me menu icon checks passed. Native small-size/theme acceptance remains separate.');
