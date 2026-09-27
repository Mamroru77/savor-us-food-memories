const identity = require('./identity');
const photos = require('./photos');
// Dev-only stage diagnostics; every call is a no-op while the trace flag is off.
const trace = require('./photoTrace');

const MIME = { jpeg: 'image/jpeg', jpg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp' };

function failure(stage, code, category) {
  return Object.assign(new Error(code), { stage, code, category });
}

function imageFailure(code) {
  return failure('decode', code, 'image');
}

async function inspect(localPath, owner) {
  identity.assertLease(owner);
  const info = await new Promise((resolve, reject) => wx.getImageInfo({ src: localPath, success: resolve, fail: () => reject(imageFailure('IMAGE_UNREADABLE')) }));
  identity.assertLease(owner);
  const mime = info && MIME[info.type];
  if (!mime || !(info.width > 0 && info.height > 0)) throw imageFailure('IMAGE_FORMAT_UNSUPPORTED');
  return { mime, width: info.width, height: info.height };
}

// A durable avatar is a profile asset, not an archive of the user's camera roll. persistPhoto()
// deliberately never downscales (that is a restaurant-photo invariant), so a 4000x3000 original
// used to be copied into savor-photos at full size. Avatar-only rule: bound the long edge at
// 1024 BEFORE the durable copy. Never upscales, never overwrites the user's original, never
// uploads the original, and the existing 256px cloud derivative is unchanged.
const AVATAR_MAX_EDGE = 1024;

async function downsampleForAvatar(source, owner) {
  identity.assertLease(owner);
  const startedAt = Date.now();
  const job = trace.begin('avatar');
  trace.record(job, { stage: 'persist', originalBytes: trace.fileBytes(source), originalFormat: trace.extOf(source) });
  const info = await new Promise((resolve, reject) => wx.getImageInfo({
    src: source,
    success: resolve,
    fail: () => reject(imageFailure('IMAGE_UNREADABLE')),
  })).catch(() => {
    trace.record(job, { stage: 'decode', category: 'image', code: 'IMAGE_UNREADABLE' });
    throw imageFailure('IMAGE_UNREADABLE');
  });
  identity.assertLease(owner);
  const width = info && info.width > 0 ? info.width : 0;
  const height = info && info.height > 0 ? info.height : 0;
  if (!width || !height) throw imageFailure('IMAGE_UNREADABLE');
  const longest = Math.max(width, height);
  // Already small enough: no resize is requested at all, so nothing can be upscaled.
  if (longest <= AVATAR_MAX_EDGE) {
    trace.record(job, { stage: 'downsample', originalWidth: width, originalHeight: height,
      resizeRequested: false, upscaled: false, compressMs: Date.now() - startedAt });
    return { path: source, width, height, downsampled: false };
  }
  const scale = AVATAR_MAX_EDGE / longest;
  const targetWidth = Math.max(1, Math.round(width * scale));
  const targetHeight = Math.max(1, Math.round(height * scale));
  let output;
  try {
    output = await new Promise((resolve, reject) => wx.compressImage({
      src: source,
      quality: 80,
      compressedWidth: targetWidth,
      compressedHeight: targetHeight,
      success: resolve,
      fail: () => reject(failure('compress', 'AVATAR_DOWNSAMPLE_FAILED', 'image')),
    }));
  } catch (error) {
    trace.record(job, { stage: 'compress', category: 'image', code: 'AVATAR_DOWNSAMPLE_FAILED',
      originalWidth: width, originalHeight: height, resizeRequested: true, compressInvoked: true });
    // Never silently keep the giant original as the avatar.
    throw failure('compress', 'AVATAR_DOWNSAMPLE_FAILED', 'image');
  }
  identity.assertLease(owner);
  if (!output || typeof output.tempFilePath !== 'string' || !output.tempFilePath) {
    trace.record(job, { stage: 'compress', category: 'image', code: 'AVATAR_DOWNSAMPLE_FAILED', resizeRequested: true, compressInvoked: true });
    throw failure('compress', 'AVATAR_DOWNSAMPLE_FAILED', 'image');
  }
  trace.record(job, { stage: 'downsample', originalWidth: width, originalHeight: height,
    requestedWidth: targetWidth, requestedHeight: targetHeight, resizeRequested: true,
    compressInvoked: true, upscaled: false, resultBytes: trace.fileBytes(output.tempFilePath),
    compressMs: Date.now() - startedAt });
  return { path: output.tempFilePath, width: targetWidth, height: targetHeight, downsampled: true };
}

async function prepare(tempPath, owner, source) {
  if (!['chooseAvatar', 'album', 'camera', 'cloud'].includes(source)) throw imageFailure('AVATAR_SOURCE_INVALID');
  const prepared = await downsampleForAvatar(tempPath, owner);
  // A downsampled avatar is already a fresh quality-80 encode, so it only needs the durable
  // copy; an already-small one keeps going through persistPhoto exactly as it always did.
  const localPath = prepared.downsampled
    ? await photos.persistDerivative(prepared.path, owner)
    : await photos.persistPhoto(tempPath, false, owner);
  const details = await inspect(localPath, owner);
  return { formatVersion: 1, localPath, ...details, source, syncState: 'local', remoteRef: null };
}

// Custom-avatar entry. The WeChat chooseAvatar button returns its own small derivative (a
// 132x132 file on device), which is far below the size the profile photo renders at, so a custom
// photo must come from the system chooser instead. `sizeType:['original']` keeps the selected
// file's real pixels; persistPhoto() may re-encode it but never downscales it. The owner is
// captured before the native UI opens and re-authorized by the caller's native flow after it
// returns, so this function never persists anything and never invents an owner.
// The WeChat chooser does not report whether album or camera was used, so the request's primary
// source ('album') is the recorded source; profileRepository accepts both album and camera.
async function chooseLocal(owner) {
  identity.assertLease(owner);
  let picked;
  try {
    picked = await new Promise((resolve, reject) => wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['original'],
      success: resolve,
      fail: reject,
    }));
  } catch (error) {
    // Backing out of the system chooser is not a failure: no result, no error, no asset.
    if (photos.isCancelled(error)) return '';
    throw failure('choose', 'AVATAR_CHOOSE_FAILED', 'image');
  }
  const source = picked && picked.tempFiles && picked.tempFiles[0] && picked.tempFiles[0].tempFilePath;
  if (!source) throw failure('choose', 'NO_AVATAR_SELECTED', 'image');
  return source;
}

async function chooseForCloud() {
  let owner=identity.lease();
  const picked=await new Promise((resolve,reject)=>wx.chooseMedia({count:1,mediaType:['image'],sourceType:['album','camera'],success:resolve,fail:reject}));
  owner=await identity.resumeNative(owner);
  const source=picked.tempFiles&&picked.tempFiles[0]&&picked.tempFiles[0].tempFilePath;
  if(!source)throw failure('choose','NO_AVATAR_SELECTED','image');
  return forCloud(await prepare(source,owner,'album'),owner);
}

async function forCloud(asset, owner) {
  const prefix = photos.photosDir(owner) + '/';
  if (!asset || typeof asset.localPath !== 'string' || !asset.localPath.startsWith(prefix) || asset.localPath.includes('..')) throw imageFailure('AVATAR_ASSET_INVALID');
  await photos.validatePhoto(asset.localPath, owner);
  const scale = Math.min(1, 256 / asset.width, 256 / asset.height);
  const compressed = await new Promise((resolve, reject) => wx.compressImage({
    src: asset.localPath,
    quality: 60,
    compressedWidth: Math.max(1, Math.round(asset.width * scale)),
    compressedHeight: Math.max(1, Math.round(asset.height * scale)),
    success: resolve,
    fail: () => reject(failure('compress', 'AVATAR_COMPRESS_FAILED', 'image')),
  }));
  identity.assertLease(owner);
  const cloudImage = await inspect(compressed.tempFilePath, owner);
  if (!['image/jpeg', 'image/png'].includes(cloudImage.mime)) throw imageFailure('AVATAR_CLOUD_FORMAT_UNSUPPORTED');
  let base64;
  try { base64 = wx.getFileSystemManager().readFileSync(compressed.tempFilePath, 'base64'); }
  catch (error) { throw failure('read', 'AVATAR_READ_FAILED', 'filesystem'); }
  identity.assertLease(owner);
  if (typeof base64 !== 'string' || base64.length > 87384) throw imageFailure('AVATAR_TOO_LARGE');
  return { asset: { ...asset, syncState: 'pending' }, base64 };
}

async function restore(remote, owner) {
  const valid = remote && /^[a-f0-9]{64}$/.test(remote.digest || '')
    && ((remote.extension === 'jpg' && remote.mime === 'image/jpeg') || (remote.extension === 'png' && remote.mime === 'image/png'))
    && typeof remote.base64 === 'string' && remote.base64.length <= 87384 && /^[A-Za-z0-9+/]+={0,2}$/.test(remote.base64);
  if (!valid) throw imageFailure('INVALID_AVATAR');
  const dir = photos.photosDir(owner), fs = wx.getFileSystemManager();
  try { fs.accessSync(dir); } catch (error) {
    try { fs.mkdirSync(dir, true); } catch (mkdirError) { throw failure('mkdir', 'AVATAR_DIRECTORY_FAILED', 'filesystem'); }
  }
  const localPath = dir + '/avatar-' + remote.digest + '.' + remote.extension;
  try { fs.writeFileSync(localPath, remote.base64, 'base64'); }
  catch (error) { throw failure('write', 'AVATAR_WRITE_FAILED', 'filesystem'); }
  identity.assertLease(owner);
  await photos.validatePhoto(localPath, owner);
  const details = await inspect(localPath, owner);
  if (details.mime !== remote.mime) throw imageFailure('AVATAR_FORMAT_MISMATCH');
  return { formatVersion: 1, localPath, digest: remote.digest, ...details, source: 'cloud', syncState: 'synced', remoteRef: remote.digest };
}

module.exports = { prepare, chooseLocal, chooseForCloud, forCloud, restore };
