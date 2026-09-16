// Recovery never claims an unknown operation. Probes are owner-scoped reads.
const identity=require('./identity');
function parse(raw){try{return typeof raw==='string'?JSON.parse(raw):raw||{};}catch(e){return {};}}
function rawBackup(){return {formatVersion:1,kind:'savor-legacy-quarantine',exportedAt:new Date().toISOString(),raw:identity.quarantine()};}
async function inspect(){
  const token=identity.lease(),raw=identity.quarantine(),diary=parse(raw['savor-diary-v1']),draft=parse(raw['savor-draft-v1']);
  const cloud=require('./cloudRecords'),results=[];
  for(const op of (Array.isArray(diary.outbox)?diary.outbox:[])){
    identity.assertLease(token);
    let status='unresolved';
    try {if(op&&op.recordId){await cloud.getRecord(op.recordId);identity.assertLease(token);status=await cloud.confirmOperation(op.recordId,op.id)?'confirmed':'owned-needs-review';}}
    catch(e){identity.assertLease(token);if(e.code!=='NOT_FOUND')throw e;}
    results.push({kind:'edit',status});
  }
  if(draft.cloudAttempt&&draft.cloudAttempt.id){
    let status='unresolved';
    try{const m=await cloud.requestResult(draft.cloudAttempt.id);identity.assertLease(token);status=m.deleted?'confirmed-deleted':'confirmed';}
    catch(e){identity.assertLease(token);if(e.code!=='NOT_FOUND')throw e;}
    results.push({kind:'create',status});
  }
  identity.assertLease(token);return results;
}
// Explicit copy produces a new private LOCAL record without remote identifiers,
// private media, votes or operation IDs. Original unknown data remains intact.
function copyLocalMemories(){const raw=identity.quarantine(),diary=parse(raw['savor-diary-v1']);const data=require('./data');return require('./store').importMemories((Array.isArray(diary.memories)?diary.memories:[]).filter(data.isMemory));}
function copyDraft(){
  const token=identity.lease(),raw=identity.quarantine(),old=parse(raw['savor-draft-v1']),store=require('./store');
  const current=store.loadDraft();
  if(current.restaurant||current.photos.length||current.cloudAttempt||current.editOperationId)throw new Error('当前草稿非空，请先保存或导出。');
  const draft=store.freshDraft();
  ['restaurant','notes','city','country','cuisine','perCapita','dishes'].forEach(key=>{if(typeof old[key]==='string')draft[key]=old[key];});
  if(require('./data').isValidDate(old.date))draft.date=old.date;
  if(Number.isInteger(old.rating)&&old.rating>=0&&old.rating<=5)draft.rating=old.rating;
  if(Array.isArray(old.tags))draft.tags=old.tags.filter(x=>typeof x==='string');
  // Location must be explicitly selected again; no photo or retry identity transfer.
  identity.assertLease(token);if(!store.saveDraft(draft))throw new Error('草稿未能保存，原数据仍保留。');return true;
}
function copyProfile(){const raw=identity.quarantine(),old=parse(raw['savor-diary-v1']).profile||{};const changes={};if(typeof old.name==='string')changes.name=old.name.trim().slice(0,32);if(typeof old.bio==='string')changes.bio=old.bio.trim().slice(0,55);if(!changes.name)throw new Error('旧备份中没有可复制的昵称。');require('./store').updateProfile(changes);return true;}
module.exports={copyProfile,rawBackup,inspect,copyLocalMemories,copyDraft};
