// Transient native-viewer inputs only. Never rewrite a Memory or its photo IDs.
const identity = require('./identity');
let serial = 0;
function resolve(images, token, ownTemporary) {
  return Promise.all(images.map(source => {
    identity.assertLease(token);
    if (typeof source === 'string' && source.startsWith('/images/')) {
      if (!/^\/images\/[A-Za-z0-9_/-]+\.(?:jpg|jpeg|png|webp)$/i.test(source) || source.includes('..')) return Promise.reject(new Error('INVALID_PACKAGE_PHOTO'));
      const extension = source.slice(source.lastIndexOf('.'));
      const path = wx.env.USER_DATA_PATH + '/savor-preview-' + Date.now().toString(36) + '-' + (++serial) + extension;
      return new Promise((done, fail) => {
        wx.getFileSystemManager().copyFile({srcPath:source, destPath:path,
          success:() => { ownTemporary(path); done(path); }, fail});
      }).then(path => { identity.assertLease(token); return path; });
    }
    if (typeof source === 'string' && source.startsWith('cloud://')) {
      // Reuse the existing private CloudBase download/lease boundary.
      return require('./cloudRecords').downloadMapPhoto(source).then(path => {
        ownTemporary(path); identity.assertLease(token); return path;
      });
    }
    return source;
  }));
}
module.exports = {resolve};
