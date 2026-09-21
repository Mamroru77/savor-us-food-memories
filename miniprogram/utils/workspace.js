// A single owner-partitioned, explicitly resumed operation. Never replay on launch.
const identity=require('./identity'),data=require('./data'),records=require('./cloudRecords'),stats=require('./memoryStats'),avatar=require('./avatar'),client=require('./workspaceClient'),files=require('./workspaceFiles');
const fail=code=>{throw Object.assign(new Error(code),{code});};
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
  result=await client.call('createTask',{operationId:intent.operationId,kind:intent.kind,count:intent.count,consent:true},token);
  if(result.task.state==='uploading'){
   const prefix=files.directory(token)+'/';if(!intent.filePath.startsWith(prefix)||intent.filePath.includes('..'))fail('INVALID_ARCHIVE_PATH');
   const rows=JSON.parse(wx.getFileSystemManager().readFileSync(intent.filePath,'utf8')).rows;
   if(rows.length!==intent.count)fail('ARCHIVE_CHANGED');
   for(let i=0;i<Math.ceil(rows.length/5);i++)result=await client.call('putChunk',{taskId:result.task.id,index:i,rows:rows.slice(i*5,i*5+5)},token);
   result=await client.call('sealTask',{taskId:result.task.id},token);
  }
 }else result=await client.call(intent.action,{...intent.args,operationId:intent.operationId},token);
 keep(null,token);return result;
}
async function mutate(action,args){identity.assertBusinessCloudAllowed();const token=identity.lease();if(identity.workspaceIntent())fail('WORKSPACE_PENDING');const intent={actorUserId:token.userId,operationId:data.createId(),action,args};keep(intent,token);return execute(intent,token);}
async function createArchive(rows,kind,originalRaw){identity.assertBusinessCloudAllowed();
 const token=identity.lease();if(identity.workspaceIntent())fail('WORKSPACE_PENDING');if(rows.length>500)fail('ARCHIVE_TOO_LARGE');
 // Preserve the unmodified source independently before any normalization/network.
 if(originalRaw!==undefined)files.writeFile(originalRaw,'json',token);
 const filePath=files.writeFile(JSON.stringify({kind:'savor-cloud-archive',formatVersion:1,scope:'local-snapshot',exportedAt:new Date().toISOString(),rows}),'json',token);
 const intent={actorUserId:token.userId,operationId:data.createId(),action:'archive',kind,count:rows.length,filePath};keep(intent,token);return execute(intent,token);
}
function retry(){identity.assertBusinessCloudAllowed();const token=identity.lease(),intent=identity.workspaceIntent();if(!intent)fail('NO_PENDING_OPERATION');return execute(intent,token);}
function preservePending(){const token=identity.lease(),intent=identity.workspaceIntent();if(!intent)fail('NO_PENDING_OPERATION');const path=files.writeFile(JSON.stringify(intent,null,2),'json',token);keep(null,token);return path;}
async function finishTask(task){
 const token=identity.lease();let result=await client.call('taskStatus',{taskId:task.id},token);
 while(result.task.state==='running')result=await client.call('stepTask',{taskId:task.id,cursor:result.task.cursor},token);
 return result;
}
async function exportTask(task){const token=identity.lease(),current=(await client.call('taskStatus',{taskId:task.id},token)).task;if(current.uploaded!==current.chunkCount)fail('CHUNKS_MISSING');const rows=[];for(let i=0;i<current.chunkCount;i++)rows.push(...(await client.call('getChunk',{taskId:task.id,index:i},token)).rows);return files.writeFile(JSON.stringify({kind:'savor-cloud-archive',formatVersion:1,manifest:current.manifest,rows},null,2),'json',token);}
async function chooseAvatar(){
 let token=identity.lease();const picked=await new Promise((resolve,reject)=>wx.chooseMedia({count:1,mediaType:['image'],sourceType:['album','camera'],success:resolve,fail:reject}));token=await identity.resumeNative(token);
 const src=picked.tempFiles&&picked.tempFiles[0]&&picked.tempFiles[0].tempFilePath;if(!src)fail('NO_AVATAR_SELECTED');
 return avatar.forCloud(await avatar.prepare(src,token,'album'),token);
}
module.exports={call:client.call,writeFile:files.writeFile,localRows,parseArchive,createArchive,mutate,retry,preservePending,finishTask,exportTask,chooseAvatar};
