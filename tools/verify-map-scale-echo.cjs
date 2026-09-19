// Template-bound camera input vs production scale readback; no native floor mock.
const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const layout=require('../miniprogram/utils/mapLayout');
const wxml=fs.readFileSync('miniprogram/pages/map/index.wxml','utf8');
const match=wxml.match(/\n\s+scale="\{\{(\w+)\}\}"/);assert(match,'Map must retain an explicit initial scale binding');
const bound=match[1];let spec;
vm.runInNewContext(fs.readFileSync('miniprogram/pages/map/index.js','utf8'),{
 Page:p=>spec=p,require:p=>({mapLayout:layout,i18n:{copy:()=>({}),locale:()=> 'en'}}[p.split('/').pop()]||{}),
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
test('existing explicit focus still targets the same real point using one native command',()=>{
 const p=harness();p.focusMapCamera([22.6,120.3]);assert.equal(p.commands.length,1);
 assert.deepEqual(JSON.parse(JSON.stringify(p.commands[0].points)),[{latitude:22.6,longitude:120.3}]);
 assert.equal(p.data.latitude,22.6);assert.equal(p.data.longitude,120.3);assert.equal(p.cameraInputs.length,0);
});
console.log(`${passed} passed, ${failed} failed; template/production contract, native replay recorded separately.`);
if(failed)process.exitCode=1;
