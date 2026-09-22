const identity=require('./identity'),workspace=require('./workspace'),repository=require('./profileRepository'),store=require('./store'),avatar=require('./avatar');
const fail=code=>{throw Object.assign(new Error(code),{code});};

function checked(remote){
 const p=remote&&remote.profile,s=remote&&remote.preferences;
 if(!remote||!Number.isInteger(remote.revision)||remote.revision<1||!p||typeof p.name!=='string'||typeof p.bio!=='string'||(p.avatar!==null&&(!p.avatar||typeof p.avatar!=='object'||typeof p.avatar.base64!=='string'))||!s||typeof s.dietary!=='string'||!Array.isArray(s.cuisines)||!s.cuisines.every(value=>typeof value==='string')||typeof s.privateByDefault!=='boolean'||typeof s.showLocations!=='boolean'||typeof s.reminders!=='boolean')fail('PROFILE_RESPONSE_INVALID');
 return remote;
}

function revision(remote){
 if(remote===null)return 0;
 return checked(remote).revision;
}

async function pull(token=identity.lease()){
 const response=await workspace.call('getProfile',{},token);
 if(!response||!Object.prototype.hasOwnProperty.call(response,'profile'))fail('PROFILE_RESPONSE_INVALID');
 return response.profile===null?null:checked(response.profile);
}

async function push(remote,selected){
 const payload=repository.payload(store.get()),current=revision(remote);
 if(selected&&typeof selected.base64!=='string')fail('INVALID_AVATAR');
 payload.profile.avatar=selected?selected.base64:remote&&remote.profile.avatar&&remote.profile.avatar.base64||null;
 try{return await workspace.mutate('pushProfile',{payload,revision:current,consent:true});}
 catch(error){
  if(['PROFILE_CONFLICT','OPERATION_CONFLICT'].includes(error.code)){
   const pending=identity.workspaceIntent();if(pending&&pending.action==='pushProfile')identity.saveWorkspaceIntent(null);
  }
  throw error;
 }
}

async function apply(remote,options={}){
 if(options.confirmed!==true)fail('PROFILE_APPLY_CONSENT_REQUIRED');
 const current=revision(remote),token=identity.lease();
 workspace.writeFile(JSON.stringify(identity.exportCurrent()),'json',token);
 const profile={name:remote.profile.name,bio:remote.profile.bio},remoteAsset=remote.profile.avatar;
 if(remoteAsset)profile.avatarAsset=await avatar.restore(remoteAsset,token);
 identity.assertLease(token);store.applyCloudProfile(profile,remote.preferences,token);
 return {revision:current};
}

module.exports={pull,push,apply};
