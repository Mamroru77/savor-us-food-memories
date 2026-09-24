const assert = require('node:assert/strict');
const { createHandler } = require('../cloudfunctions/account/handler');
const { createPartitions, partitionKey, namespacePrefix, KEY } = require('../miniprogram/utils/identityPartitions');
const config = require('../miniprogram/utils/runtimeConfig');

// ---- historical partition compatibility fixtures (device evidence 2026-09-23) ----------------
// A real device held a valid V2 partition whose quarantine blob and established marker were both
// absent. accept() called fail('CACHE_MISSING') before it could rebuild the quarantine, so the
// device was blocked permanently. These fixtures reproduce that exact storage shape.
let repairChecks = 0;
// Default: strict (a failing case aborts the run). IDENTITY_REPAIR_MATRIX=1 records every case
// instead, which is how the RED matrix and the fail-closed preservation matrix are captured.
const repairMatrix = process.env.IDENTITY_REPAIR_MATRIX === '1' ? [] : null;
function test(name, fn) {
  if (repairMatrix) {
    try { fn(); repairChecks++; repairMatrix.push({ name, result: 'PASS' }); console.log('PASS ' + name); }
    catch (e) { repairMatrix.push({ name, result: 'RED', code: (e && e.code) || null }); console.log('RED  ' + name + ' -> ' + ((e && e.code) || e)); }
    return;
  }
  fn(); repairChecks++; console.log('PASS ' + name);
}
function deviceDisk(seed) {
  const d = Object.assign({}, seed || {});
  return {
    d,
    storage: {
      getStorageSync: (key) => (d[key] === undefined ? '' : d[key]),
      setStorageSync: (key, value) => { d[key] = value; },
      removeStorageSync: (key) => { delete d[key]; },
    },
  };
}
function checksum(text) { let hash = 2166136261; for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619); return (hash >>> 0).toString(16); }
function buildHistoricalPartition(userId, content, seed) {
  const env = deviceDisk(seed);
  let cache = createPartitions(env.storage);
  const token = cache.accept(cache.beginVerification(), { success: true, protocolVersion: 1, userId });
  cache.save(token, content);
  const pKey = partitionKey(userId);
  const qKey = namespacePrefix(config.storageNamespace) + ':quarantine';
  const eKey = pKey + ':established';
  const qManifest = JSON.parse(env.d[qKey]);
  delete env.d[qKey];
  for (let i = 0; i < qManifest.count; i++) delete env.d[qKey + ':chunk:' + qManifest.id + ':' + i];
  delete env.d[eKey];
  return { d: env.d, storage: env.storage, pKey, qKey, eKey, manifestId: JSON.parse(env.d[pKey]).id };
}
function identityResult(userId) { return { success: true, protocolVersion: 1, userId }; }

async function main() {
  let owner = 'A', records = new Map();
  const handler = createHandler({ context:() => ({ OPENID:owner, APPID:'app' }), repository:{ find:async key => records.get(key), insert:async row => { if(records.has(row._id)) throw Error('duplicate'); records.set(row._id,row); } } });
  const request = { action:'bootstrap', protocolVersion:1, userId:'spoof', OPENID:'spoof' };
  const [a, a2] = await Promise.all([handler(request), handler(request)]);
  assert.equal(a.userId,a2.userId); assert(!JSON.stringify(a).includes('spoof')); assert(!('OPENID' in a));
  owner='B'; const b=await handler(request); assert.notEqual(a.userId,b.userId);
  owner=''; assert.equal((await handler(request)).code,'IDENTITY_UNAVAILABLE');
  assert.equal((await handler({action:'bootstrap',protocolVersion:2})).code,'UNSUPPORTED_PROTOCOL');
  const disk = { 'savor-diary-v1':'{"outbox":[{"id":"legacy"}]}', 'savor-draft-v1':'raw-draft' };
  const storage = { getStorageSync:key => disk[key], setStorageSync:(key,value) => { disk[key]=value; }, removeStorageSync:key=>{delete disk[key];} };
  let cache=createPartitions(storage); assert.throws(()=>cache.lease(),/IDENTITY_LOCKED/);
  const expired=cache.beginVerification(), ticket=cache.beginVerification(); assert.throws(()=>cache.accept(expired,a),/STALE_IDENTITY/);
  const ta=cache.accept(ticket,a); assert.deepEqual(cache.get(ta).outbox,[]);
  cache.save(ta,{ diary:{private:'A',outbox:[{actorUserId:a.userId,id:'op-a'}]},draft:{actorUserId:a.userId,text:'A'},outbox:[{actorUserId:a.userId,id:'op-a'}] });
  const tb=cache.accept(cache.beginVerification(),b); assert.equal(cache.get(tb).diary,null);
  assert.throws(()=>cache.save(ta,{outbox:[]}),/STALE_IDENTITY/);
  assert.throws(()=>cache.save(tb,{outbox:[{actorUserId:a.userId}]}),/OUTBOX_IDENTITY_MISMATCH/);
  const ta2=cache.accept(cache.beginVerification(),a); assert.equal(cache.get(ta2).draft.text,'A');
  assert.equal(cache.quarantine()['savor-draft-v1'],'raw-draft');
  cache=createPartitions(storage); assert.throws(()=>cache.lease(),/IDENTITY_LOCKED/);
  assert.equal(disk['savor-draft-v1'],'raw-draft');
  const before=disk[KEY];
  const broken=createPartitions({ getStorageSync:storage.getStorageSync, setStorageSync:()=>{throw Error('quota');} });
  const c={...a,userId:'u_'+'c'.repeat(48)};
  assert.throws(()=>broken.accept(broken.beginVerification(),c),/CACHE_WRITE_FAILED/); assert.equal(disk[KEY],before); assert.throws(()=>broken.lease(),/IDENTITY_LOCKED/);
  disk[KEY]='invalid'; assert.throws(()=>cache.accept(cache.beginVerification(),{...a,userId:'u_'+'d'.repeat(48)}),/CACHE_CORRUPT/); assert.equal(disk[KEY],'invalid');

  // ==== historical partition compatibility =====================================================
  // CASE A: a valid V2 partition written before the quarantine/established scheme existed. It must be
  // repaired exactly once, additively, with every pre-existing byte and every payload field intact.
  test('historical V2 partition without quarantine or established is repaired once, additively', () => {
    const userId = 'u_' + '1'.repeat(48);
    const content = {
      diary: { private: 'HISTORIC', outbox: [{ actorUserId: userId, id: 'op-h' }] },
      draft: { actorUserId: userId, text: 'draft-h' },
      outbox: [{ actorUserId: userId, id: 'op-h' }],
      workspaceDraft: { actorUserId: userId, feedbackMessage: 'wd-h' },
      workspaceIntent: { actorUserId: userId, spaceId: 's-h' },
      mediaIntent: { actorUserId: userId, kind: 'photo' },
      spaceIntent: { actorUserId: userId, kind: 'space' },
      futureUnknownField: { keep: 'me' },
    };
    const h = buildHistoricalPartition(userId, content);
    const historical = JSON.parse(JSON.stringify(h.d));
    const cache = createPartitions(h.storage);
    const token = cache.accept(cache.beginVerification(), identityResult(userId));

    // 1. no pre-existing key may change or disappear
    for (const key of Object.keys(historical)) assert.equal(h.d[key], historical[key], 'pre-existing key was modified: ' + key);
    // 2. the repair is strictly additive: quarantine manifest + its chunks + established='2'
    const added = Object.keys(h.d).filter((key) => !(key in historical));
    assert(added.includes(h.qKey), 'quarantine manifest was not created');
    assert(added.includes(h.eKey), 'established marker was not written');
    assert.equal(h.d[h.eKey], '2');
    for (const key of added) assert(key === h.qKey || key.startsWith(h.qKey + ':chunk:') || key === h.eKey, 'unexpected new key: ' + key);
    // 3. every payload field survived
    const restored = cache.get(token);
    assert.equal(restored.diary.private, 'HISTORIC');
    assert.deepEqual(restored.outbox, content.outbox);
    assert.deepEqual(restored.diary.outbox, content.outbox);
    assert.equal(restored.draft.text, 'draft-h');
    assert.deepEqual(restored.workspaceDraft, content.workspaceDraft);
    assert.deepEqual(restored.workspaceIntent, content.workspaceIntent);
    assert.deepEqual(restored.mediaIntent, content.mediaIntent);
    assert.deepEqual(restored.spaceIntent, content.spaceIntent);
    assert.deepEqual(restored.futureUnknownField, content.futureUnknownField);
    // 4. never rewritten into a fresh empty partition
    assert.notDeepEqual(restored, { diary: null, draft: null, outbox: [] });
  });

  // CASE B: the partition already carries established='2', so losing the quarantine IS evidence of loss.
  test('an established partition that lost its quarantine stays fail-closed', () => {
    const userId = 'u_' + '2'.repeat(48);
    const h = buildHistoricalPartition(userId, { diary: null, draft: null, outbox: [] });
    h.d[h.eKey] = '2';
    const cache = createPartitions(h.storage);
    assert.throws(() => cache.accept(cache.beginVerification(), identityResult(userId)), /CACHE_MISSING/);
    assert.throws(() => cache.lease(), /IDENTITY_LOCKED/);
    assert(!(h.qKey in h.d), 'quarantine must not be rebuilt for an established partition');
  });

  // CASE C: partition gone but the established marker survives.
  test('a missing partition with an established marker stays fail-closed', () => {
    const userId = 'u_' + '3'.repeat(48);
    const env = deviceDisk();
    env.d[partitionKey(userId) + ':established'] = '2';
    const cache = createPartitions(env.storage);
    assert.throws(() => cache.accept(cache.beginVerification(), identityResult(userId)), /CACHE_MISSING/);
    assert.throws(() => cache.lease(), /IDENTITY_LOCKED/);
  });

  // CASE D: malformed / corrupt / foreign-owner partitions must never enter the repair branch.
  test('a malformed, corrupt or foreign-owner partition never enters historical repair', () => {
    const userId = 'u_' + '4'.repeat(48);
    // (a) chunk payload tampered -> integrity mismatch
    const h1 = buildHistoricalPartition(userId, { diary: null, draft: null, outbox: [] });
    h1.d[h1.pKey + ':chunk:' + h1.manifestId + ':0'] = 'tampered';
    let cache = createPartitions(h1.storage);
    assert.throws(() => cache.accept(cache.beginVerification(), identityResult(userId)), /CACHE_CORRUPT/);
    assert(!(h1.eKey in h1.d) && !(h1.qKey in h1.d), 'a corrupt partition must not be repaired');

    // (b) unsupported descriptor format version
    const h2 = buildHistoricalPartition('u_' + '5'.repeat(48), { diary: null, draft: null, outbox: [] });
    const d2 = JSON.parse(h2.d[h2.pKey]); d2.formatVersion = 1; h2.d[h2.pKey] = JSON.stringify(d2);
    cache = createPartitions(h2.storage);
    assert.throws(() => cache.accept(cache.beginVerification(), identityResult('u_' + '5'.repeat(48))), /CACHE_UNSUPPORTED/);

    // (c) well-formed envelope whose owner is not the key owner
    const owner = 'u_' + '6'.repeat(48), other = 'u_' + '7'.repeat(48);
    const h3 = buildHistoricalPartition(owner, { diary: null, draft: null, outbox: [] });
    const cKey = h3.pKey + ':chunk:' + h3.manifestId + ':0';
    const env3 = JSON.parse(h3.d[cKey]); env3.userId = other;
    const text3 = JSON.stringify(env3);
    h3.d[cKey] = text3;
    const desc3 = JSON.parse(h3.d[h3.pKey]); desc3.length = text3.length; desc3.checksum = checksum(text3);
    h3.d[h3.pKey] = JSON.stringify(desc3);
    cache = createPartitions(h3.storage);
    assert.throws(() => cache.accept(cache.beginVerification(), identityResult(owner)), /CACHE_CORRUPT/);
    assert(!(h3.eKey in h3.d), 'a foreign-owner partition must not be repaired');
  });

  // CASE A + legacy: rebuilding the quarantine must keep the legacy recovery contract and the keys.
  test('historical repair keeps the legacy recovery contract without deleting legacy keys', () => {
    const userId = 'u_' + '8'.repeat(48);
    const legacyDiary = '{"outbox":[{"id":"legacy"}]}';
    const h = buildHistoricalPartition(userId, { diary: null, draft: null, outbox: [] }, { 'savor-diary-v1': legacyDiary, 'savor-draft-v1': 'raw-draft' });
    const cache = createPartitions(h.storage);
    assert(cache.accept(cache.beginVerification(), identityResult(userId)));
    assert.equal(h.d['savor-diary-v1'], legacyDiary, 'legacy diary key must survive the repair');
    assert.equal(h.d['savor-draft-v1'], 'raw-draft', 'legacy draft key must survive the repair');
    assert.equal(cache.quarantine()['savor-diary-v1'], legacyDiary);
    assert.equal(cache.quarantine()['savor-draft-v1'], 'raw-draft');
  });

  // A repair that cannot write the quarantine must leave everything untouched and stay retryable.
  test('a quarantine write failure leaves the partition untouched, unwritten established, retryable', () => {
    const userId = 'u_' + '9'.repeat(48);
    const h = buildHistoricalPartition(userId, { diary: { private: 'KEEP', outbox: [] }, draft: null, outbox: [] });
    const historical = JSON.parse(JSON.stringify(h.d));
    let failWrites = true;
    const flaky = {
      getStorageSync: h.storage.getStorageSync,
      setStorageSync: (key, value) => { if (failWrites) throw Error('quota'); h.storage.setStorageSync(key, value); },
      removeStorageSync: h.storage.removeStorageSync,
    };
    let cache = createPartitions(flaky);
    assert.throws(() => cache.accept(cache.beginVerification(), identityResult(userId)), /CACHE_WRITE_FAILED/);
    assert.throws(() => cache.lease(), /IDENTITY_LOCKED/);
    assert(!(h.eKey in h.d), 'established must not be written when the repair fails');
    for (const key of Object.keys(historical)) assert.equal(h.d[key], historical[key], 'key changed after a failed repair: ' + key);
    failWrites = false;
    cache = createPartitions(flaky);
    const token = cache.accept(cache.beginVerification(), identityResult(userId));
    assert.equal(cache.get(token).diary.private, 'KEEP');
    assert.equal(h.d[h.eKey], '2');
  });

  // The repair must happen once; a later verification reads the partition and changes nothing.
  test('the historical repair is idempotent', () => {
    const userId = 'u_' + '0'.repeat(48);
    const h = buildHistoricalPartition(userId, { diary: { private: 'ONCE', outbox: [] }, draft: null, outbox: [] });
    let cache = createPartitions(h.storage);
    cache.accept(cache.beginVerification(), identityResult(userId));
    const afterRepair = JSON.parse(JSON.stringify(h.d));
    cache = createPartitions(h.storage);
    const token = cache.accept(cache.beginVerification(), identityResult(userId));
    assert.equal(cache.get(token).diary.private, 'ONCE');
    assert.deepEqual(h.d, afterRepair, 'a second accept must not migrate or rewrite storage');
  });

  // CASE E: the historical form is defined by the ABSENCE of the established marker, never by "any
  // value other than '2'". A marker that is present with an unexpected value can only come from an
  // unknown build, so it must stay fail-closed exactly like established='2': no quarantine rebuilt,
  // no established written, no byte of the partition touched and the lease still locked.
  test('a present but unexpected established marker never enters historical repair', () => {
    const userId = 'u_' + 'b'.repeat(48);
    const markers = ['1', 'true', 'yes', '02', '2 ', ' 2', 'null', 'undefined', '{}', 0, false, 1, true, {}, ['2']];
    markers.forEach((marker) => {
      const h = buildHistoricalPartition(userId, { diary: { private: 'KEEP', outbox: [] }, draft: null, outbox: [] });
      h.d[h.eKey] = marker;
      const before = JSON.parse(JSON.stringify(h.d));
      const cache = createPartitions(h.storage);
      const label = 'marker ' + JSON.stringify(marker);
      assert.throws(() => cache.accept(cache.beginVerification(), identityResult(userId)), /CACHE_MISSING/, label + ' must stay fail-closed');
      assert.throws(() => cache.lease(), /IDENTITY_LOCKED/, label + ' must leave the lease locked');
      assert(!(h.qKey in h.d), label + ' must not rebuild the quarantine');
      assert.equal(h.d[h.eKey], marker, label + ' must not be overwritten');
      assert.deepEqual(h.d, before, label + ' must not change the partition');
    });
  });

  // CASE F: "missing" is the storage boundary's own contract -- '' | null | undefined (the same
  // predicate chunkStorage uses for every read). Each form, plus a key that was never written, is a
  // confirmed-absent marker and must still allow the one-shot historical repair.
  test('every form of the storage missing contract still allows the one-shot historical repair', () => {
    const userId = 'u_' + 'c'.repeat(48);
    [undefined, null, ''].forEach((form) => {
      const h = buildHistoricalPartition(userId, { diary: { private: 'KEEP', outbox: [] }, draft: null, outbox: [] });
      if (form !== undefined) h.d[h.eKey] = form;
      // Raw boundary: unlike deviceDisk, null/undefined are not folded into '' here, so the
      // production predicate is exercised against all three forms of the real contract.
      const raw = {
        getStorageSync: (key) => h.d[key],
        setStorageSync: (key, value) => { h.d[key] = value; },
        removeStorageSync: (key) => { delete h.d[key]; },
      };
      const cache = createPartitions(raw);
      const token = cache.accept(cache.beginVerification(), identityResult(userId));
      const label = 'marker ' + String(form);
      assert.equal(cache.get(token).diary.private, 'KEEP', label + ' must preserve the partition');
      assert(h.qKey in h.d, label + ' must rebuild the quarantine');
      assert.equal(h.d[h.eKey], '2', label + ' must write the established marker');
    });
  });

  // CASE C: a partition that is gone must fail closed whenever ANY marker is on record. The previous
  // truthy check treated 0 / false as "no marker", so those shapes slipped into the fresh-partition
  // path. Marker presence is the storage existence contract (absent = '' | null | undefined), so a
  // present-but-falsy or unexpected marker must behave exactly like established='2'.
  test('a missing partition with a present but falsy or unexpected marker stays fail-closed', () => {
    const userId = 'u_' + 'd'.repeat(48);
    const eKey = partitionKey(userId) + ':established';
    const qKey = namespacePrefix(config.storageNamespace) + ':quarantine';
    const markers = [0, false, '0', 'false', 'no', 'unexpected', 1, true, '1', '2 ', {}, []];
    markers.forEach((marker) => {
      const env = deviceDisk();
      env.d[eKey] = marker;
      const before = JSON.parse(JSON.stringify(env.d));
      const cache = createPartitions(env.storage);
      const label = 'marker ' + JSON.stringify(marker);
      assert.throws(() => cache.accept(cache.beginVerification(), identityResult(userId)), /CACHE_MISSING/, label + ' must stay fail-closed');
      assert.throws(() => cache.lease(), /IDENTITY_LOCKED/, label + ' must leave the lease locked');
      assert(!(partitionKey(userId) in env.d), label + ' must not create a fresh partition');
      assert(!(qKey in env.d), label + ' must not create a quarantine');
      assert.equal(env.d[eKey], marker, label + ' must not change the marker');
      assert.deepEqual(env.d, before, label + ' must not write anything to disk');
    });
  });

  // CASE C positive: a truly absent marker keeps the documented first-initialization behaviour.
  test('a missing partition with a truly absent marker still initialises a fresh partition', () => {
    const userId = 'u_' + 'e'.repeat(48);
    const eKey = partitionKey(userId) + ':established';
    [undefined, null, ''].forEach((form) => {
      const env = deviceDisk();
      if (form !== undefined) env.d[eKey] = form;
      // Raw boundary: null/undefined are not folded into '' here, so all three forms of the real
      // storage missing contract reach the production predicate unchanged.
      const raw = {
        getStorageSync: (key) => env.d[key],
        setStorageSync: (key, value) => { env.d[key] = value; },
        removeStorageSync: (key) => { delete env.d[key]; },
      };
      const cache = createPartitions(raw);
      const token = cache.accept(cache.beginVerification(), identityResult(userId));
      const label = 'marker ' + String(form);
      assert.deepEqual(cache.get(token), { diary: null, draft: null, outbox: [] }, label + ' must create the documented fresh partition');
      assert.equal(env.d[eKey], '2', label + ' must write the established marker');
    });
  });

  console.log('PASS S1 foundation: server identity, concurrent bootstrap, spoofed identity ignored, A/B isolation, stale leases, cold-start lock, legacy preservation, quota/corruption fail-closed. Foundation tests only; real runtime tests are in verify-identity-runtime.cjs. Device acceptance NOT_EXECUTED.');
  console.log(repairChecks + ' historical-partition repair checks passed (repair is additive and one-shot and is only reached when the established marker is confirmed absent; a missing partition fails closed for every present marker, whatever its value, and only a truly absent marker may initialise a fresh partition; corrupt partitions stay fail-closed).');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
