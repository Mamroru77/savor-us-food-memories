// Task B regression: one unprocessable photo must not stop the rest of the batch, the
// whole save must still fail, and the failure must name the photo and the stage.
// Real cloudRecords.js / identity.js / photos.js / data.js; only the native layer
// (file system, decoder, compressor, upload transport) is simulated.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const mp = path.join(root, 'miniprogram');
const UID = 'u_' + 'a'.repeat(48);
const MiB = 1024 * 1024;
let passed = 0;
const tests = [];
const test = (name, fn) => tests.push({ name, fn });

// The upload race is a hard 20 000 ms in production; scale only long timers so the
// timeout branch stays observable inside a test run.
const realSetTimeout = global.setTimeout;
global.setTimeout = (fn, ms, ...rest) => realSetTimeout(fn, ms >= 15000 ? Math.round(ms / 200) : ms, ...rest);

const disk = new Map();
const vfs = new Map();
const dirs = new Set(['/user', '/user/savor-photos']);
let chooserFiles = [];
let uploadLog = [];
let mutationLog = [];
let compressLog = [];
let decodeLog = [];
let uploadBehavior = () => ({ ok: true });
let compressBehavior = () => ({ ok: true });

const FS = {
  accessSync(p) { if (!dirs.has(p) && !vfs.has(p)) throw new Error('ENOENT'); },
  mkdirSync(p) { dirs.add(p); },
  statSync(p) { const e = vfs.get(p); if (!e) throw new Error('ENOENT'); return { size: e.bytes }; },
  copyFile(o) { const e = vfs.get(o.srcPath); if (!e) { o.fail && o.fail({ errMsg: 'copyFile:fail' }); return; } vfs.set(o.destPath, Object.assign({}, e)); o.success && o.success({}); },
  readFile(o) { const e = vfs.get(o.filePath); if (!e) { o.fail && o.fail({ errMsg: 'readFile:fail' }); return; } o.success && o.success({ data: Buffer.alloc(e.bytes) }); },
  writeFile(o) { vfs.set(o.filePath, { bytes: (o.data && o.data.length) || 0, width: 1, height: 1, type: 'jpeg' }); o.success && o.success({}); },
  unlinkSync(p) { vfs.delete(p); },
  readdirSync: () => [],
};

global.wx = {
  env: { USER_DATA_PATH: '/user' },
  getStorageSync: k => (disk.has(k) ? disk.get(k) : ''),
  setStorageSync: (k, v) => { disk.set(k, v); },
  removeStorageSync: k => { disk.delete(k); },
  getWindowInfo: () => ({ statusBarHeight: 20, windowWidth: 375 }),
  getSystemInfoSync: () => ({ platform: 'ios', language: 'en' }),
  getAppBaseInfo: () => ({ language: 'en' }),
  getMenuButtonBoundingClientRect: () => ({ top: 44, height: 32, left: 280, width: 87 }),
  onNetworkStatusChange() {},
  getFileSystemManager: () => FS,
  chooseMedia(o) { o.success({ tempFiles: chooserFiles }); },
  getImageInfo(o) {
    const e = vfs.get(o.src);
    decodeLog.push({ src: o.src, found: !!e, type: e && e.type });
    if (!e || e.decodeFail) { o.fail && o.fail({ errMsg: 'getImageInfo:fail' }); return; }
    o.success({ width: e.width, height: e.height, type: e.type, path: o.src });
  },
  compressImage(o) {
    const e = vfs.get(o.src);
    const plan = compressBehavior(o, e);
    compressLog.push({ src: o.src, cw: o.compressedWidth || null, ok: !!plan.ok });
    if (!plan.ok) { o.fail && o.fail({ errMsg: 'compressImage:fail' }); return; }
    const out = 'http://tmp/cmp-' + compressLog.length + '.' + (plan.ext || 'jpg');
    vfs.set(out, { bytes: plan.bytes, width: plan.cw || (e && e.width) || 1, height: plan.ch || (e && e.height) || 1, type: plan.type || 'jpeg' });
    o.success({ tempFilePath: out });
  },
  setNavigationBarColor() {}, pageScrollTo() {}, previewImage() {}, showModal() {},
  switchTab(o) { o && o.success && o.success(); },
  cloud: {
    init() {},
    callFunction({ name, data }) {
      if (name === 'account') return Promise.resolve({ result: { success: true, protocolVersion: 1, userId: UID } });
      const action = data && data.action;
      if (action === 'identityHandshake') return Promise.resolve({ result: { success: true, identityProtocol: 1, userId: UID } });
      mutationLog.push(action);
      if (action === 'add') return Promise.resolve({ result: { success: true, record: Object.assign({ _id: 'rec-1', revision: 0, coordinates: [0, 0], tags: [] }, data.data, { _id: 'rec-1' }) } });
      return Promise.resolve({ result: { success: true, data: [], nextCursor: '' } });
    },
    uploadFile(o) {
      uploadLog.push({ filePath: o.filePath, bytes: (vfs.get(o.filePath) || {}).bytes, cloudPath: o.cloudPath });
      const behavior = uploadBehavior(o);
      if (behavior.pending) return new Promise(() => {});
      if (!behavior.ok) return Promise.reject(Object.assign(new Error(behavior.errMsg || 'uploadFile:fail'), { errCode: behavior.errCode }));
      return Promise.resolve({ fileID: 'cloud://env.bucket/' + o.cloudPath });
    },
    async getTempFileURL() { return { fileList: [] }; },
  },
};

const identity = require(path.join(mp, 'utils/identity'));
const cloudRecords = require(path.join(mp, 'utils/cloudRecords'));
const photos = require(path.join(mp, 'utils/photos'));
const data = require(path.join(mp, 'utils/data'));

const P = n => '/user/savor-photos/ph-' + n + '.jpg';
const PNG = n => '/user/savor-photos/ph-' + n + '.png';
const put = (p, bytes, type, width, height, extra) => vfs.set(p, Object.assign({ bytes, width: width || 4000, height: height || 3000, type }, extra || {}));
function reset() { uploadLog = []; mutationLog = []; compressLog = []; decodeLog = []; vfs.clear(); uploadBehavior = () => ({ ok: true }); compressBehavior = () => ({ ok: true }); }
function memoryWithPhotos(paths) {
  return {
    id: data.createId(), restaurant: 'Real dinner', city: '', country: '', neighborhood: '', notes: '', date: '2026-09-10',
    rating: 4, tags: ['Dinner'], photo: paths[0], noPhoto: paths.length === 0, extraPhotos: paths.slice(1),
    coordinates: [39.9042, 116.4074], locationUnknown: true, shared: false, liked: false, saved: false,
  };
}
let attemptSeq = 0;
function newAttempt(paths) { return { actorUserId: UID, id: 'att-' + (++attemptSeq), memory: memoryWithPhotos(paths), uploads: {}, submitted: false }; }
async function save(attempt, persist) {
  let error = null;
  try { await cloudRecords.addRecord(attempt, persist || (() => {})); } catch (e) { error = e; }
  return error;
}
// A PNG whose re-encode never shrinks: a prepare-stage failure that never reaches upload.
const unreduciblePng = () => { put(PNG(90), 12 * MiB, 'png'); };
const pngCompress = (o, e) => (e && e.type === 'png' ? { ok: true, bytes: 11 * MiB, cw: o.compressedWidth, ch: o.compressedHeight, type: 'png', ext: 'png' } : { ok: true, bytes: 0.4 * MiB });

test('a failing photo does not stop the photos after it', async () => {
  reset();
  put(P(1), 1 * MiB, 'jpeg');
  unreduciblePng();
  put(P(3), 1 * MiB, 'jpeg');
  compressBehavior = pngCompress;
  const attempt = newAttempt([P(1), PNG(90), P(3)]);
  const error = await save(attempt);
  assert(error, 'the batch must still fail overall');
  const uploaded = uploadLog.map(u => u.filePath);
  assert(uploaded.includes(P(1)), 'photo 1 must be processed');
  assert(uploaded.includes(P(3)), 'photo 3 must be processed even though photo 2 failed; got ' + JSON.stringify(uploaded));
});

test('a batch with a failure never submits a partial memory', async () => {
  reset();
  put(P(1), 1 * MiB, 'jpeg');
  unreduciblePng();
  put(P(3), 1 * MiB, 'jpeg');
  compressBehavior = pngCompress;
  const attempt = newAttempt([P(1), PNG(90), P(3)]);
  const error = await save(attempt);
  assert(error);
  assert.deepEqual(mutationLog.filter(a => ['add', 'update', 'delete', 'setLocation', 'flags'].includes(a)), [], 'no mealRecords mutation may run for an incomplete batch');
  assert.equal(attempt.submitted, false, 'the attempt must stay unsubmitted so the draft is kept');
  assert.equal(uploadLog.length, 2, 'the two healthy photos are still prepared');
});

test('the successful uploads are cached so a retry does not re-upload them', async () => {
  reset();
  put(P(1), 1 * MiB, 'jpeg');
  unreduciblePng();
  put(P(3), 1 * MiB, 'jpeg');
  compressBehavior = pngCompress;
  const attempt = newAttempt([P(1), PNG(90), P(3)]);
  let persisted = 0;
  await save(attempt, () => { persisted++; });
  assert.equal(Object.keys(attempt.uploads).length, 2, 'both healthy photos must be cached: ' + JSON.stringify(Object.keys(attempt.uploads)));
  assert(persisted >= 2, 'each cached upload must be persisted for the next attempt');
  const before = uploadLog.length;
  attempt.memory = memoryWithPhotos([P(1), P(3)]);          // the user removed the bad photo
  const retryError = await save(attempt);
  assert.equal(retryError, null, 'the retry without the bad photo must succeed: ' + (retryError && retryError.message));
  assert.equal(uploadLog.length - before, 0, 'cached photos must not be uploaded again');
  assert.deepEqual(mutationLog.filter(a => a === 'add'), ['add']);
});

test('the failure names every failing photo by 1-based position', async () => {
  reset();
  unreduciblePng();
  put(P(2), 1 * MiB, 'jpeg');
  put(PNG(91), 12 * MiB, 'png');
  compressBehavior = pngCompress;
  const attempt = newAttempt([PNG(90), P(2), PNG(91)]);
  const error = await save(attempt);
  assert(error, 'the batch must fail');
  assert(error.failures && error.failures.length === 2, 'both failures must be reported: ' + JSON.stringify(error.failures));
  assert.deepEqual(error.failures.map(f => f.index), [1, 3], 'positions must be 1-based payload indexes');
  assert.match(error.message, /1/, 'the message must name the first failing photo');
  assert.match(error.message, /3/, 'the message must name the second failing photo');
  for (const failure of error.failures) {
    assert.equal(failure.uploadInvoked, false);
    assert.equal(failure.stage, 'prepare');
    assert.equal(failure.code, 'PHOTO_TOO_LARGE', 'a prepare failure must keep its own safe code: ' + failure.code);
  }
});

test('an upload-stage failure is classified as upload, not as prepare', async () => {
  reset();
  put(P(1), 1 * MiB, 'jpeg');
  put(P(2), 1 * MiB, 'jpeg');
  uploadBehavior = o => (o.filePath === P(2) ? { ok: false, errCode: -1, errMsg: 'uploadFile:fail createUploadTask error' } : { ok: true });
  const attempt = newAttempt([P(1), P(2)]);
  const error = await save(attempt);
  assert(error);
  assert.deepEqual(error.failures.map(f => ({ index: f.index, stage: f.stage, uploadInvoked: f.uploadInvoked })), [{ index: 2, stage: 'upload', uploadInvoked: true }]);
});

test('the failure record carries no local path, cloud secret or openid', async () => {
  reset();
  unreduciblePng();
  compressBehavior = pngCompress;
  const attempt = newAttempt([PNG(90)]);
  const error = await save(attempt);
  const dump = JSON.stringify({ message: error.message, code: error.code, failures: error.failures });
  for (const secret of [PNG(90), '/user/', 'savor-photos', UID, 'cloud://']) {
    assert(!dump.includes(secret), 'the failure record leaked "' + secret + '": ' + dump);
  }
});

test('a chooser batch that silently drops a photo reports it to the caller', async () => {
  reset();
  const source = 'wxfile://tmp_pick_ok.jpg';
  const heic = 'wxfile://tmp_pick_bad.heic';
  vfs.set(source, { bytes: 0.4 * MiB, width: 1200, height: 900, type: 'jpeg' });
  vfs.set(heic, { bytes: 0.4 * MiB, width: 1200, height: 900, type: 'heic' });
  chooserFiles = [{ tempFilePath: source, size: 0.4 * MiB, sizeType: 'compressed' }, { tempFilePath: heic, size: 0.4 * MiB, sizeType: 'compressed' }, { tempFilePath: source, size: 0.4 * MiB, sizeType: 'compressed' }];
  compressBehavior = (o, e) => (e && e.type === 'heic' ? { ok: false } : { ok: true, bytes: 0.4 * MiB });
  const paths = await photos.choosePhotos(3, null, () => {});
  assert.equal(paths.length, 2, 'the readable photos are still returned');
  assert(Array.isArray(paths.failures), 'the caller must receive a partial-selection signal');
  assert.equal(paths.failures.length, 1, 'exactly one selected photo was dropped');
  assert.deepEqual({ index: paths.failures[0].index, stage: paths.failures[0].stage }, { index: 2, stage: 'source' });
  assert.equal(paths.selected, 3, 'the caller must be able to compare selected against returned');
  assert(!JSON.stringify(paths.failures).includes('/user/'), 'the chooser failure record must not leak a path');
});

test('a fully successful chooser batch reports no failures and keeps the avatar contract', async () => {
  reset();
  const source = 'wxfile://tmp_pick_ok.jpg';
  vfs.set(source, { bytes: 0.4 * MiB, width: 1200, height: 900, type: 'jpeg' });
  chooserFiles = [{ tempFilePath: source, size: 0.4 * MiB, sizeType: 'compressed' }];
  compressBehavior = () => ({ ok: true, bytes: 0.4 * MiB });
  const paths = await photos.choosePhotos(1, null, () => {});
  assert.equal(paths.length, 1);
  assert.deepEqual(paths.failures, []);
  assert.equal(paths.selected, 1);
  const [only] = paths;                                   // the shape avatar callers destructure
  assert.equal(typeof only, 'string');
});

test('the Add page tells the user when the chooser dropped a photo', async () => {
  reset();
  const source = 'wxfile://tmp_pick_ok.jpg';
  const heic = 'wxfile://tmp_pick_bad.heic';
  vfs.set(source, { bytes: 0.4 * MiB, width: 1200, height: 900, type: 'jpeg' });
  vfs.set(heic, { bytes: 0.4 * MiB, width: 1200, height: 900, type: 'heic' });
  chooserFiles = [
    { tempFilePath: source, size: 0.4 * MiB, sizeType: 'compressed' },
    { tempFilePath: heic, size: 0.4 * MiB, sizeType: 'compressed' },
    { tempFilePath: source, size: 0.4 * MiB, sizeType: 'compressed' },
  ];
  compressBehavior = (o, e) => (e && e.type === 'heic' ? { ok: false } : { ok: true, bytes: 0.4 * MiB });
  let spec = null;
  global.Page = value => { spec = value; };
  const pagePath = path.join(mp, 'pages/add/index.js');
  delete require.cache[require.resolve(pagePath)];
  require(pagePath);
  const store = require(path.join(mp, 'utils/store'));
  const page = Object.assign({}, spec, {
    data: JSON.parse(JSON.stringify(spec.data)),
    setData(patch, cb) { Object.assign(this.data, patch); if (cb) cb(); },
    getTabBar: () => null,
  });
  const toasts = [];
  const off = store.onToast(message => toasts.push(message && message.message));
  try {
    page.onLoad();
    page.onShow();
    page.pickPhotos(3, false);
    await new Promise(resolve => setTimeout(resolve, 600));
    assert.equal(page.data.draft.photos.length, 2, 'the readable photos still reach the draft');
    assert.equal(page.data.uploading, false);
    assert(toasts.some(message => /Some photos could not be prepared/.test(message || '')), 'the user must be told a selected photo was dropped; toasts=' + JSON.stringify(toasts));
    assert(!toasts.some(message => /kept forever|Memory saved/.test(message || '')), 'a partial selection must not read as success');
  } finally { off(); }
});

// A suite that never reaches its summary (a pending await that never settles, so the event loop
// drains) would otherwise exit 0 and look green inside verify:all. Fail loudly instead.
let completed = false;
process.on('beforeExit', () => { if (!completed) { console.error('verify-photo-batch-upload did not reach its summary: a pending await never settled'); process.exitCode = 1; } });

(async () => {
  await identity.verify();
  for (const entry of tests) {
    try { await entry.fn(); passed++; console.log('PASS ' + entry.name); }
    catch (error) { console.error('FAIL ' + entry.name); console.error('  ' + (error && error.message || error)); process.exitCode = 1; }
  }
  completed = true;
  console.log(passed + '/' + tests.length + ' photo batch-upload checks passed.');
})();
