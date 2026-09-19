// Native source resolution contracts. Fixtures are local; no cloud calls or diary writes.
const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const flush=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
function harness(images=['/images/bundled.jpg','cloud://fixture/photo.jpg','wxfile://user/original.jpg']){
 let listener,current,owner='one',generation=1,locked=false,preview,off=0;
 const copies=[],downloads=[],removed=[],patches=[];
 const page={data:{sheetShow:true,sheetMemoryId:'memory'},setData(p,cb){patches.push(p);Object.assign(this.data,p);if(cb)cb();}};current=page;
 const identity={lease:()=>({userId:owner,generation,namespace:'fixture'}),assertLease(t){if(locked||t.userId!==owner||t.generation!==generation)throw Error('STALE');},isCurrent(t){return !locked&&t.userId===owner&&t.generation===generation;},subscribe(fn){listener=fn;return()=>{listener=null;off++;};},async resumeNative(t){if(locked||t.userId!==owner)throw Error('STALE');return this.lease();}};
 const wx={env:{USER_DATA_PATH:'wxfile://user'},getFileSystemManager:()=>({copyFile:o=>copies.push(o),unlinkSync:p=>removed.push(p)}),previewImage:o=>{preview=o;}};
 const store={get:()=>({memories:[{id:'memory'}]})};
 const cloud={downloadMapPhoto:src=>new Promise((resolve,reject)=>downloads.push({src,resolve,reject}))};
 const cache={};function load(name){if(cache[name])return cache[name];const module={exports:{}};vm.runInNewContext(fs.readFileSync('miniprogram/utils/'+name+'.js','utf8'),{module,wx,Promise,Date,getCurrentPages:()=>[current],require:p=>p==='./identity'?identity:p==='./store'?store:p==='./cloudRecords'?cloud:load(p.slice(2))});return cache[name]=module.exports;}
 const original=images.slice(),api=load('memoryPreview');
 return {page,copies,downloads,removed,patches,images,original,preview:()=>preview,off:()=>off,
  open:()=>api.open(page,{memoryId:'memory',images,photoIndex:1,scrollTop:123}),
  finish(){copies.forEach(o=>o.success({}));downloads.forEach(o=>o.resolve('wxfile://tmp/private.jpg'));},
  away(){current={};},
  emit(status,newOwner=owner){owner=newOwner;locked=status!=='verified';if(status==='verifying')generation++;if(listener)listener({status,locked,generation});}
 };
}
let passed=0;async function test(n,f){await f();passed++;console.log('PASS '+n);}
(async()=>{
 await test('bundled and private sources resolve before native open, preserving order/current and original references',async()=>{const h=harness();h.open();assert.equal(h.preview(),undefined,'raw package/cloud paths must not enter native viewer');await flush();assert.equal(h.copies.length,1);assert.equal(h.copies[0].srcPath,'/images/bundled.jpg');assert.equal(h.downloads.length,1);h.finish();await flush();assert.deepEqual(Array.from(h.preview().urls),[h.copies[0].destPath,'wxfile://tmp/private.jpg','wxfile://user/original.jpg']);assert.equal(h.preview().current,'wxfile://tmp/private.jpg');assert.deepEqual(h.images,h.original);assert.equal(h.patches.length,0);});
 await test('already supported sources keep the existing synchronous path',()=>{const h=harness(['https://example.test/photo.jpg','wxfile://user/original.jpg']);h.open();assert.equal(h.preview().current,h.images[1]);assert.equal(h.copies.length,0);assert.equal(h.downloads.length,0);});
 await test('failed package copy never opens raw paths; late downloads are cleaned',async()=>{const h=harness();h.open();await flush();h.copies[0].fail(Error('COPY_FAILED'));await flush();h.downloads[0].resolve('wxfile://tmp/private.jpg');await flush();assert.equal(h.preview(),undefined);assert.equal(h.page._memoryPreview,null);assert(h.removed.includes('wxfile://tmp/private.jpg'));assert(!h.removed.includes(h.images[2]));});
 await test('failed private download cleans only the successful temporary package copy',async()=>{const h=harness();h.open();await flush();h.copies[0].success({});h.downloads[0].reject(Error('DENIED'));await flush();assert.equal(h.preview(),undefined);assert(h.removed.includes(h.copies[0].destPath));assert(!h.removed.includes('/images/bundled.jpg'));});
 await test('explicit close during preparation wins; late temporary copies are removed',async()=>{const h=harness();h.open();await flush();h.page._memoryPreview.cancel();h.finish();await flush();assert.equal(h.preview(),undefined);assert(h.removed.includes(h.copies[0].destPath));assert(h.removed.includes('wxfile://tmp/private.jpg'));});
 await test('verification during preparation does not masquerade as native return',async()=>{const h=harness();h.open();await flush();h.emit('verifying');h.emit('verified');h.finish();await flush();assert.equal(h.preview(),undefined);assert.equal(h.patches.length,0);assert.equal(h.page._memoryPreview,null);});
 await test('different owner cannot open a prepared private source',async()=>{const h=harness();h.open();await flush();h.emit('verifying');h.emit('verified','two');h.finish();await flush();assert.equal(h.preview(),undefined);assert.equal(h.patches.length,0);});
 await test('navigation away during preparation prevents late viewer opening',async()=>{const h=harness();h.open();await flush();h.away();h.finish();await flush();assert.equal(h.preview(),undefined);assert.equal(h.page._memoryPreview,null);assert(h.removed.includes(h.copies[0].destPath));});
 await test('native failure releases only generated preview files, not originals',async()=>{const h=harness();h.open();await flush();h.finish();await flush();h.preview().fail();assert(h.removed.includes(h.copies[0].destPath));assert(h.removed.includes('wxfile://tmp/private.jpg'));assert(!h.removed.includes('wxfile://user/original.jpg'));assert.equal(h.off(),1);});
 await test('successful same-owner return restores reading intent and releases temporary previews',async()=>{const h=harness();h.open();await flush();h.finish();await flush();h.emit('verifying');h.page.data.sheetShow=false;h.emit('verified');await flush();assert.equal(h.page.data.sheetShow,true);assert.equal(h.page.data.sheetReadingPosition.photoIndex,1);assert.equal(h.page.data.sheetReadingPosition.scrollTop,123);assert(h.removed.includes(h.copies[0].destPath));assert.deepEqual(h.images,h.original);});
 console.log(passed+' preview-source checks passed; real native evidence remains separate.');
})().catch(e=>{console.error(e);process.exitCode=1;});
