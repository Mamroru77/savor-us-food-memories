// Photo handling for the diary: pick with wx.chooseMedia, compress, keep copies under USER_DATA_PATH/savor,
// clean up files nobody references, and convert between local files and the base64 form used by web backups.
const { photos, isSafeImage, remotePhoto } = require('./data');

const MAX_EDGE = 1200;
const MAX_BACKUP_FILE = 1.5 * 1024 * 1024; // Larger user photos are exported as a bundled placeholder reference.
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function fs() { return wx.getFileSystemManager(); }
function userDir() { return wx.env.USER_DATA_PATH + '/savor'; }

function ensureDir() {
  const dir = userDir();
  try { fs().accessSync(dir); } catch (error) { fs().mkdirSync(dir, true); }
  return dir;
}

function isUserFile(path) { return typeof path === 'string' && path.indexOf(userDir()) === 0; }

function exists(path) {
  try { fs().accessSync(path); return true; } catch (error) { return false; }
}

function extensionOf(path, fallback) {
  const match = /\.(jpe?g|png|gif|webp)(\?|$)/i.exec(path || '');
  return match ? match[1].toLowerCase().replace('jpeg', 'jpg') : fallback;
}

function nextName(ext) { return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7) + '.' + ext; }

function persistTemp(tempPath) {
  const target = ensureDir() + '/' + nextName(extensionOf(tempPath, 'jpg'));
  fs().copyFileSync(tempPath, target);
  return target;
}

// Resize large captures before storing them so the local diary stays lightweight (mirrors readPhoto on the web).
function compress(file) {
  return new Promise((resolve) => {
    const path = file.tempFilePath;
    const width = file.width || 0;
    const height = file.height || 0;
    const big = (file.size || 0) > 900 * 1024 || Math.max(width, height) > MAX_EDGE;
    if (!big || !wx.compressImage || /\.gif$/i.test(path)) { resolve(path); return; }
    const options = { src: path, quality: 78, success: (res) => resolve(res.tempFilePath), fail: () => resolve(path) };
    if (width && height && wx.canIUse('compressImage.object.compressedWidth')) {
      const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
      options.compressedWidth = Math.round(width * scale);
      options.compressedHeight = Math.round(height * scale);
    }
    wx.compressImage(options);
  });
}

function isCancel(error) { return /cancel/i.test((error && error.errMsg) || ''); }
function isPrivacyDenied(error) {
  return !!error && (error.errno === 104 || /privacy/i.test(error.errMsg || ''));
}
function isAuthDenied(error) { return /auth deny|authorize|denied/i.test((error && error.errMsg) || ''); }

// Resolves with persisted file paths. Resolves with [] when the user cancels or declines.
function choosePhotos(count) {
  return new Promise((resolve, reject) => {
    if (!wx.chooseMedia) {
      reject(new Error('Photo picking needs a newer WeChat version.'));
      return;
    }
    wx.chooseMedia({
      count: Math.max(1, Math.min(4, count)),
      mediaType: ['image'],
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success(res) {
        const files = (res.tempFiles || []).slice(0, count);
        Promise.all(files.map(compress))
          .then((paths) => resolve(paths.map(persistTemp)))
          .catch(() => reject(new Error('Could not save that photo. Please try again.')));
      },
      fail(error) {
        if (isCancel(error)) { resolve([]); return; }
        if (isPrivacyDenied(error)) { resolve([]); return; }
        if (isAuthDenied(error)) {
          wx.showModal({
            title: 'Photo access is off',
            content: 'Allow camera or album access in Settings to add your own photos.',
            confirmText: 'Settings',
            cancelText: 'Not now',
            success: (res) => { if (res.confirm && wx.openSetting) wx.openSetting(); },
          });
          resolve([]);
          return;
        }
        reject(new Error('Could not open your photos. Please try again.'));
      },
    });
  });
}

function removePhoto(path) {
  if (!isUserFile(path)) return;
  try { fs().unlinkSync(path); } catch (error) { /* already gone */ }
}

// Set of every user file still referenced by a list of memories (and the profile avatar).
function referencedFiles(memories, profile) {
  const keep = {};
  (memories || []).forEach((item) => {
    [item.photo, item.placePhoto].concat(item.extraPhotos || []).forEach((path) => { if (isUserFile(path)) keep[path] = true; });
  });
  if (profile && isUserFile(profile.avatar)) keep[profile.avatar] = true;
  return keep;
}

function removeMemoryFiles(item, keep) {
  [item.photo, item.placePhoto].concat(item.extraPhotos || []).forEach((path) => {
    if (!(keep && keep[path])) removePhoto(path);
  });
}

// Deletes files under the savor directory that no memory, draft, or profile references anymore.
function sweepOrphans(keep) {
  try {
    const dir = ensureDir();
    fs().readdirSync(dir).forEach((name) => {
      const path = dir + '/' + name;
      if (/\.json$/i.test(name)) { removePhoto(path); return; }
      if (!keep[path]) removePhoto(path);
    });
  } catch (error) { /* best effort */ }
}

function decodeBase64(input) {
  const clean = String(input).replace(/[^A-Za-z0-9+/]/g, '');
  const length = Math.floor(clean.length * 3 / 4);
  const bytes = new Uint8Array(length);
  let position = 0;
  for (let i = 0; i + 1 < clean.length; i += 4) {
    const c0 = B64.indexOf(clean[i]);
    const c1 = B64.indexOf(clean[i + 1]);
    const c2 = i + 2 < clean.length ? B64.indexOf(clean[i + 2]) : -1;
    const c3 = i + 3 < clean.length ? B64.indexOf(clean[i + 3]) : -1;
    bytes[position++] = (c0 << 2) | (c1 >> 4);
    if (c2 >= 0 && position < length) bytes[position++] = ((c1 & 15) << 4) | (c2 >> 2);
    if (c3 >= 0 && position < length) bytes[position++] = ((c2 & 3) << 6) | c3;
  }
  return bytes.buffer.slice(0, position);
}

// Web exports embed uploads as data URIs; write them to files so storage stays small and pages stay fast.
function materializePhoto(path) {
  if (!isSafeImage(path)) return photos.meal;
  if (/^(https:\/\/|\/images\/)/.test(path)) return path;
  const embedded = /^data:image\/(jpeg|png|webp|gif);base64,(.+)$/.exec(path);
  if (embedded) {
    try {
      const target = ensureDir() + '/' + nextName(embedded[1] === 'jpeg' ? 'jpg' : embedded[1]);
      fs().writeFileSync(target, decodeBase64(embedded[2]));
      return target;
    } catch (error) {
      return photos.meal;
    }
  }
  return exists(path) ? path : photos.meal;
}

function materializeMemory(item) {
  const copy = Object.assign({}, item);
  copy.photo = materializePhoto(copy.photo);
  copy.extraPhotos = (copy.extraPhotos || []).map(materializePhoto);
  if (copy.placePhoto) copy.placePhoto = materializePhoto(copy.placePhoto);
  return copy;
}

// Verifies every referenced user file still exists; missing ones fall back to the bundled sample.
function verifyMemory(item) {
  const check = (path) => (isUserFile(path) && !exists(path) ? photos.meal : path);
  const copy = Object.assign({}, item, { photo: check(item.photo), extraPhotos: (item.extraPhotos || []).map(check) });
  if (copy.placePhoto) copy.placePhoto = check(copy.placePhoto);
  return copy;
}

// Backup form readable by the web app: local user files become data URIs, bundled photos keep their /images path.
function exportPhoto(path) {
  if (!isUserFile(path)) return remotePhoto(path);
  try {
    const stat = fs().statSync(path);
    if (stat.size > MAX_BACKUP_FILE) return photos.meal;
    const mime = { jpg: 'jpeg', png: 'png', webp: 'webp', gif: 'gif' }[extensionOf(path, 'jpg')] || 'jpeg';
    return 'data:image/' + mime + ';base64,' + fs().readFileSync(path, 'base64');
  } catch (error) {
    return photos.meal;
  }
}

function exportMemory(item) {
  const copy = Object.assign({}, item, { photo: exportPhoto(item.photo), extraPhotos: (item.extraPhotos || []).map(exportPhoto) });
  if (copy.placePhoto) copy.placePhoto = exportPhoto(copy.placePhoto);
  return copy;
}

function writeText(name, content) {
  const path = ensureDir() + '/' + name;
  fs().writeFileSync(path, content, 'utf8');
  return path;
}

function readText(path) {
  return new Promise((resolve, reject) => {
    fs().readFile({
      filePath: path,
      encoding: 'utf8',
      success: (res) => resolve(res.data),
      fail: () => reject(new Error('This file could not be read.')),
    });
  });
}

module.exports = {
  choosePhotos, removePhoto, removeMemoryFiles, referencedFiles, sweepOrphans,
  materializeMemory, materializePhoto, verifyMemory, exportMemory, writeText, readText, isUserFile, exists,
};
