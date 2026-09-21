// Runs production functions with local fixtures only. No network, real preferences or files changed.
const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
let count=0;
const flush=async()=>{for(let i=0;i<15;i++)await Promise.resolve();};
async function test(name,fn){try{await fn();count++;console.log('PASS '+name);}catch(e){console.error('FAIL '+name);throw e;}}

function fixture(){
  let listener;
  const state={
    settings:{theme:'pearl',reduceMotion:false,loveSent:true,notificationsRead:true},
    profile:{name:'Saved',bio:'',avatar:'/images/jamie.jpg',partner:'fixture',togetherSince:'2026-01-01'},
    memories:Array.from({length:500},(_,i)=>({id:'fixture-'+i,notes:'x'.repeat(2000)})),
    outbox:[{privateNote:'not for the view'}],feedback:[],
    identity:{userId:'fixture',generation:1,locked:false,status:'verified'},
  };
  const deps={
    identity:{snapshot:()=>state.identity,lease:()=>({userId:'fixture',generation:state.identity.generation,namespace:'fixture'}),resumeNative:async token=>token},
    identityCopy:()=>({verify:'Verify your account first'}),
    motionPresence:{update(){},dispose(){}},localDate:{today:()=> '2026-09-16'},
    i18n:{copy:()=>({}),options:()=>[],locale:()=> 'en',t:s=>s},
    uiFeedback:require('../miniprogram/utils/uiFeedback'),
    store:{get:()=>state,subscribe:fn=>{listener=fn;return()=>{};},updateProfile:changes=>{state.profile={...state.profile,...changes};},notify(){}},
    pageHeadings:{},data:{},
    photos:{isCancelled:e=>!!e&&e.errMsg==='chooseMedia:fail cancel',logFailure:(e,stage)=>({category:stage==='identity'?'identity':e.category||'program',stage:stage||e.stage,code:e.code}),pruneOrphans(){},collectReferenced:()=>[]},
    avatar:{},
    memoryStats:{},metrics:{getMetrics:()=>({headerTop:60})},
  };
  return {state,deps,emit:()=>listener&&listener(state)};
}

function loadComponent(file,deps){
  let spec;
  vm.runInNewContext(fs.readFileSync(file,'utf8'),{
    Component:value=>{spec=value;},
    require:p=>{const key=p.split('/').pop();if(!(key in deps))throw Error('Unexpected dependency '+key);return deps[key];},
    console,wx:{},Promise,Date,Math,
  },{filename:file});
  return spec;
}

function sheet(){
  const base=fixture(),spec=loadComponent('miniprogram/components/sheet/index.js',base.deps),patches=[],events=[];
  const p={...spec.methods,data:{...JSON.parse(JSON.stringify(spec.data)),show:true,type:'help'},setData(patch,cb){patches.push(patch);Object.assign(this.data,patch);if(cb)cb();},triggerEvent(name,detail){events.push({name,detail});}};
  spec.lifetimes.attached.call(p);
  return {...base,p,spec,patches,events,emit:()=>base.emit()};
}

function profileEditor(){
  const base=fixture(),spec=loadComponent('miniprogram/components/profile-editor/index.js',base.deps),patches=[],events=[];
  const p={...spec.methods,data:{...JSON.parse(JSON.stringify(spec.data)),active:false,show:false,dusk:false},setData(patch,cb){patches.push(patch);Object.assign(this.data,patch);if(cb)cb();},triggerEvent(name,detail){events.push({name,detail});}};
  spec.lifetimes.attached.call(p);
  return {...base,p,spec,patches,events,emit:()=>base.emit()};
}

function enterSheet(h,type='profile'){h.p.data.show=true;h.p.data.type=type;h.spec.observers['show, type, memoryId, filter'].call(h.p);}
function enter(h){h.p.data.active=true;h.p.data.show=true;h.spec.observers['active, show'].call(h.p,true,true);}
function leave(h){h.p.data.active=false;h.p.data.show=false;h.spec.observers['active, show'].call(h.p,false,false);}
function hide(h){h.p.data.show=false;h.spec.observers['active, show'].call(h.p,h.p.data.active,false);}
function edit(h,method,value){h.p[method]({detail:{value}});}
function avatar(h,tempPath='temporary-avatar'){
  let resolve,reject;
  const persisted=new Promise((a,b)=>{resolve=a;reject=b;});
  const calls=[];
  h.deps.avatar.prepare=(source,owner,kind)=>{calls.push({source,userId:owner.userId,kind});return persisted.then(localPath=>({localPath}));};
  const completion=h.p.onAvatarChange({detail:{avatarUrl:tempPath}});
  return {resolve,reject,completion,calls};
}

(async()=>{
  const sheetWxml=fs.readFileSync('miniprogram/components/sheet/index.wxml','utf8');
  const profileWxml=fs.readFileSync('miniprogram/components/profile-editor/index.wxml','utf8');
  const sheetJson=JSON.parse(fs.readFileSync('miniprogram/components/sheet/index.json','utf8'));
  await test('sheet delegates profile UI to ProfileEditor',()=>{
    assert.equal(sheetJson.usingComponents['profile-editor'],'/components/profile-editor/index');
    assert.match(sheetWxml,/<profile-editor\b/);
    assert.doesNotMatch(sheetWxml,/bindtap="onAvatarChange"/);
  });
  await test('ProfileEditor uses the dedicated chooseAvatar control',()=>{
    assert.match(profileWxml,/<button\b[^>]*open-type="chooseAvatar"[^>]*bindchooseavatar="onAvatarChange"/);
    assert.doesNotMatch(profileWxml,/bindtap="onAvatarChange"/);
  });
  await test('sheet forwards ProfileEditor events without changing payloads',()=>{
    const h=sheet();
    h.p.onProfileNativeAvatar({detail:{phase:'start',userId:'fixture',request:7}});
    h.p.onProfileNativeAvatar({detail:{phase:'end',request:7}});
    h.p.onProfileScrollTarget({detail:{id:'profile-name-field'}});
    h.p.onProfileClose({detail:{reason:'identity'}});
    assert.equal(h.p.data.sheetScrollTarget,'profile-name-field');
    assert.deepEqual(h.events.slice(-3),[
      {name:'nativeavatar',detail:{phase:'start',userId:'fixture',request:7}},
      {name:'nativeavatar',detail:{phase:'end',request:7}},
      {name:'close',detail:{reason:'identity'}},
    ]);
  });
  await test('repeated Profile validation re-arms Sheet scrolling',()=>{
    const h=sheet();
    h.p.onProfileScrollTarget({detail:{id:'profile-name-field'}});
    h.p.onProfileScrollTarget({detail:{id:'profile-name-field'}});
    assert.deepEqual(h.patches.slice(-4).map(p=>p.sheetScrollTarget),['','profile-name-field','','profile-name-field']);
  });
  await test('profile edits survive refresh while untouched fields still update',()=>{const h=profileEditor();h.state.profile.bio='old';enter(h);edit(h,'onProfileName','Unsaved');h.state.profile.bio='new';h.p.refresh();assert.equal(h.p.data.profileName,'Unsaved');assert.equal(h.p.data.profileBio,'new');edit(h,'onProfileBio','draft bio');h.p.refresh();assert.equal(h.p.data.profileBio,'draft bio');});
  await test('together edits survive unrelated refresh',()=>{const h=sheet();enterSheet(h,'together');edit(h,'onPartnerInput','draft partner');edit(h,'onSinceChange','2025-01-01');h.p.refresh();assert.equal(h.p.data.partner,'draft partner');assert.equal(h.p.data.since,'2025-01-01');});
  await test('close and reopen discard unsaved view edits, not Store',()=>{const h=profileEditor();enter(h);edit(h,'onProfileName','draft');leave(h);enter(h);assert.equal(h.p.data.profileName,'Saved');assert.equal(h.state.profile.name,'Saved');});
  await test('changing form type resets dirty flags',()=>{const h=profileEditor();enter(h);edit(h,'onProfileName','draft');leave(h);enter(h);assert.equal(h.p.data.profileName,'Saved');});
  await test('chooseAvatar path is persisted before draft preview',async()=>{const h=profileEditor();enter(h);const q=avatar(h,'wxfile://temporary');q.resolve('chosen');await flush();assert.equal(h.p.data.profileAvatar,'chosen');assert.deepEqual(q.calls,[{source:'wxfile://temporary',userId:'fixture',kind:'chooseAvatar'}]);h.p.refresh();assert.equal(h.p.data.profileAvatar,'chosen');});
  await test('old avatar cannot overwrite a closed and reopened profile',async()=>{const h=profileEditor();enter(h);const q=avatar(h);leave(h);enter(h);q.resolve('old');await flush();assert.notEqual(h.p.data.profileAvatar,'old');});
  await test('avatar callback cannot cross inactive or detached boundary',async()=>{for(const detached of [false,true]){const h=profileEditor();enter(h);const q=avatar(h);if(detached)h.spec.lifetimes.detached.call(h.p);else leave(h);q.resolve('old');await flush();assert.notEqual(h.p.data.profileAvatar,'old');}});
  await test('editor rechecks same-owner authorization at the UI boundary without starting verification',async()=>{const h=profileEditor();enter(h);let resumes=0;h.deps.identity.resumeNative=async token=>{resumes++;return token;};const q=avatar(h);q.resolve('chosen');await flush();assert.equal(h.p.data.profileAvatar,'chosen');assert.equal(resumes,1);});
  await test('chooseAvatar cancellation has no callback and leaves edited fields intact',async()=>{const h=profileEditor();enter(h);edit(h,'onProfileName','draft');await flush();assert.equal(h.p.data.profileName,'draft');assert.equal(h.p.data.profileUploading,false);assert.equal(h.state.profile.avatar,'/images/jamie.jpg');});
  await test('newer chooser wins even if old persistence completes last',async()=>{const h=profileEditor();enter(h);const a=avatar(h),b=avatar(h);b.resolve('new');await flush();a.resolve('old');await flush();assert.equal(h.p.data.profileAvatar,'new');});
  await test('avatar persistence survives app re-verification for the same owner',async()=>{const h=profileEditor();enter(h);edit(h,'onProfileName','draft');const q=avatar(h);assert(h.events.some(e=>e.name==='nativeavatar'&&e.detail.phase==='start'));h.state.identity={userId:'',generation:2,locked:true,status:'verifying'};h.emit();hide(h);assert.equal(h.p.data.profileName,'draft');h.state.identity={userId:'fixture',generation:2,locked:false,status:'verified'};h.emit();enter(h);q.resolve('chosen-after-resume');await flush();assert.equal(h.p.data.profileAvatar,'chosen-after-resume');assert.equal(h.p.data.profileName,'draft');});
  await test('avatar persistence is discarded after a different owner verifies',async()=>{const h=profileEditor();enter(h);const q=avatar(h);h.state.identity={userId:'',generation:2,locked:true,status:'verifying'};h.emit();h.state.identity={userId:'other',generation:2,locked:false,status:'verified'};h.emit();q.resolve('foreign');await flush();assert.notEqual(h.p.data.profileAvatar,'foreign');});
  await test('avatar selection only previews until Save, even when profile name is empty',async()=>{const h=profileEditor();h.state.profile.name='';enter(h);assert.equal(h.p.data.profileName,'');const q=avatar(h);q.resolve('/user/savor-photos/fixture/avatar.jpg');await flush();assert.equal(h.state.profile.avatar,'/images/jamie.jpg');assert.equal(h.p.data.profileAvatar,'/user/savor-photos/fixture/avatar.jpg');});
  await test('profile save failure stays open and reports the storage error',()=>{const h=profileEditor();enter(h);h.p.data.profileName='Saved';let notified=false;h.deps.store.notify=()=>{notified=true;};h.deps.store.updateProfile=()=>{throw Error('Storage unavailable. Free some space before saving; your input is still here.');};h.p.onProfileSave();assert(!h.events.some(e=>e.name==='close'));assert.equal(notified,false);assert.match(h.p.data.profileError,/Could not save/);});
  await test('empty profile name asks Sheet to reveal the name field',()=>{const h=profileEditor();enter(h);h.p.data.profileName='   ';h.p.onProfileSave();assert(h.events.some(e=>e.name==='scrolltarget'&&e.detail.id==='profile-name-field'));assert.match(h.p.data.profileError,/cannot be empty/);});
  await test('refresh cannot enable Save while avatar persistence is pending',async()=>{const h=profileEditor();enter(h);const q=avatar(h);h.p.refresh();assert.equal(h.p.data.profileUploading,true);h.p.onProfileSave();assert(!h.events.some(e=>e.name==='close'));q.resolve('ready');await flush();});
  await test('old completion never ends the newer native recovery',async()=>{const h=profileEditor();enter(h);const a=avatar(h),b=avatar(h);a.resolve('old');await flush();assert(!h.events.some(e=>e.name==='nativeavatar'&&e.detail.phase==='end'));b.resolve('new');await flush();assert.equal(h.p.data.profileAvatar,'new');assert.equal(h.events.filter(e=>e.name==='nativeavatar'&&e.detail.phase==='end').length,1);});
  await test('switch away and back invalidates old avatar persistence',async()=>{const h=profileEditor();enter(h);const q=avatar(h);leave(h);enter(h);q.resolve('old');await flush();assert.notEqual(h.p.data.profileAvatar,'old');});
  await test('transient null preserves current request and profile display',async()=>{const shell=sheet();enterSheet(shell);shell.p.onProfileNativeAvatar({detail:{phase:'start',userId:'fixture',request:1}});shell.p.data.type=null;shell.spec.observers['show, type, memoryId, filter'].call(shell.p);assert.equal(shell.p.data.displayType,'profile');const h=profileEditor();enter(h);const q=avatar(h);h.state.identity.status='verifying';hide(h);h.state.identity.status='verified';enter(h);q.resolve('chosen');await flush();assert.equal(h.p.data.profileAvatar,'chosen');});
  await test('callback before property restoration waits for the suspended current editor',async()=>{const h=profileEditor();enter(h);const q=avatar(h);h.state.identity={userId:'',generation:2,locked:true,status:'verifying'};h.emit();hide(h);h.state.identity={userId:'fixture',generation:2,locked:false,status:'verified'};h.emit();q.resolve('current');await flush();assert.notEqual(h.p.data.profileAvatar,'current');enter(h);await flush();assert.equal(h.p.data.profileAvatar,'current');});
  await test('explicit close releases suspended avatar without restoring it',async()=>{const h=profileEditor();enter(h);const q=avatar(h);h.state.identity.status='verifying';hide(h);q.resolve('old');await flush();leave(h);enter(h);await flush();assert.notEqual(h.p.data.profileAvatar,'old');});
  await test('preview load failure blocks Save; a new selection clears the error',async()=>{const h=profileEditor();enter(h);h.p.onImageError({currentTarget:{dataset:{source:h.p.data.profileAvatar}}});h.p.onProfileSave();assert(!h.events.some(e=>e.name==='close'));const q=avatar(h);q.resolve('new');await flush();assert.equal(Object.keys(h.p.data.imageErrors).length,0);h.p.onProfileSave();assert.equal(h.state.profile.avatar,'new');assert(h.events.some(e=>e.name==='close'));});
  await test('non-cancel image/FS/identity/program errors leave original avatar and show feedback',async()=>{for(const category of ['image','filesystem','identity','program']){const h=profileEditor();enter(h);const q=avatar(h);q.reject({category,code:'TEST_FAILED',message:'sensitive path'});await flush();assert.equal(h.state.profile.avatar,'/images/jamie.jpg');assert(h.p.data.profileError);assert(!h.p.data.profileError.includes('sensitive'));h.p.refresh();assert(h.p.data.profileError);}});
  console.log(count+' synthetic checks passed; no real chooser or user data touched.');
})().catch(e=>{console.error(e);process.exitCode=1;});
