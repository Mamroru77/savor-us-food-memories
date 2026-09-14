// Temporary visible markers: validation of bindings and isolation, NOT native pixels.
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const root=path.join(__dirname,'../miniprogram'),read=p=>fs.readFileSync(path.join(root,p),'utf8');let count=0;
function test(name,fn){fn();count++;console.log('PASS '+name);}
const w=read('components/morph-icon/index.wxml'),css=read('components/morph-icon/index.wxss');
test('frame badge follows the same active revision frame visibility gates',()=>{
 const expr=w.match(/<text wx:if="\{\{([^\n]+?)\}\}" class="visual-probe-frame"/)[1];
 const data={viewCommand:{active:true,revision:8},renderRevision:8,painting:true,frameSrc:'mock',frameVisible:true};
 assert(vm.runInNewContext(expr,data));
 for(const patch of [{viewCommand:{active:false,revision:8}},{renderRevision:7},{painting:false},{frameSrc:''},{frameVisible:false}])assert(!vm.runInNewContext(expr,{...data,...patch}));
});
test('static badge distinguishes origin target and error without modifying image bindings',()=>{
 assert(w.includes("? 'T' : 'O'"));assert(w.includes("{{fallbackOnly ? 'ERR' : ''}}"));
 assert(w.includes('bindload="staticLoaded"'));assert(w.includes('bindload="svgLoaded"'));assert(w.includes('data-generation="{{item.id}}"'));
});
test('glyph clipping stays in original box and marker has no touch or layout footprint',()=>{
 assert(css.includes('.morph-box { position:relative;overflow:hidden; }'));
 assert(css.includes('.visual-probe-wrap { position:relative;overflow:visible; }'));
 assert(css.includes('pointer-events:none'));assert(css.includes('position:absolute'));
 const beforeGlyph=w.slice(0,w.indexOf('<view class="morph-box"'));assert(beforeGlyph.includes('visual-probe-icon'));assert(!beforeGlyph.includes('bindtap'));
});
test('parent badge identifies actual publishing instance not guessed owner',()=>{
 assert(read('custom-tab-bar/index.js').includes('probeBar:this._instanceId'));
 const bar=read('custom-tab-bar/index.wxml');assert(bar.includes('B{{viewState.probeBar}} K{{entryKey}} R{{viewState.revision}}'));
 assert(read('custom-tab-bar/index.wxss').includes('pointer-events:none'));
});
test('I1 moves the unchanged TabBar subtree into one root portal',()=>{
 const bar=read('custom-tab-bar/index.wxml');
 assert.equal((bar.match(/<root-portal enable="\{\{true\}\}">/g)||[]).length,1);
 assert.equal((bar.match(/<\/root-portal>/g)||[]).length,1);
 assert(bar.indexOf('<root-portal')<bar.indexOf('class="tab-bar'));
 assert(bar.includes('VP1 I1 B{{viewState.probeBar}}'));
});
for(const name of ['add','me'])test(name+' page marker counts instance and show visits without sharing business data',()=>{
 const src=read('pages/'+name+'/index.js');const a=src.indexOf('this._visualProbeId=this._visualProbeId||++visualProbeSerial;');
 const b=src.indexOf('\n',src.indexOf('this.setData({visualProbe:',a));const code=src.slice(a,b);
 const context={visualProbeSerial:0,Date};vm.createContext(context);
 const run=vm.runInContext('(function(){'+code+'})',context);
 const p={setData(x){this.data=x;}};run.call(p);const first=p.data.visualProbe;run.call(p);
 assert.equal(first.page,name);assert.equal(first.id,1);assert.equal(p.data.visualProbe.visit,2);assert.equal(p.data.visualProbe.id,1);
 const p2={setData(x){this.data=x;}};run.call(p2);assert.equal(p2.data.visualProbe.id,2);
 assert(read('pages/'+name+'/index.wxml').includes('pointer-events:none'));
});
test('icon id survives presentation arriving before attached',()=>{
 const file=path.join(root,'components/morph-icon/index.js');let spec;
 vm.runInNewContext(fs.readFileSync(file,'utf8'),{Component:s=>spec=s,require:require('module').createRequire(file),Date,setTimeout,clearTimeout});
 const c={...spec.methods,data:{...Object.fromEntries(Object.entries(spec.properties).map(([k,v])=>[k,v.value])),...spec.data},setData(p,cb){Object.assign(this.data,p);if(cb)cb();},triggerEvent(){}};
 const cmd={revision:1,key:0,active:false,name:'user',fromName:'user',color:'#111',duration:480};
 c.acceptPresentation(cmd);const id=c.data.viewCommand.probeIcon;assert(id>0);spec.lifetimes.attached.call(c);assert.equal(c._diagnosticId,id);spec.lifetimes.detached.call(c);
});
console.log(`${count}/${count} visible probe checks passed. Native marker legibility/placement NOT_EXECUTED.`);
