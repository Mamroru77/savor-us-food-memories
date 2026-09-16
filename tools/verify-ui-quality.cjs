#!/usr/bin/env node
// Source/logic regression checks only. NOT a native rendering or accessibility certification.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const mp=path.resolve(__dirname,'../miniprogram'),read=p=>fs.readFileSync(path.join(mp,p),'utf8');
let count=0;
function test(name,fn){fn();count++;console.log('PASS '+name);}
const ui=require(path.join(mp,'utils/uiFeedback'));
const draft=()=>({restaurant:'',date:'2026-09-12',perCapita:'',photos:[],tags:[],notes:'',rating:0});
let scrolls=[];
const stubs={
 identity:require('./identity-fixture.cjs').fixture({getStorageSync(){},setStorageSync(){}}),
 i18n:{copy:()=>({}),locale:()=> 'en',options:()=>[],t:x=>x,syncPage(){}},
 uiFeedback:ui,
 data:{photos:{meal:'/images/le-comptoir.jpg'},defaultProfile:{},formatDate:x=>x,isValidDate:x=>/^\d{4}-\d{2}-\d{2}$/.test(x)},
 store:{freshDraft:draft,get:()=>({settings:{},memories:[]}),saveDraft(){},notify(){}},
 locations:{display:x=>x.city||'',confirmed:x=>!!x},
 importPolicy:{cloudPlaceSearchEnabled:false},
};
function load(file,extra={}){
 let spec;
 vm.runInNewContext(read(file),{Page:s=>spec=s,Component:s=>spec=s,require:n=>({...stubs,...extra})[n.split('/').pop()]||{},wx:{pageScrollTo:o=>scrolls.push(o)},console,setTimeout,clearTimeout},{filename:file});
 return {spec,...(spec.methods||spec),data:JSON.parse(JSON.stringify(spec.data)),setData(p,cb){Object.assign(this.data,p);if(cb)cb();}};
}
const sheetCss=read('components/sheet/index.wxss'),sheetWxml=read('components/sheet/index.wxml'),addWxml=read('pages/add/index.wxml'),appCss=read('app.wxss');
for(const n of [0,1,5,20,100])test('Library retains all '+n+' synthetic records',()=>{
 const sheet=load('components/sheet/index.js'),patch={};sheet.data.filter='all';
 sheet.refreshLibrary(patch,{memories:Array.from({length:n},(_,i)=>({id:String(i),restaurant:'Place '+i,date:'2026-09-12',tags:[],city:'City'}))});
 assert.equal(patch.libraryRows.length,n);if(n)assert.equal(patch.libraryRows[n-1].id,String(n-1));
});
test('Library filters and no-result search remain functional',()=>{
 const sheet=load('components/sheet/index.js'),patch={},state={memories:[{id:'a',restaurant:'Alpha',tags:[],city:'',saved:true},{id:'b',restaurant:'Beta',tags:[],city:'',shared:true}]};
 sheet.data.filter='favorites';sheet.refreshLibrary(patch,state);assert.deepEqual(Array.from(patch.libraryRows,x=>x.id),['a']);
 sheet.data.filter='shared';sheet.refreshLibrary(patch,state);assert.deepEqual(Array.from(patch.libraryRows,x=>x.id),['b']);
 sheet.data.libraryQuery='missing';sheet.refreshLibrary(patch,state);assert.equal(patch.libraryRows.length,0);
});
test('Library has no inner overflow clipping or height cap',()=>{
 const rules=[...sheetCss.matchAll(/\.library-list\s*\{([^}]+)\}/g)];assert(rules.length);
 for(const [,rule] of rules)assert(!/max-height|overflow\s*:\s*hidden/.test(rule));
 assert(sheetWxml.includes('scroll-y'));assert(!sheetWxml.includes('libraryRows.slice'));
});
test('Detail photos scroll horizontally with nonshrinking 90rpx squares',()=>{
 assert(tags(sheetWxml).some(t=>t.startsWith('<scroll-view') && t.includes('class="photo-thumbnail-scroll"') && t.includes('scroll-x')));
 assert.match(sheetCss,/\.photo-thumb\s*\{\s*flex:\s*0 0 90rpx/);
 assert(sheetWxml.includes('scroll-into-view="photo-thumb-{{photoIndex}}"'));
 const sheet=load('components/sheet/index.js');sheet.onPhotoSelect({currentTarget:{dataset:{index:8}}});assert.equal(sheet.data.photoIndex,8);
});
// A quote-aware tokenizer: comparisons in WXML attributes must not truncate tags.
function tags(text){return [...text.replace(/<!--[\s\S]*?-->/g,'').matchAll(/<\/?[\w-]+\b(?:[^>"']|"[^"]*"|'[^']*')*>/g)].map(m=>m[0]);}
for(const file of ['pages/home/index.wxml','pages/map/index.wxml','pages/add/index.wxml','pages/us/index.wxml','pages/me/index.wxml','components/sheet/index.wxml','components/toast/index.wxml'])test(file+' has balanced tags and no duplicate attributes',()=>{
 const stack=[];
 for(const tag of tags(read(file))){
  const name=tag.match(/^<\/?([\w-]+)/)[1];
  if(tag.startsWith('</')){assert.equal(stack.pop(),name,tag);continue;}
  const attrs=[...tag.matchAll(/([\w:-]+)\s*=\s*"[^"]*"/g)].map(m=>m[1]);assert.equal(new Set(attrs).size,attrs.length,tag);
  if(!tag.endsWith('/>'))stack.push(name);
 }
 assert.equal(stack.length,0,stack.join(','));
});
test('All 27 native form controls are explicitly named; text inputs have focus and placeholder contracts',()=>{
 let total=0;
 for(const file of ['pages/add/index.wxml','pages/map/index.wxml','components/sheet/index.wxml'])for(const tag of tags(read(file))){
  if(!/^<(input|textarea|picker|switch)\b/.test(tag))continue;
  total++;assert.match(tag,/aria-label="[^\"]+"/);
  if(/^<(input|textarea)\b/.test(tag)){assert(tag.includes('bindfocus="onFieldFocus"'));assert(tag.includes('bindblur="onFieldBlur"'));assert(tag.includes('placeholder-class='));}
 }
 assert.equal(total,27);
});
test('Stale blur cannot erase a newer field focus',()=>{
 const ctx={data:{focusedField:''},setData(p){Object.assign(this.data,p);}},event=k=>({currentTarget:{dataset:{focusKey:k}}});
 ui.onFieldFocus.call(ctx,event('restaurant'));ui.onFieldFocus.call(ctx,event('notes'));ui.onFieldBlur.call(ctx,event('restaurant'));assert.equal(ctx.data.focusedField,'notes');ui.onFieldBlur.call(ctx,event('notes'));assert.equal(ctx.data.focusedField,'');
});
for(const [field,overrides] of [['restaurant',{}],['date',{restaurant:'A',date:''}],['perCapita',{restaurant:'A',perCapita:'-1'}],['location',{restaurant:'A'}],['geography',{restaurant:'A',location:{city:'City',country:''}}]])test('Add '+field+' validation reports field and scrolls without saving',()=>{
 const add=load('pages/add/index.js');add.data.draft=Object.assign(draft(),overrides);scrolls=[];add.onSave();assert.equal(add.data.errorField,field);assert(add.data.fieldErrors[field]);assert.equal(add.data.saving,false);assert(!add.saveLock);assert.equal(scrolls[0].selector,'#field-'+field);assert(addWxml.includes('id="field-'+field+'"'));
});
test('Quiet field errors do not animate page scrolling',()=>{
 const add=load('pages/add/index.js');add.data.quiet=true;scrolls=[];add.onSave();assert.equal(scrolls[0].duration,0);
});
test('Save busy/lock guard preserves draft and rejects repeated taps',()=>{
 const add=load('pages/add/index.js');add.saveLock=true;const before=JSON.stringify(add.data);scrolls=[];add.onSave();assert.equal(JSON.stringify(add.data),before);assert.equal(scrolls.length,0);add.saveLock=false;add.data.uploading=true;add.onSave();assert.equal(scrolls.length,0);
});
test('Add import error remains distinct from save/field error',()=>{
 const add=load('pages/add/index.js');add.importError({code:'TEXT_REQUIRED'});assert.equal(add.data.errorContext,'import');assert.match(add.data.error,/Paste/);add.onSave();assert.equal(add.data.errorContext,'save');assert.equal(add.data.errorField,'restaurant');assert(addWxml.includes("errorContext === 'import'"));assert(addWxml.includes('&& !errorField'));
});
test('Profile empty-name failure is visible and scroll-targeted',()=>{
 const sheet=load('components/sheet/index.js');sheet.data.profileName=' ';sheet.onProfileSave();assert(sheet.data.profileError);assert.equal(sheet.data.sheetScrollTarget,'profile-name-field');sheet.onProfileName({detail:{value:'Name'}});assert.equal(sheet.data.profileError,'');
});
test('Save uses loader for both busy branches, idle NotebookPen, and disabled semantics',()=>{
 assert(addWxml.includes('wx:if="{{uploading || saving}}" name="loader-circle"'));assert(addWxml.includes('wx:else name="notebook-pen"'));assert(!addWxml.includes('wx:elif="{{saving}}"'));assert(addWxml.includes('aria-disabled="{{businessFrozen || uploading || saving}}"'));assert(appCss.includes('.quiet .spin'));
 for(const tag of tags(addWxml))if(/^<(input|textarea|picker|switch)\b/.test(tag))assert(tag.includes('disabled="{{saving || uploading}}"'));
});
test('Message-only Toast has no misleading success icon and store contract stays message-only',()=>{
 assert(!read('components/toast/index.wxml').includes('name="check"'));assert(read('components/toast/index.wxml').includes('toast.message'));assert(read('utils/store.js').includes('4200'));
});
test('Only page spacer reserves full Tab clearance on Home/Us/Me',()=>{
 for(const p of ['home','us','me'])assert(!/padding-bottom:\s*calc\(var\(--tab-clearance\)/.test(read('pages/'+p+'/index.wxss')));
 assert.match(appCss,/\.tab-spacer\s*\{[^}]*height: calc\(var\(--tab-clearance\) \+ 24rpx\)/);
});
test('Us copy excludes complete like hit column plus 12rpx gap',()=>{
 const css=read('pages/us/index.wxss');assert(css.includes('.shared-photo-copy { right:100rpx; }'));assert(css.includes('.shared-like { width:88rpx; height:88rpx; right:0; bottom:0; }'));assert(100>=88+12);
});
test('Danger button retains semantic color and uses border-box / common outer minimum',()=>{
 assert.match(sheetCss,/\.danger-button\s*\{\s*box-sizing:\s*border-box/);assert(sheetCss.includes('min-height:var(--control-height,88rpx)'));assert(sheetCss.includes('color: #954c38'));
});
test('Light helper/placeholder share the readable secondary color',()=>{
 assert.match(appCss,/\.helper-note\s*\{[^}]*color:\s*var\(--muted, #565752\)/);assert(appCss.includes('.form-placeholder { color: var(--muted, #565752); }'));
 const lum=h=>h.match(/\w\w/g).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4).reduce((s,x,i)=>s+x*[.2126,.7152,.0722][i],0);
 assert((lum('eeece9')+.05)/(lum('565752')+.05)>4.5);
});
test('Image fallback is view-only, immutable, and terminal on repeated errors',()=>{
 const original={restaurant:'Original',photo:'https://example.test/private.jpg'},ctx={data:{imageErrors:{},draft:original},updates:0,setData(p){this.updates++;Object.assign(this.data,p);}},e={currentTarget:{dataset:{source:original.photo}}},old=ctx.data.imageErrors;
 ui.onImageError.call(ctx,e);assert.equal(ctx.data.imageErrors[original.photo],true);assert.equal(old[original.photo],undefined);assert.equal(ctx.data.draft,original);assert.equal(original.photo,'https://example.test/private.jpg');ui.onImageError.call(ctx,e);assert.equal(ctx.updates,1);
 ui.onImageError.call(ctx,{currentTarget:{dataset:{source:'/images/le-comptoir.jpg'}}});assert.equal(ctx.updates,2);ui.onImageError.call(ctx,{currentTarget:{dataset:{source:'/images/le-comptoir.jpg'}}});assert.equal(ctx.updates,2);
});
test('All dynamic content photos either handle load errors or are the generated chart',()=>{
 for(const page of ['home','add','us','me'])for(const tag of tags(read('pages/'+page+'/index.wxml')))if(/^<image\b/.test(tag)&&tag.includes('src="{{')&&!tag.includes('memory-chart'))assert(tag.includes('binderror='),tag);
 for(const tag of tags(sheetWxml))if(/^<image\b/.test(tag)&&tag.includes('src="{{'))assert(tag.includes('binderror='),tag);
});
test('Metrics preserve cached default and refresh explicitly on window change',()=>{
 let width=375,bottom=64,module={exports:{}};
 vm.runInNewContext(read('utils/metrics.js'),{module,wx:{getWindowInfo:()=>({windowWidth:width,statusBarHeight:20}),getMenuButtonBoundingClientRect:()=>({top:24,bottom})}});
 const m=module.exports.getMetrics();assert.equal(m.screenWidth,375);width=768;bottom=74;assert.equal(module.exports.getMetrics().screenWidth,375);const next=module.exports.getMetrics(true);assert.equal(next.screenWidth,768);assert.equal(next.headerTop,80);
});
test('All metrics callers refresh on show/resize and Sheet detaches resize listener',()=>{
 for(const p of ['home','map','add','us','me']){const s=read('pages/'+p+'/index.js');assert(s.includes('onResize()'));assert(s.includes('getMetrics(true)'));}
 const s=read('components/sheet/index.js');assert(s.includes('sheetTop: metrics.getMetrics(true).headerTop + 8'));assert(s.includes('wx.offWindowResize'));
});
test('Map paging hit slop remains horizontally nonoverlapping after approved button restyling',()=>{
 const css=read('pages/map/index.wxss');assert(css.includes('.map-stack-overlay .pin-stack-page-arrow { width:44px; flex-shrink:0; margin-left:-10px; margin-right:-10px; }'));
 const left=[-10,34],right=[54,98];assert(left[1]<right[0]);assert(read('pages/map/index.wxml').includes('drawer.buttonBox.size')); // Actual native geometry is now explicit, sized to the bottom-card control.
});
test('Approved production Tab timing/endpoints remain intact',()=>{
 const js=read('custom-tab-bar/index.js');assert(js.includes('480'));assert(js.includes('utensils-crossed'));assert(js.includes('utensils'));assert(read('components/morph-icon/index.js').includes('svgLoaded'));
});
test('Add thumbnail preview and delete have separate non-overlapping vertical targets',()=>{
 const css=read('pages/add/index.wxss');assert(css.includes('.photo-strip { height:220rpx; }'));assert(css.includes('.photo-strip-item { height:196rpx; }'));assert(css.includes('.photo-strip-remove { top:108rpx; right:10rpx;'));assert.equal(108+88,196);assert(12+196+12<=220);
});
test('Native horizontal detail scroller has explicit width and height without max-content dependency',()=>{
 assert(sheetWxml.includes('detail.images.length * 90 + (detail.images.length - 1) * 15'));assert(sheetCss.includes('height:90rpx; margin-top:20rpx; white-space:nowrap'));assert.equal(9*90+8*15,930);
});
test('Existing theme/cuisine checks are retained rather than duplicated',()=>{
 assert.equal((sheetWxml.match(/class="theme-option-check"/g)||[]).length,1);assert(sheetWxml.includes('aria-pressed="{{theme === item}}"'));assert(sheetWxml.includes('aria-pressed="{{cuisines.indexOf(item.value) >= 0}}"'));
});
test('Memory Row retains its divider strategy while image and text sizing is refined',()=>{
 const css=read('components/memory-row/index.wxss');
 assert(css.includes('border-bottom: 1rpx solid rgba(52, 53, 52, 0.07)'));
 assert(css.includes('.memory-row:last-child { border-bottom: 0; }'));
 assert(css.includes('min-height: 168rpx'));assert(css.includes('height: 128rpx'));
 assert(css.includes('var(--radius-image,28rpx)'));
});
test('Tab press feedback cannot scale, lift, pop or resize the SVG icon before morphing',()=>{
 const css=read('custom-tab-bar/index.wxss');assert(!/scale\(|translateY\(|@keyframes\s+tab-pop/.test(css));
 assert(css.includes('.tab-press { opacity: 0.7; }'));assert(css.includes('.add-press { opacity: 0.85; }'));
 const press=css.match(/\.add-press\s*\{([^}]+)\}/)[1];assert(!/transform|box-shadow|width|height|margin|padding/.test(press));
 assert(css.includes('.tab-item.is-active .tab-icon-wrap { transform:none;animation:none; }'));
});
test('Tab press still responds and Quiet suppresses transitions without changing touch geometry',()=>{
 const css=read('custom-tab-bar/index.wxss'),w=read('custom-tab-bar/index.wxml');assert(w.includes('hover-class="tab-press"'));assert(w.includes('hover-class="add-press"'));
 assert(css.includes('width: 130rpx;'));assert(css.includes('height: 130rpx;'));assert(css.includes('margin-top: -14rpx;'));
 assert(css.includes('.theme-quiet .tab-label { transition: none !important; animation: none !important; }'));
});
console.log('\n'+count+'/'+count+' UI quality regression checks passed. Native/device/keyboard/screen-reader acceptance NOT_EXECUTED.');
