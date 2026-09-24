// V2: environment + verified user namespace; immutable chunks, manifest commit.
// V1 and legacy keys are read-only migration sources, never deleted/overwritten.
const KEY = 'savor-identity-partitions-v1';
const LEGACY_KEYS = ['savor-diary-v1', 'savor-draft-v1'];
const config = require('./runtimeConfig');
const {createChunkStorage} = require('./chunkStorage');
const clone = value => JSON.parse(JSON.stringify(value));
function fail(code) { throw Object.assign(new Error(code), {code}); }
function namespacePrefix(namespace) { return 'savor-identity-v2:' + encodeURIComponent(namespace); }
// The storage boundary's own missing contract: a key that was never written, or was cleared, reads
// back as '' | null | undefined (the same predicate chunkStorage applies on every read). Anything
// else is a present value, even when it is not the value this build writes.
function absent(value) { return value === '' || value === null || value === undefined; }
function partitionKey(userId, namespace=config.storageNamespace) { return namespacePrefix(namespace)+':'+userId; }
function createPartitions(storage, options={}) {
  const namespace=options.namespace || config.storageNamespace;
  const legacyNamespace=options.legacyNamespace || config.legacyNamespace;
  if(typeof namespace!=='string' || !namespace.length || namespace.length>200) fail('CACHE_UNSUPPORTED');
  const blobs=createChunkStorage(storage),prefix=namespacePrefix(namespace);
  let session=null,generation=0;
  function legacy() {
    if(namespace!==legacyNamespace) return null;
    const raw=storage.getStorageSync(KEY);
    if(raw==='' || raw===undefined || raw===null) return null;
    let value;try { value=typeof raw==='string'?JSON.parse(raw):clone(raw); } catch(_){fail('CACHE_CORRUPT');}
    if(!value || value.formatVersion!==1 || !value.partitions || typeof value.partitions!=='object' || Array.isArray(value.partitions) || !value.legacyQuarantine || typeof value.legacyQuarantine!=='object' || Array.isArray(value.legacyQuarantine)) fail('CACHE_UNSUPPORTED');
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
  function readPartition(userId) {
    const value=blobs.read(partitionKey(userId,namespace));if(!value)return null;
    if(value.formatVersion!==2 || value.kind!=='partition' || value.namespace!==namespace || value.userId!==userId || !value.partition) fail('CACHE_CORRUPT');
    const p=value.partition;
    if(!Array.isArray(p.outbox))fail('CACHE_CORRUPT');
    if(p.diary) p.diary.outbox=clone(p.outbox);
    validate(p,userId);return p;
  }
  function persist(userId,partition) {
    validate(partition,userId);
    const p=clone(partition);if(p.diary)delete p.diary.outbox; // single durable queue copy
    blobs.write(partitionKey(userId,namespace),{formatVersion:2,kind:'partition',namespace,userId,partition:p});
  }
  function ensureQuarantine(old) {
    const key=prefix+':quarantine',saved=blobs.read(key);
    if(saved) {
      if(saved.kind!=='quarantine' || saved.namespace!==namespace || !saved.raw || typeof saved.raw!=='object' || Array.isArray(saved.raw))fail('CACHE_UNSUPPORTED');
      return saved.raw;
    }
    const raw=old?clone(old.legacyQuarantine):{};
    if(!old && namespace===legacyNamespace) LEGACY_KEYS.forEach(k=>{const v=storage.getStorageSync(k);if(v!==''&&v!==undefined&&v!==null)raw[k]=v;});
    blobs.write(key,{kind:'quarantine',namespace,raw});return raw;
  }
  function invalidate(){session=null;generation++;}
  function beginVerification(){invalidate();return generation;}
  function accept(ticket,result){
    if(ticket!==generation)fail('STALE_IDENTITY');
    if(!result || result.success!==true || result.protocolVersion!==1 || !/^u_[a-f0-9]{48}$/.test(result.userId))fail('IDENTITY_INVALID');
    const establishedKey=partitionKey(result.userId,namespace)+':established';
    let partition=readPartition(result.userId);
    if(!partition && !absent(storage.getStorageSync(establishedKey)))fail('CACHE_MISSING');
    if(!partition){
      const old=legacy();ensureQuarantine(old);
      partition=old && Object.prototype.hasOwnProperty.call(old.partitions,result.userId)?clone(old.partitions[result.userId]):{diary:null,draft:null,outbox:[]};
      persist(result.userId,partition);
    } else {
      if(!blobs.read(prefix+':quarantine')){
        // Partitions written before the quarantine/established scheme existed are valid but carry no
        // quarantine blob, so a missing quarantine alone is not evidence of loss. That historical
        // shape is confirmed by the ABSENCE of the established marker, never by "a value other than
        // '2'": once any marker is on record the scheme was already in force, so a lost quarantine is
        // evidence of loss and the partition stays fail-closed.
        if(!absent(storage.getStorageSync(establishedKey)))fail('CACHE_MISSING');
      }
      ensureQuarantine(null);
    }
    validate(partition,result.userId);
    if(storage.getStorageSync(establishedKey)!=='2')storage.setStorageSync(establishedKey,'2');
    session={userId:result.userId,generation,namespace};return lease();
  }
  function lease(){if(!session)fail('IDENTITY_LOCKED');return {...session};}
  function assertLease(token){if(!session || !token || token.generation!==generation || token.userId!==session.userId || token.namespace!==namespace)fail('STALE_IDENTITY');}
  function get(token){assertLease(token);const p=readPartition(token.userId);if(!p)fail('CACHE_MISSING');return clone(p);}
  function save(token,partition){assertLease(token);if(!partition || !Array.isArray(partition.outbox) || partition.outbox.some(op=>!op || op.actorUserId!==token.userId))fail('OUTBOX_IDENTITY_MISMATCH');if(!readPartition(token.userId))fail('CACHE_MISSING');persist(token.userId,partition);}
  function quarantine(){lease();return clone(ensureQuarantine(null));}
  return {beginVerification,accept,invalidate,lease,assertLease,get,save,quarantine};
}
module.exports={KEY,createPartitions,partitionKey,namespacePrefix};
