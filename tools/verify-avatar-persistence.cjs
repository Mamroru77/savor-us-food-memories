// Production photos + identity + partitions + Store. Real host file I/O, simulated wx APIs.
// getImageInfo/chooser/compression are contracts, NOT an iOS/Android decoder or lifecycle test.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),os=require('node:os');
const fixtures=require('./fixtures/shared-media-images.json');
const png=Buffer.from(fixtures.png,'base64'),jpg=fs.readFileSync('miniprogram/images/jamie.jpg');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'savor-avatar-check-'));
const uid=letter=>'u_'+letter.repeat(48);
let checks=0;
async function test(name,fn){await fn();checks++;console.log('PASS '+name);}
const tick=()=>new Promise(setImmediate);
function runtime(options={},disk=new Map(),base=fs.mkdtempSync(path.join(root,'case-'))){
  const cache=new Map(),logs=[],calls=[],source=base+'/source.jpg',compressed=base+'/compressed.png';
  let pageSpec,sheetSpec;
  fs.writeFileSync(source,png); // Deliberately misleading suffix.
  fs.writeFileSync(compressed,jpg);
  let owner='a',holdPick,holdCopy,failStorage=false,failOnce=false;
  const apiError=()=>({errMsg:'native failed /private/owner/image-data',errCode:1001});
  const FS={
    accessSync:p=>fs.accessSync(p),
    mkdirSync(p,recursive){if(options.mkdirFails)throw apiError();fs.mkdirSync(p,{recursive});},
    statSync(p){if(options.statFails)throw apiError();return options.zeroStat?{size:0}:fs.statSync(p);},
    copyFile(o){calls.push('copy');const run=()=>{if(options.copyFails){o.fail(apiError());return;}try{fs.copyFileSync(o.srcPath,o.destPath);}catch(e){o.fail(e);return;}o.success();};if(options.holdCopy)holdCopy=run;else run();},
    readFile(o){calls.push('read');if(options.readFails){o.fail(apiError());return;}try{o.success({data:fs.readFileSync(o.filePath)});}catch(e){o.fail(e);}},
    writeFile(o){calls.push('write');if(options.writeFails){o.fail(apiError());return;}try{fs.writeFileSync(o.filePath,o.data);o.success();}catch(e){o.fail(e);}},
  };
  const wx={
    env:{USER_DATA_PATH:base},getFileSystemManager:()=>FS,getSystemInfoSync:()=>({platform:options.platform||'ios',language:'en'}),
    getStorageSync:k=>disk.get(k)||'',removeStorageSync:k=>disk.delete(k),
    setStorageSync(k,v){if(failStorage||failOnce){failOnce=false;throw apiError();}disk.set(k,v);},
    chooseMedia(o){calls.push('choose');if(options.cancel){o.fail({errMsg:'chooseMedia:fail cancel'});return;}if(options.chooseFails){o.fail(apiError());return;}const run=()=>o.success({tempFiles:[{tempFilePath:source,size:options.original?3000000:10}]});if(options.holdPick)holdPick=run;else run();},
    chooseImage(o){calls.push('chooseImage');o.success({tempFilePaths:[source]});},
    compressImage(o){calls.push('compress');if(options.programError)throw new TypeError('private details');if(options.compressFails){o.fail(apiError());return;}o.success({tempFilePath:compressed});},
    getImageInfo(o){calls.push(o.src===source||o.src===compressed?'source-info':'saved-info');if(options.decodeFails&&o.src.includes('/savor-photos/')){o.fail(apiError());return;}let bytes;try{bytes=fs.readFileSync(o.src);}catch(e){o.fail(e);return;}if(options.unknownFormat){o.success({width:1,height:1,type:'unknown'});return;}const type=bytes.equals(png)?'png':bytes.equals(jpg)?'jpeg':null;if(!type){o.fail(apiError());return;}o.success({width:1,height:1,type});},
    cloud:{init(){},async callFunction({name}){return {result:name==='account'?{success:true,protocolVersion:1,userId:uid(owner)}:{success:true,identityProtocol:1,userId:uid(owner)}};}},
  };
  const logger={error:(...args)=>logs.push(args.join(' ')),warn:(...args)=>logs.push(args.join(' ')),log(){}};
  function load(relative){
    const file=path.resolve(relative);if(cache.has(file))return cache.get(file).exports;
    const module={exports:{}};cache.set(file,module);
    const requireLocal=name=>name.startsWith('.')?load(path.resolve(path.dirname(file),name+'.js')):require(name);
    vm.runInNewContext(fs.readFileSync(file,'utf8'),{module,exports:module.exports,require:requireLocal,wx,console:logger,Promise,Date,Math,setTimeout,clearTimeout,Page:s=>{pageSpec=s;},Component:s=>{sheetSpec=s;}},{filename:file});
    return module.exports;
  }
  const identity=load('miniprogram/utils/identity.js'),store=load('miniprogram/utils/store.js'),photos=load('miniprogram/utils/photos.js'),data=load('miniprogram/utils/data.js');
  function mount(){
    load('miniprogram/pages/me/index.js');load('miniprogram/components/sheet/index.js');let sheet;
    const me={...pageSpec,data:JSON.parse(JSON.stringify(pageSpec.data)),setData(patch,cb){Object.assign(this.data,patch);if(sheet&&(Object.hasOwn(patch,'sheetShow')||Object.hasOwn(patch,'sheetType'))){Object.assign(sheet.data,{show:this.data.sheetShow,type:this.data.sheetType});sheetSpec.observers['show, type, memoryId, filter'].call(sheet);}if(cb)cb();}};
    me.onLoad();
    sheet={...sheetSpec.methods,data:{...JSON.parse(JSON.stringify(sheetSpec.data)),show:false,type:''},setData(patch,cb){Object.assign(this.data,patch);if(cb)cb();},triggerEvent(name,detail){if(name==='nativeavatar')me.onNativeAvatar({detail});if(name==='close')me.onSheetClose({detail});}};
    sheetSpec.lifetimes.attached.call(sheet);me.onShow();me.onEditProfile();
    return {me,sheet,dispose(){sheetSpec.lifetimes.detached.call(sheet);me.onUnload();store.dismissToast();}};
  }
  return {mount,identity,store,photos,data,disk,base,logs,calls,FS,wx,source,ready:()=>identity.verify(),setOwner:v=>{owner=v;},releasePick:()=>holdPick(),releaseCopy:()=>holdCopy(),failStorage:v=>{failStorage=v;},failOnce:()=>{failOnce=true;}};
}
(async()=>{
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
    cold.setOwner('b');await cold.ready();assert.notEqual(cold.store.get().profile.avatar,p);
    cold.setOwner('a');await cold.ready();assert.equal(cold.store.get().profile.avatar,p);
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
  await test('production Me + Sheet + i18n + identity: same-owner return previews, Save commits, reopen keeps it',async()=>{
    const r=runtime({holdPick:true});await r.ready();r.store.updateProfile({name:'Saved'});const {me,sheet,dispose}=r.mount();
    const pending=sheet.onAvatarChange();await r.ready();r.releasePick();await pending;
    const avatar=sheet.data.profileAvatar;assert(avatar.includes('/savor-photos/'));assert.equal(r.store.get().profile.avatar,'');
    sheet.onProfileSave();assert.equal(me.data.profile.avatar,avatar);assert.equal(me.data.sheetShow,false);
    me.onEditProfile();assert.equal(sheet.data.profileAvatar,avatar);me.onImageError({currentTarget:{dataset:{source:avatar}}});assert(me.data.imageErrors[avatar]);me.onShow();assert.equal(me.data.profile.avatar,avatar);assert(!me.data.imageErrors[avatar]);assert(r.logs.some(x=>x.includes('me-preview IMAGE_LOAD_FAILED')));dispose();
  });
  await test('production Me closes explicitly without resurrecting on Store refresh',async()=>{
    const r=runtime({holdPick:true});await r.ready();const {me,sheet,dispose}=r.mount();const pending=sheet.onAvatarChange();sheet.close();await r.ready();r.releasePick();await pending;assert.equal(me.data.sheetShow,false);assert.equal(me._nativeAvatarResume,null);assert.equal(r.store.get().profile.avatar,'');dispose();
  });
  await test('production storage failure reaches Sheet error, not a success toast or parent avatar',async()=>{
    const r=runtime();await r.ready();r.store.updateProfile({name:'Saved'});const {me,sheet,dispose}=r.mount();await sheet.onAvatarChange();let success=false;r.store.onToast(t=>{if(t)success=true;});r.failOnce();sheet.onProfileSave();assert(sheet.data.profileError);assert.equal(success,false);assert.equal(me.data.sheetShow,true);assert.equal(me.data.profile.avatar,'');assert.equal(r.store.get().profile.avatar,'');dispose();
  });
  console.log(checks+' production-boundary checks passed. Host file bytes verified; native image rendering and real restart still require devices.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{
  // Only this process-created, validated temporary subtree; no app/user data.
  const resolved=path.resolve(root),temp=path.resolve(os.tmpdir());
  if(path.dirname(resolved)!==temp||!path.basename(resolved).startsWith('savor-avatar-check-'))throw Error('Unsafe cleanup');
  fs.rmSync(resolved,{recursive:true,force:true});
});
