const cloud = require('wx-server-sdk');
const crypto = require('crypto');
const { normalizeRecord, normalizeLocation } = require('./schema');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const COLLECTION = 'dining_records';
let ready;
function ensureCollection() {
  if (!ready) ready = db.createCollection(COLLECTION).catch(err => {
    if (!/exist|已存在/i.test(String(err.errMsg || err.message))) { ready = null; throw err; }
  });
  return ready;
}
async function findById(id, openid) {
  const result = await db.collection(COLLECTION).where({ _id: id, createdBy: openid }).get();
  return result.data[0];
}
async function addRecord(event, openid) {
  const input = event.data || {};
  const key = event.requestId;
  if (key !== undefined && (typeof key !== 'string' || !/^[A-Za-z0-9_-]{8,100}$/.test(key))) {
    return { success: false, code: 'INVALID_REQUEST_ID' };
  }
  // Stable owner-scoped primary key makes concurrent retries and lost replies safe.
  const id = key ? crypto.createHash('sha256').update(openid + ':' + key).digest('hex').slice(0, 32) : null;
  if (id) {
    const previous = await findById(id, openid);
    if (previous) return { success: true, id, record: previous };
  }
  const record = normalizeRecord(input, openid);
  record.revision = 1;
  record.createdAt = db.serverDate();
  record.updatedAt = db.serverDate();
  if (id) record._id = id;
  try {
    const result = await db.collection(COLLECTION).add({ data: record });
    return { success: true, id: result._id, record: Object.assign({}, record, { _id: result._id }) };
  } catch (err) {
    // A competing retry may have won; never overwrite an existing meal.
    const previous = id && await findById(id, openid);
    if (previous) return { success: true, id, record: previous };
    throw err;
  }
}
async function listRecords(event, openid) {
  if (!event.paginated) {
    const result = await db.collection(COLLECTION).where({ createdBy: openid }).orderBy('date', 'desc').limit(50).get();
    return { success: true, data: result.data || [] };
  }
  const cursor = event.cursor;
  if (cursor !== undefined && (typeof cursor !== 'string' || cursor.length > 128)) return { success: false, code: 'INVALID_CURSOR' };
  const where = { createdBy: openid };
  if (cursor) where._id = db.command.gt(cursor);
  const result = await db.collection(COLLECTION).where(where).orderBy('_id', 'asc').limit(50).get();
  const data = result.data || [];
  return { success: true, data, nextCursor: data.length === 50 ? data[data.length - 1]._id : '' };
}
// The current record revision is not necessarily the revision this operation
// wrote: another device may have edited it after a lost response.
function mutationResult(record, operationId) {
  const receipt=(record.operationReceipts||[]).find(item=>item.id===operationId);
  return {success:true,record,operationId,operationRevision:receipt && Number.isInteger(receipt.revision)?receipt.revision:null};
}
// Owner-only optimistic concurrency. Retried operation IDs never apply twice.
async function mutate(event, openid) {
  if (typeof event.id!=='string' || !/^[A-Za-z0-9_-]{1,128}$/.test(event.id)) return {success:false,code:'INVALID_ID'};
  if (typeof event.operationId!=='string' || !/^[A-Za-z0-9_-]{8,100}$/.test(event.operationId)) return {success:false,code:'INVALID_OPERATION_ID'};
  const old=await findById(event.id,openid);
  if (!old) return {success:false,code:'NOT_FOUND',message:'Record not found or not owned by you.'};
  if ((old.operationIds||[]).includes(event.operationId)) return mutationResult(old,event.operationId);
  if (old.deleted) return {success:false,code:'DELETED',message:'This record was deleted.'};
  if (!Number.isInteger(event.revision) || event.revision!==(old.revision||0)) return {success:false,code:'CONFLICT',message:'The cloud record changed. Review the conflict before retrying.'};
  let changes={};
  if (event.action==='delete') changes={deleted:true,deletedAt:db.serverDate()};
  else if (event.action==='flags') {
    const input=event.data || {};
    for (const key of ['saved','liked','shared']) if (Object.prototype.hasOwnProperty.call(input,key)) {
      if(typeof input[key]!=='boolean') throw new Error('INVALID_FLAG'); changes[key]=input[key];
    }
    if (!Object.keys(changes).length) throw new Error('INVALID_FLAG');
  } else {
    const allowed=['importAddressHint','importAreaText','platformRating','platformAveragePriceCny','diningTypes','sourceCategory','categorySource','tencentPoiId','diningMode','sourcePlatform','sourceUrl','restaurantName','note','date','city','country','neighborhood','cuisine','perCapita','dishes','tags','photos','placePhoto','coordinates','address','locationName','locationSource','coordinateSystem','geoConfirmed','geoSource','rating'];
    const input=Object.assign({},old);
    for(const key of allowed) if(Object.prototype.hasOwnProperty.call(event.data||{},key)) input[key]=event.data[key];
    const clearRating=input.rating===null;
    if(clearRating) delete input.rating;
    const clean=normalizeRecord(input,openid);
    for(const key of allowed) if(clean[key]!==undefined) changes[key]=clean[key];
    if(clearRating) changes.rating=db.command.remove();
  }
  changes.schemaVersion=3;
  changes.revision=(old.revision||0)+1;
  changes.operationIds=(old.operationIds||[]).concat(event.operationId).slice(-32);
  changes.operationReceipts=(old.operationReceipts||[]).filter(item=>item.id!==event.operationId).concat({id:event.operationId,revision:changes.revision}).slice(-32);
  changes.updatedAt=db.serverDate();
  const condition={_id:event.id,createdBy:openid,revision:old.revision===undefined?db.command.exists(false):old.revision};
  const result=await db.collection(COLLECTION).where(condition).update({data:changes});
  const current=await findById(event.id,openid);
  if(!current) return {success:false,code:'NOT_FOUND',message:'Record not found or not owned by you.'};
  if (!result.stats.updated && !(current.operationIds||[]).includes(event.operationId)) return {success:false,code:'CONFLICT',message:'The cloud record changed. Review the conflict before retrying.'};
  return mutationResult(current,event.operationId);
}
exports.main = async (event = {}) => {
  const openid = cloud.getWXContext().OPENID;
  if (!openid) return { success: false, code: 'UNAUTHENTICATED' };
  try {
    await ensureCollection();
    if (['update','flags','delete'].includes(event.action)) return await mutate(event,openid);
    if (event.action==='get') { const record=typeof event.id==='string' ? await findById(event.id,openid) : null; return record ? {success:true,record} : {success:false,code:'NOT_FOUND'}; }
    if (event.action === 'setLocation') {
      if (typeof event.id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(event.id)) return { success: false, code: 'INVALID_ID' };
      const record = await findById(event.id, openid);
      if (!record) return { success: false, code: 'NOT_FOUND', message: '记录不存在或无权修改。' };
      const location = normalizeLocation(event.data || {});
      if(record.deleted) return {success:false,code:'DELETED'};
      const changes = Object.assign({}, location, { revision:(record.revision||0)+1, updatedAt: db.serverDate() });
      const write=await db.collection(COLLECTION).where({ _id:event.id,createdBy:openid,revision:record.revision===undefined?db.command.exists(false):record.revision }).update({ data:changes });
      if(!write.stats.updated) return {success:false,code:'CONFLICT'};
      return { success: true, record: Object.assign({}, record, changes) };
    }
    if (event.action === 'add') return await addRecord(event, openid);
    if (!event.action || event.action === 'list') return await listRecords(event, openid);
    return { success: false, code: 'UNKNOWN_ACTION' };
  } catch (err) {
    console.error('[mealRecords]', event.action, err);
    const code = /^(INVALID_|RESTAURANT_REQUIRED)/.test(err.message || '') ? err.message : 'SERVER_ERROR';
    return { success: false, code, message: code === 'SERVER_ERROR' ? '云端暂时不可用，请重试' : '请检查记录内容' };
  }
};
