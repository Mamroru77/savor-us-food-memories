// Production disposable renderer with synthetic canvas/files; no real photos or network.
const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
function harness({failFirst=false,holdExport=false,failExportFirst=false,failDecodeFirst=false}={}){
 const removed=[],exports=[],counts={info:0,export:0,decode:0},module={exports:{}};
 const wx={getImageInfo(o){counts.info++;if(failFirst&&counts.info===1)o.fail();else o.success({path:'synthetic-photo'});},
  canvasToTempFilePath(o){counts.export++;exports.push(o);if(failExportFirst&&counts.export===1)o.fail();else if(!holdExport)o.success({tempFilePath:'synthetic-composite-'+counts.export});},
  getFileSystemManager:()=>({unlinkSync:path=>removed.push(path)})};
 vm.runInNewContext(fs.readFileSync('miniprogram/utils/mapMarkers.js','utf8'),{module,require:p=>{assert.equal(p,'./data');return {isSafeImage:()=>true,isCloudImage:()=>false};},wx,setTimeout,clearTimeout});
 const ctx=new Proxy({},{get:()=>()=>{}}),canvas={getContext:()=>ctx,createImage(){const img={width:200,height:200};Object.defineProperty(img,'src',{set(){counts.decode++;queueMicrotask(()=>{if(failDecodeFirst&&counts.decode===1)img.onerror();else img.onload();});}});return img;}};
 return {api:module.exports,r:module.exports.createRenderer(canvas),removed,exports,counts};
}
const memory={id:'synthetic',photo:'synthetic-local-original',restaurant:'用户 Café'};
const flush=async()=>{for(let n=0;n<16;n++)await Promise.resolve();};
(async()=>{
 const h=harness({failFirst:true}),before=JSON.stringify(memory);
 assert.equal(await h.r.render(memory,false),h.api.fallback(false));
 assert.equal(h.r.peek(memory,false),undefined,'transient failure must not become a permanently ready fallback');
 const recovered=await h.r.render(memory,false);assert.equal(recovered,'synthetic-composite-1');assert.equal(h.counts.info,2);assert.equal(h.r.peek(memory,false),recovered);
 assert.equal(await h.r.render(memory,false),recovered);assert.equal(h.counts.export,1);assert.equal(JSON.stringify(memory),before);
 h.r.dispose();assert.deepEqual(h.removed,[recovered]);assert.equal(h.r.peek(memory,false),undefined);
 console.log('PASS transient failure retries on next explicit render; successful composition remains cached; only owned temp is removed');
 const late=harness({holdExport:true}),a=late.r.render(memory,true),b=late.r.render(memory,true);assert.equal(a,b);await flush();assert.equal(late.exports.length,1);
 late.r.dispose();late.exports[0].success({tempFilePath:'synthetic-late'});assert.equal(await a,late.api.fallback(true));assert.deepEqual(late.removed,['synthetic-late']);assert.equal(late.r.peek(memory,true),undefined);
 const oldCount=late.counts.info;await late.r.render(memory,true);assert.equal(late.counts.info,oldCount);
 console.log('PASS identical in-flight request single-flight; disposed renderer rejects publication and cleans late owned export');
 const next=harness();assert.equal(await next.r.render(memory,true),'synthetic-composite-1');assert.equal(next.counts.export,1);next.r.dispose();
 console.log('PASS next renderer independently reconstructs photos without original-file deletion');

 for(const option of ['failExportFirst','failDecodeFirst']){
  const edge=harness({[option]:true});
  assert.equal(await edge.r.render(memory,false),edge.api.fallback(false));
  assert.equal(edge.r.peek(memory,false),undefined);
  const retry=await edge.r.render(memory,false);
  assert.notEqual(retry,edge.api.fallback(false));
  assert.equal(edge.r.peek(memory,false),retry);
  const n=edge.counts.export;assert.equal(await edge.r.render(memory,false),retry);assert.equal(edge.counts.export,n);
  edge.r.dispose();assert.deepEqual(edge.removed,[retry]);
  console.log('PASS '+option+' recovers on explicit retry, caches success and removes only owned composite');
 }
 const variants=harness();
 const normal=await variants.r.render(memory,false),selected=await variants.r.render(memory,true);
 assert.notEqual(normal,selected);assert.equal(variants.r.peek(memory,false),normal);assert.equal(variants.r.peek(memory,true),selected);
 const changed={...memory,photo:'synthetic-replaced-original'};
 assert.equal(variants.r.peek(changed,false),undefined);
 const replacement=await variants.r.render(changed,false);assert.notEqual(replacement,normal);
 assert.equal(variants.r.peek(memory,false),normal);
 const noPhoto={...memory,noPhoto:true},n=variants.counts.info;
 assert.equal(await variants.r.render(noPhoto,false),variants.api.fallback(false));assert.equal(variants.counts.info,n);
 variants.r.dispose();variants.r.dispose();assert.deepEqual(variants.removed,[normal,selected,replacement]);
 assert(!variants.removed.includes(memory.photo));assert(!variants.removed.includes(changed.photo));
 console.log('PASS selected/unselected and replaced sources stay isolated; no-photo avoids IO; repeated disposal never deletes originals');
})().catch(error=>{console.error(error);process.exitCode=1;});
