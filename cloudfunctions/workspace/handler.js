// Private archives, resumable imports, explicit profile sync and durable delivery.
// Every mutation is transactional; transport calls ONLY happen outside transactions.
const crypto=require('crypto'),{normalizeRecord}=require('./schema'),{sanitize}=require('./image');
const C={accounts:'savor_accounts',tasks:'savor_archive_tasks',chunks:'savor_archive_chunks',profiles:'savor_profiles',receipts:'savor_workspace_receipts',jobs:'savor_delivery_jobs',records:'dining_records'};
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const fail=code=>{throw Object.assign(new Error(code),{code});};
const text=(s,n)=>typeof s==='string'?s.trim().slice(0,n):'';
const op=s=>{if(!/^[A-Za-z0-9_-]{8,100}$/.test(s||''))fail('INVALID_OPERATION_ID');return s;};
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.keys(v).sort().reduce((r,k)=>{if(k!=='__proto__')r[k]=canonical(v[k]);return r;},{}):v;
const digest=v=>hash(JSON.stringify(canonical(v)));
const taskView=t=>({id:t._id,kind:t.kind,state:t.state,count:t.count,chunkCount:t.chunkCount,uploaded:t.hashes.filter(Boolean).length,cursor:t.cursor,created:t.created,skipped:t.skipped,photoRefsRemoved:t.photoRefsRemoved,manifest:t.manifest||'',createdAt:t.createdAt});
const jobView=j=>({id:j._id,type:j.type,state:j.state,dueAt:j.dueAt,dueText:j.type==='reminder'?new Date(j.dueAt-j.timezoneOffset*60000).toISOString().slice(0,16).replace('T',' ')+' (UTC'+(j.timezoneOffset<=0?'+':'-')+Math.abs(j.timezoneOffset/60)+')':'',title:j.title||'',message:j.type==='feedback'?j.message:'',code:j.code||'',attempts:j.attempts||0,createdAt:j.createdAt,acceptedAt:j.acceptedAt||null});
function normalized(row,openid){
 if(!row||typeof row!=='object'||Array.isArray(row))fail('INVALID_RECORD');
 const input={...row,photos:[],shared:false};delete input.placePhoto;
 // An imported path/fileID or old relationship never grants read access.
 const record=normalizeRecord(input,openid);
 if(!['tencent-picker','tencent-search'].includes(record.locationSource)){delete record.coordinates;record.geoConfirmed=false;record.geoSource='unknown';}
 return record;
}
function profilePayload(input){
 if(!input||typeof input!=='object')fail('INVALID_PROFILE');
 const p=input.profile||{},s=input.preferences||{};
 let avatar=null;
 if(p.avatar!==undefined&&p.avatar!==null){
  if(typeof p.avatar!=='string'||p.avatar.length>87384||!/^[A-Za-z0-9+/]+={0,2}$/.test(p.avatar))fail('INVALID_AVATAR');
  const image=sanitize(p.avatar);
  if(image.bytes.length>65536||image.width>512||image.height>512)fail('AVATAR_TOO_LARGE');
  avatar={base64:image.bytes.toString('base64'),mime:image.mime,extension:image.extension,digest:hash(image.bytes)};
 }
 return {profile:{name:text(p.name,60),bio:text(p.bio,300),avatar},preferences:{dietary:text(s.dietary,100),cuisines:Array.isArray(s.cuisines)?s.cuisines.slice(0,20).map(v=>text(v,40)).filter(Boolean):[],privateByDefault:s.privateByDefault!==false,showLocations:s.showLocations===true,reminders:s.reminders===true}};
}
function createHandler({context,repository,transport,config={},now=Date.now,random=()=>crypto.randomBytes(16).toString('hex')}){
 const configured=type=>type==='reminder'?!!(/^[A-Za-z0-9_-]{10,200}$/.test(config.templateId||'')&&/^thing\d+$/.test(config.thingKey||'')&&/^time\d+$/.test(config.timeKey||'')&&transport&&transport.reminder):!!(config.feedbackReady&&transport&&transport.feedback);
 const ok=extra=>({success:true,protocolVersion:1,...extra});
 async function worker(event,wx){
  const admins=(config.adminOpenids||[]);const secret=config.workerSecret;
  // A forged Timer/OPENID in event is NOT worker authority.
  const trusted=wx.OPENID&&wx.APPID&&admins.includes(wx.OPENID);
  const server=!wx.OPENID&&typeof secret==='string'&&secret.length>=32&&typeof event.workerSecret==='string'&&Buffer.byteLength(event.workerSecret)===Buffer.byteLength(secret)&&crypto.timingSafeEqual(Buffer.from(secret),Buffer.from(event.workerSecret));
  if(!trusted&&!server)fail('WORKER_FORBIDDEN');
  const started=now(),candidates=await repository.dueJobs(now(),20),results=[];
  for(const candidate of candidates){
   if(now()-started>=40000)break;
   const lease=random(),time=now();
   const claimed=await repository.transaction(async tx=>{
    const j=await tx.get(C.jobs,candidate._id);if(!j||j.nextAttemptAt>time||!['queued','blocked_config','sending'].includes(j.state))return null;
    if(j.state==='sending'){
     if(j.leaseUntil>time)return null;
     // Crash after send: never blindly resend a one-shot WeChat subscription.
     const retry=j.type==='feedback'&&config.feedbackIdempotent===true;
     await tx.set(C.jobs,j._id,{...j,state:retry?'queued':'uncertain',code:'SEND_OUTCOME_UNKNOWN',nextAttemptAt:time});return null;
    }
    if(!configured(j.type)||(j.type==='reminder'&&j.templateId!==config.templateId)){
     await tx.set(C.jobs,j._id,{...j,state:'blocked_config',code:'DELIVERY_NOT_CONFIGURED',nextAttemptAt:time+300000});return null;
    }
    const next={...j,state:'sending',lease,leaseUntil:time+300000,nextAttemptAt:time+300000,attempts:(j.attempts||0)+1};await tx.set(C.jobs,j._id,next);return next;
   });
   if(!claimed)continue;
   let state='sent',code='',providerId='';
   try{const result=await transport[claimed.type](claimed);if(!result||result.accepted!==true)throw new Error('NO_ACK');providerId=text(result.id,100);}
   catch(e){state=e.definitive===true?'failed':'uncertain';code=e.definitive===true?'PROVIDER_REJECTED':'SEND_OUTCOME_UNKNOWN';}
   await repository.transaction(async tx=>{
    const j=await tx.get(C.jobs,claimed._id);if(!j||j.state!=='sending'||j.lease!==lease)return;
    await tx.set(C.jobs,j._id,{...j,state,code,providerId,acceptedAt:state==='sent'?now():null,finishedAt:now(),leaseUntil:0});
   });results.push({id:claimed._id,state});
  }
  return ok({results});
 }
 return async(event={})=>{
  try{
   const wx=context();if(event.action==='worker')return await worker(event,wx);
   if(event.action==='resolveJob'){
    if(!wx.OPENID||!wx.APPID||!(config.adminOpenids||[]).includes(wx.OPENID))fail('WORKER_FORBIDDEN');
    if(event.consent!==true||!['sent','failed'].includes(event.state)||!text(event.evidence,300))fail('RESOLUTION_EVIDENCE_REQUIRED');
    return await repository.transaction(async tx=>{const j=await tx.get(C.jobs,event.jobId);if(!j||!['uncertain','sending'].includes(j.state)||(j.state==='sending'&&j.leaseUntil>now()))fail('RESOLUTION_NOT_ALLOWED');
     await tx.set(C.jobs,j._id,{...j,state:event.state,code:'OPERATOR_RESOLVED',resolvedAt:now(),resolvedByAccountKey:hash(JSON.stringify([wx.APPID,wx.OPENID])),resolutionEvidence:text(event.evidence,300)});return ok({job:jobView({...j,state:event.state,code:'OPERATOR_RESOLVED'})});
    });
   }
   if(!wx.OPENID||!wx.APPID)fail('UNAUTHENTICATED');
   if(event.protocolVersion!==1||!/^u_[a-f0-9]{48}$/.test(event.expectedUserId||''))fail('IDENTITY_REQUIRED');
   if(Buffer.byteLength(JSON.stringify(event))>128*1024)fail('REQUEST_TOO_LARGE');
   const accountKey=hash(JSON.stringify([wx.APPID,wx.OPENID])),time=now();
   const result=await repository.transaction(async tx=>{
    const actor=await tx.get(C.accounts,accountKey);if(!actor||actor.userId!==event.expectedUserId)fail('IDENTITY_MISMATCH');
    const uid=actor.userId;
    async function activeSpace(required=false){
     if(!actor.activeSpaceId){if(required)fail('SPACE_REQUIRED');return null;}
     const space=await tx.get('savor_spaces',actor.activeSpaceId);
     if(!space||space.status!=='active'||!space.members.some(m=>m.userId===uid&&m.accountKey===accountKey))fail('MEMBERSHIP_INVALID');
     if(required&&(event.spaceId!==space._id||event.membershipVersion!==space.version))fail('MEMBERSHIP_CHANGED');return space;
    }

    const owned=async(collection,id)=>{if(typeof id!=='string'||!/^[a-z]_[a-f0-9]{64}$/.test(id))fail('NOT_FOUND');const row=await tx.get(collection,id);if(!row||row.ownerUserId!==uid)fail('NOT_FOUND');return row;};
    const receiptId=()=> 'r_'+hash(uid+':'+event.action+':'+op(event.operationId));
    if(event.action==='config'){const space=await activeSpace();return ok({templateId:config.templateId||'',reminderReady:configured('reminder'),feedbackReady:configured('feedback'),space:space?{id:space._id,version:space.version}:null});}
    if(event.action==='listTasks'||event.action==='listJobs')return {listOwner:uid,collection:event.action==='listTasks'?C.tasks:C.jobs};
    if(event.action==='createTask'){
     if(event.consent!==true)fail('CONSENT_REQUIRED');
     if(!['backup','import'].includes(event.kind)||!Number.isInteger(event.count)||event.count<0||event.count>500)fail('INVALID_TASK');
     const id='t_'+hash(uid+':'+op(event.operationId)),old=await tx.get(C.tasks,id);
     if(old){if(old.kind!==event.kind||old.count!==event.count)fail('OPERATION_CONFLICT');return ok({task:taskView(old)});}
     const t={_id:id,ownerUserId:uid,kind:event.kind,count:event.count,chunkCount:Math.ceil(event.count/5),hashes:Array(Math.ceil(event.count/5)).fill(''),state:'uploading',cursor:0,created:0,skipped:0,photoRefsRemoved:0,createdAt:time};
     await tx.set(C.tasks,id,t);return ok({task:taskView(t)});
    }
    if(['taskStatus','putChunk','getChunk','sealTask','commitTask','stepTask','cancelTask'].includes(event.action)){
     const t=await owned(C.tasks,event.taskId),chunkId=i=>'c_'+hash(t._id+':'+i),save=async()=>{await tx.set(C.tasks,t._id,t);return ok({task:taskView(t)});};
     if(event.action==='taskStatus')return ok({task:taskView(t)});
     if(event.action==='getChunk'){
      if(!Number.isInteger(event.index)||event.index<0||event.index>=t.chunkCount)fail('INVALID_CHUNK');
      const c=await tx.get(C.chunks,chunkId(event.index));if(!c)fail('CHUNK_MISSING');return ok({rows:c.rows,hash:c.hash});
     }
     if(event.action==='cancelTask'){if(t.state!=='done')t.state='cancelled';return await save();}
     if(event.action==='putChunk'){
      const i=event.index;if(!Number.isInteger(i)||i<0||i>=t.chunkCount||!Array.isArray(event.rows)||event.rows.length!==Math.min(5,t.count-i*5)||Buffer.byteLength(JSON.stringify(event.rows))>48*1024)fail('INVALID_CHUNK');
      const h=digest(event.rows);if(t.hashes[i]){if(t.hashes[i]!==h)fail('CHUNK_CONFLICT');return ok({task:taskView(t)});}
      if(t.state!=='uploading')fail('TASK_NOT_UPLOADABLE');
      const records=event.rows.map(r=>normalized(r,wx.OPENID));
      const removed=event.rows.reduce((n,r)=>n+(Array.isArray(r.photos)?r.photos.length:0)+(r.placePhoto?1:0),0);
      await tx.set(C.chunks,chunkId(i),{_id:chunkId(i),ownerUserId:uid,rows:event.rows,records,hash:h});t.hashes[i]=h;t.photoRefsRemoved+=removed;return await save();
     }
     if(event.action==='sealTask'){
      if(t.state==='uploading'){if(t.hashes.some(h=>!h))fail('CHUNKS_MISSING');t.manifest=digest(t.hashes);t.state='ready';return await save();}return ok({task:taskView(t)});
     }
     if(event.action==='commitTask'){
      if(event.consent!==true||!t.manifest||event.manifest!==t.manifest)fail('CONSENT_REQUIRED');
      if(['running','done'].includes(t.state))return ok({task:taskView(t)});
      if(t.state!=='ready')fail('TASK_NOT_READY');t.state=t.count?'running':'done';return await save();
     }
     if(!Number.isInteger(event.cursor)||event.cursor<0||event.cursor>t.cursor)fail('CURSOR_CONFLICT');
     if(event.cursor<t.cursor||t.state==='done')return ok({task:taskView(t)});
     if(t.state!=='running')fail('TASK_NOT_RUNNING');
     const c=await tx.get(C.chunks,chunkId(t.cursor));if(!c||c.hash!==t.hashes[t.cursor])fail('CHUNK_MISSING');
     if(digest(c.rows)!==c.hash||digest(c.records)!==digest(c.rows.map(row=>normalized(row,wx.OPENID))))fail('ARCHIVE_INTEGRITY_FAILED');
     for(let i=0;i<c.records.length;i++){
      const row=c.rows[i],record=c.records[i],source=text(row.sourceId||row.cloudId,100);
      let original=null;if(typeof row.cloudId==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(row.cloudId))original=await tx.get(C.records,row.cloudId);
      const id='b_'+hash(uid+':'+source+':'+digest(record));const old=await tx.get(C.records,id);
      if(old||(original&&original.createdBy===wx.OPENID)){t.skipped++;continue;}
      await tx.set(C.records,id,{...record,_id:id,revision:1,createdAt:new Date(time),updatedAt:new Date(time),importTaskId:t._id,deleted:false});t.created++;
     }
     t.cursor++;if(t.cursor===t.chunkCount)t.state='done';return await save();
    }
    if(event.action==='getProfile'){const p=await tx.get(C.profiles,uid);return ok({profile:p?{revision:p.revision,...p.payload,grant:p.grant||null}:null});}
    if(event.action==='getPartnerProfile'){
     const space=await activeSpace(true),partner=space.members.find(m=>m.userId!==uid);if(!partner)return ok({profile:null,leaseMs:15000});
     const account=await tx.get(C.accounts,partner.accountKey),p=await tx.get(C.profiles,partner.userId);
     const grant=p&&p.grant;
     if(!account||account.activeSpaceId!==space._id||!grant||grant.spaceId!==space._id||grant.membershipVersion!==space.version||grant.revision!==p.revision)return ok({profile:null,leaseMs:15000});
     // Minimal explicit projection. Never reveal dietary/privacy preferences, avatar
     // bytes, account keys, OPENID, or historical profile grants to the partner.
     return ok({profile:{name:p.payload.profile.name,bio:p.payload.profile.bio},leaseMs:15000});
    }
    if(event.action==='grantProfile'||event.action==='revokeProfile'){
     if(event.consent!==true)fail('CONSENT_REQUIRED');const id=receiptId(),fingerprint=digest({revision:event.revision,spaceId:event.spaceId||'',membershipVersion:event.membershipVersion||0});
     const receipt=await tx.get(C.receipts,id);if(receipt){if(receipt.fingerprint!==fingerprint)fail('OPERATION_CONFLICT');return ok({revision:receipt.revision});}
     const p=await tx.get(C.profiles,uid);if(!p||event.revision!==p.revision)fail('PROFILE_CONFLICT');
     let grant=null;if(event.action==='grantProfile'){const space=await activeSpace(true);grant={spaceId:space._id,membershipVersion:space.version,revision:p.revision+1};}
     const revision=p.revision+1;await tx.set(C.profiles,uid,{...p,revision,grant});await tx.set(C.receipts,id,{_id:id,ownerUserId:uid,fingerprint,revision});return ok({revision});
    }
    if(event.action==='pushProfile'){
     if(event.consent!==true)fail('CONSENT_REQUIRED');const id=receiptId(),fingerprint=digest({payload:event.payload,revision:event.revision});
     const receipt=await tx.get(C.receipts,id);if(receipt){if(receipt.fingerprint!==fingerprint)fail('OPERATION_CONFLICT');return ok({revision:receipt.revision});}
     const old=await tx.get(C.profiles,uid);if(!Number.isInteger(event.revision)||event.revision!==(old?old.revision:0))fail('PROFILE_CONFLICT');
     const payload=profilePayload(event.payload),revision=event.revision+1;
     await tx.set(C.profiles,uid,{_id:uid,ownerUserId:uid,revision,payload,updatedAt:time});await tx.set(C.receipts,id,{_id:id,ownerUserId:uid,fingerprint,revision});return ok({revision});
    }
    if(event.action==='submitFeedback'||event.action==='scheduleReminder'){
     if(event.consent!==true)fail('CONSENT_REQUIRED');const id='j_'+hash(uid+':'+event.action+':'+op(event.operationId));
     const reminder=event.action==='scheduleReminder';
     const body=reminder?{title:text(event.title,20),dueAt:event.dueAt,templateId:event.templateId,timezoneOffset:event.timezoneOffset}:{message:text(event.message,2000),contact:text(event.contact,180)};
     const fingerprint=digest(body),old=await tx.get(C.jobs,id);if(old){if(old.fingerprint!==fingerprint)fail('OPERATION_CONFLICT');return ok({job:jobView(old)});}
     if(reminder){
      if(!configured('reminder')||body.templateId!==config.templateId)fail('DELIVERY_NOT_CONFIGURED');
      if(event.subscriptionAccepted!==true)fail('SUBSCRIPTION_REQUIRED');
      if(!body.title||!Number.isInteger(body.dueAt)||body.dueAt<time+60000||body.dueAt>time+366*86400000||!Number.isInteger(body.timezoneOffset)||Math.abs(body.timezoneOffset)>840)fail('INVALID_REMINDER');
      const active=[];for(const jid of actor.reminderIds||[]){const j=await tx.get(C.jobs,jid);if(j&&['queued','sending','blocked_config','uncertain'].includes(j.state))active.push(jid);}
      if(active.length>=10)fail('REMINDER_LIMIT');actor.reminderIds=active.concat(id);
     }else{if(!body.message)fail('MESSAGE_REQUIRED');if(actor.lastFeedbackAt&&time-actor.lastFeedbackAt<30000)fail('TRY_LATER');actor.lastFeedbackAt=time;}
     const type=reminder?'reminder':'feedback',ready=configured(type);
     const j={_id:id,ownerUserId:uid,toOpenid:wx.OPENID,type,...body,fingerprint,state:ready?'queued':'blocked_config',code:ready?'':'DELIVERY_NOT_CONFIGURED',dueAt:reminder?body.dueAt:time,nextAttemptAt:reminder?body.dueAt:time,createdAt:time,attempts:0};
     await tx.set(C.jobs,id,j);await tx.set(C.accounts,accountKey,actor);return ok({job:jobView(j)});
    }
    if(['jobStatus','cancelJob','retryJob'].includes(event.action)){
     const j=await owned(C.jobs,event.jobId);if(event.action==='jobStatus')return ok({job:jobView(j)});
     if(event.action==='cancelJob'){
      if(!['queued','blocked_config','cancelled'].includes(j.state))fail('CANCEL_TOO_LATE');j.state='cancelled';
     }else{
      if(event.consent!==true)fail('CONSENT_REQUIRED');
      if(j.type!=='feedback'||(!['failed','blocked_config'].includes(j.state)&&!(j.state==='uncertain'&&config.feedbackIdempotent===true)))fail('RETRY_UNSAFE');
      j.state='queued';j.nextAttemptAt=time;j.code='';
     }await tx.set(C.jobs,j._id,j);return ok({job:jobView(j)});
    }
    fail('UNKNOWN_ACTION');
   });
   if(result.listOwner){
    if(event.cursor&& !/^[tj]_[a-f0-9]{64}$/.test(event.cursor))fail('INVALID_CURSOR');
    const rows=await repository.list(result.collection,result.listOwner,event.cursor||'',30);
    return ok({items:rows.map(result.collection===C.tasks?taskView:jobView),cursor:rows.length===30?rows[rows.length-1]._id:''});
   }return result;
  }catch(e){return {success:false,protocolVersion:1,code:e.code||(['RESTAURANT_REQUIRED','INVALID_DATE','INVALID_RATING','INVALID_COORDINATES','INVALID_LOCATION','INVALID_PER_CAPITA'].includes(e.message)?e.message:'WORKSPACE_ERROR')};}
 };
}
module.exports={createHandler,C,hash,digest,normalized,profilePayload};
