// Production pages, deterministic Mini Program lifecycle callbacks; no cloud/network/data writes.
const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
let passed=0;
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
function harness(name,locked=false){
 let spec,listener,off=0;const calls=[],queries=[],draws=[],builds=[],pending=[];
 const identity={snapshot:()=>({locked}),subscribe:fn=>{listener=fn;return()=>off++;},lease:()=>({generation:1,userId:'test-owner'}),isCurrent:()=>true,workspaceDraft:()=>({}),workspaceIntent:()=>null};
 const store={get:()=>({settings:{theme:'pearl'},memories:[]})};
 const secondary={sync(){},copy:()=>({})};
 const service={call:action=>{calls.push(action);return new Promise((resolve,reject)=>pending.push({resolve,reject}));}};
 const report={build:(rows,year,options)=>{builds.push(year);return {year,details:!!(options&&options.details)};},draw:(ctx,data)=>draws.push({ctx,year:data.year})};
 const wx={setNavigationBarTitle(){},createSelectorQuery:()=>({in(){return this;},select(){return this;},fields(){return this;},exec(cb){queries.push(cb);}})};
 const deps={secondaryUI:secondary,identity,store,workspaceClient:service,archiveService:{},avatar:{},profileSync:{},workspaceFiles:{},workspaceCopy:()=>({title:'tools',ready:'ready'}),annualReport:report,localDate:{today:()=> '2026-09-16',shift:()=> '2026-09-17'}};
 vm.runInNewContext(fs.readFileSync('miniprogram/pages/'+name+'/index.js','utf8'),{Page:s=>spec=s,require:p=>{const key=p.split('/').pop();if(!(key in deps))throw Error('Unexpected dependency '+p);return deps[key];},wx,Date,Promise,setTimeout,clearTimeout});
 const p={...spec,data:JSON.parse(JSON.stringify(spec.data)),setData(patch,cb){Object.assign(this.data,patch);if(cb)cb();}};
 return {p,calls,queries,draws,builds,pending,setLocked:v=>locked=v,emit:()=>listener(),off:()=>off};
}
async function test(name,fn){try{await fn();passed++;console.log('PASS '+name);}catch(e){console.error('FAIL '+name);throw e;}}
(async()=>{
 await test('Workspace first onLoad/onShow sends one group of three reads',async()=>{const h=harness('workspace');h.p.onLoad();assert.equal(h.calls.length,0);h.p.onShow();assert.deepEqual(h.calls,['config','listTasks','listJobs']);h.pending.forEach((x,i)=>x.resolve(i?{items:[],cursor:''}:{}));await flush();assert.equal(h.p.data.busy,false);h.p.onUnload();assert.equal(h.off(),1);});
 await test('Workspace offline result releases busy and retains an error',async()=>{const h=harness('workspace');h.p.onLoad();h.p.onShow();h.pending.forEach(x=>x.reject(Error('OFFLINE')));await flush();assert.equal(h.p.data.busy,false);assert.equal(h.p.data.message,'OFFLINE');h.p.onUnload();});
 await test('Workspace locked and hidden identity notifications never start reads',async()=>{const h=harness('workspace',true);h.p.onLoad();h.p.onShow();assert.equal(h.calls.length,0);h.p.onHide();h.setLocked(false);h.emit();assert.equal(h.calls.length,0);h.p.onShow();assert.equal(h.calls.length,3);h.p.onUnload();});
 await test('Reports first show builds once and returning shows refresh normally',async()=>{const h=harness('reports');h.p.onLoad();assert.equal(h.builds.length,0);h.p.onShow();assert.equal(h.builds.length,2);assert.equal(h.queries.length,1);h.p.onHide();h.p.onShow();assert.equal(h.builds.length,4);assert.equal(h.queries.length,2);h.p.onUnload();assert.equal(h.off(),1);});
 await test('Reports remain empty while locked or hidden',async()=>{const h=harness('reports',true);h.p.onLoad();h.p.onShow();assert.equal(h.queries.length,0);h.p.onHide();h.setLocked(false);h.emit();assert.equal(h.queries.length,0);h.p.onShow();assert.equal(h.queries.length,1);h.p.onUnload();});
  await test('Old canvas query cannot replace the latest year canvas',async()=>{const h=harness('reports');h.p.onLoad();h.p.onShow();const older=h.queries[0];h.p.setData({year:'2025'});h.p.generate();const a={getContext:()=> 'old'},b={getContext:()=> 'new'};h.queries[1]([{node:b}]);older([{node:a}]);assert.equal(h.p._canvas,b);assert.equal(h.draws.length,1);h.p.onUnload();});
  await test('Hide/show invalidates callbacks even when identity is unchanged',async()=>{const h=harness('reports');h.p.onLoad();h.p.onShow();const older=h.queries[0];h.p.onHide();h.p.onShow();older([{node:{getContext:()=> 'old'}}]);assert.equal(h.draws.length,0);assert.equal(h.p._canvas,null);h.p.onUnload();});
  await test('Unloading invalidates queued canvas work',async()=>{const h=harness('reports');h.p.onLoad();h.p.onShow();h.p.onUnload();h.queries[0]([{node:{getContext:()=> 'late'}}]);assert.equal(h.draws.length,0);});

 console.log(passed+' lifecycle/render checks passed; synthetic, not device FPS.');
})().catch(e=>{console.error(e);process.exitCode=1;});
