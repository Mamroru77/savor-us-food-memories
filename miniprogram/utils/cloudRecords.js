const identity = require('./identity');
const i18n = require('./i18n');
// Private diary CloudBase boundary. Other services enforce the same identity/diagnostic policy.
const data = require('./data');
const ENV = require('./runtimeConfig').cloudEnv;
let initialized = false;
function error(code, message, cause) { const e = new Error(i18n.t(message)); e.code = code; e.cause = cause; return e; }
function initCloud() {
  if (initialized) return;
  if (!wx.cloud) throw error('UNAVAILABLE', i18n.t('Cloud is unavailable. Update WeChat and try again. Your draft is kept.'));
  try { wx.cloud.init({ env: ENV, traceUser: true }); initialized = true; }
  catch (e) { throw error('INIT_FAILED', i18n.t('Cloud could not start. Your draft is kept; please retry.'), e); }
}
async function call(action, args, token = identity.lease()) {
  identity.assertBusinessCloudAllowed();
  identity.assertLease(token);
  initCloud();
  let response;
  try {
    if(['add','update','flags','delete','setLocation'].includes(action)){
      const check=await Promise.race([
        wx.cloud.callFunction({name:'mealRecords',data:{action:'identityHandshake',identityProtocol:1,expectedUserId:token.userId}}),
        new Promise((_,rej)=>setTimeout(()=>rej(new Error('HANDSHAKE_TIMEOUT')), 15000))
      ]);
      identity.assertLease(token);
      if(check.result&&check.result.code==='IDENTITY_MISMATCH'){identity.invalidate();throw error('IDENTITY_MISMATCH','账号已变化，请重新验证。');}
      if(!check.result||check.result.success!==true||check.result.identityProtocol!==1||check.result.userId!==token.userId)throw error('UPGRADE_REQUIRED','请部署支持身份校验的 mealRecords 云函数。');
    }
    response = await Promise.race([
      wx.cloud.callFunction({ name: 'mealRecords', data: Object.assign({ action }, args, {identityProtocol:1,expectedUserId:token.userId}) }),
      new Promise((_,rej)=>setTimeout(()=>rej(new Error('CALL_TIMEOUT')), 20000))
    ]); }
  catch (e) {
    if(['STALE_IDENTITY','IDENTITY_MISMATCH','UPGRADE_REQUIRED'].includes(e.code))throw e;
    if(identity.isCurrent(token))identity.markOffline();
    throw error('CALL_FAILED', i18n.t('Could not reach mealRecords. Check your connection and deploy the cloud function. Your draft is kept; retry safely.'), e);
  }
  identity.assertLease(token);
  const result = response && response.result;
  if(result && result.code==='IDENTITY_MISMATCH') {identity.invalidate();throw error('IDENTITY_MISMATCH','账号已变化，请重新验证。');}
  if (!result || !result.success) throw error(result && result.code || 'SERVER_ERROR', result && result.message || i18n.t('Cloud could not save or sync. Your draft and cache are kept.'));
  return result;
}
function memoryToCloudRecord(m) {
  if (!data.isMemory(m)) throw error('INVALID_RECORD', 'The memory record is invalid.');
  const record = {
    restaurantName: m.restaurant, note: m.notes, date: m.date, city: m.city,
    rating: m.rating, tags: m.tags.slice(), country: m.country, neighborhood: m.neighborhood,
    coordinates: m.coordinates.slice(), shared: m.shared, liked: m.liked, saved: m.saved,
    photos: m.noPhoto ? [] : [m.photo].concat(m.extraPhotos || [])
  };
  if (m.rating === 0 || (m.ratingSource && m.ratingSource !== 'single')) delete record.rating;
  if (m.locationUnknown) delete record.coordinates;
  if (m.placePhoto) record.placePhoto = m.placePhoto;
  // Preserve old integrated business fields on a roundtrip; identity is NEVER sent.
  ['importAddressHint','importAreaText','platformRating','platformAveragePriceCny','diningTypes','sourceCategory','categorySource','tencentPoiId','diningMode', 'sourcePlatform', 'sourceUrl', 'address', 'cuisine', 'perCapita', 'ratings', 'dishes', 'locationName', 'locationSource', 'coordinateSystem', 'geoConfirmed', 'geoSource'].forEach(k => {
    if (m[k] !== undefined) record[k] = m[k];
  });
  return record;
}
function cloudRecordToMemory(r) {
  if (!r || typeof r._id !== 'string') return null;
  const images = (Array.isArray(r.photos) ? r.photos : []).filter(data.isSafeImage);
  const votes = Object.keys(r.ratings || {}).map(k => r.ratings[k]).filter(v => typeof v === 'number' && v > 0 && v <= 5);
  const legacyRating = votes.length ? Math.max(1, Math.round(votes.reduce((a, b) => a + b, 0) / votes.length)) : 0;
  const hasCoordinates = Array.isArray(r.coordinates) && r.coordinates.length === 2 && r.coordinates.every(Number.isFinite)
    && Math.abs(r.coordinates[0]) <= 90 && Math.abs(r.coordinates[1]) <= 180;
  const m = {
    id: r._id, cloudId: r._id, revision: r.revision || 0, deleted: r.deleted === true,
    restaurant: r.restaurantName || '', notes: r.note || '', date: r.date,
    city: r.city || '', country: r.country || '', neighborhood: r.neighborhood || r.address || '',
    rating: Number.isInteger(r.rating) && r.rating >= 1 && r.rating <= 5 ? r.rating : legacyRating,
    ratingSource: r.rating !== undefined ? 'single' : votes.length ? 'legacy-average' : 'unrated-placeholder',
    tags: Array.isArray(r.tags) ? r.tags.filter(t => typeof t === 'string') : r.cuisine ? [r.cuisine] : [],
    photo: images[0] || data.photos.meal, extraPhotos: images.slice(1), noPhoto: !images.length,
    coordinates: hasCoordinates ? r.coordinates.slice() : [0, 0], locationUnknown: !hasCoordinates,
    shared: r.shared === true, liked: r.liked === true, saved: r.saved === true,
    memberOpenids: Array.isArray(r.memberOpenids) ? r.memberOpenids.slice() : [], coupleId: r.coupleId || ''
  };
  if (data.isSafeImage(r.placePhoto)) m.placePhoto = r.placePhoto;
  ['importAddressHint','importAreaText','platformRating','platformAveragePriceCny','diningTypes','sourceCategory','categorySource','tencentPoiId','diningMode', 'sourcePlatform', 'sourceUrl', 'address', 'cuisine', 'perCapita', 'ratings', 'dishes', 'locationName', 'locationSource', 'coordinateSystem', 'geoConfirmed', 'geoSource'].forEach(k => { if (r[k] !== undefined) m[k] = r[k]; });
  if (['tencent-picker','tencent-search'].includes(m.locationSource) && m.geoConfirmed !== true) { m.city=''; m.country=''; }
  return data.isMemory(m) ? m : null;
}
// Store cloud:// IDs, not expiring URLs. Renderers that cannot consume cloud
// IDs resolve them here; returned URLs are transient and never enter the diary.
async function resolvePhotoUrls(ids) {
  identity.assertBusinessCloudAllowed();
  const token=identity.lease();
  initCloud();
  const cloudIds = ids.filter(data.isCloudImage);
  const urls = {};
  for (let i = 0; i < cloudIds.length; i += 50) {
    const result = await wx.cloud.getTempFileURL({ fileList: cloudIds.slice(i, i + 50) });
    identity.assertLease(token);
    (result.fileList || []).forEach(f => { if (f.status === 0 && f.tempFileURL) urls[f.fileID] = f.tempFileURL; });
  }
  return ids.map(id => urls[id] || id);
}
// A stored photo keeps its own bytes, so the copy that is actually uploaded is what has
// to fit the upload window. The budget is measured in BYTES, not pixels: a high-quality
// or noisy image can be several megabytes at a modest resolution, and an oversized
// upload is what makes the cloud call time out. The original is uploaded only when it is
// proven to fit; otherwise it is re-encoded at progressively smaller long edges and each
// result is measured again. Nothing oversized ever reaches the upload call, and nothing
// is lost silently: when no attempt fits, the save fails with a message the user can act
// on instead of stalling in a timeout.
const MAX_CLOUD_PHOTO_BYTES = 2 * 1024 * 1024;
const UPLOAD_EDGE_LADDER = [1600, 1080];
function localBytes(path) {
  try {
    const stat = wx.getFileSystemManager().statSync(path);
    return stat && Number.isFinite(stat.size) && stat.size > 0 ? stat.size : null;
  } catch (e) { return null; }
}
// Safe per-photo classification. The user-facing message stays a single sentence; these codes
// only exist so a failure can be attributed to a layer without leaking a path or a secret.
const PHOTO_PREPARE_CODES = ['PHOTO_TOO_LARGE', 'COMPRESS_FAILED', 'IMAGE_UNREADABLE', 'IMAGE_FORMAT_UNSUPPORTED', 'INVALID_PHOTO'];
function safePhotoCode(value, fallback) {
  return PHOTO_PREPARE_CODES.includes(value) ? value : fallback;
}
async function shrinkForUpload(path, token) {
  identity.assertLease(token);
  const original = localBytes(path);
  if (original !== null && original <= MAX_CLOUD_PHOTO_BYTES) return path;
  let info = null;
  try { info = await new Promise((resolve, reject) => wx.getImageInfo({src: path, success: resolve, fail: reject})); }
  catch (e) { info = null; }
  const width = info && info.width > 0 ? info.width : 0;
  const height = info && info.height > 0 ? info.height : 0;
  // With no readable frame there is nothing to scale towards, so a single re-encode is
  // the only attempt worth making.
  const readable = Boolean(width && height);
  const rungs = readable ? UPLOAD_EDGE_LADDER : [null];
  let produced = false;
  for (const edge of rungs) {
    identity.assertLease(token);
    const options = {src: path, quality: 80};
    if (edge !== null) {
      const scale = Math.min(1, edge / Math.max(width, height));
      options.compressedWidth = Math.max(1, Math.round(width * scale));
      options.compressedHeight = Math.max(1, Math.round(height * scale));
    }
    let shrunk;
    try { shrunk = await new Promise((resolve, reject) => wx.compressImage(Object.assign({success: resolve, fail: reject}, options))); }
    catch (e) { identity.assertLease(token); continue; }
    identity.assertLease(token);
    if (!shrunk || !data.isSafeImage(shrunk.tempFilePath)) continue;
    produced = true;
    const bytes = localBytes(shrunk.tempFilePath);
    if (bytes !== null && bytes <= MAX_CLOUD_PHOTO_BYTES) return shrunk.tempFilePath;
  }
  // Three distinct prepare failures, one user-facing sentence each. Never fall back to the
  // original: that is what let an oversized upload reach the call and time out.
  if (!readable) throw error('IMAGE_UNREADABLE', i18n.t('This photo could not be prepared for upload. Reselect it and try again.'));
  if (!produced) throw error('COMPRESS_FAILED', i18n.t('This photo could not be prepared for upload. Reselect it and try again.'));
  throw error('PHOTO_TOO_LARGE', i18n.t('This photo is too large to upload. Choose a smaller photo and try again.'));
}
// One unprocessable photo must never stop the ones after it. Every photo is attempted, each
// success is cached in attempt.uploads and persisted, and the batch fails ONCE at the end
// naming the positions that failed. This is not a partial submission: mealRecords.add/update
// only runs when the whole batch is ready, so the user can remove or reselect the named photo
// and retry without re-uploading anything that already succeeded.
function photoBatchFailure(failures) {
  const indexes = failures.map(f => f.index).join(', ');
  const e = error('UPLOAD_FAILED', i18n.t('Photo {indexes} could not be processed. Reselect or remove it and try again.', {indexes}));
  e.failures = failures;
  return e;
}
async function uploadPhotos(paths, attempt, persistAttempt, token) {
  identity.assertBusinessCloudAllowed();
  identity.assertLease(token);
  if(attempt.actorUserId!==token.userId)throw error('OUTBOX_IDENTITY_MISMATCH','原操作身份不匹配，已阻止发送。');
  initCloud();
  const result = [];
  const failures = [];
  for (let index = 0; index < paths.length; index++) {
    identity.assertLease(token);
    const path = paths[index];
    const position = index + 1;
    if (data.isCloudImage(path) || /^\/images\//.test(path) || /^https:\/\//.test(path)) { result.push(path); continue; }
    if (attempt.uploads[path]) { result.push(attempt.uploads[path]); continue; }
    if (!data.isSafeImage(path)) { failures.push({index:position,stage:'prepare',code:'INVALID_PHOTO',uploadInvoked:false}); continue; }
    // Deliberately outside the upload try: a stale lease must surface as STALE_IDENTITY
    // rather than being reported as a photo failure, and it must still abort the batch.
    let filePath;
    try { filePath = await shrinkForUpload(path, token); }
    catch (e) {
      if (e && e.code === 'STALE_IDENTITY') throw e;
      failures.push({index:position,stage:'prepare',code:safePhotoCode(e && e.code,'PHOTO_PREPARE_FAILED'),uploadInvoked:false});
      continue;
    }
    try {
      const uploaded = await Promise.race([
        wx.cloud.uploadFile({ cloudPath: 'dining/' + token.userId + '/' + attempt.id + '/' + Object.keys(attempt.uploads).length + '.jpg', filePath: filePath }),
        new Promise((_,rej)=>setTimeout(()=>rej(new Error('UPLOAD_TIMEOUT')), 20000))
      ]);
      identity.assertLease(token);
      if (!data.isCloudImage(uploaded.fileID)) throw new Error('Invalid fileID');
      attempt.uploads[path] = uploaded.fileID;
      try { persistAttempt(); } catch(e) {}
      result.push(uploaded.fileID);
    } catch (e) {
      failures.push({index:position,stage:'upload',code:String(e.message).includes('TIMEOUT')?'UPLOAD_TIMEOUT':'UPLOAD_REJECTED',uploadInvoked:true});
    }
  }
  if (failures.length) throw photoBatchFailure(failures);
  return result;
}
async function addRecord(attempt, persistAttempt) {
  const token=identity.lease();
  const payload = memoryToCloudRecord(attempt.memory);
  payload.photos = await uploadPhotos(payload.photos, attempt, persistAttempt, token);
  if (payload.placePhoto) payload.placePhoto = (await uploadPhotos([payload.placePhoto], attempt, persistAttempt, token))[0];
  attempt.submitted = true;
  persistAttempt(); // Persist BEFORE call: an unknown outcome must reuse the same request ID.
  let result;
  try { result = await call('add', { requestId: attempt.id, data: payload }, token); }
  catch (e) {
    // A definite input rejection happened before a write. Unlike a timeout,
    // this is safe to edit; an ambiguous server/network failure stays frozen.
    if (/^(INVALID_|RESTAURANT_REQUIRED)/.test(e.code || '')) {
      attempt.submitted = false;
      persistAttempt();
    }
    throw e;
  }
  if (!result.record) throw error('UPGRADE_REQUIRED', i18n.t('Please deploy the updated mealRecords function, then retry this draft.'));
  const memory = cloudRecordToMemory(result.record);
  if (!memory) throw error('INVALID_RESPONSE', i18n.t('Cloud returned an unsupported record. Your draft is kept.'));
  if(memory.deleted) {attempt.submitted=false;persistAttempt();throw error('DELETED','The previously saved record was deleted. Edit the draft before saving a new memory.');}
  return memory;
}
async function listRecords() {
  const token=identity.lease();
  const records = []; records.deletedIds=[]; let cursor = ''; const seen = {};
  do {
    const result = await call('list', { paginated: true, cursor },token);
    if (!Array.isArray(result.data)) throw error('INVALID_RESPONSE', i18n.t('Cloud sync failed. Cached memories are still available.'));
    result.data.forEach(r => { if(r.deleted) {records.deletedIds.push(r._id);return;} const m = cloudRecordToMemory(r); if (m) records.push(m); });
    cursor = result.nextCursor || '';
    if (cursor && seen[cursor]) throw error('INVALID_CURSOR', i18n.t('Cloud pagination failed. Cache is kept.'));
    seen[cursor] = true;
  } while (cursor);
  return records.sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
}
async function setLocation(id, location) {
  const result = await call('setLocation', { id, data: location });
  const memory = cloudRecordToMemory(result.record);
  if (!memory) throw error('INVALID_RESPONSE', i18n.t('位置保存结果无效，请重试。'));
  return memory;
}
async function mutate(operation, persistAttempt) {
  const token=identity.lease();
  if(operation.actorUserId!==token.userId)throw error('OUTBOX_IDENTITY_MISMATCH','原操作身份不匹配，已阻止发送。');
  let payload=operation.patch || {};
  if(operation.kind==='update') {
    payload=memoryToCloudRecord(operation.memory);
    // A cleared single score is explicit; legacy individual scores remain server-owned by this form.
    payload.rating=operation.memory.ratingSource==='legacy-average' ? undefined : (operation.memory.rating || null);
    if(payload.rating===undefined) delete payload.rating;
    payload.photos=await uploadPhotos(payload.photos,operation,persistAttempt,token);
    if(payload.placePhoto) payload.placePhoto=(await uploadPhotos([payload.placePhoto],operation,persistAttempt,token))[0];
  }
  operation.submitted=true; persistAttempt();
  const result=await call(operation.kind,{id:operation.recordId,operationId:operation.id,revision:operation.revision,data:payload},token);
  const memory=cloudRecordToMemory(result.record);
  if(!memory || memory.id!==operation.recordId || (result.operationId && result.operationId!==operation.id)) throw error('INVALID_RESPONSE','The cloud returned an invalid result. Retry safely.');
  // Transport receipt only; never persist it as a Memory field. Missing receipts
  // from older functions fail closed (no automatic revision advancement).
  Object.defineProperty(memory,'operationRevision',{value:result.operationId===operation.id && Number.isInteger(result.operationRevision)?result.operationRevision:null,enumerable:false});
  return memory;
}
async function getRecord(id) { const result=await call('get',{id}); const memory=cloudRecordToMemory(result.record);if(!memory || memory.id!==id)throw error('INVALID_RESPONSE','The cloud returned an invalid result. Retry safely.');return memory; }
// A missing local queue item is not proof of remote completion.
async function confirmOperation(id, operationId) {
  const result = await call('get', { id });
  const record = result.record;
  if (!record || record._id !== id) throw error('INVALID_RESPONSE', 'The cloud returned an invalid result. Retry safely.');
  return Array.isArray(record.operationReceipts) && record.operationReceipts.some(r => r && r.id === operationId && Number.isInteger(r.revision) && r.revision > 0 && r.revision <= record.revision);
}
// Download a private photo only through the existing CloudBase boundary.
// Caller owns this temporary copy; never store it in Memory or outbox.
function downloadMapPhoto(fileID) {
  const token=identity.lease();
  if(!data.isCloudImage(fileID)) return Promise.reject(error('INVALID_PHOTO','Invalid cloud photo.'));
  initCloud();
  if(!wx.cloud.downloadFile) return Promise.reject(error('UNAVAILABLE','Photo preview unavailable.'));
  return new Promise((resolve,reject)=>{
    let expired=false;
    const timer=setTimeout(()=>{expired=true;reject(error('PHOTO_TIMEOUT','Photo preview timed out.'));},8000);
    wx.cloud.downloadFile({fileID,success:r=>{
      clearTimeout(timer);
      try{identity.assertLease(token);}catch(e){expired=true;reject(e);}
      if(expired) {try{wx.getFileSystemManager().unlinkSync(r.tempFilePath);}catch(e){}return;}
      if(!r.tempFilePath) {reject(error('INVALID_PHOTO','Invalid cloud photo.'));return;}
      resolve(r.tempFilePath);
    },fail:()=>{clearTimeout(timer);reject(error('PHOTO_FAILED','Photo preview unavailable.'));}});
  });
}
async function searchPlaces(keyword,city) {
  identity.assertBusinessCloudAllowed();
  if (!require('./importPolicy').cloudPlaceSearchEnabled) throw error('LOOKUP_DISABLED', 'Tencent location search is off. Use the native map picker.');
  if(typeof keyword!=='string'||!keyword.trim()||keyword.length>70||typeof city!=='string'||city.length>40||!/^[\u4e00-\u9fffA-Za-z0-9 ·.-]{2,40}$/.test(city.trim())||city.trim()==='全国')throw error('INVALID_LOOKUP_QUERY','Enter a restaurant name and a specific city.');
  initCloud();
  let response;
  try {response=await wx.cloud.callFunction({name:'placeLookup',data:{keyword,city}});} catch(e) {throw error('LOOKUP_UNAVAILABLE','Map search is unavailable. Use the native map picker.');}
  const result=response&&response.result;
  if(!result||!result.success) {
    const code=result&&result.code||'LOOKUP_UNAVAILABLE';
    const message=['LOOKUP_NOT_CONFIGURED','LOOKUP_NOT_AUTHORIZED'].includes(code)?'Map search is not configured for this account. Use the native map picker.':code==='INVALID_LOOKUP_QUERY'?'Enter a restaurant name and a specific city.':code==='LOOKUP_RATE_LIMITED'?'Please wait a moment before searching again.':'Map search is unavailable. Use the native map picker.';
    const problem=error(code,message);problem.message+=' ['+code+(Number.isInteger(result&&result.providerStatus)?' / '+result.providerStatus:'')+']';throw problem;
  }
  if(result.provider!=='tencent'||!Array.isArray(result.pois))throw error('INVALID_RESPONSE','Map search returned an invalid result.');
  return result.pois.slice(0,10).filter(p=>p&&typeof p.name==='string'&&p.name&&typeof p.id==='string'&&p.id&&p.provider==='tencent'&&p.coordinateSystem==='gcj02'&&Array.isArray(p.coordinates)&&p.coordinates.length===2&&p.coordinates.every(Number.isFinite)&&Math.abs(p.coordinates[0])<=90&&Math.abs(p.coordinates[1])<=180).map(p=>({id:p.id.slice(0,100),name:p.name.slice(0,100),address:String(p.address||'').slice(0,150),categoryText:String(p.categoryText||'').slice(0,120),coordinates:p.coordinates.slice(),provider:'tencent',coordinateSystem:'gcj02'}));
}
async function requestResult(requestId){const result=await call('requestResult',{requestId});const memory=cloudRecordToMemory(result.record);if(!memory)throw error('INVALID_RESPONSE','Invalid response');return memory;}
module.exports = { requestResult, searchPlaces, downloadMapPhoto, confirmOperation, mutate, getRecord, setLocation, ENV, initCloud, listRecords, addRecord, uploadPhotos, resolvePhotoUrls, memoryToCloudRecord, cloudRecordToMemory };
