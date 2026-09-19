// Production Map projection/actions; fixture-only memories, no native UI/cloud/storage.
const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const catalog=require('../miniprogram/utils/locales');
const im={exports:{}};
vm.runInNewContext(fs.readFileSync('miniprogram/utils/i18n.js','utf8'),{module:im,require:p=>p==='./locales'?catalog:{},wx:{}});
const i18n=im.exports;
let spec;
const deps={i18n,uiFeedback:{},data:{formatDate:x=>x,photos:{meal:'fixture'}},restaurantCategory:{summary:()=>''},mapMarkers:{style:()=>({width:48,height:54})},mapLayout:{group:ms=>ms.map(memory=>({memory,members:[memory]}))}};
const context={Page:p=>spec=p,require:p=>deps[p.split('/').pop()]||{},wx:{}};
vm.createContext(context);vm.runInContext(fs.readFileSync('miniprogram/pages/map/index.js','utf8'),context);
const fixture={id:'fixture-map',restaurant:'用户餐厅',city:'fixture city',country:'fixture country',tags:[],coordinates:[30,120],date:'2026-09-16',photo:'fixture',saved:false,shared:false};
function page(){return {...spec,data:{...spec.data,pendingCount:8},active:false,allMemories:[{...fixture}],stopMarkerAnimation(){},stopDrawerReveal(){},buildDrawers:()=>[],setData(p){Object.assign(this.data,p);/* Renderer callback outside this projection test. */}};}
let passed=0;function test(name,fn){fn();passed++;console.log('PASS '+name);}
for(const locale of ['en','zh-CN']){
 i18n.setLanguage(locale);
 test(locale+': active-view cause takes precedence over unrelated pending count',()=>{
  for(const pending of [0,8])for(const [query,filter,kind] of [['zzz','all','search'],['zzz','favorites','search'],['','favorites','favorites'],['','shared','filter'],['  ','favorites','favorites'],['','all',pending?'pending':'empty']]){
   const p=page();p.allMemories=[];p.data.pendingCount=pending;p.applyFilters(query,filter,'','preserve');assert.equal(p.data.emptyState.kind,kind);assert.equal(p.data.pendingCount,pending);
   for(const key of ['title','text','action']){assert(p.data.emptyState[key]);if(locale==='zh-CN')assert.match(p.data.emptyState[key],/[\u4e00-\u9fff]/);}
  }
 });
 test(locale+': visible mapped records suppress empty state; user text is untouched',()=>{const p=page();p.applyFilters('','all','','preserve');assert.equal(p.data.emptyState,null);assert.equal(p.data.selected.restaurant,'用户餐厅');assert.equal(p.data.pendingCount,8);});
}
i18n.setLanguage('en');
test('search CTA clears only search, preserves Favorites, and never opens location correction',()=>{const p=page();p.data.query='zzz';p.data.filter='favorites';let fill=0;p.onFillLocation=()=>fill++;p.onEmptyMapAction();assert.equal(p.data.query,'');assert.equal(p.data.filter,'favorites');assert.equal(p.data.emptyState.kind,'favorites');assert.equal(fill,0);});
test('Favorites CTA returns to All and its real fixture card, not pending correction',()=>{const p=page();p.data.filter='favorites';let fill=0;p.onFillLocation=()=>fill++;p.onEmptyMapAction();assert.equal(p.data.filter,'all');assert.equal(p.data.selected.id,fixture.id);assert.equal(p.data.emptyState,null);assert.equal(fill,0);assert.equal(p.data.pendingCount,8);});
test('other-filter CTA uses the existing All route',()=>{const p=page();p.data.filter='shared';p.onEmptyMapAction();assert.equal(p.data.filter,'all');assert.equal(p.data.selected.id,fixture.id);});
test('actual unfiltered pending keeps the existing location entry',()=>{const p=page();p.allMemories=[];let fill=0;p.onFillLocation=()=>fill++;p.onEmptyMapAction();assert.equal(fill,1);assert.equal(p.data.pendingCount,8);});
test('clear icon matches editing search to empty rather than secretly clearing filter',()=>{const p=page();p.data.filter='shared';p.data.query='zzz';p.onClearSearch();assert.equal(p.data.query,'');assert.equal(p.data.filter,'shared');assert.equal(p.data.emptyState.kind,'filter');});
test('empty view without pending keeps existing recovery without location picker',()=>{const p=page();p.allMemories=[];p.data.pendingCount=0;let fill=0;p.onFillLocation=()=>fill++;p.onEmptyMapAction();assert.equal(fill,0);assert.equal(p.data.emptyState.kind,'empty');});
test('WXML uses projected cause and retains separate pending entry',()=>{const s=fs.readFileSync('miniprogram/pages/map/index.wxml','utf8');for(const field of ['title','text','action'])assert(s.includes('{{emptyState.'+field+'}}'));assert.match(s,/wx:if="{{pendingCount}}" class="pending-location-controls"/);assert.match(s,/class="pending-action" bindtap="onFillLocation"/);});
console.log(passed+' Map empty-state checks passed; fixture only.');
