// Template-bound camera input vs production scale readback; no native floor mock.
const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const layout=require('../miniprogram/utils/mapLayout');
// The page now derives its camera composition from utils/mapCamera. This harness stubs
// require with a whitelist, so the real module must be listed here or the production path
// silently degrades to no command at all (the fallback's try/catch would swallow the
// missing dependency). No assertion below is relaxed by supplying it.
const mapCamera=require('../miniprogram/utils/mapCamera');
const wxml=fs.readFileSync('miniprogram/pages/map/index.wxml','utf8');
const match=wxml.match(/\n\s+scale="\{\{(\w+)\}\}"/);assert(match,'Map must retain an explicit initial scale binding');
const bound=match[1];let spec;
vm.runInNewContext(fs.readFileSync('miniprogram/pages/map/index.js','utf8'),{
 Page:p=>spec=p,require:p=>({mapLayout:layout,mapCamera,imageCache:require('../miniprogram/utils/imageCache'),i18n:{copy:()=>({}),locale:()=> 'en'}}[p.split('/').pop()]||{}),
 wx:{getDeviceInfo:()=>({platform:'devtools'})},setTimeout:()=>1,clearTimeout:()=>{},
});
function harness(){
 const memories=['a','b'].map(id=>({id,restaurant:id,tags:[],coordinates:[22.6,120.3]}));
 const p={...spec,active:true,disposed:false,markerGeneration:1,
  data:{...spec.data,mapScale:13,selectedId:'a',clusterOpen:true,drawerPage:1},allMemories:memories,
  markerGroups:layout.group(memories,13,'a'),drawerRootId:'a',drawerProgress:.5,writes:[],cameraInputs:[],commands:[],
  setData(patch){if(Object.hasOwn(patch,bound)&&patch[bound]!==this.data[bound])this.cameraInputs.push(patch[bound]);this.writes.push(patch);Object.assign(this.data,patch);},
  stopMarkerAnimation(){},stopDrawerReveal(){assert.fail('must preserve identical groups')},applyFilters(){assert.fail('must not regroup identical members')},
 };
 p.mapCtx={getScale:o=>o.success({scale:13.32}),includePoints:o=>p.commands.push(o)};return p;
}
let passed=0,failed=0;function test(name,fn){try{fn();passed++;console.log('PASS '+name)}catch(e){failed++;console.error('FAIL '+name+': '+e.message)}}
test('initial camera scale remains 13',()=>assert.equal(spec.data[bound],13));
test('reading actual fractional native zoom must not send it back through the camera binding',()=>{
 const p=harness(),groups=p.markerGroups;p.readMapScale();assert.equal(p.data.mapScale,13.32);
 assert.equal(p.cameraInputs.length,0,'readback is observation, not a camera directive');
 assert.equal(p.data[bound],13);assert.equal(p.markerGroups,groups);assert.equal(p.commands.length,0);
});
test('gesture end keeps precision and drawer state without echoing a new camera input',()=>{
 const p=harness();p.onMapRegionChange({detail:{type:'begin'}});p.onMapRegionChange({detail:{type:'end',scale:14.25}});
 assert.equal(p.data.mapScale,14.25);assert.equal(p.cameraInputs.length,0);assert.equal(p.data.clusterOpen,true);
 assert.equal(p.data.drawerPage,1);assert.equal(p.drawerProgress,.5);
});
// A focus is a TRAVEL, not a command. The platform exposes no camera animation API, so the
// travel is a short sequence of ordinary bound-centre writes; the contract this suite owns is
// that it is continuous, that it ends exactly on the composed target, and that it never
// touches the bound SCALE (which is this file's subject).
test('existing explicit focus travels to the real point without a native command',()=>{
 const p=harness();p.focusMapCamera([22.6,120.3]);
 assert.equal(p.commands.length,0,'a focus must not issue a native camera command');
 assert.ok(p.cameraTransition,'a travel is in flight');
 const travel=p.cameraTransition;
 const from=[travel.from[0],travel.from[1]];
 p.stepCameraTransition(travel.duration*0.5);
 assert.notDeepEqual([p.data.latitude,p.data.longitude],from,'the travel has moved by mid-flight');
 p.stepCameraTransition(travel.duration);
 assert.ok(Number.isFinite(travel.to[0])&&Number.isFinite(travel.to[1]),'the target is a real point');
 assert.notDeepEqual(travel.to,from,'the target differs from where the travel started');
 assert.ok(Math.abs(p.data.latitude-travel.to[0])<1e-9,'the travel ends exactly on its target latitude');
 assert.ok(Math.abs(p.data.longitude-travel.to[1])<1e-9,'the travel ends exactly on its target longitude');
 // And that target IS the composed one: the marker lands at the centre of the unobstructed
 // region rather than at the centre of the component.
 const composed=mapCamera.centreForPoint([22.6,120.3],travel.scale,travel.viewport,travel.padding);
 assert.ok(Math.abs(travel.to[0]-composed[0])<1e-9,'the target is the composed centre');
 assert.equal(p.cameraInputs.length,0,'the bound scale is never touched by a focus');
});
console.log(`${passed} passed, ${failed} failed; template/production contract, native replay recorded separately.`);
if(failed)process.exitCode=1;
