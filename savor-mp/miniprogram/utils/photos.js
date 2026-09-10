// Photo pipeline: pick → compress → persist under USER_DATA_PATH.
// Temporary files from wx.chooseMedia must be copied before their paths
// are stored in the diary, or they expire and leave broken images.
const FS = wx.getFileSystemManager();

let dir = '';
function photosDir() {
  if (!dir) dir = wx.env.USER_DATA_PATH + '/savor-photos';
  return dir;
}

function ensureDir() {
  try {
    FS.accessSync(photosDir());
  } catch (error) {
    try { FS.mkdirSync(photosDir(), true); } catch (inner) { /* handle on write */ }
  }
}

function isUserPhoto(path) {
  return typeof path === 'string' && path.indexOf(photosDir()) === 0;
}

function wrap(promiseStyleFn) {
  return function () {
    const args = Array.prototype.slice.call(arguments);
    return new Promise(function (resolve, reject) {
      promiseStyleFn.apply(null, args.concat({
        success: resolve,
        fail: reject,
      }));
    });
  };
}

const chooseMedia = wrap(wx.chooseMedia);
const compressImage = wrap(wx.compressImage);

// Pick up to `count` images and persist them; resolves with local paths.
function choosePhotos(count) {
  return chooseMedia({
    count: count,
    mediaType: ['image'],
    sizeType: ['compressed'],
    sourceType: ['album', 'camera'],
  }).then(function (result) {
    const tasks = (result.tempFiles || []).map(function (file) {
      return persistPhoto(file.tempFilePath);
    });
    return Promise.all(tasks);
  });
}

// Copy one image into our persistent folder (compress first when possible).
function persistPhoto(tempPath) {
  if (!tempPath) return Promise.reject(new Error('No photo selected.'));
  if (isUserPhoto(tempPath)) return Promise.resolve(tempPath); // already ours
  ensureDir();
  return compressImage({ src: tempPath, quality: 78 })
    .then(function (res) {
      return copyIn(res.tempFilePath);
    })
    .catch(function () {
      return copyIn(tempPath); // compression is best-effort
    });
}

function copyIn(source) {
  return new Promise(function (resolve, reject) {
    const target = photosDir() + '/' + data_createId() + '.jpg';
    FS.copyFile({
      srcPath: source,
      destPath: target,
      success: function () { resolve(target); },
      fail: function (error) {
        // last resort: read + write (handles some temp filesystem quirks)
        FS.readFile({
          srcPath: source,
          success: function (res) {
            FS.writeFile({
              filePath: target,
              data: res.data,
              success: function () { resolve(target); },
              fail: reject,
            });
          },
          fail: reject,
        });
      },
    });
  });
}

function data_createId() {
  return 'ph-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

function removePhoto(path) {
  if (!isUserPhoto(path)) return; // bundled /images and remote urls stay
  try { FS.unlinkSync(path); } catch (error) { /* already gone */ }
}

// Delete user photos that are no longer referenced anywhere.
function pruneOrphans(keepPaths) {
  const keep = Object.create(null);
  (keepPaths || []).forEach(function (path) { if (path) keep[path] = true; });
  try {
    FS.readdirSync(photosDir()).forEach(function (name) {
      const full = photosDir() + '/' + name;
      if (!keep[full]) removePhoto(full);
    });
  } catch (error) { /* folder missing — nothing to prune */ }
}

// Collect every user photo path referenced by a diary state object.
function collectReferenced(state) {
  const refs = [];
  (state.memories || []).forEach(function (memory) {
    [memory.photo, memory.placePhoto].concat(memory.extraPhotos || []).forEach(function (path) {
      if (isUserPhoto(path)) refs.push(path);
    });
  });
  const avatar = state.profile && state.profile.avatar;
  if (isUserPhoto(avatar)) refs.push(avatar);
  return refs;
}

module.exports = {
  photosDir,
  isUserPhoto,
  choosePhotos,
  persistPhoto,
  removePhoto,
  pruneOrphans,
  collectReferenced,
};
