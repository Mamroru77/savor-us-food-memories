'use strict';
// MAP P0-2 -- primary-tab continuity.
//
// A primary-tab switch is NOT a page lifecycle boundary: `switchTab` keeps the page instance,
// so the Map page sees onLoad/onReady exactly once and only onShow/onHide on every switch.
// The <map> component, the WXML node tree and the renderer canvas therefore all survive.
//
// This suite drives the REAL page (miniprogram/pages/map/index.js), the REAL store and the REAL
// mapMarkers renderer, and counts what a tab return actually repeats:
//   cloud reads (listRecords)      - a product-data refetch
//   photo downloads                - a re-resolution of an already-resolved marker photo
//   renderer create/dispose        - the derived view model being thrown away and rebuilt
//   applyFilters / markers writes  - the marker set being rebuilt and pushed over the bridge
//
// It guards BEHAVIOUR, not a private variable name: it asserts on observable outcomes
// (cloud reads, downloads, bridge writes, and the state the user sees on return).

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const MP = path.join(ROOT, 'miniprogram');
const DIAG = process.env.MAP_TAB_RETURN_DIAG === '1';

// --------------------------------------------------------------------------- counters
function counters() {
  return { syncCloud: 0, listRecords: 0, downloads: 0, rendererCreates: 0, rendererDisposes: 0,
    renderCalls: 0, peekHits: 0, setData: 0, markerWrites: 0, applyFilters: 0, markerRebuilds: 0 };
}
function resetCounters(c) { Object.keys(c).forEach(k => { c[k] = 0; }); }

// --------------------------------------------------------------------------- harness
function harness() {
  const C = counters();
  const storage = {};
  const fileBytes = new Map();
  let composed = 0;
  const owner = () => 'u_' + 'a'.repeat(48);

  // ---- cloud payload table. Every seeded memory gets a cloud photo, so a warm return that
  // re-resolves photos is visible as a download count rather than hidden behind package art.
  const cloudRows = [];
  const tempFor = cloudID => '/user/cloud-' + String(cloudID).replace(/[^a-z0-9]/gi, '').slice(-12) + '.jpg';
  fileBytes.set('cloud', 900);

  function fakeCanvas() {
    const ctx = new Proxy({}, { get: () => () => {} });
    return {
      width: 0, height: 0,
      getContext: () => ctx,
      createImage() {
        const img = { width: 900, height: 1600 };
        Object.defineProperty(img, 'src', { set() { Promise.resolve().then(() => img.onload && img.onload()); } });
        return img;
      },
    };
  }
  const canvasNode = fakeCanvas();

  const wx = {
    env: { USER_DATA_PATH: '/user' },
    getStorageSync: key => storage[key],
    setStorageSync: (key, value) => { storage[key] = value; },
    removeStorageSync: key => { delete storage[key]; },
    getStorageInfoSync: () => ({ keys: Object.keys(storage), currentSize: 0, limitSize: 10240 }),
    getWindowInfo: () => ({ statusBarHeight: 20, windowWidth: 375 }),
    getSystemInfoSync: () => ({ statusBarHeight: 20, windowWidth: 375, platform: 'devtools' }),
    getDeviceInfo: () => ({ platform: 'devtools' }),
    getMenuButtonBoundingClientRect: () => ({ top: 24, bottom: 64, height: 40 }),
    getFileSystemManager: () => ({
      accessSync() {}, mkdirSync() {},
      copyFile(o) { o.success(); },
      readFile(o) { o.success({ data: 'photo' }); },
      writeFile(o) { o.success(); },
      statSync(p) { return { size: fileBytes.get(p) || 1200 }; },
      unlinkSync() {}, readdirSync: () => [],
    }),
    getImageInfo(o) { o.success({ width: 900, height: 1600, path: o.src, type: 'jpeg' }); },
    compressImage(o) { o.success({ tempFilePath: o.src + '.derivative.jpg' }); },
    canvasToTempFilePath(o) { o.success({ tempFilePath: '/user/composed-' + (++composed) + '.png' }); },
    chooseLocation(o) { o.success({ latitude: 31.2, longitude: 121.4, name: 'X', address: 'Y' }); },
    openLocation() {},
    switchTab(o) { if (o.success) o.success(); },
    createMapContext: () => ({ includePoints() {}, moveToLocation() {}, getScale(o) { if (o && o.success) o.success({ scale: 14 }); }, getRegion(o) { if (o && o.success) o.success({ southwest: { latitude: 31, longitude: 121 }, northeast: { latitude: 31.5, longitude: 121.5 } }); } }),
    cloud: {
      init() {},
      async uploadFile(o) { return { fileID: 'cloud://env.bucket/' + o.cloudPath }; },
      async callFunction(o) {
        const action = o && o.data && o.data.action;
        if (action === 'list') return { result: { success: true, data: cloudRows.slice(), nextCursor: '' } };
        return { result: { success: true, identityProtocol: 1, userId: owner(), data: cloudRows.slice() } };
      },
      async getTempFileURL({ fileList }) {
        return { fileList: fileList.map(fileID => ({ fileID, status: 0, tempFileURL: 'https://example.test/' + fileID.slice(-8) })) };
      },
      downloadFile(o) {
        C.downloads++;
        const local = tempFor(o.fileID);
        fileBytes.set(local, 250000);
        Promise.resolve().then(() => o.success({ tempFilePath: local }));
        return { abort() {}, onProgressUpdate() {} };
      },
    },
  };
  global.wx = wx;

  const identityPath = require.resolve(path.join(MP, 'utils/identity'));
  delete require.cache[identityPath];
  require.cache[identityPath] = { id: identityPath, filename: identityPath, loaded: true,
    exports: require('./identity-fixture.cjs').fixture(wx, owner) };

  for (const rel of ['utils/store.js', 'utils/cloudRecords.js', 'utils/mapMarkers.js', 'utils/data.js']) {
    delete require.cache[require.resolve(path.join(MP, rel))];
  }
  const store = require(path.join(MP, 'utils/store'));
  const cloudRecords = require(path.join(MP, 'utils/cloudRecords'));
  const mapMarkers = require(path.join(MP, 'utils/mapMarkers'));

  // ---- instrument the shared boundaries (module exports are looked up per call).
  const realSyncCloud = store.syncCloud;
  store.syncCloud = function () { C.syncCloud++; return realSyncCloud.apply(this, arguments); };
  const realListRecords = cloudRecords.listRecords;
  cloudRecords.listRecords = function () { C.listRecords++; return realListRecords.apply(this, arguments); };
  const realDownload = cloudRecords.downloadMapPhoto;
  cloudRecords.downloadMapPhoto = function () { return realDownload.apply(this, arguments); };
  const realCreateRenderer = mapMarkers.createRenderer;
  mapMarkers.createRenderer = function () {
    C.rendererCreates++;
    const renderer = realCreateRenderer.apply(this, arguments);
    const realRender = renderer.render, realDispose = renderer.dispose, realPeek = renderer.peek;
    renderer.render = function () { C.renderCalls++; return realRender.apply(this, arguments); };
    renderer.dispose = function () { C.rendererDisposes++; return realDispose.apply(this, arguments); };
    renderer.peek = function () { const hit = realPeek.apply(this, arguments); if (hit) C.peekHits++; return hit; };
    return renderer;
  };

  // ---- the real page, loaded once per harness (a page spec is created once in production).
  let spec;
  global.Page = x => { spec = x; };
  const pageFile = path.join(MP, 'pages', 'map', 'index.js');
  delete require.cache[require.resolve(pageFile)];
  require(pageFile);

  function page() {
    const instance = Object.assign({}, spec, {
      data: JSON.parse(JSON.stringify(spec.data)),
      setData(patch, cb) {
        C.setData++;
        if (Object.prototype.hasOwnProperty.call(patch, 'markers')) C.markerWrites++;
        for (const [key, value] of Object.entries(patch)) {
          const keys = key.replace(/\[(\d+)\]/g, '.$1').split('.');
          let target = this.data;
          for (let i = 0; i < keys.length - 1; i++) {
            if (target[keys[i]] === undefined) target[keys[i]] = /^\d+$/.test(keys[i + 1]) ? [] : {};
            target = target[keys[i]];
          }
          target[keys[keys.length - 1]] = value;
        }
        if (cb) cb();
      },
      getTabBar: () => ({ showSelection() {}, updateAppearance() {} }),
      createSelectorQuery: () => {
        let rectCb = null;
        const q = {
          select() { return q; }, fields() { return q; },
          boundingClientRect(cb) { rectCb = cb; return q; },
          exec(cb) {
            if (rectCb) rectCb({ top: 40, bottom: 120, height: 80, left: 0, right: 375, width: 375 });
            if (cb) cb([{ node: canvasNode, width: 768, height: 858, bottom: 120 }]);
          },
        };
        return q;
      },
    });
    const realApplyFilters = instance.applyFilters;
    let lastMarkers = null;
    instance.applyFilters = function () {
      C.applyFilters++;
      const result = realApplyFilters.apply(this, arguments);
      if (this.data.markers !== lastMarkers) { C.markerRebuilds++; lastMarkers = this.data.markers; }
      return result;
    };
    return instance;
  }

  function seed(memories) {
    memories.forEach(m => store.addMemory(m));
    // The cloud holds the same records, so a real cloud read is a genuine no-op.
    cloudRows.length = 0;
    memories.forEach(m => {
      const record = cloudRecords.memoryToCloudRecord(m);
      cloudRows.push(Object.assign({ _id: m.cloudId || m.id, revision: m.revision || 1, deleted: false }, record));
    });
  }

  const settle = async (ms = 60) => { for (let i = 0; i < 6; i++) await new Promise(r => setTimeout(r, ms)); };

  return { C, wx, store, cloudRecords, mapMarkers, page, seed, settle, resetCounters: () => resetCounters(C) };
}

// --------------------------------------------------------------------------- records
const GEO = { locationSource: 'tencent-picker', coordinateSystem: 'gcj02', geoConfirmed: true };
function memory(id, overrides) {
  return Object.assign({
    id, cloudId: id, revision: 1, deleted: false,
    restaurant: 'Restaurant ' + id, notes: '', date: '2026-09-2' + (id.length % 10),
    city: '上海市', country: '中国', neighborhood: '黎安路',
    rating: 4, ratingSource: 'single', tags: [], photo: 'cloud://env.bucket/dining/u_a/' + id + '/0.jpg',
    extraPhotos: [], noPhoto: false, coordinates: [31.12, 121.36], locationUnknown: false,
    shared: false, liked: false, saved: false, memberOpenids: [], coupleId: '',
    address: '上海市闵行区黎安路140号', locationName: 'Restaurant ' + id,
  }, GEO, overrides);
}
const SEED = () => [
  memory('m-01'), memory('m-02', { coordinates: [31.13, 121.37] }), memory('m-03', { coordinates: [31.14, 121.38] }),
  memory('m-04', { coordinates: [31.15, 121.39] }), memory('m-05', { coordinates: [31.16, 121.40] }),
  memory('m-06', { coordinates: [31.17, 121.41] }),
];

// --------------------------------------------------------------------------- runner
const tests = [];
let count = 0;
const failures = [];
const metrics = [];
async function test(name, fn) {
  try { await fn(); count++; console.log('PASS ' + name); }
  catch (e) { failures.push(name); console.error('FAIL ' + name + '\n  ' + String(e && e.message).split('\n')[0]); }
}
function record(label, C, extra) {
  const row = Object.assign({ scenario: label }, C, extra || {});
  metrics.push(row);
  console.log('    ' + label + ': cloudReads=' + C.listRecords + ' downloads=' + C.downloads +
    ' rendererCreates=' + C.rendererCreates + ' rendererDisposes=' + C.rendererDisposes +
    ' applyFilters=' + C.applyFilters + ' markerWrites=' + C.markerWrites + ' setData=' + C.setData);
}

// ---------------------------------------------------------------- S1: cold load, then tab return
tests.push(() => test('S1 a tab return with no data change reuses the loaded Map instead of rebuilding it', async () => {
  const h = harness();
  h.seed(SEED());
  const p = h.page();
  p.onLoad();
  await p.onShow();
  p.onReady();
  await h.settle();
  const cold = Object.assign({}, h.C);
  record('cold load', cold);

  // The Map is fully usable: markers carry composed photos, not the bundled fallback.
  const composed = p.data.markers.filter(m => !/fallback/.test(String(m.iconPath || ''))).length;
  assert.ok(composed > 0, 'the cold load must actually resolve marker photos (got ' + composed + ')');
  assert.ok(cold.downloads > 0, 'the cold load must have downloaded the cloud photos');
  const stateAfterCold = {
    markers: p.data.markers, markerCount: p.data.markers.length, selectedId: p.data.selectedId,
    latitude: p.data.latitude, longitude: p.data.longitude, mapScale: p.data.mapScale,
    selected: p.data.selected && p.data.selected.id, selectedPhoto: p.data.selectedPhoto,
    commandScale: p.data.commandScale, showNativePoi: p.data.showNativePoi,
  };

  h.resetCounters();
  p.onHide();
  await p.onShow();
  await h.settle();
  const warm = Object.assign({}, h.C);
  record('tab return (no change)', warm);

  // No product-data refetch and no re-resolution of already-resolved photos.
  assert.equal(warm.listRecords, 0, 'a tab return must not re-read the product data');
  assert.equal(warm.downloads, 0, 'a tab return must not re-download already-resolved marker photos');
  assert.equal(warm.rendererCreates, 0, 'the derived view model must survive the tab switch');
  assert.equal(warm.rendererDisposes, 0, 'a tab return must not throw the renderer away');
  assert.equal(warm.applyFilters, 0, 'a tab return must not rebuild the marker set when nothing changed');
  assert.equal(warm.markerWrites, 0, 'a tab return must not push the marker list over the bridge again');
  assert.equal(warm.markerRebuilds, 0, 'the marker set must be the same object, not a rebuilt equal one');

  // Prior view state is intact.
  assert.equal(p.data.markers, stateAfterCold.markers, 'the marker list must be reused');
  assert.equal(p.data.selectedId, stateAfterCold.selectedId, 'the selection must survive');
  assert.equal(p.data.latitude, stateAfterCold.latitude, 'the centre must not be reset');
  assert.equal(p.data.longitude, stateAfterCold.longitude, 'the centre must not be reset');
  assert.equal(p.data.mapScale, stateAfterCold.mapScale, 'the scale must not be reset');
  assert.equal(p.data.commandScale, stateAfterCold.commandScale, 'the bound camera channel must not move');
  assert.equal(p.data.selected && p.data.selected.id, stateAfterCold.selected, 'the selected card must survive');
  assert.equal(p.data.selectedPhoto, stateAfterCold.selectedPhoto, 'the card photo source must survive');
  assert.equal(p.data.showNativePoi, stateAfterCold.showNativePoi, 'the POI preference must survive');
  assert.equal(p.data.markers.filter(m => /fallback/.test(String(m.iconPath || ''))).length,
    stateAfterCold.markers.filter(m => /fallback/.test(String(m.iconPath || ''))).length,
    'no marker may fall back to the bundled art on return');
  p.onUnload();
}));

// ---------------------------------------------------------------- S2: a real mutation still refreshes
tests.push(() => test('S2 a memory added while Map is hidden still appears on return', async () => {
  const h = harness();
  h.seed(SEED());
  const p = h.page();
  p.onLoad();
  await p.onShow();
  p.onReady();
  await h.settle();
  const before = p.data.markers.length;

  p.onHide();
  // Add-tab path: the real store mutation + commit, exactly as a save produces it.
  const added = memory('m-new', { coordinates: [31.30, 121.55], restaurant: 'Brand New Place' });
  h.store.addMemory(added);
  h.resetCounters();
  await p.onShow();
  await h.settle();

  assert.ok(p.data.markers.length > before, 'the new memory must appear on the Map');
  assert.ok(p.data.markers.some(m => m.memoryId === 'm-new'), 'the new marker must be present');
  assert.ok(p.data.selected, 'a selected card must still exist');
  record('tab return (after add)', h.C);
  p.onUnload();
}));

// ---------------------------------------------------------------- S3: identity change cannot leak
tests.push(() => test('S3 a new actor Map session cannot inherit the previous session state', async () => {
  const h = harness();
  h.seed(SEED());
  const first = h.page();
  first.onLoad();
  await first.onShow();
  first.onReady();
  await h.settle();
  const firstMarkers = first.data.markers;
  const firstRenderer = first.pinRenderer;
  assert.ok(firstMarkers.length > 0 && firstRenderer, 'the first session must be usable');
  const downloadsAfterFirst = h.C.downloads;
  const unsubscribed = { count: 0 };
  const realUnsubscribe = first.unsubscribe;
  first.unsubscribe = () => { unsubscribed.count++; return realUnsubscribe && realUnsubscribe(); };
  first.onUnload();
  assert.equal(h.C.rendererDisposes, 1, 'unload must release the renderer so nothing can outlive the page');
  assert.equal(unsubscribed.count, 1, 'unload must release the store subscription');

  // A new Map session (which is what an actor transition produces) starts from nothing: it must
  // not reuse the previous page's marker list or its renderer, and it must resolve photos again.
  h.resetCounters();
  const second = h.page();
  second.onLoad();
  await second.onShow();
  second.onReady();
  await h.settle();
  assert.notEqual(second.data.markers, firstMarkers, 'a new session must not inherit the old marker list');
  assert.notEqual(second.pinRenderer, firstRenderer, 'a new session must not inherit the old renderer');
  assert.equal(h.C.rendererCreates, 1, 'a new session must build its own derived view model');
  assert.ok(h.C.downloads > 0, 'a new session must resolve its own photos rather than reuse cached paths');
  record('new session after unload', h.C, { downloadsAfterFirst });
  second.onUnload();
}));

// ---------------------------------------------------------------- S4: rapid tab switching
tests.push(() => test('S4 rapid Map/Home switching neither duplicates work nor accumulates state', async () => {
  const h = harness();
  h.seed(SEED());
  const p = h.page();
  p.onLoad();
  await p.onShow();
  p.onReady();
  await h.settle();
  const stable = { markers: p.data.markers.length, selectedId: p.data.selectedId };

  h.resetCounters();
  for (let i = 0; i < 4; i++) { p.onHide(); await p.onShow(); }
  await h.settle();
  record('4x rapid hide/show', h.C);

  assert.equal(h.C.listRecords, 0, 'rapid switching must not multiply cloud reads');
  assert.equal(h.C.downloads, 0, 'rapid switching must not multiply photo downloads');
  assert.equal(h.C.rendererCreates, 0, 'rapid switching must not rebuild the renderer');
  assert.equal(h.C.rendererDisposes, 0, 'rapid switching must not dispose the renderer');
  assert.equal(p.data.markers.length, stable.markers, 'the marker set must not accumulate');
  assert.equal(p.data.selectedId, stable.selectedId, 'the selection must stay valid');
  assert.equal(p.visibilityListeners === undefined ? 0 : 0, 0);
  p.onUnload();
}));

// ---------------------------------------------------------------- S5: theme / locale while hidden
tests.push(() => test('S5 a theme or locale change while Map is hidden is not presented stale', async () => {
  const h = harness();
  h.seed(SEED());
  const p = h.page();
  p.onLoad();
  await p.onShow();
  p.onReady();
  await h.settle();
  assert.equal(p.data.dusk, false, 'PEARL first');

  p.onHide();
  h.store.updateSettings({ theme: 'dusk', showNativePoi: false });
  h.resetCounters();
  await p.onShow();
  await h.settle();
  record('tab return (theme + POI changed while hidden)', h.C);

  assert.equal(p.data.dusk, true, 'the theme changed while hidden must be reflected');
  assert.equal(p.data.showNativePoi, false, 'the POI preference changed while hidden must be reflected');
  assert.equal(h.C.downloads, 0, 'a presentation change must not re-download marker photos');
  assert.equal(p.data.markers.length, SEED().length, 'the marker set must still be complete');
  p.onUnload();
}));

// ---------------------------------------------------------------- S6: cache lifetime boundary
tests.push(() => test('S6 a cloud read that changes nothing does not rebuild the Map', async () => {
  const h = harness();
  h.seed(SEED());
  const p = h.page();
  p.onLoad();
  await p.onShow();
  p.onReady();
  await h.settle();
  // The camera travel is timer-driven, so make sure it has finished before the window opens:
  // otherwise its settle (and the prefetch that follows it) lands inside the measurement and
  // the window no longer measures what it names.
  p.cancelCameraTransition();
  await h.settle();
  h.resetCounters();
  // An external sync (Home's onShow does exactly this) returns identical records.
  await h.store.syncCloud();
  await h.settle();
  record('no-op cloud sync', h.C);
  assert.equal(h.C.listRecords, 1, 'the sync itself must still read the cloud');
  assert.equal(h.C.applyFilters, 0, 'an unchanged cloud result must not rebuild the marker set');
  assert.equal(h.C.markerWrites, 0, 'an unchanged cloud result must not write markers over the bridge');
  assert.equal(h.C.downloads, 0, 'an unchanged cloud result must not re-resolve photos');
  p.onUnload();
}));

// ---------------------------------------------------------------- S7: the bounded refresh
tests.push(() => test('S7 an elapsed refresh window re-reads the cloud without rebuilding the Map', async () => {
  const h = harness();
  h.seed(SEED());
  const p = h.page();
  p.onLoad();
  await p.onShow();
  p.onReady();
  await h.settle();
  // Simulate a session that has been open longer than the bounded refresh window. The read is
  // legitimate (a remote change could not otherwise be noticed), but it must stay invisible:
  // an unchanged result is not a data change, so nothing is rebuilt and nothing is re-resolved.
  p.lastCloudSyncAt = Date.now() - 600000;
  h.resetCounters();
  p.onHide();
  await p.onShow();
  await h.settle();
  record('tab return (refresh window elapsed)', h.C);

  assert.equal(h.C.listRecords, 1, 'an elapsed window must still refresh the product data');
  assert.equal(h.C.applyFilters, 0, 'a refresh that changes nothing must not rebuild the marker set');
  assert.equal(h.C.markerWrites, 0, 'a refresh that changes nothing must not write markers');
  assert.equal(h.C.downloads, 0, 'a refresh that changes nothing must not re-resolve photos');
  assert.equal(h.C.rendererCreates, 0, 'a refresh must not throw the renderer away');
  p.onUnload();
}));

(async () => {
  let completed = false;
  process.on('beforeExit', () => { if (!completed) { console.error('map tab return checks did not run to completion'); process.exitCode = 1; } });
  for (const run of tests) await run();
  completed = true;
  if (DIAG) {
    console.log('\n--- metrics ---');
    metrics.forEach(m => console.log(JSON.stringify(m)));
  }
  if (failures.length) {
    console.error('\n' + failures.length + ' FAILED, ' + count + ' passed:');
    for (const f of failures) console.error('  - ' + f);
    process.exitCode = 1;
    return;
  }
  console.log(count + '/' + count + ' map tab-return checks passed.');
})().catch(e => { console.error(e); process.exitCode = 1; });
