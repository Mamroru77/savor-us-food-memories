// Node-only contract tests. These mock WeChat/CloudBase, NOT a live cloud acceptance test.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const mp = path.join(root, 'miniprogram');
let count = 0;
async function test(name, fn) { await fn(); count++; console.log('PASS ' + name); }
const storage = {};
const rows = new Map();
let owner = 'owner-A', uploadCount = 0, addCalls = 0, functionDown = false, uploadFailure = 0, lostReply = false;
let created = false, deniedCreate = false, lostMutationReply = false;
const sdk = {
  DYNAMIC_CURRENT_ENV: 'dynamic', init() {}, getWXContext: () => ({ OPENID: owner, APPID:'test-app' }),
  database: () => ({
    command: { gt: value => ({ gt: value }), exists: value => ({exists:value}), remove:()=>({remove:true}) }, serverDate: () => new Date().toISOString(),
    async createCollection(name) {
      assert.equal(name, 'dining_records');
      if (deniedCreate) throw new Error('permission denied');
      if (created) throw new Error('collection already exists');
      created = true;
    },
    collection(name) {
      if(name==='savor_accounts')return {where(){return this;},limit(){return this;},async get(){return {data:[{userId:'u_'+(owner==='owner-A'?'a':'b').repeat(48)}]};}};
      assert.equal(name, 'dining_records');
      let where = {}, order = '_id', direction = 'asc', limit = Infinity;
      const q = {
        where(v) { where = v; return q; }, orderBy(k, d) { order = k; direction = d; return q; }, limit(n) { limit = n; return q; },
        async get() {
          const data = [...rows.values()].filter(r => Object.keys(where).every(k => where[k] && where[k].gt !== undefined ? r[k] > where[k].gt : r[k] === where[k]));
          data.sort((a, b) => String(a[order]).localeCompare(String(b[order])) * (direction === 'desc' ? -1 : 1));
          return { data: data.slice(0, limit) };
        },
        async update({ data }) {
          let updated = 0;
          for (const [id, row] of rows) {
            if (Object.keys(where).every(k => where[k] && where[k].exists !== undefined ? (row[k] !== undefined) === where[k].exists : row[k] === where[k])) { const next={...row,...data}; Object.keys(data).forEach(k=>{if(data[k] && data[k].remove) delete next[k];}); rows.set(id,next); updated++; }
          }
          return { stats: { updated } };
        },
        async add({ data }) {
          const id = data._id || 'legacy-' + rows.size;
          if (rows.has(id)) throw new Error('duplicate primary key');
          rows.set(id, { ...data, _id: id }); return { _id: id };
        }
      };
      return q;
    }
  })
};
function server() {
  const filename = path.join(root, 'cloudfunctions/mealRecords/index.js');
  const exports = {};
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), { exports, require: name => name === 'wx-server-sdk' ? sdk : require(name.startsWith('.') ? path.resolve(path.dirname(filename), name) : name), console: { error() {} } }, { filename });
  return event=>exports.main(Object.assign({identityProtocol:1,expectedUserId:'u_'+(owner==='owner-A'?'a':'b').repeat(48)},event));
}
let main = server();
global.wx = {
  env: { USER_DATA_PATH: '/user' },
  getStorageSync: key => storage[key], setStorageSync: (key, value) => { storage[key] = value; },
  getWindowInfo: () => ({ statusBarHeight: 20, windowWidth: 375 }),
  getFileSystemManager: () => ({ accessSync() {}, mkdirSync() {}, copyFile(o) { o.success(); }, readFile(o) { o.success({ data: 'photo' }); }, writeFile(o) { o.success(); }, unlinkSync() {}, readdirSync: () => [] }),
  chooseMedia(o) { o.success({ tempFiles: [{ tempFilePath: '/tmp/photo.jpg' }] }); },
  compressImage(o) { o.success({ tempFilePath: o.src }); },
  chooseLocation(o) { o.success({ latitude: 22.63, longitude: 120.3, name: 'Real dinner', address: '高雄市苓雅區' }); },
  openLocation(o) {},
  switchTab(o) { if(o.success)o.success(); }, createMapContext: () => ({ includePoints() {} }),
  cloud: {
    init(o) { assert.equal(o.env, 'cloud1-d9gqm52id66c0bcda'); },
    async uploadFile(o) {
      uploadCount++;
      if (uploadCount === uploadFailure) throw new Error('upload failed');
      return { fileID: 'cloud://cloud1-d9gqm52id66c0bcda.bucket/' + o.cloudPath };
    },
    async callFunction(o) {
      if (functionDown) throw new Error('function not deployed');
      if (o.data.action === 'add') addCalls++;
      const result = await main(o.data);
      if(lostMutationReply && ['flags','update','delete'].includes(o.data.action)) {lostMutationReply=false;throw new Error('mutation reply lost');}
      if (lostReply && o.data.action === 'add') { lostReply = false; throw new Error('response lost after commit'); }
      return { result };
    },
    async getTempFileURL({ fileList }) { return { fileList: fileList.map(fileID => ({ fileID, status: 0, tempFileURL: 'https://example.test/photo' })) }; }
  }
};
const data = require(path.join(mp, 'utils/data'));
// This suite uses a known-session fixture; real S1 boundaries have a separate adversarial suite.
const identityPath=require.resolve(path.join(mp,'utils/identity'));
require.cache[identityPath]={id:identityPath,filename:identityPath,loaded:true,exports:require('./identity-fixture.cjs').fixture(wx,()=> 'u_'+(owner==='owner-A'?'a':'b').repeat(48))};
let store = require(path.join(mp, 'utils/store'));
const service = require(path.join(mp, 'utils/cloudRecords'));
const sample = () => ({ ...data.initialMemories[0], id: data.createId(), restaurant: 'Real dinner', extraPhotos: [], noPhoto: true });
const pickedLocation = { coordinates: [22.63, 120.3], address: '高雄市苓雅區', locationName: 'Real dinner', locationSource: 'tencent-picker', coordinateSystem: 'gcj02' };
const draft = () => ({ ...store.freshDraft(), restaurant: 'Real dinner', location: pickedLocation });
function page(name) {
  let spec;
  global.Page = x => { spec = x; };
  const file = path.join(mp, 'pages', name, 'index.js'); delete require.cache[require.resolve(file)]; require(file);
  // Match native setData path semantics as well as whole-field assignments.
  const instance = { ...spec, data: JSON.parse(JSON.stringify(spec.data)), setData(patch, cb) { for (const [key,value] of Object.entries(patch)) { const keys=key.replace(/\[(\d+)\]/g,'.$1').split('.'); let target=this.data; for (let i=0;i<keys.length-1;i++) { if(target[keys[i]]===undefined)target[keys[i]]=/^\d+$/.test(keys[i+1])?[]:{}; target=target[keys[i]]; } target[keys[keys.length-1]]=value; } if (cb) cb(); }, getTabBar: () => ({ showSelection() {}, updateAppearance() {} }) };
  return instance;
}
// Native route fixture. No inferred owner is used as navigation authority.
function nativeTabs(initial=0){
  let spec,route=initial;const calls=[];
  const appearance={dusk:false,quiet:false,labels:['回忆','地图','记录','我们','我的'],addLabel:'记录'};
  vm.runInNewContext(fs.readFileSync(path.join(mp,'custom-tab-bar/index.js'),'utf8'),{
    Component:x=>spec=x,Date,
    getCurrentPages:()=>route<0?[]:[{route:'pages/'+['home','map','add','us','me'][route]+'/index',_tabAppearance:appearance}],
    wx:{switchTab(o){calls.push(o);route=['home','map','add','us','me'].indexOf(o.url.split('/')[2]);if(o.success)o.success();}}
  });
  function bar(){const b={...spec.methods,data:JSON.parse(JSON.stringify(spec.data)),updates:[],setData(p,cb){this.updates.push(p);Object.assign(this.data,p);if(cb)cb();}};spec.lifetimes.attached.call(b);return b;}
  return {spec,bar,calls,setRoute:n=>route=n,tap:(b,n)=>b.onTabTap({currentTarget:{dataset:{index:n,path:'/pages/'+['home','map','add','us','me'][n]+'/index'}}})};
}
(async () => {
  await test('best-ui visual files match baseline or explicit user-requested UI amendments', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'tools/fixtures/regression/ui-baseline.json')));
    const approved = JSON.parse(fs.readFileSync(path.join(root, 'tools/fixtures/regression/ui-approved-updates.json')));
    // Historical fixtures stay byte-for-byte frozen; new visual reviews live separately.
    const refinements = JSON.parse(fs.readFileSync(path.join(root, 'tools/visual-refinements.json')));
    // A single reviewed Map geometry binding change; not a general WXML allowlist.
    const mapFrameReview = JSON.parse(fs.readFileSync(path.join(root, 'tools/map-frame-review.json')));
    assert.equal(mapFrameReview.file, 'miniprogram/pages/map/index.wxml');
    assert.match(mapFrameReview.sha256, /^[a-f0-9]{64}$/);
    assert(mapFrameReview.reason && mapFrameReview.review && fs.existsSync(path.join(root, mapFrameReview.review)));
    for (const [file, review] of Object.entries(refinements)) {
      assert(Object.hasOwn(manifest.sha256, file) && file.endsWith('.wxss'), 'refinements may only approve existing visual styles');
      assert.match(review.sha256, /^[a-f0-9]{64}$/);
      assert(review.reason && review.review && fs.existsSync(path.join(root, review.review)), 'a visual amendment requires its review record');
    }
    const uxReviews = JSON.parse(fs.readFileSync(path.join(root, 'tools/ux-remediation-review.json')));
    const uxScope = new Set(['miniprogram/components/sheet/index.wxml', 'miniprogram/pages/home/index.wxml', 'miniprogram/pages/map/index.wxml', 'miniprogram/pages/us/index.wxml', 'miniprogram/pages/me/index.wxml']);
    for (const [file, review] of Object.entries(uxReviews)) {
      assert(uxScope.has(file) && Object.hasOwn(manifest.sha256, file), 'UX review remains explicitly file-scoped');
      assert.match(review.baseSha256, /^[a-f0-9]{64}$/);
      assert.match(review.sha256, /^[a-f0-9]{64}$/);
      assert.equal(review.review, 'docs/reviews/ux-remediation-20260917.md');
      assert(review.reason && fs.existsSync(path.join(root, review.review)));
    }
    const stage6Reviews = JSON.parse(fs.readFileSync(path.join(root, 'tools/stage6-refactor-review.json')));
    const stage6Scope = [
      'miniprogram/components/settings-editor/index.wxml',
      'miniprogram/components/settings-editor/index.wxss',
      'miniprogram/components/sheet/index.wxml',
      'miniprogram/components/sheet/index.wxss',
    ];
    assert.deepEqual(Object.keys(stage6Reviews).sort(), stage6Scope);
    for (const [file, review] of Object.entries(stage6Reviews)) {
      assert.match(review.sha256, /^[a-f0-9]{64}$/);
      assert.equal(review.review, 'docs/superpowers/specs/2026-09-21-stage6-modular-boundaries-design.md');
      assert(review.reason && fs.existsSync(path.join(root, review.review)) && fs.existsSync(path.join(root, file)));
    }
    for (const [file, original] of Object.entries(manifest.sha256)) {
      if (approved[file] && approved[file].removed === true) {
        assert.equal(file, 'miniprogram/images/pin.png', 'only the explicitly audited obsolete pin may be removed');
        assert(!fs.existsSync(path.join(root, file)));
        assert(approved[file].reason && approved[file].replacements.length === 2);
        for (const replacement of approved[file].replacements) assert(fs.existsSync(path.join(root, replacement)));
        continue;
      }
      let expected = approved[file] ? approved[file].sha256 : original;
      if (refinements[file]) {
        assert.equal(refinements[file].baseSha256, expected, 'visual review must name the frozen checkpoint');
        expected = refinements[file].sha256;
      }
      if (file === mapFrameReview.file) {
        assert.equal(mapFrameReview.baseSha256, expected, 'Map geometry review must name its frozen checkpoint');
        expected = mapFrameReview.sha256;
      }
      if (uxReviews[file]) {
        assert.equal(uxReviews[file].baseSha256, expected, 'UX review must chain to the frozen approved checkpoint');
        expected = uxReviews[file].sha256;
      }
      if (stage6Reviews[file]) {
        assert.equal(stage6Reviews[file].baseSha256, expected, 'Stage 6 review must chain to the active checkpoint');
        expected = stage6Reviews[file].sha256;
      }
      let bytes = fs.readFileSync(path.join(root, file));
      if (!approved[file] && file === 'miniprogram/pages/add/index.wxml') bytes = Buffer.from(bytes.toString().replace("saving ? 'Saving memory...'", "saving ? 'Memory saved'"));
      assert.equal(require('crypto').createHash('sha256').update(bytes).digest('hex'), expected, file);
    }
    for (const file of stage6Scope.filter(file=>!Object.hasOwn(manifest.sha256,file))) {
      const bytes=fs.readFileSync(path.join(root,file));
      assert.equal(require('crypto').createHash('sha256').update(bytes).digest('hex'),stage6Reviews[file].sha256,file);
    }
  });
  function memoryRow() {
    let spec;const previous=global.Component;global.Component=x=>{spec=x;};
    const file=path.join(mp,'components/memory-row/index.js');delete require.cache[require.resolve(file)];
    try{require(file);}finally{global.Component=previous;}
    return {spec,...spec.methods,data:{...spec.data},setData(patch){Object.assign(this.data,patch);}};
  }
  await test('memory row resolves cloud photos transiently and skips duplicate locale/attach work',async()=>{
    const original=service.resolvePhotoUrls;let calls=0;const id='cloud://env.bucket/dining/a.jpg';
    service.resolvePhotoUrls=async ids=>{calls++;assert.deepEqual(ids,[id]);return ['https://example.com/private.jpg'];};
    try{const p=memoryRow();const memory={...sample(),photo:id,noPhoto:false};p.data.memory=memory;
      p.spec.observers['memory, locale'].call(p,memory);await Promise.resolve();
      assert.equal(p.data.photoSrc,'https://example.com/private.jpg');assert.equal(memory.photo,id);
      p.spec.lifetimes.attached.call(p);p.spec.observers['memory, locale'].call(p,memory);assert.equal(calls,1);
    }finally{service.resolvePhotoUrls=original;}
  });
  await test('memory row rejects stale and detached cloud-photo completions',async()=>{
    const original=service.resolvePhotoUrls;let done;service.resolvePhotoUrls=()=>new Promise(r=>{done=r;});
    try{const p=memoryRow();const pending=p.loadPhoto('cloud://env.bucket/dining/a.jpg');
      await p.loadPhoto(data.photos.meal);done(['https://example.com/old.jpg']);await pending;assert.equal(p.data.photoSrc,data.photos.meal);
      const next=p.loadPhoto('cloud://env.bucket/dining/b.jpg');p.spec.lifetimes.detached.call(p);done(['https://example.com/detached.jpg']);await next;assert.equal(p.data.photoSrc,data.photos.meal);
    }finally{service.resolvePhotoUrls=original;}
  });
  await test('memory row keeps fallback on denied/unresolved photos and bounds expiry retry',async()=>{
    const original=service.resolvePhotoUrls;const id='cloud://env.bucket/dining/a.jpg';
    try{
      for(const response of ['denied','unresolved']){service.resolvePhotoUrls=async()=>{if(response==='denied')throw new Error('denied');return [id];};const p=memoryRow();await p.loadPhoto(id);assert.equal(p.data.photoSrc,data.photos.meal);}
      let calls=0;service.resolvePhotoUrls=async()=>{calls++;return ['https://example.com/temporary.jpg'];};const p=memoryRow();await p.loadPhoto(id);await p.onPhotoError();await p.onPhotoError();assert.equal(calls,2);assert.equal(p.data.photoSrc,data.photos.meal);
      p.spec.observers['memory, locale'].call(p,null);assert.equal(p.data.location,'');assert.equal(p.data.photoSrc,data.photos.meal);
    }finally{service.resolvePhotoUrls=original;}
  });
  await test('memory row local and unsafe images never request cloud URLs; sheet uses class selector',async()=>{
    const original=service.resolvePhotoUrls;let calls=0;service.resolvePhotoUrls=async()=>{calls++;};
    try{const p=memoryRow();await p.loadPhoto(data.photos.meal);await p.loadPhoto('javascript:alert(1)');assert.equal(calls,0);assert.equal(p.data.photoSrc,data.photos.meal);}finally{service.resolvePhotoUrls=original;}
    assert(!fs.readFileSync(path.join(mp,'components/sheet/index.wxss'),'utf8').includes('.theme-option s-icon'));
    assert(fs.readFileSync(path.join(mp,'components/sheet/index.wxml'),'utf8').includes('class="theme-option-check"'));
  });
  await test('Cloud init preserves env and shell survives unavailable CloudBase', async () => {
    let app; global.App = x => { app = x; }; require(path.join(mp, 'app.js'));
    const cloud = wx.cloud; wx.cloud = null; assert.doesNotThrow(() => app.onLaunch()); wx.cloud = cloud; service.initCloud();
  });
  await test('sample boot and local Import never upload', () => {
    assert.equal(store.get().memories.length, 0); store.importMemories(data.initialMemories); assert.equal(addCalls, 0); assert.equal(uploadCount, 0);
  });
  await test('image validator accepts cloud file IDs but rejects malformed schemes and traversal', () => {
    assert(data.isSafeImage('cloud://env.bucket/dining/a.jpg'));
    for (const value of ['cloud://', 'cloud://env/', 'cloud://env/a/../b.jpg', 'cloud://env/a?token=x', 'javascript:alert(1)', '/user-evil/a.jpg', '/user/../a.jpg']) assert(!data.isSafeImage(value), value);
  });
  await test('photo picker uses a single options object and persists result', async () => {
    const photos = require(path.join(mp, 'utils/photos'));
    const paths = await photos.choosePhotos(1); assert(paths[0].startsWith('/user/savor-photos/'));
  });
  await test('Case 1: no-photo Add save, cloud row, store and draft reset', async () => {
    const p = page('add'); store.saveDraft(draft()); p.onLoad(); p.onShow();
    await p.onSave(); assert.equal(rows.size, 1); assert.equal(store.get().memories.length, 8);
    assert.equal([...rows.values()][0].photos.length, 0); assert.equal(store.loadDraft().restaurant, ''); p.onUnload();
  });
  await test('Case 2: one local photo uploaded and fileID persisted', async () => {
    const m = sample(); m.noPhoto = false; m.photo = '/user/savor-photos/one.jpg';
    const saved = await store.createCloudMemory(m, draft()); assert(data.isCloudImage(saved.photo)); assert.equal(uploadCount, 1); assert(data.isMemory(saved));
  });
  await test('Case 3: multiple photos plus placePhoto preserve slots without path collisions', async () => {
    const m = sample(); m.noPhoto = false; m.photo = '/user/savor-photos/two.jpg'; m.extraPhotos = ['/user/savor-photos/three.jpg', '/user/savor-photos/four.jpg']; m.placePhoto = '/user/savor-photos/place.jpg';
    const saved = await store.createCloudMemory(m, draft()); assert.equal(new Set([saved.photo, ...saved.extraPhotos, saved.placePhoto]).size, 4); assert.equal(saved.extraPhotos.length, 2);
  });
  await test('Case 4: function undeployed keeps Draft, restores Save state, explicit error', async () => {
    functionDown = true;
    const p = page('add'); store.saveDraft(draft()); p.onLoad(); p.onShow(); const n = rows.size;
    await p.onSave(); assert.equal(rows.size, n); assert.equal(p.data.saving, false); assert.equal(p.saveLock, false); assert.match(p.data.error, /deploy/); assert.equal(store.loadDraft().restaurant, 'Real dinner');
    functionDown = false; await p.onSave(); p.onUnload();
  });
  await test('Case 5: partial upload failure creates no record; retry reuses completed files', async () => {
    const m = sample(); m.noPhoto = false; m.photo = '/user/savor-photos/p1.jpg'; m.extraPhotos = ['/user/savor-photos/p2.jpg'];
    const d = draft(), beforeRows = rows.size, beforeUploads = uploadCount;
    uploadFailure = uploadCount + 2;
    await assert.rejects(store.createCloudMemory(m, d), /Photo upload failed/);
    assert.equal(rows.size, beforeRows); assert.equal(Object.keys(store.loadDraft().cloudAttempt.uploads).length, 1);
    uploadFailure = 0; await store.createCloudMemory(m, store.loadDraft()); assert.equal(uploadCount - beforeUploads, 3);
  });
  await test('Case 6: repeated Save click creates one row', async () => {
    const p = page('add'); store.saveDraft(draft()); p.onLoad(); p.onShow(); const before = rows.size;
    const first = p.onSave(); const second = p.onSave(); await Promise.all([first, second]);
    assert.equal(rows.size, before + 1); p.onUnload();
  });
  await test('lost add reply and retry keep the same cloud primary key', async () => {
    const before = rows.size; lostReply = true;
    await assert.rejects(store.createCloudMemory(sample(), draft()), /retry safely/);
    assert.equal(rows.size, before + 1); const pending = store.loadDraft(); assert(pending.cloudAttempt.submitted);
    await store.createCloudMemory(sample(), pending); assert.equal(rows.size, before + 1);
  });
  await test('Case 7: Home enters three times without duplicates', async () => {
    const p = page('home'); p.onLoad(); await p.onShow(); const n = store.get().memories.length;
    await p.onShow(); await p.onShow(); assert.equal(store.get().memories.length, n); assert.equal(new Set(store.get().memories.map(m => m.id)).size, n); p.onUnload();
  });
  await test('Case 8: module restart restores cloud cache, fresh cache can restore cloud data', async () => {
    const before = rows.size;
    delete storage['savor-diary-v1']; delete require.cache[require.resolve(path.join(mp, 'utils/store'))];
    store = require(path.join(mp, 'utils/store')); await store.syncCloud(); assert.equal(store.get().memories.filter(m => m.cloudId).length, before);
  });
  await test('Case 9: failed list leaves cache unchanged', async () => {
    const before = JSON.stringify(store.get().memories); functionDown = true;
    await assert.rejects(store.syncCloud()); functionDown = false; assert.equal(JSON.stringify(store.get().memories), before);
  });
  await test('Case 10: sync does not upload seven bundled samples', async () => {
    const before = addCalls; await store.syncCloud(); assert.equal(addCalls, before); assert.equal(store.get().memories.filter(m => !m.cloudId).length, 0);
  });
  await test('legacy integrated row maps without inventing two votes or a map location', () => {
    const m = service.cloudRecordToMemory({ _id: 'old', restaurantName: 'Old meal', date: '2026-09-01', ratings: { lajiChong: 3, xiaoXiaoQi: 5 }, photos: [], address: 'Street', cuisine: 'Chinese' });
    assert(data.isMemory(m)); assert.equal(m.rating, 4); assert.equal(m.ratingSource, 'legacy-average'); assert(m.locationUnknown);
    const r = service.memoryToCloudRecord(sample()); assert.equal(r.ratings, undefined);
  });
  await test('adapter preserves single rating, tags, geo, flags and integrated extras', () => {
    const m = { ...sample(), country: 'Taiwan', neighborhood: 'Lingya', coordinates: [22.63, 120.3], rating: 5, tags: ['Dinner'], shared: true, liked: true, saved: true, address: 'Street', dishes: ['Soup'], perCapita: 200 };
    const roundtrip = service.cloudRecordToMemory({ ...service.memoryToCloudRecord(m), _id: 'roundtrip' });
    for (const k of ['country', 'neighborhood', 'coordinates', 'rating', 'tags', 'shared', 'liked', 'saved', 'address', 'dishes', 'perCapita']) assert.deepEqual(roundtrip[k], m[k]);
  });
  await test('local favorites and local deletion survive cloud refresh and storage reload', async () => {
    const id = store.get().memories.find(m => m.cloudId).id; store.updateMemory(id, { liked: true, saved: true }); await store.syncCloud(); assert(store.get().memories.find(m => m.id === id).liked);
    store.deleteMemory(id); await store.syncCloud(); assert(!store.get().memories.some(m => m.id === id));
    delete require.cache[require.resolve(path.join(mp, 'utils/store'))]; store = require(path.join(mp, 'utils/store')); await store.syncCloud(); assert(!store.get().memories.some(m => m.id === id));
  });
  await test('server rejects fake owner and membership; list is owner isolated', async () => {
    const r = await main({ action: 'add', data: { ...service.memoryToCloudRecord(sample()), createdBy: 'intruder', memberOpenids: ['intruder'], coupleId: 'fake' } });
    assert(r.success); assert.equal(r.record.createdBy, owner); assert.deepEqual(Array.from(r.record.memberOpenids), [owner]); assert.equal(r.record.coupleId, '');
    owner = 'owner-B'; const list = await main({ action: 'list' }); assert.equal(list.data.length, 0); owner = 'owner-A';
  });
  await test('server validates dates, ratings, photo count, scheme and coordinate ranges', async () => {
    for (const patch of [{ date: '2026-02-30' }, { rating: 9 }, { photos: Array(10).fill('/images/a.jpg') }, { photos: ['/user/local.jpg'] }, { coordinates: [999, 0] }, { ratings: { lajiChong: -1 } }]) {
      const r = await main({ action: 'add', data: { ...service.memoryToCloudRecord(sample()), ...patch } }); assert.equal(r.success, false, JSON.stringify(patch));
    }
  });
  await test('server concurrent retries are idempotent', async () => {
    const before = rows.size; const event = { action: 'add', requestId: 'concurrent-123', data: service.memoryToCloudRecord(sample()) };
    const result = await Promise.all([main(event), main(event)]); assert(result.every(r => r.success)); assert.equal(rows.size, before + 1); assert.equal(result[0].id, result[1].id);
  });
  await test('pagination reads more than 50 records, legacy list stays date-descending', async () => {
    for (let i = 0; i < 65; i++) rows.set('page-' + String(i).padStart(3, '0'), { ...service.memoryToCloudRecord(sample()), createdBy: owner, _id: 'page-' + String(i).padStart(3, '0') });
    const list = await service.listRecords(); assert.equal(list.length, [...rows.values()].filter(r=>!r.deleted).length);
    const old = await main({ action: 'list' }); assert.equal(old.data.length, 50);
  });
  await test('Map / Us / Me / Library / detail accept cloud Memory', async () => {
    await store.syncCloud();
    for (const name of ['map', 'us', 'me']) { const p = page(name); p.onLoad(); p.onShow(); assert.equal(p.data.dusk, false); p.onUnload(); }
    let spec; global.Component = x => { spec = x; }; require(path.join(mp, 'components/sheet/index.js'));
    const sheet = { ...spec.methods, data: { ...spec.data, show: true, type: 'library', filter: 'all' }, setData(p) { Object.assign(this.data, p); } };
    sheet.refresh(); assert(sheet.data.libraryRows.length);
    sheet.data.type = 'memory'; sheet.data.memoryId = store.get().memories[0].id; sheet.refresh(); assert(sheet.data.detail);
    assert(store.get().memories.every(data.isMemory));
  });
  await test('temp URLs are transient; exported Memory still contains cloud IDs', async () => {
    const m = store.get().memories.find(m => data.isCloudImage(m.photo)); const before = m.photo;
    assert((await service.resolvePhotoUrls([m.photo]))[0].startsWith('https://')); assert.equal(m.photo, before);
    const backup = JSON.parse(JSON.stringify({ memories: store.get().memories })); assert(backup.memories.every(data.isMemory));
  });
  await test('photo selection cancellation keeps inputs and does not upload', async () => {
    const pick = wx.chooseMedia;
    // photos wraps the original function, so drive cancellation by reloading the module.
    wx.chooseMedia = o => o.fail({ errMsg: 'chooseMedia:fail cancel' });
    delete require.cache[require.resolve(path.join(mp, 'utils/photos'))];
    const photos = require(path.join(mp, 'utils/photos')); const before = uploadCount;
    await assert.rejects(photos.choosePhotos(1)); assert.equal(uploadCount, before);
    wx.chooseMedia = pick; delete require.cache[require.resolve(path.join(mp, 'utils/photos'))];
  });
  await test('leaving Add during save does not force navigation or lose committed data', async () => {
    const p = page('add'); store.saveDraft(draft()); p.onLoad(); p.onShow();
    let navigations = 0; const switchTab = wx.switchTab; wx.switchTab = () => { navigations++; };
    const before = rows.size; const saving = p.onSave(); p.onHide(); p.onUnload(); await saving;
    assert.equal(rows.size, before + 1); assert.equal(navigations, 0); assert.equal(store.loadDraft().restaurant, ''); wx.switchTab = switchTab;
  });
  await test('storage failure aborts before uploads and preserves in-memory form', async () => {
    const write = wx.setStorageSync; wx.setStorageSync = () => { throw new Error('full'); };
    const before = rows.size, d = draft();
    await assert.rejects(store.createCloudMemory(sample(), d), /Storage unavailable/);
    assert.equal(rows.size, before); assert.equal(d.restaurant, 'Real dinner'); wx.setStorageSync = write;
  });
  await test('concurrent Home refreshes share a single flight', async () => {
    const first = store.syncCloud(); const second = store.syncCloud(); assert.equal(first, second); await first;
  });
  await test('legacy display placeholders never become persisted single votes or coordinates', () => {
    const m = service.cloudRecordToMemory({ _id: 'unrated', restaurantName: 'Legacy', date: '2026-01-01', ratings: { lajiChong: 0, xiaoXiaoQi: 0 }, photos: [] });
    const r = service.memoryToCloudRecord(m); assert.equal(r.rating, undefined); assert.equal(r.coordinates, undefined);
  });
  await test('Tencent picker returns confirmed GCJ-02 coordinates and Add persists them', async () => {
    const locations = require(path.join(mp, 'utils/locations'));
    const picked = await locations.choose(); assert(locations.confirmed(picked));
    const p = page('add'); store.saveDraft(draft()); p.onLoad(); p.onShow(); await p.onChooseRestaurantLocation(); await p.onSave(); p.onUnload();
    const saved = store.get().memories[0]; assert(locations.confirmed(saved)); assert.equal(saved.address, '高雄市苓雅區');
  });
  await test('new Add refuses city-centre placeholder and retains draft', async () => {
    const d = draft(); delete d.location; d.restaurant = 'Never mapped restaurant'; store.saveDraft(d);
    const p = page('add'); p.onLoad(); p.onShow(); const before = rows.size; await p.onSave();
    assert.equal(rows.size, before); assert.equal(p.data.error, require(path.join(mp, 'utils/i18n')).t('Please confirm the restaurant in Tencent Maps before saving. A city centre is not a restaurant location.')); assert.equal(p.data.saving, false); p.onUnload();
  });
  await test('cloud location update is owner-authorized and survives list', async () => {
    const id = store.get().memories.find(m => m.cloudId).id;
    await store.setMemoryLocation(store.get().memories.find(m => m.id === id), pickedLocation);
    await store.syncCloud(); assert.deepEqual(store.get().memories.find(m => m.id === id).coordinates, pickedLocation.coordinates);
    owner = 'owner-B'; const denied = await main({ action: 'setLocation', id, data: pickedLocation }); assert.equal(denied.success, false); owner = 'owner-A';
    const bad = await main({ action: 'setLocation', id, data: { ...pickedLocation, coordinates: [999, 0] } }); assert.equal(bad.success, false);
  });
  await test('Map shows only confirmed real locations and reports records needing correction', async () => {
    const p = page('map'); p.onLoad(); await p.onShow(); assert.equal(p.data.demoMode, false); assert(p.data.pendingCount > 0);
    assert(p.data.markers.length > 0); for (const marker of p.data.markers) {
      const m = store.get().memories.find(m => m.id === marker.memoryId); assert.equal(m.locationSource, 'tencent-picker');
    }
    assert.equal(p.data.latitude, p.data.selected.coordinates[0]); p.onUnload();
  });
  await test('Us and Me ambient images react to store changes', () => {
    const us = page('us'), me = page('me'); us.onLoad(); me.onLoad();
    store.updateProfile({ avatar: '/images/coffee.jpg' }); me.onShow(); assert.equal(me.data.ambientPhoto, '/images/coffee.jpg');
    const memory = { ...sample(), id: 'new-background', date: require(path.join(mp,'utils/localDate')).shift(store.get().memories.map(m=>m.date).sort().pop(),1), photo: '/images/japanese.jpg', placePhoto: undefined, shared: true }; store.addMemory(memory); us.onShow();
    assert.equal(us.data.ambientPhoto, '/images/japanese.jpg'); assert.equal(us.data.journeyPhoto, '/images/japanese.jpg'); us.onUnload(); me.onUnload();
  });
  await test('Sheet scroll has a definite height and no panel touchmove interception', () => {
    const wxml = fs.readFileSync(path.join(mp, 'components/sheet/index.wxml'), 'utf8');
    const panel = wxml.match(/<view[^>]*class="sheet-panel[^>]+>/)[0]; assert(!panel.includes('catchtouchmove'));
    assert(wxml.includes('sheet-scrim') && wxml.includes('catchtouchmove="noop"'));
    const css = fs.readFileSync(path.join(mp, 'components/sheet/index.wxss'), 'utf8'); assert.match(css, /\.sheet-content\s*\{[^}]*\n  height:/);
  });
  await test('map pending notice starts collapsed, expands and collapses without cloud writes', () => {
    const p = page('map'); const before = addCalls;
    assert.equal(p.data.pendingExpanded, false); p.onTogglePending(); assert.equal(p.data.pendingExpanded, true);
    p.onCollapsePending(); assert.equal(p.data.pendingExpanded, false); assert.equal(addCalls, before);
    const wxml = fs.readFileSync(path.join(mp, 'pages/map/index.wxml'), 'utf8');
    assert(wxml.includes('pending-bubble')); assert(wxml.includes("pendingExpanded ? 'motion-visible'"));assert(wxml.includes('aria-hidden="{{!pendingExpanded}}"'));assert(!wxml.includes('wx:if="{{pendingExpanded}}"'));
    assert(!wxml.includes('class="location-status'));
    const css = fs.readFileSync(path.join(mp, 'pages/map/index.wxss'), 'utf8'); assert(css.includes('margin-top:108rpx'));
  });
  await test('restaurant uses shared calm material and actions fit inside the card', () => {
    const css = fs.readFileSync(path.join(mp, 'pages/map/index.wxss'), 'utf8');
    const shared = fs.readFileSync(path.join(mp, 'app.wxss'), 'utf8');
    assert(shared.includes('--content-card-bg: var(--surface-card)'));
    const tokens=fs.readFileSync(path.join(mp,'styles/visual-tokens.wxss'),'utf8');
    assert(tokens.includes('--surface-card: rgba(251, 250, 247, .82)'));
    assert(tokens.includes('--ambient-opacity: .12'));
    assert(fs.readFileSync(path.join(mp, 'pages/map/index.wxml'), 'utf8').includes('place-card glass content-card'));
    assert.match(css, /\.place-card\s*\{[^}]*height: 340rpx/);
    assert.match(css, /\.place-open\s*\{[^}]*height: 270rpx/);
    assert.match(css, /\.place-location-actions\s*\{[^}]*height:65rpx/);
  });
  await test('locale catalog covers every bound UI key in both languages', () => {
    const catalog = require(path.join(mp, 'utils/locales'));
    const keys = new Set(catalog.map(entry => entry.key)); assert.equal(keys.size, catalog.length);
    assert(catalog.every(entry => entry.en && entry.zh));
    function walk(dir) { return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(dir,e.name)) : [path.join(dir,e.name)]); }
    for (const file of walk(mp).filter(f => f.endsWith('.wxml'))) {
      const source = fs.readFileSync(file, 'utf8');
      for (const match of source.matchAll(/copy\.(s[0-9a-f]+)/g)) assert(keys.has(match[1]), file + ': ' + match[1]);
    }
  });
  await test('language switches immediately without translating personal memory or Draft content', () => {
    const i18n = require(path.join(mp, 'utils/i18n'));
    const p = page('me'); p.onLoad(); p.onShow();
    const before = JSON.stringify(store.get().memories); const input = { ...draft(), restaurant: 'Home', notes: '我的原文 / My own words', tags: ['Shared'] }; store.saveDraft(input);
    const draftBefore = JSON.stringify(store.loadDraft());
    store.updateSettings({ language: 'zh-CN' });
    assert.equal(i18n.t('Settings'), '设置'); assert.equal(p.data.menuRows.find(row => row.sheet === 'settings').title, '设置'); assert.equal(data.formatDate('2026-09-11'), '2026年9月11日');
    store.updateSettings({ language: 'en' }); assert.equal(p.data.menuRows.find(row => row.sheet === 'settings').title, 'Settings');
    assert.equal(JSON.stringify(store.get().memories), before); assert.equal(JSON.stringify(store.loadDraft()), draftBefore); p.onUnload();
  });
  await test('follow-system resolves zh and en while manual selection overrides system', () => {
    const i18n = require(path.join(mp, 'utils/i18n')); const old = wx.getAppBaseInfo;
    wx.getAppBaseInfo = () => ({ language: 'zh_CN' }); store.updateSettings({ language: 'system' }); assert.equal(i18n.locale(), 'zh-CN');
    store.updateSettings({ language: 'en' }); assert.equal(i18n.locale(), 'en');
    wx.getAppBaseInfo = () => ({ language: 'en_US' }); store.updateSettings({ language: 'system' }); assert.equal(i18n.locale(), 'en');
    store.updateSettings({ language: 'unsupported' }); assert.equal(store.get().settings.language, 'system');
    if (old) wx.getAppBaseInfo = old; else delete wx.getAppBaseInfo;
  });
  await test('TabBar gets locale/theme labels without business imports or selected-tab hijacking', () => {
    const i18n = require(path.join(mp, 'utils/i18n')); store.updateSettings({ language: 'zh-CN', theme: 'dusk' });
    let patch; const tab = { selected: 4 }; const fake = { setData() {}, getTabBar: () => ({ updateAppearance(selected,p) { patch = p; Object.assign(tab, p); } }) };
    i18n.syncPage(fake, store.get(), 0); assert.equal(tab.selected, 4); assert.deepEqual(patch.labels, ['回忆','地图','记录','我们','我的']); assert.equal(patch.dusk, true);
    const { extractRequires } = require('./lib/checks.cjs'); assert.deepEqual(extractRequires(fs.readFileSync(path.join(mp,'custom-tab-bar/index.js'),'utf8')), []);
    store.updateSettings({ language: 'en', theme: 'pearl' });
  });
  await test('Settings language picker stores the requested option and renders localized titles', () => {
    let spec; global.Component = value => { spec = value; };
    const file = path.join(mp, 'components/sheet/index.js'); delete require.cache[require.resolve(file)]; require(file);
    const sheet = { ...spec.methods, data: { ...spec.data, type: 'settings', show: true }, setData(p) { Object.assign(this.data,p); } };
    sheet.onLanguageChange({ detail: { value: 1 } }); sheet.refresh();
    assert.equal(store.get().settings.language, 'zh-CN'); assert.equal(sheet.data.title, '细微之处'); assert.equal(sheet.data.languageIndex, 1);
    sheet.onLanguageChange({ detail: { value: 2 } }); sheet.refresh(); assert.equal(sheet.data.title, 'The little details');
  });
  await test('dark palette text contrast remains readable and map veil does not intercept gestures', () => {
    const lum = hex => {
      const v = hex.match(/\w\w/g).map(x => parseInt(x,16)/255).map(x => x <= .04045 ? x/12.92 : ((x+.055)/1.055)**2.4);
      return v[0]*.2126+v[1]*.7152+v[2]*.0722;
    };
    const contrast = (a,b) => (Math.max(lum(a),lum(b))+.05)/(Math.min(lum(a),lum(b))+.05);
    for (const [text, background] of [['eeeae3','2b2c2f'],['b6b2aa','303135'],['f5f0e8','5a4d3d'],['302a23','cfb48d'],['dec8a7','2b2c30'],['253329','9c9b99']]) assert(contrast(text,background) >= 4.5, text + '/' + background);
    const css = require('./lib/reviewed-map-veil-removal.cjs').historicalContrastView(fs.readFileSync(path.join(mp,'pages/map/index.wxss'),'utf8'), fs.readFileSync(path.join(mp,'pages/map/index.wxml'),'utf8')); assert.match(css,/\.map-night-veil\s*\{[^}]*pointer-events:none/);
    assert(fs.readFileSync(path.join(mp,'app.wxss'),'utf8').includes('--content-card-bg: linear-gradient(155deg,rgba(43,44,47,.90),rgba(28,29,32,.90))')); assert(fs.readFileSync(path.join(mp,'custom-tab-bar/index.wxss'),'utf8').includes('#cfb48d'));
  });
  await test('language preference survives reloading the store module', () => {
    store.updateSettings({ language: 'zh-CN' });
    delete require.cache[require.resolve(path.join(mp,'utils/store'))]; store = require(path.join(mp,'utils/store'));
    assert.equal(store.get().settings.language, 'zh-CN'); assert.equal(require(path.join(mp,'utils/i18n')).t('Save Memory'), '保存回忆');
    store.updateSettings({ language: 'en' });
  });
  await test('saved-memory metric excludes samples, deduplicates records and respects shared scope', () => {
    const stats = require(path.join(mp, 'utils/memoryStats'));
    const sampleId = data.initialMemories[0].id;
    const input = [
      { id: sampleId, saved: true, shared: true },
      { id: 'real-cloud', cloudId: 'real-cloud', saved: true, shared: true },
      { id: 'real-private', saved: true, shared: false },
      { id: 'heart-only', liked: true, saved: false, shared: true },
      { id: 'real-cloud', cloudId: 'real-cloud', saved: true, shared: true },
      { id: 'plain', saved: false, shared: true },
    ];
    const before = JSON.stringify(input), writes = addCalls;
    assert.equal(stats.countSaved(input), 2); assert.equal(stats.countSaved(input, true), 1);
    assert.equal(stats.countSaved([]), 0); assert.equal(JSON.stringify(input), before); assert.equal(addCalls, writes);
    assert.equal(stats.countSaved([{ id: sampleId, cloudId: sampleId, saved: true }]), 1);
  });
  await test('Me and Us bookmark counts react to store changes, without counting likes as bookmarks', () => {
    const stats = require(path.join(mp, 'utils/memoryStats'));
    const me = page('me'), us = page('us'); me.onLoad(); us.onLoad(); me.onShow(); us.onShow();
    const record = { ...sample(), id: 'saved-metric-live', saved: false, shared: true };
    store.addMemory(record); const beforeMe = me.data.savedCount, beforeUs = us.data.savedCount;
    store.updateMemory(record.id, { liked: true }); assert.equal(me.data.savedCount, beforeMe);
    store.updateMemory(record.id, { saved: true }); assert.equal(me.data.savedCount, beforeMe+1); assert.equal(us.data.savedCount, beforeUs+1);
    store.updateMemory(record.id, { shared: false }); assert.equal(me.data.savedCount, beforeMe+1); assert.equal(us.data.savedCount, beforeUs);
    store.deleteMemory(record.id); assert.equal(me.data.savedCount, stats.countSaved(store.get().memories)); me.onUnload(); us.onUnload();
  });
  await test('countries are removed from summary UI but remain in the data model and cloud adapter', () => {
    const crypto = require('crypto'); const countryKey = 'copy.s'+crypto.createHash('sha1').update('Countries').digest('hex').slice(0,10);
    for (const pageName of ['me','us']) {
      const wxml = fs.readFileSync(path.join(mp,'pages',pageName,'index.wxml'),'utf8');
      assert(!wxml.includes(countryKey)); assert(wxml.includes('{{savedCount}}'));
    }
    const original = { ...sample(), country: 'China' };
    assert.equal(service.memoryToCloudRecord(original).country, 'China');
    assert.equal(service.cloudRecordToMemory({ ...service.memoryToCloudRecord(original), _id: 'country-retained' }).country, 'China');
  });
  await test('eight content cards share one transparent material and blur with no per-page overrides', () => {
    const cards = { home: ['weekly-card','recent-list'], map:['place-card','map-empty'], us:['together-card','journey-card'], me:['profile-stats-card','profile-menu'] };
    const appCss = fs.readFileSync(path.join(mp,'app.wxss'),'utf8');
    assert(appCss.includes('--content-card-blur: 20px;')); assert(appCss.includes('backdrop-filter: blur(var(--content-card-blur))'));
    assert(appCss.includes('.screen .content-card')); assert(appCss.includes('.screen.dusk'));
    for (const [pageName, classes] of Object.entries(cards)) {
      const wxml = fs.readFileSync(path.join(mp,'pages',pageName,'index.wxml'),'utf8');
      const css = fs.readFileSync(path.join(mp,'pages',pageName,'index.wxss'),'utf8');
      for (const cls of classes) {
        assert(wxml.includes(cls+' glass content-card'));
        const block = css.match(new RegExp('^\\.'+cls+'\\s*\\{([^}]*)\\}', 'm'));
        assert(block, cls); assert(!/background\s*:|backdrop-filter\s*:/.test(block[1]), cls+' overrides shared surface');
        assert(!new RegExp('\\.dusk \\.'+cls+'(?:\\s|[.{:#])').test(css), cls+' has a dark surface override');
      }
    }
  });
  await test('Me retains three metrics, readable copy and spacious growing menu rows', () => {
    const css = fs.readFileSync(path.join(mp,'pages/me/index.wxss'),'utf8');
    const wxml = fs.readFileSync(path.join(mp,'pages/me/index.wxml'),'utf8');
    assert.match(css,/\.profile-stats-card\s*\{[^}]*height: 280rpx/);
    assert.match(css,/\.profile-menu-row\s*\{[^}]*min-height: 136rpx/);
    assert.match(css,/\.memory-chart\s*\{[^}]*height: 80rpx/);
    assert.match(css,/\.profile-menu-sub\s*\{[^}]*font-size: 24rpx/);
    assert.equal((wxml.match(/stat-strong me-strong/g)||[]).length,3);
  });
  await test('Chinese display fonts use sans fallbacks while Latin/numeral serif and small copy are preserved', () => {
    const appCss = fs.readFileSync(path.join(mp,'app.wxss'),'utf8');
    const token = appCss.match(/--serif:\s*([^;]+);/)[1];
    assert(token.includes('SavorSerif')); assert(token.includes('PingFang SC')); assert(token.includes('Microsoft YaHei'));
    assert(!/Songti|STSong|SimSun/.test(token));
    assert(appCss.includes('.locale-zh .home-intro-title text:last-child'));
    for (const pageName of ['home','map','add','us','me']) {
      const wxml = fs.readFileSync(path.join(mp,'pages',pageName,'index.wxml'),'utf8'); assert(wxml.includes("locale === 'zh-CN' ? 'locale-zh'"));
    }
    assert(fs.readFileSync(path.join(mp,'pages/home/index.wxss'),'utf8').includes('font-size: 27rpx;'));
  });
  await test('personalized page copy is bounded, defaults localize, and user words are never translated', () => {
    const h = require(path.join(mp,'utils/pageHeadings')), i18n = require(path.join(mp,'utils/i18n'));
    assert.equal(h.clean('😀'.repeat(30),24),'😀'.repeat(24));
    assert.equal(h.normalize({ map: { title: 123, subtitle: ['bad'] } }).map.title, '');
    const state = { settings: { pageHeadings: { map: { title: 'Settings', subtitle: '自己的文案' } } } };
    i18n.setLanguage('zh-CN'); assert.equal(h.resolve(state,'map',i18n.t).title,'Settings');
    assert.equal(h.resolve(state,'home',i18n.t).title,i18n.t('the moment.'));
    i18n.setLanguage('en'); assert.equal(h.resolve(state,'map',i18n.t).subtitle,'自己的文案');
    assert.equal(h.resolve({ settings: { pageHeadings: null } },'map',i18n.t).title,'Map First');
  });
  await test('personalization persists atomically, refreshes headings, and preserves photos and records', () => {
    const i18n = require(path.join(mp,'utils/i18n'));
    const before = JSON.stringify(store.get().memories), avatar = store.get().profile.avatar, calls = addCalls;
    store.updatePersonalization({ home: { brand:'Our table', title:'美味日常' }, map:{ title:'周末觅食', subtitle:'慢慢探索' }, add:{ title:'记一餐' }, us:{title:'两人的餐桌'} }, {name:'测试名字',bio:'一起吃饭'});
    assert.equal(store.get().profile.avatar,avatar); assert.equal(JSON.stringify(store.get().memories),before); assert.equal(addCalls,calls);
    for (const [index,text] of [[0,'美味日常'],[1,'周末觅食'],[2,'记一餐'],[3,'两人的餐桌']]) {
      let patch; i18n.syncPage({setData(p){patch=p;}},store.get(),index); assert.equal(patch.pageHeading.title,text);
    }
    const saved = JSON.parse(storage['savor-diary-v1']); assert.equal(saved.profile.name,'测试名字'); assert.equal(saved.settings.pageHeadings.map.title,'周末觅食');
    const beforeFailure = JSON.stringify(store.get()), original = wx.setStorageSync;
    wx.setStorageSync = () => { throw new Error('disk full'); };
    try { assert.throws(() => store.updatePersonalization({}, {name:'Not saved',bio:''}), /disk full/); }
    finally { wx.setStorageSync = original; }
    assert.equal(JSON.stringify(store.get()),beforeFailure);
  });
  await test('personalization Sheet keeps drafts during refresh, cancels safely, resets per page, and handles save failures', () => {
    let spec; global.Component = value => { spec=value; };
    const file = path.join(mp,'components/sheet/index.js'); delete require.cache[require.resolve(file)]; require(file);
    let closed=0;
    const sheet = {...spec.methods,data:{...spec.data,type:'personalize',show:true},setData(p){Object.assign(this.data,p);},triggerEvent(){closed++;}};
    sheet.refresh(); assert.equal(sheet.data.personalizationRows.length,5);
    const before = JSON.stringify(store.get());
    sheet.onPersonalizationInput({currentTarget:{dataset:{index:1,field:'title'}},detail:{value:'未保存'}});
    sheet.refresh(); assert.equal(sheet.data.personalizationRows[1].title,'未保存'); assert.equal(JSON.stringify(store.get()),before);
    sheet.close(); sheet.refresh(); assert.equal(sheet.data.personalizationRows[1].title,'周末觅食');
    sheet.onPersonalizationReset({currentTarget:{dataset:{index:1}}}); assert.equal(sheet.data.personalizationRows[1].title,''); assert.equal(store.get().settings.pageHeadings.map.title,'周末觅食');
    const original = wx.setStorageSync; wx.setStorageSync=()=>{throw new Error('full');};
    try { sheet.onPersonalizationSave(); } finally {wx.setStorageSync=original;}
    assert(sheet.data.personalizationError); assert.equal(closed,1); assert.equal(store.get().settings.pageHeadings.map.title,'周末觅食');
    sheet.onPersonalizationSave(); assert.equal(closed,2); assert.equal(store.get().settings.pageHeadings.map.title,'');
    sheet.refresh(); sheet.onPersonalizationInput({currentTarget:{dataset:{index:4,field:'title'}},detail:{value:'  '}});
    sheet.onPersonalizationSave(); assert(sheet.data.personalizationError); assert.equal(closed,2);
  });
  await test('personalization reloads from existing diary key without a new storage or cloud schema', () => {
    const file = path.join(mp,'utils/store'); delete require.cache[require.resolve(file)]; const reloaded = require(file);
    assert.equal(reloaded.get().settings.pageHeadings.home.title,'美味日常'); assert.equal(reloaded.get().profile.bio,'一起吃饭');
    assert.equal(reloaded.get().settings.pageHeadings.map.title,'');
    const h = require(path.join(mp,'utils/pageHeadings')), i18n = require(path.join(mp,'utils/i18n'));
    reloaded.updateSettings({language:'zh-CN'}); assert.equal(h.resolve(reloaded.get(),'map',i18n.t).title,i18n.t('Map First'));
    assert.equal(h.resolve(reloaded.get(),'home',i18n.t).title,'美味日常');
  });
  await test('Map geometry is retained and Me exposes the scrollable personalization Sheet', () => {
    const mapCss=fs.readFileSync(path.join(mp,'pages/map/index.wxss'),'utf8');
    assert.match(mapCss,/\.place-card\s*\{[^}]*height: 340rpx/); assert.match(mapCss,/\.place-photo\s*\{[^}]*top:30rpx/); assert.match(mapCss,/\.place-photo\s*\{[^}]*bottom:30rpx/); assert.match(mapCss,/\.place-photo\s*\{[^}]*height: 280rpx/);
    const meCss=fs.readFileSync(path.join(mp,'pages/me/index.wxss'),'utf8');
    assert.match(meCss,/\.profile-stats-card\s*\{[^}]*height: 280rpx/); assert.match(meCss,/\.profile-menu-row\s*\{[^}]*min-height: 136rpx/);
    assert(fs.readFileSync(path.join(mp,'pages/me/index.js'),'utf8').includes("sheet: 'personalize'"));
    const wxml=fs.readFileSync(path.join(mp,'components/sheet/index.wxml'),'utf8');
    assert(wxml.includes('onPersonalizationSave')); assert(wxml.includes('onPersonalizationReset')); assert(wxml.includes('scroll-y enhanced'));
    assert(!wxml.includes('SUBcopy.'));
  });
  await test('Sheet uses measured remaining height, leaves bottom padding, and ignores detached callbacks', () => {
    let spec; global.Component = value => { spec=value; };
    const file=path.join(mp,'components/sheet/index.js'); delete require.cache[require.resolve(file)]; require(file);
    const metrics=require(path.join(mp,'utils/metrics')).getMetrics();
    let headingBottom=250;
    const sheet={...spec.methods,data:{show:true,sheetScrollHeight:0},setData(p){Object.assign(this.data,p);},createSelectorQuery(){
      const q={select(){return q;},boundingClientRect(){return q;},exec(cb){cb([{bottom:700},{bottom:headingBottom}]);}}; return q;
    }};
    sheet.measureScroll(); assert.equal(sheet.data.sheetScrollHeight,Math.floor(450-45*metrics.screenWidth/750-2));
    headingBottom=330; sheet.measureScroll(); assert.equal(sheet.data.sheetScrollHeight,Math.floor(370-45*metrics.screenWidth/750-2));
    const before=sheet.data.sheetScrollHeight; sheet._detached=true; headingBottom=400; sheet.measureScroll(); assert.equal(sheet.data.sheetScrollHeight,before);
  });
  await test('Sheet panel clears custom TabBar and its last action can scroll past an end spacer', () => {
    const css=fs.readFileSync(path.join(mp,'components/sheet/index.wxss'),'utf8');
    const wxml=fs.readFileSync(path.join(mp,'components/sheet/index.wxml'),'utf8');
    assert(css.includes('bottom: calc(194rpx + env(safe-area-inset-bottom))'));
    assert(!css.includes('86vh')); assert(!css.includes('min-height: 550rpx'));
    assert(css.includes('.sheet-content-measured { flex: none; }'));
    assert(wxml.includes('sheetScrollHeight')); assert(wxml.indexOf('class="sheet-content') < wxml.indexOf('class="sheet-end-space"')); assert(wxml.indexOf('class="sheet-end-space"') < wxml.lastIndexOf('</scroll-view>')); // Outer scroll now contains a horizontal thumbnail scroller.
    assert(css.includes('.sheet-end-space { height: 72rpx'));
  });
  await test('dark mode has layered charcoal surfaces and desaturated ambient depth without changing photos', () => {
    const app=fs.readFileSync(path.join(mp,'app.wxss'),'utf8');
    assert(app.includes('transparent 58%),#121315')); assert(app.includes('opacity:.055; filter:blur(18px) grayscale(1)'));
    assert(app.includes('--content-card-bg: linear-gradient(155deg,rgba(43,44,47,.90),rgba(28,29,32,.90))'));
    assert(!app.includes('#293f30')); assert(!app.includes('saturate(.7)'));
    const sheet=fs.readFileSync(path.join(mp,'components/sheet/index.wxss'),'utf8'); assert(sheet.includes('background:linear-gradient(160deg,#303135,#25262a)'));
    const tabs=fs.readFileSync(path.join(mp,'custom-tab-bar/index.wxss'),'utf8'); assert(tabs.includes('#cfb48d'));
  });
  await test('Nocturne accents remain limited to interaction and dark fields are inset below the modal', () => {
    const sheet=fs.readFileSync(path.join(mp,'components/sheet/index.wxss'),'utf8');
    assert(sheet.includes('--field:#1c1d20')); assert(sheet.includes('.theme-dusk-panel .personalization-reset { color:#dec8a7; }'));
    const tabs=fs.readFileSync(path.join(mp,'custom-tab-bar/index.js'),'utf8'); assert(tabs.includes("next.dusk?'#302a23':'#111510'"));
    const me=fs.readFileSync(path.join(mp,'pages/me/index.wxss'),'utf8'); assert(me.includes('border-bottom-color:rgba(238,234,227,.075)'));
    assert(fs.readFileSync(path.join(mp,'app.wxss'),'utf8').includes('--content-card-blur: 20px'));
  });
  await test('calendar dates cover UTC+8 midnight, leap days, Monday weeks and DST calendar days', () => {
    const cp=require('node:child_process'), file=path.join(mp,'utils/localDate');
    const run=(zone,expression)=>cp.execFileSync(process.execPath,['-e',`const d=require(${JSON.stringify(file)});console.log(${expression})`],{env:{...process.env,TZ:zone}}).toString().trim();
    assert.equal(run('Asia/Shanghai',"d.today(new Date('2026-09-10T16:01:00Z'))"),'2026-09-11');
    assert.equal(run('Asia/Shanghai',"d.today(new Date('2026-09-10T15:59:00Z'))"),'2026-09-10');
    assert.equal(run('America/New_York',"d.daysSince('2026-03-07',new Date(2026,2,9,0,5))"),'2');
    const dates=require(file); assert.equal(dates.shift('2024-02-28',1),'2024-02-29'); assert.equal(dates.shift('2026-02-28',1),'2026-03-01');
    assert.equal(dates.week(new Date(2026,8,11)).start,'2026-09-07');
    assert.equal(store.freshDraft().date,dates.today()); assert.equal(store.freshDraft().rating,0);
  });
  await test('Tencent metadata parses the first prefecture city, never retains stale Paris, and allows explicit confirmation', () => {
    const geo=require(path.join(mp,'utils/locations'));
    assert.deepEqual(geo.metadata('江苏省苏州市太仓市太仓大道').city,'苏州市');
    assert.equal(geo.metadata('上海市黄浦区').city,'上海市'); assert.equal(geo.metadata('台湾高雄市苓雅區').city,'高雄市');
    assert.equal(geo.metadata('10 Some Street').geoConfirmed,false);
    const stale=service.cloudRecordToMemory({...service.memoryToCloudRecord(sample()),...pickedLocation,_id:'stale-paris',city:'Paris',country:'France'});
    assert.equal(stale.city,''); assert.equal(stale.country,'');
    const fresh=service.cloudRecordToMemory({...service.memoryToCloudRecord(sample()),...pickedLocation,...geo.metadata(pickedLocation.address),_id:'fresh-geo'});
    assert.equal(fresh.city,'高雄市'); assert(fresh.geoConfirmed);
  });
  await test('real statistics exclude samples, deduplicate IDs and venues, scope shared meals and calculate this week only', () => {
    const stats=require(path.join(mp,'utils/memoryStats')), now=new Date(2026,8,11,12);
    const a={...sample(),...pickedLocation,id:'stat-a',date:'2026-09-07',shared:true,saved:true};
    const b={...a,id:'stat-b',date:'2026-09-11',shared:false};
    const c={...a,id:'stat-c',date:'2026-08-31',coordinates:[23,120],saved:false};
    const result=stats.summary(data.initialMemories.concat([a,a,b,c]),false,now);
    assert.equal(result.meals,3);assert.equal(result.places,2);assert.equal(result.weeklyMeals,2);assert.equal(result.weeklyPlaces,1);
    assert.deepEqual(result.counts,[1,0,0,0,1,0,0]);assert.equal(stats.summary([a,b,c],true,now).meals,2);
    assert.equal(stats.summary(data.initialMemories,false,now).meals,0);
    assert.equal(stats.summary([{...a,locationSource:undefined,geoConfirmed:false}],false,now).places,0);
    assert.equal(stats.summary([{...a,date:'2026-09-13'}],false,now).weeklyMeals,0);
  });
  await test('unrated records and nine photos roundtrip without inventing a vote or losing business fields', () => {
    const memory={...sample(),rating:0,ratingSource:'unrated',noPhoto:false,extraPhotos:Array(8).fill('/images/cafe.jpg'),cuisine:'川菜',perCapita:88.5,dishes:['汤','面']};
    const payload=service.memoryToCloudRecord(memory); assert.equal(payload.rating,undefined);assert.equal(payload.photos.length,9);
    const mapped=service.cloudRecordToMemory({...payload,_id:'nine-photos'});assert.equal(mapped.rating,0);assert.equal(mapped.extraPhotos.length,8);assert.deepEqual(mapped.dishes,['汤','面']);assert.equal(mapped.perCapita,88.5);
    assert(data.isMemory(mapped));
  });
  await test('photo preview opens the selected image and arbitrary thumbnail removal preserves other photos', () => {
    const p=page('add');p.onLoad();const photos=['/images/cafe.jpg','/images/coffee.jpg','/images/japanese.jpg'];p.setData({draft:{...store.freshDraft(),photos}});
    let preview;wx.previewImage=o=>{preview=o;};p.onPreviewPhoto({currentTarget:{dataset:{index:1}}});assert.equal(preview.current,photos[1]);assert.deepEqual(preview.urls,photos);
    p.onRemovePhoto({currentTarget:{dataset:{index:1}}});assert.deepEqual(p.data.draft.photos,[photos[0],photos[2]]);p.onUnload();store.clearDraft();
  });
  await test('mutation server enforces owner, field allowlist, revisions and idempotent operation replay', async () => {
    const created=await main({action:'add',requestId:'mutation-base-001',data:service.memoryToCloudRecord(sample())});const id=created.id;
    const request={action:'flags',id,revision:1,operationId:'mutation-flags-001',data:{saved:true,createdBy:'evil',restaurantName:'evil'}};
    const first=await main(request);assert(first.success);assert.equal(first.record.revision,2);assert.equal(first.record.restaurantName,'Real dinner');assert.equal(first.record.createdBy,owner);
    const retry=await main(request);assert(retry.success);assert.equal(retry.record.revision,2);
    const conflict=await main({...request,operationId:'mutation-flags-002'});assert.equal(conflict.code,'CONFLICT');
    const previous=owner;owner='other-owner';const denied=await main({...request,revision:2,operationId:'mutation-flags-003'});owner=previous;assert.equal(denied.code,'NOT_FOUND');
    const invalid=await main({action:'update',id,revision:2,operationId:'mutation-invalid-01',data:{photos:Array(10).fill('/images/cafe.jpg')}});assert.equal(invalid.code,'INVALID_PHOTOS');
  });
  await test('competing mutations cannot silently overwrite each other and legacy revisionless records can migrate', async () => {
    const created=await main({action:'add',requestId:'concurrency-base',data:service.memoryToCloudRecord(sample())});
    const results=await Promise.all(['one','two'].map(n=>main({action:'flags',id:created.id,revision:1,operationId:'concurrency-'+n,data:{liked:true}})));
    assert.equal(results.filter(r=>r.success).length,1);assert.equal(results.filter(r=>r.code==='CONFLICT').length,1);
    rows.set('revisionless',{...created.record,_id:'revisionless'});delete rows.get('revisionless').revision;
    const migrated=await main({action:'flags',id:'revisionless',revision:0,operationId:'legacy-flags-001',data:{saved:true}});assert(migrated.success);assert.equal(migrated.record.revision,1);
  });
  await test('offline flags persist through restart, sequential local mutations rebase only after their own acknowledgment', async () => {
    store=require(path.join(mp,'utils/store'));
    const created=await main({action:'add',requestId:'offline-flags-base',data:service.memoryToCloudRecord(sample())});const memory=service.cloudRecordToMemory(created.record);store.addMemory(memory);
    functionDown=true;store.updateMemory(memory.id,{saved:true});store.updateMemory(memory.id,{liked:true});await store.flushOutbox();
    assert.equal(store.get().outbox.filter(o=>o.recordId===memory.id).length,2);assert(store.get().memories.find(m=>m.id===memory.id).liked);
    delete require.cache[require.resolve(path.join(mp,'utils/store'))];store=require(path.join(mp,'utils/store'));assert.equal(store.get().outbox.filter(o=>o.recordId===memory.id).length,2);
    functionDown=false;await store.syncCloud();assert.equal(store.get().outbox.filter(o=>o.recordId===memory.id).length,0);assert(rows.get(memory.id).liked);assert(rows.get(memory.id).saved);
    assert.equal(rows.get(memory.id).revision,3);
  });
  await test('lost mutation reply retries its durable operation ID without applying a second version', async () => {
    const created=await main({action:'add',requestId:'lost-mutation-base',data:service.memoryToCloudRecord(sample())});const memory=service.cloudRecordToMemory(created.record);store.addMemory(memory);
    lostMutationReply=true;store.updateMemory(memory.id,{saved:true});await store.flushOutbox();assert.equal(rows.get(memory.id).revision,2);
    const pending=store.get().outbox.find(o=>o.recordId===memory.id);assert(pending && pending.submitted);
    await store.flushOutbox();assert(!store.get().outbox.some(o=>o.recordId===memory.id));assert.equal(rows.get(memory.id).revision,2);
  });
  await test('storage failure never optimistically deletes a cloud record or loses its retry intent', async () => {
    const created=await main({action:'add',requestId:'storage-mutation-base',data:service.memoryToCloudRecord(sample())});const memory=service.cloudRecordToMemory(created.record);store.addMemory(memory);
    const before=JSON.stringify(store.get()), original=wx.setStorageSync;wx.setStorageSync=()=>{throw new Error('full');};
    try {assert.throws(()=>store.deleteMemory(memory.id),/full/);}finally{wx.setStorageSync=original;}
    assert.equal(JSON.stringify(store.get()),before);assert(!rows.get(memory.id).deleted);
  });
  await test('offline editing retains draft and uploads, retries without new records and preserves independent scores', async () => {
    const input={...service.memoryToCloudRecord(sample()),ratings:{lajiChong:2,xiaoXiaoQi:5}};
    const created=await main({action:'add',requestId:'editing-base-record',data:input});const memory=service.cloudRecordToMemory(created.record);store.addMemory(memory);
    const draft=store.beginEdit(memory), updated={...memory,restaurant:'Edited dinner',cuisine:'川菜',perCapita:123,dishes:['鱼'],rating:0,ratingSource:'unrated'};
    functionDown=true;await assert.rejects(store.createCloudMemory(updated,draft));assert(store.loadDraft().editOperationId);assert.equal(rows.get(memory.id).restaurantName,'Real dinner');
    functionDown=false;const count=rows.size;await store.createCloudMemory(updated,store.loadDraft());assert.equal(rows.size,count);assert.equal(rows.get(memory.id).restaurantName,'Edited dinner');
    assert.equal(rows.get(memory.id).rating,undefined);assert.equal(rows.get(memory.id).ratings.lajiChong,2);assert.equal(rows.get(memory.id).ratings.xiaoXiaoQi,5);assert.equal(store.loadDraft().editingId,undefined);
  });
  await test('conflicting edits stay visible as conflicts until explicit cloud resolution', async () => {
    const created=await main({action:'add',requestId:'conflict-edit-base',data:service.memoryToCloudRecord(sample())});const memory=service.cloudRecordToMemory(created.record);store.addMemory(memory);
    await main({action:'flags',id:memory.id,revision:1,operationId:'remote-change-001',data:{liked:true}});
    const draft=store.beginEdit(memory);await assert.rejects(store.createCloudMemory({...memory,restaurant:'Local conflict'},draft));
    assert.equal(store.get().outbox.find(o=>o.recordId===memory.id).error,'CONFLICT');assert.equal(rows.get(memory.id).restaurantName,'Real dinner');
    await store.useCloudVersion(memory.id);assert(!store.get().outbox.some(o=>o.recordId===memory.id));assert.equal(store.get().memories.find(m=>m.id===memory.id).restaurant,'Real dinner');
    store.clearDraft();
  });
  await test('cloud deletion is an idempotent tombstone, survives fresh sync and retains shared photo files', async () => {
    const created=await main({action:'add',requestId:'delete-tombstone-base',data:{...service.memoryToCloudRecord(sample()),photos:['cloud://cloud1-d9gqm52id66c0bcda.bucket/dining/shared/file.jpg']}});const memory=service.cloudRecordToMemory(created.record);store.addMemory(memory);
    functionDown=true;store.deleteMemory(memory.id);await store.flushOutbox();assert(!store.get().memories.some(m=>m.id===memory.id));assert(!rows.get(memory.id).deleted);
    functionDown=false;await store.syncCloud();assert(rows.get(memory.id).deleted);assert.equal(rows.get(memory.id).photos.length,1);
    const list=await service.listRecords();assert(!list.some(m=>m.id===memory.id));assert(list.deletedIds.includes(memory.id));
    const reply=await main({action:'update',id:memory.id,revision:2,operationId:'resurrect-attempt-01',data:{restaurantName:'Resurrect'}});assert.equal(reply.code,'DELETED');
  });
  await test('geographic correction replaces stale metadata and respects the mutation revision', async () => {
    const created=await main({action:'add',requestId:'geo-mutation-base',data:service.memoryToCloudRecord(sample())});const memory=service.cloudRecordToMemory(created.record);store.addMemory(memory);
    const location={...pickedLocation,...require(path.join(mp,'utils/locations')).metadata('江苏省苏州市太仓市太仓大道'),address:'江苏省苏州市太仓市太仓大道'};
    await store.setMemoryLocation(memory,location);assert.equal(rows.get(memory.id).city,'苏州市');assert.equal(rows.get(memory.id).country,'中国');assert.equal(rows.get(memory.id).revision,2);
  });
  await test('unknown legacy flags are not automatically claimed or sent', async () => {
    const created=await main({action:'add',requestId:'old-local-flags-base',data:service.memoryToCloudRecord(sample())});
    const snapshot=JSON.parse(storage['savor-diary-v1']);snapshot.memories.push({...service.cloudRecordToMemory(created.record),saved:true,localChanges:{saved:true}});
    storage['savor-diary-v1']=JSON.stringify(snapshot);
    delete require.cache[require.resolve(path.join(mp,'utils/store'))];store=require(path.join(mp,'utils/store'));
    const calls=addCalls;assert.equal(store.get().outbox.filter(o=>o.recordId===created.id).length,0);
    await store.syncCloud();assert.equal(rows.get(created.id).saved,false);assert.equal(addCalls,calls);assert(!store.get().memories.find(m=>m.id===created.id).localChanges);
  });
  await test('editing a legacy dual-score memory without touching rating never creates a single score', async () => {
    const input=service.memoryToCloudRecord(sample());delete input.rating;input.ratings={lajiChong:2,xiaoXiaoQi:4};
    const created=await main({action:'add',requestId:'legacy-score-edit',data:input});const memory=service.cloudRecordToMemory(created.record);store.addMemory(memory);
    const draft=store.beginEdit(memory);assert.equal(draft.ratingSource,'legacy-average');
    await store.createCloudMemory({...memory,notes:'Changed only notes'},draft);
    assert.equal(rows.get(memory.id).rating,undefined);assert.equal(rows.get(memory.id).ratings.lajiChong,2);assert.equal(rows.get(memory.id).ratings.xiaoXiaoQi,4);
  });
  await test('post-ack edit draft replay clears the draft without writing again', async () => {
    const created=await main({action:'add',requestId:'post-ack-edit-base',data:service.memoryToCloudRecord(sample())});const memory=service.cloudRecordToMemory(created.record);store.addMemory(memory);
    const draft=store.beginEdit(memory);await store.createCloudMemory({...memory,notes:'Edited'},draft);assert(draft.editOperationId);
    const revision=rows.get(memory.id).revision;store.saveDraft(draft);await store.createCloudMemory({...memory,notes:'Must not write again'},draft);assert.equal(rows.get(memory.id).revision,revision);assert.equal(rows.get(memory.id).note,'Edited');
  });
  await test('pending mutation snapshots keep local photos referenced during delete and retry', () => {
    const photos=require(path.join(mp,'utils/photos'));
    const refs=photos.collectReferenced({memories:[],profile:{},outbox:[{base:{photo:photos.photosDir()+'/base.jpg',extraPhotos:[]},memory:{photo:photos.photosDir()+'/new.jpg',extraPhotos:[]}}]});
    assert(refs.includes(photos.photosDir()+'/base.jpg'));assert(refs.includes(photos.photosDir()+'/new.jpg'));
  });
  await test('negative and invalid costs fail server validation rather than becoming silent zero values', async () => {
    for(const cost of [-1,'not-money',1000001]) {const result=await main({action:'add',data:{...service.memoryToCloudRecord(sample()),perCapita:cost}});assert.equal(result.code,'INVALID_PER_CAPITA');}
  });
  await test('Add form persists selected city, independent cuisine, per-person cost, dishes and nine photos end-to-end', async () => {
    store.clearDraft();const p=page('add');p.onLoad();p.active=true;
    p.onRestaurant({detail:{value:'表单测试餐厅'}});await p.onChooseRestaurantLocation();
    for(const [field,value] of [['cuisine','粤菜'],['perCapita','66.5'],['dishes','粥，茶']]) p.onBusinessField({currentTarget:{dataset:{field}},detail:{value}});
    p.changeDraft('photos',Array(9).fill('/images/cafe.jpg'));await p.onSave();
    const record=[...rows.values()].find(r=>r.restaurantName==='表单测试餐厅');assert(record);assert.equal(record.city,'高雄市');assert.equal(record.country,'台湾');assert.equal(record.geoConfirmed,true);
    assert.equal(record.cuisine,'粤菜');assert.equal(record.perCapita,66.5);assert.deepEqual(Array.from(record.dishes),['粥','茶']);assert.equal(record.photos.length,9);assert.equal(record.rating,undefined);p.onUnload();
  });
  await test('a delayed list cannot overwrite a newer locally acknowledged mutation', async () => {
    const created=await main({action:'add',requestId:'delayed-list-edit-base',data:service.memoryToCloudRecord(sample())});const memory=service.cloudRecordToMemory(created.record);store.addMemory(memory);
    const original=service.listRecords;let resolve;service.listRecords=()=>new Promise(r=>{resolve=r;});
    try {
      const flight=store.syncCloud();await new Promise(setImmediate);assert(resolve);
      store.updateMemory(memory.id,{saved:true});await store.flushOutbox();
      resolve([{...memory}]);await flight;
      const current=store.get().memories.find(m=>m.id===memory.id);assert(current.saved);assert.equal(current.revision,2);
    } finally {service.listRecords=original;}
  });
  await test('replaying an old Add request after deletion reports deletion instead of resurrecting the meal', async () => {
    const attempt={actorUserId:'u_'+'a'.repeat(48),id:'deleted-add-reply-test',memory:sample(),uploads:{},submitted:false};
    const saved=await service.addRecord(attempt,()=>{});
    const removed=await main({action:'delete',id:saved.id,revision:1,operationId:'delete-after-add-001'});assert(removed.success);
    await assert.rejects(service.addRecord(attempt,()=>{}),e=>e.code==='DELETED');assert.equal(attempt.submitted,false);assert(rows.get(saved.id).deleted);
  });
  await test('repairing a local legacy memory without a rating does not invent a three-star vote', () => {
    const raw={...sample(),id:'legacy-missing-score'};delete raw.rating;
    const snapshot=JSON.parse(storage['savor-diary-v1']);snapshot.memories.push(raw);storage['savor-diary-v1']=JSON.stringify(snapshot);
    delete require.cache[require.resolve(path.join(mp,'utils/store'))];store=require(path.join(mp,'utils/store'));
    const restored=store.get().memories.find(m=>m.id===raw.id);assert.equal(restored.rating,0);assert.equal(service.memoryToCloudRecord(restored).rating,undefined);
  });
  await test('S0 lost reply plus another-device edit must not silently rebase a queued full edit', async () => {
    store.clearDraft();
    const created=await main({action:'add',requestId:'s0-interleaved-replay',data:service.memoryToCloudRecord(sample())});
    const memory=service.cloudRecordToMemory(created.record);store.addMemory(memory);
    functionDown=true;store.updateMemory(memory.id,{saved:true});await store.flushOutbox();
    const edit=store.beginEdit(memory);await assert.rejects(store.createCloudMemory({...memory,notes:'Local queued note'},edit));
    functionDown=false;lostMutationReply=true;await store.flushOutbox();
    assert.equal(rows.get(memory.id).revision,2);
    const remote=await main({action:'update',id:memory.id,revision:2,operationId:'s0-other-device-edit',data:{note:'Other device note'}});assert(remote.success);
    await store.flushOutbox();
    assert.equal(rows.get(memory.id).note,'Other device note');
    assert.equal(store.get().outbox.find(op=>op.recordId===memory.id).error,'CONFLICT');
    await store.useCloudVersion(memory.id);store.clearDraft();
  });
  await test('S0 receipt distinguishes its applied revision from the latest record revision', async () => {
    const created=await main({action:'add',requestId:'s0-receipt-base',data:service.memoryToCloudRecord(sample())});
    const request={action:'flags',id:created.id,revision:1,operationId:'s0-receipt-operation',data:{saved:true,operationReceipts:[{id:'forged',revision:999}]}};
    const first=await main(request);assert.equal(first.operationRevision,2);
    await main({action:'update',id:created.id,revision:2,operationId:'s0-receipt-other-edit',data:{note:'Other note'}});
    const replay=await main(request);assert.equal(replay.record.revision,3);assert.equal(replay.operationRevision,2);assert.equal(replay.operationId,request.operationId);
    const memory=await service.mutate({actorUserId:'u_'+'a'.repeat(48),id:request.operationId,recordId:created.id,revision:1,kind:'flags',patch:{saved:true}},()=>{});
    assert.equal(memory.operationRevision,2);assert(!JSON.stringify(memory).includes('operationRevision'));assert(!replay.record.operationReceipts.some(r=>r.id==='forged'));
  });
  await test('S0 queued full-edit projection preserves acknowledged flags and revision', async () => {
    store.clearDraft();const created=await main({action:'add',requestId:'s0-overlay-base',data:service.memoryToCloudRecord(sample())});
    const memory=service.cloudRecordToMemory(created.record);store.addMemory(memory);
    functionDown=true;store.updateMemory(memory.id,{saved:true});await store.flushOutbox();
    const draft=store.beginEdit(memory);await assert.rejects(store.createCloudMemory({...memory,notes:'Queued note'},draft));functionDown=false;
    const original=service.mutate;service.mutate=async(op,keep)=>{if(op.recordId===memory.id && op.kind==='update'){const e=new Error('offline edit');e.code='CALL_FAILED';throw e;}return original(op,keep);};
    try {await store.flushOutbox();const projected=store.get().memories.find(m=>m.id===memory.id);assert(projected.saved);assert.equal(projected.revision,2);assert.equal(projected.notes,'Queued note');}
    finally {service.mutate=original;}
    await store.flushOutbox();store.clearDraft();
  });
  await test('S0 legacy missing receipts fail closed instead of assuming safe revision advancement', async () => {
    store.clearDraft();const created=await main({action:'add',requestId:'s0-legacy-receipt-base',data:service.memoryToCloudRecord(sample())});const memory=service.cloudRecordToMemory(created.record);store.addMemory(memory);
    functionDown=true;store.updateMemory(memory.id,{saved:true});await store.flushOutbox();const draft=store.beginEdit(memory);await assert.rejects(store.createCloudMemory({...memory,notes:'Unproven edit'},draft));
    const op=store.get().outbox.find(o=>o.recordId===memory.id && o.kind==='flags');
    await main({action:'flags',id:memory.id,revision:1,operationId:op.id,data:op.patch});delete rows.get(memory.id).operationReceipts;
    functionDown=false;await store.flushOutbox();assert.equal(rows.get(memory.id).revision,2);assert.notEqual(rows.get(memory.id).note,'Unproven edit');assert.equal(store.get().outbox.find(o=>o.recordId===memory.id).error,'CONFLICT');
    await store.useCloudVersion(memory.id);store.clearDraft();
  });
  await test('S0 wrong record or operation identity in a response cannot acknowledge a different record', async () => {
    const created=await main({action:'add',requestId:'s0-response-identity-base',data:service.memoryToCloudRecord(sample())});
    const op={actorUserId:'u_'+'a'.repeat(48),id:'s0-response-identity-op',recordId:created.id,revision:1,kind:'flags',patch:{liked:true}};
    const original=wx.cloud.callFunction;
    wx.cloud.callFunction=async(options)=>{const reply=await original(options);if(['flags','get'].includes(options.data.action)) reply.result={...reply.result,record:{...reply.result.record,_id:'wrong-record'}};return reply;};
    try {await assert.rejects(service.mutate(op,()=>{}),e=>e.code==='INVALID_RESPONSE');await assert.rejects(service.getRecord(created.id),e=>e.code==='INVALID_RESPONSE');}
    finally {wx.cloud.callFunction=original;}
    const result=await service.mutate(op,()=>{});assert.equal(result.id,created.id);assert.equal(result.revision,2);
  });
  await test('S0 finishing an older edit cannot clear a replacement draft', async () => {
    store.clearDraft();const created=await main({action:'add',requestId:'s0-replacement-draft-base',data:service.memoryToCloudRecord(sample())});const memory=service.cloudRecordToMemory(created.record);store.addMemory(memory);
    const draft=store.beginEdit(memory);const original=service.mutate;let release;
    service.mutate=async(op,keep)=>{if(op.recordId===memory.id)await new Promise(r=>{release=r;});return original(op,keep);};
    try {const saving=store.createCloudMemory({...memory,notes:'Saved old edit'},draft);await new Promise(setImmediate);assert(release);store.saveDraft({...store.freshDraft(),restaurant:'Newer unsaved draft'});release();await saving;assert.equal(store.loadDraft().restaurant,'Newer unsaved draft');}
    finally {service.mutate=original;store.clearDraft();}
  });
  await test('S0 an in-progress Add upload blocks replacing its retry draft with another edit', async () => {
    store.clearDraft();const original=service.addRecord;let release;service.addRecord=async(attempt,keep)=>{await new Promise(r=>{release=r;});return original(attempt,keep);};
    try {const saving=store.createCloudMemory(sample(),draft());await new Promise(setImmediate);assert(release);assert.throws(()=>store.beginEdit(sample()),/Sync status|同步状态/);release();await saving;}
    finally {service.addRecord=original;store.clearDraft();}
  });
  const shareImport = require(path.join(mp, 'utils/shareImport'));
  const shareSamples = JSON.parse(fs.readFileSync(path.join(root, 'tools/fixtures/regression/link-samples-2026-09-11.json'))).samples;
  for (const [index, item] of shareSamples.entries()) await test('share import real text fixture ' + item.id, () => {
    const c = shareImport.parse(item.shareText, index < 3 ? 'dianping' : 'meituan');
    assert.equal(c.name, item.candidateFromUserText.name);
    assert.equal(c.address, item.candidateFromUserText.address || '');
    assert.equal(c.platformRating, item.candidateFromUserText.platformRating);
    assert.equal(c.platformAveragePriceCny, item.candidateFromUserText.platformAveragePriceCny);
    assert.equal(c.diningMode, index < 3 ? 'dine-in' : 'delivery');
    assert.equal(c.webVerified, false); assert.equal(c.coordinates, undefined);
  });
  await test('share Markdown and HTML entities normalize without tracking in source URL', () => {
    const item=shareSamples[0];
    const text=item.shareText.replace(item.sourceUrl, '['+item.sourceUrl.replace(/&/g,'&amp;')+']('+item.sourceUrl+')');
    const c=shareImport.parse(text,'dianping');
    assert.equal(c.name,item.candidateFromUserText.name);
    assert.equal(c.sourceUrl,'https://m.dianping.com/shopinfo/k9s2UXBQSNeAFMFc');
  });
  await test('share empty, oversized, multi-shop and source mismatch fail explicitly', () => {
    for (const [text, source, code] of [['','dianping','TEXT_REQUIRED'],['x'.repeat(6001),'meituan','TEXT_TOO_LONG'],[shareSamples[0].shareText+'\n'+shareSamples[1].shareText,'dianping','ONE_SHOP_ONLY'],[shareSamples[3].shareText,'dianping','SOURCE_MISMATCH']]) {
      assert.throws(()=>shareImport.parse(text,source),e=>e.code===code);
    }
  });
  await test('bare link leaves name blank; other delivery is text-only and never guesses an address', () => {
    const c=shareImport.parse('http://dpurl.cn/unknown','meituan');assert.equal(c.name,'');
    assert.throws(()=>shareImport.applyCandidate(store.freshDraft(),c),e=>e.code==='NAME_REQUIRED');
    const other=shareImport.parse('外卖店铺「合成测试店」 https://example.test/store','other-delivery');
    assert.equal(other.name,'合成测试店');assert.equal(other.diningMode,'delivery');assert.equal(other.address,'');assert.equal(other.sourceUrl,'');
  });
  await test('unsafe source URLs cannot masquerade as a supported public shop URL', () => {
    for(const url of ['javascript:alert(1)','http://127.0.0.1/','https://m.dianping.com.evil.test/shopinfo/a','https://m.dianping.com@evil.test/shopinfo/a','https://m.dianping.com/order/secret','https://dpurl.cn/a/../b']) assert.equal(shareImport.sourceUrl(url),'');
  });
  await test('candidate projection preserves personal inputs, clears stale geography/date, and keeps platform references separate from personal scores', () => {
    const before={...draft(),notes:'Keep me',rating:2,perCapita:'80',photos:['/images/le-comptoir.jpg'],city:'Old city'};
    const next=shareImport.applyCandidate(before,shareImport.parse(shareSamples[0].shareText,'dianping'));
    assert.equal(next.rating,2);assert.equal(next.perCapita,'80');assert.equal(next.notes,'Keep me');assert.deepEqual(next.photos,before.photos);
    assert.equal(next.location,null);assert.equal(next.city,'');assert.equal(next.date,'');assert.equal(next.platformRating,shareImport.parse(shareSamples[0].shareText,'dianping').platformRating);
    assert.equal(before.city,'Old city');assert.equal(next.sourcePlatform,'dianping');
    for(const key of ['editingId','editOperationId','cloudAttempt']) assert.throws(()=>shareImport.applyCandidate({...before,[key]:'pending'},{}),e=>e.code==='DRAFT_LOCKED');
  });
  await test('Add candidate confirmation, cancellation and stale-modal guards do not create cloud records', () => {
    const modal=wx.showModal;let pending;const calls=addCalls;
    wx.showModal=o=>{pending=o;};
    try {
      const p=page('add');p.data.draft=store.freshDraft();p.data.importText=shareSamples[0].shareText;p.onImportParse();
      p.onImportApply();pending.success({confirm:false});assert.equal(p.data.draft.restaurant,'');
      p.onImportApply();p.changeDraft('notes','Changed meanwhile');pending.success({confirm:true});assert.equal(p.data.draft.restaurant,'');
      p.onImportApply();pending.success({confirm:true});assert.equal(p.data.draft.restaurant,shareSamples[0].candidateFromUserText.name);
      assert.equal(store.loadDraft().date,'');assert.equal(store.loadDraft().sourcePlatform,'dianping');assert.equal(addCalls,calls);
      p.onImportCancel();assert.equal(p.data.importCandidate,null);assert.equal(p.data.draft.notes,'Changed meanwhile');
    } finally {wx.showModal=modal;store.clearDraft();}
  });
  await test('Add import fails closed on storage failure; save-in-flight blocks import', () => {
    const modal=wx.showModal,set=wx.setStorageSync;wx.showModal=o=>o.success({confirm:true});
    try {
      const p=page('add');p.data.draft=store.freshDraft();p.data.importText=shareSamples[3].shareText;p.data.importSourceIndex=1;p.onImportParse();
      wx.setStorageSync=()=>{throw new Error('storage full');};p.onImportApply();assert.equal(p.data.draft.restaurant,'');assert(p.data.error);
      p.saveLock=true;p.onUniversalImport();assert.equal(p.data.importOpen,false);
    } finally {wx.showModal=modal;wx.setStorageSync=set;store.clearDraft();}
  });
  await test('import provenance survives owner-scoped cloud add/update and edit roundtrip; unknown metadata is stripped', async () => {
    const m={...sample(),diningMode:'delivery',sourcePlatform:'meituan',sourceUrl:'https://dpurl.cn/g0eelkTz'};
    const saved=await service.addRecord({actorUserId:'u_'+'a'.repeat(48),id:data.createId(),memory:m,uploads:{}},()=>{});
    assert.equal(saved.diningMode,'delivery');assert.equal(saved.sourcePlatform,'meituan');assert.equal(saved.sourceUrl,m.sourceUrl);
    const edited=await service.mutate({actorUserId:'u_'+'a'.repeat(48),kind:'update',recordId:saved.id,revision:saved.revision,id:data.createId(),uploads:{},memory:{...saved,notes:'Still delivery'}},()=>{});
    assert.equal(edited.sourceUrl,m.sourceUrl);
    const d=store.beginEdit(edited);assert.equal(d.diningMode,'delivery');assert.equal(d.sourcePlatform,'meituan');store.clearDraft();
    const schema=require(path.join(root,'cloudfunctions/mealRecords/schema'));
    const clean=schema.normalizeRecord({...service.memoryToCloudRecord(m),sourcePlatform:'forged',sourceUrl:'javascript:alert(1)',webVerified:true,platformRating:4.7},'owner-A');
    assert.equal(clean.sourcePlatform,'');assert.equal(clean.sourceUrl,'');assert.equal(clean.webVerified,undefined);assert.equal(clean.platformRating,null);
  });
  await test('missing edit queue entry is not treated as acknowledged; absent receipt retains draft', async () => {
    const created=await store.createCloudMemory(sample(),draft());
    const editing=store.beginEdit(created);editing.editOperationId='never-applied-edit';store.saveDraft(editing);
    await assert.rejects(store.createCloudMemory(created,editing),/receipt|回执/);
    assert.equal(store.loadDraft().editOperationId,'never-applied-edit');assert.throws(()=>store.beginEdit(sample()));
    const p=page('add');p.data.draft=editing;p.changeDraft('notes','Must not replace');assert.notEqual(p.data.draft.notes,'Must not replace');store.clearDraft();
  });
  await test('missing edit queue entry completes only with an owner-scoped remote receipt', async () => {
    const created=await store.createCloudMemory(sample(),draft());
    const editing=store.beginEdit(created);editing.editOperationId='applied-edit-proof';store.saveDraft(editing);
    await service.mutate({actorUserId:'u_'+'a'.repeat(48),kind:'update',recordId:created.id,id:editing.editOperationId,revision:created.revision,uploads:{},memory:{...created,notes:'Acknowledged'}},()=>{});
    await store.createCloudMemory(created,editing);assert.equal(store.loadDraft().editOperationId,undefined);
    owner='owner-B';try {await assert.rejects(service.confirmOperation(created.id,editing.editOperationId),e=>e.code==='NOT_FOUND');}finally{owner='owner-A';store.clearDraft();}
  });
  await test('receipt read failure retains draft, and receipt identity mismatch fails closed', async () => {
    const created=await store.createCloudMemory(sample(),draft());const editing=store.beginEdit(created);editing.editOperationId='unknown-receipt-op';store.saveDraft(editing);
    functionDown=true;try{await assert.rejects(store.createCloudMemory(created,editing));assert.equal(store.loadDraft().editOperationId,editing.editOperationId);}finally{functionDown=false;store.clearDraft();}
    const call=wx.cloud.callFunction;wx.cloud.callFunction=async()=>({result:{success:true,record:{_id:'wrong-record',revision:2,operationReceipts:[{id:editing.editOperationId,revision:2}]}}});
    try{await assert.rejects(service.confirmOperation(created.id,editing.editOperationId),e=>e.code==='INVALID_RESPONSE');}finally{wx.cloud.callFunction=call;}
  });
  await test('map marker focus centers the selected restaurant and never fits all points', () => {
    const p=page('map');const moves=[],fits=[];
    p.mapCtx={moveToLocation:o=>moves.push(o),includePoints:o=>fits.push(o)};
    p.allMemories=[{...sample(),id:'map-a',coordinates:[31.4,121.1]},{...sample(),id:'map-b',coordinates:[31.5,121.2]}];
    p.applyFilters('','all','map-a');moves.length=0;
    p.onMarkerTap({detail:{markerId:1}});
    assert.equal(p.data.selected.id,'map-b');assert.equal(p.data.selectedId,'map-b');assert.deepEqual(moves.map(({latitude,longitude})=>({latitude,longitude})),[{latitude:31.5,longitude:121.2}]);assert.equal(typeof moves[0].fail,'function');assert.equal(fits.length,0);
    p.onMarkerTap({detail:{markerId:1}});assert.equal(moves.length,2);
  });
  await test('map passive updates preserve pan; explicit overview alone fits all points', () => {
    const p=page('map');let moves=0;const fits=[];p.mapCtx={moveToLocation:()=>moves++,includePoints:o=>fits.push(o)};
    p.allMemories=[{...sample(),id:'map-real',coordinates:[31.4,121.1]}];
    p.applyFilters('','all','map-real');assert.equal(moves,1);
    p.applyFilters('','all','map-real','preserve');assert.equal(moves,1);assert.equal(fits.length,0);
    p.recenter();assert.equal(fits.length,1);assert.equal(moves,1);assert.equal(p.data.selectedId,'map-real');
    p.applyFilters('not-found','all','map-real');assert.equal(p.data.selected,null);assert.equal(moves,1);
  });
  const markerArt=require(path.join(mp,'utils/mapMarkers'));
  function fakeMarkerCanvas(failImage) {
    const draws=[];const ctx=new Proxy({drawImage(img){draws.push(img.src);}}, {get:(o,k)=>o[k]||(()=>{})});
    return {draws,getContext:()=>ctx,createImage(){const img={width:400,height:300};Object.defineProperty(img,'src',{get(){return this._src;},set(v){this._src=v;setImmediate(()=>{if(failImage&&v.includes(failImage))this.onerror();else this.onload();});}});return img;}};
  }
  await test('landmark selected and normal assets use correct anchor, layer and distinct checked state', () => {
    const a=markerArt.style(true),b=markerArt.style(false);assert.equal(a.width,80);assert.equal(b.width,48);assert(a.zIndex>b.zIndex);
    assert.deepEqual(a.anchor,{x:.5,y:276/286});assert.deepEqual(a.anchor,b.anchor);
    assert.notEqual(a.iconPath,b.iconPath);
    for(const state of ['selected','normal']) for(const kind of ['frame','fallback']) {
      const file=path.join(mp,'images/markers/landmark-'+state+'-'+kind+'.png');const bytes=fs.readFileSync(file);
      assert.equal(bytes.toString('hex',0,8),'89504e470d0a1a0a');assert.equal(bytes.readUInt32BE(16),768);assert.equal(bytes.readUInt32BE(20),858);
    }
  });
  await test('no-photo records use a real placeholder, never the sample meal; placePhoto remains eligible', async () => {
    assert.equal(markerArt.photoFor({...sample(),noPhoto:true,placePhoto:undefined}),'');
    assert.equal(markerArt.photoFor({...sample(),noPhoto:true,placePhoto:'/images/cafe.jpg'}),'/images/cafe.jpg');
    const c=fakeMarkerCanvas();const renderer=markerArt.createRenderer(c);
    assert.equal(await renderer.render({...sample(),noPhoto:true,placePhoto:undefined},true),markerArt.fallback(true));assert.equal(c.draws.length,0);renderer.dispose();
  });
  await test('photo marker composites the actual source, caches by source/state, and only deletes derived exports', async () => {
    const exportOld=wx.canvasToTempFilePath,fsOld=wx.getFileSystemManager;const deleted=[];let exports=0;
    wx.canvasToTempFilePath=o=>o.success({tempFilePath:'/user/derived-'+(++exports)+'.png'});wx.getFileSystemManager=()=>({unlinkSync:p=>deleted.push(p)});
    try {
      const c=fakeMarkerCanvas(),r=markerArt.createRenderer(c),m={...sample(),noPhoto:false,placePhoto:undefined,photo:'/images/cafe.jpg'};
      const first=r.render(m,true);assert.equal(r.render(m,true),first);assert.equal(await first,'/user/derived-1.png');
      await r.render(m,false);await r.render({...m,photo:'/images/japanese.jpg'},true);
      assert.equal(exports,3);assert(c.draws.includes('/images/cafe.jpg'));assert(c.draws.includes('/images/markers/landmark-selected-frame.png'));assert(c.draws.includes('/images/markers/landmark-normal-frame.png'));
      r.dispose();assert.equal(deleted.length,3);assert(deleted.every(p=>p.startsWith('/user/derived-')));
    } finally {wx.canvasToTempFilePath=exportOld;wx.getFileSystemManager=fsOld;}
  });
  await test('failed photo or PNG export falls back without blocking marker taps or throwing', async () => {
    const original=wx.canvasToTempFilePath;wx.canvasToTempFilePath=o=>o.fail({});
    try {
      const c=fakeMarkerCanvas('bad.jpg'),r=markerArt.createRenderer(c);
      assert.equal(await r.render({...sample(),noPhoto:false,photo:'/images/bad.jpg',placePhoto:undefined},true),markerArt.fallback(true));
      assert.equal(await r.render({...sample(),noPhoto:false,photo:'/images/cafe.jpg',placePhoto:undefined},false),markerArt.fallback(false));r.dispose();
    } finally {wx.canvasToTempFilePath=original;}
  });
  await test('private marker photo download stays at the cloud boundary and temporary copy is cleaned', async () => {
    const dl=wx.cloud.downloadFile,exp=wx.canvasToTempFilePath,fso=wx.getFileSystemManager;const deleted=[];let count=0;
    wx.cloud.downloadFile=o=>{count++;o.success({tempFilePath:'/user/private-copy.jpg'});};wx.canvasToTempFilePath=o=>o.success({tempFilePath:'/user/composed.png'});wx.getFileSystemManager=()=>({unlinkSync:p=>deleted.push(p)});
    try {
      await assert.rejects(service.downloadMapPhoto('https://example.test/a.jpg'),e=>e.code==='INVALID_PHOTO');assert.equal(count,0);
      const r=markerArt.createRenderer(fakeMarkerCanvas());await r.render({...sample(),noPhoto:false,placePhoto:undefined,photo:'cloud://env.bucket/dining/meal.jpg'},true);
      assert.equal(count,1);assert(deleted.includes('/user/private-copy.jpg'));r.dispose();assert(deleted.includes('/user/composed.png'));
    } finally {wx.cloud.downloadFile=dl;wx.canvasToTempFilePath=exp;wx.getFileSystemManager=fso;}
  });
  await test('late marker photo cannot overwrite a newly selected marker or update an unloaded map', async () => {
    const p=page('map');p.active=true;const pending=[];let disposed=false;
    p.pinRenderer={render:()=>new Promise(resolve=>pending.push(resolve)),dispose:()=>{disposed=true;}};
    p.allMemories=[{...sample(),id:'stamp-a',coordinates:[31,120]},{...sample(),id:'stamp-b',coordinates:[32,121]}];
    p.applyFilters('','all','stamp-a');p.applyFilters('','all','stamp-b');
    pending[0]('/user/stale.png');await new Promise(setImmediate);assert(!['/user/stale.png','/user/hidden.png','/user/old.png'].includes(p.data.markers[0].iconPath));
    pending[2]('/user/current.png');await new Promise(setImmediate);assert.equal(p.data.markers[1].iconPath,'/user/current.png');
    p.onHide();assert(disposed);pending[3]('/user/hidden.png');pending[1]('/user/old.png');await new Promise(setImmediate);assert(!['/user/stale.png','/user/hidden.png','/user/old.png'].includes(p.data.markers[0].iconPath));
  });
  await test('map photo work prioritizes selection and is bounded to 48 records per refresh', () => {
    const p=page('map');p.active=true;const seen=[];p.pinRenderer={render:(m,selected)=>{seen.push([m.id,selected]);return Promise.resolve(markerArt.fallback(selected));}};
    p.allMemories=Array.from({length:80},(_,i)=>({...sample(),id:'bounded-'+i,coordinates:[0,i*2]}));p.applyFilters('','all','bounded-79');
    assert.equal(seen.length,48);assert.deepEqual(seen[0],['bounded-79',true]);assert.equal(p.data.markers.length,80);p.active=false;
  });
  await test('late canvas export after leaving map is deleted and never reused', async () => {
    const old=wx.canvasToTempFilePath,fso=wx.getFileSystemManager;let release,started;const ready=new Promise(r=>{started=r;}),removed=[];
    wx.canvasToTempFilePath=o=>{release=o;started();};wx.getFileSystemManager=()=>({unlinkSync:p=>removed.push(p)});
    try {
      const r=markerArt.createRenderer(fakeMarkerCanvas());const job=r.render({...sample(),noPhoto:false,placePhoto:undefined,photo:'/images/cafe.jpg'},true);
      await ready;r.dispose();release.success({tempFilePath:'/user/late-export.png'});assert.equal(await job,markerArt.fallback(true));assert(removed.includes('/user/late-export.png'));
    } finally {wx.canvasToTempFilePath=old;wx.getFileSystemManager=fso;}
  });
  await test('marker cache bounds queued compositions and restaurant callouts remain tappable', async () => {
    const r=markerArt.createRenderer(fakeMarkerCanvas());const jobs=[];
    for(let i=0;i<96;i++)jobs.push(r.render({...sample(),noPhoto:false,placePhoto:undefined,photo:'/images/item-'+i+'.jpg'},false));
    assert.equal(await r.render({...sample(),noPhoto:false,placePhoto:undefined,photo:'/images/overflow.jpg'},true),markerArt.fallback(true));
    r.dispose();await Promise.all(jobs);
    const markup=fs.readFileSync(path.join(mp,'pages/map/index.wxml'),'utf8');assert(markup.includes('class="map-stack-overlay"'));assert(markup.includes('slot="callout"'));assert(markup.includes('catchtap="onDrawerToggle"'));assert(markup.includes('catchtap="onClusterPick"'));
  });
  const mapLayout=require(path.join(mp,'utils/mapLayout'));
  await test('overlapping photo pins group at screen scale, split when zoomed, and never move real coordinates', () => {
    const meals=[{...sample(),id:'near-a',coordinates:[31,121]},{...sample(),id:'near-b',coordinates:[31.001,121.001]}];const before=JSON.stringify(meals);
    const groups=mapLayout.group(meals,13,'near-b');assert.equal(groups.length,1);assert.equal(groups[0].memory.id,'near-b');assert.equal(groups[0].members.length,2);
    assert.equal(mapLayout.group(meals,18,'near-b').length,2);assert.equal(JSON.stringify(meals),before);
    assert.equal(mapLayout.group([{...meals[0],coordinates:[0,179.999]},{...meals[1],coordinates:[0,-179.999]}],13,'near-a').length,1);
  });
  await test('same-coordinate records remain individually selectable, including more than six entries', () => {
    const p=page('map');p.allMemories=Array.from({length:9},(_,i)=>({...sample(),id:'same-'+i,restaurant:'Branch '+i,coordinates:[31,121]}));
    const moves=[];p.mapCtx={moveToLocation:o=>moves.push(o)};p.applyFilters('','all','same-0');
    assert.equal(p.data.markers.length,1);assert.equal(p.data.markers[0].groupCount,9);assert.equal(p.data.markers[0].label,undefined);assert.equal(p.data.mapDrawers[0].count,9);
    p.onMarkerTap({detail:{markerId:0}});assert(p.data.clusterOpen);assert.equal(p.data.clusterChoices.length,9);
    p.data.cardCollapsed=true;p.onClusterPick({currentTarget:{dataset:{id:'same-8'}}});
    assert.equal(p.data.selected.id,'same-8');assert.equal(p.data.cardCollapsed,false);assert.equal(p.data.clusterOpen,true);assert.equal(moves.length,2);
    assert.deepEqual({latitude:moves[1].latitude,longitude:moves[1].longitude},{latitude:31,longitude:121});assert.equal(p.data.markers[0].memoryId,'same-0');
  });
  await test('zoom changes regroup without recentering; stale native scale replies are ignored', () => {
    const p=page('map');p.active=true;p.data.quiet=true;let moves=0;const replies=[];
    p.mapCtx={moveToLocation:()=>moves++,getScale:o=>replies.push(o.success)};
    p.allMemories=[{...sample(),id:'z-a',coordinates:[31,121]},{...sample(),id:'z-b',coordinates:[31.001,121.001]}];p.applyFilters('','all','z-a');assert.equal(moves,1);
    p.readMapScale();p.readMapScale();replies[1]({scale:18});replies[0]({scale:10});
    assert.equal(p.data.mapScale,18);assert.equal(p.data.markers.length,2);assert.equal(moves,1);p.onHide();
  });
  await test('collapse and expand keep the selection, bookmark and map camera unchanged', () => {
    const p=page('map');p.allMemories=[{...sample(),id:'card-one'}];let moves=0;p.mapCtx={moveToLocation:()=>moves++};p.applyFilters('','all','card-one');
    const selected=p.data.selected,saved=p.data.selectedSaved;p.onTogglePlaceCard();assert(p.data.cardCollapsed);p.onTogglePlaceCard();assert.equal(p.data.cardCollapsed,false);
    assert.equal(p.data.selected,selected);assert.equal(p.data.selectedSaved,saved);assert.equal(moves,1);
    const css=fs.readFileSync(path.join(mp,'pages/map/index.wxss'),'utf8');assert.match(css,/\.place-photo\s*\{[^}]*top:30rpx/);assert.match(css,/\.place-photo\s*\{[^}]*bottom:30rpx/);assert(css.includes('.place-expand'));
  });
  await test('marker size easing is bounded and reduced-motion skips animation', () => {
    assert.equal(mapLayout.easedSize(48,80,0),48);assert.equal(mapLayout.easedSize(48,80,1),80);
    assert(mapLayout.easedSize(48,80,.5)>48);assert(mapLayout.easedSize(80,48,.5)<80);assert.equal(mapLayout.easedSize(80,48,2),48);
    const p=page('map');p.active=true;p.data.quiet=true;p.allMemories=[{...sample(),id:'quiet-pin'}];p.applyFilters('','all','quiet-pin');assert.equal(p.data.markers[0].width,80);assert(!p.markerAnimation);p.onHide();
  });
  await test('selected pin grows and previous pin shrinks over 200ms; hiding cancels future frames', async () => {
    const p=page('map');p.active=true;p.data.quiet=false;p.allMemories=[{...sample(),id:'anim-a',coordinates:[31,120]},{...sample(),id:'anim-b',coordinates:[32,121]}];
    p.setData=function(patch,callback){for(const [key,value] of Object.entries(patch)){const m=key.match(/^markers\[(\d+)\]\.(width|height|iconPath)$/);if(m)this.data.markers[Number(m[1])][m[2]]=value;else this.data[key]=value;}if(callback)callback();};
    p.applyFilters('','all','anim-a');assert.equal(p.data.markers[0].width,48);await new Promise(r=>setTimeout(r,245));assert.equal(p.data.markers[0].width,80);
    p.onMarkerTap({detail:{markerId:1}});await new Promise(r=>setTimeout(r,75));assert(p.data.markers[0].width<80&&p.data.markers[0].width>48);assert(p.data.markers[1].width>48&&p.data.markers[1].width<80);
    await new Promise(r=>setTimeout(r,180));assert.equal(p.data.markers[0].width,48);assert.equal(p.data.markers[1].width,80);
    p.onMarkerTap({detail:{markerId:0}});p.onHide();const width=p.data.markers[0].width;await new Promise(r=>setTimeout(r,55));assert.equal(p.data.markers[0].width,width);assert.equal(p.markerAnimation,null);
  });
  await test('D removes standalone shop names from selected and normal map pins in both themes', () => {
    const p=page('map');p.allMemories=[{...sample(),id:'no-label',restaurant:'巴奴',coordinates:[31,120]},{...sample(),id:'other-no-label',restaurant:'另一家',coordinates:[32,121]}];
    for(const dusk of [false,true]) {
      p.data.dusk=dusk;p.applyFilters('','all','no-label');
      for(const marker of p.data.markers) {assert.equal(marker.label,undefined);assert.equal(marker.callout,undefined);assert.equal(marker.title,undefined);}
      assert.equal(p.data.selected.restaurant,'巴奴');
    }
  });
  await test('D preserves original names in detail and collapsed strip, and group badges are numbers only', () => {
    const p=page('map'),name='这是一家名称很长的餐厅上海万象城旗舰分店';
    p.allMemories=[{...sample(),id:'named-a',restaurant:name},{...sample(),id:'named-b',restaurant:'第二家'}];p.applyFilters('','all','named-a');
    assert.equal(p.data.markers[0].label,undefined);assert.equal(p.data.mapDrawers[0].count,2);assert.equal(p.data.selected.restaurant,name);
    p.onTogglePlaceCard();assert(p.data.cardCollapsed);assert.equal(p.data.selected.restaurant,name);
    p.onMarkerTap({detail:{markerId:0}});assert.equal(p.data.clusterChoices[0].restaurant,name);
    const wxml=fs.readFileSync(path.join(mp,'pages/map/index.wxml'),'utf8');assert(wxml.includes('class="place-expand-name">{{selected.restaurant}}'));
  });
  await test('D releases old name-plate collision space without changing point coordinates', () => {
    const meals=[{...sample(),id:'free-a',coordinates:[31,121]},{...sample(),id:'free-b',coordinates:[31,121.0155]}];
    const before=JSON.stringify(meals);assert.equal(mapLayout.group(meals,13,'free-a').length,2);assert.equal(JSON.stringify(meals),before);
  });
  await test('map card uses one fixed toggle beside both expanded actions and collapsed name', () => {
    const css=fs.readFileSync(path.join(mp,'pages/map/index.wxss'),'utf8');
    const wxml=fs.readFileSync(path.join(mp,'pages/map/index.wxml'),'utf8');
    assert.match(css,/\.place-photo\s*\{[^}]*width: 280rpx;[^}]*height: 280rpx/);
    assert.equal((wxml.match(/class="place-collapse /g)||[]).length,1);
    assert(wxml.indexOf('class="place-collapse ')<wxml.indexOf('class="place-expand-name"'));
    assert.match(css,/\.place-collapse\s*\{[^}]*left:36rpx; bottom:calc\(var\(--tab-clearance\) \+ 24rpx\)/);
    assert.match(css,/\.place-expand\s*\{[^}]*left:32rpx; bottom:calc\(var\(--tab-clearance\) \+ 20rpx\);[^}]*padding:0 28rpx 0 100rpx/);
    assert.match(css,/\.place-name\s*\{[^}]*font-size: 42rpx;[^}]*line-height: 54rpx/);
    assert.match(css,/\.place-date\s*\{[^}]*font-size:24rpx; line-height:34rpx/);
    assert.match(css,/\.place-location-actions\s*\{[^}]*padding:0 0 0 100rpx; width:calc\(100% - 310rpx\)/);
  });
  const cat=require(path.join(mp,'utils/restaurantCategory'));
  const lookup=require(path.join(root,'cloudfunctions/placeLookup/lookup'));
  const importPolicy=require(path.join(mp,'utils/importPolicy'));
  await test('free-first client default makes zero cloud calls and routes search to native selection', async()=>{
    assert.equal(importPolicy.cloudPlaceSearchEnabled,false);
    const original=wx.cloud.callFunction;let calls=0;
    wx.cloud.callFunction=async()=>{calls++;throw new Error('must not call');};
    try{await assert.rejects(service.searchPlaces('店','上海'),e=>e.code==='LOOKUP_DISABLED');assert.equal(calls,0);}finally{wx.cloud.callFunction=original;}
    const p=page('add');let picks=0;p.onImportNativePick=()=>{picks++;};await p.onImportSearch();assert.equal(picks,1);
  });
  await test('free-first backend with existing credentials rejects lookup before provider request', async()=>{
    let calls=0;const h=lookup.createHandler({getOpenid:()=> 'owner-A',env:{TENCENT_MAP_KEY:'test',PLACE_LOOKUP_ALLOWED_OPENIDS:'owner-A'},request:async()=>{calls++;}});
    assert.equal((await h({keyword:'店',city:'上海'})).code,'LOOKUP_DISABLED');assert.equal(calls,0);
  });
  // Exercise the retained optional path explicitly; shipped policy remains false.
  importPolicy.cloudPlaceSearchEnabled=true;
  const lookupEnv={PLACE_LOOKUP_ENABLED:'true',TENCENT_MAP_KEY:'unit-test-not-a-real-key',PLACE_LOOKUP_ALLOWED_OPENIDS:'owner-A'};
  const poi={id:'poi-test',title:'合成火锅（人民路店）',address:'江苏省苏州市人民路1号',category:'美食:中餐厅:火锅',type:0,location:{lat:31.3,lng:120.6},ad_info:{city:'苏州市'},photos:['must-not-import.jpg'],tel:'private'};
  await test('share categories distinguish cuisine from hotpot/buffet without guessing Chinese food', () => {
    const c=shareImport.parse(shareSamples[0].shareText,'dianping');assert.equal(c.cuisine,'');assert.deepEqual(c.diningTypes,['火锅','自助餐']);assert.equal(c.categorySource,'share-text');assert.equal(c.sourceCategory,'火锅自助');assert.equal(c.categorySuggestion.cuisine,'日料');
    assert.equal(shareImport.parse(shareSamples[1].shareText,'dianping').cuisine,'西餐');assert.equal(shareImport.parse(shareSamples[2].shareText,'dianping').cuisine,'韩餐');
  });
  await test('name-only guesses stay suggestions until explicit user adoption, preserving explicit dining types', () => {
    const c=shareImport.parse(shareSamples[4].shareText,'meituan');assert.equal(c.cuisine,'');assert.equal(c.categorySource,'');assert.equal(c.categorySuggestion.cuisine,'泰餐');
    assert.equal(shareImport.applyCandidate(store.freshDraft(),c).cuisine,'');
    const p=page('add');p.updateImportCandidate(shareImport.parse(shareSamples[0].shareText,'dianping'));p.onAcceptCategorySuggestion();
    assert.equal(p.data.importCandidate.cuisine,'日料');assert.deepEqual(p.data.importCandidate.diningTypes,['火锅','自助餐']);assert.equal(p.data.importCandidate.categorySource,'user-confirmed');
  });
  await test('branch comparison treats same brand different branch as review, never auto-confirmation', () => {
    assert.equal(cat.compareBranch('店（人民路店）','店(人民路店)'),'same-name');assert.equal(cat.compareBranch('店（人民路店）','店（万象城店）'),'review-name');
    const c=shareImport.parse(shareSamples[3].shareText,'meituan');assert.equal(c.confirmedLocation,undefined);
  });
  await test('lookup denies missing identity, configuration and non-allowlisted callers without network calls', async () => {
    let calls=0;const request=async()=>{calls++;return {status:0,data:[]};};
    for(const [openid,env,code] of [['',lookupEnv,'UNAUTHENTICATED'],['owner-A',{},'LOOKUP_NOT_CONFIGURED'],['owner-B',lookupEnv,'LOOKUP_NOT_AUTHORIZED']]) {
      const h=lookup.createHandler({getOpenid:()=>openid,env,request});assert.equal((await h({keyword:'店',city:'上海',openid:'owner-A'})).code,code);
    }assert.equal(calls,0);
  });
  await test('lookup uses only fixed Tencent endpoint and city-bound encoded query; it never exports provider images', async () => {
    let url;const h=lookup.createHandler({getOpenid:()=> 'owner-A',env:lookupEnv,request:async u=>{url=new URL(u);return {status:0,data:[poi,{...poi,id:'bad',location:{lat:999,lng:1}}, {...poi,id:'station',type:2}]};}});
    const result=await h({keyword:'店 & 分店',city:'苏州市',url:'http://127.0.0.1/secret',key:'forged'});
    assert(result.success);assert.equal(url.origin,'https://apis.map.qq.com');assert.equal(url.pathname,'/ws/place/v1/search');assert.equal(url.searchParams.get('boundary'),'region(苏州市,0)');assert.equal(url.searchParams.get('keyword'),'店 & 分店');assert.equal(url.searchParams.get('key'),lookupEnv.TENCENT_MAP_KEY);
    assert.equal(result.pois.length,1);assert.equal(result.pois[0].photos,undefined);assert.equal(result.pois[0].tel,undefined);assert(!JSON.stringify(result).includes(lookupEnv.TENCENT_MAP_KEY));
  });
  await test('lookup invalid queries, provider errors, result bounds and instance cooldown are explicit', async () => {
    const h=lookup.createHandler({getOpenid:()=> 'owner-A',env:lookupEnv,now:()=>10000,request:async()=>({status:0,data:Array(20).fill(poi)})});
    for(const city of ['全国','苏州,1)','http://localhost',''])assert.equal((await h({keyword:'店',city})).code,'INVALID_LOOKUP_QUERY');
    assert.equal((await h({keyword:'店',city:'苏州'})).pois.length,10);assert.equal((await h({keyword:'店',city:'苏州'})).code,'LOOKUP_RATE_LIMITED');
    const bad=lookup.createHandler({getOpenid:()=> 'owner-A',env:lookupEnv,request:async()=>({status:110,message:'never expose secret'})});assert.equal((await bad({keyword:'店',city:'苏州'})).providerStatus,110);
    const down=lookup.createHandler({getOpenid:()=> 'owner-A',env:lookupEnv,request:async()=>{throw new Error('request URL with secret');}});assert.equal((await down({keyword:'店',city:'苏州'})).code,'LOOKUP_UNAVAILABLE');
  });
  await test('client lookup uses the central cloud boundary and retains configuration error codes', async () => {
    const call=wx.cloud.callFunction;let sent;
    try {
      wx.cloud.callFunction=async o=>{sent=o;return {result:{success:true,provider:'tencent',pois:[lookup.normalizePoi(poi)]}};};
      const found=await service.searchPlaces('合成火锅','苏州');assert.equal(sent.name,'placeLookup');assert.deepEqual(sent.data,{keyword:'合成火锅',city:'苏州'});assert.equal(found[0].photos,undefined);
      wx.cloud.callFunction=async()=>({result:{success:false,code:'LOOKUP_NOT_CONFIGURED'}});await assert.rejects(service.searchPlaces('店','苏州'),e=>e.code==='LOOKUP_NOT_CONFIGURED'&&e.message.includes('LOOKUP_NOT_CONFIGURED'));
    } finally {wx.cloud.callFunction=call;}
  });
  await test('confirmed Tencent result goes to draft without creating a meal, and map category only fills missing source', () => {
    const pick=require(path.join(mp,'utils/locations')).fromSearchPoi(lookup.normalizePoi(poi));assert(pick);assert.equal(pick.locationSource,'tencent-search');
    const c=shareImport.parse(shareSamples[3].shareText,'meituan');const before=addCalls;
    const linked=shareImport.attachLocation(c,pick,poi.category);assert.equal(linked.cuisine,'中餐');assert.deepEqual(linked.diningTypes,['火锅']);assert.equal(linked.categorySource,'tencent-poi');
    const d=shareImport.applyCandidate(store.freshDraft(),linked);assert.equal(d.location.tencentPoiId,'poi-test');assert.equal(d.date,'');assert.equal(d.rating,0);assert.equal(addCalls,before);
    const explicit=shareImport.parse(shareSamples[2].shareText,'dianping');assert.equal(shareImport.attachLocation(explicit,pick,poi.category).cuisine,'韩餐');
  });
  await test('matching requires confirmation; cancel and stale confirmation do not attach a location', () => {
    const modal=wx.showModal;let pending;wx.showModal=o=>pending=o;
    try {
      const p=page('add');p.data.draft=store.freshDraft();p.updateImportCandidate(shareImport.parse(shareSamples[3].shareText,'meituan'));p.data.importMatches=[lookup.normalizePoi(poi)];
      p.onImportMatch({currentTarget:{dataset:{index:0}}});assert.equal(p.data.importCandidate.confirmedLocation,undefined);pending.success({confirm:false});assert.equal(p.data.importCandidate.confirmedLocation,undefined);
      p.onImportMatch({currentTarget:{dataset:{index:0}}});p.onImportName({detail:{value:'另一家'}});pending.success({confirm:true});assert.equal(p.data.importCandidate.confirmedLocation,null);
      p.data.importMatches=[lookup.normalizePoi(poi)];p.onImportMatch({currentTarget:{dataset:{index:0}}});pending.success({confirm:true});assert.equal(p.data.importCandidate.confirmedLocation.tencentPoiId,'poi-test');
    } finally {wx.showModal=modal;}
  });
  await test('late search results cannot attach to changed city/name or cancelled import', async () => {
    const original=service.searchPlaces;let release;service.searchPlaces=()=>new Promise(r=>{release=r;});
    try {
      const p=page('add');p.data.draft=store.freshDraft();p.updateImportCandidate(shareImport.parse(shareSamples[3].shareText,'meituan'));p.data.importCity='苏州';
      const request=p.onImportSearch();p.onImportCity({detail:{value:'上海'}});release([lookup.normalizePoi(poi)]);await request;assert.equal(p.data.importMatches.length,0);assert.equal(p.data.importSearching,false);
      const again=p.onImportSearch();p.onImportCancel();release([lookup.normalizePoi(poi)]);await again;assert.equal(p.data.importCandidate,null);assert.equal(p.data.importMatches.length,0);
    } finally {service.searchPlaces=original;}
  });
  await test('search failure keeps candidate; native map remains available without the lookup service', async () => {
    const original=service.searchPlaces,modal=wx.showModal;service.searchPlaces=async()=>{throw new Error('offline');};wx.showModal=o=>o.success({confirm:true});
    try {
      const p=page('add');p.onShow();p.data.draft=store.freshDraft();p.updateImportCandidate(shareImport.parse(shareSamples[3].shareText,'meituan'));
      const c=p.data.importCandidate;await p.onImportSearch();assert.equal(p.data.importCandidate,c);assert.equal(p.data.importSearching,false);assert(p.data.importLookupError);
      await p.onImportNativePick();assert.equal(p.data.importCandidate.confirmedLocation.locationSource,'tencent-picker');
    } finally {service.searchPlaces=original;wx.showModal=modal;}
  });
  await test('classification and Tencent POI identity survive cloud edit roundtrip and existing source stays compatible', async () => {
    const pick=require(path.join(mp,'utils/locations')).fromSearchPoi(lookup.normalizePoi(poi));
    const m={...sample(),...pick,cuisine:'中餐',diningTypes:['火锅','自助餐'],sourceCategory:poi.category,categorySource:'tencent-poi',noPhoto:true};
    const saved=await service.addRecord({actorUserId:'u_'+'a'.repeat(48),id:data.createId(),memory:m,uploads:{}},()=>{});assert.equal(saved.locationSource,'tencent-search');assert.equal(saved.tencentPoiId,'poi-test');assert.deepEqual(saved.diningTypes,['火锅','自助餐']);
    const editing=store.beginEdit(saved);assert.equal(editing.location.tencentPoiId,'poi-test');assert.deepEqual(editing.diningTypes,['火锅','自助餐']);store.clearDraft();
    const changed=await service.mutate({actorUserId:'u_'+'a'.repeat(48),kind:'update',id:data.createId(),recordId:saved.id,revision:saved.revision,memory:{...saved,diningTypes:['火锅'],categorySource:'user-confirmed'},uploads:{}},()=>{});assert.deepEqual(changed.diningTypes,['火锅']);assert.equal(changed.categorySource,'user-confirmed');
    const schema=require(path.join(root,'cloudfunctions/mealRecords/schema'));assert.throws(()=>schema.normalizeLocation({...pick,tencentPoiId:''}),/INVALID_LOCATION/);
    assert(!require(path.join(mp,'utils/locations')).confirmed({...pick,tencentPoiId:''}));
  });
  await test('map category line uses real classification, never arbitrary tags or a default bistro', () => {
    assert.equal(cat.summary({cuisine:'中餐',diningTypes:['火锅','自助餐']}),'中餐 · 火锅 · 自助餐');assert.equal(cat.summary({tags:['French','Dinner']}),'');
    const p=page('map');p.allMemories=[{...sample(),id:'classified',cuisine:'韩餐',diningTypes:['烧烤']}];p.applyFilters('','all','classified');assert.equal(p.data.selected.categoryLabel,'韩餐 · 烧烤');
  });
  await test('new classification fields are bounded and not authorization fields', () => {
    const schema=require(path.join(root,'cloudfunctions/mealRecords/schema'));
    const clean=schema.normalizeRecord({...service.memoryToCloudRecord(sample()),diningTypes:['火锅','火锅','evil'],sourceCategory:'x'.repeat(200),categorySource:'verified-owner',createdBy:'forged'},'owner-A');
    assert.deepEqual(clean.diningTypes,['火锅']);assert.equal(clean.sourceCategory.length,120);assert.equal(clean.categorySource,'');assert.equal(clean.createdBy,'owner-A');
  });
  await test('lookup transport rejects redirects and oversized responses without following external URLs', async () => {
    const {EventEmitter}=require('node:events');
    for(const mode of ['redirect','oversize']) {
      let calls=0,destroyed=false;const mod={exports:{}};
      const fakeHttps={get(url,cb){calls++;const req=new EventEmitter();req.destroy=()=>{destroyed=true;};setImmediate(()=>{const res=new EventEmitter();res.statusCode=mode==='redirect'?302:200;res.resume=()=>{};cb(res);if(mode==='oversize')res.emit('data',Buffer.alloc(512*1024+1));});return req;}};
      vm.runInNewContext(fs.readFileSync(path.join(root,'cloudfunctions/placeLookup/lookup.js'),'utf8'),{module:mod,exports:mod.exports,require:name=>{assert.equal(name,'https');return fakeHttps;},Buffer,URLSearchParams,setTimeout,clearTimeout,console});
      await assert.rejects(mod.exports.requestJson('https://apis.map.qq.com/ws/place/v1/search'),/UPSTREAM/);assert.equal(calls,1);if(mode==='oversize')assert(destroyed);
    }
  });
  await test('optional lookup deadline is 1800ms and destroys stalled transport', async()=>{
    const {EventEmitter}=require('node:events');let fire,delay,destroyed=false,cleared=false;const mod={exports:{}};
    const req=new EventEmitter();req.destroy=()=>{destroyed=true;};
    vm.runInNewContext(fs.readFileSync(path.join(root,'cloudfunctions/placeLookup/lookup.js'),'utf8'),{module:mod,exports:mod.exports,require:()=>({get:()=>req}),Buffer,URLSearchParams,setTimeout:(fn,ms)=>{fire=fn;delay=ms;return 1;},clearTimeout:()=>{cleared=true;}});
    const pending=mod.exports.requestJson('https://apis.map.qq.com/ws/place/v1/search');assert.equal(delay,1800);fire();await assert.rejects(pending,/UPSTREAM_TIMEOUT/);assert(destroyed);assert(cleared);
  });
  importPolicy.cloudPlaceSearchEnabled=false;
  await test('search preference requires consent, survives reload, and enabling never calls cloud',async()=>{
    const policy=require(path.join(mp,'utils/importPolicy')),oldModal=wx.showModal,oldCall=wx.cloud.callFunction;
    let modal,calls=0;wx.showModal=o=>{modal=o;};wx.cloud.callFunction=async()=>{calls++;};policy.setEnabled(false);
    try{const p=page('add');p.onCloudSearchToggle({detail:{value:true}});assert.equal(policy.enabled(),false);modal.success({confirm:false});assert.equal(policy.enabled(),false);
      p.onCloudSearchToggle({detail:{value:true}});modal.success({confirm:true});assert.equal(policy.enabled(),true);assert.equal(p.data.cloudPlaceSearchEnabled,true);assert.equal(calls,0);
      const file=path.join(mp,'utils/importPolicy');delete require.cache[require.resolve(file)];assert.equal(require(file).enabled(),true);
      const next=page('add');assert.equal(next.data.cloudPlaceSearchEnabled,true);next.onCloudSearchToggle({detail:{value:false}});assert.equal(policy.enabled(),false);assert.equal(calls,0);
    }finally{policy.setEnabled(false);wx.showModal=oldModal;wx.cloud.callFunction=oldCall;}
  });
  await test('search preference storage failure and stale consent fail closed',()=>{
    const policy=require(path.join(mp,'utils/importPolicy')),oldModal=wx.showModal,oldSet=wx.setStorageSync;let modal;policy.setEnabled(false);wx.showModal=o=>{modal=o;};
    try{const p=page('add');p.onCloudSearchToggle({detail:{value:true}});const stale=modal;p.onCloudSearchToggle({detail:{value:false}});stale.success({confirm:true});assert.equal(policy.enabled(),false);
      p.onCloudSearchToggle({detail:{value:true}});wx.setStorageSync=()=>{throw new Error('full');};modal.success({confirm:true});assert.equal(policy.enabled(),false);assert.equal(p.data.cloudPlaceSearchEnabled,false);assert(p.data.error);
    }finally{wx.setStorageSync=oldSet;policy.setEnabled(false);wx.showModal=oldModal;}
  });
  await test('turning search off invalidates inflight candidates and branch confirmation',async()=>{
    const policy=require(path.join(mp,'utils/importPolicy')),oldSearch=service.searchPlaces,oldModal=wx.showModal;policy.setEnabled(true);let done,modal;
    service.searchPlaces=()=>new Promise(r=>{done=r;});wx.showModal=o=>{modal=o;};
    try{const p=page('add');p.data.importCandidate=shareImport.parse(shareSamples[0].shareText,'dianping');p.data.importCity='上海';const pending=p.onImportSearch();
      p.onCloudSearchToggle({detail:{value:false}});done([{id:'late',name:'late'}]);await pending;assert.deepEqual(p.data.importMatches,[]);assert.equal(p.data.importSearching,false);
      p.confirmImportLocation(pickedLocation,'');p.onCloudSearchToggle({detail:{value:false}});modal.success({confirm:true});assert.equal(p.data.importCandidate.confirmedLocation,undefined);
    }finally{policy.setEnabled(false);service.searchPlaces=oldSearch;wx.showModal=oldModal;}
  });
  // Synthetic multiline share template using the restaurant and figures shown in the user's screenshot.
  const completeCandidate=shareImport.parse('【1886德国汽车餐厅(海运堤罗腾堡店)】\n★★★★★ 4.8\n¥172/人\n海运堤 西餐\n海运堤路88号海运堤罗腾堡风情街3期2栋1楼101-102室\nhttps://m.dianping.com/shopinfo/G9NDIUW4xuvleiQC?tracking=removed','dianping');
  await test('full candidate survives draft confirmation and local reload without inventing personal fields',()=>{
    const oldModal=wx.showModal;wx.showModal=o=>o.success({confirm:true});
    try{const p=page('add');p.data.draft={...store.freshDraft(),notes:'my note',rating:2,perCapita:'80',photos:['/images/le-comptoir.jpg']};
      p.data.importCandidate=shareImport.attachLocation(completeCandidate,pickedLocation,'');p.onImportApply();const d=store.loadDraft();
      assert.equal(d.restaurant,completeCandidate.name);assert.equal(d.cuisine,'西餐');assert.equal(d.platformRating,4.8);assert.equal(d.platformAveragePriceCny,172);assert.equal(d.importAreaText,'海运堤');assert.equal(d.importAddressHint,completeCandidate.address);assert.equal(d.sourceCategory,'西餐');assert.equal(d.categorySource,'share-text');assert.equal(d.sourceUrl,completeCandidate.sourceUrl);
      assert.deepEqual(d.location,pickedLocation);assert.equal(d.rating,2);assert.equal(d.perCapita,'80');assert.equal(d.date,'');assert.equal(d.notes,'my note');assert.deepEqual(d.photos,['/images/le-comptoir.jpg']);assert.equal(p.data.importOpen,false);assert.equal(p.data.importCandidate,null);
    }finally{wx.showModal=oldModal;store.clearDraft();}
  });
  await test('reference metadata survives cloud add, update and beginEdit without becoming personal rating',async()=>{
    const d=shareImport.applyCandidate(store.freshDraft(),completeCandidate);
    const m={...sample(),restaurant:d.restaurant,cuisine:d.cuisine,sourcePlatform:d.sourcePlatform,sourceUrl:d.sourceUrl,sourceCategory:d.sourceCategory,categorySource:d.categorySource,importAddressHint:d.importAddressHint,importAreaText:d.importAreaText,platformRating:d.platformRating,platformAveragePriceCny:d.platformAveragePriceCny,rating:3,ratingSource:'single',perCapita:80};
    const saved=await service.addRecord({actorUserId:'u_'+'a'.repeat(48),id:data.createId(),memory:m,uploads:{}},()=>{});
    const edited=await service.mutate({actorUserId:'u_'+'a'.repeat(48),kind:'update',recordId:saved.id,revision:saved.revision,id:data.createId(),uploads:{},memory:{...saved,notes:'edit reference roundtrip'}},()=>{});
    for(const item of [saved,edited,store.beginEdit(edited)]){assert.equal(item.platformRating,4.8);assert.equal(item.platformAveragePriceCny,172);assert.equal(item.importAddressHint,d.importAddressHint);assert.equal(item.importAreaText,'海运堤');assert.equal(item.rating,3);assert.equal(Number(item.perCapita),80);}
    store.clearDraft();
  });
  await test('Add save forwards reference fields alongside independent actual meal fields',async()=>{
    const original=store.createCloudMemory;let sent;store.createCloudMemory=async memory=>{sent=memory;};
    try{const p=page('add');p.data.draft=shareImport.applyCandidate(store.freshDraft(),shareImport.attachLocation(completeCandidate,pickedLocation,''));p.data.draft.date='2026-09-11';p.data.draft.rating=2;p.data.draft.perCapita='90';
      await p.onSave();assert(sent);assert.equal(sent.platformRating,4.8);assert.equal(sent.platformAveragePriceCny,172);assert.equal(sent.importAddressHint,completeCandidate.address);assert.equal(sent.importAreaText,'海运堤');assert.equal(sent.rating,2);assert.equal(sent.perCapita,90);assert.deepEqual(sent.coordinates,pickedLocation.coordinates);
    }finally{store.createCloudMemory=original;}
  });
  await test('same-name input preserves candidate; changing restaurant clears stale references; server bounds references',()=>{
    const p=page('add');p.data.importCandidate=completeCandidate;p.onImportName({detail:{value:completeCandidate.name}});assert.equal(p.data.importCandidate,completeCandidate);
    p.onImportName({detail:{value:'different shop'}});assert.equal(p.data.importCandidate.platformRating,null);assert.equal(p.data.importCandidate.sourceUrl,'');
    p.data.draft=shareImport.applyCandidate(store.freshDraft(),completeCandidate);p.changeDraft('restaurant','new shop');assert.equal(p.data.draft.platformRating,undefined);assert.equal(p.data.draft.importAreaText,undefined);store.clearDraft();
    const schema=require(path.join(root,'cloudfunctions/mealRecords/schema'));const clean=schema.normalizeRecord({...service.memoryToCloudRecord(sample()),sourcePlatform:'dianping',platformRating:99,platformAveragePriceCny:-1,importAddressHint:'x'.repeat(200),importAreaText:'y'.repeat(200)},'owner-A');assert.equal(clean.platformRating,null);assert.equal(clean.platformAveragePriceCny,null);assert.equal(clean.importAddressHint.length,150);assert.equal(clean.importAreaText.length,80);
  });
  await test('old ambiguous merchant-search consent does not enable the relabeled Tencent preference',()=>{
    const policy=require(path.join(mp,'utils/importPolicy'));const old=storage['savor-cloud-place-search-v1'],current=storage['savor-tencent-location-search-v1'];
    try{storage['savor-cloud-place-search-v1']=true;delete storage['savor-tencent-location-search-v1'];assert.equal(policy.enabled(),false);policy.setEnabled(true);assert.equal(policy.enabled(),true);assert.equal(storage['savor-cloud-place-search-v1'],true);}finally{if(old===undefined)delete storage['savor-cloud-place-search-v1'];else storage['savor-cloud-place-search-v1']=old;storage['savor-tencent-location-search-v1']=current;}
  });
  await test('invalid Tencent queries are rejected locally before any cloud invocation',async()=>{
    const policy=require(path.join(mp,'utils/importPolicy')),old=wx.cloud.callFunction;let calls=0;policy.setEnabled(true);wx.cloud.callFunction=async()=>{calls++;};
    try{for(const city of ['', '全国','上海,1)'])await assert.rejects(service.searchPlaces('餐厅',city),e=>e.code==='INVALID_LOOKUP_QUERY');await assert.rejects(service.searchPlaces('','上海市'),e=>e.code==='INVALID_LOOKUP_QUERY');assert.equal(calls,0);}finally{policy.setEnabled(false);wx.cloud.callFunction=old;}
  });
  await test('merchant page status is noninteractive and separate from optional Tencent location errors',()=>{
    const w=fs.readFileSync(path.join(mp,'pages/add/index.wxml'),'utf8');const status=w.split('<view class="merchant-page-status">')[1].split('</view>')[0];assert(!/bindtap|switch|button/.test(status));assert(w.indexOf('merchant-page-status')<w.indexOf('location-search-section'));assert(w.indexOf('{{importLookupError}}')>w.indexOf('location-search-section'));assert(!w.includes('copy.sd6d6617fee'));
    const report=JSON.parse(fs.readFileSync(path.join(root,'tools/fixtures/regression/merchant-page-public-recheck.json'),'utf8'));assert.equal(report.results.length,5);assert(report.results.every(x=>x.merchantFieldsRetrieved.length===0));
  });
  await test('DevTools camera skips unsupported moveToLocation and falls back to one real point',()=>{
    const original=wx.getDeviceInfo;wx.getDeviceInfo=()=>({platform:'devtools'});
    try{const p=page('map');let moves=0;const fits=[];p.mapCtx={moveToLocation:()=>{moves++;throw new Error('unsupported');},includePoints:o=>fits.push(o)};p.allMemories=[{...sample(),id:'camera-safe',coordinates:[31,121]}];p.applyFilters('','all','camera-safe');assert.equal(moves,0);assert.equal(fits.length,1);assert.deepEqual(fits[0].points,[{latitude:31,longitude:121}]);assert.equal(p.data.latitude,31);assert.equal(p.data.longitude,121);p.onMarkerTap({detail:{markerId:0}});assert.equal(moves,0);assert.equal(fits.length,2);}finally{wx.getDeviceInfo=original;}
  });
  await test('native camera handles callback and thrown failures without moving to stale selections',()=>{
    const original=wx.getDeviceInfo;wx.getDeviceInfo=()=>({platform:'ios'});
    try{
      for(const throws of [false,true]){const p=page('map');let fits=0,moves=0;p.markerGeneration=1;p.mapCtx={moveToLocation:o=>{moves++;if(throws)throw new Error('unsupported');o.fail();},includePoints:()=>fits++};assert.doesNotThrow(()=>p.focusMapCamera([31,121]));assert.equal(fits,1);p.focusMapCamera([32,122]);assert.equal(moves,1);assert.equal(fits,2);}
      const p=page('map');let reply;const fits=[];p.markerGeneration=1;p.mapCtx={moveToLocation:o=>{reply=o.fail;},includePoints:o=>fits.push(o)};p.focusMapCamera([31,121]);p.markerGeneration=2;p.setData({latitude:32,longitude:122});reply();assert.equal(fits.length,0);assert.equal(p.data.latitude,32);
    }finally{wx.getDeviceInfo=original;}
  });
  await test('upward drawer keeps first real pin anchored, pages every member, and writes no meal data',()=>{
    const p=page('map');p.allMemories=Array.from({length:9},(_,i)=>({...sample(),id:'drawer-'+i,coordinates:[31,121]}));const before=JSON.stringify(p.allMemories),adds=addCalls;p.applyFilters('','all','drawer-0');assert.equal(p.data.mapDrawers.length,1);assert.equal(p.data.mapDrawers[0].rows.length,0);
    p.onDrawerToggle({currentTarget:{dataset:{index:0}}});const first=p.data.mapDrawers[0];assert(first.open);assert.equal(first.pages,3);assert.deepEqual(first.rows.map(x=>x.id),['drawer-3','drawer-2','drawer-1']);assert.equal(p.data.markers[0].customCallout.anchorY,0);
    const seen=new Set();for(let pageIndex=0;pageIndex<3;pageIndex++){p.data.mapDrawers[0].rows.forEach(row=>seen.add(row.id));p.onDrawerPage({currentTarget:{dataset:{step:1}}});}assert.equal(seen.size,8);
    p.onClusterPick({currentTarget:{dataset:{id:'drawer-2'}}});assert.equal(p.data.selected.id,'drawer-2');assert(p.data.clusterOpen);assert.equal(p.data.markers[0].memoryId,'drawer-0');assert(p.data.mapDrawers[0].rows.find(r=>r.id==='drawer-2').selected);
    assert.equal(JSON.stringify(p.allMemories),before);assert.equal(addCalls,adds);p.onClusterClose();assert.equal(p.data.mapDrawers[0].rows.length,0);
  });
  await test('drawer closes when filtering or zoom splits a group and ignores old row taps',()=>{
    const p=page('map');p.allMemories=[{...sample(),id:'drawer-near-a',restaurant:'alpha',coordinates:[31,121]},{...sample(),id:'drawer-near-b',restaurant:'beta',coordinates:[31.001,121.001]}];p.applyFilters('','all','drawer-near-a');p.onDrawerToggle({currentTarget:{dataset:{index:0}}});assert(p.data.clusterOpen);p.onQuery({detail:{value:'alpha'}});assert.equal(p.data.clusterOpen,false);assert.equal(p.data.mapDrawers.length,0);p.onClusterPick({currentTarget:{dataset:{id:'drawer-near-b'}}});assert.equal(p.data.selected.id,'drawer-near-a');
    p.data.query='';p.applyFilters('','all','drawer-near-a');p.onDrawerToggle({currentTarget:{dataset:{index:0}}});p.active=true;p.readMapScale(18);assert.equal(p.data.mapDrawers.length,0);assert.equal(p.data.clusterOpen,false);p.onHide();
  });
  await test('drawer photo completion after close cannot update a new marker or expose a raw cloud ID',async()=>{
    const p=page('map');p.allMemories=[{...sample(),id:'photo-root'},{...sample(),id:'photo-child',photo:'cloud://env.bucket/dining/private.jpg',noPhoto:false}];p.applyFilters('','all','photo-root');p.onDrawerToggle({currentTarget:{dataset:{index:0}}});let done;p.active=true;p.pinRenderer={render:()=>new Promise(r=>{done=r;}),dispose(){}};const generation=p.markerGeneration;p.renderDrawerPhotos(generation);assert(!p.data.mapDrawers[0].rows[0].iconPath.startsWith('cloud://'));p.onHide();done('/user/old-private-stamp.png');await Promise.resolve();assert.equal(p.data['mapDrawers[0].rows[0].iconPath'],undefined);
  });
  await test('reference hybrid stack places top chevron before bare pins without count buttons',()=>{
    const w=fs.readFileSync(path.join(mp,'pages/map/index.wxml'),'utf8');assert(w.indexOf('class="pin-stack-toggle')<w.indexOf('class="pin-stack-row'));assert(w.includes('slot="callout"'));assert(w.includes('class="map-stack-overlay"'));assert(w.includes('<image'));assert(!w.includes('pin-drawer-root'));assert(!w.includes('{{drawer.count}}'));assert(!w.includes('cluster-panel'));assert(!w.includes('&& !clusterOpen'));assert(!w.includes('{{pin.restaurant}}'));assert(w.includes('drawer.screenX'));assert(w.includes('drawer.screenY-drawer.height'));assert(w.indexOf('class="map-stack-overlay"')>w.indexOf('</map>'));
  });
  await test('native marker bridge receives only complete finite numeric dimensions during animation and photo refresh',async()=>{
    const p=page('map');const patches=[];p.setData=function(patch,cb){patches.push(patch);Object.assign(this.data,patch);if(cb)cb();};p.active=true;p.allMemories=[{...sample(),id:'bridge-a',coordinates:[31,121]},{...sample(),id:'bridge-b',coordinates:[32,122]}];p.pinRenderer={render:async()=>'/user/bridge-photo.png',dispose(){}};
    p.applyFilters('','all','bridge-a');await new Promise(r=>setTimeout(r,245));p.onMarkerTap({detail:{markerId:1}});await new Promise(r=>setTimeout(r,245));p.onHide();
    assert(patches.filter(p=>p.markers).length>3);for(const patch of patches){assert(!Object.keys(patch).some(k=>k.startsWith('markers[')));for(const m of patch.markers||[]){assert(Number.isInteger(m.width)&&m.width>0);assert(Number.isInteger(m.height)&&m.height>0);assert.equal(typeof m.iconPath,'string');assert(Number.isFinite(m.latitude));assert(Number.isFinite(m.longitude));}}
  });
  await test('reference stack uses transparent equal-size stamps, synchronized upward motion and Quiet bypass',()=>{
    const css=fs.readFileSync(path.join(mp,'pages/map/index.wxss'),'utf8'),w=fs.readFileSync(path.join(mp,'pages/map/index.wxml'),'utf8');assert(!css.includes('@keyframes pin-stack-rise'));assert(!w.includes('animation-delay:'));assert(fs.readFileSync(path.join(mp,'pages/map/index.js'),'utf8').includes('this.active&&!this.data.quiet'));assert(!css.includes('.pin-drawer'));assert(!css.includes('overflow:visible'));assert(css.includes('width:80px; height:89px'));
    const p=page('map');p.allMemories=[{...sample(),id:'first'},{...sample(),id:'second'}];p.applyFilters('','all','first');p.onDrawerToggle({currentTarget:{dataset:{index:0}}});p.onClusterPick({currentTarget:{dataset:{id:'second'}}});p.onMarkerTap({detail:{markerId:0}});assert.equal(p.data.selected.id,'first');assert(p.data.clusterOpen);assert.equal(p.data.markers[0].width,1);assert.equal(p.data.markers[0].iconPath,'/images/markers/stack-anchor.png');
  });
  await test('stack interpolates both opening and closing and cancels on exit',async()=>{
    const p=page('map');p.active=true;p.allMemories=Array.from({length:4},(_,i)=>({...sample(),id:'reveal-'+i,coordinates:[31,121]}));p.applyFilters('','all','reveal-0');p.onDrawerToggle({currentTarget:{dataset:{index:0}}});const closedHeight=p.data.mapDrawers[0].height;assert.equal(p.data.mapDrawers[0].rows.length,3);assert(p.data.mapDrawers[0].rows.every(row=>row.opacity===0));
    await new Promise(r=>setTimeout(r,120));const mid=p.data.mapDrawers[0].height;assert(mid>closedHeight);assert(mid<432);assert(p.data.mapDrawers[0].rows.some(row=>row.opacity>0&&row.opacity<1));await new Promise(r=>setTimeout(r,240));const full=p.data.mapDrawers[0].height;assert.equal(full,432);
    p.onClusterClose();assert.equal(p.data.mapDrawers[0].height,full);assert.equal(p.data.mapDrawers[0].rows.length,3);await new Promise(r=>setTimeout(r,120));assert(p.data.mapDrawers[0].height<full);assert(p.data.mapDrawers[0].height>closedHeight);await new Promise(r=>setTimeout(r,240));assert.equal(p.data.mapDrawers[0].rows.length,0);assert.equal(p.data.mapDrawers[0].height,closedHeight);
    p.onDrawerToggle({currentTarget:{dataset:{index:0}}});p.onHide();assert.equal(p.drawerRevealTimer,null);await new Promise(r=>setTimeout(r,100));assert.deepEqual(p.data.mapDrawers,[]);
  });
  await test('single restaurant has no misleading expansion arrow; Quiet groups expand immediately',()=>{
    const p=page('map');p.allMemories=[{...sample(),id:'only',coordinates:[31,121]}];p.applyFilters('','all','only');assert.equal(p.data.mapDrawers.length,0);assert.equal(p.data.markers[0].customCallout,undefined);p.allMemories.push(...Array.from({length:3},(_,i)=>({...sample(),id:'quiet-'+i,coordinates:[31,121]})));p.data.quiet=true;p.active=true;p.applyFilters('','all','only');p.onDrawerToggle({currentTarget:{dataset:{index:0}}});assert.equal(p.data.mapDrawers[0].rows.length,3);assert.equal(p.drawerRevealTimer,null);p.onHide();
  });
  await test('stack layout keeps the root baseline fixed and equal spacing at rest',()=>{
    const stack=require(path.join(mp,'utils/mapStack'));let previous=0;for(let n=0;n<=3;n++){previous=0;for(let i=0;i<=20;i++){const frame=stack.layout(n,i/20);assert.equal(frame.height-frame.rootTop,89);assert(frame.height>=previous);previous=frame.height;assert(frame.slots.every(row=>Number.isInteger(row.top)&&row.opacity>=0&&row.opacity<=1));}const last=stack.layout(n,1);last.slots.forEach((row,j)=>assert.equal(last.rootTop-row.top,(j+1)*101));}
  });
  await test('reversing a partially opened stack preserves position and frames cause no extra image requests',async()=>{
    const p=page('map');p.active=true;p.allMemories=[{...sample(),id:'reverse-root'},{...sample(),id:'reverse-child'}];let renders=0;p.pinRenderer={peek:()=>'/user/cached-stamp.png',render:async()=>{renders++;return '/user/cached-stamp.png';},dispose(){}};p.applyFilters('','all','reverse-root');p.onDrawerToggle({currentTarget:{dataset:{index:0}}});const calls=renders;await new Promise(r=>setTimeout(r,120));assert.equal(renders,calls);const mid=p.data.mapDrawers[0].height;p.onDrawerToggle({currentTarget:{dataset:{index:0}}});assert.equal(p.data.mapDrawers[0].height,mid);await new Promise(r=>setTimeout(r,120));assert(p.data.mapDrawers[0].height<mid);assert(p.data.mapDrawers[0].height>=129);p.onHide();
  });
  await test('native visuals and transparent hit regions are separated but share frame data',()=>{
    const w=fs.readFileSync(path.join(mp,'pages/map/index.wxml'),'utf8');
    const native=w.split('<cover-view slot="callout">')[1].split('</map>')[0];
    const hits=w.split('<view class="map-stack-overlay"')[1].split('<!-- offline')[0];
    assert(native.includes('marker-id="{{drawer.markerId}}"'));assert(native.includes('native-stack-photo'));
    assert(!native.includes('catchtap'));assert(!native.includes('stackPositionsReady'));
    assert(!hits.includes('<image'));assert(!hits.includes('<cover-image'));
    for(const handler of ['onDrawerToggle','onClusterPick','onStackRoot','onDrawerPage'])assert(hits.includes('catchtap="'+handler+'"'));
    for(const field of ['drawer.height','drawer.rootTop','pin.top']){assert(native.includes(field));assert(hits.includes(field));}
    assert(!w.includes('class="stack-close-fallback glass"'));
  });
  await test('arrow, root, child and close handlers retain their intended operations',()=>{
    const p=page('map');p.data.quiet=true;p.allMemories=[{...sample(),id:'tap-root'},{...sample(),id:'tap-child'}];p.applyFilters('','all','tap-root');p.onDrawerToggle({currentTarget:{dataset:{index:'0'}}});assert(p.data.clusterOpen);p.onClusterPick({currentTarget:{dataset:{id:'tap-child'}}});assert.equal(p.data.selectedId,'tap-child');p.onStackRoot({currentTarget:{dataset:{id:'tap-root'}}});assert.equal(p.data.selectedId,'tap-root');p.onClusterClose();assert.equal(p.data.clusterOpen,false);assert.equal(p.data.mapDrawers[0].rows.length,0);
  });
  await test('real viewport projection preserves coordinate input and handles wrapped longitude',()=>{
    const projection=require(path.join(mp,'utils/mapProjection'));
    const point=[0,0],region={southwest:{latitude:-10,longitude:-10},northeast:{latitude:10,longitude:10}};
    const result=projection.project(point,region,{width:400,height:800});
    assert(Math.abs(result.x-200)<1e-6);assert(Math.abs(result.y-400)<1e-6);assert.deepEqual(point,[0,0]);
    const wrap=projection.project([0,-175],{southwest:{latitude:-10,longitude:170},northeast:{latitude:10,longitude:-170}},{width:400,height:800});assert.equal(wrap.x,300);
    assert.equal(projection.project(point,{},{}),null);
  });
  await test('Map card and strip stay mounted with reversible reduced-motion-aware transitions',()=>{
    const w=fs.readFileSync(path.join(mp,'pages/map/index.wxml'),'utf8'),css=fs.readFileSync(path.join(mp,'pages/map/index.wxss'),'utf8');
    assert(!w.includes('selected && !cardCollapsed'));assert(!w.includes('selected && cardCollapsed'));
    assert(w.includes('card-is-collapsed'));assert(w.includes('strip-is-visible'));assert(css.includes('transition:transform 320ms'));assert(css.includes('.quiet .place-card,.quiet .place-expand { transition:none; }'));
  });
  await test('map fallback depends on mapError only, never gesture overlay visibility',()=>{
    const w=fs.readFileSync(path.join(mp,'pages/map/index.wxml'),'utf8');
    assert(w.includes('<view wx:if="{{mapError}}" class="map-fallback">'));
    assert(!w.includes('<view wx:else class="map-fallback">'));
    const p=page('map');p.data.mapError=false;p.data.stackPositionsReady=true;
    p.onMapRegionChange({type:'begin'});assert.equal(p.data.stackPositionsReady,false);assert.equal(p.data.mapError,false);
    p.onMapRegionChange({detail:{type:'end'}});assert.equal(p.data.mapError,false);
    p.onMapError();assert.equal(p.data.mapError,true);p.onMapRetry();assert.equal(p.data.mapError,false);
  });
  await test('native arrows are bundled high-resolution exports of rounded SVG geometry',()=>{
    const w=fs.readFileSync(path.join(mp,'pages/map/index.wxml'),'utf8');
    for(const direction of ['up','down']){
      const svg=fs.readFileSync(path.join(mp,'images/markers/stack-button-'+direction+'.svg'),'utf8');
      const png=fs.readFileSync(path.join(mp,'images/markers/stack-button-'+direction+'.png'));
      assert(svg.includes('stroke-linecap="round"'));assert.equal(png.readUInt32BE(16),96);assert.equal(png.readUInt32BE(20),96);
      assert(w.includes('/images/markers/stack-button-'+direction+'.png'));
    }
    assert(!w.includes("'⌄'"));assert(!w.includes("'⌃'"));
  });
  await test('hybrid gestures keep native frame, disable hits, and perform no repeated viewport polling',async()=>{
    const p=page('map');p.active=true;p.data.stackPositionsReady=true;const frames=[{markerId:0,height:230}];p.data.mapDrawers=frames;let calls=0;
    p.syncStackPositions=()=>{calls++;};
    p.onMapRegionChange({detail:{type:'begin'}});
    await new Promise(r=>setTimeout(r,115));assert.equal(calls,0);assert.equal(p.data.stackPositionsReady,false);assert.strictEqual(p.data.mapDrawers,frames);
    p.onMapRegionChange({detail:{type:'end'}});await new Promise(r=>setTimeout(r,120));assert.equal(calls,1);
    await new Promise(r=>setTimeout(r,100));assert.equal(calls,1);
    p.onMapRegionChange({detail:{type:'end'}});p.onHide();await new Promise(r=>setTimeout(r,100));assert.equal(calls,1);assert.equal(p.stackAlignTimer,null);
  });
  await test('late viewport response cannot reactivate hit targets during a new gesture',()=>{
    const p=page('map');p.active=true;let done;
    p.mapCtx={getRegion:opts=>{done=opts.success;}};
    p.syncStackPositions();assert.equal(p.stackProjectionBusy,true);
    p.onMapRegionChange({detail:{type:'begin'}});
    done({southwest:{latitude:0,longitude:0},northeast:{latitude:1,longitude:1}});
    assert.equal(p.data.stackPositionsReady,false);p.onHide();
  });
  await test('card and strip opacity finish with the 320ms stack transition',()=>{
    const css=fs.readFileSync(path.join(mp,'pages/map/index.wxss'),'utf8');
    const js=fs.readFileSync(path.join(mp,'pages/map/index.js'),'utf8');
    assert(js.includes('duration=mapStack.DURATION'));assert.equal(require(path.join(mp,'utils/mapStack')).DURATION,320);assert(!css.includes('opacity 220ms'));
    assert(css.includes('opacity 320ms cubic-bezier(.333333,0,.666667,1)'));
    assert(css.includes('height 320ms cubic-bezier(.333333,0,.666667,1)'));
  });
  await test('Lucide replacements remove remaining direct character button glyphs',()=>{
    for(const rel of ['pages/add/index.wxml','pages/map/index.wxml']){
      const w=fs.readFileSync(path.join(mp,rel),'utf8');assert(!/>[\s]*[×‹›][\s]*</.test(w));
    }
    const w=fs.readFileSync(path.join(mp,'pages/map/index.wxml'),'utf8');
    assert(w.includes('/images/icons/lucide/chevron-left.png'));assert(w.includes('/images/icons/lucide/chevron-right.png'));
    for(const name of ['chevron-left','chevron-right'])assert(fs.existsSync(path.join(mp,'images/icons/lucide',name+'.svg')));
    assert(fs.readFileSync(path.join(mp,'images/icons/lucide/LICENSE.txt'),'utf8').includes('ISC License'));
  });
  await test('presence retains exit content, cancels stale unmount on reopen, and disposes timers',async()=>{
    const motion=require(path.join(mp,'utils/motionPresence'));let writes=0;
    const host={data:{},setData(p){writes++;Object.assign(this.data,p);}};
    motion.update(host,'panel',true,false,20);assert(host.data.panelMounted);
    motion.update(host,'panel',false,false,20);assert(host.data.panelClosing);assert(host.data.panelMounted);
    motion.update(host,'panel',true,false,20);await new Promise(r=>setTimeout(r,30));assert(host.data.panelMounted);assert(!host.data.panelClosing);
    motion.update(host,'panel',false,false,20);await new Promise(r=>setTimeout(r,30));assert(!host.data.panelMounted);
    motion.update(host,'panel',true,false,20);motion.update(host,'panel',false,false,20);motion.dispose(host);const before=writes;
    await new Promise(r=>setTimeout(r,30));assert.equal(writes,before);
    motion.update(host,'panel',false,true,20);assert(!host.data.panelMounted);assert(!host.data.panelClosing);
  });
  await test('Sheet retains last display type when the parent clears a closed request',()=>{
    const file=path.join(mp,'components/sheet/index.js');let spec;const old=global.Component;global.Component=x=>spec=x;delete require.cache[require.resolve(file)];require(file);global.Component=old;
    const c={...spec.methods,data:{...spec.data,show:true,type:'memory',quiet:false},setData(p){Object.assign(this.data,p);},refresh(){}};
    const observe=spec.observers['show, type, memoryId, filter'];observe.call(c);assert.equal(c.data.displayType,'memory');assert(c.data.sheetMounted);
    c.data.show=false;c.data.type='';observe.call(c);assert.equal(c.data.displayType,'memory');assert(c.data.sheetClosing);
    c.data.show=true;c.data.type='help';observe.call(c);assert.equal(c.data.displayType,'help');assert(!c.data.sheetClosing);
    require(path.join(mp,'utils/motionPresence')).dispose(c);
  });
  await test('menu, toast and FAQ transitions preserve layout and honor Quiet',()=>{
    const w=fs.readFileSync(path.join(mp,'pages/map/index.wxml'),'utf8');assert(!w.includes('wx:if="{{showFilters}}"'));assert(w.includes('aria-hidden="{{!showFilters}}"'));
    const css=fs.readFileSync(path.join(mp,'app.wxss'),'utf8');assert(css.includes('visibility 0s 320ms'));assert(css.includes('.quiet .motion-popover { transition:none; }'));
    const toast=fs.readFileSync(path.join(mp,'components/toast/index.wxss'),'utf8');assert(toast.includes('translate(-50%,18rpx)'));assert(toast.includes('.savor-toast.quiet { animation:none; }'));
    const sheet=fs.readFileSync(path.join(mp,'components/sheet/index.wxml'),'utf8');assert(sheet.includes('sheetMounted'));assert(sheet.includes('displayType'));assert(sheet.includes('faqHeights[index]'));
  });
  await test('TabBar uses five consistent Lucide outlines without business dependencies',()=>{
    const js=fs.readFileSync(path.join(mp,'custom-tab-bar/index.js'),'utf8'),w=fs.readFileSync(path.join(mp,'custom-tab-bar/index.wxml'),'utf8');
    for(const name of ['house','map-pinned','users-round','user-round'])assert(js.includes('lucide-'+name));
    assert(js.includes("chosen: 'utensils-crossed'"));assert(w.includes('<s-morph'));assert(!w.includes('fill="{{'));const fallback=fs.readFileSync(path.join(mp,'components/morph-icon/index.wxml'),'utf8');assert(fallback.includes('stroke="1.75"'));
    assert(!/require\s*\(/.test(js.replace(/\/\/[^\n]*/g,'')));
  });
  await test('Morphicons adapter creates distinct finite intermediate path geometry for all lab pairs',()=>{
    const engine=require(path.join(mp,'utils/morphEngine'));
    let spec;const old=global.Page;global.Page=x=>spec=x;const file=path.join(mp,'pages/morph-lab/index.js');delete require.cache[require.resolve(file)];require(file);global.Page=old;
    for(const pair of spec.data.pairs){
      const state=engine.plan(engine.sample(pair.a),pair.b),samples=[];
      for(const t of [0,.25,.5,.75,1]){
        const f=engine.copy(engine.frame(state,t));assert(f.length>0);
        assert(f.every(s=>Array.from(s.pts).every(Number.isFinite)));samples.push(JSON.stringify(f));
      }
      assert(new Set(samples).size>=3,pair.label);
      const mid=engine.copy(engine.frame(state,.5));const before=JSON.stringify(mid);const reverse=engine.plan(mid,pair.a);
      engine.frame(reverse,.4);assert.equal(JSON.stringify(mid),before,'interruption must not mutate snapshot');
    }
  });
  await test('WeChat Canvas adapter draws changing paths, reverses, respects Quiet and detaches safely',async()=>{
    const file=path.join(mp,'components/morph-icon/index.js');let spec;const old=global.Component;global.Component=x=>spec=x;delete require.cache[require.resolve(file)];require(file);global.Component=old;
    let strokes=0,updates=0;const reports=[];const ctx={setTransform(){},clearRect(){},beginPath(){},moveTo(){},lineTo(){},closePath(){},stroke(){strokes++;}};
    const c={...spec.methods,data:{name:'house',color:'#34483c',quiet:false},_alive:true,_ctx:ctx,_canvas:{width:168,height:168,requestAnimationFrame:fn=>setTimeout(fn,8),cancelAnimationFrame:clearTimeout},setData(p){updates++;Object.assign(this.data,p);},triggerEvent(n,r){reports.push(r);}};
    c.move(true);c.data.name='map-pinned';c.move();await new Promise(r=>setTimeout(r,100));const halfway=JSON.stringify(c._current);assert(strokes>3);
    c.data.name='house';c.move();const original=JSON.parse(halfway);assert.equal(c._current.length,original.length);c._current.forEach((sub,i)=>Array.from(sub.pts).forEach((v,j)=>assert(Math.abs(v-original[i].pts[j])<1e-7)));await new Promise(r=>setTimeout(r,450));assert(reports.some(r=>r.mode==='complete'&&r.frames>2));assert(updates<=5,'only start/end visibility updates, never per-frame geometry setData');assert.equal(c.data.painting,false);
    c.data.quiet=true;c.data.name='x';c.move();assert.equal(c._raf,null);assert.equal(reports[reports.length-1].mode,'quiet');
    c.data.quiet=false;c.data.name='plus';c.move();spec.lifetimes.detached.call(c);const end=strokes;await new Promise(r=>setTimeout(r,30));assert.equal(strokes,end);
  });
  await test('unsupported Canvas reports static fallback and never removes production navigation',()=>{
    const file=path.join(mp,'components/morph-icon/index.js');let spec;const old=global.Component;global.Component=x=>spec=x;delete require.cache[require.resolve(file)];require(file);global.Component=old;
    let report;const c={...spec.methods,data:{ready:true},_alive:true,setData(p){Object.assign(this.data,p);},triggerEvent(n,r){report=r;}};c.canvasError();assert.equal(c.data.ready,false);assert.equal(report.mode,'static-fallback');
    const tab=JSON.parse(fs.readFileSync(path.join(mp,'custom-tab-bar/index.json'),'utf8'));assert.equal(tab.usingComponents['s-morph'],'/components/morph-icon/index');const w=fs.readFileSync(path.join(mp,'components/morph-icon/index.wxml'),'utf8');assert(w.includes('!ready || !painting'));assert(w.includes('<s-icon'));
    const app=JSON.parse(fs.readFileSync(path.join(mp,'app.json'),'utf8'));assert.equal(app.tabBar.list.length,5);assert(app.pages.includes('pages/morph-lab/index'));
  });
  await test('approved tab endpoints exactly use official Lucide shape nodes',()=>{
    const nodes=require(path.join(mp,'utils/lucideMorphNodes')),icons=require(path.join(mp,'utils/icons')).icons;
    const names=['house','house-heart','map','map-pinned','utensils','utensils-crossed','users','users-round','user','user-round'];
    for(const name of names){
      const svg=fs.readFileSync(path.join(mp,'images/icons/lucide',name+'.svg'),'utf8'),expected=[];
      for(const m of svg.matchAll(/<(path|line|rect|circle|ellipse|polyline|polygon)\s+([^>]+)\/>/g)){
        const attrs={};for(const a of m[2].matchAll(/([\w-]+)="([^"]*)"/g))attrs[a[1]]=a[2];expected.push([m[1],attrs]);
      }
      assert.deepEqual(nodes[name],expected);assert(icons['lucide-'+name]);
    }
  });
  await test('native tab re-creation receives origin and self-activates without predecessor onShow',()=>{
    const h=nativeTabs(2),a=h.bar();h.tap(a,3);const b=h.bar();assert.equal(a.data.selected,2);assert.equal(b.data.transitionFrom,2);assert(b.data.entryKey>0);assert.equal(b.data.selected,3);assert.equal(b.data.entryActive,true);assert.deepEqual(JSON.parse(JSON.stringify(h.spec.data.list.map(x=>[x.rest,x.chosen]))),[['house','house-heart'],['map','map-pinned'],['utensils','utensils-crossed'],['users','users-round'],['user','user-round']]);
  });
  await test('all five pages publish complete UI metadata and cached visits retain distinct keys',()=>{
    for(const name of ['home','map','add','us','me']){const source=fs.readFileSync(path.join(mp,'pages',name,'index.js'),'utf8');assert(source.includes('tabBar.showSelection('),name);assert(source.includes('this._tabAppearance'),name);assert(!source.includes('tabBar.replayTransition'),name);}
    const h=nativeTabs(0),bars={0:h.bar()},keys=[];let current=bars[0];for(const index of [1,0,1]){h.tap(current,index);if(!bars[index])bars[index]=h.bar();current=bars[index];current.showSelection(index);keys.push(current.data.entryKey);}assert.equal(keys.length,3);assert.equal(new Set(keys).size,3);
  });
  await test('cached morph icon replays a new visit and ignores duplicate state notifications',async()=>{
    const file=path.join(mp,'components/morph-icon/index.js');let spec;const old=global.Component;global.Component=x=>spec=x;delete require.cache[require.resolve(file)];require(file);global.Component=old;
    const reports=[];const ctx={setTransform(){},clearRect(){},beginPath(){},moveTo(){},lineTo(){},closePath(){},stroke(){}};
    const c={...spec.methods,data:{name:'map-pinned',fromName:'map',entryKey:1,color:'#34483c',quiet:false},_alive:true,_ctx:ctx,_canvas:{width:96,height:96,requestAnimationFrame:fn=>setTimeout(fn,8),cancelAnimationFrame:clearTimeout},setData(p){Object.assign(this.data,p);},triggerEvent(n,r){reports.push(r);}};
    c.replay(1);await new Promise(r=>setTimeout(r,450));assert.equal(reports.filter(r=>r.mode==='complete').length,1);
    spec.pageLifetimes.hide.call(c);c.data.entryKey=2;c.replay(2);assert.equal(c._hidden,false);assert.equal(c.data.painting,true);
    const observer=spec.observers['name, quiet, color, fromName, entryKey'];observer.call(c);const generation=c._generation;observer.call(c);assert.equal(c._generation,generation);
    c.replay(2);assert.equal(c._generation,generation);await new Promise(r=>setTimeout(r,450));assert.equal(reports.filter(r=>r.mode==='complete').length,2);
    spec.lifetimes.detached.call(c);
  });
  await test('silent native rAF falls back to a bounded timer and reaches the target SVG',async()=>{
    const file=path.join(mp,'components/morph-icon/index.js');let spec;const old=global.Component;global.Component=x=>spec=x;delete require.cache[require.resolve(file)];require(file);global.Component=old;
    const reports=[];const ctx={setTransform(){},clearRect(){},beginPath(){},moveTo(){},lineTo(){},closePath(){},stroke(){}};
    const c={...spec.methods,data:{name:'square-plus',fromName:'plus',entryKey:1,color:'#34483c',quiet:false},_alive:true,_ctx:ctx,_canvas:{width:96,height:96,requestAnimationFrame:()=>1,cancelAnimationFrame(){}},setData(p){Object.assign(this.data,p);},triggerEvent(n,r){reports.push(r);}};
    c.replay(1);await new Promise(r=>setTimeout(r,480));assert.equal(c.data.painting,false);assert(reports.some(r=>r.mode==='complete'&&r.scheduler==='timer-fallback'&&r.frames>2));
    spec.lifetimes.detached.call(c);assert.equal(c._watchdog,null);
  });
  function svgMorph(overrides={},defer=false,autoLoad=true){
    const file=path.join(mp,'components/morph-icon/index.js');let spec;const previous=global.Component;global.Component=x=>spec=x;delete require.cache[require.resolve(file)];require(file);global.Component=previous;
    const c={...spec.methods,data:{...Object.fromEntries(Object.entries(spec.properties).map(([k,v])=>[k,v.value])),...spec.data,renderer:'svg',name:'house',color:'#34483c',...overrides},updates:[],acks:[],reports:[],createSelectorQuery(){throw new Error('SVG Tab must never create native Canvas');},setData(p,cb){this.updates.push({...p});Object.assign(this.data,p);if(cb){const id=p.frameSlots&&p.frameSlots[0].id;const ack=()=>{cb();if(autoLoad&&id!=null)this.svgLoaded({currentTarget:{dataset:{generation:id}}});};if(defer&&p.frameSrc)this.acks.push(ack);else ack();}},triggerEvent(n,v){this.reports.push(v);}};
    spec.lifetimes.attached.call(c);c.setup();return {c,spec};
  }
  await test('all five Tabs exclude native Canvas and use the approved Utensils/UtensilsCrossed Add endpoints',()=>{
    const w=fs.readFileSync(path.join(mp,'custom-tab-bar/index.wxml'),'utf8');assert.equal([...w.matchAll(/<s-morph renderer="svg"/g)].length,2);
    const component=fs.readFileSync(path.join(mp,'components/morph-icon/index.wxml'),'utf8');assert.match(component,/<canvas wx:if="\{\{renderer !== 'svg'\}\}"/);assert.match(component,/class="morph-svg" binderror="svgError"/);
    const tab=fs.readFileSync(path.join(mp,'custom-tab-bar/index.js'),'utf8');assert.match(tab,/rest: 'utensils', chosen: 'utensils-crossed'/);assert(!/\brequire\s*\(/.test(tab.replace(/\/\/[^\n]*/g,'')));
    const {c,spec}=svgMorph();assert.equal(c._canvas,undefined);assert.equal(c._ctx,undefined);assert.equal(c.data.painting,false);spec.lifetimes.detached.call(c);
  });
  await test('SVG frames encode finite changing geometry, escape colors and preserve exact static endpoints',()=>{
    const encode=require(path.join(mp,'utils/morphSvg')).frameSvg,engine=require(path.join(mp,'utils/morphEngine'));
    for(const [a,b] of [['house','house-heart'],['map','map-pinned'],['utensils','utensils-crossed'],['users','users-round'],['user','user-round']]){
      const state=engine.plan(engine.copy(engine.sample(a)),b);const frames=[0,.4,1].map(t=>encode(engine.frame(state,t),'#34483c'));
      assert.equal(new Set(frames).size,3);for(const frame of frames){assert(!frame.includes('NaN'));assert(frame.length<20000);assert.match(decodeURIComponent(frame),/stroke-width="1.75"/);}
    }
    assert.match(decodeURIComponent(encode([{pts:[0,1,2,3],closed:false}],'"<&')),/stroke="&quot;&lt;&amp;"/);
    assert.throws(()=>encode([{pts:[NaN,0],closed:false}],'black'));
    const w=fs.readFileSync(path.join(mp,'components/morph-icon/index.wxml'),'utf8');assert(w.includes('!ready || !painting'));assert(w.includes("settledEntryKey !== entryKey"));assert(w.includes("fromName : (staticName || name)"));
  });
  await test('cached SVG Tab replay completes, clears frame data and replays the next actual visit',async()=>{
    const {c,spec}=svgMorph({name:'house-heart',fromName:'house',entryKey:1});assert(c.data.painting);assert(c.data.frameSrc.startsWith('data:image/svg+xml'));
    await new Promise(r=>setTimeout(r,460));assert.equal(c.data.painting,false);assert.equal(c.data.frameSrc,'');assert.equal(c.reports.at(-1).scheduler,'svg-timer');
    const before=c.updates.filter(p=>p.frameSrc).length;assert(before>=3&&before<=16);
    c.data.entryKey=2;c.replay(2);assert(c.data.painting);await new Promise(r=>setTimeout(r,460));assert(c.updates.filter(p=>p.frameSrc).length>before);assert.equal(c.data.frameSrc,'');
    spec.lifetimes.detached.call(c);assert.equal(c._timer,null);
  });
  await test('SVG frame backpressure, reverse and stale callbacks never queue an image backlog',async()=>{
    const {c,spec}=svgMorph({},true);c.data.name='house-heart';c.move();const first=c._svgFlight;await new Promise(r=>setTimeout(r,80));assert.equal(c.acks.length,1);
    const oldAck=c.acks.shift();c.data.name='house';c.move();assert(c._svgFlight&&c._svgFlight!==first);const newest=c._svgFlight;oldAck();assert.equal(c._svgFlight,newest);
    c.acks.shift()();await new Promise(r=>setTimeout(r,40));assert(c.acks.length<=1);
    spec.pageLifetimes.hide.call(c);const count=c.updates.length;for(const ack of c.acks)ack();await new Promise(r=>setTimeout(r,70));assert.equal(c.updates.length,count);assert.equal(c.data.painting,false);assert.equal(c.data.frameSrc,'');assert.equal(c._svgFlight,null);
    spec.lifetimes.detached.call(c);
  });
  await test('SVG Quiet, frame error and detach retain official fallback with no live animation work',()=>{
    const {c,spec}=svgMorph({quiet:true,name:'map-pinned',fromName:'map',entryKey:1});assert.equal(c.data.painting,false);assert(!c.updates.some(p=>p.frameSrc));
    c.data.quiet=false;c.data.entryKey=2;c.move();assert(c.data.painting);c.svgError();assert.equal(c.data.ready,false);assert.equal(c.data.frameSrc,'');assert.equal(c._timer,null);assert.equal(c.reports.at(-1).reason,'svg-frame-unavailable');spec.lifetimes.detached.call(c);
  });
  await test('native lab Canvas pixels are erased at rest and on hide rather than merely hidden',()=>{
    const {c,spec}=svgMorph();let clears=0;c.data.renderer='canvas';c._svgReady=false;c._canvas={width:80,height:80};c._ctx={setTransform(){},clearRect(){clears++;}};
    c.move(true);assert.equal(clears,1);spec.pageLifetimes.hide.call(c);assert.equal(clears,2);spec.lifetimes.detached.call(c);assert.equal(clears,3);
  });
  await test('approved Add utensils pair reverses on SVG layer, repeats cached entry and honors Quiet',async()=>{
    const {c,spec}=svgMorph({duration:480,name:'utensils-crossed',fromName:'utensils',entryKey:1});assert(c.data.painting);
    await new Promise(r=>setTimeout(r,75));c.data.name='utensils';c.data.entryKey=0;c.move();
    await new Promise(r=>setTimeout(r,550));assert.equal(c._settledName,'utensils');assert.equal(c.data.frameSrc,'');
    c.data.name='utensils-crossed';c.data.fromName='utensils';c.data.entryKey=3;c.replay(3);assert(c.data.painting);
    await new Promise(r=>setTimeout(r,550));assert.equal(c._settledName,'utensils-crossed');assert.equal(c.data.painting,false);
    c.data.quiet=true;c.data.name='utensils';c.move();assert.equal(c._settledName,'utensils');assert.equal(c.data.frameSrc,'');assert.equal(c._timer,null);
    assert(c.updates.filter(p=>p.frameSrc).length>4);spec.lifetimes.detached.call(c);
  });
  await test('all five production Tabs use 480ms while the isolated Canvas lab remains 380ms',()=>{
    const tab=fs.readFileSync(path.join(mp,'custom-tab-bar/index.js'),'utf8'),w=fs.readFileSync(path.join(mp,'custom-tab-bar/index.wxml'),'utf8');
    assert.match(tab,/morphDuration: 480/);assert.equal([...w.matchAll(/presentation="\{\{viewState.icons\[index\]\}\}"/g)].length,2);assert(tab.includes('quiet:!!next.quiet,duration:480'));
    const component=fs.readFileSync(path.join(mp,'components/morph-icon/index.js'),'utf8');assert.match(component,/duration:\{type:Number,value:380\}/);
    const template=fs.readFileSync(path.join(mp,'components/morph-icon/index.wxml'),'utf8');assert(template.includes('bindload="svgLoaded"'));assert(template.includes('wx:key="id"'));assert(template.includes('data-generation="{{item.id}}"'));
  });
  await test('delayed SVG first-image load consumes none of the 480ms visual frame budget',async()=>{
    const {c,spec}=svgMorph({duration:480,name:'utensils-crossed',fromName:'utensils',entryKey:1},false,false);const id=c._generation;
    await new Promise(r=>setTimeout(r,190));assert.equal(c._svgMotion.elapsed,0);assert.equal(c._svgMotion.frames,1);assert.equal(c._timer,null);assert(c.data.loadingSrc);assert.equal(c.data.frameVisible,false);
    c.svgLoaded({currentTarget:{dataset:{generation:id-1}}});assert.equal(c._svgMotion.started,false);
    c.svgLoaded({currentTarget:{dataset:{generation:id}}});c.svgLoaded({currentTarget:{dataset:{generation:id}}});
    await new Promise(r=>setTimeout(r,220));assert(c.data.painting);assert(c._svgMotion.elapsed>0&&c._svgMotion.elapsed<480);
    await new Promise(r=>setTimeout(r,330));assert.equal(c.data.painting,false);const report=c.reports.at(-1);assert.equal(report.requestedDurationMs,480);assert.equal(report.frameBudgetMs,480);assert(report.firstFrameWaitMs>=180);assert(report.durationMs>=460);assert(report.frames>=10&&report.frames<=18);assert.equal(report.clock,'first-image-load');assert.equal(report.timing,'wall-clock');assert(report.durationMs<580);
    spec.lifetimes.detached.call(c);
  });
  await test('late SVG frame commits skip overdue samples without a backlog or accumulated duration',async()=>{
    const {c,spec}=svgMorph({duration:480,name:'map-pinned',fromName:'map',entryKey:1},true,true);
    c.acks.shift()();await new Promise(r=>setTimeout(r,45));assert.equal(c.acks.length,1);const elapsed=c._svgMotion.elapsed;
    await new Promise(r=>setTimeout(r,180));assert.equal(c._svgMotion.elapsed,elapsed);assert.equal(c.acks.length,1);assert(c.data.painting);
    for(let i=0;i<32&&c.data.painting;i++){if(c.acks.length)c.acks.shift()();await new Promise(r=>setTimeout(r,36));}
    assert.equal(c.data.painting,false);const report=c.reports.at(-1);assert.equal(report.frameBudgetMs,480);assert(report.frames>2&&report.frames<16);assert(report.durationMs>=480&&report.durationMs<620);assert.equal(report.timing,'wall-clock');spec.lifetimes.detached.call(c);
  });
  await test('missing or stale first-image callbacks cannot start old motions or leave live timers',async()=>{
    const {c,spec}=svgMorph({duration:480,name:'house-heart',fromName:'house',entryKey:1},false,false);const old=c._generation;
    c.data.name='house';c.data.fromName='house-heart';c.data.entryKey=2;c.move();const current=c._generation;
    c.svgLoaded({currentTarget:{dataset:{generation:old}}});c.svgError({currentTarget:{dataset:{generation:old}}});assert.equal(c.data.ready,true);assert.equal(c._svgMotion.started,false);
    await new Promise(r=>setTimeout(r,1270));assert.equal(c.data.painting,false);assert.equal(c.data.frameSrc,'');assert.equal(c._firstFrameTimer,null);assert.equal(c.reports.at(-1).reason,'svg-first-frame-timeout');const count=c.updates.length;
    c.svgLoaded({currentTarget:{dataset:{generation:current}}});assert.equal(c.updates.length,count);spec.lifetimes.detached.call(c);
  });
  await test('Tab destination first patch includes selection origin active entry and localized labels',()=>{
    const h=nativeTabs(2),a=h.bar();h.tap(a,3);const b=h.bar();assert.equal(b.updates.length,1);const p=b.updates[0];assert.equal(p.selected,3);assert.equal(p.transitionFrom,2);assert(p.entryKey>0);assert.equal(p.entryActive,true);assert.equal(p.labels[3],'我们');assert.equal(b.transitionPatch(3).entryKey,b.data.entryKey);for(const [index,name] of ['home','map','add','us','me'].entries())assert(fs.readFileSync(path.join(mp,'pages',name,'index.js'),'utf8').includes('tabBar.showSelection('+index+','));
  });
  for(const [rest,chosen] of [['house','house-heart'],['map','map-pinned'],['utensils','utensils-crossed'],['users','users-round'],['user','user-round']]){
    await test(chosen+' outgoing SVG morph cannot be restarted by page replay or duplicate observers',async()=>{
      const {c,spec}=svgMorph({duration:480,name:rest,fromName:chosen,entryKey:123});
      await new Promise(r=>setTimeout(r,65));const motion=c._svgMotion,generation=c._generation,elapsed=motion.elapsed,slots=c.data.frameSlots;
      c.replay(123);spec.observers['name, quiet, color, fromName, entryKey'].call(c);c.replay(123);
      assert.equal(c._svgMotion,motion);assert.equal(c._generation,generation);assert.equal(c._svgMotion.elapsed,elapsed);assert.equal(c.data.frameSlots,slots);assert.equal(c.data.frameVisible,true);
      spec.lifetimes.detached.call(c);
    });
  }
  await test('duplicate replay while the first SVG commit is delayed preserves the same image flight',()=>{
    const {c,spec}=svgMorph({duration:480,name:'house',fromName:'house-heart',entryKey:124},true,false);
    const flight=c._svgFlight,generation=c._generation,loading=c.data.loadingSrc;c.replay(124);
    assert.equal(c._svgFlight,flight);assert.equal(c._generation,generation);assert.equal(c.acks.length,1);assert.equal(c.data.loadingSrc,loading);
    c.acks.shift()();c.svgLoaded({currentTarget:{dataset:{generation}}});assert(c._svgMotion.started);spec.lifetimes.detached.call(c);
  });
  await test('cached SVG show waits for committed new entry instead of animating stale selected props',()=>{
    const {c,spec}=svgMorph({duration:480,name:'house-heart',fromName:'house',entryKey:125});spec.pageLifetimes.hide.call(c);
    const generation=c._generation,updates=c.updates.length;spec.pageLifetimes.show.call(c);
    assert.equal(c._generation,generation);assert.equal(c.updates.length,updates);assert.equal(c._hidden,true);
    Object.assign(c.data,{name:'house',fromName:'house-heart',entryKey:126});spec.observers['name, quiet, color, fromName, entryKey'].call(c);assert.equal(c._generation,generation);
    c.replay(126);assert.equal(c._hidden,false);assert.equal(c._generation,generation+1);assert(c.data.painting);spec.lifetimes.detached.call(c);
  });
  await test('programmatic navigation cannot be overwritten by a fresh handoff for another route',()=>{
    const h=nativeTabs(0),home=h.bar();h.tap(home,2);h.setRoute(0);home.seedTransition();assert.equal(home.data.selected,0);assert.equal(home.data.entryKey,0);assert.equal(home.data.transitionFrom,-1);
  });
  await test('expired Tab handoff resumes static icons without replaying an old transition',()=>{
    const h=nativeTabs(0),home=h.bar();h.tap(home,1);const map=h.bar();const now=Date.now;try{const later=now()+6000;Date.now=()=>later;map.replayTransition();assert.equal(map.data.entryKey,0);assert(map.data.viewState.icons.every(cmd=>cmd.key===0&&cmd.active));}finally{Date.now=now;}
  });
  await test('static SVG endpoint is held through prop change and becomes exact target only on completion',async()=>{
    const {c,spec}=svgMorph({duration:480,name:'house-heart'});assert.equal(c.data.staticName,'house-heart');
    Object.assign(c.data,{name:'house',fromName:'house-heart',entryKey:127});assert.equal(c.data.staticName,'house-heart');c.move();
    c.replay(127);await new Promise(r=>setTimeout(r,560));assert.equal(c.data.staticName,'house');assert.equal(c.data.painting,false);assert.equal(c.reports.filter(r=>r.mode==='complete').length,1);assert.equal(c.reports.at(-1).frameBudgetMs,480);spec.lifetimes.detached.call(c);
  });
  function displayedStaticIcon(c){
    const w=fs.readFileSync(path.join(mp,'components/morph-icon/index.wxml'),'utf8');
    const expressions=[...w.matchAll(/<s-icon[^>]*name="\{\{([^"\n]+)\}\}"/g)];
    const expression=expressions[0][1];
    return vm.runInNewContext(expression,{...c.data});
  }
  for(const [rest,chosen] of [['house','house-heart'],['map','map-pinned'],['utensils','utensils-crossed'],['users','users-round'],['user','user-round']]){
    await test(rest+' cached fallback shows current visit origin rather than the cached target before activation',()=>{
      const {c,spec}=svgMorph({duration:480,entryActive:false,name:rest,fromName:chosen,entryKey:300,staticName:rest,settledEntryKey:299});
      assert.equal(displayedStaticIcon(c),'lucide-'+chosen);assert.equal(c.data.painting,false);assert(!c._svgMotion);c.replay(300);assert(!c._svgMotion);
      c.data.entryActive=true;spec.observers.entryActive.call(c);assert(c._svgMotion);assert.equal(c._svgMotion.elapsed,0);const generation=c._generation;c.replay(300);assert.equal(c._generation,generation);spec.lifetimes.detached.call(c);
    });
  }
  await test('incoming cached Us origin is unselected until activation, not its old selected endpoint',()=>{
    const {c,spec}=svgMorph({entryActive:false,name:'users-round',fromName:'users',entryKey:301,staticName:'users-round',settledEntryKey:299});
    assert.equal(displayedStaticIcon(c),'lucide-users');assert.equal(c.data.painting,false);spec.lifetimes.detached.call(c);
  });
  await test('parked outgoing Add completes once and only then exposes its target static endpoint',async()=>{
    const {c,spec}=svgMorph({duration:480,entryActive:false,name:'utensils',fromName:'utensils-crossed',entryKey:302,staticName:'utensils',settledEntryKey:299});
    assert.equal(displayedStaticIcon(c),'lucide-utensils-crossed');c.data.entryActive=true;spec.observers.entryActive.call(c);c.replay(302);
    await new Promise(r=>setTimeout(r,560));assert.equal(c.data.settledEntryKey,302);assert.equal(displayedStaticIcon(c),'lucide-utensils');assert.equal(c.reports.filter(r=>r.mode==='complete').length,1);assert.equal(c.reports.at(-1).frameBudgetMs,480);spec.lifetimes.detached.call(c);
  });
  await test('Quiet and permanent SVG fallback cannot get stuck showing the origin of a new entry',()=>{
    const {c,spec}=svgMorph({quiet:true,entryActive:false,name:'utensils',fromName:'utensils-crossed',entryKey:303});assert.equal(displayedStaticIcon(c),'lucide-utensils');
    c.data.quiet=false;c.canvasError();assert.equal(c.data.fallbackOnly,true);c.data.entryKey=304;c.data.name='users-round';c.data.fromName='users';assert.equal(displayedStaticIcon(c),'lucide-users-round');spec.lifetimes.detached.call(c);
  });
  await test('nonexperimental navigation does not mutate source or cached peers and failure retains the source state',()=>{
    const h=nativeTabs(2),a=h.bar(),b=h.bar();const before=JSON.stringify([a.data,b.data]);h.tap(a,3);assert.equal(h.calls.length,1);assert.equal(JSON.stringify([a.data,b.data]),before);h.setRoute(2);h.calls[0].fail();for(const bar of [a,b]){assert.equal(bar.data.selected,2);assert.equal(bar.data.entryKey,0);assert.equal(bar.data.entryActive,true);h.spec.lifetimes.detached.call(bar);}
  });
  await test('fresh TabBar does not mount default icons before route/transition metadata is ready',()=>{
    const w=fs.readFileSync(path.join(mp,'custom-tab-bar/index.wxml'),'utf8');assert(w.includes('wx:if="{{presentationReady}}"'));assert.equal((w.match(/presentation="\{\{viewState.icons\[index\]\}\}"/g)||[]).length,2);assert(!w.includes('from-name='));
    const js=fs.readFileSync(path.join(mp,'custom-tab-bar/index.js'),'utf8');assert(js.includes('presentationReady:false'));assert(js.includes('tabInstances.delete(this)'));
  });
  await test('unresolved cold route stays unmounted until explicit page selection, not default Home',()=>{
    let spec;vm.runInNewContext(fs.readFileSync(path.join(mp,'custom-tab-bar/index.js'),'utf8'),{Component:s=>spec=s,wx:{switchTab(){}}});
    const b={...spec.methods,data:JSON.parse(JSON.stringify(spec.data)),setData(p){Object.assign(this.data,p);}};b.seedTransition();assert.equal(b.data.presentationReady,false);b.setData(b.transitionPatch(4));assert.equal(b.data.presentationReady,true);assert.equal(b.data.selected,4);assert.equal(b.data.entryActive,true);
  });
  await test('stack easing matches bottom-card cubic-bezier and is applied once for all rows',()=>{
    const stack=require(path.join(mp,'utils/mapStack'));assert.equal(stack.DURATION,320);
    assert.equal(stack.ease(0),0);assert.equal(stack.ease(.25),.15625);assert.equal(stack.ease(.5),.5);assert.equal(stack.ease(.75),.84375);assert.equal(stack.ease(1),1);
    for(const t of [0,.25,.5,.75,1]){const p=stack.ease(t),frame=stack.layout(3,p);assert(frame.slots.every(row=>row.opacity===Number(p.toFixed(3))));frame.slots.forEach((row,i)=>assert.equal(frame.rootTop-row.top,Math.round((i+1)*101*p)));assert.equal(frame.height-frame.rootTop,89);}
    const css=fs.readFileSync(path.join(mp,'pages/map/index.wxss'),'utf8');assert(css.includes('320ms cubic-bezier(.333333,0,.666667,1)'));
  });
  await test('closing or reversing on the last stack page retains its members and height',async()=>{
    const p=page('map');p.active=true;p.allMemories=Array.from({length:8},(_,i)=>({...sample(),id:'last-page-'+i,coordinates:[31,121]}));p.data.quiet=true;p.applyFilters('','all','last-page-0');p.onDrawerToggle({currentTarget:{dataset:{index:0}}});p.onDrawerPage({currentTarget:{dataset:{step:1}}});p.onDrawerPage({currentTarget:{dataset:{step:1}}});assert.equal(p.data.drawerPage,2);assert.equal(p.data.mapDrawers[0].rows.length,1);
    const ids=p.data.mapDrawers[0].rows.map(r=>r.id),height=p.data.mapDrawers[0].height;p.data.quiet=false;p.onDrawerToggle({currentTarget:{dataset:{index:0}}});assert.equal(p.data.drawerPage,2);assert.deepEqual(p.data.mapDrawers[0].rows.map(r=>r.id),ids);assert.equal(p.data.mapDrawers[0].height,height);
    await new Promise(r=>setTimeout(r,80));const mid=p.data.mapDrawers[0].height;p.onDrawerToggle({currentTarget:{dataset:{index:0}}});assert.equal(p.data.mapDrawers[0].height,mid);assert.deepEqual(p.data.mapDrawers[0].rows.map(r=>r.id),ids);p.onHide();
  });
  await test('stack button matches mobile bottom-card material/glyph sizes and keeps its anchor',()=>{
    const stack=require(path.join(mp,'utils/mapStack'));
    for(const width of [375,390,430]){const b=stack.buttonGeometry(width);assert(Math.abs(b.left+b.size/2-44)<1e-9);assert(Math.abs(b.top+b.size/2-16)<1e-9);assert(Math.abs(b.size*28/32-56*width/750)<1e-9);assert(Math.abs(b.size*14/32-28*width/750)<1e-9);assert(b.hitWidth>=44);assert.equal(b.hitHeight,40);assert.equal(b.hitTop+b.hitHeight,36);}
    assert.equal(stack.buttonGeometry(1024).size,stack.buttonGeometry(430).size);
    for(const direction of ['up','down'])for(const suffix of ['', '-dusk']){const base=path.join(mp,'images/markers/stack-button-'+direction+suffix);const svg=fs.readFileSync(base+'.svg','utf8'),png=fs.readFileSync(base+'.png');assert(svg.includes('width="28" height="28" rx="12"'));assert(svg.includes('translate(9 9)'));assert(svg.includes(suffix?'#eeeae3':'#273b31'));assert.equal(png.readUInt32BE(16),96);assert.equal(png.readUInt32BE(20),96);}
  });
  await test('native stack pressed feedback clears on release, gesture and hide',()=>{
    const p=page('map');p.data.stackPositionsReady=true;p.onStackPress({currentTarget:{dataset:{rootId:'pressed-root'}}});assert.equal(p.data.pressedStackRoot,'pressed-root');p.onStackRelease();assert.equal(p.data.pressedStackRoot,'');p.onStackPress({currentTarget:{dataset:{rootId:'pressed-root'}}});p.onMapRegionChange({detail:{type:'begin'}});assert.equal(p.data.pressedStackRoot,'');p.data.stackPositionsReady=true;p.onStackPress({currentTarget:{dataset:{rootId:'pressed-root'}}});p.onHide();assert.equal(p.data.pressedStackRoot,'');
    const w=fs.readFileSync(path.join(mp,'pages/map/index.wxml'),'utf8');assert(w.includes('bindtouchcancel="onStackRelease"'));assert(w.includes('pressedStackRoot === drawer.rootId ? 0.85 : 1'));
  });
  await test('paging material remains mounted through close and shrinks without overlapping the first stamp',()=>{
    const w=fs.readFileSync(path.join(mp,'pages/map/index.wxml'),'utf8');assert.equal((w.match(/drawer.open && drawer.pages > 1/g)||[]).length,2);assert.equal((w.match(/30 \* drawer.progress/g)||[]).length,2);assert(w.includes("drawer.targetOpen && drawer.progress >= 1 ? 'auto' : 'none'"));
    for(let i=0;i<=100;i++){const p=i/100;assert(36+30*p<=40+Math.round(28*p));}
  });
  await test('create-collection permission errors are not silently swallowed', async () => {
    deniedCreate = true; const isolated = server(); const r = await isolated({ action: 'list' }); assert.equal(r.code, 'SERVER_ERROR'); deniedCreate = false;
  });
  await test('no OPENID is denied before any database operation', async () => {
    owner = ''; const r = await main({ action: 'list' }); assert.equal(r.code, 'UNAUTHENTICATED'); owner = 'owner-A';
  });
  store.dismissToast();
  console.log('\n' + count + '/' + count + ' mock contract scenarios passed. Not verified in WeChat DevTools or live CloudBase.');
})().catch(e => { console.error(e); process.exitCode = 1; });
