// A single owner-partitioned, explicitly resumed operation. Never replay on launch.
const identity=require('./identity'),data=require('./data'),records=require('./cloudRecords'),stats=require('./memoryStats');
const fail=code=>{throw Object.assign(new Error(code),{code});};
async function call(action,args={},token=identity.lease()){
 identity.assertBusinessCloudAllowed();identity.assertLease(token);records.initCloud();
 const response=await wx.cloud.callFunction({name:'workspace',data:{...args,action,protocolVersion:1,expectedUserId:token.userId}});
 identity.assertLease(token);const r=response&&response.result;
 if(r&&r.code==='IDENTITY_MISMATCH'){identity.invalidate();fail('IDENTITY_MISMATCH');}
 if(!r||!r.success)fail(r&&r.code||'WORKSPACE_UNAVAILABLE');if(r.protocolVersion!==1)fail('UPGRADE_REQUIRED');return r;
}
function directory(token){identity.assertLease(token);const path=wx.env.USER_DATA_PATH+'/savor-workspace/'+require('./runtimeConfig').fileScope+token.userId;try{wx.getFileSystemManager().accessSync(path);}catch(e){wx.getFileSystemManager().mkdirSync(path,true);}return path;}
function writeFile(contents,suffix='json',token=identity.lease()){
 const path=directory(token)+'/savor-'+Date.now()+'-'+data.createId()+'.'+suffix;
 wx.getFileSystemManager().writeFileSync(path,contents,'utf8');identity.assertLease(token);return path;
}
function localRows(){return stats.real(require('./store').get().memories).map(m=>({...records.memoryToCloudRecord(m),sourceId:m.id,cloudId:m.cloudId||''}));}
function parseArchive(raw){
 if(typeof raw!=='string'||raw.length>5*1024*1024)fail('ARCHIVE_TOO_LARGE');let parsed;try{parsed=JSON.parse(raw);}catch(e){fail('INVALID_ARCHIVE');}
 let rows=Array.isArray(parsed)?parsed:parsed&&parsed.rows||parsed&&parsed.memories||parsed&&parsed.partition&&parsed.partition.diary&&parsed.partition.diary.memories;
 if(!Array.isArray(rows)||rows.length>500)fail('INVALID_ARCHIVE');
 rows=rows.filter(r=>r&&!r.deleted&&!r.pendingDelete&&!stats.isSample(r)).map(r=>{
  if(typeof r.restaurantName==='string')return {...r,sourceId:r.sourceId||r._id||'',cloudId:r.cloudId||r._id||''};
  if(!data.isMemory(r))fail('INVALID_RECORD');return {...records.memoryToCloudRecord(r),sourceId:r.id,cloudId:r.cloudId||''};
 });return rows;
}
function keep(intent,token){identity.assertLease(token);identity.saveWorkspaceIntent(intent);}
async function execute(intent,token){identity.assertBusinessCloudAllowed();
 if(intent.actorUserId!==token.userId)fail('OUTBOX_IDENTITY_MISMATCH');
 let result;
 if(intent.action==='archive'){
  result=await call('createTask',{operationId:intent.operationId,kind:intent.kind,count:intent.count,consent:true},token);
  if(result.task.state==='uploading'){
   const prefix=directory(token)+'/';if(!intent.filePath.startsWith(prefix)||intent.filePath.includes('..'))fail('INVALID_ARCHIVE_PATH');
   const rows=JSON.parse(wx.getFileSystemManager().readFileSync(intent.filePath,'utf8')).rows;
   if(rows.length!==intent.count)fail('ARCHIVE_CHANGED');
   for(let i=0;i<Math.ceil(rows.length/5);i++)result=await call('putChunk',{taskId:result.task.id,index:i,rows:rows.slice(i*5,i*5+5)},token);
   result=await call('sealTask',{taskId:result.task.id},token);
  }
 }else result=await call(intent.action,{...intent.args,operationId:intent.operationId},token);
 keep(null,token);return result;
}
async function mutate(action,args){identity.assertBusinessCloudAllowed();const token=identity.lease();if(identity.workspaceIntent())fail('WORKSPACE_PENDING');const intent={actorUserId:token.userId,operationId:data.createId(),action,args};keep(intent,token);return execute(intent,token);}
async function createArchive(rows,kind,originalRaw){identity.assertBusinessCloudAllowed();
 const token=identity.lease();if(identity.workspaceIntent())fail('WORKSPACE_PENDING');if(rows.length>500)fail('ARCHIVE_TOO_LARGE');
 // Preserve the unmodified source independently before any normalization/network.
 if(originalRaw!==undefined)writeFile(originalRaw,'json',token);
 const filePath=writeFile(JSON.stringify({kind:'savor-cloud-archive',formatVersion:1,scope:'local-snapshot',exportedAt:new Date().toISOString(),rows}),'json',token);
 const intent={actorUserId:token.userId,operationId:data.createId(),action:'archive',kind,count:rows.length,filePath};keep(intent,token);return execute(intent,token);
}
function retry(){identity.assertBusinessCloudAllowed();const token=identity.lease(),intent=identity.workspaceIntent();if(!intent)fail('NO_PENDING_OPERATION');return execute(intent,token);}
function preservePending(){const token=identity.lease(),intent=identity.workspaceIntent();if(!intent)fail('NO_PENDING_OPERATION');const path=writeFile(JSON.stringify(intent,null,2),'json',token);keep(null,token);return path;}
async function finishTask(task){
 const token=identity.lease();let result=await call('taskStatus',{taskId:task.id},token);
 while(result.task.state==='running')result=await call('stepTask',{taskId:task.id,cursor:result.task.cursor},token);
 return result;
}
async function exportTask(task){const token=identity.lease(),current=(await call('taskStatus',{taskId:task.id},token)).task;if(current.uploaded!==current.chunkCount)fail('CHUNKS_MISSING');const rows=[];for(let i=0;i<current.chunkCount;i++)rows.push(...(await call('getChunk',{taskId:task.id,index:i},token)).rows);return writeFile(JSON.stringify({kind:'savor-cloud-archive',formatVersion:1,manifest:current.manifest,rows},null,2),'json',token);}
function profilePayload(){const s=require('./store').get();return {profile:{name:s.profile.name,bio:s.profile.bio,avatar:null},preferences:{dietary:s.settings.dietary,cuisines:s.settings.cuisines.slice(),privateByDefault:s.settings.privateByDefault,showLocations:s.settings.showLocations,reminders:s.settings.reminders}};}
function applyProfile(remote){
 const token=identity.lease();if(!remote||!remote.profile||!remote.preferences)fail('PROFILE_MISSING');
 // Keep a complete owner-local before-image; never restore old outbox/identity.
 writeFile(JSON.stringify(identity.exportCurrent()),'json',token);
 const p={name:remote.profile.name,bio:remote.profile.bio},a=remote.profile.avatar;
 if(a){if(!/^[a-f0-9]{64}$/.test(a.digest)||!['jpg','png'].includes(a.extension)||typeof a.base64!=='string'||a.base64.length>87384)fail('INVALID_AVATAR');const path=directory(token)+'/avatar-'+a.digest+'.'+a.extension;wx.getFileSystemManager().writeFileSync(path,a.base64,'base64');p.avatar=path;}
 identity.assertLease(token);require('./store').applyCloudProfile(p,remote.preferences,token);
}
async function chooseAvatar(){
 let token=identity.lease();const picked=await new Promise((resolve,reject)=>wx.chooseMedia({count:1,mediaType:['image'],sourceType:['album','camera'],success:resolve,fail:reject}));token=await identity.resumeNative(token);
 const src=picked.tempFiles[0].tempFilePath;
 const info=await new Promise((resolve,reject)=>wx.getImageInfo({src,success:resolve,fail:reject}));identity.assertLease(token);
 const scale=Math.min(1,256/info.width,256/info.height);
 const compressed=await new Promise((resolve,reject)=>wx.compressImage({src,quality:60,compressedWidth:Math.max(1,Math.round(info.width*scale)),compressedHeight:Math.max(1,Math.round(info.height*scale)),success:resolve,fail:reject}));identity.assertLease(token);
 const b64=wx.getFileSystemManager().readFileSync(compressed.tempFilePath,'base64');if(b64.length>87384)fail('AVATAR_TOO_LARGE');return b64;
}
module.exports={call,writeFile,localRows,parseArchive,createArchive,mutate,retry,preservePending,finishTask,exportTask,profilePayload,applyProfile,chooseAvatar};
