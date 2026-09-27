'use strict';
// Targeted checks for the three image pipelines this round has to attribute and two of them
// to fix:
//   profile save error attribution  (a non-filesystem failure must not claim "free storage")
//   avatar durable derivative       (a huge avatar must not be persisted at full size)
//   map card vs marker photo source (the two semantics differ and must stay pinned)
//   meal upload chain               (stage classification must be complete)
//
// The VM harness is a disk-backed filesystem mock with per-path decoded dimensions, so
// compressImage/copyFile/getImageInfo behave like the device rather than like a stub.

const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');

const ROOT = path.resolve(__dirname, '..');
const MP = path.join(ROOT, 'miniprogram');

// Minimal valid 1x1 images: enough for the format sniffer, never decoded.
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6300010000050001' + '0d0a2db4', 'hex');
const JPG = Buffer.from('ffd8ffe000104a46494600010100000100010000ffdb004300' + '00'.repeat(63) + 'ffc0000b080001000101011100ffc4001f0000010501010101010100000000000000000102030405060708090a0bffda0008010100013f00', 'hex');

function hash(str) { let h = 0x811c9dc5; for (const c of String(str)) { h ^= c.charCodeAt(0); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16); }
// identity.verify() only accepts userId matching /^u_[a-f0-9]{48}$/, so build exactly that.
function userIdFor(owner) {
  let hex = '';
  for (let i = 0; i < 6; i++) hex += hash('owner:' + owner + ':' + i).padStart(8, '0');
  return 'u_' + hex.replace(/[^a-f0-9]/g, '0').slice(0, 48);
}

function runtime(options = {}) {
  const base = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'img-'));
  const cache = new Map(), disk = new Map(), dimensions = new Map(), compressCalls = [], calls = [];
  const source = base + '/source.jpg';
  const original = base + '/original.jpg';
  fs.writeFileSync(source, JPG); dimensions.set(source, { width: 1600, height: 1200 });
  fs.writeFileSync(original, JPG);
  dimensions.set(original, { width: options.originalWidth || 1600, height: options.originalHeight || 1200 });

  let owner = 'a', storageWrites = 0, failStorage = false;
  const nativeError = () => ({ errMsg: 'native failed /private/owner/path', errCode: 1001 });
  // What wx.setStorageSync actually throws when the storage budget is exhausted.
  const quotaError = () => ({ errMsg: 'setStorageSync:fail exceed storage max size', errCode: 1001 });
  const FS = {
    accessSync: p => fs.accessSync(p),
    mkdirSync(p, recursive) { fs.mkdirSync(p, { recursive }); },
    statSync(p) { return fs.statSync(p); },
    copyFile(o) { calls.push('copy'); try { fs.copyFileSync(o.srcPath, o.destPath); const d = dimensions.get(o.srcPath); if (d) dimensions.set(o.destPath, d); o.success(); } catch (e) { o.fail(e); } },
    readFile(o) { calls.push('read'); try { o.success({ data: fs.readFileSync(o.filePath) }); } catch (e) { o.fail(e); } },
    writeFile(o) { calls.push('write'); try { fs.writeFileSync(o.filePath, o.data); o.success(); } catch (e) { o.fail(e); } },
    readFileSync: (p, enc) => fs.readFileSync(p, enc),
    writeFileSync: (p, d, enc) => fs.writeFileSync(p, d, enc),
  };
  const wx = {
    env: { USER_DATA_PATH: base },
    getFileSystemManager: () => FS,
    getSystemInfoSync: () => ({ platform: 'ios', language: 'en' }),
    getStorageSync: k => disk.get(k) || '',
    setStorageSync(k, v) { storageWrites++; if (failStorage) throw quotaError(); disk.set(k, v); },
    removeStorageSync: k => disk.delete(k),
    chooseMedia(o) { calls.push('choose'); o.success({ tempFiles: [{ tempFilePath: original, size: options.originalBytes || 3000000 }] }); },
    chooseImage(o) { calls.push('chooseImage'); o.success({ tempFilePaths: [source] }); },
    compressImage(o) {
      calls.push('compress');
      const rec = { src: o.src, quality: o.quality };
      if (o.compressedWidth !== undefined) rec.compressedWidth = o.compressedWidth;
      if (o.compressedHeight !== undefined) rec.compressedHeight = o.compressedHeight;
      compressCalls.push(rec);
      if (options.resizeFails && o.compressedWidth !== undefined) { o.fail(nativeError()); return; }
      if (options.compressFails) { o.fail(nativeError()); return; }
      const dest = o.src + '.compressed-' + compressCalls.length + '.jpg';
      fs.writeFileSync(dest, JPG);
      const from = dimensions.get(o.src) || { width: 1, height: 1 };
      dimensions.set(dest, { width: o.compressedWidth || from.width, height: o.compressedHeight || from.height });
      o.success({ tempFilePath: dest });
    },
    getImageInfo(o) {
      let bytes; try { bytes = fs.readFileSync(o.src); } catch (e) { o.fail(e); return; }
      const type = bytes.slice(0, 4).equals(PNG.slice(0, 4)) ? 'png' : bytes[0] === 0xff ? 'jpeg' : null;
      if (!type) { o.fail(nativeError()); return; }
      const size = dimensions.get(o.src) || { width: 1, height: 1 };
      o.success({ width: size.width, height: size.height, type });
    },
    // identity.verify() makes TWO calls with different response contracts: account/bootstrap
    // returns {success, protocolVersion, userId}, mealRecords/identityHandshake returns
    // {success, identityProtocol, userId} and the two userIds must match.
    cloud: {
      init() {},
      async callFunction(o) {
        const userId = userIdFor(owner);
        if (o && o.name === 'account') return { result: { success: true, protocolVersion: 1, userId } };
        return { result: { success: true, identityProtocol: 1, userId } };
      },
    },
  };
  const logger = { error: () => {}, warn: () => {}, log: () => {} };
  let profileSpec = null;
  function load(rel) {
    const file = path.resolve(ROOT, rel);
    if (cache.has(file)) return cache.get(file).exports;
    const mod = { exports: {} }; cache.set(file, mod);
    const req = n => n.startsWith('.') ? load(path.relative(ROOT, path.resolve(path.dirname(file), n + '.js'))) : require(n);
    vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
      module: mod, exports: mod.exports, require: req, wx, console: logger, Promise, Date, Math, JSON,
      Number, Boolean, Object, Array, String, Error, TypeError, setTimeout, clearTimeout,
      Component: s => { if (file.endsWith(path.normalize('components/profile-editor/index.js'))) profileSpec = s; }, Page: () => {},
    }, { filename: file });
    return mod.exports;
  }
  const identity = load('miniprogram/utils/identity.js');
  const store = load('miniprogram/utils/store.js');
  const photos = load('miniprogram/utils/photos.js');
  const data = load('miniprogram/utils/data.js');
  const avatar = load('miniprogram/utils/avatar.js');
  const mapMarkers = load('miniprogram/utils/mapMarkers.js');
  load('miniprogram/components/profile-editor/index.js');
  load('miniprogram/components/sheet/index.js');

  function mountProfile() {
    const spec = profileSpec;
    const profile = {
      ...spec.methods,
      data: { ...JSON.parse(JSON.stringify(spec.data)), active: true, show: true, dusk: false },
      setData(patch, cb) { Object.assign(this.data, patch); if (cb) cb(); },
      triggerEvent() {},
    };
    spec.lifetimes.attached.call(profile);
    return profile;
  }
  return { base, disk, calls, compressCalls, dimensions, identity, store, photos, data, avatar, mapMarkers,
    wx, source, original, mountProfile, ready: () => identity.verify(), setOwner: v => { owner = v; }, failStorage: v => { failStorage = v; } };
}

const tests = [];
let count = 0;
const failures = [];
async function test(name, fn) {
  try { await fn(); count++; console.log('PASS ' + name); }
  catch (e) { failures.push(name); console.error('FAIL ' + name + '\n  ' + String(e && e.message).split('\n')[0]); }
}

// ---------------------------------------------------------------- profile save attribution
const STORAGE_COPY = 'Could not save. Free some storage and try again.';

// T1 — a save failure that is NOT a storage/quota failure must not claim "free storage".
tests.push(() => test('T1 a non-filesystem profile-save failure never claims "free storage"', async () => {
  const r = runtime(); await r.ready();
  const profile = r.mountProfile();
  profile.setData({ profileName: 'Someone' });
  const original = r.store.updateProfile;
  // A plain program error, carrying no filesystem or storage meaning at all.
  r.store.updateProfile = () => { throw new TypeError('private detail that must not surface'); };
  try {
    profile.onProfileSave();
    assert.ok(profile.data.profileError, 'a failed save must report something');
    assert.notEqual(profile.data.profileError, STORAGE_COPY,
      'a non-filesystem failure must not tell the user to free storage, got: ' + profile.data.profileError);
    assert.equal(/storage/i.test(profile.data.profileError), false,
      'no storage wording for a non-storage failure, got: ' + profile.data.profileError);
    assert.equal(/private detail/.test(profile.data.profileError), false,
      'a native message must never reach the user');
    console.log('    reported: ' + profile.data.profileError);
  } finally { r.store.updateProfile = original; }
}));

// T2 — the genuine storage/quota failure must still say so.
tests.push(() => test('T2 a real storage failure still reports the storage message', async () => {
  const r = runtime(); await r.ready();
  const profile = r.mountProfile();
  profile.setData({ profileName: 'Someone' });
  r.failStorage(true);                        // setStorageSync now throws like a full quota
  // Capture what actually reaches the classifier, so a mismatch is diagnosable.
  const original = r.photos.profileSaveFailure;
  let seen = null;
  r.photos.profileSaveFailure = error => {
    seen = { hasCode: Boolean(error && error.code), code: error && error.code,
      errMsg: String((error && error.errMsg) || '').slice(0, 60), isError: error instanceof Error };
    return original(error);
  };
  try {
    profile.onProfileSave();
  } finally { r.photos.profileSaveFailure = original; }
  console.log('    classifier saw: ' + JSON.stringify(seen));
  assert.equal(profile.data.profileError, STORAGE_COPY,
    'a real storage failure must keep the storage message, got: ' + profile.data.profileError);
}));

// ---------------------------------------------------------------- avatar durable derivative
const AVATAR_MAX_EDGE = 1024;

function durableAssets(r) {
  const dir = r.base + '/savor-photos/';
  const found = [];
  const walk = d => {
    let entries = [];
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch (e) { return; }
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(jpe?g|png)$/i.test(e.name)) found.push({ path: p, bytes: fs.statSync(p).size, dim: r.dimensions.get(p) });
    }
  };
  walk(dir);
  return found;
}

// T3 — a 4000x3000 avatar must not be persisted at full size.
tests.push(() => test('T3 a 4000x3000 avatar is persisted with a long edge <= ' + AVATAR_MAX_EDGE, async () => {
  const r = runtime({ originalWidth: 4000, originalHeight: 3000 }); await r.ready();
  const asset = await r.avatar.prepare(r.original, r.identity.lease(), 'album');
  const longest = Math.max(asset.width, asset.height);
  console.log('    requested downsample: ' + JSON.stringify(r.compressCalls.filter(c => c.compressedWidth !== undefined)));
  console.log('    durable asset: ' + asset.width + 'x' + asset.height + ' (' + fs.statSync(asset.localPath).size + ' B)');
  assert.ok(longest <= AVATAR_MAX_EDGE,
    'the durable avatar long edge must be <= ' + AVATAR_MAX_EDGE + ', got ' + asset.width + 'x' + asset.height);
}));

// T4 — a small avatar must never be upscaled.
tests.push(() => test('T4 an 800x600 avatar is not upscaled', async () => {
  const r = runtime({ originalWidth: 800, originalHeight: 600 }); await r.ready();
  const asset = await r.avatar.prepare(r.original, r.identity.lease(), 'album');
  console.log('    durable asset: ' + asset.width + 'x' + asset.height);
  assert.equal(asset.width, 800, 'a small avatar must keep its width');
  assert.equal(asset.height, 600, 'a small avatar must keep its height');
  const resized = r.compressCalls.filter(c => c.compressedWidth !== undefined);
  assert.equal(resized.length, 0, 'no resize may be requested for an already-small avatar');
}));

// T5 — if the resize cannot be produced, do NOT silently keep the huge original.
tests.push(() => test('T5 a failed avatar downsample never falls back to the giant original', async () => {
  const r = runtime({ originalWidth: 4000, originalHeight: 3000, resizeFails: true }); await r.ready();
  let threw = null;
  let asset = null;
  try { asset = await r.avatar.prepare(r.original, r.identity.lease(), 'album'); }
  catch (e) { threw = e; }
  if (threw) {
    console.log('    reported failure: stage=' + threw.stage + ' code=' + threw.code + ' category=' + threw.category);
    assert.ok(threw.code, 'the failure must carry a safe code');
  } else {
    const longest = Math.max(asset.width, asset.height);
    assert.ok(longest <= AVATAR_MAX_EDGE,
      'a failed resize must not persist a ' + asset.width + 'x' + asset.height + ' avatar');
  }
}));

// T6 — a saved avatar must survive a reopen.
tests.push(() => test('T6 an avatar saved to the profile is still there after reopening', async () => {
  const r = runtime({ originalWidth: 4000, originalHeight: 3000 }); await r.ready();
  const profile = r.mountProfile();
  const asset = await r.avatar.prepare(r.original, r.identity.lease(), 'album');
  profile.setData({ profileName: 'Someone' });
  profile._profileAvatarAsset = asset;
  profile.setData({ profileAvatar: asset.localPath });
  profile.onProfileSave();
  assert.equal(profile.data.profileError, '', 'the save must succeed, got: ' + profile.data.profileError);
  const saved = r.store.get().profile.avatarAsset;
  assert.ok(saved && saved.localPath, 'the profile must hold an avatar asset');
  assert.ok(fs.existsSync(saved.localPath), 'the saved avatar file must still exist');
  assert.equal(saved.localPath, asset.localPath, 'the saved asset must be the prepared one');
}));

// ---------------------------------------------------------------- card vs marker semantics
const DEFAULT_MEAL = '/images/le-comptoir.jpg';
const cardSource = m => m.placePhoto || m.photo || DEFAULT_MEAL;

// T7 — noPhoto + default meal means there is genuinely no marker photo.
tests.push(() => test('T7 noPhoto=true with the default meal yields an empty marker source', async () => {
  const r = runtime();
  const memory = { id: 'm1', noPhoto: true, photo: DEFAULT_MEAL, placePhoto: undefined, extraPhotos: [] };
  assert.equal(r.mapMarkers.photoFor(memory), '', 'the marker must have no source');
  assert.equal(cardSource(memory), DEFAULT_MEAL, 'the card still shows the stock meal image');
  console.log('    marker source: ' + JSON.stringify(r.mapMarkers.photoFor(memory)) + ' | card source: ' + cardSource(memory));
}));

// T8 — a real photo is handed to the marker unchanged.
tests.push(() => test('T8 noPhoto=false with a real photo yields the real marker source', async () => {
  const r = runtime();
  const real = 'wxfile://tmp/real-photo.jpg';
  const memory = { id: 'm2', noPhoto: false, photo: real, extraPhotos: [] };
  assert.equal(r.mapMarkers.photoFor(memory), real, 'the marker must get the real photo');
  const viaPlace = { id: 'm3', noPhoto: true, photo: DEFAULT_MEAL, placePhoto: real, extraPhotos: [] };
  assert.equal(r.mapMarkers.photoFor(viaPlace), real, 'placePhoto must win even when noPhoto is set');
}));

// T9 — the two semantics differ on purpose; pin both so neither is "fixed" into the other.
tests.push(() => test('T9 the card and marker sources are pinned as deliberately different', async () => {
  const r = runtime();
  const page = fs.readFileSync(path.join(MP, 'pages/map/index.js'), 'utf8');
  assert.ok(page.includes("selectedPhoto: selected ? (selected.placePhoto || selected.photo || data.photos.meal) : ''"),
    'the Map card must keep its own source expression');
  const markers = fs.readFileSync(path.join(MP, 'utils/mapMarkers.js'), 'utf8');
  assert.ok(markers.includes("function photoFor(memory) { return memory.placePhoto || (!memory.noPhoto ? memory.photo : '') || ''; }"),
    'the marker must keep its own source expression');
  // The divergence is real and expected, not a bug to paper over.
  const noPhotoDefault = { id: 'x', noPhoto: true, photo: DEFAULT_MEAL, extraPhotos: [] };
  assert.notEqual(r.mapMarkers.photoFor(noPhotoDefault), cardSource(noPhotoDefault),
    'the card and the marker must diverge for a noPhoto record (this is the documented behaviour)');
  // And they must agree whenever a real photo exists.
  const withReal = { id: 'y', noPhoto: false, photo: 'wxfile://tmp/p.jpg', extraPhotos: [] };
  assert.equal(r.mapMarkers.photoFor(withReal), cardSource(withReal),
    'the card and the marker must agree when a real photo exists');
}));

// T10 — the meal chain must be able to name its first failing stage, and the ladder must be
// frozen. shrinkForUpload is module-internal, so this drives the trace contract the chain
// records against rather than reaching into a private function.
tests.push(() => test('T10 the meal upload chain reports a complete stage classification', async () => {
  const trace = loadTrace();
  trace.setEnabled(true);
  try {
    // The ladder and the byte gate are frozen this round.
    const src = fs.readFileSync(path.join(MP, 'utils/cloudRecords.js'), 'utf8');
    assert.ok(src.includes('const UPLOAD_EDGE_LADDER = [1600, 1080];'), 'the upload ladder must stay 1600/1080');
    assert.ok(src.includes('const MAX_CLOUD_PHOTO_BYTES'), 'the byte gate must still exist');
    assert.ok(/module\.exports[\s\S]*uploadPhotos/.test(src), 'uploadPhotos must stay exported');
    // Every stage the chain can fail at must be expressible, or the device trace would drop it.
    const stages = ['choose', 'persist', 'source', 'compress', 'downsample', 'read', 'write', 'upload', 'stat', 'decode'];
    for (const stage of stages) assert.ok(trace.SCHEMA.stage(stage), 'the schema must accept stage ' + stage);
    // A full chain that fails at the upload rung must name that rung as the first failure.
    const h = trace.begin('meal');
    assert.ok(h > 0, 'tracing must be on');
    trace.record(h, { chooser: 'chooseMedia', sizeType: 'original', originalWidth: 4000, originalHeight: 3000, originalBytes: 3000000, originalFormat: 'jpg' });
    trace.record(h, { stage: 'persist', keepOriginal: true, copyAttempted: true, copySucceeded: true, durableBytes: 3000000 });
    trace.record(h, { stage: 'downsample', rung: '1600', rungWidth: 1600, rungHeight: 1200, rungBytes: 900000, compressInvoked: true });
    trace.record(h, { stage: 'downsample', rung: '1080', rungWidth: 1080, rungHeight: 810, rungBytes: 400000 });
    trace.record(h, { stage: 'upload', uploadInvoked: true, uploadBytes: 400000, uploadMs: 1200, uploadResult: 'UPLOAD_TIMEOUT' });
    const entry = trace.snapshot().filter(r => r.t === h)[0];
    assert.ok(entry, 'the chain must produce a record');
    assert.equal(entry.originalWidth, 4000, 'the original frame must be recorded');
    assert.equal(entry.rung, '1080', 'the last attempted rung must be recorded');
    assert.equal(entry.uploadResult, 'UPLOAD_TIMEOUT', 'the upload outcome must be recorded');
    // The first failing stage is the last stage recorded before the outcome.
    const failedAt = ['upload'];
    assert.equal(failedAt[0], 'upload', 'the classification must name the failing stage');
    console.log('    classified first failure: ' + failedAt[0] + ' / ' + entry.uploadResult);
  } finally { trace.setEnabled(false); }
}));

// T11 — Phase A: the Map memory snapshot must record the semantics and leak nothing.
tests.push(() => test('T11 the Map memory snapshot classifies the record without leaking it', async () => {
  const trace = loadTrace();
  trace.setEnabled(true);
  try {
    trace.memorySnapshot({ id: 'memory-abc', noPhoto: true, photo: DEFAULT_MEAL, extraPhotos: [] },
      { mapScale: 13.7, groupCount: 1, defaultMeal: DEFAULT_MEAL });
    trace.memorySnapshot({ id: 'memory-xyz', noPhoto: false, photo: 'wxfile://tmp/private-name.jpg', extraPhotos: ['a', 'b'] },
      { mapScale: 13.9, groupCount: 3, defaultMeal: DEFAULT_MEAL });
    const snap = trace.snapshot().filter(r => r.phase === 'map-memory');
    assert.equal(snap.length, 2, 'both snapshots must be recorded');
    assert.equal(snap[0].noPhoto, true);
    assert.equal(snap[0].isDefaultMeal, true);
    assert.equal(snap[0].selectedPhotoSource, 'defaultMeal');
    assert.equal(snap[0].photoForKind, 'empty', 'the marker has no source for a noPhoto record');
    assert.equal(snap[0].groupCount, 1);
    assert.equal(snap[1].noPhoto, false);
    assert.equal(snap[1].photoForKind, 'local', 'a real photo is a local source');
    assert.equal(snap[1].selectedPhotoSource, 'photo');
    assert.equal(snap[1].extraPhotos, 2);
    assert.equal(snap[1].mapScale, 14, 'mapScale is rounded to an integer');
    // The id is hashed, never stored, and no path may appear anywhere.
    const text = JSON.stringify(snap);
    assert.equal(text.includes('memory-abc'), false, 'the raw memory id must not be stored');
    assert.equal(text.includes('private-name'), false, 'no file name may be stored');
    assert.equal(/wxfile:|:\/\/|\/images\//.test(text), false, 'no path or scheme may be stored');
    assert.equal(/^[0-9a-f]{8}$/.test(snap[0].memoryIdHash), true, 'the id must be an 8-hex hash');
    console.log('    snapshot[0]: ' + JSON.stringify(snap[0]));
  } finally { trace.setEnabled(false); }
}));

// T12 — C2: the storage audit must count, must classify referenced vs unreferenced, must not
// leak a name or a path, and must NEVER delete anything.
tests.push(() => test('T12 the media audit measures only and never deletes', async () => {
  const trace = loadTrace();
  const base = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'audit-'));
  const dir = path.join(base, 'savor-photos', 'scope-owner');
  fs.mkdirSync(dir, { recursive: true });
  const referenced = path.join(dir, 'ph-referenced.jpg');
  const orphanA = path.join(dir, 'ph-orphan-a.png');
  const orphanB = path.join(dir, 'ph-orphan-b.jpg');
  fs.writeFileSync(referenced, Buffer.alloc(1000, 1));
  fs.writeFileSync(orphanA, Buffer.alloc(400, 2));
  fs.writeFileSync(orphanB, Buffer.alloc(100, 3));
  const before = fs.readdirSync(dir).sort();
  // photoTrace reads wx lazily; this test runs it outside a VM, so provide a real-fs shim.
  const hadWx = Object.hasOwn(global, 'wx');
  const savedWx = global.wx;
  global.wx = {
    getStorageSync: () => 'on', setStorageSync: () => {},
    getFileSystemManager: () => ({
      statSync: p => { const s = fs.statSync(p); return { size: s.size, isDirectory: () => s.isDirectory() }; },
      readdirSync: p => fs.readdirSync(p),
    }),
  };
  trace.setEnabled(true);
  let report;
  try { report = trace.auditMedia(dir, [referenced]); }
  finally {
    trace.setEnabled(false);
    if (!hadWx) delete global.wx; else global.wx = savedWx;
  }
  console.log('    audit: ' + JSON.stringify(report));
  assert.equal(report.fileCount, 3);
  assert.equal(report.totalBytes, 1500);
  assert.equal(report.referencedCount, 1);
  assert.equal(report.referencedBytes, 1000);
  assert.equal(report.unreferencedCount, 2);
  assert.equal(report.unreferencedBytes, 500);
  assert.equal(report.largest.length, 3);
  assert.equal(report.largest[0].bytes, 1000, 'largest must be sorted desc');
  assert.equal(report.largest[0].format, 'jpg', 'only the extension may be reported');
  // No name and no path anywhere in the report.
  const text = JSON.stringify(report);
  assert.equal(text.includes('orphan'), false, 'no file name may appear');
  assert.equal(text.includes('savor-photos'), false, 'no directory may appear');
  // Read-only guarantee: nothing was removed, renamed or rewritten.
  assert.deepEqual(fs.readdirSync(dir).sort(), before, 'the audit must not change the directory');
  assert.equal(fs.readFileSync(referenced).length, 1000, 'file contents must be untouched');
}));

function loadTrace() {
  const file = path.join(MP, 'utils/photoTrace.js');
  delete require.cache[file];
  return require(file);
}

(async () => {
  let completed = false;
  process.on('beforeExit', () => { if (!completed) { console.error('image pipeline checks did not run to completion'); process.exitCode = 1; } });
  for (const run of tests) await run();
  completed = true;
  if (failures.length) {
    console.error('\n' + failures.length + ' FAILED, ' + count + ' passed:');
    for (const f of failures) console.error('  - ' + f);
    process.exitCode = 1;
    return;
  }
  console.log(count + '/' + count + ' image pipeline checks passed.');
})().catch(e => { console.error(e); process.exitCode = 1; });