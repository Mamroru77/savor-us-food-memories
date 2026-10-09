// Production Map camera acknowledgements + projection. Synthetic native replies only.
const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const stack=require('../miniprogram/utils/mapStack'),projection=require('../miniprogram/utils/mapProjection'),layout=require('../miniprogram/utils/mapLayout');
// The page derives its camera composition from utils/mapCamera; this harness stubs require
// with a whitelist, so the real module is listed here. Supplying a real dependency is not
// the same as relaxing an assertion - every check below still runs against production code.
const camera=require('../miniprogram/utils/mapCamera');
let spec,platform='devtools';
const deps={i18n:{copy:()=>({}),locale:()=> 'en',t:x=>x},uiFeedback:{},metrics:{getMetrics:()=>({screenWidth:375})},data:{isCloudImage:v=>typeof v==='string'&&v.indexOf('cloud://')===0,formatDate:x=>x,photos:{meal:'fixture'}},restaurantCategory:{summary:()=>''},mapMarkers:{style:selected=>({width:selected?80:48,height:selected?90:54,iconPath:'fixture'})},mapLayout:layout,mapStack:stack,mapProjection:projection,mapCamera:camera,imageCache:require('../miniprogram/utils/imageCache')};
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
// The overview no longer fits imperatively: `includePoints` sets the centre AND the scale in one
// jump, which is the cut this round removes. Its plan is unchanged — same geometry, same level —
// but it is applied through the same travel token as a marker focus, so the acknowledgement that
// reconciles the viewport is the TRAVEL SETTLE. Everything this test exists to protect (the
// native scale refresh and the invalidation of the pre-camera region query) is unchanged.
test('overview travel settle refreshes native scale and invalidates the pre-camera region query',()=>{
 const h=harness(),p=h.p;p.recenter();
 assert.equal(h.cameras.length,0,'the overview issues no native fit');
 assert.ok(p.cameraTransition,'it starts a travel instead');
 assert.equal(h.queries.length,1,'the pre-camera projection query is issued first');
 const old=h.queries.shift();
 p.stepCameraTransition(p.cameraTransition.duration);
 assert.equal(p.data.mapScale,13.8);
 assert.equal(h.queries.length,1,'the settle issues its own query');
 old.success({southwest:{latitude:0,longitude:0},northeast:{latitude:1,longitude:1}});
 assert.equal(p.data.stackPositionsReady,false,'the stale reply is ignored');
 h.queries.shift().success(region);
 assert.equal(p.data.stackPositionsReady,true);
 const anchor=projection.project(p.allMemories[0].coordinates,region,rect),d=p.data.mapDrawers[0];
 assert.equal(d.screenX,anchor.x-44);assert.equal(d.screenY,anchor.y);assert.equal(d.rootTop-d.height,-89);assert.equal(d.buttonBox.hitWidth,44);
 assert.equal(h.cameras.length,0);
});
test('same grouping refreshes scale without replacing root, frame capacity or coordinates',()=>{
 const h=harness(),p=h.p,before=JSON.stringify(p.allMemories);p.recenter();const root=p.data.mapDrawers[0].rootId,frame=p.data.mapDrawers[0].frameHeight,groups=p.markerGroups;p.stepCameraTransition(p.cameraTransition.duration);assert.equal(p.markerGroups,groups);assert.equal(p.data.mapDrawers[0].rootId,root);assert.equal(p.data.mapDrawers[0].frameHeight,frame);assert.equal(JSON.stringify(p.allMemories),before);
});
// The staleness guard this protects is the GENERATION check at the top of
// onCameraViewportReady: an acknowledgement from a generation the page has moved past must not
// query, must not restore hit regions and must not touch the observed scale. A travel also stops
// writing frames once it is superseded (owned by verify-map-camera-motion M4).
test('a stale camera acknowledgement does not query or restore hit regions',()=>{const h=harness(),p=h.p;p.recenter();const n=h.queries.length,ready=p.data.stackPositionsReady;p.onCameraViewportReady(p.markerGeneration-1,'focus');assert.equal(h.queries.length,n);assert.equal(p.data.mapScale,18);assert.equal(p.data.stackPositionsReady,ready,'the live projection is left exactly as it was');});
test('hidden, disposed, and actively dragged pages reject camera acknowledgements',()=>{for(const key of ['hidden','disposed','gesture']){const h=harness();h.p.recenter();const travel=h.p.cameraTransition;if(key==='hidden')h.p.active=false;if(key==='disposed')h.p.disposed=true;if(key==='gesture')h.p.stackGesture=true;const n=h.queries.length;h.p.stepCameraTransition(travel.duration);assert.equal(h.queries.length,n);assert.equal(h.p.data.mapScale,18);}});
// A marker focus no longer issues a native camera command on ANY arm: the platform has no
// camera animation API, `moveToLocation` is a centre-only jump that the IDE cannot run at all,
// and `includePoints` is a silent no-op there. The travel is a sequence of bound-centre writes,
// which is the one channel that is continuous everywhere — so the contract here is that a
// focus starts a travel, issues nothing imperative, and reconciles the current generation once.
test('a marker focus starts a travel and issues no native camera command',()=>{platform='devtools';const h=harness();h.p.markerGeneration=1;h.p.focusMapCamera([31.46,121.13]);assert.equal(h.cameras.length,0,'no includePoints');assert.equal(h.moves.length,0,'no moveToLocation');assert.ok(h.p.cameraTransition,'a travel is in flight');let ack;h.p.onCameraViewportReady=g=>ack=g;h.p.stepCameraTransition(h.p.cameraTransition.duration);assert.equal(ack,1);platform='devtools';});
test('the travel reconciles the current generation on every platform',()=>{for(const arm of ['ios','devtools']){platform=arm;const h=harness();h.p.markerGeneration=3;let ack;h.p.onCameraViewportReady=g=>ack=g;h.p.focusMapCamera([31.46,121.13]);assert.equal(h.cameras.length,0,'no native fit on '+arm);assert.equal(h.moves.length,0,'no native move on '+arm);const travel=h.p.cameraTransition;assert.ok(travel,'a travel is in flight on '+arm);h.p.stepCameraTransition(travel.duration);assert.equal(ack,3,'the settle reconciles generation 3 on '+arm);h.p.markerGeneration=4;ack=null;h.p.stepCameraTransition(travel.duration*2);assert.equal(ack,null,'a superseded travel reconciles nothing');}platform='devtools';});
test('reconciliation is bounded and uses existing projection/scale methods without a new timer or camera command',()=>{const s=spec.onCameraViewportReady.toString();assert(s.includes('this.readMapScale()'));assert(s.includes('this.syncStackPositions()'));assert(!/setTimeout|setInterval|includePoints|moveToLocation/.test(s));});
console.log(passed+' viewport acknowledgement checks passed; no phone motion claim.');
