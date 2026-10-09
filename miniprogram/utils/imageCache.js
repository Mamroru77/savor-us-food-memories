// The single image asset pipeline. Every surface that shows a photo goes through here, so
// "how many times did this file get fetched" has one answer instead of one per page.
//
// The audit that produced this module measured three separate duplicate loads:
//
//   1. `getTempFileURL` was called ONCE PER ROW, every single time a list mounted. The
//      library sheet unmounts its rows on close, so reopening it re-resolved all 17 rows
//      (measured: 17 calls on open #1, #2 and #3 alike). Each call returns a NEW signed
//      URL, so the platform's own <image> cache key changed with it and the bytes were
//      fetched again.
//   2. The Map marker renderer cached its work under `[source, selected]`, so selecting a
//      marker that was already on screen re-downloaded the SAME cloud file just to compose
//      the selected variant (measured: 2 downloads of one fileID, 224 KB each).
//   3. Nothing was ever prefetched, so the first time a marker was selected the user paid
//      the whole download + re-encode + compose latency.
//
// Layers, from the cheapest to the most expensive:
//   L0  source metadata      the caller's own record (fileID + whatever revision it has)
//   L1  in-flight dedupe     one promise per (source, variant), shared by every caller
//   L2  session memory       resolved URL per fileID; prepared local path per (source, variant)
//   L3  persistent disk      a BOUNDED derivative cache under USER_DATA_PATH, LRU evicted
//
// Cache key: `source` + `variant` (+ the source's own revision when the record carries one).
// A fileID alone is not enough: the same fileID can be re-uploaded with new bytes, and a
// record that has a `revision` must never keep showing the previous image.
//
// This layer is PERFORMANCE ONLY. Every failure path returns the uncached result — a missing
// file, a full disk, a corrupt derivative or an expired URL must degrade to the network, never
// to a blank surface.
const identity = require('./identity');

const URL_SAFETY_MS = 5 * 60 * 1000;          // re-resolve this long before a signed URL lapses
const URL_ASSUMED_TTL_MS = 90 * 60 * 1000;    // when the platform reports no maxAge
const CACHE_DIR_NAME = 'savor-image-cache';
const CACHE_SCHEMA = 'v1';                    // a schema change invalidates the whole cache
const DEFAULT_BUDGET_BYTES = 24 * 1024 * 1024;
const CACHE_BUDGET_BYTES = DEFAULT_BUDGET_BYTES;

// ---------------------------------------------------------------- helpers
// This layer is performance only. A missing platform, a missing directory or a full disk
// must degrade to "no cache", never to a thrown error inside a render path.
function platform() { try { return typeof wx === 'undefined' ? null : wx; } catch (e) { return null; } }
function fs() { const w = platform(); return w && w.getFileSystemManager ? w.getFileSystemManager() : null; }
function isCloud(value) { return typeof value === 'string' && value.indexOf('cloud://') === 0; }
function isCloudSource(value) { return isCloud(value); }
function isCacheable(value) { return typeof value === 'string' && value !== '' && !/^https?:\/\//.test(value); }
function hash(text) {
  // FNV-1a, 8 hex. Only ever used as a filename, never as a security boundary.
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}
function cacheDir() {
  const w = platform();
  const base = w && w.env && w.env.USER_DATA_PATH;
  if (typeof base !== 'string' || !base) return null;
  return base + '/' + CACHE_DIR_NAME + '-' + CACHE_SCHEMA;
}
function keyOf(source, variant, revision) {
  return hash(String(source) + '|' + String(variant) + '|' + String(revision === undefined || revision === null ? '' : revision));
}
function fileName(source, variant, revision) { return keyOf(source, variant, revision) + '.jpg'; }

// ---------------------------------------------------------------- L0/L1/L2: resolved URLs
// One entry per fileID. The URL is reused for its whole life, which is what lets the
// platform's own image cache hit instead of being handed a fresh signature every mount.
const urlCache = new Map();
const urlInflight = new Map();
let urlBatch = null;
let urlStats = { calls: 0, ids: 0, hits: 0, misses: 0 };

function enqueueUrl(fileID) {
  if (!urlBatch) {
    urlBatch = { ids: new Set(), waiters: new Map() };
    Promise.resolve().then(flushUrlBatch);
  }
  urlBatch.ids.add(fileID);
  return new Promise((resolve, reject) => { urlBatch.waiters.set(fileID, { resolve, reject }); });
}

async function flushUrlBatch() {
  const batch = urlBatch;
  urlBatch = null;
  const ids = Array.from(batch.ids);
  try {
    for (let i = 0; i < ids.length; i += 50) {
      const chunk = ids.slice(i, i + 50);
      const w = platform();
      if (!w || !w.cloud || !w.cloud.getTempFileURL) break;
      urlStats.calls += 1; urlStats.ids += chunk.length;
      const result = await w.cloud.getTempFileURL({ fileList: chunk });
      const ttl = Number.isFinite(result && result.maxAge) && result.maxAge > 0 ? result.maxAge * 1000 : URL_ASSUMED_TTL_MS;
      (result.fileList || []).forEach(f => {
        if (f && f.status === 0 && typeof f.tempFileURL === 'string' && f.tempFileURL) {
          urlCache.set(f.fileID, { url: f.tempFileURL, expiresAt: Date.now() + ttl });
        }
      });
    }
  } catch (e) { /* every waiter resolves to its own source: the caller keeps its fallback */ }
  ids.forEach(id => {
    const waiter = batch.waiters.get(id);
    if (!waiter) return;
    const hit = urlCache.get(id);
    urlInflight.delete(id);
    waiter.resolve(hit ? hit.url : id);
  });
}

// Resolve a list of sources to renderable URLs, aligned with the input. Non-cloud sources
// pass straight through. N calls in the same tick collapse into ONE platform call, and the
// same fileID is never resolved twice while a resolution is in flight.
function resolve(sources) {
  const list = (sources || []).map(value => value);
  const out = new Array(list.length);
  const pending = [];
  const now = Date.now();
  list.forEach((value, index) => {
    if (!isCloud(value)) { out[index] = value; return; }
    const hit = urlCache.get(value);
    if (hit && hit.expiresAt - now > URL_SAFETY_MS) { urlStats.hits += 1; out[index] = hit.url; return; }
    urlStats.misses += 1;
    let promise = urlInflight.get(value);
    if (!promise) { promise = enqueueUrl(value); urlInflight.set(value, promise); }
    pending.push(promise.then(url => { out[index] = url; }, () => { out[index] = value; }));
  });
  if (!pending.length) return Promise.resolve(out);
  return Promise.all(pending).then(() => out);
}

// A SYNCHRONOUS check, for a surface that has to decide in the same tick whether it can paint
// the cached preview right now. Returns a local path or null; never triggers any work.
function cachedLocal(source, variant, revision) {
  if (!isCacheable(source) || !platform()) return null;
  const hit = readCached(source, variant, revision);
  if (hit) return hit;
  const session = sessionLocal.get(keyOf(source, variant, revision));
  return session && exists(session.path) ? session.path : null;
}

function urlFor(source) {
  const hit = urlCache.get(source);
  if (!hit) return null;
  return hit.expiresAt - Date.now() > URL_SAFETY_MS ? hit.url : null;
}

// ---------------------------------------------------------------- L3: prepared derivatives
// The bytes a renderer actually needs are small and regenerable, so they are the only thing
// worth persisting. A cloud ORIGINAL is never written to disk: one legacy record measured
// 10.6 MB, and 20 of those already blew the device's file quota and broke every later write.
let index = null;                             // [{ name, bytes, at }]
let indexLoaded = false;
const inflightLocal = new Map();              // key -> promise<{path, cached}>
// L2. The in-flight map only covers callers that overlap; two variants of the same source are
// often requested a frame apart, and without this they would each download the same file. The
// entry is validated on every use, because the file it points at is a temp path the platform
// may reclaim between calls.
const sessionLocal = new Map();               // key -> { path, at }
let stats = { hits: 0, misses: 0, writes: 0, evictions: 0, bytes: 0, failures: 0 };

function dirReady() {
  const dir = cacheDir();
  if (!dir) return null;
  if (indexLoaded) return dir;
  indexLoaded = true;
  index = [];
  const manager = fs();
  if (!manager || !manager.readdirSync) return null;
  try { manager.accessSync(dir); } catch (e) {
    try { manager.mkdirSync(dir, true); } catch (e2) { return null; }
  }
  let names = [];
  try { names = manager.readdirSync(dir) || []; } catch (e) { names = []; }
  names.forEach(name => {
    if (!/^[0-9a-f]{8}\.jpg$/.test(name)) return;
    let stat = null;
    try { stat = manager.statSync(dir + '/' + name); } catch (e) { return; }
    const bytes = stat && Number(stat.size) > 0 ? Number(stat.size) : 0;
    if (!bytes) return;
    index.push({ name, bytes, at: Number(stat.lastModifiedTime) || 0 });
  });
  stats.bytes = index.reduce((sum, entry) => sum + entry.bytes, 0);
  return dir;
}

function exists(path) {
  const manager = fs();
  if (!manager || !path) return false;
  try { manager.accessSync(path); return true; } catch (e) { return false; }
}

function entryFor(name) {
  if (!index) return null;
  for (let i = 0; i < index.length; i++) if (index[i].name === name) return index[i];
  return null;
}

// Byte-budgeted LRU. The most recently read entry is the most likely to be needed next, and
// the marker renderer reads the visible set on every render, so the on-screen assets are
// protected by construction without the page having to declare them.
function evictToBudget() {
  const dir = cacheDir();
  if (!dir || !index) return;
  if (stats.bytes <= CACHE_BUDGET_BYTES) return;
  index.sort((a, b) => a.at - b.at);
  while (stats.bytes > CACHE_BUDGET_BYTES && index.length) {
    const victim = index.shift();
    try { fs().unlinkSync(dir + '/' + victim.name); stats.evictions += 1; stats.bytes -= victim.bytes; }
    catch (e) { stats.bytes -= victim.bytes; }
  }
}

function readCached(source, variant, revision) {
  const dir = dirReady();
  if (!dir) return null;
  const name = fileName(source, variant, revision);
  const entry = entryFor(name);
  if (!entry) return null;
  const path = dir + '/' + name;
  try {
    const stat = fs().statSync(path);
    if (!stat || !(Number(stat.size) > 0)) throw new Error('EMPTY');
  } catch (e) {
    // A deleted or truncated file is not a cache hit. Drop it and go to the network.
    try { fs().unlinkSync(path); } catch (e2) {}
    if (entry) { stats.bytes -= entry.bytes; index = index.filter(item => item !== entry); }
    return null;
  }
  entry.at = Date.now();
  stats.hits += 1;
  return path;
}

function writeCached(source, variant, revision, tempPath) {
  const dir = dirReady();
  if (!dir || !tempPath) return null;
  const name = fileName(source, variant, revision);
  const target = dir + '/' + name;
  let bytes = 0;
  try { const stat = fs().statSync(tempPath); bytes = stat && Number(stat.size) > 0 ? Number(stat.size) : 0; } catch (e) { return null; }
  if (!bytes) return null;
  try { fs().copyFileSync(tempPath, target); }
  catch (e) {
    // copyFileSync is not available on every base library; read/write is the documented pair.
    try { fs().writeFileSync(target, fs().readFileSync(tempPath)); }
    catch (e2) { stats.failures += 1; return null; }
  }
  const existing = entryFor(name);
  if (existing) { stats.bytes -= existing.bytes; existing.bytes = bytes; existing.at = Date.now(); }
  else { index.push({ name, bytes, at: Date.now() }); }
  stats.bytes += bytes;
  stats.writes += 1;
  evictToBudget();
  return target;
}

// The shared download for one source. Deliberately does NOT prepare anything: how a source is
// re-encoded is a renderer policy, and the renderer must keep that work inside its own
// single-slot stage. Doing it here would put an expensive decode back under the network
// concurrency, which is exactly the memory spike the heavy stage exists to prevent.
//
// Returns { path, cached }. A cache failure is never fatal: the caller gets the uncached path.
function localSource(source, variant, options) {
  const revision = options && options.revision;
  if (!isCacheable(source) || !platform()) return Promise.resolve({ path: source, cached: false, disposable: [] });
  const key = keyOf(source, variant, revision);
  const existing = inflightLocal.get(key);
  if (existing) return existing;
  const promise = (async () => {
    const hit = readCached(source, variant, revision);
    if (hit) return { path: hit, cached: true, disposable: [] };
    const session = sessionLocal.get(key);
    if (session && exists(session.path)) { stats.hits += 1; return { path: session.path, cached: false, disposable: [] }; }
    stats.misses += 1;
    const local = await require('./cloudRecords').downloadMapPhoto(source);
    sessionLocal.set(key, { path: local, at: Date.now() });
    // Disposable: the job that paid for this download owns the temp file and releases it. A
    // later variant is served from the PERSISTENT derivative (store() below), not from this
    // copy, so nothing is left behind — which matters on a device whose file quota has already
    // been exhausted once by unreclaimed media.
    return { path: local, cached: false, disposable: [local] };
  })().then(
    value => { inflightLocal.delete(key); return value; },
    error => { inflightLocal.delete(key); throw error; }
  );
  inflightLocal.set(key, promise);
  return promise;
}

// Persist a derivative the CALLER produced (inside its own stage), so the next session finds
// it already prepared. Returns the stored path, or null when the cache declined it.
function store(source, variant, preparedPath, options) {
  const revision = options && options.revision;
  if (!isCacheable(source) || !platform() || !preparedPath) return null;
  const stored = writeCached(source, variant, revision, preparedPath);
  if (stored && stored !== preparedPath) { try { fs().unlinkSync(preparedPath); } catch (e) {} }
  // Point the session at the derivative, so the NEXT variant of this source finds the prepared
  // file instead of the raw download the first variant is about to release.
  if (stored) sessionLocal.set(keyOf(source, variant, revision), { path: stored, at: Date.now() });
  return stored;
}

// A serialized prepare path for surfaces that are NOT the marker renderer (the Map selected
// card, the list rows). The renderer keeps its own single heavy slot; this is the same rule for
// everyone else, so an expensive decode can never run twice at once just because two different
// surfaces wanted a small image at the same moment.
let prepareActive = 0;
const prepareQueue = [];
function pumpPrepare() {
  while (prepareActive < 1 && prepareQueue.length) {
    const item = prepareQueue.shift();
    prepareActive += 1;
    item.run().then(item.resolve, item.resolve.bind(null, null)).then(() => { prepareActive -= 1; pumpPrepare(); });
  }
}
// Returns a local path for `variant`, preparing and persisting the derivative on a miss.
// `null` means "no derivative available" — the caller keeps whatever it was showing.
function ensureLocal(source, variant, longEdge, options) {
  const revision = options && options.revision;
  if (!isCacheable(source) || !platform()) return Promise.resolve(null);
  const hit = readCached(source, variant, revision);
  if (hit) return Promise.resolve(hit);
  const session = sessionLocal.get(keyOf(source, variant, revision));
  if (session && exists(session.path)) return Promise.resolve(session.path);
  return new Promise(resolve => {
    prepareQueue.push({ resolve, run: () => (async () => {
      const shared = await localSource(source, variant, options);
      if (shared.cached) return shared.path;
      const local = shared.path;
      if (!local) return null;
      let prepared = local;
      const edge = Number(longEdge) > 0 ? Number(longEdge) : 0;
      if (edge) {
        try {
          const meta = await new Promise((done, fail) => wx.getImageInfo({ src: local, success: done, fail }));
          const w = Number(meta && meta.width) || 0, h = Number(meta && meta.height) || 0;
          const scale = Math.max(w, h) > 0 ? Math.min(1, edge / Math.max(w, h)) : 1;
          if (scale < 1) {
            const shrunk = await new Promise((done, fail) => wx.compressImage({
              src: local, quality: 80,
              compressedWidth: Math.max(1, Math.round(w * scale)), compressedHeight: Math.max(1, Math.round(h * scale)),
              success: done, fail,
            }));
            if (shrunk && shrunk.tempFilePath) prepared = shrunk.tempFilePath;
          }
        } catch (e) { prepared = local; }
      }
      const stored = store(source, variant, prepared, options);
      return stored || prepared;
    })() });
    pumpPrepare();
  });
}

// Idle, bounded prefetch. Deliberately small and serial: this exists to have the NEXT image
// ready, never to compete with the one the user just asked for.
let prefetchQueue = [];
let prefetchActive = 0;
const PREFETCH_CONCURRENCY = 1;
function prefetch(sources, variant) {
  (sources || []).forEach(source => {
    if (!isCacheable(source)) return;
    const key = keyOf(source, variant);
    if (inflightLocal.has(key) || readCached(source, variant)) return;
    if (prefetchQueue.some(item => item.key === key)) return;
    prefetchQueue.push({ key, source, variant });
  });
  pumpPrefetch();
}
function pumpPrefetch() {
  while (prefetchActive < PREFETCH_CONCURRENCY && prefetchQueue.length) {
    const item = prefetchQueue.shift();
    prefetchActive += 1;
    localSource(item.source, item.variant)
      .catch(() => {})
      .then(() => { prefetchActive -= 1; pumpPrefetch(); });
  }
}
function cancelPrefetch() { prefetchQueue = []; }

// ---------------------------------------------------------------- lifecycle
// A cache must never outlive the owner it was built for, and a schema change must not leave
// stale bytes behind.
function reset() {
  try { resetInternal(); } catch (e) { /* a cache that cannot be cleared is still only a cache */ }
}
function resetInternal() {
  urlCache.clear();
  urlInflight.clear();
  urlBatch = null;
  inflightLocal.clear();
  sessionLocal.clear();
  cancelPrefetch();
  prepareQueue.length = 0;
  index = [];
  indexLoaded = false;
  stats = { hits: 0, misses: 0, writes: 0, evictions: 0, bytes: 0, failures: 0 };
  const dir = cacheDir();
  if (!dir) return;
  let names = [];
  try { names = fs().readdirSync(dir) || []; } catch (e) { return; }
  names.forEach(name => { if (/^[0-9a-f]{8}\.jpg$/.test(name)) { try { fs().unlinkSync(dir + '/' + name); } catch (e) {} } });
}

// Dev/diagnostic view. Counts and byte totals only — never a path or a fileID.
function snapshot() {
  return {
    urls: { cached: urlCache.size, inFlight: urlInflight.size, calls: urlStats.calls, ids: urlStats.ids, hits: urlStats.hits, misses: urlStats.misses },
    local: { entries: index ? index.length : 0, session: sessionLocal.size, bytes: stats.bytes, budget: CACHE_BUDGET_BYTES,
      hits: stats.hits, misses: stats.misses, writes: stats.writes, evictions: stats.evictions, failures: stats.failures },
    prefetch: { queued: prefetchQueue.length, active: prefetchActive },
  };
}

module.exports = {
  resolve, isCloudSource, urlFor, cachedLocal, localSource, store, ensureLocal, prefetch, cancelPrefetch, reset, snapshot,
  CACHE_BUDGET_BYTES, URL_SAFETY_MS,
};
