const identity = require('./identity');
const FS = wx.getFileSystemManager();

// Never log native messages: they may contain owner paths or image data.
function failure(stage, error) {
  if (error && error.stage && error.category) return error;
  const program = error && ['TypeError', 'ReferenceError', 'SyntaxError'].includes(error.name);
  const code = error && (error.code || error.errCode);
  const safeCode = program ? error.name.toUpperCase() : /^(?:[A-Z][A-Z0-9_]{1,60}|-?\d{1,10})$/.test(String(code || '')) ? String(code) : stage.toUpperCase() + '_FAILED';
  const category = program ? 'program' : stage === 'identity' || /IDENTITY|DIAGNOSTIC/.test(safeCode) ? 'identity'
    : ['mkdir','copy','read','write','stat','profile-save'].includes(stage) ? 'filesystem'
    : ['choose','source','compress','decode','preview','me-preview'].includes(stage) ? 'image' : 'program';
  return Object.assign(new Error(safeCode), { stage, code: safeCode, category });
}
function logFailure(error, stage) {
  const e = failure(stage || 'avatar', error);
  console.error('[avatar]', e.stage, e.code);
  return e;
}
function isCancelled(error) {
  return !!error && (error.code === 'PHOTO_CANCELLED'
    || /^choose(?:Media|Image):fail cancel(?:\b|$)/i.test(error.errMsg || ''));
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
async function pick(method, count, token) {
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
  try { token = await identity.resumeNative(token); } catch (e) { throw failure('identity', e); }
  const files = method === 'chooseImage'
    ? (result.tempFilePaths || []).map(tempFilePath => ({tempFilePath, sizeType:'original'}))
    : result.tempFiles || [];
  return {files, token};
}
async function choosePhotos(count, opts, onProgress) {
  if (typeof opts === 'function') onProgress = opts;
  let token;
  try { token = identity.lease(); } catch (e) { throw logFailure(failure('identity', e)); }
  try {
    let sys = {};
    try { sys = wx.getSystemInfoSync(); } catch (e) { /* default chooser */ }
    const imageFirst = /android/i.test(sys.platform || '') && count > 1 && wx.chooseImage;
    const method = imageFirst || !wx.chooseMedia ? 'chooseImage' : 'chooseMedia';
    let selection;
    // Only chooser failures may open an alternate chooser, never persistence or identity errors.
    try { selection = await pick(method, count, token); }
    catch (e) {
      if (isCancelled(e) || e.stage !== 'choose' || e.category === 'program') throw e;
      logFailure(e);
      const fallback = method==='chooseImage' ? 'chooseMedia' : 'chooseImage';
      if (!wx[fallback]) throw e;
      selection = await pick(fallback, count, token);
    }
    if(!selection.files.length && method==='chooseMedia' && wx.chooseImage)selection=await pick('chooseImage',count,selection.token);
    token = selection.token;
    if (!selection.files.length) throw failure('choose', {code:'NO_PHOTO_SELECTED'});
    const results = [];
    let lastError;
    for (let i = 0; i < selection.files.length; i++) {
      assertOwner(token);
      const file = selection.files[i], original = file.sizeType === 'original' || file.size > 2*1024*1024;
      if (onProgress) onProgress({current:i+1, total:selection.files.length, percent:Math.round((i+1)/selection.files.length*100), original});
      try { results.push(await persistPhoto(file.tempFilePath, original, token)); }
      catch (e) {
        if (e.category === 'identity' || e.category === 'program') throw e;
        lastError = logFailure(e);
      }
    }
    assertOwner(token);
    if (!results.length) throw lastError;
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
  if (!info || !(info.width > 0 && info.height > 0)) throw failure(stage, {code:'IMAGE_UNREADABLE'});
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
async function copyIn(source, token) {
  const extension = await imageInfo(source, token, 'source');
  const target = photosDir(token) + '/' + data_createId() + '.' + extension;
  try { await callApi(FS, 'copyFile', {srcPath:source, destPath:target}, 'copy'); }
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

function removePhoto(path) { return; }
function pruneOrphans(keepPaths) { return; }

function collectReferenced(state) {
  const refs = [];
  (state.memories || []).concat((state.outbox||[]).reduce((all,op)=>all.concat([op.base,op.memory].filter(Boolean)),[])).forEach(function (memory) {
    [memory.photo, memory.placePhoto].concat(memory.extraPhotos || []).forEach(function (path) {
      if (isUserPhoto(path)) refs.push(path);
    });
  });
  const avatar = state.profile && state.profile.avatar;
  if (isUserPhoto(avatar)) refs.push(avatar);
  try {
    const raw = identity.getStorageSync('savor-draft-v1');
    const draft = typeof raw === 'string' ? JSON.parse(raw) : raw;
    (draft && draft.photos || []).forEach(path => { if (isUserPhoto(path)) refs.push(path); });
  } catch (error) {}
  return refs;
}

module.exports = {
  validatePhoto,
  isCancelled,
  logFailure,
  photosDir,
  isUserPhoto,
  choosePhotos,
  persistPhoto,
  removePhoto,
  pruneOrphans,
  collectReferenced,
};
