// Separate service boundary: private store is NEVER populated from partner data.
const identity=require('./identity'),data=require('./data');
const DEFINITE=['IDENTITY_REQUIRED','IDENTITY_MISMATCH','ALREADY_BOUND','INVITE_UNAVAILABLE','INVITE_ALREADY_USED','CONSENT_REQUIRED','FORBIDDEN','MEMBERSHIP_CHANGED','MEMBERSHIP_INVALID','SPACE_REQUIRED','CONFLICT','NOT_FOUND','INVALID_RATING','INVALID_PREFERENCE','INVALID_STATUS','INVALID_OPERATION_ID','TITLE_REQUIRED','SPACE_LIMIT','TRY_LATER','INVALID_DATE','UNKNOWN_ACTION'];
let cachedStatus=null;
const statusListeners=[];
function error(code){const e=new Error(code);e.code=code;return e;}
function identityKey(){
 const snap=typeof identity.snapshot==='function'?identity.snapshot():null;
 if(snap)return snap.locked?'':`${snap.userId}:${snap.generation}`;
 try{const lease=identity.lease();return lease?`${lease.userId}:${lease.generation}`:'';}catch(e){return '';}
}
function subscribeStatus(fn){
 if(typeof fn!=='function')return function(){};
 statusListeners.push(fn);
 return function(){const i=statusListeners.indexOf(fn);if(i>=0)statusListeners.splice(i,1);};
}
function notifyStatus(){statusListeners.slice().forEach(fn=>{try{fn(cachedStatus);}catch(e){}});}
function clearCache(){cachedStatus=null;}
function peekStatus(){
 if(!cachedStatus)return null;
 const key=identityKey();
 if(!key||cachedStatus.ownerKey!==key||Date.now()>=cachedStatus.expiresAt){cachedStatus=null;return null;}
 return cachedStatus;
}
function updateCachedStatus(entry,token,started){
 const snap=typeof identity.snapshot==='function'?identity.snapshot():null;
 const ownerKey=snap?(snap.locked?'':`${snap.userId}:${snap.generation}`):`${token.userId}:${token.generation}`;
 const prev=cachedStatus&&cachedStatus.space?JSON.stringify(cachedStatus.space):null;
 cachedStatus={
  space:entry&&entry.space?entry.space:null,
  invitation:entry&&Object.prototype.hasOwnProperty.call(entry,'invitation')?entry.invitation:null,
  expiresAt:started+15000,
  ownerKey,
  userId:token.userId,
  generation:token.generation,
 };
 const next=cachedStatus.space?JSON.stringify(cachedStatus.space):null;
 return {entry:cachedStatus,changed:prev!==next};
}
async function call(action,args,token){
 identity.assertBusinessCloudAllowed();identity.assertLease(token);require('./cloudRecords').initCloud();
 const response=await wx.cloud.callFunction({name:'spaces',data:{...args,action,protocolVersion:1,expectedUserId:token.userId}});
 identity.assertLease(token);const result=response&&response.result;
 if(!result||!result.success)throw error(result&&result.code||'SPACE_UNAVAILABLE');
 if(result.protocolVersion!==1)throw error('UPGRADE_REQUIRED');return result;
}
async function status(){
 const token=identity.lease(),started=Date.now();
 const result=await call('status',{},token);
 identity.assertLease(token);if(Date.now()-started>=15000)throw error('SHARED_LEASE_EXPIRED');
 const updated=updateCachedStatus(result,token,started);
 if(updated.changed)notifyStatus();
 return updated.entry;
}
async function load(){
 const token=identity.lease(),started=Date.now();const st=await call('status',{},token);
 let details={wishes:[],meals:[]};
 if(st.space)details=await call('list',{spaceId:st.space.id,membershipVersion:st.space.version},token);
 identity.assertLease(token);if(Date.now()-started>=15000)throw error('SHARED_LEASE_EXPIRED');
 const nextSpace=details.space||st.space||null;
 const updated=updateCachedStatus({space:nextSpace,invitation:st.invitation||null},token,started);
 if(updated.changed)notifyStatus();
 return {...st,...details,space:nextSpace,expiresAt:started+15000,pending:identity.spaceIntent()};
}
async function publicationState(args){return call('publicationState',args,identity.lease());}
async function preview(tokenText){return call('previewInvite',{token:parseToken(tokenText)},identity.lease());}
function parseToken(value){const token=String(value||'').trim().replace(/^savor-invite:/,'');if(!/^[a-f0-9]{64}$/.test(token))throw error('INVITE_UNAVAILABLE');return token;}
async function submit(action,args){identity.assertBusinessCloudAllowed();
 const token=identity.lease(),pending=identity.spaceIntent();
 if(pending)throw error('PENDING_OPERATION');
 const intent={actorUserId:token.userId,action,args:{...args,operationId:data.createId()},createdAt:Date.now()};
 identity.saveSpaceIntent(intent);return execute(intent,token);
}
async function execute(intent,token){identity.assertBusinessCloudAllowed();
 try{
  const result=await call(intent.action,intent.args,token);identity.assertLease(token);identity.saveSpaceIntent(null);
  if(intent.action==='setTogetherSince'||intent.action==='acceptInvite'){
   if(result&&result.space){updateCachedStatus({space:result.space,invitation:null},token,Date.now());notifyStatus();}
  }else if(intent.action==='leave'){
   updateCachedStatus({space:null,invitation:null},token,Date.now());notifyStatus();
  }
  return result;
 }catch(e){identity.assertLease(token);if(DEFINITE.includes(e.code))identity.saveSpaceIntent(null);throw e;}
}
async function retry(){identity.assertBusinessCloudAllowed();const token=identity.lease(),intent=identity.spaceIntent();if(!intent)throw error('NO_PENDING_OPERATION');return execute(intent,token);}
function toDraft(wish){
 const token=identity.lease(),store=require('./store'),current=store.loadDraft();
 if(current.restaurant||current.photos.length||current.cloudAttempt||current.editOperationId)throw error('DRAFT_NOT_EMPTY');
 // Copy text only. No shared operation, photos, location guess, score or identity.
 const draft={...store.freshDraft(),restaurant:wish.title,notes:wish.note||'',date:'',sharedWishSource:wish._id};
 identity.assertLease(token);if(!store.saveDraft(draft))throw error('STORAGE_UNAVAILABLE');return draft;
}
module.exports={publicationState,load,status,peekStatus,clearCache,subscribeStatus,preview,parseToken,submit,retry,toDraft};
