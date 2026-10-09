// The shared image pipeline — the round's focused cache/prefetch suite.
//
// Every assertion here is a count, not a feeling: how many platform calls, how many downloads,
// how many bytes. The audit that produced this module measured three real duplicate loads, and
// each one has a test that fails against the previous behaviour:
//
//   * `getTempFileURL` was called once PER ROW on every mount (17 calls on open #1, #2 and #3).
//   * the Map marker renderer cached under [source, selected], so one cloud file was downloaded
//     twice (measured: 224 KB twice) just to compose the selected variant.
//   * nothing was prefetched, so the first selection of a marker paid the whole latency.
//
// ⚠️ Synthetic platform only. The byte totals are the synthetic payloads, not device transfers.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const REPO = path.resolve(__dirname, '..');
const MP = path.join(REPO, 'miniprogram');
const BUDGET = 24 * 1024 * 1024;

// ------------------------------------------------------------------ synthetic platform
function makeWorld(options) {
  const o = options || {};
  const world = {
    tempUrlCalls: 0, tempUrlIds: 0, downloads: 0, downloadBytes: 0,
    files: new Map(),            // path -> bytes
    unlinked: [], stored: new Map(), urlOf: new Map(), dims: new Map(),
    now: 1700000000000,
    tempSerial: 0,
  };
  world.statSync = p => {
    if (!world.files.has(p)) { const e = new Error('ENOENT'); throw e; }
    return { size: world.files.get(p), lastModifiedTime: (world.stored.get(p) || {}).at || world.now };
  };
  world.readdirSync = dir => {
    const out = [];
    world.files.forEach((_, p) => { if (p.indexOf(dir + '/') === 0 && p.indexOf('/', dir.length + 1) < 0) out.push(p.slice(dir.length + 1)); });
    return out;
  };
  world.mkdirSync = () => {};
  world.accessSync = p => { if (!world.files.has(p) && p.indexOf('savor-image-cache') < 0) throw new Error('ENOENT'); };
  world.unlinkSync = p => { world.unlinked.push(p); world.files.delete(p); };
  world.copyFileSync = (src, dest) => {
    if (o.copyFails) throw new Error('copyFileSync:fail');
    if (!world.files.has(src)) throw new Error('ENOENT');
    world.files.set(dest, world.files.get(src));
  };
  world.readFileSync = p => { if (!world.files.has(p)) throw new Error('ENOENT'); return 'bytes'; };
  world.writeFileSync = (p, data) => { world.files.set(p, 1000); };

  world.wx = {
    env: { USER_DATA_PATH: '/userdata' },
    getFileSystemManager: () => (o.noFileSystem ? null : world),
    // A 4:3 original at the synthetic payload size, and a re-encode that really is smaller —
    // the point of the derivative is that the stored bytes are not the original's.
    getImageInfo({ src, success, fail }) {
      if (!world.files.has(src)) { fail({ errMsg: 'getImageInfo:fail' }); return; }
      success({ width: 2048, height: 1536, path: src, type: 'jpeg' });
    },
    compressImage({ src, compressedWidth, compressedHeight, success, fail }) {
      if (!world.files.has(src)) { fail({ errMsg: 'compressImage:fail' }); return; }
      world.compresses = (world.compresses || 0) + 1;
      const dest = '/tmp/derivative-' + (++world.tempSerial) + '.jpg';
      world.files.set(dest, 41000);
      success({ tempFilePath: dest });
    },
    cloud: {
      init() {},
      getTempFileURL({ fileList }) {
        world.tempUrlCalls += 1; world.tempUrlIds += fileList.length;
        if (o.resolveFails) return Promise.reject(new Error('getTempFileURL:fail'));
        return Promise.resolve({
          fileList: fileList.map((fileID, i) => ({ fileID, status: 0, tempFileURL: 'https://cdn.test/' + fileID.slice(-8) + '?sig=' + (world.tempUrlCalls * 10 + i) })),
        });
      },
      downloadFile({ fileID, success, fail }) {
        world.downloads += 1;
        if (o.downloadFails) { fail({ errMsg: 'downloadFile:fail' }); return { abort() {} }; }
        const local = '/tmp/download-' + (++world.tempSerial) + '.jpg';
        const bytes = (o.payloadBytes === undefined ? 250000 : o.payloadBytes);
        world.files.set(local, bytes); world.downloadBytes += bytes;
        Promise.resolve().then(() => success({ tempFilePath: local }));
        return { abort() {} };
      },
    },
  };
  return world;
}

// The modules are loaded in a context whose `wx` is the synthetic world, exactly like a device.
function load(world, name) {
  const file = path.join(MP, 'utils', name + '.js');
  const source = fs.readFileSync(file, 'utf8');
  const module = { exports: {} };
  const identityStub = {
    lease: () => 'lease', assertLease() {}, assertBusinessCloudAllowed() {},
    isCurrent: () => true, markOffline() {}, invalidate() {},
  };
  const i18nStub = { t: s => String(s), locale: () => 'en', copy: () => ({}), syncPage() {} };
  const runtimeStub = { cloudEnv: 'test-env', fileScope: '' };
  const dataStub = { isCloudImage: v => typeof v === 'string' && v.indexOf('cloud://') === 0, isSafeImage: v => typeof v === 'string' && v.length > 0, photos: { meal: '/images/le-comptoir.jpg' } };
  const sandbox = {
    module, exports: module.exports,
    require(id) {
      if (id === './identity') return identityStub;
      if (id === './i18n') return i18nStub;
      if (id === './runtimeConfig') return runtimeStub;
      if (id === './data') return dataStub;
      if (id === './imageCache') return load(world, 'imageCache');
      if (id === './cloudRecords') return load(world, 'cloudRecords');
      throw new Error('unexpected require ' + id);
    },
    wx: world.wx, console, Promise, Date: { now: () => world.now, parse: Date.parse }, Math, JSON, Number, Boolean, Object, Array, String, Error, TypeError, Map, Set, RegExp,
    isFinite, parseInt, parseFloat, setTimeout: () => 0, clearTimeout: () => {},
    queueMicrotask: fn => Promise.resolve().then(fn),
  };
  // A fresh module instance per load, so each test starts from an empty cache.
  const vm = require('node:vm');
  vm.runInNewContext(source, sandbox, { filename: file });
  return module.exports;
}
const drain = () => new Promise(resolve => setImmediate(resolve));

const tests = [];
let passed = 0, failed = 0;
function test(name, fn) { tests.push({ name, fn }); }

const A = 'cloud://env.bucket/dining/u_a/memory-a/0.jpg';
const B = 'cloud://env.bucket/dining/u_b/memory-b/0.jpg';

// ------------------------------------------------------------------ URL resolution
test('U1 every caller in one tick collapses into ONE platform call, and a repeat is free', async () => {
  const world = makeWorld();
  const cache = load(world, 'imageCache');
  const rows = [A, B, A, B, A, B, A, B, A, B, A, B, A, B, A, B, A];
  // Seventeen rows resolving in the same tick: the old pipeline made seventeen calls, and
  // seventeen MORE on every reopen because nothing was remembered.
  const urls = await Promise.all(rows.map(source => cache.resolve([source])));
  await drain();
  assert.equal(world.tempUrlCalls, 1, 'seventeen rows must cost one platform call, saw ' + world.tempUrlCalls);
  assert.equal(world.tempUrlIds, 2, 'and must request only the two distinct ids');
  assert.ok(String(urls[0][0]).startsWith('https://'), 'the row gets a renderable url');
  assert.equal(urls[0][0], urls[2][0], 'the same id resolves to the same url for every caller');
  const before = world.tempUrlCalls;
  const again = await cache.resolve(rows.slice(0, 3));
  assert.equal(world.tempUrlCalls, before, 'a repeat resolution must not touch the platform');
  assert.equal(again[0], urls[0][0], 'and must return the SAME url, so the platform cache can hit');
});

test('U2 concurrent resolutions of one id share a single in-flight request', async () => {
  const world = makeWorld();
  const cache = load(world, 'imageCache');
  const [a, b] = await Promise.all([cache.resolve([A]), cache.resolve([A])]);
  await drain();
  assert.equal(world.tempUrlCalls, 1, 'one id in flight is one call');
  assert.equal(a[0], b[0]);
});

test('U3 a resolution failure degrades to the source, never to a rejection', async () => {
  const world = makeWorld({ resolveFails: true });
  const cache = load(world, 'imageCache');
  const urls = await cache.resolve([A, '/images/le-comptoir.jpg']);
  assert.equal(urls[0], A, 'the unresolved cloud id is returned unchanged');
  assert.equal(urls[1], '/images/le-comptoir.jpg', 'and a package path passes straight through');
});

test('U4 an expiring url is refreshed before it can lapse', async () => {
  const world = makeWorld();
  const cache = load(world, 'imageCache');
  await cache.resolve([A]);
  const first = cache.urlFor(A);
  assert.ok(first, 'the url is available to a later surface');
  // Walk to just inside the safety window: the url is still technically alive, but a surface
  // must not be handed one that could lapse while it renders.
  world.now += (90 * 60 * 1000) - cache.URL_SAFETY_MS + 1;
  assert.equal(cache.urlFor(A), null, 'a url inside the safety window is not handed out');
  const before = world.tempUrlCalls;
  await cache.resolve([A]);
  assert.equal(world.tempUrlCalls, before + 1, 'and it is re-resolved exactly once');
});

// ------------------------------------------------------------------ shared local source
test('L1 one source is downloaded ONCE and shared by every variant', async () => {
  const world = makeWorld();
  const cache = load(world, 'imageCache');
  const normal = await cache.localSource(A, 'marker', { revision: 1 });
  const selected = await cache.localSource(A, 'marker', { revision: 1 });
  assert.equal(world.downloads, 1, 'the selected variant must not re-download the same file, saw ' + world.downloads);
  assert.equal(normal.path, selected.path, 'both variants share one local file');
  assert.equal(normal.cached, false, 'the first call is a miss');
  assert.equal(selected.cached, false, 'and the second is served by the in-flight/session layer');
});

test('L2 a prepared derivative is persisted once and reused afterwards', async () => {
  const world = makeWorld();
  const cache = load(world, 'imageCache');
  const first = await cache.localSource(A, 'marker', { revision: 1 });
  const prepared = '/tmp/derivative-1.jpg';
  world.files.set(prepared, 41000);
  const stored = cache.store(A, 'marker', prepared, { revision: 1 });
  assert.ok(stored, 'the derivative is stored');
  assert.equal(world.files.get(stored), 41000, 'and its bytes are the derivative, not the original');
  // A brand new module instance stands in for the next app launch: only the disk survives.
  const relaunched = load(world, 'imageCache');
  const hit = await relaunched.localSource(A, 'marker', { revision: 1 });
  assert.equal(hit.cached, true, 'the next session finds it on disk');
  assert.equal(hit.path, stored);
  assert.equal(world.downloads, 1, 'and downloads nothing');
});

test('L3 the cache key separates revisions, so an updated photo is never the old one', async () => {
  const world = makeWorld();
  const cache = load(world, 'imageCache');
  await cache.localSource(A, 'marker', { revision: 1 });
  const first = world.downloads;
  const bumped = await cache.localSource(A, 'marker', { revision: 2 });
  assert.equal(world.downloads, first + 1, 'a new revision is a miss, not a stale hit');
  assert.equal(bumped.cached, false);
});

test('L4 the disk cache is byte-budgeted and evicts the least recently used entry', async () => {
  const world = makeWorld();
  const cache = load(world, 'imageCache');
  const perEntry = 10 * 1024 * 1024;
  const names = [];
  for (let i = 0; i < 4; i++) {
    const source = 'cloud://env.bucket/dining/u_' + i + '/memory/0.jpg';
    const local = await cache.localSource(source, 'marker', { revision: 1 });
    world.files.set(local.path, perEntry);
    world.now += 1000;
    const stored = cache.store(source, 'marker', local.path, { revision: 1 });
    names.push(stored);
  }
  const snap = cache.snapshot();
  assert.ok(snap.local.bytes <= BUDGET, 'the cache must stay inside its budget, saw ' + snap.local.bytes);
  assert.ok(snap.local.evictions >= 1, 'and must have evicted to get there');
  assert.equal(world.unlinked.length >= 1, true, 'an eviction removes a real file');
});

test('L5 a corrupt or deleted cache file is dropped and the network is used', async () => {
  const world = makeWorld();
  const cache = load(world, 'imageCache');
  const local = await cache.localSource(A, 'marker', { revision: 1 });
  world.files.set(local.path, 50000);
  const stored = cache.store(A, 'marker', local.path, { revision: 1 });
  const relaunched = load(world, 'imageCache');
  world.files.delete(stored);                       // the OS reclaimed it between sessions
  const downloads = world.downloads;
  const hit = await relaunched.localSource(A, 'marker', { revision: 1 });
  assert.equal(hit.cached, false, 'a vanished file is not a cache hit');
  assert.equal(world.downloads, downloads + 1, 'the pipeline falls back to the network');
});

test('L6 without a filesystem the pipeline still returns a usable path', async () => {
  const world = makeWorld({ noFileSystem: true });
  const cache = load(world, 'imageCache');
  const shared = await cache.localSource(A, 'marker', { revision: 1 });
  assert.ok(shared.path, 'a path is still returned');
  assert.equal(shared.cached, false);
  assert.equal(cache.store(A, 'marker', '/tmp/x.jpg', { revision: 1 }), null, 'and storing declines instead of throwing');
  assert.equal(cache.snapshot().local.entries, 0);
});

test('L7 reset() drops every layer, so a different owner inherits nothing', async () => {
  const world = makeWorld();
  const cache = load(world, 'imageCache');
  await cache.resolve([A]);
  const local = await cache.localSource(A, 'marker', { revision: 1 });
  world.files.set(local.path, 50000);
  cache.store(A, 'marker', local.path, { revision: 1 });
  assert.ok(cache.snapshot().local.entries > 0);
  cache.reset();
  assert.equal(cache.urlFor(A), null, 'resolved urls are gone');
  assert.equal(cache.snapshot().local.entries, 0, 'and the disk index is empty');
  const before = world.tempUrlCalls;
  await cache.resolve([A]);
  assert.equal(world.tempUrlCalls, before + 1, 'the next resolution goes back to the platform');
});

test('L8 prefetch is bounded and never runs the same source twice', async () => {
  const world = makeWorld();
  const cache = load(world, 'imageCache');
  cache.prefetch([A, A, B, '/images/le-comptoir.jpg']);
  for (let i = 0; i < 20 && cache.snapshot().prefetch.queued + cache.snapshot().prefetch.active > 0; i++) await drain();
  const snap = cache.snapshot();
  assert.equal(snap.prefetch.queued, 0, 'the queue drains');
  assert.ok(snap.prefetch.active <= 1, 'prefetch is serial, saw ' + snap.prefetch.active);
  assert.equal(world.downloads, 2, 'two cloud sources are warmed, the package path is skipped');
});

// ------------------------------------------------------------------ preview variants
test('V1 the synchronous cache check answers in the same tick and never triggers work', async () => {
  const world = makeWorld();
  const cache = load(world, 'imageCache');
  assert.equal(cache.cachedLocal(A, 'preview', 1), null, 'a cold cache answers null');
  assert.equal(world.downloads, 0, 'and starts nothing');
  const local = await cache.ensureLocal(A, 'preview', 512, { revision: 1 });
  assert.ok(local, 'the preview is prepared');
  assert.ok(world.downloads >= 1);
  const after = world.downloads;
  assert.equal(cache.cachedLocal(A, 'preview', 1), local, 'and is then answerable synchronously');
  assert.equal(world.downloads, after, 'the synchronous check still starts nothing');
});

test('V2 ensureLocal prepares once, persists once and is a hit afterwards', async () => {
  const world = makeWorld({ payloadBytes: 3 * 1024 * 1024 });
  const cache = load(world, 'imageCache');
  const first = await cache.ensureLocal(A, 'preview', 512, { revision: 1 });
  assert.ok(first, 'a preview path comes back');
  const downloads = world.downloads, compresses = world.compresses === undefined ? null : world.compresses;
  const stored = world.files.get(first);
  assert.ok(stored > 0 && stored < 3 * 1024 * 1024, 'the stored bytes are the derivative, not the original, saw ' + stored);
  const again = await cache.ensureLocal(A, 'preview', 512, { revision: 1 });
  assert.equal(again, first, 'the second call is a cache hit');
  assert.equal(world.downloads, downloads, 'with no extra download');
  // A brand new module instance stands in for the next launch: only the disk survives.
  const relaunched = load(world, 'imageCache');
  const afterRelaunch = await relaunched.ensureLocal(A, 'preview', 512, { revision: 1 });
  assert.equal(afterRelaunch, first, 'the persistent derivative survives a relaunch');
  assert.equal(world.downloads, downloads, 'and is not re-fetched');
});

test('V3 the variant family is sized from measured device pixels, not per CSS size', () => {
  const page = fs.readFileSync(path.join(MP, 'pages', 'map', 'index.js'), 'utf8');
  const row = fs.readFileSync(path.join(MP, 'components', 'memory-row', 'index.js'), 'utf8');
  const markers = fs.readFileSync(path.join(MP, 'utils', 'mapMarkers.js'), 'utf8');
  const cardEdge = Number((page.match(/CARD_PREVIEW_LONG_EDGE\s*=\s*(\d+)/) || [])[1]);
  const rowEdge = Number((row.match(/LIST_THUMBNAIL_LONG_EDGE\s*=\s*(\d+)/) || [])[1]);
  const markerEdge = Number((markers.match(/SOURCE_LONG_EDGE\s*=\s*(\d+)/) || [])[1]);
  assert.equal(cardEdge, 512, 'the card variant is the measured one (469 device px on a 3.5x device)');
  assert.equal(rowEdge, markerEdge, 'the list cell reuses the marker variant instead of inventing one (215 device px)');
  // Exactly two derived sizes exist across the whole app. A third would mean someone started
  // generating a variant per CSS size.
  const sizes = new Set([cardEdge, markerEdge]);
  assert.equal(sizes.size, 2, 'the variant family stays at two derived sizes, saw ' + sizes.size);
});

test('V4 predictive preload is bounded to the first screen and deduped through one asset set', () => {
  // The library preload lives in the sheet: it already owns the library data, and the Me page is
  // a whole-file reviewed gate that a performance round must not touch.
  const me = fs.readFileSync(path.join(MP, 'components', 'sheet', 'index.js'), 'utf8');
  const mePage = fs.readFileSync(path.join(MP, 'pages', 'me', 'index.js'), 'utf8');
  const home = fs.readFileSync(path.join(MP, 'pages', 'home', 'index.js'), 'utf8');
  assert.equal(mePage.indexOf('prefetch'), -1, 'the Me page source stays untouched: it is a reviewed whole-file gate');
  const meWindow = Number((me.match(/LIBRARY_PREFETCH_WINDOW\s*=\s*(\d+)/) || [])[1]);
  const homeVisible = Number((home.match(/HOME_VISIBLE_ROWS\s*=\s*(\d+)/) || [])[1]);
  const homeWindow = Number((home.match(/HOME_PREFETCH_ROWS\s*=\s*(\d+)/) || [])[1]);
  assert.ok(meWindow > 0 && meWindow <= 10, 'the Me window is a screen, not a library, saw ' + meWindow);
  assert.ok(homeWindow > 0 && homeWindow <= 10, 'the Home window is the next few rows, saw ' + homeWindow);
  assert.equal(homeVisible, 5, 'Home still shows five rows');
  assert.ok(me.indexOf('seen.has(memory.id)') >= 0, 'the three Me destinations share ONE deduped asset set');
  assert.ok(me.indexOf("route === 'pages/me/index'") >= 0, 'and it only runs when Me is the host page');
  assert.ok(me.indexOf("ensureLocal(source, 'marker'") >= 0 && home.indexOf("ensureLocal(source, 'marker'") >= 0,
    'and both preload the same variant the rows render');
  assert.equal(/slice\(0, *LIBRARY_PREFETCH_WINDOW\)/.test(me), true, 'every library destination is sliced to the window');
  assert.equal(/slice\(HOME_VISIBLE_ROWS, *HOME_VISIBLE_ROWS \+ *HOME_PREFETCH_ROWS\)/.test(home), true,
    'Home preloads only the rows just past the fold');
});

test('L9 the module is import-safe and inert without a platform', async () => {
  const file = path.join(MP, 'utils', 'imageCache.js');
  const vm = require('node:vm');
  const module = { exports: {} };
  // No `wx` at all: loading must not touch it, and the entry points must degrade.
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
    module, exports: module.exports, require: () => ({ downloadMapPhoto: () => Promise.reject(new Error('no')) }),
    console, Promise, Date, Math, JSON, Number, Boolean, Object, Array, String, Error, TypeError, Map, Set, RegExp, isFinite, parseInt, parseFloat,
    setTimeout: () => 0, clearTimeout: () => {}, queueMicrotask: fn => Promise.resolve().then(fn),
  }, { filename: file });
  const cache = module.exports;
  assert.doesNotThrow(() => cache.reset());
  assert.doesNotThrow(() => cache.prefetch([A]));
  const shared = await cache.localSource(A, 'marker', {});
  assert.equal(shared.path, A, 'with no platform there is nothing to cache');
  assert.equal(cache.store(A, 'marker', '/tmp/x.jpg'), null);
});

test('L10 cloudRecords keeps the identity boundary in front of the shared pipeline', async () => {
  const source = fs.readFileSync(path.join(MP, 'utils', 'cloudRecords.js'), 'utf8');
  const body = source.slice(source.indexOf('async function resolvePhotoUrls'), source.indexOf('// A stored photo keeps its own bytes'));
  assert.ok(body.indexOf('identity.assertBusinessCloudAllowed()') >= 0, 'the diagnostic/identity gate still runs first');
  assert.ok(body.indexOf('identity.lease()') >= 0, 'and the lease is still taken');
  assert.ok(body.indexOf('identity.assertLease(token)') >= 0, 'and re-asserted after the await');
  assert.ok(body.indexOf("require('./imageCache').resolve") >= 0, 'the resolution itself is delegated, not duplicated');
  assert.equal(/wx\.cloud\.getTempFileURL/.test(body), false, 'so the platform call lives in exactly one place');
});

(async () => {
  let completed = false;
  process.on('beforeExit', () => { if (!completed) { console.error('image cache checks did not run to completion'); process.exitCode = 1; } });
  for (const entry of tests) {
    try { await entry.fn(); passed++; console.log('PASS ' + entry.name); }
    catch (e) { failed++; console.error('FAIL ' + entry.name + ': ' + String(e && e.message).split('\n')[0]); }
  }
  completed = true;
  console.log('\n' + passed + ' passed, ' + failed + ' failed; synthetic platform and synthetic payloads.');
  if (failed) process.exitCode = 1;
})().catch(e => { console.error(e); process.exitCode = 1; });
