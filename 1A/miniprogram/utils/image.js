// Photo handling: pick with wx.chooseMedia, keep copies in the user data directory, clean up on delete.
const { photos } = require('./data');

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

function nextName(ext) { return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7) + '.' + ext; }

function persistTemp(tempPath) {
  const dir = ensureDir();
  const match = /\.(jpe?g|png|gif|webp)$/i.exec(tempPath);
  const target = dir + '/' + nextName(match ? match[1].toLowerCase() : 'jpg');
  fs().copyFileSync(tempPath, target);
  return target;
}

const LARGE_FILE = 600 * 1024;

// wx.chooseMedia already returns a compressed copy; anything still large is passed
// through wx.compressImage so the diary keeps a light footprint on the device.
function compressIfLarge(file) {
  return new Promise((resolve) => {
    if (!file || !file.tempFilePath) { resolve(''); return; }
    if (!(file.size > LARGE_FILE) || !wx.canIUse('compressImage')) { resolve(file.tempFilePath); return; }
    wx.compressImage({
      src: file.tempFilePath,
      quality: 78,
      compressedWidth: 1080,
      success: (res) => resolve(res.tempFilePath || file.tempFilePath),
      fail: () => resolve(file.tempFilePath),
    });
  });
}

function choosePhotos(count) {
  return new Promise((resolve, reject) => {
    wx.chooseMedia({
      count: Math.max(1, Math.min(9, count || 1)),
      mediaType: ['image'],
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success(res) {
        const files = (res && res.tempFiles) || [];
        Promise.all(files.map(compressIfLarge))
          .then((paths) => {
            const saved = [];
            paths.filter(Boolean).forEach((path) => {
              try { saved.push(persistTemp(path)); } catch (error) { /* skip the file we could not copy */ }
            });
            if (!saved.length && files.length) {
              reject(new Error('Could not save that photo. There may be no space left.'));
              return;
            }
            resolve(saved);
          })
          .catch(() => reject(new Error('Could not save that photo. Please try again.')));
      },
      fail(error) {
        const message = (error && error.errMsg) || '';
        if (/cancel/i.test(message)) { resolve([]); return; }
        if (/auth|permission|deny/i.test(message)) {
          // A refused album/camera permission must stay recoverable: offer the
          // WeChat settings panel instead of leaving the screen stuck.
          wx.showModal({
            title: 'Photos are locked',
            content: 'Savor needs access to your photos to keep a memory. You can turn it back on in settings.',
            confirmText: 'Settings',
            cancelText: 'Not now',
            success: (res) => { if (res.confirm && wx.openSetting) wx.openSetting({ fail: () => {} }); },
          });
          resolve([]);
          return;
        }
        reject(new Error('Could not open your photos.'));
      },
    });
  });
}

// Files that no memory, profile, or draft points at are dead weight; drop them.
function cleanupOrphans(keepList) {
  const keep = {};
  (keepList || []).forEach((path) => { if (path) keep[path] = true; });
  let names = [];
  try { names = fs().readdirSync(userDir()); } catch (error) { return 0; }
  let removed = 0;
  names.forEach((name) => {
    if (/\.json$/i.test(name)) return;
    const path = userDir() + '/' + name;
    if (keep[path]) return;
    try { fs().unlinkSync(path); removed += 1; } catch (error) { /* leave it */ }
  });
  return removed;
}

function removePhoto(path) {
  if (!isUserFile(path)) return;
  try { fs().unlinkSync(path); } catch (error) { /* already gone */ }
}

function removeMemoryFiles(item) {
  [item.photo].concat(item.extraPhotos || []).forEach(removePhoto);
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

// Web exports embed uploads as data URIs; write them to files so storage stays small.
function safePhoto(path) {
  if (typeof path !== 'string' || !path) return photos.meal;
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

function sanitizeMemory(item) {
  const copy = Object.assign({}, item);
  copy.photo = safePhoto(copy.photo);
  copy.extraPhotos = (copy.extraPhotos || []).map(safePhoto);
  if (copy.placePhoto) copy.placePhoto = safePhoto(copy.placePhoto);
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
      filePath: path, encoding: 'utf8',
      success: (res) => resolve(res.data),
      fail: () => reject(new Error('This file could not be read.')),
    });
  });
}

module.exports = { choosePhotos, removePhoto, removeMemoryFiles, sanitizeMemory, safePhoto, writeText, readText, isUserFile, cleanupOrphans, exists };
