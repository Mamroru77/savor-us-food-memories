'use strict';
// GC1..GC15 for the local media garbage collector and the quota classifier.
//
// The collector decides what may be DELETED from the user's device, so every rule that keeps a
// file is a safety rule. The harness is a disk-backed filesystem so the tests can assert on real
// file existence rather than on a mock's call log.
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');

const ROOT = path.resolve(__dirname, '..');

function runtime(opts) {
  opts = opts || {};
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-'));
  const ownerA = 'u_' + 'a'.repeat(48);
  const ownerB = 'u_' + 'b'.repeat(48);

  let unlinkFailFor = opts.unlinkFailFor || null;      // exact path whose unlink must throw
  const unlinked = [];
  const FS = {
    accessSync: p => fs.accessSync(p),
    mkdirSync: (p, r) => fs.mkdirSync(p, { recursive: r }),
    statSync(p) { const s = fs.statSync(p); return { size: s.size, isDirectory: () => s.isDirectory() }; },
    readdirSync: p => fs.readdirSync(p),
    unlinkSync(p) {
      if (unlinkFailFor && p === unlinkFailFor) { const e = new Error('unlink denied'); e.errMsg = 'unlinkSync:fail permission denied'; throw e; }
      fs.unlinkSync(p); unlinked.push(p);
    },
    copyFileSync: (a, b) => fs.copyFileSync(a, b),
    readFileSync: (p, e) => fs.readFileSync(p, e),
    writeFileSync: (p, d, e) => fs.writeFileSync(p, d, e),
  };
  const wx = {
    env: { USER_DATA_PATH: base },
    getFileSystemManager: () => FS,
    getStorageSync: () => '', setStorageSync: () => {}, removeStorageSync: () => {},
  };
  // Android reports USER_DATA_PATH as a 'wxfile://...' url, so every durable path the app builds
  // carries that scheme. With this option the module sees the scheme while the harness still
  // reads and writes real files underneath it.
  if (opts.wxfileScheme) {
    wx.env.USER_DATA_PATH = 'wxfile://' + base;
    const strip = p => String(p).replace(/^wxfile:\/\//, '');
    const wrap = fn => p => fn(strip(p));
    const wrap2 = fn => (a, b) => fn(strip(a), strip(b));
    FS.accessSync = wrap(p => fs.accessSync(p));
    FS.mkdirSync = (p, r) => fs.mkdirSync(strip(p), { recursive: r });
    FS.statSync = wrap(p => { const s = fs.statSync(p); return { size: s.size, isDirectory: () => s.isDirectory() }; });
    FS.readdirSync = wrap(p => fs.readdirSync(p));
    FS.unlinkSync = wrap(p => {
      if (unlinkFailFor && String(p).replace(/^wxfile:\/\//, '') === unlinkFailFor) {
        const e = new Error('unlink denied'); e.errMsg = 'unlinkSync:fail permission denied'; throw e;
      }
      fs.unlinkSync(p); unlinked.push(String(p));
    });
    FS.copyFileSync = wrap2((a, b) => fs.copyFileSync(a, b));
    FS.readFileSync = (p, e) => fs.readFileSync(strip(p), e);
    FS.writeFileSync = (p, dd, e) => fs.writeFileSync(strip(p), dd, e);
  }
  // A minimal identity double: the GC logic depends on the owner scope, not on identity's
  // internals, so a token that simply names an owner is the right level of fidelity here.
  const identity = {
    lease: () => ({ userId: ownerA, generation: 1, namespace: 'fixture' }),
    assertLease(token) { if (!token || !token.userId) { const e = new Error('stale'); e.code = 'STALE_IDENTITY'; throw e; } },
  };
  const runtimeConfig = { fileScope: 'scope' };
  const photoTrace = { on: () => false, extOf: p => { const m = /\.([a-z0-9]+)$/i.exec(String(p)); return m ? m[1].toLowerCase() : 'unknown'; } };

  const cache = new Map();
  function load(rel) {
    const file = path.resolve(ROOT, rel);
    if (cache.has(file)) return cache.get(file).exports;
    const mod = { exports: {} }; cache.set(file, mod);
    const req = n => {
      if (n === './identity') return identity;
      if (n === './runtimeConfig') return runtimeConfig;
      if (n === './photoTrace') return photoTrace;
      if (n.startsWith('.')) return load(path.relative(ROOT, path.resolve(path.dirname(file), n + '.js')));
      return require(n);
    };
    vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
      module: mod, exports: mod.exports, require: req, wx, console: { error() {}, warn() {}, log() {} },
      Promise, Date, Math, JSON, Number, Boolean, Object, Array, String, Error, TypeError, RegExp, Set, Map,
      setTimeout, clearTimeout,
    }, { filename: file });
    return mod.exports;
  }
  const photos = load('miniprogram/utils/photos.js');

  // Ask the module itself for the directories instead of re-deriving the layout: photosDir()
  // concatenates fileScope and userId with no separator, so a hand-written path is wrong.
  const tokenA = { userId: ownerA, generation: 1, namespace: 'fixture' };
  const tokenB = { userId: ownerB, generation: 1, namespace: 'fixture' };
  const dirA = photos.photosDir(tokenA);
  const dirB = photos.photosDir(tokenB);
  // The harness reads and writes the REAL location; the module sees whatever photosDir returns.
  const real = p => String(p).replace(/^wxfile:\/\//, '');
  fs.mkdirSync(real(dirA), { recursive: true });
  fs.mkdirSync(real(dirB), { recursive: true });

  const mk = (dir, name, bytes) => { const p = dir + '/' + name; fs.writeFileSync(real(p), Buffer.alloc(bytes, 1)); return p; };
  const media = (dir, tag, bytes) => mk(dir, 'ph-' + tag + '-x' + tag + '.jpg', bytes);
  const avatarFile = (dir, hex, bytes) => mk(dir, 'avatar-' + hex + '.jpg', bytes);

  return { base, dirA, dirB, ownerA, ownerB, photos, mk, media, avatarFile, unlinked,
    setUnlinkFail: p => { unlinkFailFor = p; },
    exists: p => fs.existsSync(real(p)),
    tokenA, tokenB };
}

const results = [];
let count = 0;
const failures = [];
function test(name, fn) {
  try { fn(); count++; console.log('PASS ' + name); }
  catch (e) { failures.push(name); console.error('FAIL ' + name + '\n  ' + String(e && e.message).split('\n')[0]); }
}

const emptyState = () => ({ memories: [], outbox: [], profile: {}, draft: null });

// GC1 - a referenced file is never deleted.
test('GC1 referenced media is not deleted', () => {
  const r = runtime();
  const keep = r.media(r.dirA, 'keep', 1000);
  const orphan = r.media(r.dirA, 'orphan', 500);
  const state = Object.assign(emptyState(), { memories: [{ id: 'm1', photo: keep }] });
  const audit = r.photos.auditOrphanMedia(r.tokenA, state);
  assert.equal(audit.fileCount, 2);
  assert.equal(audit.referenced.count, 1);
  assert.equal(audit.referenced.bytes, 1000);
  assert.equal(audit.orphan.count, 1);
  const gc = r.photos.gcOrphanMedia(r.tokenA, state, { dryRun: false });
  assert.equal(gc.deletedCount, 1);
  assert.equal(r.exists(keep), true, 'a referenced file must survive');
  assert.equal(r.exists(orphan), false);
});

// GC2 - orphans are deleted (the actual reclaim).
test('GC2 orphan media is deleted', () => {
  const r = runtime();
  const a = r.media(r.dirA, 'a', 700), b = r.media(r.dirA, 'b', 300);
  const gc = r.photos.gcOrphanMedia(r.tokenA, emptyState(), { dryRun: false });
  assert.equal(gc.deletedCount, 2);
  assert.equal(gc.deletedBytes, 1000);
  assert.equal(r.exists(a), false);
  assert.equal(r.exists(b), false);
});

// GC3 - the collector never crosses an owner boundary.
test('GC3 another owner\'s media is not deleted', () => {
  const r = runtime();
  const other = r.media(r.dirB, 'other', 900);
  const gc = r.photos.gcOrphanMedia(r.tokenA, emptyState(), { dryRun: false });
  assert.equal(gc.deletedCount, 0, 'owner A must not touch owner B');
  assert.equal(r.exists(other), true);
  assert.equal(r.unlinked.length, 0);
});

// GC4 - one failing unlink must not abort the sweep.
test('GC4 a failing unlink does not stop the others', () => {
  const r = runtime();
  const bad = r.media(r.dirA, 'bad', 100);
  const ok1 = r.media(r.dirA, 'ok1', 200);
  const ok2 = r.media(r.dirA, 'ok2', 300);
  r.setUnlinkFail(bad);
  const gc = r.photos.gcOrphanMedia(r.tokenA, emptyState(), { dryRun: false });
  assert.equal(gc.deletedCount, 2, 'the other two must still be deleted');
  assert.equal(gc.failedCount, 1);
  assert.equal(gc.failures[0].code, 'UNLINK_FAILED');
  assert.equal(r.exists(bad), true, 'the failed file stays');
  assert.equal(r.exists(ok1), false);
  assert.equal(r.exists(ok2), false);
});

// GC5 - idempotent: a second sweep finds nothing.
test('GC5 a second GC deletes zero', () => {
  const r = runtime();
  r.media(r.dirA, 'a', 100); r.media(r.dirA, 'b', 200);
  const first = r.photos.gcOrphanMedia(r.tokenA, emptyState(), { dryRun: false });
  assert.equal(first.deletedCount, 2);
  const second = r.photos.gcOrphanMedia(r.tokenA, emptyState(), { dryRun: false });
  assert.equal(second.deletedCount, 0);
  assert.equal(second.deletedBytes, 0);
  assert.equal(second.failedCount, 0);
  assert.equal(second.orphan.count, 0);
});

// GC6 - after a confirmed upload and the state switching to the cloud id, release the copy.
test('GC6 a cloud-replaced local copy is released after the state commits', () => {
  const r = runtime();
  const local = r.media(r.dirA, 'up', 5000);
  const uploads = {}; uploads[local] = 'cloud://env.bucket/dining/x/0.jpg';
  const committed = Object.assign(emptyState(), { memories: [{ id: 'm1', photo: 'cloud://env.bucket/dining/x/0.jpg', noPhoto: false }] });
  const rel = r.photos.releaseUploadedLocalCopies(uploads, r.tokenA, committed);
  assert.equal(rel.deletedCount, 1);
  assert.equal(rel.deletedBytes, 5000);
  assert.equal(r.exists(local), false);
});

// GC7 - a failed upload keeps the local file (the user must be able to retry).
test('GC7 a failed upload keeps the local file', () => {
  const r = runtime();
  const local = r.media(r.dirA, 'fail', 4000);
  const uploads = {}; uploads[local] = null;                 // no cloud id was ever assigned
  const rel = r.photos.releaseUploadedLocalCopies(uploads, r.tokenA, emptyState());
  assert.equal(rel.deletedCount, 0);
  assert.equal(r.exists(local), true);
});

// GC8 - if the state never committed the cloud ref, the local file is still the only copy.
test('GC8 a state that still points locally keeps the local file', () => {
  const r = runtime();
  const local = r.media(r.dirA, 'nocommit', 3000);
  const uploads = {}; uploads[local] = 'cloud://env.bucket/dining/x/1.jpg';
  const notCommitted = Object.assign(emptyState(), { memories: [{ id: 'm1', photo: local, noPhoto: false }] });
  const rel = r.photos.releaseUploadedLocalCopies(uploads, r.tokenA, notCommitted);
  assert.equal(rel.deletedCount, 0, 'the state still depends on the local path');
  assert.equal(r.exists(local), true);
});

// GC9 - an outbox entry still depending on the local path keeps it.
test('GC9 an outbox dependency keeps the local file', () => {
  const r = runtime();
  const local = r.media(r.dirA, 'outbox', 2000);
  const uploads = {}; uploads[local] = 'cloud://env.bucket/dining/x/2.jpg';
  const state = Object.assign(emptyState(), { outbox: [{ id: 'op1', memory: { id: 'm1', photo: local } }] });
  assert.equal(r.photos.releaseUploadedLocalCopies(uploads, r.tokenA, state).deletedCount, 0);
  assert.equal(r.exists(local), true);
  // ...and a path merely cached as an in-flight upload attempt also counts.
  const state2 = Object.assign(emptyState(), { outbox: [{ id: 'op2', uploads: { [local]: 'cloud://x' } }] });
  assert.equal(r.photos.releaseUploadedLocalCopies(uploads, r.tokenA, state2).deletedCount, 0);
  assert.equal(r.exists(local), true);
});

// GC10 - two memories sharing one local file: replacing one must not delete it.
test('GC10 a shared local file survives one memory being cloud-replaced', () => {
  const r = runtime();
  const shared = r.media(r.dirA, 'shared', 6000);
  const uploads = {}; uploads[shared] = 'cloud://env.bucket/dining/x/3.jpg';
  const state = Object.assign(emptyState(), {
    memories: [{ id: 'A', photo: 'cloud://env.bucket/dining/x/3.jpg' }, { id: 'B', placePhoto: shared }],
  });
  assert.equal(r.photos.releaseUploadedLocalCopies(uploads, r.tokenA, state).deletedCount, 0,
    'memory B still references it');
  assert.equal(r.exists(shared), true);
});

// GC11 - once the LAST reference also switches to cloud, it is released.
test('GC11 the file is released only after the last reference switches to cloud', () => {
  const r = runtime();
  const shared = r.media(r.dirA, 'last', 6000);
  const uploads = {}; uploads[shared] = 'cloud://env.bucket/dining/x/4.jpg';
  const bothCloud = Object.assign(emptyState(), {
    memories: [{ id: 'A', photo: 'cloud://env.bucket/dining/x/4.jpg' }, { id: 'B', placePhoto: 'cloud://env.bucket/dining/x/5.jpg' }],
  });
  const rel = r.photos.releaseUploadedLocalCopies(uploads, r.tokenA, bothCloud);
  assert.equal(rel.deletedCount, 1);
  assert.equal(r.exists(shared), false);
});

// GC12 - the device's real quota message is classified as a quota failure.
test('GC12 the native quota message classifies as FILE_QUOTA_EXCEEDED', () => {
  const r = runtime();
  const native = { errMsg: "copyFileSync:fail the maximum size of the file storage limit is exceeded, copyFile 'x' -> 'y'" };
  const e = r.photos.logFailure(native, 'copy');
  assert.equal(e.code, 'FILE_QUOTA_EXCEEDED');
  assert.equal(e.stage, 'copy');
  assert.equal(e.category, 'filesystem');
  // ...and the profile-save classifier turns that into the storage message.
  assert.equal(r.photos.profileSaveFailure(e).category, 'storage');
});

// GC13 - an ordinary copy failure must NOT be dressed up as a quota failure.
test('GC13 an ordinary copy failure is not misclassified as quota', () => {
  const r = runtime();
  const e = r.photos.logFailure({ errMsg: 'copyFileSync:fail no such file or directory' }, 'copy');
  assert.equal(e.code, 'COPY_FAILED');
  assert.notEqual(e.code, 'FILE_QUOTA_EXCEEDED');
  assert.notEqual(r.photos.profileSaveFailure(e).category, 'storage',
    'an unclassified failure must not claim storage exhaustion');
  const w = r.photos.logFailure({ errMsg: 'writeFileSync:fail invalid parameter' }, 'write');
  assert.equal(w.code, 'WRITE_FAILED');
});

// GC14 - the avatar asset is a reference like any other.
test('GC14 a file referenced by avatarAsset is not deleted', () => {
  const r = runtime();
  const avatar = r.avatarFile(r.dirA, 'a'.repeat(64), 1234);
  const orphan = r.media(r.dirA, 'z', 100);
  const state = Object.assign(emptyState(), { profile: { avatarAsset: { localPath: avatar } } });
  const audit = r.photos.auditOrphanMedia(r.tokenA, state);
  assert.equal(audit.referenced.count, 1);
  const gc = r.photos.gcOrphanMedia(r.tokenA, state, { dryRun: false });
  assert.equal(gc.deletedCount, 1);
  assert.equal(r.exists(avatar), true, 'the avatar must survive');
  assert.equal(r.exists(orphan), false);
});

// GC15 - the open draft is a reference too.
test('GC15 a file referenced by the draft is not deleted', () => {
  const r = runtime();
  const draftPhoto = r.media(r.dirA, 'draft', 800);
  const draftPlace = r.media(r.dirA, 'place', 400);
  const state = Object.assign(emptyState(), { draft: { photos: [draftPhoto], placePhoto: draftPlace } });
  const audit = r.photos.auditOrphanMedia(r.tokenA, state);
  assert.equal(audit.referenced.count, 2);
  assert.equal(r.photos.gcOrphanMedia(r.tokenA, state, { dryRun: false }).deletedCount, 0);
  assert.equal(r.exists(draftPhoto), true);
  assert.equal(r.exists(draftPlace), true);
});

// GC16 - dry run must be the default and must never unlink.
test('GC16 dryRun never unlinks and is the default', () => {
  const r = runtime();
  const a = r.media(r.dirA, 'dry', 100);
  const explicit = r.photos.gcOrphanMedia(r.tokenA, emptyState(), { dryRun: true });
  assert.equal(explicit.dryRun, true);
  assert.equal(explicit.deletedCount, 0);
  assert.equal(r.exists(a), true);
  const dflt = r.photos.gcOrphanMedia(r.tokenA, emptyState());
  assert.equal(dflt.dryRun, true, 'the destructive mode must be asked for explicitly');
  assert.equal(dflt.deletedCount, 0);
  assert.equal(r.unlinked.length, 0);
});

// GC17 - non-media and foreign-named files are never candidates.
test('GC17 files the app did not create are left alone', () => {
  const r = runtime();
  const foreign = r.mk(r.dirA, 'something-else.jpg', 500);
  const noExt = r.mk(r.dirA, 'ph-abc-def', 500);
  const traversal = r.mk(r.dirA, 'ph-a-b.jpg', 10);
  const gc = r.photos.gcOrphanMedia(r.tokenA, emptyState(), { dryRun: false });
  assert.equal(gc.deletedCount, 1, 'only the well-formed ph- file is a candidate');
  assert.equal(r.exists(foreign), true);
  assert.equal(r.exists(noExt), true);
  assert.equal(r.exists(traversal), false);
});

// GC18 - the report shape never carries a path or a name.
test('GC18 the audit report exposes sizes and extensions only', () => {
  const r = runtime();
  r.media(r.dirA, 'secret', 4321);
  const audit = r.photos.auditOrphanMedia(r.tokenA, emptyState());
  assert.deepEqual(Object.keys(audit.largest[0]).sort(), ['bytes', 'format']);
  const text = JSON.stringify({ fileCount: audit.fileCount, totalBytes: audit.totalBytes, referenced: audit.referenced, orphan: audit.orphan, largest: audit.largest });
  assert.equal(text.includes('secret'), false, 'no file name may appear');
  assert.equal(text.includes(r.base.replace(/\\/g, '/')), false, 'no directory may appear');
  assert.equal(/ph-|avatar-/.test(text), false, 'no generated name may appear');
});

// GC19 - REGRESSION for a real-device bug. On Android wx.env.USER_DATA_PATH starts with
// 'wxfile://', so every durable path carries that scheme. An earlier isLocalRef() rejected the
// scheme outright, which made the user's own avatar file look like an orphan - the GC would have
// deleted a referenced file. This pins the fix.
test('GC19 a wxfile://-prefixed durable reference is still a reference', () => {
  const r = runtime({ wxfileScheme: true });
  const avatar = r.avatarFile(r.dirA, 'b'.repeat(64), 70000);
  const orphan = r.media(r.dirA, 'orph', 100);
  // The module now builds scheme-prefixed paths; the files are the same real files.
  assert.equal(r.dirA.indexOf('wxfile://'), 0, 'the harness must exercise the scheme');
  const state = Object.assign(emptyState(), { profile: { avatarAsset: { localPath: avatar } } });
  const refs = r.photos.collectReferencedLocalMedia(state, r.tokenA);
  assert.equal(refs.size, 1, 'the scheme-prefixed durable path must be collected as a reference');
  const audit = r.photos.auditOrphanMedia(r.tokenA, state);
  assert.equal(audit.referenced.count, 1, 'the avatar must count as referenced');
  assert.equal(audit.orphan.count, 1);
  const gc = r.photos.gcOrphanMedia(r.tokenA, state, { dryRun: false });
  assert.equal(gc.deletedCount, 1, 'only the true orphan may be deleted');
  assert.equal(r.exists(avatar), true, 'THE AVATAR MUST SURVIVE - this is the regression');
  assert.equal(r.exists(orphan), false);
});

// GC20 - a genuine temp wxfile:// path (outside the durable dir) is never a candidate.
test('GC20 a temp wxfile:// path is not treated as durable media', () => {
  const r = runtime();
  const temp = 'wxfile://tmp_a1b2c3d4.jpg';
  const state = Object.assign(emptyState(), { memories: [{ id: 'm', photo: temp }] });
  assert.equal(r.photos.collectReferencedLocalMedia(state, r.tokenA).size, 0,
    'a temp path is not a durable reference');
  assert.equal(r.photos.gcOrphanMedia(r.tokenA, state, { dryRun: false }).deletedCount, 0);
});

// GC21 - replacing an avatar must reclaim the previous file, not leave it as a permanent orphan.
test('GC21 replacing an avatar reclaims the old file and keeps the new one', () => {
  const r = runtime();
  const A = r.avatarFile(r.dirA, 'a'.repeat(64), 60000);
  const B = r.avatarFile(r.dirA, 'c'.repeat(64), 50000);
  // Before the commit the profile points at A, so A is the referenced one.
  const before = Object.assign(emptyState(), { profile: { avatarAsset: { localPath: A } } });
  assert.equal(r.photos.auditOrphanMedia(r.tokenA, before).referenced.count, 1);
  assert.equal(r.photos.auditOrphanMedia(r.tokenA, before).orphan.count, 1, 'B is not yet committed');
  // The commit switches the profile to B. Only now does A lose its reference.
  const after = Object.assign(emptyState(), { profile: { avatarAsset: { localPath: B } } });
  const audit = r.photos.auditOrphanMedia(r.tokenA, after);
  assert.equal(audit.referenced.count, 1, 'B must be the referenced avatar');
  assert.equal(audit.orphan.count, 1, 'A is now the orphan');
  const gc = r.photos.gcOrphanMedia(r.tokenA, after, { dryRun: false });
  assert.equal(gc.deletedCount, 1);
  assert.equal(r.exists(A), false, 'the replaced avatar must be reclaimed');
  assert.equal(r.exists(B), true, 'the current avatar must survive');
  const stable = r.photos.auditOrphanMedia(r.tokenA, after);
  assert.equal(stable.referenced.count, 1);
  assert.equal(stable.orphan.count, 0, 'the stable state must have no orphans');
  assert.equal(stable.orphan.bytes, 0);
});

// GC22 - a failed save must never cost the user their current avatar.
test('GC22 a failed save keeps the profile on the old avatar, which is therefore kept', () => {
  const r = runtime();
  const A = r.avatarFile(r.dirA, 'd'.repeat(64), 60000);
  // The save failed, so the committed state still points at A. The reclaim must delete nothing.
  const state = Object.assign(emptyState(), { profile: { avatarAsset: { localPath: A } } });
  const gc = r.photos.gcOrphanMedia(r.tokenA, state, { dryRun: false });
  assert.equal(gc.deletedCount, 0, 'a live avatar must never be reclaimed');
  assert.equal(r.exists(A), true, 'the previous avatar must survive a failed save');
});

// GC23 - the reclaim must be ordered AFTER the commit, and must recompute the reference set
// rather than deleting "the old avatar" by identity. This pins the store-side ordering.
test('GC23 the reclaim is ordered after the commit and is reference-driven', () => {
  const src = fs.readFileSync(path.join(ROOT, 'miniprogram', 'utils', 'store.js'), 'utf8');
  const at = src.indexOf('function updateProfile(changes)');
  assert.ok(at >= 0, 'updateProfile must exist');
  const body = src.slice(at, src.indexOf('\nfunction ', at + 10));
  const commitAt = body.indexOf('commit(profileRepository.save(state,changes))');
  const gcAt = body.indexOf('gcOrphanMedia');
  assert.ok(commitAt >= 0, 'the commit must be present');
  assert.ok(gcAt > commitAt, 'the reclaim must run strictly AFTER the commit');
  // The reclaim must pass the COMMITTED state (plus the draft), never a path to delete directly.
  assert.ok(/gcOrphanMedia\(undefined, Object\.assign\(\{\}, state, \{ draft \}\)/.test(body),
    'the reclaim must recompute from the committed state plus the draft');
  // No direct filesystem deletion in updateProfile: only the reference-driven reclaim may delete.
  assert.equal(/unlinkSync|rmdirSync|rm -rf/.test(body), false,
    'updateProfile must not delete anything itself');
  assert.equal(/avatarAsset\s*&&\s*[^,]*\bunlink/.test(body), false,
    'the reclaim must not be driven by "this is the old avatar"');
  // And every upload-cleanup call site must likewise sit after its commit.
  const uploadCleanups = src.split('releaseUploadedLocalCopies').length - 1;
  assert.ok(uploadCleanups >= 3, 'the three upload cleanup call sites must remain, found ' + uploadCleanups);
});

(async () => {
  let completed = false;
  process.on('beforeExit', () => { if (!completed) { console.error('media GC checks did not run to completion'); process.exitCode = 1; } });
  completed = true;
  if (failures.length) {
    console.error('\n' + failures.length + ' FAILED, ' + count + ' passed:');
    for (const f of failures) console.error('  - ' + f);
    process.exitCode = 1;
    return;
  }
  console.log(count + '/' + count + ' media GC checks passed.');
})();