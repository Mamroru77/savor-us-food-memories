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

function choosePhotos(count) {
  return new Promise((resolve, reject) => {
    wx.chooseMedia({
      count, mediaType: ['image'], sizeType: ['compressed'], sourceType: ['album', 'camera'],
      success(res) {
        try { resolve(res.tempFiles.map((file) => persistTemp(file.tempFilePath))); }
        catch (error) { reject(new Error('Could not save that photo. Please try again.')); }
      },
      fail(error) {
        if (error && /cancel/i.test(error.errMsg || '')) resolve([]);
        else reject(new Error('Could not open your photos.'));
      },
    });
  });
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

module.exports = { choosePhotos, removePhoto, removeMemoryFiles, sanitizeMemory, safePhoto, writeText, readText, isUserFile };
