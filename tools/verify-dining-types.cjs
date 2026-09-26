// Add page dining types: user-managed resident options (custom + hidden builtins).
// Real identity / store / data / settingsRepository / restaurantCategory / Add page;
// only the native layer is simulated. The disk Map is the only state that survives a
// "process restart", so two harnesses sharing one disk model a real relaunch.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const mp = path.join(root, 'miniprogram');
const BUILTINS = ['火锅', '自助餐', '烧烤', '小吃', '面馆', '咖啡馆', '甜品', '酒馆'];
let passed = 0;

function harness(setup = {}) {
  const disk = setup.disk || new Map();
  const modules = new Map();
  let spec = null;
  let owner = setup.owner || 'a';
  const uid = letter => 'u_' + letter.repeat(48);
  const wx = {
    env: { USER_DATA_PATH: '/user' },
    getStorageSync: key => (disk.has(key) ? disk.get(key) : ''),
    setStorageSync: (key, value) => { disk.set(key, value); },
    removeStorageSync: key => { disk.delete(key); },
    getWindowInfo: () => ({ statusBarHeight: 20, windowWidth: 375 }),
    getSystemInfoSync: () => ({ platform: 'ios', language: 'en' }),
    getAppBaseInfo: () => ({ language: 'en' }),
    getMenuButtonBoundingClientRect: () => ({ top: 44, height: 32, left: 280, width: 87 }),
    onNetworkStatusChange() {},
    getFileSystemManager: () => ({ accessSync() {}, mkdirSync() {}, copyFile(o) { o.success && o.success({}); }, readFile(o) { o.success && o.success({ data: 'x' }); }, writeFile(o) { o.success && o.success({}); }, statSync() { return { size: 4096 }; }, unlinkSync() {} }),
    getImageInfo(o) { o.success && o.success({ width: 1, height: 1, type: 'jpeg' }); },
    compressImage(o) { o.success && o.success({ tempFilePath: o.src }); },
    setNavigationBarColor() {}, pageScrollTo() {}, previewImage() {}, showModal() {},
    switchTab(o) { o && o.success && o.success(); },
    cloud: {
      init() {},
      callFunction({ name }) {
        const result = name === 'account'
          ? { success: true, protocolVersion: 1, userId: uid(owner) }
          : { success: true, identityProtocol: 1, userId: uid(owner), data: [], nextCursor: '' };
        return Promise.resolve({ result });
      },
      async uploadFile(o) { return { fileID: 'cloud://env.bucket/' + o.cloudPath }; },
      async getTempFileURL() { return { fileList: [] }; },
    },
  };
  function load(relative) {
    const file = path.resolve(relative);
    if (modules.has(file)) return modules.get(file).exports;
    const module = { exports: {} };
    modules.set(file, module);
    const requireLocal = name => (name.startsWith('.') ? load(path.resolve(path.dirname(file), name + '.js')) : require(name));
    vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
      module, exports: module.exports, require: requireLocal, wx, console: { log() {}, warn() {}, error() {} },
      Promise, Date, Math, JSON, setTimeout, clearTimeout, setInterval, clearInterval,
      Page: value => { spec = value; }, Component: () => {}, App: () => {},
    }, { filename: file });
    return module.exports;
  }
  const identity = load('miniprogram/utils/identity.js');
  const store = load('miniprogram/utils/store.js');
  const data = load('miniprogram/utils/data.js');
  const settingsRepository = load('miniprogram/utils/settingsRepository.js');
  const category = load('miniprogram/utils/restaurantCategory.js');
  const profileRepository = load('miniprogram/utils/profileRepository.js');
  function options() {
    try { return load('miniprogram/utils/diningTypeOptions.js'); }
    catch (error) { return null; }
  }
  function makePage() {
    load('miniprogram/pages/add/index.js');
    return Object.assign({}, spec, {
      data: JSON.parse(JSON.stringify(spec.data)),
      setData(patch, cb) { Object.assign(this.data, patch); if (cb) cb(); },
      getTabBar: () => null,
    });
  }
  return {
    disk, identity, store, data, settingsRepository, category, profileRepository, options, makePage,
    setOwner: letter => { owner = letter; },
    ready: () => identity.verify(),
  };
}
async function mount(h, ownerLetter) {
  if (ownerLetter) h.setOwner(ownerLetter);
  await h.ready();
  const page = h.makePage();
  page.onLoad();
  page.onShow();
  return page;
}
// Cross-realm: copy into host arrays before any deep comparison.
const chipNames = page => Array.from(Array.from(page.data.formTypes || []).map(row => row.name));
const tap = name => ({ currentTarget: { dataset: { value: name } } });
// The realistic path: the user picks the chips, so the draft is both projected and persisted.
const setDraftTypes = (h, page, list) => { page.changeDraft('diningTypes', list); };

const cases = [];
const test = (name, fn) => cases.push({ name, fn });

test('Case 1: a fresh user sees exactly the builtins, in order', async () => {
  const h = harness();
  const page = await mount(h);
  assert.deepEqual(chipNames(page), BUILTINS, 'the default picker must be the canonical taxonomy');
  assert.equal(page.data.diningTypeManagerOpen, false, 'the manager starts closed');
  const opts = h.options();
  assert(opts, 'utils/diningTypeOptions.js must exist');
  assert.deepEqual(Array.from(opts.options({}).visible), BUILTINS);
});

test('Case 2: a custom type survives leaving and re-entering Add', async () => {
  const h = harness();
  const page = await mount(h);
  page.onDiningTypeManager();
  page.onAddDiningType();
  page.onDiningTypeInput({ detail: { value: '日料' } });
  page.onDiningTypeConfirm();
  assert(chipNames(page).includes('日料'), 'the new type becomes a resident option');
  assert.deepEqual(Array.from(h.store.get().settings.customDiningTypes), ['日料']);
  const again = h.makePage();
  again.onLoad();
  again.onShow();
  assert(chipNames(again).includes('日料'), 're-entering Add keeps the custom option');
});

test('Case 3: a custom type survives a process restart (same storage, new instance)', async () => {
  const disk = new Map();
  const first = harness({ disk });
  const page = await mount(first);
  first.store.updateSettings({ customDiningTypes: ['日料'] });
  assert.deepEqual(Array.from(first.store.get().settings.customDiningTypes), ['日料']);
  // A relaunch: brand new module registry, same storage, same owner.
  const second = harness({ disk, owner: 'a' });
  const reloaded = await mount(second);
  assert(chipNames(reloaded).includes('日料'), 'the custom option must be durable across a relaunch');
});

test('Case 4: hiding a builtin removes it from the picker but not from the taxonomy', async () => {
  const h = harness();
  const page = await mount(h);
  page.onDiningTypeManager();
  page.onHideDiningType(tap('酒馆'));
  assert(!chipNames(page).includes('酒馆'), 'a hidden builtin disappears from the picker');
  assert.deepEqual(Array.from(h.store.get().settings.hiddenDiningTypes), ['酒馆']);
  assert.deepEqual(Array.from(h.category.TYPES), BUILTINS, 'restaurantCategory.TYPES must never change');
  assert.equal(chipNames(page).length, BUILTINS.length - 1);
});

test('Case 5: restoring a hidden builtin brings it back', async () => {
  const h = harness();
  const page = await mount(h);
  page.onDiningTypeManager();
  page.onHideDiningType(tap('酒馆'));
  page.onRestoreDiningType(tap('酒馆'));
  assert(chipNames(page).includes('酒馆'), 'a restored builtin returns to the picker');
  assert.deepEqual(Array.from(h.store.get().settings.hiddenDiningTypes), []);
  assert.deepEqual(chipNames(page), BUILTINS);
});

test('Case 6: deleting a custom type removes it from future options', async () => {
  const h = harness();
  const page = await mount(h);
  page.onDiningTypeManager();
  page.onAddDiningType();
  page.onDiningTypeInput({ detail: { value: '日料' } });
  page.onDiningTypeConfirm();
  page.onRemoveDiningType(tap('日料'));
  assert(!chipNames(page).includes('日料'));
  assert.deepEqual(Array.from(h.store.get().settings.customDiningTypes), []);
});

test('Case 7: hiding a builtin never edits the current draft', async () => {
  const h = harness();
  const page = await mount(h);
  setDraftTypes(h, page, ['酒馆']);
  assert.deepEqual(page.data.draft.diningTypes, ['酒馆']);
  page.onDiningTypeManager();
  page.onHideDiningType(tap('酒馆'));
  assert.deepEqual(Array.from(page.data.draft.diningTypes), ['酒馆'], 'the current draft keeps a now-hidden type');
  assert.equal(h.store.loadDraft().diningTypes.join(','), '酒馆', 'and it is still durable');
});

test('Case 8: deleting a custom type never edits the current draft', async () => {
  const h = harness();
  const page = await mount(h);
  page.onDiningTypeManager();
  page.onAddDiningType();
  page.onDiningTypeInput({ detail: { value: '日料' } });
  page.onDiningTypeConfirm();
  setDraftTypes(h, page, ['日料']);
  page.onRemoveDiningType(tap('日料'));
  assert.deepEqual(Array.from(page.data.draft.diningTypes), ['日料'], 'the current draft keeps the removed custom type');
  assert.equal(h.store.loadDraft().diningTypes.join(','), '日料');
});

test('Case 9: historical memories keep their diningTypes and still summarise', async () => {
  const h = harness();
  const page = await mount(h);
  const memory = {
    id: 'hist-1', restaurant: 'Old bar', city: '', country: '', neighborhood: '', notes: '', date: '2026-09-01',
    rating: 0, tags: [], cuisine: '', diningTypes: ['酒馆'], photo: h.data.photos.meal, noPhoto: true, extraPhotos: [],
    coordinates: [0, 0], shared: false, liked: false, saved: false,
  };
  assert(h.data.isMemory(memory), 'a memory with a hidden type must stay valid');
  page.onDiningTypeManager();
  page.onHideDiningType(tap('酒馆'));
  assert.deepEqual(memory.diningTypes, ['酒馆'], 'hiding an option must not rewrite history');
  assert.equal(h.category.summary(memory), '酒馆', 'a hidden builtin is still resolvable');
  assert(h.data.isMemory(memory));
});

test('Case 10: the classifier ignores the hidden list', async () => {
  const h = harness();
  const page = await mount(h);
  page.onDiningTypeManager();
  page.onHideDiningType(tap('火锅'));
  const result = h.category.classify('海底捞火锅');
  assert.deepEqual(Array.from(result.diningTypes), ['火锅'], 'auto-classification must keep using the canonical taxonomy');
});

test('Case 11: adding a builtin name as custom cannot create a duplicate chip', async () => {
  const h = harness();
  const page = await mount(h);
  page.onDiningTypeManager();
  page.onAddDiningType();
  page.onDiningTypeInput({ detail: { value: '火锅' } });
  page.onDiningTypeConfirm();
  assert.equal(chipNames(page).filter(name => name === '火锅').length, 1, 'exactly one 火锅 chip');
  assert.deepEqual(Array.from(h.store.get().settings.customDiningTypes || []), [], 'a builtin name is never stored as custom');
  const opts = h.options();
  assert(opts);
  assert.deepEqual(Array.from(opts.normalizeCustom(['火锅', '日料', '日料'])), ['日料'], 'normalisation drops builtin names and duplicates');
});

test('Case 12: a padded custom name is stored trimmed', async () => {
  const h = harness();
  const page = await mount(h);
  page.onDiningTypeManager();
  page.onAddDiningType();
  page.onDiningTypeInput({ detail: { value: '  日料  ' } });
  page.onDiningTypeConfirm();
  assert.deepEqual(Array.from(h.store.get().settings.customDiningTypes), ['日料']);
  assert(chipNames(page).includes('日料'));
  const opts = h.options();
  assert(opts);
  assert.deepEqual(Array.from(opts.normalizeCustom([' 日料 ', '', '   ', 5, null, '西餐', '西餐'])), ['日料', '西餐']);
});

test('Case 13: two owners never see each other resident options', async () => {
  const disk = new Map();
  const first = harness({ disk, owner: 'a' });
  const pageA = await mount(first, 'a');
  first.store.updateSettings({ customDiningTypes: ['日料'], hiddenDiningTypes: ['酒馆'] });
  assert(chipNames(pageA).includes('日料'));
  assert(!chipNames(pageA).includes('酒馆'));
  // Owner B on the same device: nothing leaks, and B may keep its own list.
  const second = harness({ disk, owner: 'b' });
  const pageB = await mount(second, 'b');
  assert(!chipNames(pageB).includes('日料'), 'owner A custom types must not leak to owner B');
  assert(chipNames(pageB).includes('酒馆'), 'owner A hidden list must not leak to owner B');
  assert.deepEqual(Array.from(second.store.get().settings.customDiningTypes || []), []);
  second.store.updateSettings({ customDiningTypes: ['西餐'] });
  // Back to A: A's own settings return.
  const third = harness({ disk, owner: 'a' });
  const pageA2 = await mount(third, 'a');
  assert(chipNames(pageA2).includes('日料'), "owner A's own list is restored");
  assert(!chipNames(pageA2).includes('酒馆'));
  assert(!chipNames(pageA2).includes('西餐'), "owner B's list must not leak back");
});

test('the manager never changes categorySource, only a real pick does', async () => {
  const h = harness();
  const page = await mount(h);
  page.onDiningTypeManager();
  page.onAddDiningType();
  page.onDiningTypeInput({ detail: { value: '日料' } });
  page.onDiningTypeConfirm();
  assert.equal(page.data.draft.categorySource, undefined, 'adding a resident option is not a user pick');
  page.onHideDiningType(tap('烧烤'));
  assert.equal(page.data.draft.categorySource, undefined, 'hiding is not a user pick');
  page.onDraftDiningType(tap('日料'));
  assert.equal(page.data.draft.categorySource, 'user-confirmed', 'a real pick still confirms the category');
  assert.deepEqual(Array.from(page.data.draft.diningTypes), ['日料'], 'a custom type can be picked');
});

test('bounds are enforced instead of growing without limit', async () => {
  const h = harness();
  const opts = h.options();
  assert(opts, 'utils/diningTypeOptions.js must exist');
  const many = Array.from({ length: 40 }, (_, i) => '类型' + i);
  assert.equal(Array.from(opts.normalizeCustom(many)).length, opts.MAX_CUSTOM, 'custom list is capped');
  assert(opts.MAX_CUSTOM <= 20, 'the cap must stay small');
  assert.deepEqual(Array.from(opts.normalizeCustom(['x'.repeat(opts.MAX_ITEM_LENGTH + 1)])), [], 'an over-long stored name is ignored, never truncated into a different label');
  assert.equal(Array.from(opts.normalizeCustom(['x'.repeat(opts.MAX_ITEM_LENGTH)]))[0].length, opts.MAX_ITEM_LENGTH, 'a name exactly at the limit is kept whole');
  assert(Array.from(opts.normalizeHidden(['酒馆', '酒馆', '不存在', '', null])).length === 1, 'hidden only keeps real builtins, deduped');
  assert.deepEqual(Array.from(opts.normalizeHidden(['酒馆', '不存在', '酒馆'])), ['酒馆']);
});

test('the shipped Add page keeps the identity fence and the picker wiring', () => {
  const wxml = fs.readFileSync(path.join(mp, 'pages/add/index.wxml'), 'utf8');
  assert(wxml.includes('onDiningTypeManager'), 'the + chip must be wired to the manager');
  assert(wxml.includes('diningTypeManagerOpen'), 'the manager panel must be bound');
  assert(wxml.includes('disabled="{{saving || uploading || !identityReady}}"'), 'any new input keeps the identity fence');
  assert(!/[▾▴▼▲×‹›★☆✓✔✕✖]/u.test(wxml), 'no character icons');
});

// ---------------------------------------------------------------------------
// summary() must resolve stored diningTypes, not only the built-in taxonomy.
// ---------------------------------------------------------------------------
test('summary Case 1: a custom-only memory is no longer blank', async () => {
  const h = harness();
  assert.equal(h.category.summary({ cuisine: '', diningTypes: ['日料'] }), '日料');
});

test('summary Case 2: cuisine and a custom dining type join with the existing separator', async () => {
  const h = harness();
  assert.equal(h.category.summary({ cuisine: '日本料理', diningTypes: ['日料'] }), '日本料理 · 日料');
});

test('summary Case 3: builtin and custom types both appear, in stored order', async () => {
  const h = harness();
  assert.equal(h.category.summary({ cuisine: '', diningTypes: ['火锅', '日料'] }), '火锅 · 日料');
});

test('summary E: malformed stored values are ignored, never coerced or truncated', async () => {
  const h = harness();
  const max = h.options().MAX_ITEM_LENGTH;
  const value = h.category.summary({ cuisine: '', diningTypes: [null, 123, '', '   ', 'x'.repeat(max + 1), {}, [], undefined, true] });
  assert.equal(value, '', 'nothing malformed may become a label');
});

test('summary F: a value exactly at the limit is kept whole', async () => {
  const h = harness();
  const max = h.options().MAX_ITEM_LENGTH;
  const exact = 'x'.repeat(max);
  assert.equal(h.category.summary({ cuisine: '', diningTypes: [exact] }), exact, 'an in-limit value must not be truncated');
});

test('summary G: a padded stored value is trimmed', async () => {
  const h = harness();
  assert.equal(h.category.summary({ cuisine: '', diningTypes: ['  日料  '] }), '日料');
});

test('summary H: duplicates after trimming collapse to one label', async () => {
  const h = harness();
  assert.equal(h.category.summary({ cuisine: '', diningTypes: ['日料', ' 日料 ', '日料'] }), '日料');
});

test('summary dedupes cuisine against a stored type and repeats', async () => {
  const h = harness();
  assert.equal(h.category.summary({ cuisine: '日料', diningTypes: ['日料', '日料', '火锅'] }), '日料 · 火锅');
  assert.equal(h.category.summary({ cuisine: '', diningTypes: [] }), '');
  assert.equal(h.category.summary({}), '');
});

test('a hidden builtin still summarises from history and summary never reads hiddenDiningTypes', async () => {
  const h = harness();
  const page = await mount(h);
  const memory = { cuisine: '', diningTypes: ['酒馆'] };
  page.onDiningTypeManager();
  page.onHideDiningType(tap('酒馆'));
  assert.deepEqual(Array.from(h.store.get().settings.hiddenDiningTypes), ['酒馆']);
  assert.equal(h.category.summary(memory), '酒馆', 'hiding an option must never erase it from history or display');
  const source = fs.readFileSync(path.join(mp, 'utils/restaurantCategory.js'), 'utf8');
  assert(!/hiddenDiningTypes|customDiningTypes|settingsRepository|require\(\.\/store/.test(source),
    'summary must not consult the settings layer');
});

test('a deleted custom type still summarises from history', async () => {
  const h = harness();
  const page = await mount(h);
  page.onDiningTypeManager();
  page.onAddDiningType();
  page.onDiningTypeInput({ detail: { value: '日料' } });
  page.onDiningTypeConfirm();
  const memory = { cuisine: '', diningTypes: ['日料'] };
  assert.equal(h.category.summary(memory), '日料');
  page.onRemoveDiningType(tap('日料'));
  assert.deepEqual(Array.from(h.store.get().settings.customDiningTypes), []);
  assert(!chipNames(page).includes('日料'), 'the future picker no longer offers it');
  assert.equal(h.category.summary(memory), '日料', 'the stored memory keeps rendering it');
});

test('a cloud preference apply keeps the local-only dining settings', async () => {
  const h = harness();
  const page = await mount(h);
  page.onDiningTypeManager();
  page.onAddDiningType();
  page.onDiningTypeInput({ detail: { value: '日料' } });
  page.onDiningTypeConfirm();
  page.onHideDiningType(tap('酒馆'));
  const token = h.identity.lease();
  h.store.applyCloudProfile(
    { name: 'Remote Name', bio: 'Remote bio' },
    { dietary: 'Vegan', cuisines: ['French'], privateByDefault: true, showLocations: false, reminders: false },
    token,
  );
  const settings = h.store.get().settings;
  assert.equal(settings.dietary, 'Vegan', 'synced preferences still apply');
  assert.deepEqual(Array.from(settings.cuisines), ['French']);
  assert.deepEqual(Array.from(settings.customDiningTypes), ['日料'], 'local-only custom types survive a cloud apply');
  assert.deepEqual(Array.from(settings.hiddenDiningTypes), ['酒馆'], 'local-only hidden list survives a cloud apply');
});

test('the classifier and the canonical taxonomy are unchanged', async () => {
  const h = harness();
  assert.deepEqual(Array.from(h.category.classify('海底捞火锅').diningTypes), ['火锅']);
  assert.deepEqual(Array.from(h.category.TYPES), BUILTINS);
  assert(!Array.from(h.category.TYPES).includes('日料'), 'a custom name never enters the taxonomy');
  assert.deepEqual(Array.from(h.category.classify('日料店').diningTypes), [], 'the classifier gains no custom rules');
});

(async () => {
  for (const entry of cases) {
    try { await entry.fn(); passed++; console.log('PASS ' + entry.name); }
    catch (error) { console.error('FAIL ' + entry.name); console.error('  ' + (error && error.message || error)); process.exitCode = 1; }
  }
  console.log(passed + '/' + cases.length + ' dining-type option checks passed.');
})();
