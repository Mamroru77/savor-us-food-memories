// Dev-only diagnostics for the three image pipelines this round has to attribute:
//   map-memory  what a Map pin's Memory actually holds (is there a real photo at all?)
//   avatar      which stage of the custom-avatar flow failed, and with what category
//   meal        which stage of the restaurant-photo upload chain failed first
//
// Privacy is a property of the code, not a promise. Every field is declared below with its
// type; a string field can only ever hold a value that passes its own validator, and the
// validators accept nothing but lowercase tokens from a closed list or a SCREAMING_SNAKE code.
// A filesystem path, a cloud fileID, a restaurant name, an openid or a native errMsg therefore
// cannot be stored even by a caller mistake, so a snapshot is safe to paste into a report.
// Paths and file names are read for their byte size and extension and then dropped.
//
// Deliberately requires nothing: it is pulled in from utils/photos.js, and several test
// harnesses load that module with a strict require whitelist.
const KEY = 'savor:photoTrace';
const LIMIT = 300;

const ID_RE = /^[a-z][a-z0-9_-]{0,39}$/;          // closed lowercase token
const CODE_RE = /^[A-Z][A-Z0-9_]{1,60}$/;          // SCREAMING_SNAKE code, no spaces/paths
const EXT_RE = /^(jpg|jpeg|png|gif|webp|heic|heif|bmp|unknown)$/;
const HASH_RE = /^[0-9a-f]{8}$/;

// field -> validator. Anything not listed here is dropped, so a new call site cannot leak by
// inventing a field name.
const SCHEMA = {
  phase: v => ['map-memory', 'avatar', 'meal'].includes(v),
  memoryIdHash: v => HASH_RE.test(v),
  mapScale: 'number', groupCount: 'number', extraPhotos: 'number', pages: 'number',
  selected: 'boolean', noPhoto: 'boolean',
  photoExists: 'boolean', photoSafe: 'boolean', placePhotoExists: 'boolean', placePhotoSafe: 'boolean',
  isDefaultMeal: 'boolean',
  photoKind: v => ['bundled', 'local', 'cloud', 'https', 'empty'].includes(v),
  placePhotoKind: v => ['bundled', 'local', 'cloud', 'https', 'empty'].includes(v),
  photoForKind: v => ['bundled', 'local', 'cloud', 'https', 'empty'].includes(v),
  selectedPhotoSource: v => ['placePhoto', 'photo', 'defaultMeal', 'none'].includes(v),
  markerState: v => ['fallback', 'ready'].includes(v),
  selectedVariant: 'boolean', peekHit: 'boolean', applied: 'boolean',
  applyResult: v => ['applied', 'stale-but-rebound', 'ready-cache-rebound', 'clustered', 'source-changed',
    'superseded', 'disposed', 'gesture-deferred', 'not-requested', 'other'].includes(v),
  // avatar / meal stages
  stage: v => ['choose', 'source', 'persist', 'inspect', 'compress', 'decode', 'preview', 'me-preview',
    'mkdir', 'copy', 'read', 'write', 'stat', 'downsample', 'profile-save', 'upload', 'identity',
    'serialize', 'set-storage'].includes(v),
  category: v => ['identity', 'image', 'filesystem', 'storage', 'program', 'unknown'].includes(v),
  code: v => CODE_RE.test(v),
  chooser: v => ['chooseImage', 'chooseMedia', 'chooseAvatar', 'none'].includes(v),
  sizeType: v => ['original', 'compressed', 'mixed', 'unknown'].includes(v),
  keepOriginal: 'boolean',
  compressInvoked: 'boolean', resizeRequested: 'boolean', copyAttempted: 'boolean',
  copySucceeded: 'boolean', readWriteFallback: 'boolean', previewLoadFailed: 'boolean',
  uploadInvoked: 'boolean', upscaled: 'boolean',
  uploadResult: v => ['success', 'UPLOAD_TIMEOUT', 'UPLOAD_REJECTED', 'not-attempted', 'other'].includes(v),
  rung: v => ['original', '1600', '1080', 'reencode', 'none'].includes(v),
  format: v => EXT_RE.test(v) ? true : false,
  originalFormat: v => EXT_RE.test(v),
  // numbers
  originalWidth: 'number', originalHeight: 'number', originalBytes: 'number',
  requestedWidth: 'number', requestedHeight: 'number',
  resultWidth: 'number', resultHeight: 'number', resultBytes: 'number',
  durableWidth: 'number', durableHeight: 'number', durableBytes: 'number',
  rungWidth: 'number', rungHeight: 'number', rungBytes: 'number',
  uploadBytes: 'number', uploadMs: 'number', serializedBytes: 'number',
  compressMs: 'number', persistMs: 'number', totalMs: 'number',
};

let enabled = null;
let seq = 0;
const records = [];

function on() {
  if (enabled === null) {
    try { enabled = Boolean(typeof wx !== 'undefined' && wx && wx.getStorageSync && wx.getStorageSync(KEY)); }
    catch (e) { enabled = false; }
  }
  return enabled;
}
function setEnabled(value) {
  enabled = Boolean(value);
  try { if (typeof wx !== 'undefined' && wx && wx.setStorageSync) wx.setStorageSync(KEY, enabled ? 'on' : ''); }
  catch (e) { /* best effort; the in-memory flag still applies */ }
  if (!enabled) clear();
  return enabled;
}
// FNV-1a. Stable across runs so two snapshots can be correlated, and not reversible to the id.
function hashId(value) {
  const text = String(value === undefined || value === null ? '' : value);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}
function clean(field, value) {
  const rule = SCHEMA[field];
  if (!rule) return undefined;                                   // unknown field: dropped
  if (rule === 'number') { const n = Number(value); return Number.isFinite(n) ? Math.round(n) : 0; }
  if (rule === 'boolean') return Boolean(value);
  return rule(String(value === undefined || value === null ? '' : value)) ? String(value) : undefined;
}
// Returns a stable handle so a multi-stage flow can be updated in place; 0 while tracing is off.
function begin(phase) {
  if (!on() || !SCHEMA.phase(phase)) return 0;
  const id = ++seq;
  records.push({ t: id, phase: phase });
  while (records.length > LIMIT) records.shift();
  return id;
}
function record(handle, patch) {
  if (!on() || !handle || !patch) return;
  let target = null;
  for (let i = records.length - 1; i >= 0; i--) if (records[i].t === handle) { target = records[i]; break; }
  if (!target) return;
  Object.keys(patch).forEach(field => {
    const value = clean(field, patch[field]);
    if (value !== undefined) target[field] = value;
  });
}
// Size only. The path is used and dropped, never stored.
function fileBytes(path) {
  if (!on() || !path) return 0;
  try { const stat = wx.getFileSystemManager().statSync(path); return Math.max(0, Math.round(Number(stat && stat.size) || 0)); }
  catch (e) { return 0; }
}
// Extension only; the file name and its directory are discarded.
function extOf(path) {
  const text = String(path || '').split('?')[0];
  const dot = text.lastIndexOf('.');
  const ext = dot >= 0 ? text.slice(dot + 1).toLowerCase() : '';
  return EXT_RE.test(ext) ? ext : 'unknown';
}
// Classification only. Never returns the source itself.
function kindOf(source) {
  const text = String(source || '');
  if (!text) return 'empty';
  if (text.indexOf('/images/') === 0) return 'bundled';
  if (text.indexOf('cloud://') === 0) return 'cloud';
  if (/^https?:\/\//i.test(text)) return 'https';
  return 'local';
}
function isDefaultMeal(source, defaultMeal) {
  return Boolean(source) && String(source) === String(defaultMeal || '');
}
// Phase A: what does a Map pin's Memory ACTUALLY hold? The Map card and the marker read
// different fields on purpose --
//   card:   placePhoto || photo || data.photos.meal
//   marker: placePhoto || (!noPhoto ? photo : '')
// so a card can look populated while the marker correctly has nothing. Recording both verdicts
// plus the raw shape lets a grey marker be attributed to the record instead of guessed at.
// Exposed through utils/mapMarkers.js so pages/map/index.js needs no new dependency.
function memorySnapshot(selected, context) {
  if (!on() || !selected) return 0;
  const ctx = context || {};
  const handle = begin('map-memory');
  if (!handle) return 0;
  const photo = selected.photo || '';
  const place = selected.placePhoto || '';
  // The marker's own rule, transcribed from mapMarkers.photoFor.
  const markerSource = place || (!selected.noPhoto ? photo : '') || '';
  const defaultMeal = ctx.defaultMeal;
  record(handle, {
    memoryIdHash: hashId(selected.id),
    mapScale: ctx.mapScale,
    groupCount: ctx.groupCount,
    selected: true,
    noPhoto: Boolean(selected.noPhoto),
    photoExists: Boolean(photo),
    photoKind: kindOf(photo),
    isDefaultMeal: isDefaultMeal(photo, defaultMeal),
    placePhotoExists: Boolean(place),
    placePhotoKind: kindOf(place),
    extraPhotos: Array.isArray(selected.extraPhotos) ? selected.extraPhotos.length : 0,
    photoForKind: kindOf(markerSource),
    selectedPhotoSource: place ? 'placePhoto'
      : photo ? (isDefaultMeal(photo, defaultMeal) ? 'defaultMeal' : 'photo') : 'none',
  });
  return handle;
}

function snapshot() { return records.map(entry => Object.assign({}, entry)); }
function clear() { records.length = 0; }

// ---- C2: local media storage audit (READ-ONLY) --------------------------------------------
// Walks the owner's photo directory and reports sizes only. File names and paths are used to
// classify and count and are never returned. NOTHING is ever deleted here: this round may only
// measure, so a future safe-GC round can be designed from real numbers.
function auditMedia(dir, referenced) {
  // Separators are normalized before comparing: the mini program always writes '/', but a
  // caller (or a test harness) may hand us the platform separator, and a mismatch would
  // silently report every referenced file as an orphan.
  const norm = p => String(p || '').replace(/\\/g, '/');
  const refs = new Set(Array.isArray(referenced) ? referenced.filter(p => typeof p === 'string' && p).map(norm) : []);
  const out = { fileCount: 0, totalBytes: 0, referencedCount: 0, referencedBytes: 0,
    unreferencedCount: 0, unreferencedBytes: 0, largest: [] };
  if (!on() || typeof dir !== 'string' || !dir) return out;
  const FS = wx.getFileSystemManager();
  const walk = path => {
    let entries;
    try { entries = FS.readdirSync(path); } catch (e) { return; }
    (entries || []).forEach(name => {
      const child = path + '/' + name;
      let stat;
      try { stat = FS.statSync(child); } catch (e) { return; }
      if (stat && stat.isDirectory && stat.isDirectory()) { walk(child); return; }
      const bytes = Math.max(0, Math.round(Number(stat && stat.size) || 0));
      out.fileCount += 1;
      out.totalBytes += bytes;
      if (refs.has(norm(child))) { out.referencedCount += 1; out.referencedBytes += bytes; }
      else { out.unreferencedCount += 1; out.unreferencedBytes += bytes; }
      out.largest.push({ bytes, format: extOf(child) });
    });
  };
  walk(norm(dir));
  out.largest.sort((a, b) => b.bytes - a.bytes);
  out.largest = out.largest.slice(0, 10);
  return out;
}

module.exports = { on, setEnabled, begin, record, memorySnapshot, auditMedia, fileBytes, extOf, kindOf, isDefaultMeal, hashId,
  snapshot, clear, KEY, LIMIT, SCHEMA };