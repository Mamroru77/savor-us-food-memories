const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict'),crypto=require('crypto');
const i18n=require('../miniprogram/utils/i18n'),label='Show all mapped memories',key='s'+crypto.createHash('sha1').update(label).digest('hex').slice(0,10);
const w=fs.readFileSync('miniprogram/pages/map/index.wxml','utf8'),control=w.match(/<view class="recenter-map[\s\S]*?<\/view>/)[0];assert(control.includes('name="map-pinned"'));assert(control.includes('{{copy.'+key+'}}'));assert(control.includes('bindtap="recenter"'));
for(const locale of ['en','zh-CN']){i18n.setLanguage(locale);assert.equal(i18n.t(label),locale==='en'?label:'全览已定位的回忆');}
let spec;const deps={i18n};vm.runInNewContext(fs.readFileSync('miniprogram/pages/map/index.js','utf8'),{Page:p=>spec=p,require:p=>deps[p.split('/').pop()]||{},wx:{getLocation:()=>assert.fail('overview must not request GPS')}});
const calls=[],p={...spec,data:{selectedId:'synthetic-chosen',query:'query',filter:'favorites'},visibleIds:['synthetic-chosen'],stopDrawerReveal(){},setData:x=>Object.assign(p.data,x),applyFilters:(...args)=>calls.push(args)};p.recenter();assert.deepEqual(calls,[['','all','synthetic-chosen','overview']]);assert.equal(p.data.selectedId,'synthetic-chosen');assert.equal(p.data.clusterOpen,false);
console.log('PASS overview icon/label match existing All behavior, preserve selection, and never request user location');

// Native replay exposed a child-selection hole: visibleIds indexes marker roots,
// not every visible member. Do not change that index mapping to fix selection.
for(const selectedId of ['synthetic-child','synthetic-hidden']){
 const calls=[],members=[{id:'synthetic-root'},{id:'synthetic-child'}],before=JSON.stringify(members);
 const p={...spec,data:{selectedId,query:'',filter:'all',clusterOpen:true},visibleIds:['synthetic-root'],markerGroups:[{memory:members[0],members}],stopDrawerReveal(){},setData:x=>Object.assign(p.data,x),applyFilters:(...a)=>calls.push(a)};
 p.recenter();const expected=selectedId==='synthetic-child'?selectedId:'comptoir';
 assert.equal(calls[0][2],expected,'overview must preserve visible non-root child, but not a missing selection');
 assert.equal(p.data.selectedId,expected);assert.equal(JSON.stringify(members),before);assert.deepEqual(p.visibleIds,['synthetic-root']);
}
console.log('PASS non-root child survives overview without changing marker indexes; missing selection keeps existing fallback');
