const RESOLVABLE=['CONFLICT','DELETED','NOT_FOUND','INVALID_LOCAL_STATE','INVALID_DATE','INVALID_RATING','INVALID_PHOTOS','INVALID_COORDINATES','INVALID_LOCATION','INVALID_PER_CAPITA','INVALID_FLAG','INVALID_ID','INVALID_OPERATION_ID','RESTAURANT_REQUIRED'];
const EDITABLE=['importAddressHint','importAreaText','platformRating','platformAveragePriceCny','diningTypes','sourceCategory','categorySource','tencentPoiId','diningMode','sourcePlatform','sourceUrl','restaurant','notes','date','city','country','neighborhood','cuisine','perCapita','dishes','tags','photo','extraPhotos','noPhoto','placePhoto','coordinates','address','locationName','locationSource','coordinateSystem','geoConfirmed','geoSource','rating','ratingSource','locationUnknown'];

function canResolve(code){return RESOLVABLE.includes(code);}
function overlay(memory,operations){let result=Object.assign({},memory);delete result.localChanges;operations.filter(operation=>operation.recordId===memory.id).forEach(operation=>{if(operation.kind==='flags')['saved','liked','shared'].forEach(key=>{if(operation.patch&&typeof operation.patch[key]==='boolean')result[key]=operation.patch[key];});if(operation.kind==='update'&&operation.memory)EDITABLE.forEach(key=>{if(Object.prototype.hasOwnProperty.call(operation.memory,key))result[key]=operation.memory[key];});if(operation.kind==='delete')result.pendingDelete=true;});return result;}
// A cloud tombstone retires the cloud copy, never unsynced local work. Two
// independent durable channels hold work the cloud has not accepted yet: the
// queued operation, and the edit draft the user is still writing. `editedIds`
// is that draft, resolved from storage by the caller (never from page state, so
// a cold start protects exactly what the running editor does). While either
// channel exists this device holds the only copy and the user has not decided
// yet, so the record survives every merge.
function mergeCloud(local,remote,hiddenIds,outbox,editedIds){const held=editedIds||[];const byId=Object.create(null);local.forEach(memory=>{byId[memory.id]=memory;});(remote.deletedIds||[]).forEach(id=>{if(held.includes(id))return;if(!outbox.some(operation=>operation.recordId===id))delete byId[id];});remote.forEach(memory=>{if(hiddenIds.includes(memory.id))return;const old=byId[memory.id];if(old&&(old.revision||0)>(memory.revision||0))return;const merged=overlay(Object.assign({},memory,old&&old.localChanges),outbox.filter(operation=>operation.recordId===memory.id));if(merged.pendingDelete)delete byId[memory.id];else byId[memory.id]=merged;});const all=Object.keys(byId).map(id=>byId[id]);return all.filter(memory=>memory.cloudId).sort((a,b)=>b.date.localeCompare(a.date)||b.id.localeCompare(a.id)).concat(all.filter(memory=>!memory.cloudId));}

module.exports={canResolve,overlay,mergeCloud};
