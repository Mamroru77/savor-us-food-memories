// Runs production functions with local fixtures only. No network, real preferences or files changed.
const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
let count=0;
const flush=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
async function test(name,fn){try{await fn();count++;console.log('PASS '+name);}catch(e){console.error('FAIL '+name);throw e;}}

function fixture(){
  // Production Store notifies every subscriber; the cross-layer cases below mount Me + Sheet +
  // ProfileEditor together, so the fixture must keep a listener list rather than one slot.
  const listeners=[];
  const state={
    settings:{theme:'pearl',language:'en',reduceMotion:false,reminders:true,privateByDefault:false,showLocations:true,dietary:'No restrictions',cuisines:[],loveSent:true,notificationsRead:true},
    profile:{name:'Saved',bio:'',avatar:'/images/jamie.jpg',avatarAsset:{formatVersion:1,localPath:'/images/jamie.jpg',digest:null,mime:'image/jpeg',width:1,height:1,source:'legacy',syncState:'local',remoteRef:null},partner:'fixture',togetherSince:'2026-01-01'},
    memories:Array.from({length:500},(_,i)=>({id:'fixture-'+i,notes:'x'.repeat(2000)})),
    outbox:[{privateNote:'not for the view'}],feedback:[],
    identity:{userId:'fixture',generation:1,locked:false,status:'verified'},
  };
  const identity={snapshot:()=>state.identity,lease:()=>({userId:'fixture',generation:state.identity.generation,namespace:'fixture'}),assertLease:token=>{if(!token||token.userId!=='fixture')throw Object.assign(Error('stale'),{code:'STALE_IDENTITY'});},resumeNative:async token=>token};
  const updates=[];
  const modalCalls=[];
  const deps={
    identity,
    identityCopy:()=>({verify:'Verify your account first'}),
    motionPresence:{update(){},dispose(){}},localDate:{today:()=> '2026-09-16'},
    i18n:{copy:()=>({}),options:()=>[],locale:()=> 'en',t:s=>s,modal:options=>{modalCalls.push(options);}},
    uiFeedback:require('../miniprogram/utils/uiFeedback'),
    store:{get:()=>state,subscribe:fn=>{listeners.push(fn);return()=>{const i=listeners.indexOf(fn);if(i>=0)listeners.splice(i,1);};},updateProfile:changes=>{state.profile={...state.profile,...changes};},updateSettings:changes=>{updates.push(JSON.parse(JSON.stringify(changes)));state.settings={...state.settings,...changes};},notify(){},canResolve:()=>false},
    pageHeadings:{},data:{},
    photos:{isCancelled:e=>!!e&&e.errMsg==='chooseMedia:fail cancel',logFailure:(e,stage)=>({category:stage==='identity'?'identity':e.category||'program',stage:stage||e.stage,code:e.code})},
    avatar:{},
    memoryStats:{},metrics:{getMetrics:()=>({headerTop:60})},
  };
  deps.nativeFlow=loadNativeFlow(identity);
  return {state,deps,updates,modalCalls,emit:()=>listeners.slice().forEach(fn=>fn(state))};
}

function loadNativeFlow(identity){
  const module={exports:{}};
  vm.runInNewContext(fs.readFileSync('miniprogram/utils/nativeFlow.js','utf8'),{
    module,exports:module.exports,require:p=>{if(p==='./identity')return identity;throw Error('Unexpected dependency '+p);},Promise,
  },{filename:'miniprogram/utils/nativeFlow.js'});
  return module.exports;
}

function loadComponent(file,deps,wxApi){
  let spec;
  vm.runInNewContext(fs.readFileSync(file,'utf8'),{
    Component:value=>{spec=value;},
    require:p=>{const key=p.split('/').pop();if(!(key in deps))throw Error('Unexpected dependency '+key);return deps[key];},
    console,wx:wxApi||{},Promise,Date,Math,setTimeout,clearTimeout,
  },{filename:file});
  return spec;
}

function sheet(){
  const base=fixture(),spec=loadComponent('miniprogram/components/sheet/index.js',base.deps),patches=[],events=[];
  const p={...spec.methods,data:{...JSON.parse(JSON.stringify(spec.data)),show:true,type:'help'},setData(patch,cb){patches.push(patch);Object.assign(this.data,patch);if(cb)cb();},triggerEvent(name,detail){events.push({name,detail});}};
  spec.lifetimes.attached.call(p);
  return {...base,p,spec,patches,events,emit:()=>base.emit()};
}

function profileEditor(wxApi){
  const base=fixture(),spec=loadComponent('miniprogram/components/profile-editor/index.js',base.deps,wxApi),patches=[],events=[];
  const p={...spec.methods,data:{...JSON.parse(JSON.stringify(spec.data)),active:false,show:false,dusk:false},setData(patch,cb){patches.push(patch);Object.assign(this.data,patch);if(cb)cb();},triggerEvent(name,detail){events.push({name,detail});}};
  spec.lifetimes.attached.call(p);
  return {...base,p,spec,patches,events,emit:()=>base.emit()};
}

function settingsEditor(type){
  const base=fixture(),spec=loadComponent('miniprogram/components/settings-editor/index.js',base.deps),patches=[],events=[];
  const p={...spec.methods,data:{...JSON.parse(JSON.stringify(spec.data)),active:true,show:true,type,dusk:false},setData(patch,cb){patches.push(patch);Object.assign(this.data,patch);if(cb)cb();},triggerEvent(name,detail){events.push({name,detail});}};
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
  h.deps.avatar.prepare=(source,owner,kind)=>{calls.push({source,userId:owner.userId,kind});return persisted.then(localPath=>({formatVersion:1,localPath,digest:null,mime:'image/jpeg',width:1,height:1,source:kind,syncState:'local',remoteRef:null}));};
  h.p.onAvatarRequest();
  const completion=h.p.onAvatarChange({detail:{avatarUrl:tempPath}});
  return {resolve,reject,completion,calls};
}
// The custom entry awaits a system chooser (wx.chooseMedia) instead of receiving a WeChat
// chooseAvatar callback, so this harness holds that native round trip open and decides when it
// lands. Everything after it is the same request/flow/owner machinery, so the record is shared
// across requests when a newer one must supersede an older one.
function customAvatar(h,options={}){
  const record=options.record||{picks:[],prepares:[]};
  let release;
  const picked=new Promise(resolve=>{release=resolve;});
  h.deps.avatar.chooseLocal=async owner=>{
    record.picks.push(owner.userId);
    await picked;
    return options.cancelled?'':(options.tempPath||'wxfile://custom-original');
  };
  h.deps.avatar.prepare=async(source,owner,kind)=>{record.prepares.push({source,userId:owner.userId,kind});(record.tokens||(record.tokens=[])).push(owner.generation);return {formatVersion:1,localPath:options.asset||'chosen-original',digest:null,mime:'image/jpeg',width:1600,height:1200,source:kind,syncState:'local',remoteRef:null};};
  const completion=h.p.onAvatarCustomRequest();
  return {record,release:()=>release(),completion};
}

// The mini program's own app lifecycle, as the component sees it. A system chooser (wx.chooseMedia)
// backgrounds the app, so App.onHide/App.onShow fire while the avatar flow is in flight — but the
// component's `show` property does not change, so the observer in profile-editor cannot see the
// round trip. This driver lets a test replay hide -> native callback -> show in the real order.
function appLifecycle(){
  const hide=[],show=[];
  const drop=(list,fn)=>{const i=list.indexOf(fn);if(i>=0)list.splice(i,1);};
  return {
    wx:{
      onAppHide:fn=>{hide.push(fn);},offAppHide:fn=>drop(hide,fn),
      onAppShow:fn=>{show.push(fn);},offAppShow:fn=>drop(show,fn),
    },
    listeners:()=>({hide:hide.length,show:show.length}),
    fireHide:()=>hide.slice().forEach(fn=>fn()),
    fireShow:()=>show.slice().forEach(fn=>fn()),
  };
}

// A faithful double for the native-return window. Two properties of utils/identity.js are
// load-bearing here and must not be smoothed over:
//   * verify() bumps the generation synchronously and emits while the verification is in flight
//     (identity.js:41) — that is the moment App.onShow makes a previously taken lease stale;
//   * resumeNative() awaits any in-flight verification before handing back a fresh lease
//     (identity.js:81), which is why resuming only after the re-verification has started is safe.
// nativeFlow holds a reference to the fixture's identity object, so the double patches it in place
// instead of replacing it.
function nativeReturnIdentity(h){
  const identity=h.deps.identity;
  let flight=null,settle=null,pendingOwner='fixture';
  identity.snapshot=()=>h.state.identity;
  identity.lease=()=>({userId:h.state.identity.userId,generation:h.state.identity.generation,namespace:'fixture'});
  identity.assertLease=token=>{
    if(!token||token.userId!==h.state.identity.userId||token.generation!==h.state.identity.generation)throw Object.assign(Error('stale'),{code:'STALE_IDENTITY'});
  };
  identity.resumeNative=async token=>{
    if(flight)await flight;
    const next=identity.lease();
    if(!token||token.userId!==next.userId||token.namespace!==next.namespace)throw Object.assign(Error('stale'),{code:'STALE_IDENTITY'});
    return next;
  };
  return {
    // App.onShow -> identity.verify(): the generation moves and the app is locked while verifying.
    startVerification(owner){pendingOwner=owner||'fixture';if(flight)return flight;h.state.identity={...h.state.identity,userId:'',generation:h.state.identity.generation+1,locked:true,status:'verifying'};h.emit();flight=new Promise(resolve=>{settle=resolve;}).then(()=>{h.state.identity={...h.state.identity,userId:pendingOwner,locked:false,status:'verified'};flight=null;h.emit();});return flight;},
    settle(){if(settle)settle();},
  };
}

// --- cross-layer: page identity synchronization vs. an in-flight avatar round trip ---
// A custom/system chooser (album, camera) sends the mini program through onHide -> onShow, so
// App.onShow runs identity.verify() while the profile sheet still holds the avatar request.
// Me.syncState -> i18n.syncPage used to clear the sheet binding on every identity generation
// change: the sheet hid, motionPresence unmounted it, ProfileEditor detached, and the pending
// request plus its native flow were destroyed before bindchooseavatar could deliver a result.
// Me uses the real i18n so this harness exercises the actual syncPage contract.
const realI18n=require('../miniprogram/utils/i18n.js');

function loadPage(file,deps){
  let spec;
  vm.runInNewContext(fs.readFileSync(file,'utf8'),{
    Page:value=>{spec=value;},
    require:p=>{const key=p.split('/').pop();if(!(key in deps))throw Error('Unexpected dependency '+key);return deps[key];},
    console,
    wx:{getMenuButtonBoundingClientRect:()=>({top:60,height:32,borderRadius:16}),pageScrollTo(){},setNavigationBarColor(){}},
    Promise,Date,Math,setTimeout,clearTimeout,
  },{filename:file});
  return spec;
}

function meProfile(){
  const base=fixture();
  // reduceMotion makes the sheet's exit synchronous. With motion enabled the same unmount
  // happens 320 ms later — in both cases it lands long before the chooser returns.
  base.state.settings.reduceMotion=true;
  const deps=Object.assign({},base.deps,{
    i18n:realI18n,
    // The real presence helper owns sheetMounted, which is what sheet/index.wxml gates the whole
    // modal (and therefore ProfileEditor) on. The shared fixture stubs it, so this harness must
    // not — otherwise "ProfileEditor detached" could never be observed.
    motionPresence:require('../miniprogram/utils/motionPresence'),
    data:{isSafeImage:()=>false,photos:{meal:'/images/le-comptoir.jpg'}},
    memoryStats:{summary:()=>({counts:[0,0,0,0,0,0,0],meals:0,places:0}),countSaved:()=>0,chart:()=>''},
  });
  const meSpec=loadPage('miniprogram/pages/me/index.js',deps);
  const sheetSpec=loadComponent('miniprogram/components/sheet/index.js',deps);
  const profileSpec=loadComponent('miniprogram/components/profile-editor/index.js',deps);
  let sheet,profile,profileAttached=true;
  const syncProfile=()=>{
    if(!profile||!sheet)return;
    const active=sheet.data.displayType==='profile',show=sheet.data.show;
    Object.assign(profile.data,{active,show,dusk:sheet.data.dusk});
    profileSpec.observers['active, show'].call(profile,active,show);
  };
  const me={...meSpec,data:JSON.parse(JSON.stringify(meSpec.data)),setData(patch,cb){
    Object.assign(this.data,patch);
    if(sheet&&(Object.hasOwn(patch,'sheetShow')||Object.hasOwn(patch,'sheetType'))){
      Object.assign(sheet.data,{show:this.data.sheetShow,type:this.data.sheetType});
      sheetSpec.observers['show, type, memoryId, filter'].call(sheet);
      syncProfile();
    }
    if(cb)cb();
  }};
  me.onLoad();
  sheet={...sheetSpec.methods,data:{...JSON.parse(JSON.stringify(sheetSpec.data)),show:false,type:''},setData(patch,cb){
    Object.assign(this.data,patch);
    // sheet/index.wxml is gated on wx:if="{{sheetMounted}}"; losing it detaches ProfileEditor.
    if(Object.hasOwn(patch,'sheetMounted')&&!this.data.sheetMounted&&profileAttached){
      profileAttached=false;
      profileSpec.lifetimes.detached.call(profile);
    }
    if(this.data.sheetMounted)profileAttached=true;
    syncProfile();
    if(cb)cb();
  },triggerEvent(name,detail){if(name==='close')me.onSheetClose({detail});}};
  profile={...profileSpec.methods,data:{...JSON.parse(JSON.stringify(profileSpec.data)),active:false,show:false,dusk:false},setData(patch,cb){Object.assign(this.data,patch);if(cb)cb();},triggerEvent(name,detail){if(name==='close')sheet.onProfileClose({detail});}};
  sheetSpec.lifetimes.attached.call(sheet);
  profileSpec.lifetimes.attached.call(profile);
  return {...base,me,sheet,profile,editorAttached:()=>profileAttached,openProfile(){me.onShow();me.onEditProfile();}};
}

(async()=>{
  const sheetWxml=fs.readFileSync('miniprogram/components/sheet/index.wxml','utf8');
  const profileWxml=fs.readFileSync('miniprogram/components/profile-editor/index.wxml','utf8');
  const sheetJson=JSON.parse(fs.readFileSync('miniprogram/components/sheet/index.json','utf8'));
  await test('sheet delegates settings views to SettingsEditor',()=>{
    assert.equal(sheetJson.usingComponents['settings-editor'],'/components/settings-editor/index');
    assert.match(sheetWxml,/<settings-editor\b/);
    assert.doesNotMatch(sheetWxml,/bindchange="onDietaryChange"/);
    assert.doesNotMatch(sheetWxml,/bindtap="onPrivateToggle"/);
  });
  await test('Preferences stays local until Save and survives Store refresh',()=>{
    const h=settingsEditor('preferences');
    h.p.onDietaryChange({detail:{value:'2'}});
    h.p.onCuisineTap({currentTarget:{dataset:{value:'Japanese'}}});
    h.state.settings.reminders=false;
    h.emit();
    assert.equal(h.p.data.dietary,'Vegan');
    assert(h.p.data.cuisines.includes('Japanese'));
    assert.equal(h.updates.length,0);
    h.p.onPreferencesSave();
    assert.deepEqual(h.updates,[{dietary:'Vegan',cuisines:['Japanese']}]);
    assert(h.events.some(e=>e.name==='close'));
  });
  await test('Settings and Privacy still apply immediately',()=>{
    const settings=settingsEditor('settings');
    settings.p.onThemeTap({currentTarget:{dataset:{value:'dusk'}}});
    settings.p.onRemindersToggle();
    assert.deepEqual(settings.updates,[{theme:'dusk'},{reminders:false}]);
    const privacy=settingsEditor('privacy');
    privacy.p.onPrivateToggle();
    privacy.p.onManageMemories();
    assert.deepEqual(privacy.updates,[{privateByDefault:true}]);
    assert.deepEqual(JSON.parse(JSON.stringify(privacy.events.at(-1))),{name:'sheetchange',detail:{type:'library',memoryId:'',filter:'all'}});
  });
  await test('sheet delegates profile UI to ProfileEditor',()=>{
    assert.equal(sheetJson.usingComponents['profile-editor'],'/components/profile-editor/index');
    assert.match(sheetWxml,/<profile-editor\b/);
    assert.doesNotMatch(sheetWxml,/bindtap="onAvatarChange"/);
    assert.doesNotMatch(sheetWxml,/nativeavatar/);
  });
  await test('ProfileEditor uses the dedicated chooseAvatar control',()=>{
    assert.match(profileWxml,/<button\b[^>]*open-type="chooseAvatar"[^>]*bindchooseavatar="onAvatarChange"/);
    assert.match(profileWxml,/<button\b[^>]*open-type="chooseAvatar"[^>]*bindtap="onAvatarRequest"/);
    assert.doesNotMatch(profileWxml,/bindtap="onAvatarChange"/);
  });
  await test('chooseAvatar rejects a result when the owner changed while the native chooser was open',async()=>{
    const h=profileEditor();enter(h);let prepares=0;
    h.deps.identity.lease=()=>({userId:h.state.identity.userId,generation:h.state.identity.generation,namespace:h.state.identity.userId});
    h.deps.identity.resumeNative=async owner=>{
      if(owner.userId!==h.state.identity.userId||owner.generation!==h.state.identity.generation)throw Object.assign(Error('stale'),{code:'STALE_IDENTITY'});
      return owner;
    };
    h.deps.avatar.prepare=async()=>{prepares++;return {localPath:'foreign'};};
    h.p.onAvatarRequest();
    h.state.identity={userId:'other',generation:2,locked:false,status:'verified'};
    await h.p.onAvatarChange({detail:{avatarUrl:'wxfile://foreign'}});
    assert.equal(prepares,0);
    assert.equal(h.p.data.profileAvatar,'/images/jamie.jpg');
    assert.equal(h.state.profile.avatar,'/images/jamie.jpg');
  });
  await test('chooseAvatar accepts the result after same-owner re-verification',async()=>{
    const h=profileEditor();enter(h);let prepared=false;
    h.deps.avatar.prepare=async()=>{prepared=true;return {localPath:'same-owner'};};
    h.p.onAvatarRequest();
    h.state.identity={userId:'',generation:2,locked:true,status:'verifying'};h.emit();
    h.state.identity={userId:'fixture',generation:2,locked:false,status:'verified'};h.emit();
    await h.p.onAvatarChange({detail:{avatarUrl:'wxfile://same-owner'}});
    assert.equal(prepared,true);
    assert.equal(h.p.data.profileAvatar,'same-owner');
  });
  await test('chooseAvatar drops a late native result after the editor closes',async()=>{
    const h=profileEditor();enter(h);let prepares=0;
    h.deps.avatar.prepare=async()=>{prepares++;return {localPath:'late'};};
    h.p.onAvatarRequest();leave(h);
    await h.p.onAvatarChange({detail:{avatarUrl:'wxfile://late'}});
    assert.equal(prepares,0);
    assert.equal(h.p.data.profileAvatar,'/images/jamie.jpg');
    assert.equal(h.state.profile.avatar,'/images/jamie.jpg');
  });
  await test('sheet forwards ProfileEditor navigation events',()=>{
    const h=sheet();
    h.p.onProfileScrollTarget({detail:{id:'profile-name-field'}});
    h.p.onProfileClose({detail:{reason:'identity'}});
    assert.equal(h.p.data.sheetScrollTarget,'profile-name-field');
    assert.deepEqual(h.events.slice(-1),[{name:'close',detail:{reason:'identity'}}]);
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
  // The request flow owns owner re-authorization: nativeFlow.run() resumes once before
  // persistence and once around it. The old callback-level resume was removed by design
  // (the flow already covers resume/stale-owner/visible-wait), so the count is 2, not 3.
  // The intent is unchanged: recheck the same owner without starting a new verification.
  await test('editor rechecks same-owner authorization before and around persistence without starting verification',async()=>{const h=profileEditor();enter(h);let resumes=0;h.deps.identity.resumeNative=async token=>{resumes++;return token;};const q=avatar(h);q.resolve('chosen');await flush();assert.equal(h.p.data.profileAvatar,'chosen');assert.equal(resumes,2);});
  await test('chooseAvatar cancellation leaves edited fields intact',async()=>{const h=profileEditor();enter(h);edit(h,'onProfileName','draft');const q=avatar(h);q.reject({errMsg:'chooseMedia:fail cancel'});await q.completion;assert.equal(h.p.data.profileName,'draft');assert.equal(h.p.data.profileUploading,false);assert.equal(h.state.profile.avatar,'/images/jamie.jpg');});
  await test('newer chooser wins even if old persistence completes last',async()=>{const h=profileEditor();enter(h);const a=avatar(h),b=avatar(h);b.resolve('new');await flush();a.resolve('old');await flush();assert.equal(h.p.data.profileAvatar,'new');});
  await test('avatar persistence survives app re-verification for the same owner',async()=>{const h=profileEditor();enter(h);edit(h,'onProfileName','draft');const q=avatar(h);await flush();assert(h.deps.nativeFlow.snapshot());h.state.identity={userId:'',generation:2,locked:true,status:'verifying'};h.emit();hide(h);assert.equal(h.p.data.profileName,'draft');h.state.identity={userId:'fixture',generation:2,locked:false,status:'verified'};h.emit();enter(h);q.resolve('chosen-after-resume');await flush();assert.equal(h.p.data.profileAvatar,'chosen-after-resume');assert.equal(h.p.data.profileName,'draft');});
  await test('avatar persistence is discarded after a different owner verifies',async()=>{const h=profileEditor();enter(h);const q=avatar(h);h.state.identity={userId:'',generation:2,locked:true,status:'verifying'};h.emit();h.state.identity={userId:'other',generation:2,locked:false,status:'verified'};h.emit();q.resolve('foreign');await flush();assert.notEqual(h.p.data.profileAvatar,'foreign');});
  await test('avatar selection only previews until Save, even when profile name is empty',async()=>{const h=profileEditor();h.state.profile.name='';enter(h);assert.equal(h.p.data.profileName,'');const q=avatar(h);q.resolve('/user/savor-photos/fixture/avatar.jpg');await flush();assert.equal(h.state.profile.avatar,'/images/jamie.jpg');assert.equal(h.p.data.profileAvatar,'/user/savor-photos/fixture/avatar.jpg');});
  await test('profile save failure stays open and reports the storage error',()=>{const h=profileEditor();enter(h);h.p.data.profileName='Saved';let notified=false;h.deps.store.notify=()=>{notified=true;};h.deps.store.updateProfile=()=>{throw Error('Storage unavailable. Free some space before saving; your input is still here.');};h.p.onProfileSave();assert(!h.events.some(e=>e.name==='close'));assert.equal(notified,false);assert.match(h.p.data.profileError,/Could not save/);});
  await test('empty profile name asks Sheet to reveal the name field',()=>{const h=profileEditor();enter(h);h.p.data.profileName='   ';h.p.onProfileSave();assert(h.events.some(e=>e.name==='scrolltarget'&&e.detail.id==='profile-name-field'));assert.match(h.p.data.profileError,/cannot be empty/);});
  await test('refresh cannot enable Save while avatar persistence is pending',async()=>{const h=profileEditor();enter(h);const q=avatar(h);await flush();h.p.refresh();assert.equal(h.p.data.profileUploading,true);h.p.onProfileSave();assert(!h.events.some(e=>e.name==='close'));q.resolve('ready');await flush();});
  await test('old completion never ends the newer native recovery',async()=>{const h=profileEditor();enter(h);const a=avatar(h),b=avatar(h);await flush();const current=h.deps.nativeFlow.snapshot().id;a.resolve('old');await flush();assert.equal(h.deps.nativeFlow.snapshot().id,current);b.resolve('new');await flush();assert.equal(h.p.data.profileAvatar,'new');assert.equal(h.deps.nativeFlow.snapshot(),null);});
  await test('switch away and back invalidates old avatar persistence',async()=>{const h=profileEditor();enter(h);const q=avatar(h);leave(h);enter(h);q.resolve('old');await flush();assert.notEqual(h.p.data.profileAvatar,'old');});
  await test('transient null preserves current request and profile display',async()=>{const shell=sheet();enterSheet(shell);const flow=shell.deps.nativeFlow.begin(shell.deps.identity.lease());shell.p.data.type=null;shell.spec.observers['show, type, memoryId, filter'].call(shell.p);assert.equal(shell.p.data.displayType,'profile');flow.cancel();const h=profileEditor();enter(h);const q=avatar(h);h.state.identity.status='verifying';hide(h);h.state.identity.status='verified';enter(h);q.resolve('chosen');await flush();assert.equal(h.p.data.profileAvatar,'chosen');});
  await test('callback before property restoration waits for the suspended current editor',async()=>{const h=profileEditor();enter(h);const q=avatar(h);h.state.identity={userId:'',generation:2,locked:true,status:'verifying'};h.emit();hide(h);h.state.identity={userId:'fixture',generation:2,locked:false,status:'verified'};h.emit();q.resolve('current');await flush();assert.notEqual(h.p.data.profileAvatar,'current');enter(h);await flush();assert.equal(h.p.data.profileAvatar,'current');});
  await test('explicit close releases suspended avatar without restoring it',async()=>{const h=profileEditor();enter(h);const q=avatar(h);h.state.identity.status='verifying';hide(h);q.resolve('old');await flush();leave(h);enter(h);await flush();assert.notEqual(h.p.data.profileAvatar,'old');});
  await test('preview load failure blocks Save; a new selection clears the error',async()=>{const h=profileEditor();enter(h);h.p.onImageError({currentTarget:{dataset:{source:h.p.data.profileAvatar}}});h.p.onProfileSave();assert(!h.events.some(e=>e.name==='close'));const q=avatar(h);q.resolve('new');await flush();assert.equal(Object.keys(h.p.data.imageErrors).length,0);h.p.onProfileSave();assert.equal(h.state.profile.avatarAsset.localPath,'new');assert(h.events.some(e=>e.name==='close'));});
  await test('non-cancel image/FS/identity/program errors leave original avatar and show feedback',async()=>{for(const category of ['image','filesystem','identity','program']){const h=profileEditor();enter(h);const q=avatar(h);q.reject({category,code:'TEST_FAILED',message:'sensitive path'});await flush();assert.equal(h.state.profile.avatar,'/images/jamie.jpg');assert(h.p.data.profileError);assert(!h.p.data.profileError.includes('sensitive'));h.p.refresh();assert(h.p.data.profileError);}});

  // --- native avatar flow must exist BEFORE the system chooser opens ---
  // Root cause: a custom/system album photo puts the mini program through onHide -> onShow
  // -> App.onShow -> identity.verify() -> generation change. Sheet/Me preserve an avatar
  // round trip only through nativeFlow.snapshot(); when the flow is created only inside the
  // bindchooseavatar callback it does not exist during that window, so the Sheet treats the
  // identity change as an ordinary one, hides the editor, and the callback is dropped.
  const chosenAsset=localPath=>({formatVersion:1,localPath,digest:null,mime:'image/jpeg',width:1,height:1,source:'chooseAvatar',syncState:'local',remoteRef:null});

  await test('avatar request establishes the native flow before the native chooser opens',()=>{
    const h=profileEditor();enter(h);
    h.p.onAvatarRequest();
    const flow=h.deps.nativeFlow.snapshot();
    assert.ok(flow,'the native flow must already exist while the system chooser is open');
    assert.equal(flow.userId,'fixture');
    leave(h);
    assert.equal(h.deps.nativeFlow.snapshot(),null,'closing the editor must release the pending flow');
  });

  await test('custom avatar callback that lands while the editor is hidden resumes after re-show',async()=>{
    const h=profileEditor();enter(h);
    const calls=[];
    h.deps.avatar.prepare=async(source,owner,kind)=>{calls.push({source,userId:owner.userId,kind});return chosenAsset('chosen-custom');};
    h.p.onAvatarRequest();
    assert.ok(h.deps.nativeFlow.snapshot(),'flow must exist before the chooser opens');
    h.state.identity={userId:'',generation:2,locked:true,status:'verifying'};h.emit();
    hide(h);
    h.state.identity={userId:'fixture',generation:2,locked:false,status:'verified'};h.emit();
    const completion=h.p.onAvatarChange({detail:{avatarUrl:'wxfile://custom'}});
    await flush();
    assert.equal(calls.length,0,'nothing may be persisted while the editor is hidden');
    enter(h);
    await completion;
    await flush();
    assert.equal(calls.length,1,'the custom avatar must be prepared exactly once');
    assert.deepEqual(calls[0],{source:'wxfile://custom',userId:'fixture',kind:'chooseAvatar'});
    assert.equal(h.p.data.profileAvatar,'chosen-custom');
    assert.equal(h.state.profile.avatar,'/images/jamie.jpg','selection only previews until Save');
  });

  // --- custom avatar entry: a system chooser for the original file ---
  // Device evidence: the WeChat chooseAvatar button returned a 132x132 derivative for a custom
  // album photo, far below the size the profile photo renders at. The custom entry must therefore
  // ask the system chooser for the original file. The WeChat-avatar entry keeps chooseAvatar; both
  // converge on the same avatarService.prepare -> preview -> Save path and share the request/flow
  // machinery that already proves same-owner resume, different-owner rejection and newer-wins.
  await test('ProfileEditor keeps the WeChat avatar control and adds a separate custom chooser',()=>{
    assert.match(profileWxml,/<button\b[^>]*open-type="chooseAvatar"[^>]*bindchooseavatar="onAvatarChange"/);
    assert.match(profileWxml,/<button\b[^>]*open-type="chooseAvatar"[^>]*bindtap="onAvatarRequest"/);
    assert.match(profileWxml,/bindtap="onAvatarCustomRequest"/);
    assert.doesNotMatch(profileWxml,/bindtap="onAvatarChange"/);
    for(const tag of profileWxml.match(/<[^>]+>/g)||[])assert(!(tag.includes('open-type="chooseAvatar"')&&tag.includes('onAvatarCustomRequest')),'the custom entry must not be the WeChat chooseAvatar button');
    const custom=(profileWxml.match(/<[^>]*onAvatarCustomRequest[^>]*>/)||[''])[0];
    assert.match(custom,/aria-label="\{\{copy\.s[0-9a-f]{10}\}\}"/);
  });

  await test('custom avatar request opens the system chooser for the original file with the flow already in place',async()=>{
    const h=profileEditor();enter(h);
    const q=customAvatar(h);
    assert.deepEqual(q.record.picks,['fixture'],'the request must open the system chooser');
    const open=h.deps.nativeFlow.snapshot();
    assert.ok(open,'the flow must exist before the system chooser opens');
    assert.equal(open.userId,'fixture');
    q.release();
    await q.completion;
    assert.deepEqual(q.record.prepares,[{source:'wxfile://custom-original',userId:'fixture',kind:'album'}]);
    assert.equal(h.p.data.profileAvatar,'chosen-original');
    assert.equal(h.deps.nativeFlow.snapshot(),null,'the finished request must release its flow');
  });

  await test('custom avatar selection only previews until Save',async()=>{
    const h=profileEditor();enter(h);h.p.data.profileName='Saved';
    const q=customAvatar(h);q.release();await q.completion;
    assert.equal(h.p.data.profileAvatar,'chosen-original');
    assert.equal(h.state.profile.avatar,'/images/jamie.jpg','a selection must not touch the Store');
    assert.equal(h.state.profile.avatarAsset.localPath,'/images/jamie.jpg');
    h.p.onProfileSave();
    assert.equal(h.state.profile.avatarAsset.localPath,'chosen-original');
    assert(h.events.some(e=>e.name==='close'));
  });

  await test('custom avatar cancellation leaves the draft untouched and releases the pending flow',async()=>{
    const h=profileEditor();enter(h);edit(h,'onProfileName','draft');
    const q=customAvatar(h,{cancelled:true});q.release();await q.completion;
    assert.deepEqual(q.record.prepares,[]);
    assert.equal(h.p.data.profileName,'draft');
    assert.equal(h.p.data.profileAvatar,'/images/jamie.jpg');
    assert.equal(h.p.data.profileUploading,false);
    assert.equal(h.state.profile.avatar,'/images/jamie.jpg');
    assert.equal(h.deps.nativeFlow.snapshot(),null,'a cancelled chooser must release its pending flow');
  });

  await test('custom avatar result is discarded after a different owner verifies',async()=>{
    const h=profileEditor();enter(h);
    h.deps.identity.lease=()=>({userId:h.state.identity.userId,generation:h.state.identity.generation,namespace:h.state.identity.userId});
    h.deps.identity.resumeNative=async owner=>{
      const current=h.state.identity;
      if(owner.userId!==current.userId||owner.generation!==current.generation)throw Object.assign(Error('stale'),{code:'STALE_IDENTITY'});
      return {...owner,generation:current.generation};
    };
    const q=customAvatar(h);
    // The native re-verification lands before the chooser returns: another owner is in session.
    h.state.identity={userId:'other',generation:2,locked:false,status:'verified'};
    q.release();await q.completion;
    assert.deepEqual(q.record.prepares,[]);
    assert.equal(h.p.data.profileAvatar,'/images/jamie.jpg');
    assert.equal(h.state.profile.avatar,'/images/jamie.jpg');
  });

  await test('custom avatar result is dropped after close and detach',async()=>{
    for(const mode of ['close','detach']){
      const h=profileEditor();enter(h);
      const q=customAvatar(h);
      if(mode==='close')leave(h);else h.spec.lifetimes.detached.call(h.p);
      q.release();
      await q.completion;
      assert.deepEqual(q.record.prepares,[],mode);
      assert.equal(h.p.data.profileAvatar,'/images/jamie.jpg',mode);
      assert.equal(h.state.profile.avatar,'/images/jamie.jpg',mode);
      assert.equal(h.deps.nativeFlow.snapshot(),null,mode);
    }
  });

  await test('a newer custom chooser supersedes an older one that resolves later',async()=>{
    const h=profileEditor();enter(h);
    const record={picks:[],prepares:[]};
    const first=customAvatar(h,{record,tempPath:'wxfile://first',asset:'old'});
    const second=customAvatar(h,{record,tempPath:'wxfile://second',asset:'new'});
    second.release();
    await second.completion;
    first.release();
    await first.completion;
    await flush();
    assert.deepEqual(record.prepares.map(p=>p.source),['wxfile://second']);
    assert.equal(h.p.data.profileAvatar,'new');
    assert.equal(h.state.profile.avatar,'/images/jamie.jpg');
    assert.equal(h.deps.nativeFlow.snapshot(),null);
  });

  // --- custom avatar: the native-return visibility barrier ---
  // Device evidence (37-entry trace): the custom chooser backgrounds the mini program, its success
  // callback reaches the JS layer BEFORE App.onShow runs identity.verify(), and the flow therefore
  // resumed on a pre-verification lease. persistPhoto's entry assertOwner passed, the ~250 ms
  // compressImage step ran, App.onShow then moved the generation, and the SECOND assertOwner threw
  // AVATAR_PREPARE_FAIL code=STALE_IDENTITY with no AVATAR_COPY_OK and no AVATAR_PREPARE_OK — the
  // original never became an AvatarAsset. nativeFlow.run() resumes only once before its task, so
  // the fix is a caller-level barrier: the editor must not let run() resume until the app has come
  // back AND the onShow re-verification has started. The component's `show` property never changes
  // when the app backgrounds, so the observer cannot see the round trip and the barrier has to
  // follow the app lifecycle itself.
  const NATIVE_RETURN_FALLBACK_MS=250;

  await test('custom avatar callback that lands before App.onShow must not start persistence',async()=>{
    const life=appLifecycle();
    const h=profileEditor(life.wx);enter(h);
    const identity=nativeReturnIdentity(h);
    const q=customAvatar(h);
    life.fireHide();                       // wx.chooseMedia backgrounds the mini program
    q.release();                           // ...the chooser callback arrives first...
    await flush();
    assert.deepEqual(q.record.prepares,[],'the callback must wait for the app to come back');
    life.fireShow();                       // ...then the app returns...
    await flush();
    assert.deepEqual(q.record.prepares,[],'returning alone must not release the flow');
    identity.startVerification();          // ...App.onShow -> identity.verify() -> epoch++
    await flush();
    assert.deepEqual(q.record.prepares,[],'the re-verification is still in flight');
    identity.settle();                     // the same owner verifies
    await flush();
    assert.equal(q.record.prepares.length,1,'the custom avatar must be prepared exactly once');
    assert.deepEqual(q.record.prepares[0],{source:'wxfile://custom-original',userId:'fixture',kind:'album'});
    assert.deepEqual(q.record.tokens,[2],'persistence must run on a post-verification lease');
    assert.equal(h.p.data.profileAvatar,'chosen-original');
    assert.equal(h.state.profile.avatar,'/images/jamie.jpg','selection only previews until Save');
    assert.equal(h.deps.nativeFlow.snapshot(),null,'the finished request must release its flow');
    leave(h);
  });

  await test('the barrier never strands the flow when the app return reports no identity progress',async()=>{
    const life=appLifecycle();
    const h=profileEditor(life.wx);enter(h);
    const q=customAvatar(h);
    life.fireHide();
    q.release();
    await flush();
    assert.deepEqual(q.record.prepares,[],'still waiting for the app to come back');
    life.fireShow();                       // no App.onShow verification follows
    await flush();
    assert.deepEqual(q.record.prepares,[],'the barrier must hold until its bounded fallback');
    await new Promise(resolve=>setTimeout(resolve,NATIVE_RETURN_FALLBACK_MS+150));
    await flush();
    assert.equal(q.record.prepares.length,1,'a bounded fallback must release the suspended flow');
    assert.equal(h.p.data.profileAvatar,'chosen-original');
    leave(h);
  });

  await test('the barrier is inert when the app never backgrounds',async()=>{
    const life=appLifecycle();
    const h=profileEditor(life.wx);enter(h);
    assert.deepEqual(life.listeners(),{hide:1,show:1},'the editor must watch the app lifecycle');
    const q=customAvatar(h);
    q.release();
    await q.completion;
    await flush();
    assert.equal(q.record.prepares.length,1,'a chooser that never hides the app must persist as before');
    assert.equal(h.p.data.profileAvatar,'chosen-original');
    assert.equal(h.deps.nativeFlow.snapshot(),null);

    // The WeChat chooseAvatar entry never backgrounds the app either, so it is untouched.
    const wechat=profileEditor(life.wx);enter(wechat);
    const q2=avatar(wechat,'wxfile://temporary');
    q2.resolve('chosen');
    await flush();
    assert.equal(wechat.p.data.profileAvatar,'chosen');
    assert.deepEqual(q2.calls,[{source:'wxfile://temporary',userId:'fixture',kind:'chooseAvatar'}]);
    leave(h);leave(wechat);
  });

  await test('a different owner verifying during the native round trip still discards the result',async()=>{
    const life=appLifecycle();
    const h=profileEditor(life.wx);enter(h);
    const identity=nativeReturnIdentity(h);
    const q=customAvatar(h);
    life.fireHide();
    q.release();
    await flush();
    life.fireShow();
    identity.startVerification('other');
    await flush();
    identity.settle();
    await q.completion;
    await flush();
    assert.deepEqual(q.record.prepares,[],'a foreign owner must never inherit the native result');
    assert.equal(h.state.profile.avatar,'/images/jamie.jpg','a foreign owner must never write the Store');
    assert.notEqual(h.p.data.profileAvatar,'chosen-original','the foreign result must never preview');
    assert.equal(h.deps.nativeFlow.snapshot(),null);
  });

  await test('close and detach during the native round trip drop the callback and stop watching the app',async()=>{
    for(const mode of ['close','detach']){
      const life=appLifecycle();
      const h=profileEditor(life.wx);enter(h);
      const identity=nativeReturnIdentity(h);
      const q=customAvatar(h);
      life.fireHide();
      q.release();
      await flush();
      assert.deepEqual(q.record.prepares,[],mode);
      if(mode==='close')leave(h);else h.spec.lifetimes.detached.call(h.p);
      assert.deepEqual(life.listeners(),mode==='detach'?{hide:0,show:0}:{hide:1,show:1},mode+' must release its app lifecycle listeners exactly when it detaches');
      life.fireShow();
      identity.startVerification();
      await flush();
      identity.settle();
      await q.completion;
      await flush();
      assert.deepEqual(q.record.prepares,[],mode);
      assert.notEqual(h.p.data.profileAvatar,'chosen-original',mode+' must never preview the dropped result');
      assert.equal(h.state.profile.avatar,'/images/jamie.jpg',mode);
      assert.equal(h.deps.nativeFlow.snapshot(),null,mode);
    }
  });

  await test('a newer custom chooser wins across a native return, so the older callback cannot write',async()=>{
    const life=appLifecycle();
    const h=profileEditor(life.wx);enter(h);
    const identity=nativeReturnIdentity(h);
    const record={picks:[],prepares:[]};
    const first=customAvatar(h,{record,tempPath:'wxfile://first',asset:'old'});
    const second=customAvatar(h,{record,tempPath:'wxfile://second',asset:'new'});
    life.fireHide();                       // suspends whichever request is current
    life.fireShow();
    identity.startVerification();
    await flush();
    identity.settle();
    await flush();
    second.release();
    await second.completion;
    await flush();
    first.release();
    await first.completion;
    await flush();
    assert.deepEqual(record.prepares.map(p=>p.source),['wxfile://second']);
    assert.deepEqual(record.tokens,[2]);
    assert.equal(h.p.data.profileAvatar,'new');
    assert.equal(h.state.profile.avatar,'/images/jamie.jpg');
    assert.equal(h.deps.nativeFlow.snapshot(),null);
    leave(h);
  });

  await test('cancelling the custom chooser across a native return prepares nothing and releases the flow',async()=>{
    const life=appLifecycle();
    const h=profileEditor(life.wx);enter(h);edit(h,'onProfileName','draft');
    const identity=nativeReturnIdentity(h);
    const q=customAvatar(h,{cancelled:true});
    life.fireHide();
    q.release();
    await q.completion;
    assert.deepEqual(q.record.prepares,[]);
    assert.equal(h.p.data.profileName,'draft','cancelling the chooser must not disturb the draft');
    assert.equal(h.p.data.profileAvatar,'/images/jamie.jpg');
    assert.equal(h.p.data.profileUploading,false);
    assert.equal(h.deps.nativeFlow.snapshot(),null,'a cancelled chooser must release its pending flow');
    // The app still returns and re-verifies; the cancelled request must stay cancelled across it.
    life.fireShow();
    identity.startVerification();
    await flush();
    identity.settle();
    await flush();
    assert.deepEqual(q.record.prepares,[]);
    assert.equal(h.state.profile.avatar,'/images/jamie.jpg','a cancelled chooser must never touch the Store');
    leave(h);
  });

  await test('sheet preserves an in-flight avatar flow across identity re-verification',()=>{
    const h=sheet();enterSheet(h,'profile');
    const flow=h.deps.nativeFlow.begin(h.deps.identity.lease());
    h.state.identity={userId:'',generation:2,locked:true,status:'verifying'};h.emit();
    assert.equal(h.p.data.show,true,'an active avatar flow must keep the sheet open');
    assert(!h.events.some(e=>e.name==='close'&&e.detail&&e.detail.reason==='identity'));
    h.state.identity={userId:'fixture',generation:2,locked:false,status:'verified'};h.emit();
    assert.equal(h.p.data.show,true);
    flow.finish();
  });

  await test('a pending avatar request is released by close, detach and a newer request',()=>{
    const closed=profileEditor();enter(closed);closed.p.onAvatarRequest();
    assert.ok(closed.deps.nativeFlow.snapshot());
    leave(closed);
    assert.equal(closed.deps.nativeFlow.snapshot(),null);

    const detached=profileEditor();enter(detached);detached.p.onAvatarRequest();
    detached.spec.lifetimes.detached.call(detached.p);
    assert.equal(detached.deps.nativeFlow.snapshot(),null);

    const newer=profileEditor();enter(newer);newer.p.onAvatarRequest();
    const first=newer.deps.nativeFlow.snapshot().id;
    newer.p.onAvatarRequest();
    const second=newer.deps.nativeFlow.snapshot();
    assert.ok(second&&second.id!==first,'a newer request must replace the older pending flow');
    leave(newer);
    assert.equal(newer.deps.nativeFlow.snapshot(),null);
  });

  await test('a pending chooser neither reports uploading nor blocks Profile save',()=>{
    const h=profileEditor();enter(h);h.p.data.profileName='Saved';
    h.p.onAvatarRequest();
    assert.equal(h.p.data.profileUploading,false,'opening the chooser must not report uploading');
    h.p.refresh();
    assert.equal(h.p.data.profileUploading,false);
    h.p.onProfileSave();
    assert(h.events.some(e=>e.name==='close'),'a pending chooser must not block saving the profile');
  });

  await test('a second chooser supersedes an in-flight upload without stranding the Save lock',async()=>{
    const h=profileEditor();enter(h);h.p.data.profileName='Saved';
    const first=avatar(h);
    await flush();
    assert.equal(h.p.data.profileUploading,true,'the first upload must be reported as pending');
    h.p.onAvatarRequest();
    assert.equal(h.p.data.profileUploading,false,'a newer chooser must release the superseded upload lock');
    h.p.onProfileSave();
    assert(h.events.some(e=>e.name==='close'),'a superseded upload must not block saving the profile');
    first.resolve('old');
    await flush();
    assert.notEqual(h.p.data.profileAvatar,'old');
  });

  await test('a second complete replacement wins after the first selection already previewed',async()=>{
    const h=profileEditor();enter(h);
    const calls=[];
    h.deps.avatar.prepare=async(source)=>{calls.push(source);return chosenAsset(source);};
    h.p.onAvatarRequest();
    await h.p.onAvatarChange({detail:{avatarUrl:'wxfile://first'}});
    await flush();
    assert.equal(h.p.data.profileAvatar,'wxfile://first');
    assert.equal(h.deps.nativeFlow.snapshot(),null,'the first flow must be released');
    assert.equal(h.p.data.profileUploading,false);
    h.p.onAvatarRequest();
    await h.p.onAvatarChange({detail:{avatarUrl:'wxfile://second'}});
    await flush();
    assert.equal(h.p.data.profileAvatar,'wxfile://second');
    assert.deepEqual(calls,['wxfile://first','wxfile://second']);
    assert.equal(h.deps.nativeFlow.snapshot(),null);
    h.p.data.profileName='Saved';
    h.p.onProfileSave();
    assert.equal(h.state.profile.avatarAsset.localPath,'wxfile://second','Save must persist the replacement');
    assert(h.events.some(e=>e.name==='close'));
  });

  await test('a pending avatar request is dropped when a different owner verifies',async()=>{
    const h=profileEditor();enter(h);let prepares=0;
    h.deps.identity.lease=()=>({userId:h.state.identity.userId,generation:h.state.identity.generation,namespace:h.state.identity.userId});
    h.deps.identity.resumeNative=async owner=>{
      if(owner.userId!==h.state.identity.userId||owner.generation!==h.state.identity.generation)throw Object.assign(Error('stale'),{code:'STALE_IDENTITY'});
      return owner;
    };
    h.deps.avatar.prepare=async()=>{prepares++;return chosenAsset('foreign');};
    h.p.onAvatarRequest();
    h.state.identity={userId:'other',generation:2,locked:false,status:'verified'};h.emit();
    await h.p.onAvatarChange({detail:{avatarUrl:'wxfile://foreign'}});
    assert.equal(prepares,0);
    assert.equal(h.state.profile.avatar,'/images/jamie.jpg');
  });

  await test('a late custom avatar callback after close never prepares',async()=>{
    const h=profileEditor();enter(h);let prepares=0;
    h.deps.avatar.prepare=async()=>{prepares++;return chosenAsset('late');};
    h.p.onAvatarRequest();
    leave(h);
    await h.p.onAvatarChange({detail:{avatarUrl:'wxfile://late'}});
    assert.equal(prepares,0);
    assert.equal(h.p.data.profileAvatar,'/images/jamie.jpg');
  });

  await test('a callback without an avatar result releases the pending flow',async()=>{
    const h=profileEditor();enter(h);h.p.data.profileName='Saved';let prepares=0;
    h.deps.avatar.prepare=async()=>{prepares++;return chosenAsset('none');};
    h.p.onAvatarRequest();
    await h.p.onAvatarChange({detail:{}});
    assert.equal(prepares,0);
    assert.equal(h.deps.nativeFlow.snapshot(),null,'a result-less callback must not leave the flow pending');
    assert.equal(h.p.data.profileUploading,false);
    h.p.onProfileSave();
    assert(h.events.some(e=>e.name==='close'),'a finished chooser must not block saving');
  });

  // --- Me + Sheet + ProfileEditor: page identity sync must not destroy the avatar round trip ---
  // Device evidence: A (WeChat avatar) passes because the in-client panel never hides the mini
  // program. B/C (album / camera) always hide it, so App.onShow re-verifies identity while the
  // profile sheet still owns the avatar request. The page-level sync closed the sheet inside that
  // window, the editor was detached, and the request was destroyed with no callback and no log.

  await test('page identity sync preserves the profile sheet and its avatar request until the same owner verifies',async()=>{
    const h=meProfile();
    h.openProfile();
    assert.equal(h.me.data.sheetShow,true);
    assert.equal(h.me.data.sheetType,'profile');
    assert.equal(h.editorAttached(),true);

    const calls=[];
    h.deps.avatar.prepare=async(source,owner,kind)=>{calls.push({source,userId:owner.userId,kind});return chosenAsset('custom-avatar');};
    h.profile.onAvatarRequest();
    assert.ok(h.deps.nativeFlow.snapshot(),'the native flow must exist while the chooser is open');

    // Native return: App.onShow -> identity.verify() -> generation change, still verifying.
    h.state.identity={userId:'',generation:2,locked:true,status:'verifying'};h.emit();

    assert.equal(h.me.data.sheetShow,true,'an in-flight avatar round trip must keep the sheet open');
    assert.equal(h.me.data.sheetType,'profile','the sheet type must survive the identity change');
    assert.equal(h.sheet.data.show,true,'Sheet must not hide');
    assert.equal(h.sheet.data.sheetMounted,true,'Sheet must not unmount');
    assert.equal(h.editorAttached(),true,'ProfileEditor must not detach');
    assert.ok(h.deps.nativeFlow.snapshot(),'the native flow must survive the identity change');
    assert.ok(h.profile._avatarRequest,'the editor must still own the request');

    // Same owner verifies: the existing resume path re-shows the sheet and the result is consumed.
    h.state.identity={userId:'fixture',generation:2,locked:false,status:'verified'};h.emit();
    assert.equal(h.me.data.sheetShow,true);
    await h.profile.onAvatarChange({detail:{avatarUrl:'wxfile://custom'}});
    await flush();
    assert.equal(calls.length,1,'the custom avatar must be prepared exactly once');
    assert.deepEqual(calls[0],{source:'wxfile://custom',userId:'fixture',kind:'chooseAvatar'});
    assert.equal(h.profile.data.profileAvatar,'custom-avatar');
    assert.equal(h.state.profile.avatar,'/images/jamie.jpg','selection only previews until Save');
  });

  await test('a different owner verifying still cancels the avatar flow, closes the sheet and blocks the callback',async()=>{
    const h=meProfile();
    h.openProfile();
    let prepares=0;
    h.deps.identity.lease=()=>({userId:h.state.identity.userId,generation:h.state.identity.generation,namespace:h.state.identity.userId});
    h.deps.identity.resumeNative=async owner=>{
      if(owner.userId!==h.state.identity.userId||owner.generation!==h.state.identity.generation)throw Object.assign(Error('stale'),{code:'STALE_IDENTITY'});
      return owner;
    };
    h.deps.avatar.prepare=async()=>{prepares++;return chosenAsset('foreign');};
    h.profile.onAvatarRequest();
    assert.ok(h.deps.nativeFlow.snapshot());

    // The owner is unknown while verifying, so the round trip is preserved optimistically...
    h.state.identity={userId:'',generation:2,locked:true,status:'verifying'};h.emit();
    assert.equal(h.me.data.sheetShow,true);

    // ...but a different owner must never inherit it.
    h.state.identity={userId:'other',generation:2,locked:false,status:'verified'};h.emit();
    assert.equal(h.deps.nativeFlow.snapshot(),null,'a different owner must cancel the pending flow');
    assert.equal(h.me.data.sheetShow,false,'a different owner must close the sheet');
    assert.equal(h.me.data.sheetType,'');
    assert.equal(h.profile._avatarRequest,null,'the editor must drop the foreign request');
    await h.profile.onAvatarChange({detail:{avatarUrl:'wxfile://foreign'}});
    await flush();
    assert.equal(prepares,0);
    assert.equal(h.state.profile.avatar,'/images/jamie.jpg');
  });

  await test('an ordinary identity generation change still closes the sheet when no avatar flow is pending',()=>{
    const h=meProfile();
    h.openProfile();
    assert.equal(h.me.data.sheetShow,true);
    h.state.identity={userId:'',generation:2,locked:true,status:'verifying'};h.emit();
    assert.equal(h.me.data.sheetShow,false,'without an avatar flow the sheet must close as before');
    assert.equal(h.me.data.sheetType,'');
    assert.equal(h.editorAttached(),false);

    // The preservation rule is scoped to the profile sheet: a flow on any other sheet is not
    // preserved. (Not reachable through the UI — Me.onSheetChange cancels the flow — but the
    // condition is part of the contract and is pinned here.)
    const other=meProfile();
    other.state.memories=[];
    other.me.onShow();
    other.me.openSheet('library');
    other.deps.nativeFlow.begin(other.deps.identity.lease());
    other.state.identity={userId:'',generation:2,locked:true,status:'verifying'};other.emit();
    assert.equal(other.me.data.sheetShow,false,'only the profile sheet may be preserved');
  });

  await test('sync status offers keeping a locally edited record whose cloud copy was deleted',async()=>{
    const h=sheet();
    h.p.data.type='sync';
    const memory={id:'rec-deleted',cloudId:'rec-deleted',restaurant:'Deleted dinner',revision:1};
    h.state.outbox=[{id:'op-keep',recordId:'rec-deleted',kind:'update',error:'DELETED',message:'This record was deleted.',base:memory,memory:{...memory,restaurant:'My kept edit'}}];
    h.deps.store.canResolve=code=>code==='DELETED';
    h.deps.store.keepLocalEdit=id=>{h.kept=id;return Promise.resolve();};
    h.p.refresh();
    const row=h.p.data.syncRows[0];
    assert.equal(row.keepable,true,'a tombstoned edit must offer a way to keep the local content');
    assert.equal(row.conflict,true,'the tombstone still needs an explicit decision');
    assert.equal(row.status,'Needs review');
    assert.equal(row.message,'This record was deleted.');
    assert.equal(typeof h.p.onKeepEdit,'function');
    h.p.onKeepEdit({currentTarget:{dataset:{id:'rec-deleted'}}});
    assert.equal(h.modalCalls.length,1);
    assert.equal(h.modalCalls[0].title,'Keep my edit');
    h.modalCalls[0].success({confirm:true});
    await flush();
    assert.equal(h.kept,'rec-deleted','confirming keeps the edit instead of discarding it');

    // The keep action is specific to a tombstone: a live conflict is never
    // duplicated into a new record, and an in-flight create is not a decision.
    h.state.outbox=[{id:'op-conflict',recordId:'rec-conflict',kind:'update',error:'CONFLICT',message:'The cloud record changed.',base:memory,memory}];
    h.deps.store.canResolve=code=>code==='CONFLICT'||code==='DELETED';
    h.p.refresh();
    assert.equal(h.p.data.syncRows[0].keepable,false,'a live conflict must not be duplicated');
    h.state.outbox=[{id:'op-recreate',recordId:'rec-deleted',kind:'recreate',base:memory,memory:{...memory,restaurant:'My kept edit'}}];
    h.deps.store.canResolve=()=>false;
    h.p.refresh();
    assert.equal(h.p.data.syncRows[0].keepable,false,'an in-flight create is not a decision');
    assert.equal(h.p.data.syncRows[0].kind,'New memory','the queued create is labelled as a new memory');
    assert.equal(h.p.data.syncRows[0].status,'Pending');
  });

  console.log(count+' synthetic checks passed; no real chooser or user data touched.');
})().catch(e=>{console.error(e);process.exitCode=1;});
