const identity = require('./identity');
const trace = require('./photoTrace');
const FS = wx.getFileSystemManager();

// Never log native messages: they may contain owner paths or image data.
// A native quota failure carries NO code and NO errCode, so the old classifier degraded it to
// COPY_FAILED / WRITE_FAILED, which say which stage failed but nothing about why. The device
// message ("the maximum size of the file storage limit is exceeded") is matched here so the
// failure keeps its real meaning. It is inspected, never surfaced.
const QUOTA_NATIVE = /maximum size of the file storage limit|storage limit is exceeded|quota|no space|insufficient/i;
function failure(stage, error) {
  if (error && error.stage && error.category) return error;
  const program = error && ['TypeError', 'ReferenceError', 'SyntaxError'].includes(error.name);
  const native = String((error && (error.errMsg || error.message)) || '');
  const quota = !program && QUOTA_NATIVE.test(native);
  const code = error && (error.code || error.errCode);
  const safeCode = program ? error.name.toUpperCase()
    : quota ? 'FILE_QUOTA_EXCEEDED'
    : /^(?:[A-Z][A-Z0-9_]{1,60}|-?\d{1,10})$/.test(String(code || '')) ? String(code)
    : stage.toUpperCase() + '_FAILED';
  // Quota keeps category 'filesystem' so every existing filesystem decision (including copyIn's
  // read/write fallback) behaves exactly as before; only the CODE gains the extra meaning.
  const category = program ? 'program' : stage === 'identity' || /IDENTITY|DIAGNOSTIC/.test(safeCode) ? 'identity'
    : ['mkdir','copy','read','write','stat','unlink','profile-save'].includes(stage) ? 'filesystem'
    : ['choose','source','compress','decode','preview','me-preview'].includes(stage) ? 'image' : 'program';
  return Object.assign(new Error(safeCode), { stage, code: safeCode, category });
}
function logFailure(error, stage) {
  const e = failure(stage || 'avatar', error);
  console.error('[avatar]', e.stage, e.code);
  return e;
}
// Safe attribution for a photo that could not be prepared. failure() already guarantees a
// path-free stage/code pair; anything unexpected collapses to a generic pair rather than
// letting a native message through.
const SAFE_FAILURE_STAGES = ['choose', 'source', 'compress', 'decode', 'preview', 'me-preview', 'mkdir', 'copy', 'read', 'write', 'stat'];
function safeFailure(error) {
  const stage = SAFE_FAILURE_STAGES.includes(error && error.stage) ? error.stage : 'source';
  const code = error && typeof error.code === 'string' && /^[A-Z][A-Z0-9_]{1,60}$/.test(error.code) ? error.code : 'SOURCE_FAILED';
  return { stage, code };
}
function isCancelled(error) {
  return !!error && (error.code === 'PHOTO_CANCELLED'
    || /^choose(?:Media|Image):fail cancel(?:\b|$)/i.test(error.errMsg || ''));
}
// A profile save writes wx STORAGE through the identity partition cache, not the filesystem.
// Classifying it by the caller's stage label made every failure look like a filesystem/quota
// problem, so a stale lease, a corrupt cache or an unexpected exception all told the user to
// free storage. The category now comes from the error itself, and only a real quota/filesystem
// failure is allowed to use the storage wording; everything else is an unclassified save
// failure. errMsg is inspected here and never surfaced.
const STORAGE_CODES = ['QUOTA_EXCEEDED', 'STORAGE_FULL', 'STORAGE_EXCEEDED', 'DISK_FULL', 'NO_SPACE', 'CACHE_TOO_LARGE', 'FILE_QUOTA_EXCEEDED'];
const STORAGE_ERRMSG = /(exceed|quota|no space|insufficient|storage.{0,12}(?:full|limit|max))/i;
// The chunk storage wraps a failed native write as CACHE_WRITE_FAILED and keeps the original
// error as `cause`, so the quota signal lives one (or more) levels down. Walk the chain.
function quotaish(error) {
  for (let e = error, depth = 0; e && depth < 5; e = e.cause, depth++) {
    if (STORAGE_CODES.includes(String(e.code || ''))) return true;
    if (STORAGE_ERRMSG.test(String(e.errMsg || ''))) return true;
  }
  return false;
}
function profileSaveFailure(error) {
  const code = error && typeof error.code === 'string' && /^[A-Z][A-Z0-9_]{1,60}$/.test(error.code) ? error.code : '';
  if (error && (error.category === 'identity' || error.stage === 'identity')) {
    return { stage: 'profile-save', code: code || 'STALE_IDENTITY', category: 'identity' };
  }
  if (/IDENTITY|DIAGNOSTIC/.test(code)) return { stage: 'profile-save', code, category: 'identity' };
  const quota = quotaish(error);
  return { stage: 'profile-save', code: code || (quota ? 'STORAGE_FULL' : 'PROFILE_SAVE_FAILED'),
    category: quota ? 'storage' : 'unknown' };
}
function assertOwner(token) {
  try { identity.assertLease(token); } catch (e) { throw failure('identity', e); }
}
function photosDir(token) {
  token = token || identity.lease();
  assertOwner(token);
  if(!wx.env || typeof wx.env.USER_DATA_PATH!=='string' || !wx.env.USER_DATA_PATH)throw failure('mkdir',{code:'USER_DATA_PATH_UNAVAILABLE'});
  return wx.env.USER_DATA_PATH + '/savor-photos/' + require('./runtimeConfig').fileScope + token.userId;
}
function ensureDir(token) {
  const dir = photosDir(token);
  try { FS.accessSync(dir); return dir; } catch (e) { /* create below */ }
  try { FS.mkdirSync(dir, true); FS.accessSync(dir); }
  catch (e) { throw failure('mkdir', e); }
  return dir;
}
function isUserPhoto(path) {
  try { return typeof path === 'string' && path.startsWith(photosDir() + '/') && !path.split('/').includes('..'); }
  catch (e) { return false; } // Classification only; never authorizes a write.
}
function callApi(target, method, options, stage) {
  return new Promise((resolve, reject) => {
    try {
      target[method](Object.assign({}, options, { success: resolve, fail: e => reject(failure(stage, e)) }));
    } catch (e) { reject(failure(stage, e)); }
  });
}
async function pick(method, count, token, waitVisible) {
  let result;
  try {
    result = await new Promise((resolve, reject) => {
      wx[method]({count, mediaType:['image'], sizeType:['original','compressed'],
        sourceType:count > 1 ? ['album'] : ['album','camera'], success:resolve, fail:reject});
    });
  } catch (e) {
    if (isCancelled(e)) throw Object.assign(new Error('PHOTO_CANCELLED'), {code:'PHOTO_CANCELLED'});
    throw failure('choose', e);
  }
  // A system chooser hides the mini program, so App.onShow re-verifies identity while this
  // callback is in flight. Resuming here immediately would hand persistence the pre-verification
  // lease, which the next epoch invalidates (STALE_IDENTITY). Wait until the owning page is
  // visible again, then resume: the same owner continues on the fresh lease, a different owner
  // is rejected. The gate is owned by the caller (one waiter per native request).
  if (waitVisible) await waitVisible();
  try { token = await identity.resumeNative(token); } catch (e) { throw failure('identity', e); }
  const files = method === 'chooseImage'
    ? (result.tempFilePaths || []).map(tempFilePath => ({tempFilePath, sizeType:'original'}))
    : result.tempFiles || [];
  return {files, token};
}
// `opts` may be the legacy progress callback, or {waitVisible} for a page that owns a native
// chooser round trip. A caller-level wait is not enough: the chooser callback lands inside this
// function, before the caller regains control.
async function choosePhotos(count, opts, onProgress) {
  if (typeof opts === 'function') { onProgress = opts; opts = null; }
  const waitVisible = opts && opts.waitVisible;
  let token;
  try { token = identity.lease(); } catch (e) { throw logFailure(failure('identity', e)); }
  try {
    let sys = {};
    try { sys = wx.getSystemInfoSync(); } catch (e) { /* default chooser */ }
    const imageFirst = /android/i.test(sys.platform || '') && count > 1 && wx.chooseImage;
    const method = imageFirst || !wx.chooseMedia ? 'chooseImage' : 'chooseMedia';
    let selection;
    // Only chooser failures may open an alternate chooser, never persistence or identity errors.
    try { selection = await pick(method, count, token, waitVisible); }
    catch (e) {
      if (isCancelled(e) || e.stage !== 'choose' || e.category === 'program') throw e;
      logFailure(e);
      const fallback = method==='chooseImage' ? 'chooseMedia' : 'chooseImage';
      if (!wx[fallback]) throw e;
      selection = await pick(fallback, count, token, waitVisible);
    }
    if(!selection.files.length && method==='chooseMedia' && wx.chooseImage)selection=await pick('chooseImage',count,selection.token,waitVisible);
    token = selection.token;
    if (!selection.files.length) throw failure('choose', {code:'NO_PHOTO_SELECTED'});
    const results = [];
    const failures = [];
    let lastError;
    for (let i = 0; i < selection.files.length; i++) {
      assertOwner(token);
      const file = selection.files[i], original = file.sizeType === 'original' || file.size > 2*1024*1024;
      if (onProgress) onProgress({current:i+1, total:selection.files.length, percent:Math.round((i+1)/selection.files.length*100), original});
      try { results.push(await persistPhoto(file.tempFilePath, original, token)); }
      catch (e) {
        if (e.category === 'identity' || e.category === 'program') throw e;
        lastError = logFailure(e);
        failures.push(Object.assign({index:i+1}, safeFailure(lastError)));
      }
    }
    assertOwner(token);
    if (!results.length) throw lastError;
    // A selection that silently loses a photo is worse than one that reports it: the caller can
    // compare `selected` against the returned length and tell the user which position failed.
    // Attached to the array so the existing array-shaped callers (avatar, space) are unchanged.
    results.failures = failures;
    results.selected = selection.files.length;
    return results;
  } catch (e) {
    if (isCancelled(e)) throw e;
    throw logFailure(e);
  }
}
async function imageInfo(source, token, stage) {
  assertOwner(token);
  const info = await callApi(wx, 'getImageInfo', {src:source}, stage);
  assertOwner(token);
  if (!info || !(info.width > 0 && info.height > 0)) {
    throw failure(stage, {code:'IMAGE_UNREADABLE'});
  }
  // Actual decoded format, not the temporary filename or a JPEG assumption.
  const extension = {jpeg:'jpg', jpg:'jpg', png:'png', gif:'gif', webp:'webp'}[info.type];
  if (!extension) throw failure(stage, {code:'IMAGE_FORMAT_UNSUPPORTED'});
  return extension;
}
async function validatePhoto(path, token) {
  token = token || identity.lease();
  assertOwner(token);
  try {
    const stat = FS.statSync(path);
    if (!stat || !Number.isFinite(stat.size) || stat.size <= 0) throw Object.assign(new Error('FILE_EMPTY'), {code:'FILE_EMPTY'});
  } catch (e) { throw failure('stat', e); }
  await imageInfo(path, token, 'decode');
  return path;
}
async function persistPhoto(tempPath, keepOriginal, token) {
  try { token = token || identity.lease(); assertOwner(token); } catch (e) { throw failure('identity', e); }
  if (typeof tempPath !== 'string' || !tempPath) throw failure('source', {code:'NO_PHOTO_SELECTED'});
  if (isUserPhoto(tempPath)) return validatePhoto(tempPath, token);
  ensureDir(token);
  if (keepOriginal) {
    try { return await copyIn(tempPath, token); }
    catch (e) { if (e.category !== 'image') throw e; logFailure(e); }
  }
  let compressed;
  try { compressed = await callApi(wx, 'compressImage', {src:tempPath, quality:80}, 'compress'); }
  catch (e) {
    if (e.category !== 'image') throw e;
    logFailure(e); // Recoverable, e.g. PNG compression on iOS.
    return copyIn(tempPath, token);
  }
  assertOwner(token);
  try { return await copyIn(compressed.tempFilePath, token); }
  catch (e) {
    if (e.category !== 'image') throw e;
    logFailure(e);
    return copyIn(tempPath, token);
  }
}
// Durable copy of an ALREADY-prepared source: no resize decision and no re-encode. The avatar
// path downsamples first (its own 1024 rule) and must not have that decision re-made here.
async function persistDerivative(source, token) {
  try { token = token || identity.lease(); assertOwner(token); } catch (e) { throw failure('identity', e); }
  if (typeof source !== 'string' || !source) throw failure('source', { code: 'NO_PHOTO_SELECTED' });
  if (isUserPhoto(source)) return validatePhoto(source, token);
  ensureDir(token);
  return copyIn(source, token);
}

// ---- local media garbage collection ---------------------------------------------------------
// A durable copy in savor-photos is only needed while something still points at it. Once a
// cloud upload is confirmed AND the committed state points at the cloud reference, the local
// copy is an orphan. Device-measured consequence of not reclaiming them: 20 orphans = 197 MiB,
// after which every copyFile fails with "the maximum size of the file storage limit is exceeded"
// and BOTH the avatar and the restaurant-photo pipelines stop working entirely.
//
// Only files this app created are ever candidates, identified by the two naming rules the app
// actually uses: data_createId() -> 'ph-<base36>-<base36>.<ext>', and avatar.restore ->
// 'avatar-<64 hex>.<ext>'. Anything else in the directory is left alone.
const MEDIA_NAME = /^(?:ph-[a-z0-9]+-[a-z0-9]+|avatar-[a-f0-9]{64})\.(?:jpg|jpeg|png|gif|webp)$/;
// A durable local reference: not a cloud id, not a bundled asset, not a remote url.
// NOTE: 'wxfile://' is deliberately NOT excluded here. On Android wx.env.USER_DATA_PATH itself
// begins with 'wxfile://', so a perfectly ordinary durable path looks scheme-prefixed. Rejecting
// the scheme would have classified the user's own avatar file as an orphan and deleted it. The
// durable-directory check below is what actually decides, and a genuine temp path never contains
// that directory.
function isLocalRef(path) {
  return typeof path === 'string' && path !== ''
    && path.indexOf('cloud://') !== 0
    && path.indexOf('/images/') !== 0 && !/^https?:\/\//.test(path);
}
// Owner scope + canonical path check. Cross-owner and traversal paths are rejected outright.
function isDurableMediaPath(path, token) {
  if (typeof path !== 'string' || path === '' || path.includes('..')) return false;
  let dir;
  try { dir = photosDir(token); } catch (e) { return false; }
  const marker = dir + '/';
  const at = path.indexOf(marker);
  if (at < 0) return false;
  // The directory must be the whole prefix, or sit immediately after a scheme such as
  // 'wxfile://'. Anything else (e.g. a path that merely embeds our directory deeper) is refused.
  if (at !== 0 && !/^wxfile:\/\//.test(path.slice(0, at))) return false;
  const name = path.slice(at + marker.length);
  return name.indexOf('/') < 0 && MEDIA_NAME.test(name);
}
// Every place a durable local path can still be depended on. Deliberately conservative: a path
// that appears anywhere here is never a GC candidate.
function collectReferencedLocalMedia(state, token) {
  const refs = new Set();
  const add = value => { if (isLocalRef(value) && isDurableMediaPath(value, token)) refs.add(value); };
  const fromMemory = memory => {
    if (!memory || typeof memory !== 'object') return;
    add(memory.photo); add(memory.placePhoto);
    if (Array.isArray(memory.extraPhotos)) memory.extraPhotos.forEach(add);
  };
  if (state && typeof state === 'object') {
    if (state.profile && state.profile.avatarAsset) add(state.profile.avatarAsset.localPath);
    if (Array.isArray(state.memories)) state.memories.forEach(fromMemory);
    if (Array.isArray(state.outbox)) state.outbox.forEach(op => {
      if (!op || typeof op !== 'object') return;
      fromMemory(op.memory); fromMemory(op.base); fromMemory(op.record);
      // A local path cached as an upload attempt is still being depended on.
      if (op.uploads && typeof op.uploads === 'object') Object.keys(op.uploads).forEach(add);
    });
    // The open draft keeps its photos until the memory is saved.
    if (state.draft && typeof state.draft === 'object') {
      if (Array.isArray(state.draft.photos)) state.draft.photos.forEach(add);
      add(state.draft.placePhoto);
    }
  }
  return refs;
}
function auditOrphanMedia(token, state) {
  token = token || identity.lease();
  assertOwner(token);
  const dir = photosDir(token);
  const refs = collectReferencedLocalMedia(state, token);
  const out = { fileCount: 0, totalBytes: 0, referenced: { count: 0, bytes: 0 }, orphan: { count: 0, bytes: 0 }, largest: [] };
  let names;
  try { names = FS.readdirSync(dir); } catch (e) { return Object.assign(out, { orphanEntries: [] }); }
  const orphans = [];
  (names || []).forEach(name => {
    if (!MEDIA_NAME.test(name)) return;             // never touch anything the app did not create
    const full = dir + '/' + name;
    let size;
    try { size = Math.max(0, Math.round(Number(FS.statSync(full).size) || 0)); } catch (e) { return; }
    out.fileCount += 1; out.totalBytes += size;
    if (refs.has(full)) { out.referenced.count += 1; out.referenced.bytes += size; }
    else { out.orphan.count += 1; out.orphan.bytes += size; orphans.push({ path: full, bytes: size, format: trace.extOf(full) }); }
  });
  orphans.sort((a, b) => b.bytes - a.bytes);
  // `largest` is the reportable form: bytes + extension only, never a path or a name.
  out.largest = orphans.slice(0, 10).map(o => ({ bytes: o.bytes, format: o.format }));
  out.orphanEntries = orphans;                       // internal only; callers must not expose paths
  return out;
}
// dryRun defaults to TRUE: the destructive mode must be asked for explicitly.
function gcOrphanMedia(token, state, options) {
  const dryRun = !options || options.dryRun !== false;
  const audit = auditOrphanMedia(token, state);
  const result = { dryRun: dryRun, deletedCount: 0, deletedBytes: 0, failedCount: 0, failures: [],
    fileCount: audit.fileCount, totalBytes: audit.totalBytes, referenced: audit.referenced, orphan: audit.orphan };
  if (dryRun) return result;
  audit.orphanEntries.forEach(entry => {
    try { FS.unlinkSync(entry.path); result.deletedCount += 1; result.deletedBytes += entry.bytes; }
    catch (e) {
      // One failure must never stop the sweep.
      result.failedCount += 1;
      result.failures.push({ bytes: entry.bytes, format: entry.format, code: failure('unlink', e).code });
    }
  });
  return result;
}
// Crash-safe release of the local copies an upload just superseded. Call this ONLY after the
// committed state already points at the cloud reference; it re-derives the reference set from
// that committed state, so a path another memory/draft/outbox entry still needs is kept, and a
// path whose cloud id never arrived is kept too.
function releaseUploadedLocalCopies(uploads, token, state) {
  const result = { deletedCount: 0, deletedBytes: 0, failedCount: 0 };
  if (!uploads || typeof uploads !== 'object') return result;
  let refs;
  try { token = token || identity.lease(); assertOwner(token); refs = collectReferencedLocalMedia(state, token); }
  catch (e) { return result; }
  Object.keys(uploads).forEach(path => {
    if (!uploads[path]) return;                       // no confirmed cloud id => keep the local file
    if (!isDurableMediaPath(path, token)) return;     // only this owner's own durable media
    if (refs.has(path)) return;                       // still referenced somewhere => keep
    let size;
    try { size = Math.max(0, Math.round(Number(FS.statSync(path).size) || 0)); } catch (e) { return; }
    try { FS.unlinkSync(path); result.deletedCount += 1; result.deletedBytes += size; }
    catch (e) { result.failedCount += 1; }
  });
  return result;
}

async function copyIn(source, token) {
  const extension = await imageInfo(source, token, 'source');
  const target = photosDir(token) + '/' + data_createId() + '.' + extension;
  try {
    await callApi(FS, 'copyFile', {srcPath:source, destPath:target}, 'copy');
  }
  catch (e) {
    if (e.category !== 'filesystem') throw e;
    logFailure(e);
    assertOwner(token);
    const read = await callApi(FS, 'readFile', {filePath:source}, 'read');
    assertOwner(token);
    await callApi(FS, 'writeFile', {filePath:target, data:read.data}, 'write');
  }
  assertOwner(token);
  return validatePhoto(target, token);
}

function data_createId() {
  return 'ph-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

module.exports = {
  validatePhoto,
  isCancelled,
  logFailure,
  profileSaveFailure,
  photosDir,
  isUserPhoto,
  choosePhotos,
  persistPhoto,
  persistDerivative,
  collectReferencedLocalMedia,
  auditOrphanMedia,
  gcOrphanMedia,
  releaseUploadedLocalCopies,
};
