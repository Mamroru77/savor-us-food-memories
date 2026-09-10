/**
 * Runtime smoke test for the mini program data layer, executed in Node with a
 * minimal `wx` stub: node tools/smoke-store.cjs
 * Covers migration of corrupted storage, web-backup import, memory CRUD,
 * settings/profile updates and draft-safe photo handling.
 */
const path = require('path');
const assert = require('assert');

const storage = {};
const files = {};
global.wx = {
  env: { USER_DATA_PATH: '/usr' },
  getStorageSync: (key) => (key in storage ? storage[key] : ''),
  setStorageSync: (key, value) => { storage[key] = value; },
  showToast: () => {},
  canIUse: () => false,
  getFileSystemManager: () => ({
    accessSync: (p) => { if (!files[p]) throw new Error('missing'); },
    mkdirSync: (p) => { files[p] = true; },
    copyFileSync: (from, to) => { files[to] = true; },
    writeFileSync: (p) => { files[p] = true; },
    unlinkSync: (p) => { delete files[p]; },
    readdirSync: () => [],
  }),
};

// The repository root is an ES module package, so mini program CommonJS files are
// loaded through a tiny loader that mirrors the WeChat runtime.
const fs = require('fs');
const root = path.join(__dirname, '..', 'miniprogram', 'utils');
const cache = {};
function load(name, fresh) {
  if (!fresh && cache[name]) return cache[name].exports;
  const file = path.join(root, name);
  const module = { exports: {} };
  cache[name] = module;
  const factory = new Function('module', 'exports', 'require', fs.readFileSync(file, 'utf8'));
  factory(module, module.exports, (request) => load(path.basename(request).replace(/\.js$/, '') + '.js'));
  return module.exports;
}
const data = load('data.js');
const store = load('store.js');

// 1. Fresh install falls back to the sample diary.
let state = store.getState();
assert.strictEqual(state.memories.length, data.initialMemories.length, 'sample diary should load');
assert.strictEqual(state.settings.theme, 'pearl');

// 2. Broken records are repaired or skipped instead of wiping the diary.
const broken = data.normalizeMemory({ id: 'x', restaurant: ' Test ', rating: 9, date: 'nope', tags: 'no' });
assert.strictEqual(broken.restaurant, 'Test');
assert.strictEqual(broken.rating, 5);
assert.ok(data.isValidDate(broken.date));
assert.deepStrictEqual(broken.tags, []);
assert.strictEqual(broken.coordinates.length, 2);
assert.strictEqual(data.normalizeMemory({ id: 'y' }), null, 'a nameless record is not a memory');
assert.ok(data.isMemory(broken), 'a normalised memory passes strict validation');

// 3. CRUD + persistence.
const created = data.normalizeMemory({
  id: 'smoke-1', restaurant: 'Smoke Cafe', city: 'Paris', country: 'France',
  date: '2025-01-02', rating: 4, tags: ['Coffee'], photo: '/images/coffee.jpg',
});
store.addMemory(created);
assert.strictEqual(store.getState().memories[0].id, 'smoke-1');
store.updateMemory('smoke-1', { liked: true, shared: true });
assert.strictEqual(store.getState().memories[0].liked, true);
assert.ok(storage['savor-diary-v1'], 'state is persisted');

// 4. Import skips duplicates, accepts web backups (https photos) and rejects junk.
const added = store.importMemories([
  created,
  { id: 'web-1', restaurant: 'Web Bistro', city: 'Tokyo', country: 'Japan', neighborhood: '', notes: '', date: '2025-02-03', rating: 5, tags: ['Dinner'], photo: 'https://images.pexels.com/photos/1/x.jpeg', extraPhotos: [], coordinates: [35.6, 139.7], shared: false, liked: false, saved: false },
  { nonsense: true },
]);
assert.strictEqual(added, 1, 'only the new valid memory is imported');
assert.ok(store.getState().memories.some((item) => item.id === 'web-1'));

// 5. Delete removes the record (packaged photos are never unlinked).
store.deleteMemory('smoke-1');
assert.ok(!store.getState().memories.some((item) => item.id === 'smoke-1'));

// 6. Profile, settings and feedback.
store.updateProfile({ name: 'Ada' });
store.updateSettings({ theme: 'dusk' });
store.saveFeedback('lovely');
state = store.getState();
assert.strictEqual(state.profile.name, 'Ada');
assert.strictEqual(store.themeOf(state).dusk, true);
assert.strictEqual(state.feedback.length, 1);

// 7. Reloading corrupted storage keeps what is salvageable.
storage['savor-diary-v1'] = { memories: [{ id: 'ok', restaurant: 'Kept', date: '2025-03-04' }, null, 42], profile: null, settings: { theme: 'nope' } };
const reloaded = load('store.js', true).getState();
assert.strictEqual(reloaded.memories.length, 1, 'valid memory survives, junk is dropped');
assert.strictEqual(reloaded.settings.theme, 'pearl', 'invalid theme falls back');
assert.strictEqual(reloaded.profile.name, data.defaultProfile.name);

// 8. Statistics stay finite for an empty diary.
const empty = data.stats({ memories: [], profile: data.defaultProfile, settings: data.defaultSettings });
assert.ok(Number.isFinite(empty.meals) && empty.meals >= 0);

console.info('ok    mini program data layer smoke test passed');
