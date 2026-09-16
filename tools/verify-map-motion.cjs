const assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm');
const source=fs.readFileSync('miniprogram/pages/map/index.js','utf8'),stack=require('../miniprogram/utils/mapStack');let spec;const timers=[];let now=0;
const dependencies={'../../utils/identity':{snapshot:()=>({locked:false})},'../../utils/i18n':{copy:()=>({}),locale:()=> 'zh-CN',syncPage:()=>{}},'../../utils/uiFeedback':{},'../../utils/mapLayout':require('../miniprogram/utils/mapLayout'),'../../utils/mapMarkers':{},'../../utils/restaurantCategory':{},'../../utils/mapStack':stack,'../../utils/metrics':{getMetrics:()=>({screenWidth:375})},'../../utils/data':{formatDate:x=>x}};
vm.runInNewContext(source,{Page:p=>spec=p,require:p=>dependencies[p]||{},wx:{},Date:{now:()=>now},setTimeout:(fn,ms)=>{const t={fn,ms,active:true};timers.push(t);return t;},clearTimeout:t=>{if(t)t.active=false;}});
function page(){const p=Object.assign({},spec,{data:JSON.parse(JSON.stringify(spec.data)),active:true,disposed:false,writes:[],callbacks:[]});p.setData=function(patch,done){this.writes.push(patch);for(const [key,value]of Object.entries(patch)){const keys=key.replace(/\[(\d+)\]/g,'.$1').split('.');let obj=this.data;keys.slice(0,-1).forEach(k=>obj=obj[k]);obj[keys.at(-1)]=value;}if(done)this.callbacks.push(done);};return p;}
function setup(){const p=page();p.drawerRootId='root';p.data.mapDrawers=[{rootId:'root',rows:[{id:'c'},{id:'b'},{id:'a'}],pages:2,root:{id:'root'}}];return p;}
let count=0;function test(name,fn){fn();count++;console.log('PASS '+name);}
test('frame contains geometry only, no marker/photo/list replacement',()=>{const p=setup();p.patchDrawerFrame(.5);const patch=p.writes[0];assert.equal(Object.keys(patch).length,9);assert(Object.keys(patch).every(k=>/^mapDrawers\[0\]\.(progress|height|rootTop|rows\[\d\]\.(top|opacity))$/.test(k)));assert(!JSON.stringify(patch).includes('iconPath'));const expected=stack.layout(3,.5);assert.equal(p.data.mapDrawers[0].height,expected.height+14);assert.equal(p.data.mapDrawers[0].rows[0].top,expected.slots[2].top+14);});
test('opening/closing uses 320ms geometry, not fade-only or regrouping',()=>{assert.equal(stack.DURATION,320);for(const method of ['onDrawerToggle','onDrawerPage'])assert(!spec[method].toString().includes('applyFilters'));assert(spec.patchDrawerFrame.toString().includes("set('height'"));});
test('animation waits for native setData acknowledgement before scheduling next frame',()=>{timers.length=0;now=0;const p=setup();p.startDrawerReveal(1);const first=timers.shift();now=16;first.fn();assert.equal(p.writes.length,1);assert.equal(timers.length,0);now=40;p.callbacks.shift()();assert.equal(timers.length,1);assert.equal(timers[0].ms,16);});
test('interrupted frame acknowledgement cannot revive old animation',()=>{timers.length=0;now=0;const p=setup();p.startDrawerReveal(1);now=16;timers.shift().fn();p.pauseDrawerReveal();p.callbacks.shift()();assert.equal(timers.length,0);});
test('drag pauses geometry without collapsing the visible stack',()=>{const p=setup();p.drawerProgress=.4;p.drawerAnimating=true;p.data.clusterOpen=true;p.data.stackPositionsReady=true;p.onMapRegionChange({detail:{type:'begin'}});assert.equal(p.stackGesture,true);assert.equal(p.drawerProgress,.4);assert.equal(p.drawerResumeTarget,1);assert.equal(p.data.stackPositionsReady,false);assert(p.writes.every(x=>!x.markers&&!x.mapDrawers));});
test('store update during gesture defers map work without retaining a private snapshot',()=>{const p=setup();p.stackGesture=true;p.applyFilters=()=>assert.fail('rebuild during drag');const state={memories:[]};p.syncState(state);assert.equal(p.deferredMapState,true);assert.notEqual(p.deferredMapState,state);assert(spec.onMapRegionChange.toString().includes('this.syncState(store.get())'));assert.equal(p.writes.length,0);});
test('cached stack photos create no redundant native writes',()=>{const p=setup();p.allMemories=[{id:'root'}];p.data.mapDrawers[0].root.iconPath='cached';p.pinRenderer={peek:()=> 'cached',render:()=>assert.fail('cached photo re-rendered')};p.renderDrawerPhotos(1);assert.equal(p.writes.length,0);});
test('stack and singleton renderers are dormant while camera is moving',()=>{const p=setup();p.stackGesture=true;p.pinRenderer={render:()=>assert.fail('photo work during drag')};p.renderDrawerPhotos(1);p.renderMarkerPhotos([],null,1);assert.equal(p.writes.length,0);});
test('search uses bottom-card material in both themes without changing dimensions',()=>{const w=fs.readFileSync('miniprogram/pages/map/index.wxml','utf8'),css=fs.readFileSync('miniprogram/pages/map/index.wxss','utf8');assert(w.includes('class="map-search glass content-card"'));for(const v of ['--content-card-bg','--content-card-border','--content-card-shadow','--content-card-blur'])assert(css.includes(v));assert(css.includes('height: 95rpx'));assert(css.includes('border-radius: 37rpx'));});
const layout=require('../miniprogram/utils/mapLayout');
const mem=(id,coordinates)=>({id,coordinates,tags:[],restaurant:id,city:'',country:''});
function zoomPage(memories){const p={...spec,active:true,data:{...spec.data,mapScale:13,selectedId:'a',clusterOpen:true,drawerPage:1},allMemories:memories,drawerRootId:'a',drawerProgress:.6,writes:[],rebuilds:0,stops:0,setData(x){this.writes.push(x);Object.assign(this.data,x)},stopDrawerReveal(){this.stops++;this.drawerProgress=0},applyFilters(){this.rebuilds++}};p.markerGroups=layout.group(memories,13,'a');return p;}
test('small zoom preserves open stack, page and interrupted progress with scale-only write',()=>{const p=zoomPage([mem('a',[22.6,120.3]),mem('b',[22.6,120.3])]);const markers=p.data.markers;p.readMapScale(13.1);assert.equal(p.data.clusterOpen,true);assert.equal(p.drawerProgress,.6);assert.equal(p.data.drawerPage,1);assert.equal(p.rebuilds,0);assert.equal(p.stops,0);assert.equal(p.data.markers,markers);assert.deepEqual(Object.keys(p.writes[0]),['mapScale']);});
test('same groups during zoom out also remain mounted',()=>{const p=zoomPage([mem('a',[22.6,120.3]),mem('b',[22.6,120.3])]);p.readMapScale(12.7);assert.equal(p.rebuilds,0);assert.equal(p.data.clusterOpen,true)});
test('real split still closes obsolete drawer and rebuilds once',()=>{const p=zoomPage([mem('a',[22.6,120.3]),mem('b',[22.6,120.305])]);assert.equal(p.markerGroups.length,1);p.readMapScale(18);assert.equal(p.data.clusterOpen,false);assert.equal(p.rebuilds,1);assert.equal(p.stops,1);assert.equal(p.data.drawerPage,0)});
test('distant split preserves unchanged open group',()=>{const p=zoomPage([mem('a',[22.6,120.3]),mem('b',[22.6,120.3]),mem('c',[23,121]),mem('d',[23,121.005])]);assert.equal(p.markerGroups.length,2);p.readMapScale(18);assert.equal(p.data.clusterOpen,true);assert.equal(p.rebuilds,1);assert.equal(p.stops,0);assert.equal(p.drawerProgress,.6)});
test('late scale callback cannot override a more recent native event',()=>{const p=zoomPage([mem('a',[22.6,120.3]),mem('b',[22.6,120.3])]);let success;p.mapCtx={getScale:o=>success=o.success};p.readMapScale();p.readMapScale(14);success({scale:12});assert.equal(p.data.mapScale,14)});
test('hidden page and insignificant scale changes perform no work',()=>{const p=zoomPage([]);p.readMapScale(13.01);p.active=false;p.readMapScale(14);assert.equal(p.writes.length,0)});
test('coordinates and input order never change',()=>{const list=[mem('a',[22.6,120.3]),mem('b',[22.6,120.3])],before=JSON.stringify(list),p=zoomPage(list);p.readMapScale(14);assert.equal(JSON.stringify(list),before)});

test('split stacks never lend transparent anchor images or one-pixel sizes to singleton pins',()=>{
 const key='../../utils/mapMarkers',before=dependencies[key].style,oldT=dependencies['../../utils/i18n'].t;
 dependencies[key].style=selected=>({width:selected?80:48,height:selected?90:54,iconPath:selected?'selected-fallback.png':'normal-fallback.png'});dependencies['../../utils/i18n'].t=x=>x;
 try{const p=page();p.data.mapScale=18;p.data.selectedId='a';dependencies['../../utils/restaurantCategory'].summary=()=>'';dependencies['../../utils/data'].photos={meal:'fallback.png'};p.allMemories=[{id:'a',coordinates:[22.6,120.3],restaurant:'A',tags:[]},{id:'b',coordinates:[22.6,120.305],restaurant:'B',tags:[]}];p.data.markers=[{id:0,memoryId:'a',groupCount:2,stampSelected:true,width:1,height:1,iconPath:'/images/markers/stack-anchor.png'}];p.applyFilters('','all','a','preserve');assert.equal(p.data.markers.length,2);assert.equal(p.data.markers[0].iconPath,'selected-fallback.png');assert.equal(p.data.markers[0].width,48);assert.equal(p.data.markers[1].iconPath,'normal-fallback.png');assert(p.data.markers.every(m=>m.groupCount===1&&m.iconPath!=='/images/markers/stack-anchor.png'));}
 finally{dependencies[key].style=before;dependencies['../../utils/i18n'].t=oldT;}
});

test('canvas absent at onReady can initialize after identity mounts it without rebuilding groups',()=>{
 const p=page(),callbacks=[],old=dependencies['../../utils/mapMarkers'].createRenderer;let enhanced=0,created=0;
 dependencies['../../utils/mapMarkers'].createRenderer=()=>{created++;return {dispose(){}};};
 p.createSelectorQuery=()=>({select(){return this},fields(){return this},exec(cb){callbacks.push(cb)}});
 p.renderMarkerPhotos=()=>enhanced++;p.renderDrawerPhotos=()=>enhanced++;p.syncState=()=>assert.fail('canvas readiness must not rebuild map');
 try{p.onReady();callbacks.shift()([]);assert.equal(created,0);assert.equal(p.markerCanvasPending,false);p.ensureMarkerRenderer();callbacks.shift()([{node:{}}]);assert.equal(created,1);assert.equal(enhanced,2);assert(p.pinRenderer);p.ensureMarkerRenderer();assert.equal(callbacks.length,0);}
 finally{dependencies['../../utils/mapMarkers'].createRenderer=old;}
});
test('canvas query is single-flight and a late hidden-page reply cannot replace the new canvas',()=>{
 const p=page(),callbacks=[],old=dependencies['../../utils/mapMarkers'].createRenderer;let created=0;
 dependencies['../../utils/mapMarkers'].createRenderer=()=>{created++;return {dispose(){}};};
 p.createSelectorQuery=()=>({select(){return this},fields(){return this},exec(cb){callbacks.push(cb)}});p.renderMarkerPhotos=()=>{};p.renderDrawerPhotos=()=>{};
 try{p.ensureMarkerRenderer();p.ensureMarkerRenderer();assert.equal(callbacks.length,1);p.onHide();p.active=true;p.ensureMarkerRenderer();assert.equal(callbacks.length,2);callbacks.shift()([{node:{old:true}}]);assert.equal(created,0);assert.equal(p.markerCanvasPending,true);const current={};callbacks.shift()([{node:current}]);assert.equal(created,1);assert.equal(p.markerCanvas,current);}
 finally{dependencies['../../utils/mapMarkers'].createRenderer=old;}
});

test('fixed native bounds preserve root and logical path in both directions and every page',()=>{
 const p=page();p.pinRenderer={peek:()=> 'existing-photo'};p.drawerRootId='root';p.data.selectedId='root';
 for(const count of [2,3,4,5,8]){
  const members=Array.from({length:count},(_,i)=>({id:i?'other-'+i:'root'})),groups=[{memory:members[0],members}];let bounds;
  for(let pageIndex=0;pageIndex<Math.ceil((count-1)/3);pageIndex++)for(const progress of [0,.1,.5,1,.7,.2,0]){
   p.drawerProgress=progress;p.data.clusterOpen=progress>0;p.data.drawerPage=pageIndex;
   const d=p.buildDrawers(groups,[], 'root')[0],fixed=[d.frameHeight,d.frameRootTop];
   if(!bounds)bounds=fixed;assert.deepEqual(fixed,bounds);assert.equal(d.frameRootTop-d.frameHeight,-89);
   const offset=d.frameRootTop-d.rootTop;assert.equal(-d.frameHeight+offset,-d.height);
   for(const row of d.rows)assert.equal(-d.frameHeight+offset+row.top,-d.height+row.top);
  }
 }
});
test('animation never resizes fixed native bounds or rewrites the root anchor',()=>{
 const p=setup();p.data.mapDrawers[0].frameHeight=460;p.data.mapDrawers[0].frameRootTop=371;
 for(const progress of [0,.3,1,.6,0])p.patchDrawerFrame(progress);
 assert.equal(p.data.mapDrawers[0].frameHeight,460);assert.equal(p.data.mapDrawers[0].frameRootTop,371);
 assert(p.writes.every(patch=>Object.keys(patch).every(key=>!key.includes('frameHeight')&&!key.includes('frameRootTop'))));
});
test('fixed native ink remains equivalent to the original transparent hit projection',()=>{
 const w=fs.readFileSync('miniprogram/pages/map/index.wxml','utf8');
 assert(w.includes('class="native-stack" style="height:{{drawer.frameHeight}}px"'));
 assert(w.includes('top:{{drawer.screenY-drawer.height}}px;height:{{drawer.height}}px'));
 for(const term of ['frameHeight-drawer.height+drawer.rootTop','frameHeight-drawer.height+pin.top','frameHeight-drawer.height+36'])assert.equal(w.split('top:{{drawer.'+term+'}}px').length-1,1);
 assert(w.includes('top:{{drawer.rootTop}}px'));assert(w.includes('top:{{pin.top}}px'));
 assert(w.includes('top:{{drawer.frameHeight-drawer.height+drawer.buttonBox.top}}px'));
 assert(w.includes('top:{{drawer.buttonBox.hitTop}}px'));
});
test('near-pin button moves down 8px without shrinking targets or overlapping root and paging',()=>{
 for(const width of [320,375,390,430,768]){
  const old=stack.buttonGeometry(width),near=stack.buttonGeometry(width,true);
  assert.equal(near.top-old.top,8);assert(near.hitWidth>=44);assert.equal(near.hitHeight,40);
  assert.equal(near.hitTop+near.hitHeight,40);assert.equal(old.hitTop+old.hitHeight,36);
  const center=near.top+near.size/2,glyphHalf=near.size*7/32;
  assert(center-glyphHalf>=near.hitTop);assert(center+glyphHalf<=near.hitTop+near.hitHeight);
 }
});

console.log(count+'/'+count+' map motion checks passed (synthetic; no phone FPS claim).');
