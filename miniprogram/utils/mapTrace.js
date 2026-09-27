// Dev-only Map marker diagnostics. Deliberately no production UI: the switch is a
// storage flag a developer sets from the devtools console before a device run, and
// every entry point is a no-op while it is off.
//
// Privacy boundary, enforced structurally rather than by convention: a record may only
// receive the numeric/boolean fields in FIELDS, and every string field must be one of
// its ALLOWED tokens. A cloud file id, a filesystem path, a restaurant name or an
// openid therefore cannot be stored even by mistake, so a snapshot is safe to paste
// into a report. File paths are read for their size and never retained.
const KEY = 'savor:mapTrace';
const LIMIT = 240;
const FIELDS = ['jobId', 'selected', 'sourceKind', 'originalWidth', 'originalHeight', 'originalBytes',
  'derivativeWidth', 'derivativeHeight', 'derivativeBytes', 'stage', 'applyResult', 'reason',
  'downloadMs', 'downsampleMs', 'decodeMs', 'composeMs', 'exportMs', 'totalMs'];
const ALLOWED = {
  sourceKind: ['bundled', 'local', 'cloud'],
  stage: ['download', 'downsample', 'decode', 'compose', 'export'],
  applyResult: ['applied', 'stale-but-rebound', 'ready-cache-rebound', 'clustered', 'source-changed',
    'superseded', 'disposed', 'gesture-deferred'],
  reason: ['ok', 'cached', 'download-failed', 'size-unavailable', 'derivative-failed',
    'decode-failed', 'compose-failed', 'export-failed', 'compress-unavailable',
    'image-info-unavailable', 'timeout', 'unsafe-source', 'budget'],
};
const NUMERIC = ['originalWidth', 'originalHeight', 'originalBytes',
  'derivativeWidth', 'derivativeHeight', 'derivativeBytes',
  'downloadMs', 'downsampleMs', 'decodeMs', 'composeMs', 'exportMs', 'totalMs'];
// The per-stage timings a device run is actually read for. Kept here so the report can
// quote the exact field names the snapshot uses.
const TIMINGS = ['downloadMs', 'downsampleMs', 'decodeMs', 'composeMs', 'exportMs', 'totalMs'];

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
// Programmatic switch for the devtools console and for tests. It writes the same flag a
// cold start reads, so a device run can be prepared without editing any source.
function setEnabled(value) {
  enabled = Boolean(value);
  try { if (typeof wx !== 'undefined' && wx && wx.setStorageSync) wx.setStorageSync(KEY, enabled ? 'on' : ''); }
  catch (e) { /* storage is best effort; the in-memory flag still applies */ }
  if (!enabled) clear();
  return enabled;
}
// Only an allowlisted token survives; anything else collapses to 'other'. This is what
// makes "no path, no file id" a property of the code rather than a promise.
function token(field, value) {
  const text = String(value === undefined || value === null ? '' : value);
  return ALLOWED[field].indexOf(text) >= 0 ? text : 'other';
}
function count(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return 0;
  return Math.round(number);
}
function find(jobId) {
  for (let i = records.length - 1; i >= 0; i--) if (records[i].jobId === jobId) return records[i];
  return null;
}
// Returns 0 while tracing is off, so callers can pass the result around unconditionally.
function newJob(selected) {
  if (!on()) return 0;
  const jobId = ++seq;
  records.push({ jobId: jobId, selected: Boolean(selected) });
  while (records.length > LIMIT) records.shift();
  return jobId;
}
function record(jobId, patch) {
  if (!on() || !jobId || !patch) return;
  const target = find(jobId);
  if (!target) return;
  FIELDS.forEach(field => {
    if (!Object.hasOwn(patch, field)) return;
    if (field === 'selected') { target.selected = Boolean(patch.selected); return; }
    if (field === 'jobId') return;
    if (NUMERIC.indexOf(field) >= 0) { target[field] = count(patch[field]); return; }
    target[field] = token(field, patch[field]);
  });
}
// Size only. The path is used and dropped; it is never stored.
function fileBytes(path) {
  if (!on() || !path) return 0;
  try { const stat = wx.getFileSystemManager().statSync(path); return count(stat && stat.size); }
  catch (e) { return 0; }
}
function sourceKindOf(source) {
  const text = String(source || '');
  if (text.indexOf('/images/') === 0) return 'bundled';
  return text.indexOf('cloud://') === 0 ? 'cloud' : 'local';
}
function snapshot() { return records.map(entry => Object.assign({}, entry)); }
function summary() {
  const byResult = {}, byStage = {};
  const timingSum = {}, timingMax = {}, timingCount = {};
  TIMINGS.forEach(field => { timingSum[field] = 0; timingMax[field] = 0; timingCount[field] = 0; });
  records.forEach(entry => {
    if (entry.applyResult) byResult[entry.applyResult] = (byResult[entry.applyResult] || 0) + 1;
    if (entry.stage) byStage[entry.stage] = (byStage[entry.stage] || 0) + 1;
    TIMINGS.forEach(field => {
      const value = entry[field];
      if (!value) return;
      timingSum[field] += value;
      timingMax[field] = Math.max(timingMax[field], value);
      timingCount[field] += 1;
    });
  });
  return { jobs: records.length, byResult: byResult, byStage: byStage,
    timingSum: timingSum, timingMax: timingMax, timingCount: timingCount, limit: LIMIT };
}
function clear() { records.length = 0; }
module.exports = { on, setEnabled, newJob, record, fileBytes, sourceKindOf, snapshot, summary, clear,
  KEY, LIMIT, FIELDS, ALLOWED, NUMERIC, TIMINGS };
