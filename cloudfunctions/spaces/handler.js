const crypto=require('crypto');
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const ACCOUNTS='savor_accounts',INVITES='savor_invites',SPACES='savor_spaces',WISHES='savor_wishes',MEALS='savor_shared_meals';
const fail=code=>{const e=new Error(code);e.code=code;throw e;};
const text=(value,max)=>typeof value==='string'?value.trim().slice(0,max):'';
const operation=value=>{if(typeof value!=='string'||!/^[A-Za-z0-9_-]{8,100}$/.test(value))fail('INVALID_OPERATION_ID');return value;};
const publicSpace=s=>s?{id:s._id,version:s.version,status:s.status,createdAt:s.createdAt,members:s.members.map(m=>({userId:m.userId}))}:null;
function createHandler({context,repository,now=Date.now,random=()=>crypto.randomBytes(32).toString('hex')}){
 return async function handle(event={}){
  const wx=context();if(!wx.OPENID||!wx.APPID)return {success:false,code:'UNAUTHENTICATED'};
  if(event.protocolVersion!==1||!/^u_[a-f0-9]{48}$/.test(event.expectedUserId||''))return {success:false,code:'IDENTITY_REQUIRED'};
  const accountKey=hash(JSON.stringify([wx.APPID,wx.OPENID])),time=now();
  try{return await repository.transaction(async tx=>{
   const receipt=event.expectedUserId+':'+event.operationId;
   const actor=await tx.get(ACCOUNTS,accountKey);
   if(!actor||actor.userId!==event.expectedUserId)fail('IDENTITY_MISMATCH');
   async function active(required=false){
    if(!actor.activeSpaceId){if(required)fail('SPACE_REQUIRED');return null;}
    const s=await tx.get(SPACES,actor.activeSpaceId);
    if(!s||s.status!=='active'||!s.members.some(m=>m.userId===actor.userId&&m.accountKey===accountKey))fail('MEMBERSHIP_INVALID');
    if(required&&(event.spaceId!==s._id||event.membershipVersion!==s.version))fail('MEMBERSHIP_CHANGED');
    return s;
   }
   async function inviteFromToken(){if(typeof event.token!=='string'||!/^[a-f0-9]{64}$/.test(event.token))fail('INVITE_UNAVAILABLE');const invite=await tx.get(INVITES,'i_'+hash(event.token));if(!invite||invite.type!=='invite')fail('INVITE_UNAVAILABLE');return invite;}
   const ok=extra=>Object.assign({success:true,protocolVersion:1,serverTime:time},extra);
   if(event.action==='status'){
    const space=await active();let invitation=null;
    if(!space&&actor.pendingInviteId){const i=await tx.get(INVITES,actor.pendingInviteId);if(i&&i.status==='pending'&&i.expiresAt>time)invitation={token:i.token,expiresAt:i.expiresAt};}
    return ok({space:publicSpace(space),invitation,membershipVersion:actor.membershipVersion||0});
   }
   if(event.action==='createInvite'){
    const req='r_'+hash(actor.userId+':'+operation(event.operationId)),previous=await tx.get(INVITES,req);
    if(previous){const i=await tx.get(INVITES,previous.inviteId);return ok({invitation:i?{token:i.token,status:i.status,expiresAt:i.expiresAt}:null});}
    if(await active())fail('ALREADY_BOUND');
    let invite=actor.pendingInviteId?await tx.get(INVITES,actor.pendingInviteId):null;
    if(!invite||invite.status!=='pending'||invite.expiresAt<=time){
     if(actor.lastInviteAt&&time-actor.lastInviteAt<60000)fail('TRY_LATER');
     const token=random();invite={_id:'i_'+hash(token),type:'invite',token,ownerUserId:actor.userId,ownerAccountKey:accountKey,status:'pending',createdAt:time,expiresAt:time+86400000};
     await tx.set(INVITES,invite._id,invite);await tx.set(ACCOUNTS,accountKey,{...actor,pendingInviteId:invite._id,lastInviteAt:time});
    }
    await tx.set(INVITES,req,{_id:req,type:'request',actorUserId:actor.userId,inviteId:invite._id});
    return ok({invitation:{token:invite.token,status:invite.status,expiresAt:invite.expiresAt}});
   }
   if(event.action==='previewInvite'){
    const i=await inviteFromToken();if(i.status!=='pending'||i.expiresAt<=time||i.ownerUserId===actor.userId)fail('INVITE_UNAVAILABLE');
    const owner=await tx.get(ACCOUNTS,i.ownerAccountKey);if(!owner||owner.activeSpaceId||owner.pendingInviteId!==i._id)fail('INVITE_UNAVAILABLE');
    if(await active())fail('ALREADY_BOUND');
    return ok({preview:{expiresAt:i.expiresAt,requiresConsent:true}}); // No owner identity/profile exposure before consent.
   }
   if(event.action==='revokeInvite'){
    const i=await inviteFromToken();if(i.ownerUserId!==actor.userId)fail('FORBIDDEN');
    if(i.status==='accepted')fail('INVITE_ALREADY_USED');
    if(i.status==='pending')await tx.set(INVITES,i._id,{...i,status:'revoked',revokedAt:time});
    if(actor.pendingInviteId===i._id)await tx.set(ACCOUNTS,accountKey,{...actor,pendingInviteId:null});
    return ok({revoked:true});
   }
   if(event.action==='acceptInvite'){
    operation(event.operationId);if(event.consent!==true)fail('CONSENT_REQUIRED');
    const i=await inviteFromToken();
    if(i.status==='accepted'&&i.acceptedBy===actor.userId){const s=await active();if(s&&s._id===i.spaceId)return ok({space:publicSpace(s)});fail('INVITE_UNAVAILABLE');}
    if(i.status!=='pending'||i.expiresAt<=time||i.ownerUserId===actor.userId)fail('INVITE_UNAVAILABLE');
    if(await active())fail('ALREADY_BOUND');
    const owner=await tx.get(ACCOUNTS,i.ownerAccountKey);if(!owner||owner.userId!==i.ownerUserId||owner.activeSpaceId||owner.pendingInviteId!==i._id)fail('INVITE_UNAVAILABLE');
    const id='s_'+hash(i._id),space={_id:id,status:'active',version:1,createdAt:time,members:[{userId:owner.userId,accountKey:i.ownerAccountKey},{userId:actor.userId,accountKey}],wishIds:[],mealIds:[]};
    if(actor.pendingInviteId){const own=await tx.get(INVITES,actor.pendingInviteId);if(own&&own.status==='pending')await tx.set(INVITES,own._id,{...own,status:'revoked',revokedAt:time});}
    await tx.set(SPACES,id,space);
    await tx.set(ACCOUNTS,i.ownerAccountKey,{...owner,activeSpaceId:id,pendingInviteId:null,membershipVersion:(owner.membershipVersion||0)+1});
    await tx.set(ACCOUNTS,accountKey,{...actor,activeSpaceId:id,pendingInviteId:null,membershipVersion:(actor.membershipVersion||0)+1});
    await tx.set(INVITES,i._id,{...i,status:'accepted',acceptedBy:actor.userId,spaceId:id,acceptedAt:time});
    return ok({space:publicSpace(space)});
   }
   if(event.action==='leave'){
    if(event.consent!==true)fail('CONSENT_REQUIRED');operation(event.operationId);
    // An exact retry after closure is a no-op, never a way to affect a new space.
    if(!actor.activeSpaceId){const old=await tx.get(SPACES,event.spaceId);if(old&&old.status==='closed'&&old.members.some(m=>m.userId===actor.userId)&&old.version===event.membershipVersion+1)return ok({closed:true});fail('SPACE_REQUIRED');}
    const s=await active(true);
    for(const member of s.members){const a=await tx.get(ACCOUNTS,member.accountKey);if(a&&a.activeSpaceId===s._id)await tx.set(ACCOUNTS,member.accountKey,{...a,activeSpaceId:null,membershipVersion:(a.membershipVersion||0)+1});}
    await tx.set(SPACES,s._id,{...s,status:'closed',version:s.version+1,closedAt:time});return ok({closed:true});
   }
   const s=await active(true);
   if(event.action==='list'){
    const wishes=[],meals=[];
    for(const id of s.wishIds){const w=await tx.get(WISHES,id);if(w&&w.status!=='deleted')wishes.push(w);}
    for(const id of s.mealIds){const m=await tx.get(MEALS,id);if(m&&m.active)meals.push(m);}
    return ok({space:publicSpace(s),wishes,meals,leaseMs:15000});
   }
   if(event.action==='addWish'){
    const id='w_'+hash(s._id+':'+actor.userId+':'+operation(event.operationId)),old=await tx.get(WISHES,id);if(old)return ok({wish:old});
    const title=text(event.title,80);if(!title)fail('TITLE_REQUIRED');if(s.wishIds.length>=50)fail('SPACE_LIMIT');
    const wish={_id:id,spaceId:s._id,creatorUserId:actor.userId,title,note:text(event.note,500),status:'open',createdAt:time,revision:1,preferences:{[actor.userId]:'want'},operations:[receipt]};
    await tx.set(WISHES,id,wish);await tx.set(SPACES,s._id,{...s,wishIds:s.wishIds.concat(id)});return ok({wish});
   }
   if(event.action==='wishPreference'||event.action==='wishStatus'){
    operation(event.operationId);if(!s.wishIds.includes(event.id))fail('NOT_FOUND');const w=await tx.get(WISHES,event.id);if(!w)fail('NOT_FOUND');
    if(w.operations.includes(receipt))return ok({wish:w});if(w.status==='deleted')fail('NOT_FOUND');if(event.revision!==w.revision)fail('CONFLICT');
    let next={...w,revision:w.revision+1,operations:w.operations.concat(receipt).slice(-64)};
    if(event.action==='wishPreference'){if(!['want','maybe','no'].includes(event.preference))fail('INVALID_PREFERENCE');next.preferences={...w.preferences,[actor.userId]:event.preference};}
    else {if(!['open','eaten','deleted'].includes(event.status))fail('INVALID_STATUS');if(event.status==='deleted'&&w.creatorUserId!==actor.userId)fail('FORBIDDEN');next.status=event.status;}
    await tx.set(WISHES,w._id,next);return ok({wish:next});
   }
   if(event.action==='publicationState'){
    if(typeof event.recordId!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(event.recordId))fail('NOT_FOUND');
    const source=await tx.get('dining_records',event.recordId);if(!source||source.createdBy!==wx.OPENID||source.deleted)fail('NOT_FOUND');
    const old=await tx.get(MEALS,'m_'+hash(s._id+':'+actor.userId+':'+event.recordId));
    return ok({publication:{revision:old?old.revision:0,active:!!(old&&old.active)}});
   }
   if(event.action==='publishMeal'){
    operation(event.operationId);if(event.consent!==true)fail('CONSENT_REQUIRED');
    if(typeof event.recordId!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(event.recordId))fail('NOT_FOUND');
    const source=await tx.get('dining_records',event.recordId);if(!source||source.createdBy!==wx.OPENID||source.deleted)fail('NOT_FOUND');
    const id='m_'+hash(s._id+':'+actor.userId+':'+event.recordId),old=await tx.get(MEALS,id);
    if(old&&old.operations.includes(receipt))return ok({meal:old});
    if(old&&event.revision!==old.revision)fail('CONFLICT');if(!old&&s.mealIds.length>=50)fail('SPACE_LIMIT');
    const payload={};['restaurantName','note','date','city','country','neighborhood','tags','coordinates','address','cuisine','perCapita','dishes'].forEach(k=>{if(source[k]!==undefined)payload[k]=source[k];});
    // Historical shared flags, votes and private photo IDs never become grants.
    const meal={_id:id,spaceId:s._id,ownerUserId:actor.userId,payload,assetIds:old&&old.active?(old.assetIds||[]):[],active:true,createdAt:old?old.createdAt:time,revision:old?old.revision+1:1,ratings:old?old.ratings:{},operations:(old?old.operations:[]).concat(receipt).slice(-64)};
    await tx.set(MEALS,id,meal);if(!old)await tx.set(SPACES,s._id,{...s,mealIds:s.mealIds.concat(id)});return ok({meal});
   }
   if(event.action==='rateMeal'||event.action==='retractMeal'){
    operation(event.operationId);if(!s.mealIds.includes(event.id))fail('NOT_FOUND');const m=await tx.get(MEALS,event.id);if(!m)fail('NOT_FOUND');
    if(m.operations.includes(receipt))return ok({meal:m});if(!m.active)fail('NOT_FOUND');if(event.revision!==m.revision)fail('CONFLICT');
    let next={...m,revision:m.revision+1,operations:m.operations.concat(receipt).slice(-64)};
    if(event.action==='retractMeal'){if(m.ownerUserId!==actor.userId)fail('FORBIDDEN');next.active=false;next.retractedAt=time;next.assetIds=[];
     for(const id of m.assetIds||[]){const asset=await tx.get('savor_media_assets',id);if(asset&&!['withdrawn','purging','deleted'].includes(asset.status))await tx.set('savor_media_assets',id,{...asset,status:'withdrawn',withdrawnAt:time,revision:(asset.revision||0)+1});}}
    else {if(!Number.isInteger(event.rating)||event.rating<0||event.rating>5)fail('INVALID_RATING');next.ratings={...m.ratings};if(event.rating===0)delete next.ratings[actor.userId];else next.ratings[actor.userId]=event.rating;}
    await tx.set(MEALS,m._id,next);return ok({meal:next});
   }
   fail('UNKNOWN_ACTION');
  });}catch(e){return {success:false,code:e.code||'SPACE_UNAVAILABLE'};}
 };
}
module.exports={createHandler};
