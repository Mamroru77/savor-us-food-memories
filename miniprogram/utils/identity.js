// Central identity/session and storage boundary. Never imported by TabBar.
const config = require('./runtimeConfig');
const { createPartitions } = require('./identityPartitions');
const DIARY='savor-diary-v1', DRAFT='savor-draft-v1', SETTINGS='savor-device-settings-v1';
let partitions, current=null, epoch=0, flight=null, phase='unknown';
let diagnosisActive=config.identityMode!=='normal',diagnosisAttempted=false,lastDiagnosis=null,diagnosticCalls={account:0,handshake:0};
const listeners=[];
const DIAGNOSTIC_CODES={
  'cloud-init':['UNAVAILABLE','INIT_FAILED','CLOUD_INIT_FAILED','STALE_IDENTITY'],
  'account-transport':['ACCOUNT_TRANSPORT_FAILED','STALE_IDENTITY'],
  'account-response':['IDENTITY_UNAVAILABLE','ACCOUNT_UNAVAILABLE','ACCOUNT_INVALID','UNSUPPORTED_PROTOCOL','ACCOUNT_RESPONSE_INVALID','STALE_IDENTITY'],
  'handshake-transport':['HANDSHAKE_TRANSPORT_FAILED','STALE_IDENTITY'],
  'handshake-response':['IDENTITY_REQUIRED','IDENTITY_MISMATCH','IDENTITY_UNAVAILABLE','SERVER_ERROR','UNKNOWN_ACTION','UNAUTHENTICATED','UPGRADE_REQUIRED','HANDSHAKE_RESPONSE_INVALID','STALE_IDENTITY'],
  'partition-accept':['CACHE_CORRUPT','CACHE_UNSUPPORTED','CACHE_MISSING','OUTBOX_IDENTITY_MISMATCH','DRAFT_IDENTITY_MISMATCH','PARTITION_ACCEPT_FAILED','CACHE_WRITE_FAILED','CACHE_TOO_LARGE','STALE_IDENTITY'],
  complete:['OK']
};
function cache(){ if(!partitions) partitions=createPartitions(wx); return partitions; }
function error(code){const frozen=code==='DIAGNOSTIC_MODE'||(diagnosisActive&&code==='IDENTITY_LOCKED');const e=new Error(frozen?require('./identityCopy')().frozen:'请联网验证当前账号后重试。原有数据与草稿已保留。');e.code=code;return e;}
function safeRequestId(source){const value=source&&(source.requestID||source.requestId);return typeof value==='string'&&/^[A-Za-z0-9_-]{8,128}$/.test(value)?value.slice(0,6)+'…'+value.slice(-4):'';}
function safeCode(stage,code){const allowed=DIAGNOSTIC_CODES[stage]||[];return allowed.includes(code)?code:{'cloud-init':'CLOUD_INIT_FAILED','account-transport':'ACCOUNT_TRANSPORT_FAILED','account-response':'ACCOUNT_RESPONSE_INVALID','handshake-transport':'HANDSHAKE_TRANSPORT_FAILED','handshake-response':'HANDSHAKE_RESPONSE_INVALID','partition-accept':'PARTITION_ACCEPT_FAILED'}[stage]||'DIAGNOSTIC_FAILED';}
function recordDiagnosis(stage,code,startedAt,source,identityMatch){lastDiagnosis={stage,code:safeCode(stage,code),at:new Date().toISOString(),elapsedMs:Math.max(0,Date.now()-startedAt),identityMatch:typeof identityMatch==='boolean'?identityMatch:null,requestId:safeRequestId(source),calls:{...diagnosticCalls}};return Object.assign({},lastDiagnosis,{calls:{...lastDiagnosis.calls}});}
function diagnosticError(stage,code,startedAt,source,identityMatch){const diagnostic=recordDiagnosis(stage,code,startedAt,source,identityMatch),e=error(diagnostic.code);e.stage=stage;e.diagnostic=diagnostic;return e;}
function enableDiagnosis(){if(diagnosisActive&&diagnosisAttempted)return;diagnosisActive=true;diagnosisAttempted=false;lastDiagnosis=null;diagnosticCalls={account:0,handshake:0};invalidate();}
function isDiagnosisActive(){return diagnosisActive;}
function assertBusinessCloudAllowed(){if(diagnosisActive)throw error('DIAGNOSTIC_MODE');}
function diagnosticSnapshot(){return lastDiagnosis?Object.assign({},lastDiagnosis,{calls:{...lastDiagnosis.calls}}):{stage:'idle',code:diagnosisAttempted?'DIAGNOSTIC_ALREADY_ATTEMPTED':'READY',at:'',elapsedMs:0,identityMatch:null,requestId:'',calls:{...diagnosticCalls}};}
function diagnosticMessage(e){const value=e&&e.diagnostic||lastDiagnosis;return value?'身份验证：'+value.stage+' / '+value.code:'身份诊断已停止；未发起新的验证。';}
function markOffline(){if(current){phase='offline-known';}}
function snapshot(){return {status:phase,userId:current?current.userId:'',generation:epoch,locked:!current,diagnosisActive,diagnosisAttempted};}
function emit(){listeners.slice().forEach(fn=>{try{fn(snapshot());}catch(e){}});}
function subscribe(fn){listeners.push(fn);return ()=>{const i=listeners.indexOf(fn);if(i>=0)listeners.splice(i,1);};}
function lease(){if(!current)throw error('IDENTITY_LOCKED');return {...current};}
function assertLease(token){if(!current||!token||token.userId!==current.userId||token.generation!==epoch||token.namespace!==current.namespace)throw error('STALE_IDENTITY');cache().assertLease(current.partition);cache().assertLease(token.partition);}
function invalidate(){epoch++;flight=null;current=null;cache().invalidate();phase='unknown';emit();}
async function verify(options){
  const diagnostic=diagnosisActive&&options&&options.diagnostic===true;
  if(diagnosisActive&&!diagnostic)throw error('DIAGNOSTIC_MODE');
  if(flight)return flight;
  if(diagnostic&&diagnosisAttempted)throw error('DIAGNOSTIC_ALREADY_ATTEMPTED');
  if(diagnostic)diagnosisAttempted=true;
  const ticket=cache().beginVerification();epoch++;current=null;phase='verifying';emit();
  const generation=epoch;
  const startedAt=Date.now();
  const task=(async()=>{
    try{
      try{require('./cloudRecords').initCloud();}catch(e){if(diagnostic)throw diagnosticError('cloud-init',e.code,startedAt,e);throw e;}
      let response;
      try{if(diagnostic)diagnosticCalls.account++;response=await wx.cloud.callFunction({name:'account',data:{action:'bootstrap',protocolVersion:1}});}catch(e){if(diagnostic)throw diagnosticError('account-transport','ACCOUNT_TRANSPORT_FAILED',startedAt,e);throw e;}
      if(generation!==epoch)throw diagnostic?diagnosticError('account-response','STALE_IDENTITY',startedAt,response):error('STALE_IDENTITY');
      const result=response&&response.result;
      if(!result||result.success!==true||result.protocolVersion!==1||!/^u_[a-f0-9]{48}$/.test(result.userId||''))throw diagnostic?diagnosticError('account-response',result&&result.code||'ACCOUNT_RESPONSE_INVALID',startedAt,response):error('IDENTITY_INVALID');
      let handshake;
      try{if(diagnostic)diagnosticCalls.handshake++;handshake=await wx.cloud.callFunction({name:'mealRecords',data:{action:'identityHandshake',identityProtocol:1,expectedUserId:result.userId}});}catch(e){if(diagnostic)throw diagnosticError('handshake-transport','HANDSHAKE_TRANSPORT_FAILED',startedAt,e);throw e;}
      if(generation!==epoch)throw diagnostic?diagnosticError('handshake-response','STALE_IDENTITY',startedAt,handshake):error('STALE_IDENTITY');
      const handshakeResult=handshake&&handshake.result,identityMatch=Boolean(handshakeResult&&handshakeResult.userId===result.userId);
      if(!handshakeResult||handshakeResult.success!==true||handshakeResult.identityProtocol!==1||!identityMatch)throw diagnostic?diagnosticError('handshake-response',handshakeResult&&handshakeResult.code||'HANDSHAKE_RESPONSE_INVALID',startedAt,handshake,identityMatch):error('UPGRADE_REQUIRED');
      let partition;
      try{partition=cache().accept(ticket,result);}catch(e){if(diagnostic)throw diagnosticError('partition-accept',e.code,startedAt,e,true);throw e;}
      current={userId:partition.userId,generation,namespace:config.storageNamespace,partition};phase='verified';if(diagnostic)recordDiagnosis('complete','OK',startedAt,handshake,true);emit();return lease();
    }catch(e){if(generation===epoch){current=null;phase='blocked';emit();}throw e;}
  })().finally(()=>{if(flight===task)flight=null;});
  flight=task;return task;
}
function getStorageSync(key){
  if(key!==DIARY&&key!==DRAFT)throw error('INVALID_CACHE_KEY');
  if(!current)return '';
  let value;try{value=cache().get(current.partition)[key===DIARY?'diary':'draft'];}catch(e){invalidate();phase='blocked';emit();throw e;}
  return value===null?'':JSON.stringify(value);
}
function setStorageSync(key,raw){
  const token=lease();assertLease(token);
  const value=typeof raw==='string'?JSON.parse(raw):JSON.parse(JSON.stringify(raw));
  const partition=cache().get(current.partition);
  if(key===DIARY){partition.diary=value;partition.outbox=value.outbox||[];}
  else if(key===DRAFT){if(value.actorUserId!==token.userId)throw error('DRAFT_IDENTITY_MISMATCH');partition.draft=value;}
  else throw error('INVALID_CACHE_KEY');
  cache().save(current.partition,partition);
}
// Only native chooser results may resume after re-verifying the SAME owner.
// Never use this for cloud response/queue commits: those require the original lease.
async function resumeNative(token){if(flight)await flight;const next=lease();if(!token||token.userId!==next.userId||token.namespace!==next.namespace)throw error('STALE_IDENTITY');return next;}
function exportCurrent(){const token=lease();return {formatVersion:1,kind:'savor-private-partition-backup',userId:token.userId,exportedAt:new Date().toISOString(),partition:cache().get(current.partition)};}
function isCurrent(token){try{assertLease(token);return true;}catch(e){return false;}}
function normalizeDeviceSettings(value){
  if(!value||typeof value!=='object'||Array.isArray(value))return {};
  const allowed={};
  if(['pearl','dusk'].includes(value.theme))allowed.theme=value.theme;
  if(['system','zh-CN','en'].includes(value.language))allowed.language=value.language;
  if(typeof value.reduceMotion==='boolean')allowed.reduceMotion=value.reduceMotion;
  return allowed;
}
function deviceSettings(){try{const raw=wx.getStorageSync(SETTINGS);return normalizeDeviceSettings(typeof raw==='string'?JSON.parse(raw):raw);}catch(e){return {};}}
function saveDeviceSettings(value){wx.setStorageSync(SETTINGS,JSON.stringify(normalizeDeviceSettings(value)));}
function mediaIntent(){const token=lease();const p=cache().get(current.partition);const intent=p.mediaIntent||null;if(intent&&intent.actorUserId!==token.userId)throw error('OUTBOX_IDENTITY_MISMATCH');return intent;}
function saveMediaIntent(intent){const token=lease();if(intent&&intent.actorUserId!==token.userId)throw error('OUTBOX_IDENTITY_MISMATCH');const p=cache().get(current.partition);p.mediaIntent=intent;cache().save(current.partition,p);}
function spaceIntent(){const token=lease();const p=cache().get(current.partition);const intent=p.spaceIntent||null;if(intent&&intent.actorUserId!==token.userId)throw error('OUTBOX_IDENTITY_MISMATCH');return intent;}
function saveSpaceIntent(intent){const token=lease();if(intent&&intent.actorUserId!==token.userId)throw error('OUTBOX_IDENTITY_MISMATCH');const p=cache().get(current.partition);p.spaceIntent=intent;cache().save(current.partition,p);}
function quarantine(){lease();return cache().quarantine();}
function workspaceIntent(){const token=lease();const p=cache().get(current.partition);const intent=p.workspaceIntent||null;if(intent&&intent.actorUserId!==token.userId)throw error('OUTBOX_IDENTITY_MISMATCH');return intent;}
function saveWorkspaceIntent(intent){const token=lease();if(intent&&intent.actorUserId!==token.userId)throw error('OUTBOX_IDENTITY_MISMATCH');const p=cache().get(current.partition);p.workspaceIntent=intent;cache().save(current.partition,p);}
function workspaceDraft(){const token=lease(),p=cache().get(current.partition);const d=p.workspaceDraft||null;if(d&&d.actorUserId!==token.userId)throw error('DRAFT_IDENTITY_MISMATCH');return d;}
function saveWorkspaceDraft(draft){const token=lease(),p=cache().get(current.partition);const fields={actorUserId:token.userId};['feedbackMessage','contact','reminderTitle','date','time'].forEach(k=>{if(typeof draft[k]==='string')fields[k]=draft[k].slice(0,k==='feedbackMessage'?2000:k==='contact'?180:40);});p.workspaceDraft=fields;cache().save(current.partition,p);}
module.exports={diagnosticMessage,diagnosticSnapshot,assertBusinessCloudAllowed,isDiagnosisActive,enableDiagnosis,workspaceDraft,saveWorkspaceDraft,workspaceIntent,saveWorkspaceIntent,mediaIntent,saveMediaIntent,spaceIntent,saveSpaceIntent,markOffline,resumeNative,exportCurrent,isCurrent,verify,invalidate,lease,assertLease,snapshot,subscribe,getStorageSync,setStorageSync,deviceSettings,saveDeviceSettings,quarantine};
