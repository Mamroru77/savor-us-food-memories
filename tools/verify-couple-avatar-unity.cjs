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
const vm = require('node:vm');

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

// Evaluate the actual row's conditional blocks and image bindings, not a second avatar selector.
// This tiny projection supports these two rows only; it is not native WXML rendering evidence.
function avatarSlots(row, context) {
  const evaluate = expression => vm.runInNewContext(expression, context, {timeout:50});
  const rendered = row.replace(/<block wx:if="\{\{([\s\S]*?)\}\}">([\s\S]*?)<\/block>\s*<block wx:else>([\s\S]*?)<\/block>/g,
    (_, condition, yes, no) => evaluate(condition) ? yes : no);
  assert(!/<block\b/.test(rendered), 'avatar projection must handle every conditional block');
  return [...rendered.matchAll(/<image\b[^>]*>|<view\b[^>]*class="[^"]*avatar-blank[^"]*"[^>]*>/g)].map(([tag]) => {
    if (tag.startsWith('<view')) return 'neutral';
    assert(tag.includes('binderror="onImageError"'), 'every identity photo must handle load failure');
    return tag.match(/\bsrc="([^"]*)"/)[1].replace(/\{\{([\s\S]*?)\}\}/g, (_, expression) => evaluate(expression));
  });
}

// ------------------------------------------------------------------ 1. truthful identity, including failed and legacy sources
test('1 both rows show real user photos or neutral defaults, independent of name and love', () => {
  const rows = [
    ['Us', usWxml.slice(usWxml.indexOf('<view class="couple-avatars">'), usWxml.indexOf('<view class="together-count"'))],
    ['Together', sheetWxml.slice(sheetWxml.indexOf('<view class="sheet-couple">'), sheetWxml.indexOf('<text class="together-message">'))],
  ];
  const cases = [
    {name:'both absent', avatar:'', partner:'', want:['neutral','neutral']},
    {name:'real user only', avatar:'/user/real-avatar.jpg', partner:'', want:['/user/real-avatar.jpg','neutral']},
    {name:'partner name only', avatar:'', partner:'A person', want:['neutral','neutral']},
    {name:'real user and partner name', avatar:'/user/real-avatar.jpg', partner:'A person', want:['/user/real-avatar.jpg','neutral']},
    {name:'failed real user photo', avatar:'/user/real-avatar.jpg', partner:'', failed:true, want:['neutral','neutral']},
    {name:'failed photo and named partner', avatar:'/user/real-avatar.jpg', partner:'A person', failed:true, want:['neutral','neutral']},
    {name:'legacy Jamie is not an identity', avatar:'/images/jamie.jpg', partner:'A person', want:['neutral','neutral']},
    {name:'legacy Alex is not an identity', avatar:'/images/alex.jpg', partner:'', want:['neutral','neutral']},
    {name:'unmodelled partner photo only', avatar:'', partner:'A person', partnerAvatar:'/user/partner.jpg', want:['neutral','neutral']},
    {name:'unmodelled partner photo with real user', avatar:'/user/real-avatar.jpg', partner:'A person', partnerAvatar:'/user/partner.jpg', want:['/user/real-avatar.jpg','neutral']},
  ];
  const failures = [];
  for (const [owner, row] of rows) for (const fixture of cases) for (const loveSent of [false,true]) for (const dusk of [false,true]) {
    const context = {avatar:fixture.avatar, partner:fixture.partner, partnerAvatar:fixture.partnerAvatar, loveSent, dusk, imageErrors:{},
      state:{profile:{avatar:fixture.avatar,partner:fixture.partner},settings:{loveSent}}};
    if (fixture.failed) {
      const image = row.match(/<image\b[^>]*>/)[0];
      const binding = image.match(/\bdata-source="([^"]*)"/);
      const source = binding ? binding[1].replace(/\{\{([\s\S]*?)\}\}/g, (_, expression) => vm.runInNewContext(expression,context)) : '';
      require('../miniprogram/utils/uiFeedback').onImageError.call({data:context,setData:patch=>Object.assign(context,patch)}, {currentTarget:{dataset:{source}}});
      assert.equal(context.avatar,fixture.avatar,'image failure must not mutate the avatar source');
      assert.equal(context.state.profile.avatar,fixture.avatar,'image failure must not mutate profile data');
    }
    try { assert.deepEqual(avatarSlots(row,context),fixture.want); }
    catch (error) { failures.push(owner+' / '+fixture.name+' / love='+loveSent+' / dusk='+dusk+': '+error.message); }
  }
  let page;
  const stubs = {i18n:{copy:()=>({}),locale:()=> 'en'},data:{photos:{jamie:'/images/jamie.jpg'}},uiFeedback:{},store:{},metrics:{},memoryStats:{}};
  vm.runInNewContext(usJs,{Page:definition=>{page=definition;},require:name=>stubs[path.basename(name)]});
  if (page.data.avatar !== '' || page.data.partner !== '') failures.push('Us initial render must not seed Jamie/Alex identities');
  assert.equal(failures.length,0,failures.join('\n'));
  console.log('     80 isolated WXML projections passed; unsupported partner-avatar fields remain neutral.');
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
  // The form still edits the partner name; a name is not an avatar source.
  assert(/patch\.partner = state\.profile\.partner/.test(sheetJs), '5 the sheet partner field must be seeded from the profile');
});

console.log('\n' + count + '/' + count + ' couple-avatar unity checks passed. Native rendering and device confirmation remain separate evidence.');
