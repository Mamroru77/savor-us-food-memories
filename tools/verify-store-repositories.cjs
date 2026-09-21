const assert=require('node:assert/strict');
let count=0;
function test(name,fn){fn();count++;console.log('PASS '+name);}

const settings=require('../miniprogram/utils/settingsRepository');
test('settings normalize invalid persisted display values',()=>{
  const value=settings.normalize({theme:'unknown',language:'xx',reminders:false});
  assert.equal(value.theme,'pearl');
  assert.equal(value.language,'system');
  assert.equal(value.reminders,false);
});
test('settings merge preserves data and classifies lease-required keys',()=>{
  assert.deepEqual(settings.merge({language:'en',custom:true},{language:'xx'}),{language:'system',custom:true});
  assert.equal(settings.requiresLease({theme:'dusk',language:'en',reduceMotion:true}),false);
  assert.equal(settings.requiresLease({dietary:'Vegan'}),true);
});

const data=require('../miniprogram/utils/data'),memories=require('../miniprogram/utils/memoryRepository');
const sample=()=>({id:'sample',restaurant:'Sample',city:'',country:'',neighborhood:'',notes:'',date:'2026-09-22',rating:0,tags:[],photo:data.photos.meal,extraPhotos:[],coordinates:[0,0],shared:false,liked:false,saved:false});
test('memory restore repairs once, drops invalid rows, and keeps first duplicate',()=>{const result=memories.restore([{...sample(),id:'same',restaurant:'First'},{...sample(),id:'same',restaurant:'Second'},{...sample(),id:'repair',restaurant:' Repair ',rating:99,locationSource:'tencent-search',geoConfirmed:false,city:'private',country:'private'},null]);assert.equal(result.filter(x=>x.id==='same').length,1);assert.equal(result.find(x=>x.id==='same').restaurant,'First');assert.equal(result.find(x=>x.id==='repair').restaurant,'Repair');assert.equal(result.find(x=>x.id==='repair').rating,0);assert.equal(result.find(x=>x.id==='repair').city,'');});
test('private import strips remote authority and media',()=>{const copy=memories.privateCopy({...sample(),id:'foreign',cloudId:'cloud',coupleId:'space',shared:true,ratings:{A:5},ratingSource:'legacy-average'},'local');assert.equal(copy.id,'local');assert.equal(copy.importSourceId,'foreign');assert(!copy.cloudId&&!copy.coupleId&&!copy.ratings&&!copy.shared);assert.equal(copy.noPhoto,true);assert.equal(copy.rating,0);});
test('import merge deduplicates source ownership without mutating current rows',()=>{const current=[{...sample(),id:'kept',importSourceId:'foreign'}],result=memories.mergeImports(current,[memories.privateCopy({...sample(),id:'foreign'},'skip'),memories.privateCopy({...sample(),id:'new-source'},'new-local')]);assert.equal(result.count,1);assert.equal(result.memories[0].id,'new-local');assert.equal(current.length,1);});

console.log(count+' Store repository checks passed.');
