
const fs = require('fs');
const path = require('path');
const os = require('os');

// Mock wx
global.wx = {
  env: { USER_DATA_PATH: fs.mkdtempSync(path.join(os.tmpdir(), 'savor-test-')) },
  getFileSystemManager: () => {
    return {
      accessSync: (p) => fs.accessSync(p),
      mkdirSync: (p, recursive) => fs.mkdirSync(p, {recursive: !!recursive}),
      statSync: (p) => { const s=fs.statSync(p); return {size:s.size}; },
      copyFile: ({srcPath, destPath, success, fail}) => {
        try { fs.copyFileSync(srcPath, destPath); success({}); } catch(e){ fail(e); }
      },
      readFile: ({filePath, success, fail}) => {
        try { const data=fs.readFileSync(filePath); success({data}); } catch(e){ fail(e); }
      },
      writeFile: ({filePath, data, success, fail}) => {
        try { fs.writeFileSync(filePath, data); success({}); } catch(e){ fail(e); }
      },
      getFileInfo: ({filePath, success}) => {
        try { const s=fs.statSync(filePath); success({size:s.size}); } catch(e){ success({size:0}); }
      }
    };
  },
  chooseMedia: (opts) => {},
  compressImage: ({src, quality, success, fail}) => {
    // Simulate compress by copying file
    try {
      const dest = src + '.compressed.jpg';
      fs.copyFileSync(src, dest);
      success({tempFilePath: dest});
    } catch(e){ fail(e); }
  },
  getSystemInfoSync: () => ({platform: 'android'}),
  getStorageSync: () => '',
  setStorageSync: () => {},
  cloud: { callFunction: async () => ({result:{success:true}}) }
};

// Mock identity
const mockIdentity = {
  lease: () => ({userId:'test_user', generation:1, namespace:'test', partition:{}}),
  resumeNative: async (t) => t,
  assertLease: () => {},
  getStorageSync: () => '',
  setStorageSync: () => {},
  verify: async () => ({userId:'test_user'}),
  snapshot: () => ({generation:1}),
  isCurrent: () => true,
  deviceSettings: () => ({theme:'pearl'}),
  exportCurrent: () => ({}),
  saveWorkspaceIntent: () => {},
  workspaceIntent: () => null,
};

// Mock runtimeConfig
const Module = require('module');
const originalRequire = Module.prototype.require;
Module.prototype.require = function(id) {
  if (id === './identity') return mockIdentity;
  if (id === './runtimeConfig') return {fileScope:'', storageNamespace:'test', appId:'test', cloudEnv:'test', identityMode:'normal'};
  if (id === './identityCopy') return () => ({});
  if (id === '../../utils/identity') return mockIdentity;
  if (id === '../../utils/runtimeConfig') return {fileScope:'', storageNamespace:'test'};
  return originalRequire.apply(this, arguments);
};

// Create a dummy source image
const srcDir = fs.mkdtempSync(path.join(os.tmpdir(), 'src-'));
const srcImage = path.join(srcDir, 'avatar.png');
fs.writeFileSync(srcImage, Buffer.from([0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A,0x00,0x00,0x00,0x0D,0x49,0x48,0x44,0x52])); // minimal PNG header
console.log('srcImage', srcImage, 'exists', fs.existsSync(srcImage));

// Load photos module
const photos = require('../../miniprogram/utils/photos');
const data = require('../../miniprogram/utils/data');

async function testAvatar() {
  console.log('=== Test Avatar persist ===');
  console.log('photosDir', photos.photosDir());
  console.log('isSafeImage before', data.isSafeImage(srcImage));
  
  try {
    const persisted = await photos.persistPhoto(srcImage, true);
    console.log('persisted path', persisted);
    console.log('exists', fs.existsSync(persisted));
    const stat = fs.statSync(persisted);
    console.log('size', stat.size);
    console.log('isUserPhoto', photos.isUserPhoto(persisted));
    console.log('isSafeImage after', data.isSafeImage(persisted));
    
    // Test isSafeImage allows wxfile and http tmp
    console.log('isSafeImage wxfile', data.isSafeImage('wxfile://tmp_123.jpg'));
    console.log('isSafeImage http tmp', data.isSafeImage('http://tmp/abc.jpg'));
    
    console.log('PASS avatar persist');
  } catch(e) {
    console.error('FAIL avatar persist', e);
    process.exitCode=1;
  }
  
  // Test extension handling
  console.log('\n=== Test extension handling ===');
  const jpgSrc = path.join(srcDir, 'test.jpg');
  fs.writeFileSync(jpgSrc, 'fake jpg');
  const pngSrc = path.join(srcDir, 'test.png');
  fs.writeFileSync(pngSrc, 'fake png');
  console.log('jpg ext', jpgSrc, '-> should be .jpg');
  console.log('png ext', pngSrc, '-> should be .png');
  
  // Test choosePhotos with progress
  console.log('\n=== Test choosePhotos progress callback ===');
  // Mock wx.chooseMedia to return our srcImage
  global.wx.chooseMedia = (opts) => {
    setTimeout(() => {
      opts.success({tempFiles:[{tempFilePath: srcImage, size:100, sizeType:'original'}]});
    }, 10);
  };
  global.wx.chooseImage = (opts) => {
    setTimeout(() => {
      opts.success({tempFilePaths:[srcImage]});
    }, 10);
  };
  
  try {
    let progressCalls = [];
    const paths = await photos.choosePhotos(1, (p)=>{ progressCalls.push(p); console.log('progress', p); });
    console.log('choosePhotos result', paths);
    console.log('progress calls', progressCalls.length);
    if (paths.length===0) throw new Error('no paths');
    console.log('PASS choosePhotos');
  } catch(e) {
    console.error('FAIL choosePhotos', e);
    process.exitCode=1;
  }
}

testAvatar();
