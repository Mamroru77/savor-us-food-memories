// Production avatar/photos + Workspace + identity + Store. Real host file I/O, simulated wx APIs.
// getImageInfo/chooser/compression are contracts, NOT an iOS/Android decoder or lifecycle test.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),os=require('node:os');
const fixtures=require('./fixtures/shared-media-images.json');
const png=Buffer.from(fixtures.png,'base64'),jpg=fs.readFileSync('miniprogram/images/coffee.jpg');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'savor-avatar-check-'));
const uid=letter=>'u_'+letter.repeat(48);
let checks=0;
async function test(name,fn){await fn();checks++;console.log('PASS '+name);}
const tick=()=>new Promise(setImmediate);
function runtime(options={},disk=new Map(),base=fs.mkdtempSync(path.join(root,'case-'))){
  const cache=new Map(),logs=[],calls=[],mediaCalls=[],compressCalls=[],compressionOutputs=new Set(),dimensions=new Map();
  const source=base+'/source.jpg',compressed=base+'/compressed.png',original=base+'/original.jpg',derivative=base+'/wechat-avatar-132.jpg';
  let pageSpec,sheetSpec,profileSpec;
  fs.writeFileSync(source,png); // Deliberately misleading suffix.
  fs.writeFileSync(compressed,jpg);
  // Device evidence: the WeChat chooseAvatar button returns a 132x132 derivative. The custom
  // entry must hand avatarService.prepare the original file instead, so this harness models
  // decoded dimensions per path and propagates them through copy/compress.
  fs.writeFileSync(original,jpg);dimensions.set(original,{width:options.originalWidth||1600,height:options.originalHeight||1200});
  fs.writeFileSync(derivative,jpg);dimensions.set(derivative,{width:132,height:132});
  let owner='a',holdPick,holdCopy,failStorage=false,failOnce=false,storageWrites=0;
  const apiError=()=>({errMsg:'native failed /private/owner/image-data',errCode:1001});
  const FS={
    accessSync:p=>fs.accessSync(p),
    mkdirSync(p,recursive){if(options.mkdirFails)throw apiError();fs.mkdirSync(p,{recursive});},
    statSync(p){if(options.statFails)throw apiError();return options.zeroStat?{size:0}:fs.statSync(p);},
    copyFile(o){calls.push('copy');const run=()=>{if(options.copyFails){o.fail(apiError());return;}try{fs.copyFileSync(o.srcPath,o.destPath);}catch(e){o.fail(e);return;}const dim=dimensions.get(o.srcPath);if(dim)dimensions.set(o.destPath,dim);o.success();};if(options.holdCopy)holdCopy=run;else run();},
    readFile(o){calls.push('read');if(options.readFails){o.fail(apiError());return;}try{o.success({data:fs.readFileSync(o.filePath)});}catch(e){o.fail(e);}},
    writeFile(o){calls.push('write');if(options.writeFails){o.fail(apiError());return;}try{fs.writeFileSync(o.filePath,o.data);o.success();}catch(e){o.fail(e);}},
    readFileSync(p,encoding){calls.push('read-sync');return fs.readFileSync(p,encoding);},
    writeFileSync(p,data,encoding){calls.push('write-sync');return fs.writeFileSync(p,data,encoding);},
  };
  const wx={
    env:{USER_DATA_PATH:base},getFileSystemManager:()=>FS,getSystemInfoSync:()=>({platform:options.platform||'ios',language:'en'}),
    getStorageSync:k=>disk.get(k)||'',removeStorageSync:k=>disk.delete(k),
    setStorageSync(k,v){storageWrites++;if(options.failStorageAtCall===storageWrites||failStorage||failOnce){failOnce=false;throw apiError();}disk.set(k,v);},
    chooseMedia(o){calls.push('choose');mediaCalls.push({count:o.count,mediaType:o.mediaType,sourceType:o.sourceType,sizeType:o.sizeType});if(options.cancel){o.fail({errMsg:'chooseMedia:fail cancel'});return;}if(options.chooseFails){o.fail(apiError());return;}const file=options.avatarOriginal?original:source;const run=()=>o.success({tempFiles:[{tempFilePath:file,size:options.original?3000000:10}]});if(options.holdPick)holdPick=run;else run();},
    chooseImage(o){calls.push('chooseImage');o.success({tempFilePaths:[source]});},
    compressImage(o){calls.push('compress');const record={src:o.src,quality:o.quality};if(o.compressedWidth!==undefined)record.compressedWidth=o.compressedWidth;if(o.compressedHeight!==undefined)record.compressedHeight=o.compressedHeight;compressCalls.push(record);if(options.programError)throw new TypeError('private details');if(options.compressFails){o.fail(apiError());return;}const dest=o.src+'.compressed.jpg';try{fs.writeFileSync(dest,jpg);}catch(e){o.fail(e);return;}compressionOutputs.add(dest);const from=dimensions.get(o.src)||{width:1,height:1};dimensions.set(dest,{width:o.compressedWidth||from.width,height:o.compressedHeight||from.height});o.success({tempFilePath:dest});},
    getImageInfo(o){calls.push(o.src.startsWith(base+'/savor-photos/')?'saved-info':'source-info');if(options.decodeFails&&o.src.includes('/savor-photos/')){o.fail(apiError());return;}let bytes;try{bytes=fs.readFileSync(o.src);}catch(e){o.fail(e);return;}if(options.unknownFormat){o.success({width:1,height:1,type:'unknown'});return;}if(options.cloudOutputType&&compressionOutputs.has(o.src)){o.success({width:1,height:1,type:options.cloudOutputType});return;}const type=bytes.equals(png)?'png':bytes.equals(jpg)?'jpeg':null;if(!type){o.fail(apiError());return;}const size=dimensions.get(o.src)||{width:1,height:1};o.success({width:size.width,height:size.height,type});},
    cloud:{init(){},async callFunction({name}){return {result:name==='account'?{success:true,protocolVersion:1,userId:uid(owner)}:{success:true,identityProtocol:1,userId:uid(owner)}};}},
  };
  const logger={error:(...args)=>logs.push(args.join(' ')),warn:(...args)=>logs.push(args.join(' ')),log(){}};
  function load(relative){
    const file=path.resolve(relative);if(cache.has(file))return cache.get(file).exports;
    const module={exports:{}};cache.set(file,module);
    const requireLocal=name=>name.startsWith('.')?load(path.resolve(path.dirname(file),name+'.js')):require(name);
    vm.runInNewContext(fs.readFileSync(file,'utf8'),{module,exports:module.exports,require:requireLocal,wx,console:logger,Promise,Date,Math,setTimeout,clearTimeout,Page:s=>{pageSpec=s;},Component:s=>{if(file.endsWith(path.normalize('components/profile-editor/index.js')))profileSpec=s;else sheetSpec=s;}},{filename:file});
    return module.exports;
  }
  const identity=load('miniprogram/utils/identity.js'),store=load('miniprogram/utils/store.js'),photos=load('miniprogram/utils/photos.js'),data=load('miniprogram/utils/data.js');
  let avatar;try{avatar=load('miniprogram/utils/avatar.js');}catch(error){if(error.code!=='ENOENT')throw error;}
  const workspaceClient=load('miniprogram/utils/workspaceClient.js'),workspaceFiles=load('miniprogram/utils/workspaceFiles.js'),archiveService=load('miniprogram/utils/archiveService.js'),profileSync=load('miniprogram/utils/profileSync.js');
  function mount(){
    load('miniprogram/pages/me/index.js');load('miniprogram/components/sheet/index.js');load('miniprogram/components/profile-editor/index.js');let sheet,profile;
    const syncProfile=()=>{if(!profile||!sheet)return;const active=sheet.data.displayType==='profile',show=sheet.data.show;Object.assign(profile.data,{active,show,dusk:sheet.data.dusk});profileSpec.observers['active, show'].call(profile,active,show);};
    const me={...pageSpec,data:JSON.parse(JSON.stringify(pageSpec.data)),setData(patch,cb){Object.assign(this.data,patch);if(sheet&&(Object.hasOwn(patch,'sheetShow')||Object.hasOwn(patch,'sheetType'))){Object.assign(sheet.data,{show:this.data.sheetShow,type:this.data.sheetType});sheetSpec.observers['show, type, memoryId, filter'].call(sheet);syncProfile();}if(cb)cb();}};
    me.onLoad();
    sheet={...sheetSpec.methods,data:{...JSON.parse(JSON.stringify(sheetSpec.data)),show:false,type:''},setData(patch,cb){Object.assign(this.data,patch);syncProfile();if(cb)cb();},triggerEvent(name,detail){if(name==='close')me.onSheetClose({detail});}};
    profile={...profileSpec.methods,data:{...JSON.parse(JSON.stringify(profileSpec.data)),active:false,show:false,dusk:false},setData(patch,cb){Object.assign(this.data,patch);if(cb)cb();},triggerEvent(name,detail){if(name==='close')sheet.onProfileClose({detail});if(name==='scrolltarget')sheet.onProfileScrollTarget({detail});}};
    sheetSpec.lifetimes.attached.call(sheet);profileSpec.lifetimes.attached.call(profile);me.onShow();me.onEditProfile();
    return {me,sheet,profile,dispose(){profileSpec.lifetimes.detached.call(profile);sheetSpec.lifetimes.detached.call(sheet);me.onUnload();store.dismissToast();}};
  }
  function mountWorkspace(){
    load('miniprogram/pages/workspace/index.js');
    const page={...pageSpec,data:JSON.parse(JSON.stringify(pageSpec.data)),setData(patch){Object.assign(this.data,patch);}};
    page.data.locked=false;page._hidden=false;page._viewEpoch=0;return page;
  }
  return {mount,mountWorkspace,identity,store,photos,avatar,workspaceClient,workspaceFiles,archiveService,profileSync,data,disk,base,logs,calls,FS,wx,source,original,derivative,mediaCalls,compressCalls,ready:()=>identity.verify(),setOwner:v=>{owner=v;},releasePick:()=>holdPick(),releaseCopy:()=>holdCopy(),failStorage:v=>{failStorage=v;},failOnce:()=>{failOnce=true;}};
}
(async()=>{
  await test('avatar service prepares a canonical owner-local asset',async()=>{
    const r=runtime();await r.ready();assert(r.avatar,'avatar service missing');
    const asset=await r.avatar.prepare(r.source,r.identity.lease(),'chooseAvatar');
    assert.equal(asset.formatVersion,1);
    assert(asset.localPath.startsWith(r.base+'/savor-photos/'+uid('a')+'/'));
    assert.deepEqual({mime:asset.mime,width:asset.width,height:asset.height,source:asset.source,syncState:asset.syncState,remoteRef:asset.remoteRef},{mime:'image/jpeg',width:1,height:1,source:'chooseAvatar',syncState:'local',remoteRef:null});
  });
  await test('avatar service derives a bounded cloud payload from the same local asset',async()=>{
    const r=runtime();await r.ready();assert.equal(typeof r.avatar.forCloud,'function');const owner=r.identity.lease();
    const asset=await r.avatar.prepare(r.source,owner,'album');
    const cloud=await r.avatar.forCloud(asset,owner);
    assert.equal(cloud.asset.localPath,asset.localPath);assert.equal(cloud.asset.syncState,'pending');
    assert(fs.readFileSync(cloud.asset.localPath).equals(jpg));assert(Buffer.from(cloud.base64,'base64').equals(jpg));assert(cloud.base64.length<=87384);
  });
  await test('avatar service rejects a cloud derivative outside JPEG and PNG',async()=>{
    const r=runtime({cloudOutputType:'webp'});await r.ready();const owner=r.identity.lease(),asset=await r.avatar.prepare(r.source,owner,'album');
    await assert.rejects(r.avatar.forCloud(asset,owner),error=>error.code==='AVATAR_CLOUD_FORMAT_UNSUPPORTED');
  });
  await test('avatar service restores a validated cloud asset into the owner photo store',async()=>{
    const r=runtime();await r.ready();assert.equal(typeof r.avatar.restore,'function');const digest='a'.repeat(64);
    const asset=await r.avatar.restore({digest,extension:'png',mime:'image/png',base64:png.toString('base64')},r.identity.lease());
    assert.equal(asset.formatVersion,1);
    assert.equal(asset.localPath,r.base+'/savor-photos/'+uid('a')+'/avatar-'+digest+'.png');
    assert.deepEqual({digest:asset.digest,mime:asset.mime,source:asset.source,syncState:asset.syncState,remoteRef:asset.remoteRef},{digest,mime:'image/png',source:'cloud',syncState:'synced',remoteRef:digest});
    assert(fs.readFileSync(asset.localPath).equals(png));assert(r.calls.includes('write-sync'));assert(r.calls.includes('saved-info'));
  });
  await test('production avatar chooser returns the unified asset and cloud payload',async()=>{
    const r=runtime();await r.ready();const selected=await r.avatar.chooseForCloud();
    assert(selected&&selected.asset);assert(selected.asset.localPath.includes('/savor-photos/'+uid('a')+'/'));
    assert.equal(selected.asset.source,'album');assert.equal(selected.asset.syncState,'pending');assert(Buffer.from(selected.base64,'base64').equals(jpg));
  });
  // --- custom avatar entry: device evidence ---
  // On device the WeChat chooseAvatar button returned AVATAR_SOURCE_IMAGE_INFO width=132 height=132
  // for a custom album photo: that button hands back its own small derivative, which cannot fill
  // the profile photo at Retina size. The custom entry must therefore ask the system chooser for
  // the original file and keep those pixels, while the WeChat-avatar entry keeps using chooseAvatar.
  await test('custom avatar entry asks the system chooser for the original file',async()=>{
    const r=runtime({avatarOriginal:true});await r.ready();assert.equal(typeof r.avatar.chooseLocal,'function','custom avatar chooser missing');
    const owner=r.identity.lease(),source=await r.avatar.chooseLocal(owner);
    assert.equal(source,r.original);
    // The chooser arguments are literals built inside the VM realm, so normalize before comparing.
    assert.deepEqual(JSON.parse(JSON.stringify(r.mediaCalls.at(-1))),{count:1,mediaType:['image'],sourceType:['album','camera'],sizeType:['original']});
  });
  await test('custom avatar keeps the original pixels instead of a 132px derivative',async()=>{
    const r=runtime({avatarOriginal:true});await r.ready();const owner=r.identity.lease();
    const asset=await r.avatar.prepare(await r.avatar.chooseLocal(owner),owner,'album');
    assert.deepEqual({width:asset.width,height:asset.height},{width:1600,height:1200});
    assert.deepEqual({formatVersion:asset.formatVersion,source:asset.source,syncState:asset.syncState,remoteRef:asset.remoteRef},{formatVersion:1,source:'album',syncState:'local',remoteRef:null});
    // Re-encoding is allowed; downscaling is not. persistPhoto must not request a smaller frame.
    for(const call of r.compressCalls)assert.equal(call.compressedWidth,undefined);
    assert(fs.readFileSync(asset.localPath).equals(jpg));
  });
  await test('custom avatar cancellation is silent and creates no asset',async()=>{
    const r=runtime({cancel:true});await r.ready();
    assert.equal(await r.avatar.chooseLocal(r.identity.lease()),'');
    assert.equal(r.logs.length,0);assert(!r.calls.includes('copy'));
  });
  await test('the Add photo chooser contract is untouched by the custom avatar entry',async()=>{
    const r=runtime({avatarOriginal:true});await r.ready();const owner=r.identity.lease();
    await r.avatar.prepare(await r.avatar.chooseLocal(owner),owner,'album');
    assert.deepEqual(JSON.parse(JSON.stringify(r.mediaCalls.at(-1).sizeType)),['original']);
    const [p]=await r.photos.choosePhotos(1);
    assert(p.startsWith(r.base+'/savor-photos/'+uid('a')+'/'));
    assert.deepEqual(JSON.parse(JSON.stringify(r.mediaCalls.at(-1))),{count:1,mediaType:['image'],sourceType:['album','camera'],sizeType:['original','compressed']});
    assert(!r.calls.includes('chooseImage'));
  });
  await test('production Me + Sheet: the custom avatar entry converges on the same prepare and Save path',async()=>{
    const r=runtime({avatarOriginal:true});await r.ready();r.store.updateProfile({name:'Saved'});const {me,profile,dispose}=r.mount();
    await profile.onAvatarCustomRequest();
    const avatar=profile.data.profileAvatar;
    assert(avatar.includes('/savor-photos/'+uid('a')+'/'),'the custom entry must persist through the owner photo store');
    assert.deepEqual(JSON.parse(JSON.stringify(r.mediaCalls.at(-1).sizeType)),['original']);
    assert.equal(r.store.get().profile.avatar,'','selection only previews until Save');
    assert.equal(r.store.get().profile.avatarAsset,null);
    profile.onProfileSave();
    assert.equal(r.store.get().profile.avatar,avatar);
    assert.deepEqual({source:r.store.get().profile.avatarAsset.source,width:r.store.get().profile.avatarAsset.width,height:r.store.get().profile.avatarAsset.height},{source:'album',width:1600,height:1200});
    assert.equal(me.data.profile.avatar,avatar);assert.equal(me.data.sheetShow,false);
    dispose();
  });
  await test('production Workspace page pushes only the service cloud payload',async()=>{
    const r=runtime();await r.ready();const page=r.mountWorkspace();await page.avatar();const selected=page._avatar;assert(selected&&selected.asset);
    let pushed;r.archiveService.mutate=async(action,args)=>{pushed=args.payload.profile.avatar;return {revision:1};};page.confirm=async()=>true;page.data.profileRead=true;page._remote=null;
    await page.push();assert.equal(typeof pushed,'string');assert.equal(pushed,selected.base64);
  });
  await test('production Workspace apply restores cloud avatar through the owner photo store',async()=>{
    const r=runtime();await r.ready();const digest='b'.repeat(64);
    await r.profileSync.apply({revision:1,profile:{name:'Cloud',bio:'Synced',avatar:{digest,extension:'png',mime:'image/png',base64:png.toString('base64')}},preferences:{dietary:'',cuisines:[],privateByDefault:true,showLocations:false,reminders:false}},{confirmed:true});
    const localPath=r.store.get().profile.avatar;assert(localPath.includes('/savor-photos/'+uid('a')+'/'));assert(!localPath.includes('/savor-workspace/'));assert(fs.readFileSync(localPath).equals(png));
  });
  await test('JPG processing: copy completes, nonzero file and saved-path image info precede result',async()=>{
    const r=runtime();await r.ready();const [p]=await r.photos.choosePhotos(1);
    assert(p.startsWith(r.base+'/savor-photos/'+uid('a')+'/'));assert(p.endsWith('.jpg'));
    assert(fs.readFileSync(p).equals(jpg));assert(fs.statSync(p).size>0);assert(r.calls.includes('saved-info'));
  });
  await test('compress failure falls back to actual PNG format, not misleading .jpg name',async()=>{
    const r=runtime({compressFails:true});await r.ready();const [p]=await r.photos.choosePhotos(1);
    assert(p.endsWith('.png'));assert(fs.readFileSync(p).equals(png));assert(r.logs.some(x=>x.includes('compress')));
  });
  await test('large original PNG remains PNG and skips needless compression',async()=>{
    const r=runtime({original:true});await r.ready();const [p]=await r.photos.choosePhotos(1);assert(p.endsWith('.png'));assert(!r.calls.includes('compress'));
  });
  await test('copy failure uses binary read/write fallback and verifies saved file',async()=>{
    const r=runtime({copyFails:true});await r.ready();const [p]=await r.photos.choosePhotos(1);assert(fs.readFileSync(p).equals(jpg));assert(r.calls.includes('read')&&r.calls.includes('write')&&r.calls.includes('saved-info'));
  });
  for(const [name,options,stage]of [
    ['copy and read failure',{copyFails:true,readFails:true},'read'],
    ['copy and write failure',{copyFails:true,writeFails:true},'write'],
    ['directory creation failure',{mkdirFails:true},'mkdir'],
    ['missing/stat failure',{statFails:true},'stat'],
    ['zero-size target',{zeroStat:true},'stat'],
    ['saved image not decodable',{decodeFails:true},'decode'],
    ['unknown HEIC/WebP type is not guessed as JPEG',{unknownFormat:true},'source'],
    ['program error is not cancelled or retried',{programError:true},'compress'],
  ])await test(name+' rejects with stage/code, without leaking paths',async()=>{
    const r=runtime(options);await r.ready();await assert.rejects(r.photos.choosePhotos(1),e=>e.stage===stage&&!!e.code);
    assert(r.logs.length);assert(!r.logs.join('').includes('/private/'));assert(!r.logs.join('').includes(r.base));
  });
  await test('real cancellation is silent; an unrelated error mentioning cancel is not cancellation',async()=>{
    const r=runtime({cancel:true});await r.ready();await assert.rejects(r.photos.choosePhotos(1),r.photos.isCancelled);
    assert.equal(r.logs.length,0);assert(!r.calls.includes('copy'));assert(!r.photos.isCancelled(new Error('decode cancel failed')));
  });
  await test('chooser failure is logged before supported alternate picker',async()=>{
    const r=runtime({chooseFails:true});await r.ready();assert.equal((await r.photos.choosePhotos(1)).length,1);assert(r.logs.some(x=>x.includes('choose')));assert(r.calls.includes('chooseImage'));
  });
  await test('locked identity cannot create anonymous photos or start native picker',async()=>{
    const r=runtime();await assert.rejects(r.photos.choosePhotos(1),e=>e.category==='identity');assert.equal(r.calls.length,0);
  });
  await test('same-owner native re-verification resumes; different owner never receives files',async()=>{
    for(const owner of ['a','b']){const r=runtime({holdPick:true});await r.ready();const pending=r.photos.choosePhotos(1);r.setOwner(owner);await r.ready();r.releasePick();if(owner==='a')assert.equal((await pending).length,1);else{await assert.rejects(pending,e=>e.code==='STALE_IDENTITY');assert(!r.calls.includes('copy'));}}
  });
  await test('owner changes during file copy reject without retrying into new owner directory',async()=>{
    const r=runtime({holdCopy:true});await r.ready();const pending=r.photos.choosePhotos(1);await tick();r.setOwner('b');await r.ready();r.releaseCopy();await assert.rejects(pending,e=>e.code==='STALE_IDENTITY');
    assert.equal(r.calls.filter(x=>x==='copy').length,1);assert(!fs.existsSync(r.base+'/savor-photos/'+uid('b')));
  });
  await test('real Store/identity partition persists avatar and fresh runtime reload accepts same host file',async()=>{
    const r=runtime();await r.ready();const [p]=await r.photos.choosePhotos(1);let notifications=0;r.store.subscribe(()=>notifications++);
    r.store.updateProfile({name:'Saved',avatar:p});assert.equal(notifications,1);
    assert.equal(JSON.parse(r.identity.getStorageSync('savor-diary-v1')).profile.avatar,p);
    const cold=runtime({},r.disk,r.base);await cold.ready();assert.equal(cold.store.get().profile.avatar,p);assert(cold.data.isSafeImage(p));assert.equal(await cold.photos.validatePhoto(p),p);
    cold.setOwner('b');await cold.ready();assert.notEqual(cold.store.get().profile.avatar,p);assert.equal(cold.store.get().profile.avatarAsset,null);
    cold.setOwner('a');await cold.ready();assert.equal(cold.store.get().profile.avatar,p);assert.equal(cold.store.get().profile.avatarAsset.localPath,p);
  });
  await test('Stage 6 diary migrates once and keeps rollback-readable projection plus unknown fields',async()=>{
    const r=runtime();await r.ready();
    const stage6={profile:{...r.data.defaultProfile,avatar:'/images/jamie.jpg',futureProfile:'keep'},memories:[],settings:{futureSetting:true},feedback:[],outbox:[],futureDiary:{keep:true}};
    r.identity.setStorageSync('savor-diary-v1',JSON.stringify(stage6));
    const cold=runtime({},r.disk,r.base);await cold.ready();
    const current=cold.store.get(),persisted=JSON.parse(cold.identity.getStorageSync('savor-diary-v1'));
    assert.equal(current.schemaVersion,2);assert.equal(persisted.schemaVersion,2);
    assert.equal(persisted.profile.avatar,'/images/jamie.jpg');
    assert.equal(persisted.profile.avatarAsset.localPath,'/images/jamie.jpg');
    assert.deepEqual(persisted.futureDiary,{keep:true});assert.equal(persisted.profile.futureProfile,'keep');
    assert.equal(Object.assign({},cold.data.defaultProfile,persisted.profile).avatar,'/images/jamie.jpg');
    cold.setOwner('b');await cold.ready();assert.equal(cold.store.get().futureDiary,undefined);
    cold.store.updateProfile({name:'Owner B'});
    cold.setOwner('a');await cold.ready();assert.equal(cold.store.get().futureDiary.keep,true);
  });
  await test('Stage 6 avatar change wins when Stage 7 is entered again',async()=>{
    const r=runtime();await r.ready();r.store.updateProfile({avatar:'/images/jamie.jpg'});
    const stage6=JSON.parse(r.identity.getStorageSync('savor-diary-v1'));
    stage6.profile.avatar='/images/alex.jpg';
    r.identity.setStorageSync('savor-diary-v1',JSON.stringify(stage6));
    const upgraded=runtime({},r.disk,r.base);await upgraded.ready();
    assert.equal(upgraded.store.get().profile.avatar,'/images/alex.jpg');
    assert.equal(upgraded.store.get().profile.avatarAsset.localPath,'/images/alex.jpg');
    assert.equal(upgraded.store.get().profile.avatarAsset.source,'legacy');
  });
  await test('failed eager migration keeps old bytes and next commit writes one complete schema 2 diary',async()=>{
    const seed=runtime();await seed.ready();
    const stage6={profile:{...seed.data.defaultProfile,avatar:'/images/jamie.jpg'},memories:[],settings:{...seed.data.defaultSettings},feedback:[],outbox:[],futureDiary:'keep'};
    seed.identity.setStorageSync('savor-diary-v1',JSON.stringify(stage6));
    const before=seed.identity.getStorageSync('savor-diary-v1');
    const cold=runtime({failStorageAtCall:1},seed.disk,seed.base);await cold.ready();
    assert.equal(cold.identity.getStorageSync('savor-diary-v1'),before);
    assert.equal(cold.store.get().profile.avatarAsset.localPath,'/images/jamie.jpg');
    cold.store.updateProfile({name:'After retry'});
    const saved=JSON.parse(cold.identity.getStorageSync('savor-diary-v1'));
    assert.equal(saved.schemaVersion,2);assert.equal(saved.profile.name,'After retry');
    assert.equal(saved.profile.avatarAsset.localPath,saved.profile.avatar);assert.equal(saved.futureDiary,'keep');
  });
  await test('failed Store write is atomic: no listener, no queue/draft loss and no second commit',async()=>{
    const r=runtime();await r.ready();const state=r.store.get();state.outbox=[{id:'pending',actorUserId:uid('a'),recordId:'meal',kind:'flags'}];r.store.updateProfile({name:'Before'});
    assert(r.store.saveDraft({...r.store.freshDraft(),restaurant:'keep draft'}));const before=JSON.stringify(r.store.get()),raw=r.identity.getStorageSync('savor-diary-v1'),draft=r.identity.getStorageSync('savor-draft-v1');let notified=0;r.store.subscribe(()=>notified++);
    r.failOnce();assert.throws(()=>r.store.updateProfile({avatar:'must-not-save'}),e=>e.code==='CACHE_WRITE_FAILED');
    assert.equal(JSON.stringify(r.store.get()),before);assert.equal(r.identity.getStorageSync('savor-diary-v1'),raw);assert.equal(r.identity.getStorageSync('savor-draft-v1'),draft);assert.equal(notified,0);
    r.failStorage(true);assert.throws(()=>r.store.updateProfile({avatar:'still-not-save'}));r.failStorage(false);assert.equal(r.store.get().profile.avatar,'');
  });
  await test('existing missing or invalid saved file cannot bypass verification',async()=>{
    const r=runtime();await r.ready();const [p]=await r.photos.choosePhotos(1);fs.writeFileSync(p,'not an image');await assert.rejects(r.photos.persistPhoto(p),e=>e.stage==='decode');
    fs.unlinkSync(p);await assert.rejects(r.photos.persistPhoto(p),e=>e.stage==='stat');
  });
  await test('production ProfileEditor previews the canonical path returned by avatar service',async()=>{
    const r=runtime();await r.ready();const canonical=r.base+'/avatar-service-result.jpg';r.avatar.prepare=async()=>({localPath:canonical});
    r.store.updateProfile({name:'Saved'});const {profile,dispose}=r.mount();profile.onAvatarRequest();await profile.onAvatarChange({detail:{avatarUrl:r.source}});
    assert.equal(profile.data.profileAvatar,canonical);assert.equal(r.store.get().profile.avatar,'');dispose();
  });
  await test('production Me + Sheet + i18n + identity: same-owner return previews, Save commits, reopen keeps it',async()=>{
    const r=runtime();await r.ready();r.store.updateProfile({name:'Saved'});const {me,profile,dispose}=r.mount();
    profile.onAvatarRequest();await profile.onAvatarChange({detail:{avatarUrl:r.source}});assert(!r.calls.includes('choose'));
    const avatar=profile.data.profileAvatar;assert(avatar.includes('/savor-photos/'));assert.equal(r.store.get().profile.avatar,'');assert.equal(r.store.get().profile.avatarAsset,null);
    profile.onProfileSave();assert.equal(r.store.get().profile.avatar,avatar);assert.equal(r.store.get().profile.avatarAsset.localPath,avatar);assert.equal(r.store.get().profile.avatarAsset.formatVersion,1);assert.equal(r.store.get().profile.avatarAsset.source,'chooseAvatar');assert.equal(me.data.profile.avatar,avatar);assert.equal(me.data.sheetShow,false);
    me.onEditProfile();assert.equal(profile.data.profileAvatar,avatar);me.onImageError({currentTarget:{dataset:{source:avatar}}});assert(me.data.imageErrors[avatar]);me.onShow();assert.equal(me.data.profile.avatar,avatar);assert(!me.data.imageErrors[avatar]);assert(r.logs.some(x=>x.includes('me-preview IMAGE_LOAD_FAILED')));dispose();
  });
  await test('production Me closes explicitly without resurrecting on Store refresh',async()=>{
    const r=runtime({holdCopy:true});await r.ready();const {me,sheet,profile,dispose}=r.mount();profile.onAvatarRequest();const pending=profile.onAvatarChange({detail:{avatarUrl:r.source}});await tick();sheet.close();r.releaseCopy();await pending;assert.equal(me.data.sheetShow,false);assert.equal('_nativeAvatarResume' in me,false);assert.equal(r.store.get().profile.avatar,'');dispose();
  });
  await test('production storage failure reaches Sheet error, not a success toast or parent avatar',async()=>{
    const r=runtime();await r.ready();r.store.updateProfile({name:'Saved'});const {me,profile,dispose}=r.mount();profile.onAvatarRequest();await profile.onAvatarChange({detail:{avatarUrl:r.source}});let success=false;r.store.onToast(t=>{if(t)success=true;});r.failOnce();profile.onProfileSave();assert(profile.data.profileError);assert.equal(success,false);assert.equal(me.data.sheetShow,true);assert.equal(me.data.profile.avatar,'');assert.equal(r.store.get().profile.avatar,'');dispose();
  });
  console.log(checks+' production-boundary checks passed. Host file bytes verified; native image rendering and real restart still require devices.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{
  // Only this process-created, validated temporary subtree; no app/user data.
  const resolved=path.resolve(root),temp=path.resolve(os.tmpdir());
  if(path.dirname(resolved)!==temp||!path.basename(resolved).startsWith('savor-avatar-check-'))throw Error('Unsafe cleanup');
  fs.rmSync(resolved,{recursive:true,force:true});
});
