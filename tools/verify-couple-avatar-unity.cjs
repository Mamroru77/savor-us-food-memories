#!/usr/bin/env node
// Couple-avatar unity contract (2026-10-03).
//
// The couple is shown in exactly two places: the Us page's together card
// (`pages/us/index.wxml` / `index.wxss`) and the "Our little world" sheet opened from the Us page's
// top-right gear (`components/sheet/index.wxml` / `index.wxss`, displayType 'together').
//
// They used to disagree on the same app state: Us drew two blank glyph circles, while the sheet drew
// an empty circle with NO glyph beside an unconditional photo (slot 2 was driven by `loveSent`, not
// by whether a partner exists). This guard pins the two surfaces to ONE treatment:
//   1. the same rule for who appears in each slot
//   2. the same empty-state placeholder glyph
//   3. declaration-identical avatar / blank / heart styles (only the theme ancestor and the sheet's
//      own row offset may differ)
//   4. the same tappable heart, with a handler that actually exists in each owner
//   5. the sheet's deliberate minimal view model stays minimal
//
// Source/CSS contracts only — not native rendering or device evidence.
const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const usWxml = read('miniprogram/pages/us/index.wxml');
const usWxss = read('miniprogram/pages/us/index.wxss');
const usJs = read('miniprogram/pages/us/index.js');
const sheetWxml = read('miniprogram/components/sheet/index.wxml');
const sheetWxss = read('miniprogram/components/sheet/index.wxss');
const sheetJs = read('miniprogram/components/sheet/index.js');

let count = 0;
const test = (name, fn) => { fn(); count++; console.log('PASS ' + name); };

// Declaration-level comparison. Comments are stripped first (a selector named inside a comment must
// never satisfy a structural assertion), then each rule is reduced to its LAST declaration per
// property, i.e. what the cascade actually applies within that rule.
function declarations(css) {
  const out = new Map();
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of text.matchAll(/(^|\n)\s*([^{}\n][^{}]*?)\s*\{([^}]*)\}/g)) {
    const selector = m[2].trim();
    if (!selector || selector.startsWith('@')) continue;
    const body = {};
    for (const decl of m[3].split(';')) {
      const i = decl.indexOf(':');
      if (i < 0) continue;
      body[decl.slice(0, i).trim()] = decl.slice(i + 1).trim();
    }
    out.set(selector, body);
  }
  return out;
}
const us = declarations(usWxss);
const sheet = declarations(sheetWxss);
function sameBody(name, a, b, allowedExtra) {
  assert.ok(a, name + ': the Us rule must exist');
  assert.ok(b, name + ': the sheet rule must exist');
  for (const [prop, value] of Object.entries(a)) assert.equal(b[prop], value, name + ': `' + prop + '` must match Us (' + value + ')');
  const extra = Object.keys(b).filter(prop => !(prop in a));
  for (const prop of extra) assert.ok((allowedExtra || []).includes(prop), name + ': unexpected declaration in the sheet: ' + prop);
}

// ------------------------------------------------------------------ 1. same rule for who appears
test('1 the sheet picks the couple the same way the Us card does', () => {
  // Slot 1: my avatar, guarded, with a glyph placeholder when absent.
  assert(/<block wx:if="\{\{state\.profile\.avatar\}\}">/.test(sheetWxml), '1 slot 1 must be guarded on the avatar');
  assert(/<block wx:if="\{\{avatar\}\}">/.test(usWxml), '1 the Us card must still guard slot 1 on the avatar');
  // Slot 2: the partner photo, guarded on a partner name - NOT on loveSent.
  assert(/<block wx:if="\{\{partner\}\}">/.test(sheetWxml), '1 slot 2 must be guarded on the partner name');
  assert(/<block wx:if="\{\{partner\}\}">/.test(usWxml), '1 the Us card must still guard slot 2 on the partner name');
  // The old loveSent-driven photo swap must be gone for good.
  assert(!sheetWxml.includes("state.settings.loveSent ? state.profile.avatar"), '1 the loveSent-driven avatar swap must not return');
  assert(!sheetWxml.includes('152rpx'), '1 the old sheet-only avatar size must not return');
  // No couple avatar <image> may render unconditionally: an empty src would draw a blank circle.
  const coupleImages = [...sheetWxml.matchAll(/<image\b[^>]*sheet-couple-avatar[^>]*>/g)].map(m => m[0]);
  assert.equal(coupleImages.length, 2, '1 exactly two couple avatar images must remain');
  for (const tag of coupleImages) assert(tag.includes('/images/alex.jpg') || tag.includes('binderror='), '1 every couple avatar image must be guarded or fallback-capable: ' + tag);
});

// The sheet reads the same values through its own minimal view model, so a raw byte comparison
// would fail on the data PATH rather than on the treatment. Normalising the two approved prefixes
// away lets these assertions compare what actually renders.
const norm = s => s.replace(/state\.(?:settings|profile)\./g, '');

// ------------------------------------------------------------------ 2. same placeholder glyph
test('2 both surfaces draw the same empty-avatar glyph', () => {
  const glyphs = [usWxml, sheetWxml].map(w => (w.match(/<s-icon name="user-round" size="60"[^>]*>/g) || []));
  assert.equal(glyphs[0].length, 2, '2 the Us card must keep two blank glyphs');
  assert.equal(glyphs[1].length, 2, '2 the sheet must now draw two blank glyphs too');
  for (const tag of glyphs[1]) assert.equal(norm(tag), norm(glyphs[0][0]), '2 the sheet glyph must be identical to the Us glyph');
  assert(!/sheet-couple-avatar[^>]*src=""/.test(sheetWxml), '2 no empty-src couple image may remain');
});

// ------------------------------------------------------------------ 3. declaration-identical styles
test('3 avatar, blank and heart declarations are identical to the Us card', () => {
  sameBody('.couple-avatars vs .sheet-couple', us.get('.couple-avatars'), sheet.get('.sheet-couple'), ['margin-top']);
  assert.equal(sheet.get('.sheet-couple')['margin-top'], '20rpx', '3 the sheet row must keep its own 20rpx top offset');
  sameBody('.avatar vs .sheet-couple-avatar', us.get('.avatar'), sheet.get('.sheet-couple-avatar'));
  sameBody('.avatar-blank vs .sheet-couple-avatar-blank', us.get('.avatar-blank'), sheet.get('.sheet-couple-avatar-blank'));
  sameBody('.couple-heart vs .sheet-couple-heart', us.get('.couple-heart'), sheet.get('.sheet-couple-heart'));
  sameBody('.couple-heart.love-sent vs .sheet-couple-heart.love-sent', us.get('.couple-heart.love-sent'), sheet.get('.sheet-couple-heart.love-sent'));
  // The dusk treatment must exist in both. Only the theme ancestor differs by design: the Us page
  // marks dusk on `.dusk`, while the sheet panel marks it with `.theme-dusk-panel`.
  assert.ok(us.has('.dusk .avatar-blank'), '3 the Us dusk blank rule must exist');
  assert.ok(sheet.has('.theme-dusk-panel .sheet-couple-avatar-blank'), '3 the sheet dusk blank rule must exist');
  sameBody('dusk blank', us.get('.dusk .avatar-blank'), sheet.get('.theme-dusk-panel .sheet-couple-avatar-blank'));
});

// ------------------------------------------------------------------ 4. same tappable heart
test('4 the heart is the same control and its handler is live in both owners', () => {
  for (const [where, wxml, js] of [['Us', usWxml, usJs], ['sheet', sheetWxml, sheetJs]]) {
    const heart = (wxml.match(/<view class="[^"]*couple-heart[^"]*"[^>]*>/g) || []).join('');
    assert(heart.includes('bindtap="onLoveTap"'), '4 ' + where + ' must bind the heart tap');
    assert(heart.includes("loveSent ? 'love-sent' : ''"), '4 ' + where + ' must drive the love-sent class');
    assert(/onLoveTap\s*\(/.test(js), '4 ' + where + ' must define onLoveTap (no dead tap target)');
  }
  const icons = [usWxml, sheetWxml].map(w => (w.match(/<s-icon name="heart" size="47"[^>]*>/g) || []));
  assert.equal(icons[0].length, 1, '4 the Us heart icon must stay');
  assert.equal(icons[1].length, 1, '4 the sheet heart icon must be the same size');
  assert.equal(norm(icons[1][0]), norm(icons[0][0]), '4 the sheet heart icon must render identically to the Us heart icon');
  assert(!sheetWxml.includes("size=\"55\""), '4 the old sheet-only heart size must not return');
  assert(!sheetWxml.includes('#df816b'), '4 the old sheet-only heart colour must not return');
});

// ------------------------------------------------------------------ 5. the minimal view model stays minimal
test('5 the sheet view model stays minimal and this change added no state leaf', () => {
  // verify-audit-stages.cjs owns this contract; re-assert it here so a future edit to the couple row
  // cannot quietly widen the component's view model.
  const used = [...new Set([...sheetWxml.matchAll(/\bstate\.([\w]+)\.([\w]+)/g)].map(m => m[1] + '.' + m[2]))].sort();
  assert.deepEqual(used, ['profile.avatar', 'settings.loveSent', 'settings.notificationsRead'], '5 the sheet may only read the three approved state leaves');
  assert(!sheetJs.includes('this.data.state'), '5 the component must not read the mirrored state back');
  // The partner condition must come from the sheet's own form value, which refreshTogether seeds
  // from profile.partner - that is the same rule the Us card applies to profile.partner.
  assert(/patch\.partner = state\.profile\.partner/.test(sheetJs), '5 the sheet partner field must be seeded from the profile');
});

console.log('\n' + count + '/' + count + ' couple-avatar unity checks passed. Native rendering and device confirmation remain separate evidence.');
