// Production Map camera acknowledgements + projection. Synthetic native replies only.
const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const stack=require('../miniprogram/utils/mapStack'),projection=require('../miniprogram/utils/mapProjection'),layout=require('../miniprogram/utils/mapLayout');
let spec,platform='devtools';
const deps={i18n:{copy:()=>({}),locale:()=> 'en',t:x=>x},uiFeedback:{},metrics:{getMetrics:()=>({screenWidth:375})},data:{formatDate:x=>x,photos:{meal:'fixture'}},restaurantCategory:{summary:()=>''},mapMarkers:{style:selected=>({width:selected?80:48,height:selected?90:54,iconPath:'fixture'})},mapLayout:layout,mapStack:stack,mapProjection:projection};
vm.runInNewContext(fs.readFileSync('miniprogram/pages/map/index.js','utf8'),{Page:p=>spec=p,require:p=>deps[p.split('/').pop()]||{},wx:{getDeviceInfo:()=>({platform})},setTimeout,clearTimeout});
const memory=(id)=>({id,restaurant:id,tags:[],coordinates:[31.46,121.13],photo:'fixture'});
const region={southwest:{latitude:31.41,longitude:121.12},northeast:{latitude:31.49,longitude:121.17}},rect={width:428,height:926};
function harness(){
 const queries=[],cameras=[],moves=[];
 const p={...spec,active:true,disposed:false,data:{...spec.data,mapScale:18},allMemories:[memory('fixture-a'),memory('fixture-b')],setData(x,cb){Object.assign(this.data,x);if(cb)cb();},stopDrawerReveal(){this.drawerProgress=0;},stopMarkerAnimation(){},ensureMarkerRenderer(){},animateMarkerSizes(){},renderMarkerPhotos(){},renderDrawerPhotos(){},createSelectorQuery(){return {select(){return this},boundingClientRect(cb){cb(rect);return this},exec(){}};}};
 p.mapCtx={getRegion:o=>queries.push(o),getScale:o=>o.success({scale:13.8}),includePoints:o=>cameras.push(o),moveToLocation:o=>moves.push(o)};
 return {p,queries,cameras,moves};
}
let passed=0;function test(name,fn){fn();passed++;console.log('PASS '+name);}
test('All overview acknowledgement refreshes native scale and invalidates pre-camera region query',()=>{
 const h=harness(),p=h.p;p.recenter();assert.equal(h.cameras.length,1);assert.equal(h.queries.length,1);const old=h.queries.shift();h.cameras[0].success();assert.equal(p.data.mapScale,13.8);assert.equal(h.queries.length,1);old.success({southwest:{latitude:0,longitude:0},northeast:{latitude:1,longitude:1}});assert.equal(p.data.stackPositionsReady,false);h.queries.shift().success(region);assert.equal(p.data.stackPositionsReady,true);const anchor=projection.project(p.allMemories[0].coordinates,region,rect),d=p.data.mapDrawers[0];assert.equal(d.screenX,anchor.x-44);assert.equal(d.screenY,anchor.y);assert.equal(d.rootTop-d.height,-89);assert.equal(d.buttonBox.hitWidth,44);assert.equal(h.cameras.length,1);
});
test('same grouping refreshes scale without replacing root, frame capacity or coordinates',()=>{
 const h=harness(),p=h.p,before=JSON.stringify(p.allMemories);p.recenter();const root=p.data.mapDrawers[0].rootId,frame=p.data.mapDrawers[0].frameHeight,groups=p.markerGroups;h.cameras[0].success();assert.equal(p.markerGroups,groups);assert.equal(p.data.mapDrawers[0].rootId,root);assert.equal(p.data.mapDrawers[0].frameHeight,frame);assert.equal(JSON.stringify(p.allMemories),before);
});
test('obsolete camera acknowledgement does not query or restore hit regions',()=>{const h=harness();h.p.recenter();h.p.markerGeneration++;const n=h.queries.length;h.cameras[0].success();assert.equal(h.queries.length,n);assert.equal(h.p.data.mapScale,18);});
test('hidden, disposed, and actively dragged pages reject camera acknowledgements',()=>{for(const key of ['hidden','disposed','gesture']){const h=harness();h.p.recenter();if(key==='hidden')h.p.active=false;if(key==='disposed')h.p.disposed=true;if(key==='gesture')h.p.stackGesture=true;const n=h.queries.length;h.cameras[0].success();assert.equal(h.queries.length,n);assert.equal(h.p.data.mapScale,18);}});
test('DevTools one-point fallback keeps real target and receives the same reconciliation',()=>{platform='devtools';const h=harness();h.p.markerGeneration=1;h.p.focusMapCamera([31.46,121.13]);assert.equal(h.cameras.length,1);assert.deepEqual(JSON.parse(JSON.stringify(h.cameras[0].points)),[{latitude:31.46,longitude:121.13}]);let ack;h.p.onCameraViewportReady=g=>ack=g;h.cameras[0].success();assert.equal(ack,1);});
test('native move success and native failure fallback both reconcile the current generation',()=>{platform='ios';const h=harness();h.p.markerGeneration=3;let ack;h.p.onCameraViewportReady=g=>ack=g;h.p.focusMapCamera([31.46,121.13]);assert.equal(h.moves.length,1);h.moves[0].success();assert.equal(ack,3);ack=null;h.moves[0].fail();assert.equal(h.cameras.length,1);h.cameras[0].success();assert.equal(ack,3);platform='devtools';});
test('reconciliation is bounded and uses existing projection/scale methods without a new timer or camera command',()=>{const s=spec.onCameraViewportReady.toString();assert(s.includes('this.readMapScale()'));assert(s.includes('this.syncStackPositions()'));assert(!/setTimeout|setInterval|includePoints|moveToLocation/.test(s));});
console.log(passed+' viewport acknowledgement checks passed; no phone motion claim.');
