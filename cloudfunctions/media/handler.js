const crypto=require('crypto');
const {sanitize}=require('./image');
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const A='savor_accounts',S='savor_spaces',M='savor_shared_meals',ASSETS='savor_media_assets';
const fail=code=>{throw Object.assign(new Error(code),{code});};
const publicAsset=a=>({id:a._id,mealId:a.mealId,status:a.status,mime:a.mime||'',width:a.width||0,height:a.height||0,bytes:a.bytes||0,revision:a.revision||0});
function createHandler({context,repository,storage,now=Date.now,policy={}}){
 return async function handle(event={}){
  const wx=context();if(!wx.OPENID||!wx.APPID)return {success:false,code:'UNAUTHENTICATED'};
  if(event.protocolVersion!==1||!/^u_[a-f0-9]{48}$/.test(event.expectedUserId||''))return {success:false,code:'IDENTITY_REQUIRED'};
  const accountKey=hash(JSON.stringify([wx.APPID,wx.OPENID]));
  const ok=extra=>({success:true,protocolVersion:1,...extra});
  async function authenticated(tx){const actor=await tx.get(A,accountKey);if(!actor||actor.userId!==event.expectedUserId)fail('IDENTITY_MISMATCH');return actor;}
  async function authorized(tx,asset,ownerOnly=false){
   const actor=await authenticated(tx),spaceId=asset?asset.spaceId:event.spaceId,mealId=asset?asset.mealId:event.mealId;
   const space=await tx.get(S,spaceId);
   if(!space||space.status!=='active'||actor.activeSpaceId!==spaceId||!space.members.some(m=>m.userId===actor.userId&&m.accountKey===accountKey))fail('FORBIDDEN');
   if(event.spaceId!==spaceId||event.membershipVersion!==space.version||(asset&&asset.membershipVersion!==space.version))fail('MEMBERSHIP_CHANGED');
   const meal=await tx.get(M,mealId);
   if(!meal||!meal.active||meal.spaceId!==spaceId||!space.mealIds.includes(mealId))fail('NOT_FOUND');
   if(ownerOnly&&(meal.ownerUserId!==actor.userId||(asset&&asset.ownerUserId!==actor.userId)))fail('FORBIDDEN');
   return {actor,space,meal};
  }
  async function getAsset(tx){if(typeof event.assetId!=='string'||!/^a_[a-f0-9]{64}$/.test(event.assetId))fail('NOT_FOUND');const asset=await tx.get(ASSETS,event.assetId);if(!asset)fail('NOT_FOUND');return asset;}
  try{
   if(event.action==='status')return await repository.transaction(async tx=>{const actor=await authenticated(tx),asset=await getAsset(tx);if(asset.ownerUserId!==actor.userId)fail('FORBIDDEN');return ok({asset:publicAsset(asset)});});
   if(event.action==='cancel')return await repository.transaction(async tx=>{
    const actor=await authenticated(tx);
    if(typeof event.operationId!=='string'||!/^[A-Za-z0-9_-]{8,100}$/.test(event.operationId)||!/^s_[a-f0-9]{64}$/.test(event.spaceId||'')||!/^m_[a-f0-9]{64}$/.test(event.mealId||''))fail('INVALID_OPERATION_ID');
    const id='a_'+hash(actor.userId+':'+event.spaceId+':'+event.mealId+':'+event.operationId),old=await tx.get(ASSETS,id);
    if(old&&['withdrawn','purging','deleted'].includes(old.status))return ok({asset:publicAsset(old)});
    const meal=await tx.get(M,event.mealId);
    if(old&&old.ownerUserId!==actor.userId)fail('FORBIDDEN');
    if(!old&&(!meal||meal.ownerUserId!==actor.userId||meal.spaceId!==event.spaceId))fail('FORBIDDEN');
    const next={...(old||{_id:id,spaceId:event.spaceId,mealId:event.mealId,membershipVersion:event.membershipVersion,ownerUserId:actor.userId,createdAt:now()}),status:'withdrawn',withdrawnAt:now(),revision:(old?old.revision:0)+1};
    await tx.set(ASSETS,id,next);
    if(meal)await tx.set(M,meal._id,{...meal,assetIds:(meal.assetIds||[]).filter(a=>a!==id)});
    return ok({asset:publicAsset(next)});
   });
   if(event.action==='prepare')return await repository.transaction(async tx=>{
    if(event.consent!==true)fail('CONSENT_REQUIRED');if(typeof event.operationId!=='string'||!/^[A-Za-z0-9_-]{8,100}$/.test(event.operationId))fail('INVALID_OPERATION_ID');
    const {actor,space,meal}=await authorized(tx,null,true);
    const id='a_'+hash(actor.userId+':'+space._id+':'+meal._id+':'+event.operationId),old=await tx.get(ASSETS,id);
    if(old)return ok({asset:publicAsset(old)});
    // Reserve a slot atomically before uploading, preventing parallel overfill.
    if((meal.assetIds||[]).length>=9)fail('MEDIA_LIMIT');
    const time=now(),asset={_id:id,ownerUserId:actor.userId,spaceId:space._id,membershipVersion:space.version,mealId:meal._id,status:'prepared',createdAt:time,expiresAt:time+3600000,revision:1};
    await tx.set(ASSETS,id,asset);await tx.set(M,meal._id,{...meal,assetIds:(meal.assetIds||[]).concat(id)});return ok({asset:publicAsset(asset)});
   });
   if(event.action==='upload'){
    const image=sanitize(event.base64),digest=hash(image.bytes);
    const asset=await repository.transaction(async tx=>{
     const old=await getAsset(tx);await authorized(tx,old,true);
     if(['withdrawn','purging','deleted'].includes(old.status))fail('MEDIA_WITHDRAWN');
     if(old.digest&&old.digest!==digest)fail('MEDIA_CONTENT_MISMATCH');
     if(['uploaded','active'].includes(old.status))return old;
     if(old.expiresAt<=now())fail('MEDIA_EXPIRED');
     const next={...old,status:'uploading',digest,mime:image.mime,extension:image.extension,width:image.width,height:image.height,bytes:image.bytes.length,cloudPath:'shared-private/'+old._id+'/'+digest+'.'+image.extension};
     await tx.set(ASSETS,next._id,next);return next;
    });
    if(['uploaded','active'].includes(asset.status))return ok({asset:publicAsset(asset)});
    // The server uploads bytes itself. No client-supplied fileID ever enters registry.
    const fileID=await storage.upload(asset.cloudPath,image.bytes);
    if(typeof fileID!=='string'||!fileID.startsWith('cloud://'))fail('UPLOAD_FAILED');
    // Always register the returned file even if membership was revoked while uploading.
    // This retains orphan provenance without granting a reader any access.
    return await repository.transaction(async tx=>{
     const actor=await authenticated(tx),latest=await getAsset(tx);if(latest.ownerUserId!==actor.userId||latest.digest!==asset.digest)fail('FORBIDDEN');
     const latePurge=['purging','deleted'].includes(latest.status);
     const next={...latest,fileID,status:latePurge?'purging':latest.status==='withdrawn'?'withdrawn':latest.status==='active'?'active':'uploaded',uploadedAt:now(),fileRevision:(latest.fileRevision||0)+1};
     await tx.set(ASSETS,next._id,next);return ok({asset:publicAsset(next)});
    });
   }
   if(event.action==='finalize')return await repository.transaction(async tx=>{
    const asset=await getAsset(tx),{meal}=await authorized(tx,asset,true);
    if(asset.status==='active')return ok({asset:publicAsset(asset)});
    if(asset.status!=='uploaded'||!asset.fileID||!(meal.assetIds||[]).includes(asset._id))fail('MEDIA_NOT_UPLOADED');
    if(asset.expiresAt<=now())fail('MEDIA_EXPIRED');
    const next={...asset,status:'active',revision:asset.revision+1,activatedAt:now()};await tx.set(ASSETS,next._id,next);return ok({asset:publicAsset(next)});
   });
   if(event.action==='list')return await repository.transaction(async tx=>{
    const {meal}=await authorized(tx,null);const assets=[];
    for(const id of meal.assetIds||[]){const asset=await tx.get(ASSETS,id);if(asset&&asset.status==='active')assets.push(publicAsset(asset));}
    return ok({assets,leaseMs:15000});
   });
   if(event.action==='read'){
    const started=now();const asset=await repository.transaction(async tx=>{const a=await getAsset(tx);const {meal}=await authorized(tx,a);if(a.status!=='active'||!a.fileID||!(meal.assetIds||[]).includes(a._id))fail('NOT_FOUND');return a;});
    const bytes=await storage.download(asset.fileID);if(!Buffer.isBuffer(bytes)||bytes.length!==asset.bytes||hash(bytes)!==asset.digest)fail('MEDIA_INTEGRITY_FAILED');
    return await repository.transaction(async tx=>{const latest=await getAsset(tx);await authorized(tx,latest);if(latest.status!=='active'||latest.digest!==asset.digest||now()-started>=15000)fail('MEDIA_LEASE_EXPIRED');return ok({asset:publicAsset(latest),base64:bytes.toString('base64'),leaseMs:15000-(now()-started)});});
   }
   if(event.action==='withdraw')return await repository.transaction(async tx=>{
    const actor=await authenticated(tx),asset=await getAsset(tx);if(asset.ownerUserId!==actor.userId)fail('FORBIDDEN');
    if(['withdrawn','purging','deleted'].includes(asset.status))return ok({asset:publicAsset(asset)});
    const next={...asset,status:'withdrawn',withdrawnAt:now(),revision:asset.revision+1};await tx.set(ASSETS,next._id,next);
    const meal=await tx.get(M,asset.mealId);if(meal)await tx.set(M,meal._id,{...meal,assetIds:(meal.assetIds||[]).filter(id=>id!==asset._id)});
    return ok({asset:publicAsset(next)});
   });
   if(event.action==='cleanupCandidates'){
    if(!Array.isArray(policy.adminOpenids)||!policy.adminOpenids.includes(wx.OPENID))fail('FORBIDDEN');
    await repository.transaction(authenticated);
    if(event.cursor!==undefined&&event.cursor!==''&&!/^a_[a-f0-9]{64}$/.test(event.cursor))fail('INVALID_CURSOR');
    if(!repository.scan)fail('SCAN_UNAVAILABLE');
    const assets=await repository.scan(event.cursor||'',20),candidates=[];
    for(const asset of assets){const result=await handle({...event,action:'cleanupCheck',assetId:asset._id});if(!result.success)return result;if(result.eligible&&!result.deleted)candidates.push({id:asset._id,status:asset.status});}
    return ok({candidates,nextCursor:assets.length===20?assets[assets.length-1]._id:''});
   }
   if(event.action==='cleanupCheck'||event.action==='purge'){
    // Destructive cleanup is OFF unless explicitly configured and called by an
    // allowlisted actual administrator. Never infer admin from client fields.
    if(!Array.isArray(policy.adminOpenids)||!policy.adminOpenids.includes(wx.OPENID))fail('FORBIDDEN');
    const days=policy.retentionDays;if(!Number.isInteger(days)||days<1||days>3650)fail('RETENTION_POLICY_REQUIRED');
    const result=await repository.transaction(async tx=>{
     await authenticated(tx);const asset=await getAsset(tx),space=await tx.get(S,asset.spaceId),meal=await tx.get(M,asset.mealId);
     if(asset.status==='deleted')return {asset,eligible:true,alreadyDeleted:true};
     const referenceGone=!space||space.status!=='active'||space.version!==asset.membershipVersion||!meal||!meal.active;
     // Unknown missing records have no trustworthy retention start; never erase.
     const since=asset.withdrawnAt||(space&&space.closedAt)||(meal&&!meal.active&&meal.retractedAt)||(['prepared','uploading','uploaded'].includes(asset.status)?asset.expiresAt:null)||asset.purgeSince;
     const eligible=!!since&&(asset.status==='withdrawn'||asset.status==='purging'||referenceGone||(['prepared','uploading','uploaded'].includes(asset.status)&&asset.expiresAt<=now()))&&now()-since>=days*86400000;
     if(event.action==='purge'){
      if(policy.purgeEnabled!==true)fail('PURGE_DISABLED');if(!eligible)fail('RETENTION_NOT_MET');
      // Freeze state before physical deletion. No finalize/read can resurrect it.
      await tx.set(ASSETS,asset._id,{...asset,status:'purging',purgeSince:since,purgeRequestedBy:event.expectedUserId,purgeRetentionDays:days,purgeRequestedAt:now()});
      if(meal)await tx.set(M,meal._id,{...meal,assetIds:(meal.assetIds||[]).filter(id=>id!==asset._id)});
     }
     return {asset,eligible,alreadyDeleted:false};
    });
    if(event.action==='cleanupCheck'||result.alreadyDeleted)return ok({eligible:result.eligible,deleted:result.alreadyDeleted});
    if(result.asset.fileID){if(!/^shared-private\/a_[a-f0-9]{64}\/[a-f0-9]{64}\.(jpg|png)$/.test(result.asset.cloudPath||''))fail('UNREGISTERED_MEDIA');await storage.remove(result.asset.fileID);}
    await repository.transaction(async tx=>{await authenticated(tx);const latest=await getAsset(tx);if(latest.status!=='purging'||(latest.fileRevision||0)!==(result.asset.fileRevision||0))fail('MEDIA_STATE_CHANGED');await tx.set(ASSETS,latest._id,{...latest,status:'deleted',deletedAt:now()});});
    return ok({deleted:true});
   }
   fail('UNKNOWN_ACTION');
  }catch(e){return {success:false,code:e.code||'MEDIA_UNAVAILABLE'};}
 };
}
module.exports={createHandler};
