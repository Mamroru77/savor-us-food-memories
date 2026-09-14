// Versioned private partition store used by the central identity boundary.
// Identity responses must come from the account service, never persisted hints.
const KEY = 'savor-identity-partitions-v1';
const LEGACY_KEYS = ['savor-diary-v1', 'savor-draft-v1'];
const clone = value => JSON.parse(JSON.stringify(value));
function fail(code) { const error = new Error(code); error.code = code; throw error; }
function createPartitions(storage) {
  let session = null, generation = 0;
  function read() {
    const raw = storage.getStorageSync(KEY);
    if (raw === '' || raw === undefined || raw === null) return null;
    let value; try { value = typeof raw === 'string' ? JSON.parse(raw) : clone(raw); } catch (e) { fail('CACHE_CORRUPT'); }
    if (!value || value.formatVersion !== 1 || !value.partitions || typeof value.partitions !== 'object' || Array.isArray(value.partitions) || !value.legacyQuarantine || typeof value.legacyQuarantine!=='object' || Array.isArray(value.legacyQuarantine)) fail('CACHE_UNSUPPORTED');
    return value;
  }
  function validate(partition,userId){
    const plain=v=>v&&typeof v==='object'&&!Array.isArray(v);
    if(!plain(partition)||!Array.isArray(partition.outbox)||!(partition.diary===null||plain(partition.diary))||!(partition.draft===null||plain(partition.draft)))fail('CACHE_CORRUPT');
    if(partition.outbox.some(op=>!plain(op)||op.actorUserId!==userId))fail('OUTBOX_IDENTITY_MISMATCH');
    if(partition.workspaceDraft&&(!plain(partition.workspaceDraft)||partition.workspaceDraft.actorUserId!==userId))fail('DRAFT_IDENTITY_MISMATCH');
    if(partition.workspaceIntent&&(!plain(partition.workspaceIntent)||partition.workspaceIntent.actorUserId!==userId))fail('OUTBOX_IDENTITY_MISMATCH');
    if(partition.draft!==null&&partition.draft.actorUserId!==userId)fail('DRAFT_IDENTITY_MISMATCH');
    if(partition.diary&&(!Array.isArray(partition.diary.outbox)||JSON.stringify(partition.diary.outbox)!==JSON.stringify(partition.outbox)))fail('CACHE_CORRUPT');
  }
  function persist(value) { storage.setStorageSync(KEY, JSON.stringify(value)); }
  function initialize() {
    let value = read();
    if (value) return value;
    // Copy raw legacy values without normalizing/dropping unknown fields.
    // The original keys are never removed or overwritten.
    const legacyQuarantine = {};
    LEGACY_KEYS.forEach(key => { const raw = storage.getStorageSync(key); if (raw !== undefined && raw !== null && raw !== '') legacyQuarantine[key] = raw; });
    value = { formatVersion:1, partitions:{}, legacyQuarantine };
    persist(value); return value;
  }
  function invalidate() { session = null; generation++; }
  function beginVerification() { invalidate(); return generation; }
  function accept(ticket, result) {
    if (ticket !== generation) fail('STALE_IDENTITY');
    if (!result || result.success !== true || result.protocolVersion !== 1 || !/^u_[a-f0-9]{48}$/.test(result.userId)) fail('IDENTITY_INVALID');
    const value = initialize();
    if (!value.partitions[result.userId]) {
      value.partitions[result.userId] = { diary:null, draft:null, outbox:[] };
      persist(value);
    }
    validate(value.partitions[result.userId],result.userId);
    session = { userId:result.userId, generation }; return lease();
  }
  function lease() { if (!session) fail('IDENTITY_LOCKED'); return Object.assign({}, session); }
  function assertLease(token) { if (!session || !token || token.generation !== generation || token.userId !== session.userId) fail('STALE_IDENTITY'); }
  function get(token) { assertLease(token); const value = read(); if (!value || !value.partitions[token.userId]) fail('CACHE_MISSING'); validate(value.partitions[token.userId],token.userId);return clone(value.partitions[token.userId]); }
  function save(token, partition) {
    assertLease(token);
    if (!partition || !Array.isArray(partition.outbox) || partition.outbox.some(op => !op || op.actorUserId !== token.userId)) fail('OUTBOX_IDENTITY_MISMATCH');
    const value = read(); if (!value || !value.partitions[token.userId]) fail('CACHE_MISSING');
    validate(partition,token.userId);
    value.partitions[token.userId] = clone(partition); persist(value);
  }
  function quarantine() { lease(); return clone(initialize().legacyQuarantine); }
  return { beginVerification, accept, invalidate, lease, assertLease, get, save, quarantine };
}
module.exports = { KEY, createPartitions };
