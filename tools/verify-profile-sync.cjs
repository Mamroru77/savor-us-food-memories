const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
global.wx={env:{USER_DATA_PATH:'/owner'},getFileSystemManager:()=>({})};

const repository=require('../miniprogram/utils/profileRepository');
const sync=require('../miniprogram/utils/profileSync');
const client=require('../miniprogram/utils/workspaceClient');
const files=require('../miniprogram/utils/workspaceFiles');
const archive=require('../miniprogram/utils/archiveService');
const avatar=require('../miniprogram/utils/avatar');
const store=require('../miniprogram/utils/store');
const identity=require('../miniprogram/utils/identity');

const token={userId:'u_owner',generation:1,namespace:'savor',partition:{}};
const localAsset={formatVersion:1,localPath:'/owner/local.jpg',digest:null,mime:'image/jpeg',width:1,height:1,source:'chooseAvatar',syncState:'local',remoteRef:null};
const appliedAsset={formatVersion:1,localPath:'/owner/avatar.png',digest:'a'.repeat(64),mime:'image/png',width:1,height:1,source:'cloud',syncState:'synced',remoteRef:'a'.repeat(64)};
const base=()=>({
  memories:[{id:'keep'}],outbox:[{id:'pending'}],feedback:[],cloudHidden:[],
  profile:{name:'Local',bio:'Local bio',avatar:localAsset.localPath,avatarAsset:{...localAsset},partner:'Keep partner',togetherSince:'2024-01-01'},
  settings:{theme:'dusk',language:'en',reduceMotion:true,dietary:'None',cuisines:['Thai'],privateByDefault:false,showLocations:true,reminders:true},
});
const remote={revision:3,profile:{name:'Cloud',bio:'Cloud bio',avatar:{base64:'old-cloud'}},preferences:{dietary:'Vegan',cuisines:['French'],privateByDefault:true,showLocations:false,reminders:false,theme:'pearl',language:'zh-CN'}};
let checks=0;
async function test(name,fn){await fn();checks++;console.log('PASS '+name);}
function pageHarness(){
 let pageSpec,pushArgs,applyArgs;
 const file=path.join(__dirname,'../miniprogram/pages/workspace/index.js');
 const profileSync={pull:async()=>remote,push:async(r,selected)=>{pushArgs={remote:r,selected};return {revision:4};},apply:async(r,options)=>{applyArgs={remote:r,options};return {revision:r.revision};}};
 const deps={
  '../../utils/secondaryUI':{},'../../utils/identity':{lease:()=>token,isCurrent:()=>true,workspaceIntent:()=>null,resumeNative:async()=>token},
  '../../utils/workspaceClient':{call:async action=>{if(action==='getProfile')throw Error('WORKSPACE_PROFILE_BYPASS');}},
  '../../utils/archiveService':{},'../../utils/avatar':{chooseForCloud:async()=>({base64:'picked'})},
  '../../utils/profileSync':profileSync,'../../utils/store':{},'../../utils/workspaceCopy':()=>({ready:'ready',noProfile:'none',revision:'rev',profileHint:'push?',profileConsent:'apply?',done:'done',selected:'selected'}),
 };
 vm.runInNewContext(fs.readFileSync(file,'utf8'),{Page:value=>{pageSpec=value;},require:name=>deps[name]||require(path.resolve(path.dirname(file),name)),wx:{},Date,Promise,setTimeout,clearTimeout});
 const page={...pageSpec,data:{...pageSpec.data,locked:false},_hidden:false,_viewEpoch:0,setData(patch){Object.assign(this.data,patch);}};
 page.run=fn=>fn(token,()=>true);page.alive=()=>true;page.confirm=async()=>true;
 return {page,getPush:()=>pushArgs,getApply:()=>applyArgs};
}

(async()=>{
  await test('repository keeps local fields and emits only the cloud profile contract',()=>{
    const original=base(),saved=repository.save(original,{name:'Saved'}),payload=repository.payload(saved);
    assert.equal(saved.profile.name,'Saved');assert.equal(saved.profile.partner,'Keep partner');assert.equal(original.profile.name,'Local');
    assert.deepEqual(payload,{profile:{name:'Saved',bio:'Local bio',avatar:null},preferences:{dietary:'None',cuisines:['Thai'],privateByDefault:false,showLocations:true,reminders:true}});
  });

  let state=base(),pending=null,backup='',appliedAvatar='';
  identity.lease=()=>token;identity.assertLease=value=>assert.equal(value,token);identity.exportCurrent=()=>({kind:'before-image'});
  identity.workspaceIntent=()=>pending;identity.saveWorkspaceIntent=value=>{pending=value;};
  store.get=()=>state;store.applyCloudProfile=(profile,preferences,owner)=>{identity.assertLease(owner);state=repository.applyCloud(state,profile,preferences);};
  files.writeFile=value=>{backup=value;return '/backup.json';};
  avatar.restore=async()=>({...appliedAsset});

  await test('pull is read-only and returns the versioned remote profile',async()=>{
    const before=JSON.stringify(state);client.call=async(action,args,owner)=>{assert.equal(action,'getProfile');assert.equal(owner,token);return {profile:remote};};
    assert.equal(await sync.pull(token),remote);assert.equal(JSON.stringify(state),before);
  });
  await test('pull rejects a malformed remote profile before the UI can read it',async()=>{
    const before=JSON.stringify(state);client.call=async()=>({});
    await assert.rejects(sync.pull(token),error=>error.code==='PROFILE_RESPONSE_INVALID');
    client.call=async()=>({profile:{revision:'3',profile:{name:'Cloud'},preferences:{cuisines:[]}}});
    await assert.rejects(sync.pull(token),error=>error.code==='PROFILE_RESPONSE_INVALID');assert.equal(JSON.stringify(state),before);
  });

  await test('push owns the revision and whitelisted payload contract',async()=>{
    let sent;archive.mutate=async(action,args)=>{sent={action,args};return {revision:4};};
    const result=await sync.push(remote,{base64:'new-cloud'});
    assert.equal(result.revision,4);assert.deepEqual(sent,{action:'pushProfile',args:{payload:{profile:{name:'Local',bio:'Local bio',avatar:'new-cloud'},preferences:{dietary:'None',cuisines:['Thai'],privateByDefault:false,showLocations:true,reminders:true}},revision:3,consent:true}});
  });

  await test('deterministic push conflict clears the blocked intent without overwriting local data',async()=>{
    const before=JSON.stringify(state);archive.mutate=async()=>{pending={actorUserId:token.userId,action:'pushProfile'};throw Object.assign(new Error('PROFILE_CONFLICT'),{code:'PROFILE_CONFLICT'});};
    await assert.rejects(sync.push(remote,null),error=>error.code==='PROFILE_CONFLICT');assert.equal(pending,null);assert.equal(JSON.stringify(state),before);
  });

  await test('cloud apply requires explicit consent and atomically preserves local-only fields',async()=>{
    const cloud=JSON.parse(JSON.stringify(remote));await assert.rejects(sync.apply(cloud),error=>error.code==='PROFILE_APPLY_CONSENT_REQUIRED');assert.equal(backup,'');
    avatar.restore=async()=>{appliedAvatar=appliedAsset.localPath;return {...appliedAsset};};
    const result=await sync.apply(cloud,{confirmed:true});
    assert.equal(result.revision,3);assert.equal(JSON.parse(backup).kind,'before-image');assert.equal(state.profile.name,'Cloud');assert.equal(state.profile.avatar,appliedAvatar);assert.equal(state.profile.partner,'Keep partner');
    assert.deepEqual(state.profile.avatarAsset,appliedAsset);
    assert.equal(state.settings.dietary,'Vegan');assert.equal(state.settings.theme,'dusk');assert.equal(state.settings.language,'en');assert.equal(state.memories[0].id,'keep');assert.equal(state.outbox[0].id,'pending');
    cloud.preferences.cuisines.push('Mutated later');assert.deepEqual(state.settings.cuisines,['French']);
    const withoutAvatar=JSON.parse(JSON.stringify(remote));withoutAvatar.profile.avatar=null;withoutAvatar.profile.name='Cloud text';withoutAvatar.profile.bio='Text only';withoutAvatar.preferences.dietary='Vegetarian';
    avatar.restore=async()=>{throw Error('avatar.restore must not run for null');};
    await sync.apply(withoutAvatar,{confirmed:true});
    assert.equal(state.profile.name,'Cloud text');assert.equal(state.profile.bio,'Text only');assert.equal(state.settings.dietary,'Vegetarian');
    assert.equal(state.profile.avatar,appliedAsset.localPath);assert.deepEqual(state.profile.avatarAsset,appliedAsset);
  });

  await test('Workspace page pulls through ProfileSync',async()=>{
    const h=pageHarness();await h.page.pull();assert.equal(h.page._remote,remote);assert.equal(h.page.data.remote.revision,3);
  });
  await test('Workspace page pushes through ProfileSync',async()=>{
    const h=pageHarness();h.page.data.profileRead=true;h.page._remote=remote;h.page._avatar={base64:'picked'};await h.page.push();assert.deepEqual(h.getPush(),{remote,selected:{base64:'picked'}});assert.equal(h.page._remote,null);
  });
  await test('Workspace page applies through explicit ProfileSync consent',async()=>{
    const h=pageHarness();h.page._remote=remote;await h.page.apply();assert.equal(h.getApply().remote,remote);assert.equal(h.getApply().options.confirmed,true);assert.equal(h.page.data.message,'done');
  });

  console.log('\n'+checks+'/'+checks+' profile repository/sync checks passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
