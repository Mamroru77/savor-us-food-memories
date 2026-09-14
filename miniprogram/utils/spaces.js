// Separate service boundary: private store is NEVER populated from partner data.
const identity=require('./identity'),data=require('./data');
const DEFINITE=['IDENTITY_REQUIRED','IDENTITY_MISMATCH','ALREADY_BOUND','INVITE_UNAVAILABLE','INVITE_ALREADY_USED','CONSENT_REQUIRED','FORBIDDEN','MEMBERSHIP_CHANGED','MEMBERSHIP_INVALID','SPACE_REQUIRED','CONFLICT','NOT_FOUND','INVALID_RATING','INVALID_PREFERENCE','INVALID_STATUS','INVALID_OPERATION_ID','TITLE_REQUIRED','SPACE_LIMIT','TRY_LATER'];
function error(code){const e=new Error(code);e.code=code;return e;}
async function call(action,args,token){
 identity.assertLease(token);require('./cloudRecords').initCloud();
 const response=await wx.cloud.callFunction({name:'spaces',data:{...args,action,protocolVersion:1,expectedUserId:token.userId}});
 identity.assertLease(token);const result=response&&response.result;
 if(!result||!result.success)throw error(result&&result.code||'SPACE_UNAVAILABLE');
 if(result.protocolVersion!==1)throw error('UPGRADE_REQUIRED');return result;
}
async function load(){
 const token=identity.lease(),started=Date.now();const status=await call('status',{},token);
 let details={wishes:[],meals:[]};
 if(status.space)details=await call('list',{spaceId:status.space.id,membershipVersion:status.space.version},token);
 identity.assertLease(token);if(Date.now()-started>=15000)throw error('SHARED_LEASE_EXPIRED');
 return {...status,...details,expiresAt:started+15000,pending:identity.spaceIntent()};
}
async function publicationState(args){return call('publicationState',args,identity.lease());}
async function preview(tokenText){return call('previewInvite',{token:parseToken(tokenText)},identity.lease());}
function parseToken(value){const token=String(value||'').trim().replace(/^savor-invite:/,'');if(!/^[a-f0-9]{64}$/.test(token))throw error('INVITE_UNAVAILABLE');return token;}
async function submit(action,args){
 const token=identity.lease(),pending=identity.spaceIntent();
 if(pending)throw error('PENDING_OPERATION');
 const intent={actorUserId:token.userId,action,args:{...args,operationId:data.createId()},createdAt:Date.now()};
 identity.saveSpaceIntent(intent);return execute(intent,token);
}
async function execute(intent,token){
 try{const result=await call(intent.action,intent.args,token);identity.assertLease(token);identity.saveSpaceIntent(null);return result;}
 catch(e){identity.assertLease(token);if(DEFINITE.includes(e.code))identity.saveSpaceIntent(null);throw e;}
}
async function retry(){const token=identity.lease(),intent=identity.spaceIntent();if(!intent)throw error('NO_PENDING_OPERATION');return execute(intent,token);}
function toDraft(wish){
 const token=identity.lease(),store=require('./store'),current=store.loadDraft();
 if(current.restaurant||current.photos.length||current.cloudAttempt||current.editOperationId)throw error('DRAFT_NOT_EMPTY');
 // Copy text only. No shared operation, photos, location guess, score or identity.
 const draft={...store.freshDraft(),restaurant:wish.title,notes:wish.note||'',date:'',sharedWishSource:wish._id};
 identity.assertLease(token);if(!store.saveDraft(draft))throw error('STORAGE_UNAVAILABLE');return draft;
}
module.exports={publicationState,load,preview,parseToken,submit,retry,toDraft};
