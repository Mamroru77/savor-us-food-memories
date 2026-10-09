// DETAIL IMAGE MUST RESOLVE TO ORIGINAL.
//
// The performance round this suite belongs to introduced a shared thumbnail pipeline. The one
// thing that pipeline must NEVER do is reach a restaurant / memory detail view: a detail is the
// place a user goes to actually look at the photo, and a permanent low-resolution substitute
// there is a quality regression dressed up as a speed-up.
//
// So this file pins the contract from both ends:
//   * the detail surface must bind the record's OWN image list, and
//   * the native viewer must be handed the ORIGINAL bytes, not a derivative,
//   * and the shared pipeline must not be on the detail path at all.
//
// It is a product guard, not a performance measurement.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const ROOT = path.resolve(__dirname, '..');
const MP = path.join(ROOT, 'miniprogram');
const SHEET_WXML = fs.readFileSync(path.join(MP, 'components', 'sheet', 'index.wxml'), 'utf8');
const SHEET_JS = fs.readFileSync(path.join(MP, 'components', 'sheet', 'index.js'), 'utf8');
const PREVIEW = fs.readFileSync(path.join(MP, 'utils', 'memoryPreview.js'), 'utf8');
const SOURCES = fs.readFileSync(path.join(MP, 'utils', 'nativePreviewSources.js'), 'utf8');
const CACHE = fs.readFileSync(path.join(MP, 'utils', 'imageCache.js'), 'utf8');
const MARKERS = fs.readFileSync(path.join(MP, 'utils', 'mapMarkers.js'), 'utf8');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('PASS ' + name); }
  catch (e) { failed++; console.error('FAIL ' + name + ': ' + String(e && e.message).split('\n')[0]); }
}

test('D1 the detail view binds the record\'s own image list', () => {
  const binding = SHEET_WXML.match(/class="detail-photo"[^>]*src="\{\{([^}]*)\}\}"/);
  assert.ok(binding, 'the detail photo must have a src binding');
  assert.ok(binding[1].indexOf('detail.images[photoIndex]') >= 0,
    'the detail photo must render detail.images[photoIndex], saw: ' + binding[1]);
  assert.ok(binding[1].indexOf('detail.thumbnail') < 0 && binding[1].indexOf('preview') < 0,
    'and must not be re-pointed at a preview or thumbnail field');
});

test('D2 the detail image list is the record\'s real photos, in order', () => {
  const builder = SHEET_JS.slice(SHEET_JS.indexOf('images: [memory.photo]'), SHEET_JS.indexOf('images: [memory.photo]') + 90);
  assert.ok(builder.indexOf('[memory.photo].concat(memory.extraPhotos || [])') >= 0,
    'the detail gallery is the original photo followed by the originals, saw: ' + builder.trim());
  assert.ok(SHEET_JS.indexOf('detail.images.map') < 0 && SHEET_JS.indexOf('resolvePhotoUrls(detail.images') < 0,
    'the detail list must not be rewritten through the shared pipeline');
});

test('D3 the native viewer is handed the ORIGINAL bytes for a cloud photo', () => {
  assert.ok(SOURCES.indexOf('downloadMapPhoto(source)') >= 0,
    'a cloud detail image is downloaded through the private boundary, which returns the object itself');
  assert.ok(SOURCES.indexOf('imageCache') < 0,
    'the native viewer must not go through the thumbnail pipeline');
  assert.ok(PREVIEW.indexOf('nativePreviewSources').indexOf !== -1, 'memoryPreview delegates resolution');
  assert.ok(PREVIEW.indexOf('launch(detail.images)') >= 0,
    'and passes the record\'s own images to wx.previewImage');
});

test('D4 no detail-shaped thumbnail variant exists to be substituted in', () => {
  const variants = (CACHE.match(/'(marker|detail|card|row|list)'/g) || []);
  assert.equal(variants.indexOf("'detail'"), -1,
    'the shared cache must not know about a "detail" variant: a variant that exists is a variant someone will use');
  assert.ok(CACHE.indexOf('CACHE_SCHEMA') >= 0, 'the cache is schema-versioned, so a change invalidates rather than corrupts');
});

test('D5 the marker pipeline only ever produces marker-sized derivatives', () => {
  const edge = MARKERS.match(/SOURCE_LONG_EDGE\s*=\s*(\d+)/);
  assert.ok(edge, 'the marker derivative bound must be declared');
  assert.ok(Number(edge[1]) <= 512,
    'a marker source must stay a small derivative, saw ' + edge[1]);
  assert.ok(MARKERS.indexOf("'marker'") >= 0, 'and it is requested under the marker variant only');
});

test('D6 a detail image list is never fed to the shared preview pipeline', () => {
  // The sheet legitimately resolves LIST thumbnails through the pipeline — that is what makes the
  // library fast. What it must never do is hand a DETAIL image list to it. So the guard is not
  // "which file", it is "which data": no detail image list may reach the pipeline, and the two
  // pure detail surfaces must not reference it at all.
  const sheet = SHEET_JS;
  const PIPELINE = /ensureLocal|localSource|cachedLocal|imageCache/;
  assert.ok(PIPELINE.test(sheet), 'the sheet does use the pipeline for its list rows');
  sheet.split('\n').forEach((line, index) => {
    if (!/detail\.images/.test(line)) return;
    assert.equal(PIPELINE.test(line), false,
      'line ' + (index + 1) + ' feeds a detail image into the preview pipeline: ' + line.trim());
  });
  assert.equal(/detail\.images[^;]*imageCache/.test(sheet), false,
    'no detail image list may be passed to the pipeline');
  [['utils', 'memoryPreview.js'], ['utils', 'nativePreviewSources.js']].forEach(([dir, name]) => {
    const text = fs.readFileSync(path.join(MP, dir, name), 'utf8');
    assert.equal(PIPELINE.test(text), false, name + ' must not reference the preview pipeline at all');
  });
  // And the detail gallery is still built from the record's own photos.
  assert.ok(sheet.indexOf('images: [memory.photo].concat(memory.extraPhotos || [])') >= 0,
    'the detail gallery remains the record originals');
});

test('D7 the detail photo keeps its own error fallback rather than a silent downgrade', () => {
  const binding = SHEET_WXML.match(/class="detail-photo"[^>]*src="\{\{([^}]*)\}\}"/)[1];
  assert.ok(binding.indexOf('imageErrors[') >= 0, 'a failed original falls back explicitly');
  assert.ok(binding.indexOf('/images/le-comptoir.jpg') >= 0, 'to the bundled asset, never to a lower-resolution copy of itself');
  assert.ok(SHEET_WXML.indexOf('binderror="onImageError"') >= 0, 'and the failure is observed');
});

test('D8 the Map selected card MAY use the shared preview variant', () => {
  // The other half of the contract: a card is a preview surface, so it is allowed to bind a
  // derived image — as long as it does so through the one pipeline and keeps its fallback.
  const page = fs.readFileSync(path.join(MP, 'pages', 'map', 'index.js'), 'utf8');
  assert.ok(page.indexOf("imageCache.cachedLocal(cardSource, 'preview'") >= 0,
    'the card binds an already-cached preview in the same patch as the selection');
  assert.ok(page.indexOf("imageCache.ensureLocal(source, 'preview'") >= 0,
    'and raises the preview when it is not cached yet');
  assert.ok(page.indexOf('CARD_PREVIEW_LONG_EDGE') >= 0, 'through a named, measured variant size');
  const edge = Number((page.match(/CARD_PREVIEW_LONG_EDGE\s*=\s*(\d+)/) || [])[1]);
  assert.ok(edge >= 512, 'the card variant must cover the measured 469 device pixels, saw ' + edge);
  assert.ok(page.indexOf('selectedPhoto: selected ? (selected.placePhoto || selected.photo || data.photos.meal)') >= 0,
    'the raw source line is still the source of truth: the preview only replaces what is RENDERED');
});

console.log(passed + ' passed, ' + failed + ' failed; source-level product contract, no native claim.');
if (failed) process.exitCode = 1;
