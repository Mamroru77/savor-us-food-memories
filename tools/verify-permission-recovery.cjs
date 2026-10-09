#!/usr/bin/env node
// Permission-recovery semantics. Source/behaviour level only; the physical-device pass is separate.
//
// The contract under test:
//   1. a cancel is never treated as a denial and never offers the settings route
//   2. a transient failure keeps the existing retry copy and offers nothing
//   3. only an EXPLICIT platform denial offers the settings route
//   4. wx.openSetting is reachable from exactly one user-tap handler, never automatically
//   5. a permission error never clears the draft
//   6. the recovery copy exists in EN and ZH, and no Chinese leaks into the English path
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const mp = path.join(root, 'miniprogram');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

const LOCATION_DENIED = 'Location permission is needed to choose a restaurant location.';
const LOCATION_GENERIC = 'Could not open Tencent Maps. Check location permission and the mini program privacy settings, then retry.';
const PHOTO_DENIED = 'Photo permission is needed to add a photo.';
const OPEN_SETTINGS = 'Open Settings';

function hasCJK(s) { return /[\u4e00-\u9fff]/.test(String(s)); }

// ---- 6. the recovery copy resolves in both locales, and its English form is English.
const catalog = require(path.join(mp, 'utils/locales'));
for (const en of [LOCATION_DENIED, PHOTO_DENIED, OPEN_SETTINGS]) {
  const row = catalog.find(r => r.en === en);
  assert(row, 'missing catalog row: ' + en);
  assert(!hasCJK(row.en), 'English copy must not contain CJK: ' + en);
  assert(hasCJK(row.zh), 'Chinese copy must exist for: ' + en);
}
assert(!hasCJK(catalog.find(r => r.en === LOCATION_GENERIC).en), 'the generic location failure copy must stay English');

// ---- the recovery helper: only an explicit platform negative is a denial.
function loadRecovery(scopes, systemAuthorization) {
  const file = path.join(mp, 'utils/permissionRecovery.js');
  delete require.cache[require.resolve(file)];
  const sandbox = {
    module: { exports: {} },
    require,
    wx: {
      getSetting: o => o.success({ authSetting: scopes || {} }),
      getAppAuthorizeSetting: () => systemAuthorization || {},
      openSetting: o => o.success({ authSetting: { 'scope.userLocation': true } }),
    },
  };
  vm.runInNewContext(read('miniprogram/utils/permissionRecovery.js'), sandbox);
  return sandbox.module.exports;
}
const cases = [
  ['scope denied', { 'scope.userLocation': false }, {}, true],
  ['scope granted', { 'scope.userLocation': true }, {}, false],
  ['scope never asked', {}, {}, false],
  ['system denied', {}, { locationAuthorized: 'denied' }, true],
  ['system not determined', {}, { locationAuthorized: 'not determined' }, false],
  ['system authorized', {}, { locationAuthorized: 'authorized' }, false],
];
(async () => {
  for (const [label, scopes, system, expected] of cases) {
    const recovery = loadRecovery(scopes, system);
    assert.equal(await recovery.denied('location'), expected, 'location denial classification: ' + label);
  }
  assert.equal(await loadRecovery({ 'scope.camera': false }, {}).denied('photo'), true, 'photo denial via scope');
  assert.equal(await loadRecovery({}, { albumAuthorized: 'denied' }).denied('photo'), true, 'photo denial via album system permission');
  assert.equal(await loadRecovery({ 'scope.camera': true }, { cameraAuthorized: 'authorized' }).denied('photo'), false, 'photo allowed is not a denial');

  // ---- 1/2/3. the location chooser classifies cancel, transient failure and denial differently.
  function loadLocations(chooseLocationFail, scopes) {
    const file = path.join(mp, 'utils/locations.js');
    delete require.cache[require.resolve(file)];
    const recoveryFile = path.join(mp, 'utils/permissionRecovery.js');
    delete require.cache[require.resolve(recoveryFile)];
    const sandbox = {
      module: { exports: {} },
      require: name => {
        if (name === './permissionRecovery') return loadRecovery(scopes, {});
        if (name === './i18n') return { t: v => { const r = catalog.find(x => x.en === v || x.zh === v); return r ? r.en : v; } };
        return require(name);
      },
      wx: { chooseLocation: o => chooseLocationFail(o), getSystemInfoSync: () => ({}) },
      Promise, Error, Object, Array, String, Number, console,
    };
    vm.runInNewContext(read('miniprogram/utils/locations.js'), sandbox);
    return sandbox.module.exports;
  }
  const cancel = await loadLocations(o => o.fail({ errMsg: 'chooseLocation:fail cancel' }), { 'scope.userLocation': false })
    .choose(null).then(() => null, e => e);
  assert.equal(cancel.cancelled, true, 'a cancel must be classified as cancelled');
  assert(!cancel.permissionDenied, 'a cancel must NEVER be treated as a denial even when the scope is denied');
  assert.equal(cancel.message, 'Location selection cancelled.', 'a cancel keeps its quiet message');

  const denied = await loadLocations(o => o.fail({ errMsg: 'chooseLocation:fail auth deny' }), { 'scope.userLocation': false })
    .choose(null).then(() => null, e => e);
  assert.equal(denied.cancelled, false, 'a denial is not a cancel');
  assert.equal(denied.permissionDenied, true, 'an explicit denial must be flagged');
  assert.equal(denied.message, LOCATION_DENIED, 'a denial must use the recovery copy');

  const transient = await loadLocations(o => o.fail({ errMsg: 'chooseLocation:fail internal error' }), { 'scope.userLocation': true })
    .choose(null).then(() => null, e => e);
  assert.equal(transient.permissionDenied, false, 'a transient failure is not a denial');
  assert.equal(transient.message, LOCATION_GENERIC, 'a transient failure keeps the existing retry copy');

  const never = await loadLocations(o => o.fail({ errMsg: 'chooseLocation:fail internal error' }), {})
    .choose(null).then(() => null, e => e);
  assert.equal(never.permissionDenied, false, 'a never-asked scope is not a denial');

  // ---- 4. wx.openSetting is reachable from exactly one tap handler in the Add page.
  const addJs = read('miniprogram/pages/add/index.js');
  const addWxml = read('miniprogram/pages/add/index.wxml');
  const openSettingCalls = [...addJs.matchAll(/openSettings\s*\(/g)].map(m => m.index);
  assert.equal(openSettingCalls.length, 1, 'the Add page must call openSettings from exactly one place');
  const handlerAt = addJs.indexOf('onOpenSettings(');
  assert(handlerAt >= 0 && openSettingCalls[0] > handlerAt, 'that one call must live inside onOpenSettings');
  const handler = addJs.slice(handlerAt, addJs.indexOf('\n  },', handlerAt));
  assert(/permissionRecovery/.test(handler), 'onOpenSettings must refuse to run without a denial in state');
  assert(/identityFence/.test(handler), 'onOpenSettings must respect the identity fence');
  assert.equal((addWxml.match(/bindtap="onOpenSettings"/g) || []).length, 1, 'exactly one tap target may open settings');
  assert(/wx:if="\{\{permissionRecovery\}\}"/.test(addWxml), 'the recovery action must be gated by the denial state');
  assert(!/openSetting\s*\(/.test(addWxml), 'WXML must never invoke the platform API; it may only bind the tap handler');

  // ---- 5. a permission error never clears the draft.
  for (const m of addJs.matchAll(/setData\(\{[^}]*permissionRecovery[^}]*\}/g)) {
    assert(!/\bdraft\s*:/.test(m[0]), 'a permission-recovery setData must not touch the draft: ' + m[0].slice(0, 90));
  }
  assert(/draft: store\.freshDraft\(\)/.test(addJs), 'the draft is only replaced by an explicit reset, never by an error path');

  // ---- 6. the location module carries no Chinese COPY. Region names (北京市/中国台湾/香港…) are data,
  // not copy, so the contract is narrower than "no CJK anywhere": no CJK literal may be handed to
  // the translator, which is what made the English path depend on a Chinese lookup key.
  const locationSource = read('miniprogram/utils/locations.js');
  const cjkLookups = [...locationSource.matchAll(/i18n\.t\(\s*'([^']*)'/g)].filter(m => hasCJK(m[1]));
  assert.equal(cjkLookups.length, 0, 'no Chinese literal may be passed to i18n.t: ' + cjkLookups.map(m => m[1]).join(' | '));

  console.log('PASS cancel / transient failure / explicit denial are classified distinctly');
  console.log('PASS wx.openSetting is reachable only from the one gated tap handler');
  console.log('PASS a permission error never clears the draft');
  console.log('PASS recovery copy exists in EN and ZH; no Chinese in the English path');
  console.log('Permission-recovery checks passed. Physical-device denial/grant acceptance remains separate.');
})().catch(e => { console.error(e); process.exit(1); });
