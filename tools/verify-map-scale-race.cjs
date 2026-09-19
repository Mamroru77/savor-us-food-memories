// Execute production scale/gesture methods with delayed native replies. No runtime mocks.
const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const layout=require('../miniprogram/utils/mapLayout');let spec;
const timers=[];
const deps={i18n:{copy:()=>({}),locale:()=> 'en'},mapLayout:layout};
vm.runInNewContext(fs.readFileSync('miniprogram/pages/map/index.js','utf8'),{
 Page:p=>spec=p,require:p=>deps[p.split('/').pop()]||{},wx:{},
 setTimeout:(fn,ms)=>{const t={fn,ms};timers.push(t);return t;},clearTimeout:()=>{},
});
function page(){
 const list=['root','child'].map(id=>({id,restaurant:'User '+id,tags:[],city:'',country:'',coordinates:[22.6,120.3]}));
 const p={...spec,active:true,disposed:false,stackGesture:false,markerGeneration:1,
  data:{...spec.data,mapScale:13,selectedId:'root',clusterOpen:true,drawerPage:1},
  allMemories:list,drawerRootId:'root',drawerProgress:.6,writes:[],queries:[],rebuilds:0,
  setData(x){this.writes.push(x);Object.assign(this.data,x);},
  stopMarkerAnimation(){},stopDrawerReveal(){assert.fail('unchanged group must not collapse');},
  applyFilters(){this.rebuilds++;},
 };
 p.markerGroups=layout.group(list,13,'root');p.mapCtx={getScale:o=>p.queries.push(o)};return p;
}
let passed=0,failed=0;
function test(name,fn){try{fn();passed++;console.log('PASS '+name);}catch(e){failed++;console.error('FAIL '+name+': '+e.message);}}
test('reply issued before begin cannot write scale or regroup during drag',()=>{
 const p=page();p.readMapScale();const reply=p.queries[0];p.onMapRegionChange({detail:{type:'begin'}});
 const count=p.writes.length;reply.success({scale:13.63});
 assert.equal(p.writes.length,count);assert.equal(p.data.mapScale,13);assert.equal(p.rebuilds,0);
});
test('gesture begin invalidates the pre-gesture native request',()=>{
 const p=page();p.readMapScale();const request=p.scaleRequest;p.onMapRegionChange({detail:{type:'begin'}});
 assert(p.scaleRequest>request);
});
test('new scale query and explicit scale update are dormant during drag',()=>{
 const p=page();p.onMapRegionChange({detail:{type:'begin'}});const count=p.writes.length;
 p.readMapScale();p.readMapScale(14.25);
 assert.equal(p.queries.length,0);assert.equal(p.writes.length,count);assert.equal(p.rebuilds,0);
});
test('end applies current fractional scale; old reply cannot overwrite it',()=>{
 const p=page();p.readMapScale();const old=p.queries[0];p.onMapRegionChange({detail:{type:'begin'}});
 p.onMapRegionChange({detail:{type:'end',scale:14.25}});assert.equal(p.data.mapScale,14.25);
 old.success({scale:12});assert.equal(p.data.mapScale,14.25);assert.equal(p.rebuilds,0);
 assert.equal(p.data.clusterOpen,true);assert.equal(p.drawerProgress,.6);assert.equal(p.data.drawerPage,1);
});
test('end without scale makes one fresh native query and accepts only its reply',()=>{
 const p=page();p.readMapScale();p.onMapRegionChange({detail:{type:'begin'}});p.onMapRegionChange({detail:{type:'end'}});
 assert.equal(p.queries.length,2);p.queries[1].success({scale:13.32});p.queries[0].success({scale:12});
 assert.equal(p.data.mapScale,13.32);assert.equal(p.rebuilds,0);
});
test('disposed renderer/page cannot publish or start scale reads',()=>{
 const p=page();p.readMapScale();p.disposed=true;p.queries[0].success({scale:15});p.readMapScale();p.readMapScale(16);
 assert.equal(p.writes.length,0);assert.equal(p.queries.length,1);
});
test('idle fractional replies retain precision, groups, drawer and user coordinates',()=>{
 const p=page(),groups=p.markerGroups,before=JSON.stringify(p.allMemories);p.readMapScale();p.queries[0].success({scale:13.63});
 assert.equal(p.data.mapScale,13.63);assert.equal(p.markerGroups,groups);assert.equal(p.rebuilds,0);
 assert.equal(p.writes.length,1);assert.deepEqual(Object.keys(p.writes[0]),['mapScale']);
 assert.equal(p.data.clusterOpen,true);assert.equal(p.drawerProgress,.6);assert.equal(JSON.stringify(p.allMemories),before);
});
console.log(`${passed} passed, ${failed} failed; synthetic race contract only, not proof of every DevTools scale discrepancy.`);
if(failed)process.exitCode=1;
