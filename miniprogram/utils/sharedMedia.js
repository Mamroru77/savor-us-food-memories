// Shared media never uses getTempFileURL or private-store image IDs.
const identity=require('./identity'),data=require('./data');
const MAX_BASE64=699052; // ceil(512 KiB / 3) * 4
function fail(code){throw Object.assign(new Error(code),{code});}
async function call(action,args,token){
 identity.assertBusinessCloudAllowed();identity.assertLease(token);require('./cloudRecords').initCloud();
 const response=await wx.cloud.callFunction({name:'media',data:{...args,action,protocolVersion:1,expectedUserId:token.userId}});
 identity.assertLease(token);const result=response&&response.result;
 if(!result||!result.success)fail(result&&result.code||'MEDIA_UNAVAILABLE');if(result.protocolVersion!==1)fail('UPGRADE_REQUIRED');return result;
}
function readBase64(filePath,token){
 const root=wx.env.USER_DATA_PATH+'/savor-photos/'+require('./runtimeConfig').fileScope+token.userId+'/';
 if(typeof filePath!=='string'||!filePath.startsWith(root)||filePath.includes('..'))fail('INVALID_LOCAL_PHOTO');
 const base64=wx.getFileSystemManager().readFileSync(filePath,'base64');
 if(typeof base64!=='string'||!base64.length||base64.length>MAX_BASE64)fail('SHARED_PHOTO_TOO_LARGE');return base64;
}
async function compressForSharing(filePath){
 const token=identity.lease();
 const root=wx.env.USER_DATA_PATH+'/savor-photos/'+require('./runtimeConfig').fileScope+token.userId+'/';if(!filePath.startsWith(root)||filePath.includes('..'))fail('INVALID_LOCAL_PHOTO');
 let resultPath=filePath;
 for(const width of [1280,800]){
  identity.assertLease(token);
  try{
   const r=await new Promise((resolve,reject)=>wx.compressImage({src:filePath,quality:50,compressedWidth:width,success:resolve,fail:reject}));
   identity.assertLease(token);resultPath=await require('./photos').persistPhoto(r.tempFilePath);identity.assertLease(token);
  }catch(e){identity.assertLease(token);}
  try{readBase64(resultPath,token);return resultPath;}catch(e){if(e.code!=='SHARED_PHOTO_TOO_LARGE')throw e;}
 }
 fail('SHARED_PHOTO_TOO_LARGE');
}
async function upload(scope,filePath){identity.assertBusinessCloudAllowed();
 const token=identity.lease();if(identity.mediaIntent())fail('MEDIA_PENDING_OPERATION');
 readBase64(filePath,token); // Validate before creating any remote reservation.
 const intent={actorUserId:token.userId,scope:{...scope},operationId:data.createId(),filePath,stage:'prepare'};
 identity.saveMediaIntent(intent);return execute(intent,token);
}
function keep(intent,token){identity.assertLease(token);identity.saveMediaIntent(intent);}
async function execute(intent,token){identity.assertBusinessCloudAllowed();
 if(intent.cancelRequested)return cancel();
 const base={...intent.scope,operationId:intent.operationId};
 if(!intent.assetId){const r=await call('prepare',{...base,consent:true},token);if(['withdrawn','purging','deleted'].includes(r.asset.status))fail('MEDIA_WITHDRAWN');intent.assetId=r.asset.id;intent.stage='upload';keep(intent,token);}
 if(intent.stage==='upload'){
  const current=await call('status',{assetId:intent.assetId},token);
  if(['uploaded','active'].includes(current.asset.status)){intent.stage='finalize';keep(intent,token);}
  else if(['withdrawn','purging','deleted'].includes(current.asset.status))fail('MEDIA_WITHDRAWN');
 }
 if(intent.stage==='upload'){
  const bytes=readBase64(intent.filePath,token);await call('upload',{...base,assetId:intent.assetId,base64:bytes},token);
  intent.stage='finalize';keep(intent,token);
 }
 const result=await call('finalize',{...base,assetId:intent.assetId},token);
 keep(null,token);return result.asset;
}
async function retry(){identity.assertBusinessCloudAllowed();const token=identity.lease(),intent=identity.mediaIntent();if(!intent)fail('NO_MEDIA_PENDING');return execute(intent,token);}
async function cancel(){identity.assertBusinessCloudAllowed();
 const token=identity.lease(),intent=identity.mediaIntent();if(!intent)fail('NO_MEDIA_PENDING');
 intent.cancelRequested=true;keep(intent,token);
 await call('cancel',{...intent.scope,operationId:intent.operationId},token);keep(null,token);
}
async function withdraw(scope,assetId){return call('withdraw',{...scope,assetId},identity.lease());}
// Dedicated short-lived display files, never the user's private photo directory.
let viewGeneration=0,serial=0;const displayFiles=new Set();
function clear(){viewGeneration++;const fs=wx.getFileSystemManager();for(const file of displayFiles){try{fs.unlinkSync(file);}catch(e){}}displayFiles.clear();}
// Sweep only our dedicated transient filenames after a process restart.
try{const fs=wx.getFileSystemManager(),directory=wx.env.USER_DATA_PATH+'/savor-shared-view';for(const name of fs.readdirSync(directory)){if(/^view-\d+-\d+\.(png|jpg)$/.test(name)){try{fs.unlinkSync(directory+'/'+name);}catch(e){}}}}catch(e){}
identity.subscribe(clear);
function expireAt(deadline,generation){setTimeout(()=>{if(generation===viewGeneration)clear();},Math.max(0,deadline-Date.now()));}
async function read(scope,mealId,displayDeadline){identity.assertBusinessCloudAllowed();
 const token=identity.lease(),generation=viewGeneration,started=Date.now();
 const listed=await call('list',{...scope,mealId},token);const images=[];
 try{
  for(const asset of listed.assets){
   if(generation!==viewGeneration||Date.now()>=displayDeadline)fail('MEDIA_LEASE_EXPIRED');
   const r=await call('read',{...scope,assetId:asset.id},token);
   if(generation!==viewGeneration||Date.now()>=displayDeadline||Date.now()-started>=15000)fail('MEDIA_LEASE_EXPIRED');
   if(!r.asset||!['image/jpeg','image/png'].includes(r.asset.mime)||typeof r.base64!=='string'||r.base64.length>MAX_BASE64||!Number.isFinite(r.leaseMs)||r.leaseMs<=0)fail('INVALID_MEDIA_RESPONSE');
   const fs=wx.getFileSystemManager(),directory=wx.env.USER_DATA_PATH+'/savor-shared-view';try{fs.mkdirSync(directory,true);}catch(e){}
   const filePath=directory+'/view-'+Date.now()+'-'+(++serial)+(r.asset.mime==='image/png'?'.png':'.jpg');
   fs.writeFileSync(filePath,wx.base64ToArrayBuffer(r.base64));displayFiles.add(filePath);
   images.push({id:asset.id,src:filePath});
  }
  identity.assertLease(token);expireAt(Math.min(displayDeadline,started+15000),generation);return images;
 }catch(e){if(generation===viewGeneration)clear();throw e;}
}
module.exports={compressForSharing,upload,retry,cancel,withdraw,read,clear,readBase64};
