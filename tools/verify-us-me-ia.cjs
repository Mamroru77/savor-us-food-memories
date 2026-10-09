#!/usr/bin/env node
// US / ME information-architecture contract (2026-10-03).
//
// ONE MANAGEMENT HOME. Shared-space and wishlist management belongs to the Me management domain:
// it is reached from the EXISTING Me secondary-menu row "Shared space & wishlist" ->
// /pages/space/index. The Us tab owns memories, relationship and journey only, so it must not
// carry a second management entry, a dead tap target or a leftover placeholder.
//
// These are source/route/catalogue contracts. They are NOT native rendering, accessibility or
// theme-pixel claims; PEARL/DUSK confirmation on a device remains separate evidence.
const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const mp = path.join(root, 'miniprogram');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const readMp = p => fs.readFileSync(path.join(mp, p), 'utf8');
const exists = p => fs.existsSync(path.join(root, p));

const usWxml = readMp('pages/us/index.wxml');
const usJs = readMp('pages/us/index.js');
const usWxss = readMp('pages/us/index.wxss');
const meWxml = readMp('pages/me/index.wxml');
const meJs = readMp('pages/me/index.js');
const spaceWxml = readMp('pages/space/index.wxml');
const spaceJs = readMp('pages/space/index.js');
const sheetWxml = readMp('components/sheet/index.wxml');

// The cross-account boundary note is ONE canonical catalogue string. Its key is the hash of the
// English text, exactly as the product references it everywhere else (`{{copy.<key>}}`).
const CAPTION = 'Us is your diary collection, not proof of sharing with another account. Manage cross-account access separately in Shared space.';
const CAPTION_KEY = 's' + require('crypto').createHash('sha1').update(CAPTION).digest('hex').slice(0, 10);

// The removed Us labels were hardcoded literals in the Us markup, never catalogue keys, so their
// removal cannot orphan a translation. They are pinned here so a re-introduction fails loudly.
const REMOVED_LABELS = ['管理双人空间与 Wishlist', 'Manage shared space & wishlist'];
const REMOVED_TOKENS = ['space-management', 'onManageSpace', 'secondary-subtle', CAPTION_KEY];

let count = 0;
function test(name, fn) { fn(); count++; console.log('PASS ' + name); }

// ---------------------------------------------------------------- U1
test('U1 Us no longer renders the shared-space management utility', () => {
  for (const token of REMOVED_TOKENS) assert(!usWxml.includes(token), 'U1 the Us markup must not contain ' + token);
  for (const label of REMOVED_LABELS) assert(!usWxml.includes(label), 'U1 the Us markup must not contain the label ' + label);
  // A leftover rule would mean a leftover node, or a dead shell kept alive for it.
  assert(!usWxss.includes('.space-management'), 'U1 the Us stylesheet must not keep a management rule');
  assert(!usWxss.includes('.secondary-subtle'), 'U1 the Us stylesheet must not keep the removed caption rule');
  // No placeholder / empty margin / separator / loading shell was left behind in its place.
  for (const placeholder of ['placeholder', 'skeleton', 'loading-shell']) assert(!new RegExp('class="[^"]*' + placeholder + '[^"]*"[^>]*></', 'i').test(usWxml), 'U1 no placeholder may replace the removed block: ' + placeholder);
});

// ---------------------------------------------------------------- U2
test('U2 the couple identity card is the first primary surface after the header', () => {
  const order = ['us-heading', 'together-card', 'journey-card', 'shared-section'].map(s => usWxml.indexOf(s));
  order.forEach((at, i) => assert(at >= 0, 'U2 the Us surface must still render ' + ['us-heading', 'together-card', 'journey-card', 'shared-section'][i]));
  for (let i = 1; i < order.length; i++) assert(order[i - 1] < order[i], 'U2 the Us hierarchy must stay header -> identity -> journey -> shared moments');
  for (const token of REMOVED_TOKENS) {
    const at = usWxml.indexOf(token);
    assert(at < 0 || at > order[1], 'U2 nothing management-shaped may sit between the header and the identity card: ' + token);
  }
  // The identity card must remain the only filled surface before the journey card: exactly one
  // `content-card` between the header and the journey card.
  const between = usWxml.slice(order[0], order[2]);
  assert.equal((between.match(/content-card/g) || []).length, 1, 'U2 exactly one primary card may follow the header');
});

// ---------------------------------------------------------------- U3
test('U3 no dead tap target or handler remains on Us', () => {
  assert(!usJs.includes('onManageSpace'), 'U3 the Us page must not keep the management handler');
  assert(!/navigateTo\(\{\s*url:\s*'\/pages\/space\/index'\s*\}\)/.test(usJs), 'U3 the Us page must not keep a route into the management page');
  // Generic dead-target guard: every binding in the Us markup must resolve to something the Us
  // page actually defines. This is what catches a handler removed with its node, or vice versa.
  const bindings = [...usWxml.matchAll(/\bbind[a-z:]*="([A-Za-z_$][\w$]*)"/g)].map(m => m[1]);
  assert(bindings.length > 0, 'U3 the Us markup must still carry its real interactions');
  for (const name of new Set(bindings)) assert(usJs.includes(name), 'U3 dead tap target on Us: ' + name + ' is bound but never defined');
});

// ---------------------------------------------------------------- M1
test('M1 the Me management route into shared space exists and is unchanged', () => {
  const block = meJs.match(/const MENU_ROWS = (\[[\s\S]*?\n\]);/);
  assert(block, 'M1 the reviewed Me menu block must be present');
  const rows = Function('return ' + block[1])();
  const spaceRow = rows.find(row => row.sheet === 'space');
  assert(spaceRow, 'M1 the Me menu must keep a shared-space row');
  assert.equal(spaceRow.title, 'Shared space & wishlist', 'M1 the reviewed Me row title must not drift');
  assert(meJs.includes("'/pages/space/index'"), 'M1 the Me row must still route to the shared-space page');
  assert(/dataset\.sheet === 'space'/.test(meJs) || /dataset\.sheet==='space'/.test(meJs), 'M1 the Me row dispatcher must still handle the space sheet');
});

// ---------------------------------------------------------------- M2
test('M2 shared-space management remains reachable from the Me destination', () => {
  for (const file of ['pages/space/index.js', 'pages/space/index.wxml', 'pages/space/index.wxss']) assert(exists('miniprogram/' + file), 'M2 the destination page must exist: ' + file);
  for (const action of ['createInvite', 'revokeInvite', 'acceptInvite', 'leave']) assert(spaceJs.includes(action), 'M2 shared-space action must remain: ' + action);
  assert(spaceJs.includes('spaces.load(') && spaceJs.includes('spaces.submit('), 'M2 the shared-space service calls must remain');
  for (const binding of ['bindtap="createInvite"', 'bindtap="acceptInvite"', 'bindtap="leave"']) assert(spaceWxml.includes(binding), 'M2 the destination must still expose ' + binding);
});

// ---------------------------------------------------------------- M3
test('M3 Wishlist remains reachable and keeps its own subsection', () => {
  assert(spaceWxml.includes('labels.wishlist'), 'M3 the wishlist subsection heading must remain');
  for (const action of ['addWish', 'wishPreference', 'wishStatus', 'toDraft']) assert(spaceJs.includes(action), 'M3 wishlist action must remain: ' + action);
  for (const binding of ['bindtap="addWish"', 'bindtap="preference"', 'bindtap="wishStatus"', 'bindtap="toDraft"']) assert(spaceWxml.includes(binding), 'M3 the destination must still expose ' + binding);
  assert(spaceWxml.includes('wx:for="{{wishes}}"'), 'M3 the wishlist list must still render');
});

// ---------------------------------------------------------------- M4
test('M4 the authorization explanation remains reachable, from the canonical catalogue only', () => {
  assert(spaceWxml.includes('{{copy.' + CAPTION_KEY + '}}'), 'M4 the Me destination must carry the cross-account explanation');
  // Every `copy` the destination renders must be the canonical catalogue, on first render AND on
  // every refresh - a stub or a literal would leave the note blank or frozen in one locale.
  const assignments = [...spaceJs.matchAll(/\bcopy:\s*([^,}]+)/g)].map(m => m[1].trim());
  assert(assignments.length >= 2, 'M4 the destination must set its catalogue copy on first render and on refresh');
  for (const value of assignments) assert.equal(value, 'i18n.copy()', 'M4 the destination copy must come from the canonical catalogue, saw: ' + value);
  for (const [where, text] of [['js', spaceJs], ['wxml', spaceWxml]]) assert(!text.includes('not proof') && !text.includes('不代表'), 'M4 the explanation must not be hardcoded in the destination ' + where);
  assert(sheetWxml.includes('{{copy.' + CAPTION_KEY + '}}'), 'M4 the memory-detail sheet must keep carrying it');
  // Reachability is not enough: the catalogue must actually resolve the key in BOTH locales.
  const i18n = require(path.join(mp, 'utils/i18n'));
  const catalog = require(path.join(mp, 'utils/locales'));
  const row = catalog.find(r => r.key === CAPTION_KEY);
  assert(row, 'M4 the canonical catalogue must define ' + CAPTION_KEY);
  assert(row.en && row.zh && row.en !== row.zh, 'M4 the explanation needs distinct EN and ZH copy');
  for (const [locale, marker] of [['en', 'not proof'], ['zh-CN', '不代表']]) {
    i18n.setLanguage(locale);
    const resolved = i18n.copy()[CAPTION_KEY];
    assert(typeof resolved === 'string' && resolved.includes(marker), 'M4 ' + locale + ' must resolve the explanation');
  }
  i18n.setLanguage('system');
});

// ---------------------------------------------------------------- M5
test('M5 no duplicate management entry survives anywhere in the product', () => {
  const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return /\.(wxml|js|wxss|json)$/.test(entry.name) ? [full] : [];
  });
  const offenders = [];
  for (const file of walk(mp)) {
    const text = fs.readFileSync(file, 'utf8');
    for (const token of ['space-management', 'onManageSpace', ...REMOVED_LABELS]) {
      if (text.includes(token)) offenders.push(path.relative(root, file).replace(/\\/g, '/') + ' -> ' + token);
    }
  }
  assert.deepEqual(offenders, [], 'M5 the removed Us management entry must not survive anywhere: ' + offenders.join(', '));
  // Contextual links to the management page are allowed to stay, but they must be recorded, and
  // Us must not be one of them (the management path starts from Me).
  const links = walk(mp).filter(file => fs.readFileSync(file, 'utf8').includes('/pages/space/index'));
  assert(!links.some(file => /pages[\\/]us[\\/]/.test(file)), 'M5 Us must not link into the management page');
  console.log('     contextual links to /pages/space/index: ' + links.map(f => path.relative(root, f).replace(/\\/g, '/')).join(', '));
});

// ---------------------------------------------------------------- L1
test('L1 EN and ZH resolve for every string this round moved or removed', () => {
  const catalog = require(path.join(mp, 'utils/locales'));
  const keys = catalog.map(r => r.key);
  assert.equal(new Set(keys).size, keys.length, 'L1 the catalogue must not carry duplicate keys');
  for (const row of catalog) assert(row.en && row.zh, 'L1 both locales must be present for ' + row.key);
  // The removed Us labels were literals, so nothing was orphaned by removing them: no catalogue
  // row may hold them, and no file may still render them.
  const orphan = catalog.filter(r => REMOVED_LABELS.includes(r.en) || REMOVED_LABELS.includes(r.zh));
  assert.deepEqual(orphan.map(r => r.key), [], 'L1 the removed Us label must not survive as a catalogue row');
  // The catalogue source of truth stays the TSV, and the generated file must match it.
  assert(exists('tools/lib/locale-translations.tsv'), 'L1 the canonical locale source must exist');
  const generated = readMp('utils/locales.js');
  for (const key of keys) assert(generated.includes('"' + key + '"'), 'L1 the generated catalogue must contain ' + key);
});

// ---------------------------------------------------------------- V1
test('V1 PEARL and DUSK stay structurally unchanged on Us and Me', () => {
  // No theme branch was added or removed by this round: the page-level theme bindings are intact.
  for (const [page, wxml] of [['Us', usWxml], ['Me', meWxml]]) {
    assert(wxml.includes("{{dusk ? 'dusk' : ''}}"), 'V1 ' + page + ' must keep its theme binding');
    assert(wxml.includes("{{quiet ? 'quiet' : ''}}"), 'V1 ' + page + ' must keep its reduce-motion binding');
  }
  // The existing dark-theme rules that this round did not touch are still there.
  assert(usWxss.includes('.dusk .avatar-blank'), 'V1 the Us dark-theme avatar rule must stay');
  assert(readMp('pages/me/index.wxss').includes('.dusk .profile-menu-row'), 'V1 the Me dark-theme menu rule must stay');
  // The frozen surfaces the user listed must be untouched in structure.
  for (const token of ['couple-avatars', 'couple-heart', 'together-days', 'journey-stats', 'journey-latest', 'shared-gallery', 'us-settings']) assert(usWxml.includes(token), 'V1 the Us identity/journey surface must stay: ' + token);
  assert(!usWxml.includes('wx:if="{{dusk'), 'V1 the removed block must not be re-expressed as a theme branch');
  // Me keeps profile -> stats -> one generated secondary menu; no new hero surface was added.
  assert(meWxml.includes('profile-heading') && meWxml.includes('profile-stats-card') && meWxml.includes('class="profile-menu glass content-card"'), 'V1 the Me structure must stay profile -> stats -> menu');
  assert.equal((meWxml.match(/wx:for=/g) || []).length, 1, 'V1 the Me page must keep exactly one generated list');
  assert(meWxml.indexOf('profile-heading') < meWxml.indexOf('profile-stats-card') && meWxml.indexOf('profile-stats-card') < meWxml.indexOf('profile-menu'), 'V1 the Me order must not change');
  assert(!/space-management|onManageSpace/.test(meWxml + meJs), 'V1 the removed Us entry must not reappear on the Me main page');
});

console.log('\n' + count + '/' + count + ' Us/Me information-architecture checks passed. PEARL/DUSK and native layout confirmation remain separate evidence.');
