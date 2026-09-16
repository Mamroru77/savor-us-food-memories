const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
let count=0;
function page(file,dependencies){let spec;vm.runInNewContext(fs.readFileSync(file,'utf8'),{Page:x=>spec=x,require:n=>dependencies[n.split('/').pop()]||{},wx:{},console,setTimeout,clearTimeout});return {...spec,data:{...spec.data},active:true,setData(p){Object.assign(this.data,p);}};}
async function test(name,fn){await fn();console.log('PASS '+name);count++;}
function map(options={}){let verified=options.verified!==false,frozen=!!options.frozen,verifies=0,syncs=0,toasts=0;const p=page('miniprogram/pages/map/index.js',{i18n:{copy:()=>({}),locale:()=> 'zh-CN',t:x=>x},identity:{isDiagnosisActive:()=>frozen,snapshot:()=>({locked:!verified,status:verified?'verified':'verifying'}),verify:async()=>{verifies++;if(options.verify)await options.verify();verified=true;}},store:{syncCloud:async()=>{syncs++;if(options.sync)await options.sync();},notify:()=>toasts++}});return {p,stats:()=>({verifies,syncs,toasts})};}
(async()=>{
await test('verified map syncs without re-verifying identity',async()=>{const r=map();await r.p.syncMapCloud();assert.deepEqual(r.stats(),{verifies:0,syncs:1,toasts:0});});
await test('cold/verifying map waits for identity before sync',async()=>{let release;const r=map({verified:false,verify:()=>new Promise(ok=>release=ok)}),task=r.p.syncMapCloud();assert.equal(r.stats().syncs,0);release();await task;assert.deepEqual(r.stats(),{verifies:1,syncs:1,toasts:0});});
await test('identity failure is left to gate, not reported as cached map outage',async()=>{const r=map({verified:false,verify:async()=>{throw Error('offline');}});await r.p.syncMapCloud();assert.equal(r.stats().syncs,0);assert.equal(r.stats().toasts,0);});
await test('diagnostic mode remains fail-closed with zero traffic',async()=>{const r=map({frozen:true});await r.p.syncMapCloud();assert.deepEqual(r.stats(),{verifies:0,syncs:0,toasts:0});});
await test('genuine list failure still reports unavailable sync',async()=>{const r=map({sync:async()=>{throw Error('network');}});await r.p.syncMapCloud();assert.equal(r.stats().toasts,1);});
await test('stale lease does not emit misleading outage',async()=>{const r=map({sync:async()=>{throw Object.assign(Error('stale'),{code:'STALE_IDENTITY'});}});await r.p.syncMapCloud();assert.equal(r.stats().toasts,0);});
await test('leaving map during verification prevents subsequent sync',async()=>{let release;const r=map({verified:false,verify:()=>new Promise(ok=>release=ok)}),task=r.p.syncMapCloud();r.p.active=false;release();await task;assert.equal(r.stats().syncs,0);});
await test('late sync failure on hidden page does not leak a Toast to Add',async()=>{let fail;const r=map({sync:()=>new Promise((_,reject)=>fail=reject)}),task=r.p.syncMapCloud();r.p.active=false;fail(Error('network'));await task;assert.equal(r.stats().toasts,0);});
await test('Add rejected save keeps draft, releases busy state and has no duplicate Toast',async()=>{
 const draft={restaurant:'Test',date:'2026-09-16',perCapita:'',notes:'draft stays',rating:0,tags:[],photos:[],location:{city:'Test',country:'Test',geoConfirmed:true,coordinates:[1,2]}},token={},error=Error('Save failed');let toasts=0,saves=0;
 const p=page('miniprogram/pages/add/index.js',{identity:{isDiagnosisActive:()=>false,lease:()=>token,isCurrent:()=>true},identityCopy:()=>({}),i18n:{copy:()=>({}),locale:()=> 'zh-CN',t:x=>x},store:{freshDraft:()=>draft,get:()=>({settings:{privateByDefault:true}}),createCloudMemory:async()=>{saves++;throw error;},notify:()=>toasts++},data:{isValidDate:()=>true,createId:()=> 'test-id',photos:{meal:'fallback'}},locations:{confirmed:()=>true}});
 p.data.draft=draft;await p.onSave();assert.equal(saves,1);assert.equal(p.data.draft,draft);assert.equal(p.data.error,'Save failed');assert.equal(p.data.saving,false);assert.equal(p.saveLock,false);assert.equal(toasts,0);
});
await test('rating label distinguishes a selected rating from the clear action',()=>{const text=fs.readFileSync('miniprogram/pages/add/index.wxml','utf8');assert(text.includes("draft.rating > 0 ?"));assert(text.includes('清除评分'));assert(text.includes("item <= draft.rating ?"));});
console.log(`${count}/${count} map/save regression checks passed; synthetic only.`);
})().catch(e=>{console.error(e);process.exitCode=1;});
