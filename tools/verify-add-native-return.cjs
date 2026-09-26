// Production Add + i18n page projection (fixture store) and, further down, the production
// Add photo pipeline (real photos.js + identity.js + Store, simulated native layer).
// No cloud call and no real Save/upload is executed by the import section.
const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const os=require('node:os'),pathMod=require('node:path');
const photoRoots=[];
let passed=0;
// A suite that never reaches its summary (a pending await that never settles, so the event loop
// drains) would otherwise exit 0 and look green inside verify:all. Fail loudly instead.
let completed=false;
process.on('beforeExit',()=>{if(!completed){console.error('verify-add-native-return did not reach its summary: a pending await never settled');process.exitCode=1;}});
const flush=async()=>{for(let i=0;i<64;i++)await Promise.resolve();};
function harness(){
 let spec,choose,modal,writes=0,owner='fixture-a',generation=1,locked=false,verifyPromise,resolveVerify;
 const saved={actorUserId:owner,restaurant:'fixture existing',notes:'kept',photos:[],tags:[],rating:0,date:'2026-09-16',city:''};
 const fresh=()=>({...saved,restaurant:'',notes:'',actorUserId:locked?'':owner});
 const state={identity:{userId:owner,generation,locked},memories:[],settings:{theme:'pearl',reduceMotion:false,cuisines:[],dietary:'No restrictions'}};
 const token=()=>{if(locked)throw Error('LOCKED');return {userId:owner,generation,namespace:'fixture'};};
 const identity={lease:token,isDiagnosisActive:()=>false,isCurrent:t=>!locked&&t.userId===owner&&t.generation===generation,assertLease:t=>{assert.equal(t.userId,owner);assert.equal(t.generation,generation);assert.equal(locked,false);},resumeNative:async t=>{if(verifyPromise)await verifyPromise;const n=token();if(t.userId!==n.userId||t.namespace!==n.namespace)throw Error('STALE');return n;}};
 const store={freshDraft:fresh,loadDraft:()=>locked?fresh():({...saved,actorUserId:owner,restaurant:owner==='fixture-a'?saved.restaurant:'other fixture'}),get:()=>state,saveDraft(){writes++;throw Error('Unexpected draft write');},notify(){}};
 const scrolls=[];const wx={pageScrollTo:o=>scrolls.push(o.scrollTop),setNavigationBarColor(){},showModal:o=>modal=o};
 const i18nModule={exports:{}};
 vm.runInNewContext(fs.readFileSync('miniprogram/utils/i18n.js','utf8'),{module:i18nModule,require:p=>p==='./locales'?[]:p==='./pageHeadings'?{resolve:()=>({})}:p==='./store'?store:identity,wx});
 const deps={identity,identityCopy:()=>({}),localDate:{today:()=> '2026-09-17'},i18n:i18nModule.exports,uiFeedback:{},store,data:{},photos:{},metrics:{getMetrics:()=>({headerTop:60})},locations:{choose:()=>new Promise((resolve,reject)=>choose={resolve,reject}),confirmed:()=>true},shareImport:{},restaurantCategory:{TYPES:[],compareBranch:()=> 'same-name'},cloudRecords:{},importPolicy:{enabled:()=>false,cloudPlaceSearchEnabled:false}};
 vm.runInNewContext(fs.readFileSync('miniprogram/pages/add/index.js','utf8'),{Page:p=>spec=p,require:p=>deps[p.split('/').pop()],wx,Promise});
 const p={...spec,data:JSON.parse(JSON.stringify(spec.data)),active:true,saveLock:false,disposed:false,setData(x,cb){Object.assign(this.data,x);if(cb)cb();}};
 p.data.draft=store.loadDraft();p.syncContext(state);p.data.importOpen=true;p.data.importText='fixture shop';p.data.importCity='fixture city';p.data.importCandidate={name:'fixture shop',diningTypes:[],categorySuggestion:{}};p._nativeScrollTop=500;
 function startVerification(show=true){locked=true;generation++;verifyPromise=new Promise(r=>resolveVerify=r);state.identity={userId:'',locked,generation};p.onHide();p.syncContext(state);if(show)p.onShow();}
 function finishVerification(user='fixture-a'){owner=user;locked=false;state.identity={userId:owner,locked,generation};p.syncContext(state);resolveVerify();}
 return {p,store,state,saved,scrolls,writes:()=>writes,choose:()=>choose,modal:()=>modal,startVerification,finishVerification};
}
async function test(name,fn){await fn();passed++;console.log('PASS '+name);}
(async()=>{
 // The verification window must not blank the projection: "cannot read this owner's storage" is
 // not "this owner has no draft". The same-owner unlock still resolves to the same draft.
 await test('verification in the same generation never blanks the persisted draft projection',()=>{const h=harness();h.startVerification();assert.equal(h.p.data.draft.restaurant,'fixture existing');const generation=h.state.identity.generation;h.finishVerification();assert.equal(h.state.identity.generation,generation);assert.equal(h.p.data.draft.restaurant,'fixture existing');assert.equal(h.writes(),0);});
 await test('ordinary Store refresh does not overwrite an active draft projection',()=>{const h=harness();h.p.data.draft.restaurant='current UI';h.p.syncContext(h.state);assert.equal(h.p.data.draft.restaurant,'current UI');});
 await test('native cancel waits for same-owner verification and restores candidate, not adoption',async()=>{const h=harness();const task=h.p.onImportNativePick();h.startVerification();h.choose().reject({cancelled:true});await flush();assert.equal(h.p.data.importCandidate.name,'fixture shop','a transient verification window must not drop the import candidate');assert.equal(h.p.data.draft.restaurant,'fixture existing');h.finishVerification();await task;assert.equal(h.p.data.importCandidate.name,'fixture shop');assert.equal(h.p.data.importText,'fixture shop');assert.equal(h.p.data.importCity,'fixture city');assert.equal(h.p.data.importOpen,true);assert.equal(h.p.data.draft.restaurant,'fixture existing');assert.equal(h.p.locating,false);assert.equal(h.writes(),0);assert.equal(h.modal(),undefined);assert.equal(h.scrolls.at(-1),500);});
 await test('cancel callback before Page.onShow waits instead of dropping the candidate',async()=>{const h=harness();const task=h.p.onImportNativePick();h.startVerification(false);h.choose().reject({cancelled:true});await flush();assert.equal(h.p.data.importCandidate.name,'fixture shop','a transient verification window must not drop the import candidate');assert.equal(h.p.active,false);h.finishVerification();await flush();assert.equal(h.p.data.importCandidate.name,'fixture shop');h.p.onShow();await task;assert.equal(h.p.data.importCandidate.name,'fixture shop');assert.equal(h.p.data.draft.restaurant,'fixture existing');assert.equal(h.writes(),0);});
 await test('successful picker return still requires the existing branch confirmation',async()=>{const h=harness();const task=h.p.onImportNativePick();h.startVerification();h.choose().resolve({locationName:'fixture shop',address:'fixture address'});h.finishVerification();await task;assert(h.modal());assert.equal(h.p.data.importCandidate.confirmedLocation,undefined);assert.equal(h.p.data.draft.restaurant,'fixture existing');assert.equal(h.writes(),0);});
 await test('different owner never receives the old import candidate',async()=>{const h=harness();const task=h.p.onImportNativePick();h.startVerification();h.choose().reject({cancelled:true});h.finishVerification('fixture-b');await task;assert.equal(h.p.data.importCandidate,null);assert.equal(h.p.data.importOpen,false);assert.equal(h.p.data.draft.restaurant,'other fixture');assert.equal(h.writes(),0);});
 await test('Import cancel is inert inside the verification window',async()=>{const h=harness();h.p.data.importOpen=true;h.startVerification();h.p.onImportCancel();assert.equal(h.p.data.importOpen,true,'a locked window must not act on an import cancel');assert.equal(h.p.data.importCandidate.name,'fixture shop');assert.equal(h.p.data.importText,'fixture shop');h.finishVerification();assert.equal(h.p.data.importOpen,true);h.p.onImportCancel();assert.equal(h.p.data.importOpen,false);assert.equal(h.p.data.importCandidate,null);assert.equal(h.writes(),0);});
 await test('Import cancel after unlock still discards a delayed native completion',async()=>{const h=harness();const task=h.p.onImportNativePick();h.startVerification();h.finishVerification();h.p.onImportCancel();h.choose().reject({cancelled:true});await task;assert.equal(h.p.data.importOpen,false);assert.equal(h.p.data.importCandidate,null);assert.equal(h.writes(),0);});
 await test('new text prevents an older chooser from restoring its candidate',async()=>{const h=harness();const task=h.p.onImportNativePick();h.startVerification();h.finishVerification();h.p.onImportText({detail:{value:'new fixture text'}});h.choose().reject({cancelled:true});await task;assert.equal(h.p.data.importText,'new fixture text');assert.equal(h.p.data.importCandidate,null);});
 await test('unloaded or hidden Add is not reopened by a native result',async()=>{for(const unloaded of [false,true]){const h=harness();const task=h.p.onImportNativePick();h.startVerification();h.finishVerification();if(unloaded)h.p.disposed=true;else h.p.active=false;h.choose().reject({cancelled:true});await task;assert.equal(h.p.data.importCandidate.name,'fixture shop','a hidden/unloaded page keeps its own state and never adopts the native result');assert.equal(h.scrolls.length,0);assert.equal(h.writes(),0);}});
 await test('picker error preserves the scene and is not confused with a successful selection',async()=>{const h=harness();const task=h.p.onImportNativePick();h.choose().reject({message:'fixture picker unavailable'});await task;assert.equal(h.p.data.error,'fixture picker unavailable');assert.equal(h.p.data.importCandidate.name,'fixture shop');assert.equal(h.modal(),undefined);assert.equal(h.writes(),0);});
 await test('date picker remains native and has no cancel-to-reset binding',()=>{const wxml=fs.readFileSync('miniprogram/pages/add/index.wxml','utf8');assert.match(wxml,/<picker[^>]*mode="date"[^>]*bindchange="onDate"/);assert(!/bindcancel="[^"]*reset/i.test(wxml));});

 // ---------------------------------------------------------------------------
 // Add photo native-return. Real Add page + real photos.js + real identity.js + real
 // Store; only the native layer (chooser / compression / decode / file system / cloud
 // transport) is simulated, because the defect is an ordering contract between the
 // native chooser callback and the App.onShow re-verification.
 // ---------------------------------------------------------------------------
 const imageFixtures=require('./fixtures/shared-media-images.json');
 function photoHarness(options={}){
  const base=fs.mkdtempSync(pathMod.join(os.tmpdir(),'savor-add-photo-'));photoRoots.push(base);
  const source=base+'/picker-source.jpg',compressed=base+'/picker-compressed.jpg';
  fs.writeFileSync(source,Buffer.from(imageFixtures.jpegWithMetadata,'base64'));fs.writeFileSync(compressed,fs.readFileSync(source));
  const disk=new Map(),modules=new Map(),calls=[],logs=[],delays=[],pickGates=[];
  const uid=letter=>'u_'+letter.repeat(48);
  let spec,owner='a',pickReleased=false,copyGate=null,copyReleased=false,draftWrites=0,lastVerify=null;
  const FS={
   accessSync:p=>fs.accessSync(p),
   mkdirSync(p,recursive){fs.mkdirSync(p,{recursive});},
   statSync(p){const stat=fs.statSync(p);return {size:stat.size};},
   copyFile(o){calls.push('copy');const run=()=>{try{fs.copyFileSync(o.srcPath,o.destPath);}catch(error){o.fail(error);return;}o.success({});};if(options.holdCopy&&!copyReleased)copyGate=run;else run();},
   readFile(o){calls.push('read');try{o.success({data:fs.readFileSync(o.filePath)});}catch(error){o.fail(error);}},
   writeFile(o){calls.push('write');try{fs.writeFileSync(o.filePath,o.data);o.success({});}catch(error){o.fail(error);}},
  };
  const wx={
   env:{USER_DATA_PATH:base},getFileSystemManager:()=>FS,
   getSystemInfoSync:()=>({platform:'ios',language:'en',statusBarHeight:20,windowWidth:375}),
   getWindowInfo:()=>({statusBarHeight:20,windowWidth:375}),getAppBaseInfo:()=>({language:'en'}),
   getMenuButtonBoundingClientRect:()=>({top:44,height:32,left:280,width:87,bottom:76}),
   onNetworkStatusChange(){},
   getStorageSync:key=>disk.has(key)?disk.get(key):'',
   setStorageSync(key,value){disk.set(key,value);},
   removeStorageSync:key=>{disk.delete(key);},
   getStorageInfoSync:()=>({keys:Array.from(disk.keys())}),
   showModal(){},pageScrollTo(){},previewImage(){},setNavigationBarColor(){},switchTab(){},
   chooseMedia(o){calls.push('chooseMedia');const run=()=>{if(options.cancel){o.fail({errMsg:'chooseMedia:fail cancel'});return;}o.success({tempFiles:[{tempFilePath:source,size:10,sizeType:'compressed'}]});};if(options.holdPick&&!pickReleased)pickGates.push(run);else run();},
   chooseImage(o){calls.push('chooseImage');o.success({tempFilePaths:[source]});},
   compressImage(o){calls.push('compress');o.success({tempFilePath:compressed});},
   getImageInfo(o){calls.push('info');o.success({width:1,height:1,type:'jpeg'});},
   cloud:{init(){},async callFunction({name}){return {result:name==='account'?{success:true,protocolVersion:1,userId:uid(owner)}:{success:true,identityProtocol:1,userId:uid(owner)}};}},
  };
  const logger={error:(...args)=>logs.push(args.join(' ')),warn:(...args)=>logs.push(args.join(' ')),log(){}};
  // The 300ms hand-off delay is real production code; deferring it only lets a test place an
  // identity change inside the same window the device races with.
  function vmSetTimeout(fn,ms){if(options.deferDelays!==false&&ms>=250){delays.push(fn);return 0;}return setTimeout(fn,ms);}
  function load(relative){
   const file=pathMod.resolve(relative);if(modules.has(file))return modules.get(file).exports;
   const module={exports:{}};modules.set(file,module);
   const requireLocal=name=>name.startsWith('.')?load(pathMod.resolve(pathMod.dirname(file),name+'.js')):require(name);
   vm.runInNewContext(fs.readFileSync(file,'utf8'),{module,exports:module.exports,require:requireLocal,wx,console:logger,Promise,Date,Math,JSON,setTimeout:vmSetTimeout,clearTimeout,setInterval,clearInterval,Page:value=>{spec=value;},Component:()=>{},App:()=>{}},{filename:file});
   return module.exports;
  }
  const identity=load('miniprogram/utils/identity.js'),store=load('miniprogram/utils/store.js'),photos=load('miniprogram/utils/photos.js');
  const saveDraft=store.saveDraft.bind(store);
  store.saveDraft=function(draft){draftWrites++;return saveDraft(draft);};
  load('miniprogram/pages/add/index.js');
  const page={...spec,data:JSON.parse(JSON.stringify(spec.data)),active:true,saveLock:false,disposed:false,setData(patch,cb){Object.assign(this.data,patch);if(cb)cb();}};
  page.onLoad();
  const persistedDraft=()=>{try{const raw=identity.getStorageSync('savor-draft-v1');return raw?JSON.parse(raw):null;}catch(error){return null;}};
  return {
   p:page,identity,store,photos,calls,
   avatarLogs:()=>logs.filter(line=>line.includes('[avatar]')),
   draftWrites:()=>draftWrites,
   photoCount:()=>{const draft=persistedDraft();return draft&&Array.isArray(draft.photos)?draft.photos.length:0;},
   ready(){owner='a';lastVerify=identity.verify();return lastVerify;},
   appShow(letter){owner=letter;lastVerify=identity.verify();return lastVerify;},
   settle:()=>lastVerify,
   releasePick(){pickReleased=true;const run=pickGates.shift();if(run)run();},
   releaseCopy(){copyReleased=true;const run=copyGate;copyGate=null;if(run)run();},
   runDelays(limit=12){let n=0;while(delays.length&&n++<limit){const fn=delays.shift();try{fn();}catch(error){logs.push('delay '+error.message);}}},
  };
 }
 const photoFailures=[];
 async function photoTest(name,fn){try{await fn();passed++;console.log('PASS '+name);}catch(error){photoFailures.push(name);console.error('FAIL '+name);console.error('  '+(error&&error.message||error));}}
 async function photoRace(options={}){const h=photoHarness(options);await h.ready();h.p.onReplacePhoto();h.p.onHide();h.releasePick();await flush();return h;}

 await photoTest('photo: a hidden chooser result must not start persistence before App.onShow re-verification',async()=>{
  const h=await photoRace({holdPick:true,holdCopy:true});
  const started=h.calls.filter(call=>['compress','info','copy'].includes(call));
  if(started.length)console.error('  RED evidence: persistence entered before verification ['+started.join(',')+'] log='+JSON.stringify(h.avatarLogs()));
  assert.deepEqual(started,[],'the picker callback persisted before App.onShow re-verified identity');
  assert.equal(h.draftWrites(),0);
  h.releaseCopy();h.appShow('a');h.p.onShow();await h.settle();await flush();h.runDelays();await flush();
  assert.equal(h.photoCount(),1);
 });
 await photoTest('photo: the same owner verified after the picker returns resumes persistence and adds one photo',async()=>{
  const h=await photoRace({holdPick:true,holdCopy:true});
  h.appShow('a');h.p.onShow();await h.settle();await flush();h.releaseCopy();await flush();h.runDelays();await flush();
  if(h.photoCount()!==1)console.error('  RED evidence: photos='+h.photoCount()+' draftWrites='+h.draftWrites()+' log='+JSON.stringify(h.avatarLogs()));
  assert.equal(h.photoCount(),1,'the selected photo must be added exactly once');
  assert.equal(h.draftWrites(),1);
  assert.equal(h.p.data.uploading,false);
  assert.equal(h.p.data.error,'');
 });
 await photoTest('photo: a different owner verified after the picker returns discards the selection before any local write',async()=>{
  const h=await photoRace({holdPick:true,holdCopy:true});
  h.appShow('b');h.p.onShow();await h.settle();await flush();h.releaseCopy();await flush();h.runDelays();await flush();
  assert.equal(h.calls.filter(call=>call==='copy').length,0,'a foreign owner must never inherit the selected photo');
  assert.equal(h.draftWrites(),0);
  assert.equal(h.photoCount(),0);
  assert.equal(h.p.data.uploading,false);
 });
 await photoTest('photo: a selection already handed to the page is never written into a different owner draft',async()=>{
  const h=photoHarness();
  await h.ready();
  h.p.onReplacePhoto();await flush();
  assert(h.calls.includes('copy'),'the same-owner photo must still be persisted locally');
  h.appShow('b');await h.settle();await flush();h.runDelays();await flush();
  assert.equal(h.draftWrites(),0,'a stale selection leaked into the next owner draft');
  assert.equal(h.photoCount(),0);
 });
 await photoTest('photo: cancel clears uploading without a draft write or an error',async()=>{
  const h=await photoRace({holdPick:true,cancel:true});
  assert.equal(h.p.data.uploading,false);
  assert.equal(h.p.data.error,'');
  assert.equal(h.draftWrites(),0);
  h.appShow('a');h.p.onShow();await h.settle();await flush();
  assert.equal(h.p.data.uploading,false);
  assert.equal(h.p.data.error,'');
  assert.equal(h.photoCount(),0);
 });
 await photoTest('photo: a late picker result after unload is discarded instead of writing the draft',async()=>{
  const h=photoHarness({holdPick:true});
  await h.ready();
  h.p.onReplacePhoto();h.p.onHide();h.p.onUnload();h.releasePick();await flush();
  h.appShow('a');await h.settle();await flush();h.runDelays();await flush();
  assert.equal(h.draftWrites(),0,'an unloaded page wrote its stale draft snapshot');
  assert.equal(h.photoCount(),0);
 });
 await photoTest('photo: a newer request supersedes an older in-flight picker result',async()=>{
  const h=photoHarness({holdPick:true});
  await h.ready();
  h.p.onReplacePhoto();h.p.onHide();
  h.appShow('a');h.p.onShow();await h.settle();await flush();
  h.p.pickPhotos(1,false);
  h.releasePick();await flush();h.runDelays();await flush();
  assert.equal(h.draftWrites(),0,'the superseded picker result was applied');
  h.releasePick();await flush();h.runDelays();await flush();
  assert.equal(h.draftWrites(),1);
  assert.equal(h.photoCount(),1);
 });
 if(photoFailures.length)throw new Error(photoFailures.length+' Add photo native-return check(s) failed: '+photoFailures.join(' | '));
 completed=true;
 console.log(passed+' Add native-return checks passed, including the real photos.js/identity.js/Store photo pipeline; no real Save or cloud upload was executed.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{
 for(const root of photoRoots){
  const resolved=pathMod.resolve(root),temp=pathMod.resolve(os.tmpdir());
  if(pathMod.dirname(resolved)!==temp||!pathMod.basename(resolved).startsWith('savor-add-photo-'))throw Error('Unsafe cleanup');
  fs.rmSync(resolved,{recursive:true,force:true});
 }
});
