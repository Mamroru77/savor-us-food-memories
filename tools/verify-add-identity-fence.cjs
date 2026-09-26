// Task A regression: the Add draft projection must survive the identity verification
// window. Real identity.js / store.js / i18n.js / pages/add/index.js; only the native
// layer (storage + cloud transport) is simulated, with a controllable round-trip delay
// so the locked window is deterministic. No production behaviour is stubbed.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const mp = path.join(root, 'miniprogram');
const { partitionKey } = require(path.join(mp, 'utils/identityPartitions'));
let passed = 0;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const clone = value => JSON.parse(JSON.stringify(value));
const snap = draft => (draft ? { restaurant: draft.restaurant, notesLen: String(draft.notes || '').length, photos: (draft.photos || []).length } : null);
const isEmptyDraft = view => !!view && view.restaurant === '' && view.notesLen === 0 && view.photos === 0;

function harness(options = {}) {
  const disk = new Map();
  const modules = new Map();
  const frames = [];
  const modals = [];
  let spec = null;
  let owner = 'a';
  let tag = 'boot';
  const cloudDelay = options.cloudDelay === undefined ? 80 : options.cloudDelay;
  const uid = letter => 'u_' + letter.repeat(48);
  const wx = {
    env: { USER_DATA_PATH: '/user' },
    getStorageSync: key => (disk.has(key) ? disk.get(key) : ''),
    setStorageSync: (key, value) => { disk.set(key, value); },
    removeStorageSync: key => { disk.delete(key); },
    getStorageInfoSync: () => ({ keys: Array.from(disk.keys()) }),
    getWindowInfo: () => ({ statusBarHeight: 20, windowWidth: 375 }),
    getSystemInfoSync: () => ({ platform: 'ios', language: 'en', statusBarHeight: 20, windowWidth: 375 }),
    getAppBaseInfo: () => ({ language: 'en' }),
    getMenuButtonBoundingClientRect: () => ({ top: 44, height: 32, left: 280, width: 87, bottom: 76 }),
    onNetworkStatusChange() {},
    getFileSystemManager: () => ({
      accessSync() {}, mkdirSync() {},
      copyFile(o) { o.success && o.success({}); },
      readFile(o) { o.success && o.success({ data: 'x' }); },
      writeFile(o) { o.success && o.success({}); },
      statSync() { return { size: 4096 }; }, unlinkSync() {}, readdirSync: () => [],
    }),
    getImageInfo(o) { o.success && o.success({ width: 100, height: 100, type: 'jpeg' }); },
    compressImage(o) { o.success && o.success({ tempFilePath: o.src }); },
    setNavigationBarColor() {}, pageScrollTo() {}, previewImage() {},
    showModal(options) { modals.push(options && options.title); },
    switchTab(o) { o && o.success && o.success(); },
    cloud: {
      init() {},
      callFunction({ name }) {
        const result = name === 'account'
          ? { success: true, protocolVersion: 1, userId: uid(owner) }
          : { success: true, identityProtocol: 1, userId: uid(owner), data: [], nextCursor: '' };
        if (!cloudDelay) return Promise.resolve({ result });
        return new Promise(resolve => setTimeout(() => resolve({ result }), cloudDelay));
      },
      async uploadFile(o) { return { fileID: 'cloud://env.bucket/' + o.cloudPath }; },
      async getTempFileURL() { return { fileList: [] }; },
    },
  };
  const logger = { error() {}, warn() {}, log() {} };
  function load(relative) {
    const file = path.resolve(relative);
    if (modules.has(file)) return modules.get(file).exports;
    const module = { exports: {} };
    modules.set(file, module);
    const requireLocal = name => (name.startsWith('.') ? load(path.resolve(path.dirname(file), name + '.js')) : require(name));
    vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
      module, exports: module.exports, require: requireLocal, wx, console: logger, Promise, Date, Math, JSON,
      setTimeout, clearTimeout, setInterval, clearInterval,
      Page: value => { spec = value; }, Component: () => {}, App: () => {},
    }, { filename: file });
    return module.exports;
  }
  const identity = load('miniprogram/utils/identity.js');
  const store = load('miniprogram/utils/store.js');
  function makePage() {
    load('miniprogram/pages/add/index.js');
    return Object.assign({}, spec, {
      data: clone(spec.data),
      setData(patch, cb) {
        Object.assign(this.data, patch);
        frames.push({ tag, keys: Object.keys(patch), draft: snap(this.data.draft), identityReady: this.data.identityReady });
        if (cb) cb();
      },
      getTabBar: () => null,
    });
  }
  // Independent durable read: decodes the chunked partition blob without going through the
  // locked storage boundary, so the assertion cannot be satisfied by a read-side gate.
  function durableDraft() {
    const key = partitionKey(uid(owner));
    const descriptor = disk.get(key);
    if (!descriptor) return null;
    const d = JSON.parse(descriptor);
    let text = '';
    for (let i = 0; i < d.count; i++) text += disk.get(key + ':chunk:' + d.id + ':' + i);
    return JSON.parse(text).partition.draft;
  }
  const diskBytes = () => JSON.stringify(Array.from(disk.entries()).sort());
  return {
    identity, store, makePage, durableDraft, diskBytes, frames, modals,
    setOwner: letter => { owner = letter; },
    tag: value => { tag = value; },
    ready: () => identity.verify(),
    // Exactly what app.js onShow does: start verification, then sync in the background.
    appShow() { const flight = identity.verify(); flight.then(() => store.syncCloud()).catch(() => {}); return flight; },
    settle: () => sleep(cloudDelay * 2 + 80),
    cloudDelay,
  };
}

const seeded = store => Object.assign(store.freshDraft(), { restaurant: 'Test Restaurant', notes: 'existing notes', photos: ['/user/savor-photos/ph-1.jpg'] });

async function resume(h, { owner = 'a' } = {}) {
  h.setOwner(owner);
  await h.ready();
  assert.equal(h.store.saveDraft(seeded(h.store)), true);
  const page = h.makePage();
  page.onLoad();
  page.onShow();
  assert.equal(page.data.draft.restaurant, 'Test Restaurant', 'precondition: the page shows the durable draft');
  page.onHide();
  h.tag('resume');
  const flight = h.appShow();
  page.onShow();
  const during = { draft: clone(page.data.draft), identityReady: page.data.identityReady, bytes: h.diskBytes(), snapshot: h.identity.snapshot() };
  return { page, flight, during };
}

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

for (const delay of [80, 800]) {
  test(`resume with a ${delay}ms verification never projects an empty draft`, async () => {
    const h = harness({ cloudDelay: delay });
    const { page, flight, during } = await resume(h);
    assert.equal(during.snapshot.locked, true, 'precondition: the window really is locked');
    assert.equal(during.identityReady, false, 'precondition: the view is told identity is not ready');
    assert.equal(during.draft.restaurant, 'Test Restaurant', 'the locked window must keep the projection the user was looking at');
    assert.equal(during.draft.photos.length, 1);
    assert.equal(during.draft.notes.length, 'existing notes'.length);
    await flight; await h.settle();
    const empty = h.frames.filter(f => f.tag === 'resume' && isEmptyDraft(f.draft));
    assert.deepEqual(empty, [], 'a fabricated freshDraft was projected during the resume window: ' + JSON.stringify(empty));
    assert.equal(page.data.draft.restaurant, 'Test Restaurant');
    assert.equal(page.data.draft.photos.length, 1);
    assert.equal(page.data.identityReady, true);
  });
}

test('a form mutation inside the window is refused instead of accepted then reverted', async () => {
  const h = harness();
  const { page, flight, during } = await resume(h);
  page.changeDraft('restaurant', 'Typed during verifying');
  assert.equal(page.data.draft.restaurant, 'Test Restaurant', 'the window must not accept a mutation it will silently discard');
  assert.equal(page.data.error, '', 'a refused interaction must not surface a spurious save error');
  assert.equal(during.bytes, h.diskBytes(), 'nothing may be written to durable storage inside the window');
  await flight; await h.settle();
  assert.equal(page.data.draft.restaurant, 'Test Restaurant');
  assert.equal(h.durableDraft().restaurant, 'Test Restaurant');
  assert.equal(h.durableDraft().photos.length, 1, 'the refused mutation must not have disturbed the durable draft');
});

test('the quick clear inside the window is inert and is not silently undone', async () => {
  const h = harness();
  const { page, flight } = await resume(h);
  page.onClearDraft();
  assert.equal(page.data.draft.restaurant, 'Test Restaurant', 'quick clear must not run while the owner is unverified');
  assert.equal(page.data.clearingDraft, false, 'the Check feedback must not play for a clear that did not happen');
  assert.equal(page.data.clearIcon.name, 'eraser');
  await flight; await h.settle();
  assert.equal(page.data.draft.restaurant, 'Test Restaurant', 'the draft must never come back after a clear the user saw succeed');
  assert.equal(h.durableDraft().restaurant, 'Test Restaurant');
});

test('the same owner unlocking keeps exactly the draft that was on screen', async () => {
  const h = harness();
  const { page, flight } = await resume(h);
  await flight; await h.settle();
  assert.deepEqual(snap(page.data.draft), { restaurant: 'Test Restaurant', notesLen: 'existing notes'.length, photos: 1 });
  assert.equal(h.durableDraft().restaurant, 'Test Restaurant');
});

test('a different owner unlocking switches the projection and never leaks the old one', async () => {
  const h = harness();
  h.setOwner('a');
  await h.ready();
  assert.equal(h.store.saveDraft(seeded(h.store)), true);
  h.setOwner('b');
  await h.ready();
  assert.equal(h.store.saveDraft(Object.assign(h.store.freshDraft(), { restaurant: 'B Restaurant', notes: 'B notes', photos: ['/user/savor-photos/ph-9.jpg'] })), true);
  h.setOwner('a');
  await h.ready();
  const page = h.makePage();
  page.onLoad(); page.onShow();
  assert.equal(page.data.draft.restaurant, 'Test Restaurant');
  page.onHide();
  h.tag('switch');
  h.setOwner('b');
  const flight = h.appShow();
  page.onShow();
  assert.equal(page.data.draft.restaurant, 'Test Restaurant', 'the short unverified window keeps the projection, it does not fabricate an empty one');
  await flight; await h.settle();
  assert.equal(page.data.draft.restaurant, 'B Restaurant', 'the verified owner switch must replace the projection');
  assert.equal(page.data.draft.photos.length, 1);
  const empty = h.frames.filter(f => f.tag === 'switch' && isEmptyDraft(f.draft));
  assert.deepEqual(empty, [], 'the switch projected a fabricated freshDraft: ' + JSON.stringify(empty));
  const leaked = h.frames.filter(f => f.tag === 'switch' && f.draft && f.draft.restaurant === 'Test Restaurant' && f.identityReady === true);
  assert.deepEqual(leaked, [], 'owner A content must never survive into a verified frame: ' + JSON.stringify(leaked));
  const kept = h.frames.filter(f => f.tag === 'switch' && f.draft && f.draft.restaurant === 'Test Restaurant');
  assert(kept.length > 0, 'the unverified window keeps the projection instead of blanking it');
});

test('a cold launch shows the verification state and loads only the verified owner draft', async () => {
  const h = harness();
  h.setOwner('a');
  await h.ready();
  assert.equal(h.store.saveDraft(seeded(h.store)), true);
  h.identity.invalidate();            // a fresh process: no verified owner yet
  assert.equal(h.identity.snapshot().locked, true);
  h.tag('cold');
  const page = h.makePage();
  page.onLoad(); page.onShow();
  assert.equal(page.data.identityReady, false, 'a cold launch must show the verification state');
  assert.notEqual(page.data.draft.restaurant, 'Test Restaurant', 'an unverified cold launch must not expose another session draft');
  const flight = h.appShow();
  await flight; await h.settle();
  assert.equal(page.data.identityReady, true);
  assert.equal(page.data.draft.restaurant, 'Test Restaurant', 'the verified owner draft loads once verification lands');
});

// ---------------------------------------------------------------------------
// The 万能导入 (universal import) editor is in-memory page state, not a durable draft.
// The same invariant applies: a transient locked window is not a reason to discard it.
// ---------------------------------------------------------------------------
const IMPORT_SEED = {
  importOpen: true,
  importText: 'share text for the shop',
  importCity: 'Taipei',
  importCandidate: { name: 'Test Shop', diningTypes: ['Dine-in'], categorySuggestion: {} },
  importMatches: [{ id: 'poi-1', name: 'Test Shop', address: 'No.1' }],
  importSearchDone: true,
  importLookupError: '',
};
const IMPORT_PRESERVED = { importOpen: true, importText: 'share text for the shop', candidate: 'Test Shop', matches: 1, city: 'Taipei' };
const IMPORT_CLEARED = { importOpen: false, importText: '', candidate: null, matches: 0, city: '' };
const importView = page => ({
  importOpen: page.data.importOpen,
  importText: page.data.importText,
  candidate: page.data.importCandidate && page.data.importCandidate.name,
  matches: (page.data.importMatches || []).length,
  city: page.data.importCity,
});

async function importResume(h, { owner = 'a', resumeAs = owner } = {}) {
  h.setOwner(owner);
  await h.ready();
  assert.equal(h.store.saveDraft(seeded(h.store)), true);
  const page = h.makePage();
  page.onLoad();
  page.onShow();
  page.setData(clone(IMPORT_SEED));
  assert.deepEqual(importView(page), IMPORT_PRESERVED, 'precondition: the import editor is open with content');
  page.onHide();
  h.tag('resume');
  h.setOwner(resumeAs);
  const flight = h.appShow();
  page.onShow();
  const during = { view: importView(page), bytes: h.diskBytes() };
  return { page, flight, during };
}

test('an open import editor survives a same-owner resume', async () => {
  const h = harness();
  const { page, flight, during } = await importResume(h);
  assert.equal(during.view.importOpen, true, 'the verification window must not close the import panel');
  assert.equal(during.view.importText, 'share text for the shop', 'the pasted share text must survive the window');
  assert.equal(during.view.candidate, 'Test Shop', 'the parsed candidate must survive the window');
  assert.equal(during.view.matches, 1, 'the lookup results must survive the window');
  await flight; await h.settle();
  assert.deepEqual(importView(page), IMPORT_PRESERVED, 'a same-owner resume keeps the import editor');
});

test('a confirmed owner change clears the previous import editor', async () => {
  const h = harness();
  const { page, flight, during } = await importResume(h, { owner: 'a', resumeAs: 'b' });
  assert.deepEqual(during.view, IMPORT_PRESERVED, 'the unverified window must not fabricate a clear');
  await flight; await h.settle();
  assert.deepEqual(importView(page), IMPORT_CLEARED, 'a confirmed owner change must discard the previous owner import editor');
});

test('import actions are inert inside the verification window', async () => {
  const h = harness();
  const { page, flight, during } = await importResume(h);
  const draftBefore = JSON.stringify(page.data.draft);
  const candidateBefore = page.data.importCandidate;
  const attempts = [];
  const attempt = (label, fn) => { try { fn(); attempts.push(label + ':ok'); } catch (e) { attempts.push(label + ':threw ' + (e && (e.code || e.message))); } };
  attempt('parse', () => page.onImportParse());
  attempt('apply', () => page.onImportApply());
  attempt('toggle', () => page.onCloudSearchToggle({ detail: { value: true } }));
  attempt('cancel', () => page.onImportCancel());
  assert.deepEqual(attempts, ['parse:ok', 'apply:ok', 'toggle:ok', 'cancel:ok'], 'an import action must be inert inside the window, never throw');
  assert.equal(page.data.importCandidate, candidateBefore, 'no import action may replace the candidate inside the window');
  assert.deepEqual(importView(page), IMPORT_PRESERVED, 'no import action may mutate the editor inside the window');
  assert.equal(JSON.stringify(page.data.draft), draftBefore, 'no import action may reach the draft inside the window');
  assert.deepEqual(h.modals, [], 'no confirmation dialog may open inside the window');
  assert.equal(during.bytes, h.diskBytes(), 'no import action may write to storage inside the window');
  await flight; await h.settle();
  assert.deepEqual(importView(page), IMPORT_PRESERVED);
});

test('a cold launch starts with a closed, empty import editor', async () => {
  const h = harness();
  h.setOwner('a');
  await h.ready();
  assert.equal(h.store.saveDraft(seeded(h.store)), true);
  h.identity.invalidate();
  const page = h.makePage();
  page.onLoad();
  page.onShow();
  assert.equal(page.data.importOpen, false);
  assert.equal(page.data.importText, '');
  assert.equal(page.data.importCandidate, null);
  assert.equal((page.data.importMatches || []).length, 0);
});

// A suite that never reaches its summary (a pending await that never settles, so the event loop
// drains) would otherwise exit 0 and look green inside verify:all. Fail loudly instead.
let completed = false;
process.on('beforeExit', () => { if (!completed) { console.error('verify-add-identity-fence did not reach its summary: a pending await never settled'); process.exitCode = 1; } });

(async () => {
  for (const entry of tests) {
    try { await entry.fn(); passed++; console.log('PASS ' + entry.name); }
    catch (error) { console.error('FAIL ' + entry.name); console.error('  ' + (error && error.message || error)); process.exitCode = 1; }
  }
  completed = true;
  console.log(passed + '/' + tests.length + ' Add identity-fence checks passed.');
})();
