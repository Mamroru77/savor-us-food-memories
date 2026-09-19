const fs=require('fs'),assert=require('node:assert/strict');
const source=fs.readFileSync('miniprogram/pages/map/index.js','utf8');
const method=source.match(/\n  syncOverlayClearance\(\) \{([\s\S]*?)\n  \},/);
assert(method,'Map must measure actual search bottom instead of mixing fixed px with responsive rpx');
const sync=new Function(method[1]);
function page(){const callbacks=[],patches=[];return {active:true,data:{overlayTop:208,identityReady:true},callbacks,patches,alignments:0,createSelectorQuery(){return {select(s){assert.equal(s,'.map-search');return this},boundingClientRect(fn){callbacks.push(fn);return this},exec(){}}},setData(p,done){assert.deepEqual(Object.keys(p),['overlayTop']);patches.push(p);Object.assign(this.data,p);if(done)done()},syncStackPositions(){this.alignments++}};}
for(const bottom of [166,204,210,226]){const p=page();sync.call(p);p.callbacks[0]({bottom});assert.equal(p.data.overlayTop,bottom+8);assert.equal(p.alignments,1);sync.call(p);p.callbacks[1]({bottom});assert.equal(p.patches.length,1,'stable layout causes no repeated setData');}
for(const flag of ['disposed','stackGesture']){const p=page();p[flag]=true;sync.call(p);assert.equal(p.callbacks.length,0);}
{const p=page();p.active=false;sync.call(p);assert.equal(p.callbacks.length,0);}
{const p=page();sync.call(p);sync.call(p);p.callbacks[0]({bottom:999});assert.equal(p.patches.length,0);p.callbacks[1]({bottom:210});assert.equal(p.data.overlayTop,218);}
for(const flag of ['disposed','stackGesture']){const p=page();sync.call(p);p[flag]=true;p.callbacks[0]({bottom:999});assert.equal(p.patches.length,0);}
console.log('PASS Map control clearance: responsive measured bounds, stale/gesture/lifecycle guards, stable layout no-op, only hit-region alignment; no camera/markers writes');
