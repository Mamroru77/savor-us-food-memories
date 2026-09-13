// Deliberately delayed parent/child render acknowledgments and out-of-order lifecycle calls.
// This models bridge ordering; it does NOT simulate the native compositor or prove device acceptance.
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const mp=path.join(__dirname,'../miniprogram');let count=0;
async function test(name,fn){await fn();count++;console.log('PASS '+name);}
const clone=x=>JSON.parse(JSON.stringify(x));
function controller(options={}){
 let spec,route=2;const calls=[],timers=[];const appearance={dusk:false,quiet:false,labels:['回忆','地图','记录','我们','我的'],addLabel:'记录'};
 vm.runInNewContext(fs.readFileSync(path.join(mp,'custom-tab-bar/index.js'),'utf8'),{
  Component:s=>spec=s,Date,Set,Number,Array,
  getCurrentPages:()=>route<0?[]:[{route:'pages/'+['home','map','add','us','me'][route]+'/index',_tabAppearance:appearance}],
  setTimeout(fn,ms){timers.push({fn,ms});return timers.length;},clearTimeout(){},
  wx:{switchTab(o){if(options.throwSync)throw Error("mock native exception");calls.push(o);}}
 });
 function bar(defer=false){
  const b={...spec.methods,data:clone(spec.data),acks:[],children:[],
   setData(p,cb){Object.assign(this.data,p);if(cb){if(defer)this.acks.push(cb);else cb();}},
   selectAllComponents(){return this.children;}};
  spec.lifetimes.attached.call(b);b.flush=()=>{while(b.acks.length)b.acks.shift()();};return b;
 }
 return {spec,bar,calls,timers,setRoute:n=>route=n,tap:(b,n)=>b.onTabTap({currentTarget:{dataset:{index:n,path:'/pages/'+['home','map','add','us','me'][n]+'/index'}}})};
}
function morph({deferCommand=false,deferFrame=false,deferStatic=false,setup=true}={}){
 let spec;const saved=global.Component;global.Component=s=>spec=s;const file=path.join(mp,'components/morph-icon/index.js');delete require.cache[require.resolve(file)];require(file);global.Component=saved;
 const c={...spec.methods,data:{...Object.fromEntries(Object.entries(spec.properties).map(([k,v])=>[k,v.value])),...clone(spec.data),renderer:'svg'},acks:[],frames:[],statics:[],reports:[],
  setData(p,cb){Object.assign(this.data,p);if(cb){const finish=()=>{cb();if(p.viewCommand){const v=p.viewCommand;const target=v.quiet||this.data.fallbackOnly||!v.key||(v.active&&this.data.settledEntryKey===v.key);const load=()=>this.staticLoaded({currentTarget:{dataset:{revision:v.revision,src:target?v.targetSrc:v.originSrc}}});if(deferStatic)this.statics.push(load);else load();}if(p.frameSlots&&p.frameSlots.length)this.svgLoaded({currentTarget:{dataset:{generation:p.frameSlots[0].id}}});};
   if((p.viewCommand&&deferCommand))this.acks.push(finish);else if(p.frameSrc&&deferFrame)this.frames.push(finish);else finish();}},
  triggerEvent(n,r){this.reports.push(r);}};
 spec.lifetimes.attached.call(c);if(setup)c.setup();
 c.flush=()=>{while(c.acks.length)c.acks.shift()();};c.hide=()=>spec.pageLifetimes.hide.call(c);c.destroy=()=>spec.lifetimes.detached.call(c);
 c.receive=cmd=>{c.data.presentation=cmd;spec.observers.presentation.call(c,cmd);};return c;
}
const command=(revision,key=revision,active=false,name='utensils',fromName='utensils-crossed',quiet=false)=>({revision,key,active,name,fromName,quiet,color:'#111510',duration:480});
function fallback(c){const w=fs.readFileSync(path.join(mp,'components/morph-icon/index.wxml'),'utf8');return vm.runInNewContext(w.match(/<image[^>]*data-icon="\{\{([^"\n]+)\}\}"/)[1],c.data);}
(async()=>{
 await test('all directed tab taps navigate immediately; H1 primes only hidden Add-Me peers',()=>{
  for(let from=0;from<5;from++)for(let to=0;to<5;to++){
   if(from===to)continue;
   const h=controller();h.setRoute(from);const b=h.bar(),peer=h.bar(),source=JSON.stringify(b.data),cached=JSON.stringify(peer.data);
   h.tap(b,to);assert.equal(h.calls.length,1);assert.equal(h.timers.length,0);assert.equal(JSON.stringify(b.data),source);
   if((from===2&&to===4)||(from===4&&to===2)){
    assert.notEqual(JSON.stringify(peer.data),cached);assert.equal(peer.data.selected,to);assert.equal(peer.data.transitionFrom,from);assert.equal(peer.data.entryActive,true);assert(peer.data.entryKey>0);
   }else assert.equal(JSON.stringify(peer.data),cached);
  }
 });
 await test('parking preserves unchanged icon commands while updating the two selected endpoints',()=>{
  const h=controller(),visible=h.bar(),cached=h.bar();visible.showSelection(2);const prior=cached.data.viewState.icons;
  h.setRoute(3);visible.showSelection(3);const next=cached.data.viewState.icons;
  for(const i of [0,1,4])assert.equal(next[i],prior[i]);for(const i of [2,3])assert.notEqual(next[i],prior[i]);
  assert.equal(next[2].name,'utensils');assert.equal(next[3].name,'users-round');
 });
 await test('parked ready renderer does not arm a timeout while background image callbacks are suspended',async()=>{
  const c=morph({deferStatic:true});c.receive(command(310,0,false,'users-round','users-round'));
  assert.equal(c._staticWaitTimer==null,true);await new Promise(r=>setTimeout(r,1230));assert.equal(c.data.fallbackOnly,false);
  c.receive(command(311,311,true,'users','users-round'));while(c.statics.length)c.statics.shift()();assert(c._svgMotion);c.destroy();
 });
 for(const delay of [20,45]){
  await test('wall-clock scheduling with '+delay+'ms frame commits avoids cumulative latency',()=>{
   let now=0,id=0,spec;const queue=new Map();
   const timer=(fn,ms)=>{const k=++id;queue.set(k,{fn,at:now+ms});return k;};
   const file=path.join(mp,'components/morph-icon/index.js');
   vm.runInNewContext(fs.readFileSync(file,'utf8'),{Component:s=>spec=s,require:require('module').createRequire(file),Date:{now:()=>now},setTimeout:timer,clearTimeout:k=>queue.delete(k)});
   const c={...spec.methods,data:{...Object.fromEntries(Object.entries(spec.properties).map(([k,v])=>[k,v.value])),...clone(spec.data),renderer:'svg',duration:480,name:'map-pinned',fromName:'map',entryKey:1},reports:[],outstanding:0,maxOutstanding:0,
    setData(p,cb){Object.assign(this.data,p);if(cb){if(p.frameSrc){this.outstanding++;this.maxOutstanding=Math.max(this.maxOutstanding,this.outstanding);}timer(()=>{if(p.frameSrc)this.outstanding--;cb();if(p.frameSlots&&p.frameSlots.length)this.svgLoaded({currentTarget:{dataset:{generation:p.frameSlots[0].id}}});},p.frameSrc?delay:0);}},triggerEvent(n,r){this.reports.push(r);}};
   spec.lifetimes.attached.call(c);c.setup();
   while(queue.size&&now<2000){const [k,v]=[...queue].sort((a,b)=>a[1].at-b[1].at)[0];queue.delete(k);now=v.at;v.fn();}
   const r=c.reports.find(r=>r.mode==='complete');assert(r);assert.equal(r.timing,'wall-clock');assert.equal(r.frameBudgetMs,480);
   assert(r.durationMs>=480&&r.durationMs<=480+delay+32);assert.equal(c.maxOutstanding,1);assert.equal(c.data.staticName,'map-pinned');assert.equal(c.data.painting,false);spec.lifetimes.detached.call(c);
  });
 }
 await test('vbug5 cached Us endpoints are parked to Add before the next Us command',()=>{
  const h=controller(),add=h.bar(),us=h.bar();h.setRoute(3);us.showSelection(3);h.setRoute(2);add.showSelection(2);
  assert.equal(us.data.entryActive,false);assert.equal(us.data.viewState.icons[2].name,'utensils-crossed');assert.equal(us.data.viewState.icons[3].name,'users');
  const parked=clone(us.data.viewState);h.tap(add,3);h.setRoute(3);us.showSelection(3);
  for(let i=0;i<5;i++)assert.equal(parked.icons[i].name,us.data.viewState.icons[i].fromName);
  assert.equal(us.data.entryActive,true);assert.equal(add.data.entryActive,false);assert.equal(h.calls.length,1);
 });
 await test('all five forward and cached reverse destinations have parked endpoints matching their next origins',()=>{
  const h=controller(),bars=[h.bar(),h.bar(),h.bar(),h.bar(),h.bar()];h.setRoute(0);bars[0].showSelection(0);
  let from=0;for(const to of [1,2,3,4,3,2,1,0]){
   const before=clone(bars[to].data.viewState);h.tap(bars[from],to);h.setRoute(to);bars[to].showSelection(to);h.calls.at(-1).success();
   for(let i=0;i<5;i++)assert.equal(before.icons[i].name,bars[to].data.viewState.icons[i].fromName);
   assert.equal(bars[to].data.entryActive,true);for(let i=0;i<5;i++)if(i!==to)assert.equal(bars[i].data.entryActive,false);from=to;
  }assert.equal(h.calls.length,8);
 });
 await test('new precreated bar after confirmed page inherits current endpoints without replaying old origin',()=>{
  const h=controller(),source=h.bar();h.tap(source,3);h.setRoute(3);source.showSelection(3);const future=h.bar();
  assert.equal(future.data.entryActive,false);assert.equal(future.data.viewState.icons[2].name,'utensils');assert.equal(future.data.viewState.icons[2].fromName,'utensils');
  assert.equal(future.data.viewState.icons[3].name,'users-round');assert.equal(future.data.viewState.icons[3].fromName,'users-round');
 });
 await test('cached park or H1 prime failure cannot abort current show or native navigation',()=>{
  const h=controller(),a=h.bar(),b=h.bar();b.setData=()=>{throw Error('cached view unavailable');};a.showSelection(2);h.tap(a,4);assert.equal(h.calls.length,1);assert.equal(a.data.entryActive,true);
 });
 await test('repeated current show does not republish already parked background bars',()=>{
  const h=controller(),a=h.bar(),b=h.bar();a.showSelection(2);const rev=b.data.viewState.revision;a.showSelection(2);assert.equal(b.data.viewState.revision,rev);
 });
 await test('parked icons do not create SVG motion and keep artwork present',()=>{
  const c=morph();c.receive(command(300,0,false,'users-round','users-round'));assert(!c._svgMotion);assert.equal(fallback(c),'lucide-users-round');c.destroy();
 });
 await test('render diagnostics distinguish requested static endpoint from first-frame layer without issuing updates',()=>{
  const c=morph({deferStatic:true,deferFrame:true});c.receive(command(200,200,true,'users-round','users'));
  const before=c.getRenderDebug();assert.equal(before.snapshot.staticEndpoint,'users');assert.equal(before.snapshot.logicalLayer,'static');
  c.statics.shift()();assert.equal(c.getRenderDebug().snapshot.logicalLayer,'static');c.frames.shift()();
  assert.equal(c.getRenderDebug().snapshot.logicalLayer,'frame');assert(c.getRenderDebug().trace.some(r=>r.stage==='first-frame-view-commit'));
  assert(c.getRenderDebug().trace.some(r=>r.stage==='first-frame-reveal-commit'));
  const data=JSON.stringify(c.data);c.recordRender('manual-snapshot');assert.equal(JSON.stringify(c.data),data);c.destroy();
 });
 await test('diagnostics preserve old and next command identities for endpoint handoff analysis',()=>{
  const c=morph({setup:false,deferStatic:true});c.receive(command(201,201,true,'utensils-crossed','utensils'));
  c.receive(command(202,202,true,'utensils','utensils-crossed'));
  const r=c.getRenderDebug().trace.filter(r=>r.stage==='command-received').at(-1);
  assert.equal(r.key,201);assert.equal(r.nextKey,202);assert.equal(r.to,'utensils-crossed');assert.equal(r.nextTo,'utensils');c.destroy();
 });
 await test('render export is bounded, detached from internal rows and contains no SVG payload',()=>{
  const c=morph();c.receive(command(203,203,true));for(let i=0;i<100;i++)c.recordRender('test');
  const d=c.getRenderDebug();assert.equal(d.trace.length,64);d.trace[0].stage='mutated';assert.notEqual(c.getRenderDebug().trace[0].stage,'mutated');
  assert(!JSON.stringify(d).includes('data:image'));assert(d.frameMetrics.frames>0);c.destroy();
 });
 await test('load diagnostics identify rejected endpoint without accepting it',()=>{
  const c=morph({deferStatic:true});c.receive(command(204,204,true,'user-round','user'));
  c.staticLoaded({currentTarget:{dataset:{revision:203,src:c.data.viewCommand.targetSrc}}});
  const r=c.getRenderDebug().trace.at(-1);assert.equal(r.stage,'static-load');assert.equal(r.accepted,false);assert.equal(r.loadedEndpoint,'user-round');assert(!c._svgMotion);c.destroy();
 });
 await test('explicit debug query maps child dataset index rather than positional ownership and cannot block navigation',()=>{
  const h=controller(),b=h.bar(),a=h.bar();b.children=[{dataset:{index:4},getRenderDebug:()=>({snapshot:{icon:9}})}];
  const d=b.getTransitionDebug();assert.equal(d.diagnosticBuild,'render-handoff-v1');assert.equal(d.renderInstances.find(r=>r.bar===b._instanceId).icons[0].index,4);
  a.selectAllComponents=()=>{throw Error('diagnostic only failure');};assert(b.getTransitionDebug().renderInstances.find(r=>r.bar===a._instanceId).queryError);
  h.tap(b,3);assert.equal(h.calls.length,1);
 });
 await test('lifecycle diagnostics distinguish setup from actual component page show and hide',()=>{
  const c=morph({setup:false});c.setup();c.hide();const stages=c.getRenderDebug().trace.map(r=>r.stage);
  assert(stages.includes('attached'));assert(stages.includes('setup-enter'));assert(stages.includes('page-hide'));assert(c.getRenderDebug().snapshot.hidden);c.destroy();
 });
 for(const [rest,chosen] of [['house','house-heart'],['map','map-pinned'],['utensils','utensils-crossed'],['users','users-round'],['user','user-round']]){
  for(const [from,to] of [[rest,chosen],[chosen,rest]]){
   await test(from+' -> '+to+' pre-ready wait cannot expose target before origin morph',async()=>{
    const c=morph({deferStatic:true,setup:false,deferFrame:true});
    c.receive(command(100,100,true,from,from));
    assert.equal(c._staticWaitTimer==null,true);
    await new Promise(r=>setTimeout(r,1220));
    assert.equal(c.data.fallbackOnly,false);assert.equal(c.reports.some(r=>r.mode==='static-fallback'),false);
    c.receive(command(101,101,true,to,from));c.receive(command(102,101,true,to,from));
    assert.equal(fallback(c),'lucide-'+from);c.setup();
    while(c.statics.length)c.statics.shift()();
    assert(c._svgMotion);assert.equal(c.data.fallbackOnly,false);assert.equal(fallback(c),'lucide-'+from);
    assert.equal(c.data.frameVisible,false);c.frames.shift()();assert.equal(c.data.frameVisible,true);
    assert.equal(c.reports.filter(r=>r.mode==='start').length,1);c.destroy();
   });
  }
 }
 await test('actual static error before ready remains terminal through late setup and new commands',()=>{
  const c=morph({setup:false,deferStatic:true});c.receive(command(110,110,true));
  c.staticError({currentTarget:{dataset:{revision:110}}});c.setup();
  c.receive(command(111,111,true,'users-round','users'));while(c.statics.length)c.statics.shift()();
  assert.equal(c.data.fallbackOnly,true);assert.equal(fallback(c),'lucide-users-round');assert(!c._svgMotion);assert.equal(c._svgReady,false);c.destroy();
 });
 await test('genuine ready-time timeout cannot restart an origin morph through repeated setup',async()=>{
  const c=morph({deferStatic:true});c.receive(command(120,120,true));await new Promise(r=>setTimeout(r,1250));
  assert.equal(c.data.fallbackOnly,true);c.setup();c.receive(command(121,121,true,'user-round','user'));
  while(c.statics.length)c.statics.shift()();assert(!c._svgMotion);assert.equal(fallback(c),'lucide-user-round');c.destroy();
 });
 await test('detached pre-ready instance has no pending static watchdog',()=>{
  const c=morph({setup:false,deferStatic:true});c.receive(command(130,130,true));c.destroy();
  assert.equal(c._staticWaitTimer==null,true);while(c.statics.length)c.statics.shift()();assert(!c._svgMotion);
 });
 await test('atomic Tab fallback uses a direct official image instead of a cached nested s-icon target',()=>{
  const c=morph();c.data.staticName='utensils';c.receive(command(1));assert.equal(fallback(c),'lucide-utensils-crossed');assert.equal(c.data.viewCommand.originSrc,require(path.join(mp,'utils/icons')).iconSvg('utensils-crossed',{stroke:'#111510',strokeWidth:1.75}));c.destroy();
 });
 await test('duplicate command acknowledgment waits for real child commit, not synchronously assigned VM data',()=>{
  const c=morph({deferCommand:true}),cmd=command(1);let acks=0;c.receive(cmd);c.acceptPresentation(clone(cmd),()=>acks++);assert.equal(acks,0);assert.equal(c.acks.length,1);c.flush();assert.equal(acks,1);c.acceptPresentation(cmd,()=>acks++);assert.equal(acks,2);c.destroy();
 });
 await test('ready cannot start a first SVG flight ahead of the atomic command commit',()=>{
  const c=morph({deferCommand:true,setup:false});c.receive(command(2,2,true));c.setup();assert(!c._svgMotion);c.flush();assert(c._svgMotion);assert.equal(c._svgMotion.elapsed,0);c.destroy();
 });
 await test('navigation never waits for parent, child or image commits',()=>{
  const h=controller(),a=h.bar(true),b=h.bar(true),before=clone(a.data);a.children=[{acceptPresentation(){throw Error('must not dispatch');}}];h.tap(a,4);assert.equal(h.calls.length,1);assert.equal(h.timers.length,0);assert.deepEqual(clone(a.data),before);assert(b.acks.length>1);
 });
 await test('an image loading failure cannot block navigation',()=>{
  const h=controller(),b=h.bar(),c=morph({deferStatic:true});b.children=[c];h.tap(b,3);assert.equal(h.calls.length,1);assert.equal(c.statics.length,0);c.destroy();
 });
 await test('late static image load from an older revision cannot acknowledge the new endpoint',()=>{
  const c=morph({deferStatic:true});c.receive(command(6));let acks=0;c.receive(command(7,7,false,'users','users-round'));c.acceptPresentation(command(7,7,false,'users','users-round'),()=>acks++);
  c.statics.shift()();assert.equal(acks,0);c.statics.shift()();assert.equal(acks,1);assert.equal(fallback(c),'lucide-users-round');c.destroy();
 });
 await test('same-URI late load may acknowledge a newer identical endpoint without waiting for a nonexistent reload',()=>{
  const c=morph({deferStatic:true});c.receive(command(8));c.receive(command(9,9));let acks=0;c.acceptPresentation(command(9,9),()=>acks++);c.statics.shift()();assert.equal(acks,1);c.destroy();
 });
 await test('late static load after hide cannot reactivate old motion; explicit newer visit can resume',()=>{
  const c=morph({deferStatic:true});c.receive(command(40,40,true));c.hide();c.statics.shift()();assert.equal(c._hidden,true);assert(!c._svgMotion);
  c.receive(command(41,40,true));assert.equal(c._hidden,false);assert(c._svgMotion);c.destroy();
 });
 await test('late active parent commit after programmatic route change cannot dispatch to hidden children',()=>{
  const h=controller(),b=h.bar(true);b.flush();let sent=0;b.children=[{acceptPresentation(cmd,ack){sent++;ack();}}];b.showSelection(2);h.setRoute(0);b.flush();assert.equal(sent,0);
 });
 await test('static-image error releases the handoff acknowledgment and reports a terminal SVG fallback',()=>{
  const c=morph({deferStatic:true});c.receive(command(50));let acks=0;c.acceptPresentation(command(50),()=>acks++);c.staticError({currentTarget:{dataset:{revision:50}}});assert.equal(acks,1);assert.equal(c.data.fallbackOnly,true);assert.equal(c.reports.at(-1).reason,'svg-static-unavailable');c.destroy();
 });
 await test('missing static load/error callbacks cannot leave a live icon waiting indefinitely',async()=>{
  const c=morph({deferStatic:true});c.receive(command(51,51,true));let acks=0;c.acceptPresentation(command(51,51,true),()=>acks++);await new Promise(r=>setTimeout(r,1250));
  assert.equal(acks,1);assert.equal(c.data.fallbackOnly,true);assert.equal(fallback(c),'lucide-utensils');assert.equal(c._staticWaitTimer,null);assert.equal(c.reports.at(-1).reason,'svg-static-timeout');c.destroy();
 });
 await test('source is not prepublished as destination and fresh destination starts active',()=>{
  const h=controller(),source=h.bar(),before=clone(source.data);h.tap(source,3);source.seedTransition();assert.deepEqual(clone(source.data),before);h.setRoute(3);const target=h.bar();assert.equal(target.data.selected,3);assert.equal(target.data.entryActive,true);assert.equal(target.data.transitionFrom,2);target.showSelection(3);target.seedTransition();assert.equal(target.data.entryActive,true);
 });
 await test('video sequence Add -> Us -> Me rejects late Us selection and late Us theme callbacks',()=>{
  const h=controller(),b=h.bar();h.tap(b,3);h.setRoute(3);b.showSelection(3);h.calls[0].success();const old=b.data.viewState;
  h.tap(b,4);h.setRoute(4);b.showSelection(4);h.calls[1].success();const current=b.data.viewState;
  assert.equal(b.showSelection(3),false);assert.equal(b.updateAppearance(3,{quiet:true,dusk:true}),false);assert.equal(b.data.viewState,current);assert.equal(current.selected,4);
  assert.equal(current.icons[2].name,'utensils');assert.equal(current.icons[2].fromName,'utensils');assert.equal(current.icons[1].name,'map');assert.equal(current.icons[1].fromName,'map');assert(old.revision<current.revision);
 });
 await test('neither old nor new parent callbacks imperatively dispatch to queried children',()=>{
  const h=controller(),b=h.bar(true);b.flush();let queried=0;b.selectAllComponents=()=>{queried++;throw Error('not required');};b.showSelection(2);const older=b.acks.shift();b.updateAppearance(2,{dusk:true});b.flush();older();assert.equal(queried,0);assert.equal(b.data.viewState.icons[2].name,'utensils-crossed');
 });
 await test('stale property delivery and stale first-frame callbacks cannot overwrite the latest accepted command',()=>{
  const c=morph({deferFrame:true});const a=command(10,10,true);c.receive(a);const oldGeneration=c._generation,oldAck=c.frames.shift();
  const b=command(11,11,false,'utensils','utensils');c.receive(b);const generation=c._generation;c.receive(a);oldAck();c.svgLoaded({currentTarget:{dataset:{generation:oldGeneration}}});c.svgError({currentTarget:{dataset:{generation:oldGeneration}}});
  assert.equal(c.data.viewCommand.revision,11);assert.equal(c._generation,generation);assert.equal(fallback(c),'lucide-utensils');assert(!c._svgMotion);c.destroy();
 });
 for(const [rest,chosen] of [['house','house-heart'],['map','map-pinned'],['utensils','utensils-crossed'],['users','users-round'],['user','user-round']]){
  await test(rest+' atomic outgoing entry retains its origin until one complete 480ms geometric morph',async()=>{
   const c=morph();c.receive(command(20,20,false,rest,chosen));assert.equal(fallback(c),'lucide-'+chosen);assert(!c._svgMotion);
   c.receive(command(21,20,true,rest,chosen));const generation=c._generation,first=c.data.frameSrc;
   c.receive(command(22,20,true,rest,chosen));assert.equal(c._generation,generation);await new Promise(r=>setTimeout(r,90));assert.notEqual(c.data.frameSrc,first);
   await new Promise(r=>setTimeout(r,480));assert.equal(fallback(c),'lucide-'+rest);assert.equal(c.reports.filter(r=>r.mode==='complete').length,1);assert.equal(c.reports.at(-1).frameBudgetMs,480);
   c.receive(command(23,21,true,chosen,rest));assert(c._svgMotion,'incoming reverse remains a real morph');c.destroy();
  });
 }
 await test('Quiet and permanent SVG failure show exact current target, never an old visit origin',()=>{
  const c=morph();c.receive(command(30,30,false,'users-round','users',true));assert.equal(fallback(c),'lucide-users-round');assert(!c._svgMotion);
  c.receive(command(31,31,true));c.svgError();assert.equal(fallback(c),'lucide-utensils');assert.equal(c.data.fallbackOnly,true);c.receive(command(32,32,false,'user-round','user'));assert.equal(fallback(c),'lucide-user-round');c.destroy();
 });
 await test('source remains unchanged on failure and late failure cannot roll back a later request',()=>{
  const h=controller(),a=h.bar(),before=clone(a.data);h.tap(a,3);const fail=h.calls[0].fail;fail({errMsg:'mock native error'});assert.deepEqual(clone(a.data),before);h.tap(a,4);h.setRoute(4);a.showSelection(4);fail({errMsg:'old error'});assert.equal(a.data.selected,4);assert.equal(h.calls.length,2);
 });
 await test('there is no preparation timer and delayed view callbacks cannot repeat navigation',()=>{
  const h=controller(),b=h.bar(true);b.flush();h.tap(b,3);assert.equal(h.calls.length,1);assert.equal(h.timers.length,0);b.flush();assert.equal(h.calls.length,1);
 });
 await test('programmatic Save -> Home uses route metadata without replaying a prior tap entry',()=>{
  const h=controller(),b=h.bar();h.tap(b,3);h.setRoute(3);b.showSelection(3);h.calls[0].success();h.setRoute(0);b.seedTransition();b.showSelection(0);assert.equal(b.data.entryKey,0);assert.equal(b.data.viewState.selected,0);assert.equal(b.data.viewState.icons[0].name,'house-heart');
 });
 await test('appearance refresh cannot inject selection or entry fields and traces remain bounded UI-only data',()=>{
  const h=controller(),b=h.bar();b.updateAppearance(2,{selected:4,entryKey:999,entryActive:false,dusk:true});assert.equal(b.data.viewState.selected,2);assert.equal(b.data.entryKey,0);assert.equal(b.data.dusk,true);
  for(let i=0;i<120;i++)b.trace('test',{key:i});assert.equal(b.getTransitionTrace().length,96);const copy=b.getTransitionTrace();copy[0].key=-1;assert.notEqual(b.getTransitionTrace()[0].key,-1);
 });
 await test('a wrong inferred owner cannot swallow a valid native tab tap',()=>{
  const h=controller(),b=h.bar();b._ownerSelection=0;h.setRoute(3);b.data.selected=3;h.tap(b,4);assert.equal(h.calls.length,1);assert.equal(h.calls[0].url,'/pages/me/index');assert(b.getTransitionTrace().some(r=>r.event==='tap'));
 });
 await test('stale visual selected value cannot veto navigation to a different actual route',()=>{
  const h=controller(),b=h.bar();b.data.selected=4;h.tap(b,4);assert.equal(h.calls.length,1);assert.equal(h.calls[0].url,'/pages/me/index');
 });
 await test('an unfinished previous request cannot lock subsequent tab taps',()=>{
  const h=controller(),b=h.bar();h.tap(b,3);h.tap(b,4);assert.equal(h.calls.length,2);assert.equal(h.calls[1].url,'/pages/me/index');h.calls[0].success();h.calls[0].fail({errMsg:'late'});h.tap(b,1);assert.equal(h.calls.length,3);
 });
 await test('incomplete or reordered component queries cannot assign a Home command to Add',()=>{
  const h=controller(),b=h.bar();let calls=0;b.selectAllComponents=()=>{calls++;return [{dataset:{index:2},acceptPresentation(){throw Error('positional overwrite');}}];};h.setRoute(3);b.showSelection(3);assert.equal(calls,0);assert.equal(b.data.viewState.icons[2].name,'utensils');assert.equal(b.data.viewState.icons[0].name,'house');
 });
 await test('invalid index and actual same-route tap have explicit reasons, not unexplained silence',()=>{
  const h=controller(),b=h.bar();h.tap(b,2);h.tap(b,99);assert.equal(h.calls.length,0);const log=b.getTransitionTrace();assert(log.some(r=>r.event==='tap-noop'&&r.reason==='already-on-route'));assert(log.some(r=>r.event==='tap-rejected'&&r.reason==='invalid-index'));
 });
 await test('debug output identifies the queried instance rather than assuming the last global trace row is visible',()=>{
  const h=controller(),a=h.bar(),b=h.bar();const info=a.getTransitionDebug();assert.equal(info.bar,a._instanceId);assert.notEqual(info.bar,b._instanceId);assert.equal(info.schema,'nav-independent-v1');a.onMorphReport({currentTarget:{dataset:{index:2}},detail:{mode:'static-fallback',entryKey:7,reason:'svg-static-timeout'}});assert.equal(a.getTransitionTrace().at(-1).reason,'svg-static-timeout');
 });
 await test('precreated bar after explicit show inherits language and current static endpoint',()=>{
  const h=controller(),a=h.bar();h.tap(a,4);h.setRoute(4);a.showSelection(4,{labels:['回忆','地图','记录','我们','我的'],dusk:true,quiet:false});const me=h.bar();assert.equal(me.data.labels[4],'我的');assert.equal(me.data.entryActive,false);assert.equal(me.data.viewState.icons[4].fromName,'user-round');assert.equal(me.data.viewState.icons[4].name,'user-round');assert.equal(me.data.dusk,true);
 });
 await test('view publication failure cannot prevent a valid click from calling native navigation',()=>{
  const h=controller(),b=h.bar();b.setData=()=>{throw Error('mock view failure');};b.selectAllComponents=()=>{throw Error('mock child query failure');};h.tap(b,4);assert.equal(h.calls.length,1);
 });
 await test('synchronous native failure is logged and does not leave a lock on the next click',()=>{
  const h=controller({throwSync:true}),b=h.bar();h.tap(b,3);h.tap(b,4);assert.equal(b.getTransitionTrace().filter(r=>r.event==='switch-failed').length,2);
 });
 for(const [rest,chosen] of [['house','house-heart'],['map','map-pinned'],['utensils','utensils-crossed'],['users','users-round'],['user','user-round']]){
  await test(rest+' repeated same-visual publications before static load retain one pending start',async()=>{
   const c=morph({deferStatic:true});c.receive(command(60,60,true,rest,chosen));c.receive(command(61,60,true,rest,chosen));c.receive(command(62,60,true,rest,chosen));
   assert.equal(c._commandNeedsMove,true);assert(!c._svgMotion);c.statics.shift()();assert(c._svgMotion);assert.equal(c._commandNeedsMove,false);const generation=c._generation;
   c.receive(command(63,60,true,rest,chosen));assert.equal(c._generation,generation);assert.equal(c._commandNeedsMove,false);
   await new Promise(r=>setTimeout(r,580));assert.equal(c.reports.filter(r=>r.mode==='start').length,1);assert.equal(c.reports.filter(r=>r.mode==='complete').length,1);assert.equal(c.reports.find(r=>r.mode==='complete').frameBudgetMs,480);assert.equal(fallback(c),'lucide-'+rest);
   c.receive(command(64,60,true,rest,chosen));while(c.statics.length)c.statics.shift()();assert(!c._svgMotion);assert.equal(c.reports.filter(r=>r.mode==='start').length,1);c.destroy();
  });
 }
 await test('static load before renderer ready retains the request until setup, then consumes it once',()=>{
  const c=morph({setup:false});c.receive(command(70,70,true));c.receive(command(71,70,true));assert.equal(c._commandNeedsMove,true);assert(!c._svgMotion);c.setup();assert(c._svgMotion);assert.equal(c._commandNeedsMove,false);const generation=c._generation;c.setup();assert.equal(c._generation,generation);c.destroy();
 });
 await test('delayed child commit plus same-visual publication cannot discard the requested start',()=>{
  const c=morph({deferCommand:true});c.receive(command(72,72,true));c.receive(command(73,72,true));assert.equal(c._commandNeedsMove,true);assert(!c._svgMotion);c.flush();assert(c._svgMotion);assert.equal(c._commandNeedsMove,false);assert.equal(c.reports.filter(r=>r.mode==='start').length,1);c.destroy();
 });
 await test('Quiet consumes a queued request without scheduling a geometric animation',()=>{
  const c=morph({deferStatic:true});c.receive(command(74,74,true,'users-round','users',true));c.receive(command(75,74,true,'users-round','users',true));c.statics.shift()();assert.equal(c._commandNeedsMove,false);assert(!c._svgMotion);assert.equal(fallback(c),'lucide-users-round');c.destroy();
 });
 await test('detached component cannot start a retained request after a late static load',()=>{
  const c=morph({deferStatic:true});c.receive(command(76,76,true));c.receive(command(77,76,true));c.destroy();while(c.statics.length)c.statics.shift()();assert(!c._svgMotion);assert.equal(c._timer,null);assert.equal(c._staticWaitTimer,null);
 });
 await test('tab template has one atomic command input, revision-gated frames, and no independent endpoint props',()=>{
  const w=fs.readFileSync(path.join(mp,'custom-tab-bar/index.wxml'),'utf8');assert.equal((w.match(/presentation="\{\{viewState.icons\[index\]\}\}"/g)||[]).length,2);assert(!/from-name=|entry-key=|entry-active=/.test(w));assert(w.includes('viewState.selected === index'));
  const child=fs.readFileSync(path.join(mp,'components/morph-icon/index.wxml'),'utf8');assert(child.includes('renderRevision === viewCommand.revision'));assert(child.includes('settledEntryKey === viewCommand.key'));assert(!child.split('<block wx:else>')[0].includes('<s-icon'));assert(child.includes('bindload="staticLoaded"'));
 });
 console.log(`${count}/${count} delayed Tab handoff checks passed. Native compositor/device acceptance NOT_EXECUTED.`);
})().catch(e=>{console.error(e);process.exitCode=1;});
