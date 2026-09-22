const identity = require('./identity');
const photos = require('./photos');

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

async function prepare(tempPath, owner, source) {
  if (!['chooseAvatar', 'album', 'camera', 'cloud'].includes(source)) throw imageFailure('AVATAR_SOURCE_INVALID');
  const localPath = await photos.persistPhoto(tempPath, false, owner);
  return { formatVersion: 1, localPath, ...(await inspect(localPath, owner)), source, syncState: 'local', remoteRef: null };
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

module.exports = { prepare, forCloud, restore };
