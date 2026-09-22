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

global.wx={env:{USER_DATA_PATH:'/user'}};
const data=require('../miniprogram/utils/data'),profiles=require('../miniprogram/utils/profileRepository'),memories=require('../miniprogram/utils/memoryRepository');
test('profile migration creates one canonical asset and preserves future fields',()=>{
  const result=profiles.migrate({name:'A',avatar:'/user/avatar-a.jpg',futureProfile:{keep:true}},data.defaultProfile);
  assert.equal(result.changed,true);
  assert.equal(result.profile.avatar,'/user/avatar-a.jpg');
  assert.deepEqual(result.profile.avatarAsset,{
    formatVersion:1,localPath:'/user/avatar-a.jpg',digest:null,mime:null,width:null,height:null,
    source:'legacy',syncState:'local',remoteRef:null,
  });
  assert.deepEqual(result.profile.futureProfile,{keep:true});
  assert.equal(profiles.migrate(result.profile,data.defaultProfile).changed,false);
});
test('Stage 6 string wins over malformed or stale asset metadata',()=>{
  const stale={formatVersion:1,localPath:'/user/avatar-a.jpg',source:'cloud',syncState:'synced'};
  const result=profiles.migrate({avatar:'/user/avatar-b.jpg',avatarAsset:stale},data.defaultProfile).profile;
  assert.equal(result.avatar,'/user/avatar-b.jpg');
  assert.equal(result.avatarAsset.localPath,'/user/avatar-b.jpg');
  assert.equal(result.avatarAsset.source,'legacy');
  assert.equal(profiles.migrate({avatar:'/user/avatar-b.jpg',avatarAsset:{bad:true}},data.defaultProfile).profile.avatarAsset.localPath,'/user/avatar-b.jpg');
});
test('empty avatar stays empty and does not invent an asset',()=>{
  const result=profiles.migrate({name:'A',avatar:'',avatarAsset:{bad:true}},data.defaultProfile).profile;
  assert.equal(result.avatar,'');
  assert.equal(result.avatarAsset,null);
});
const sample=()=>({id:'sample',restaurant:'Sample',city:'',country:'',neighborhood:'',notes:'',date:'2026-09-22',rating:0,tags:[],photo:data.photos.meal,extraPhotos:[],coordinates:[0,0],shared:false,liked:false,saved:false});
test('memory restore repairs once, drops invalid rows, and keeps first duplicate',()=>{const result=memories.restore([{...sample(),id:'same',restaurant:'First'},{...sample(),id:'same',restaurant:'Second'},{...sample(),id:'repair',restaurant:' Repair ',rating:99,locationSource:'tencent-search',geoConfirmed:false,city:'private',country:'private'},null]);assert.equal(result.filter(x=>x.id==='same').length,1);assert.equal(result.find(x=>x.id==='same').restaurant,'First');assert.equal(result.find(x=>x.id==='repair').restaurant,'Repair');assert.equal(result.find(x=>x.id==='repair').rating,0);assert.equal(result.find(x=>x.id==='repair').city,'');});
test('private import strips remote authority and media',()=>{const copy=memories.privateCopy({...sample(),id:'foreign',cloudId:'cloud',coupleId:'space',shared:true,ratings:{A:5},ratingSource:'legacy-average'},'local');assert.equal(copy.id,'local');assert.equal(copy.importSourceId,'foreign');assert(!copy.cloudId&&!copy.coupleId&&!copy.ratings&&!copy.shared);assert.equal(copy.noPhoto,true);assert.equal(copy.rating,0);});
test('import merge deduplicates source ownership without mutating current rows',()=>{const current=[{...sample(),id:'kept',importSourceId:'foreign'}],result=memories.mergeImports(current,[memories.privateCopy({...sample(),id:'foreign'},'skip'),memories.privateCopy({...sample(),id:'new-source'},'new-local')]);assert.equal(result.count,1);assert.equal(result.memories[0].id,'new-local');assert.equal(current.length,1);});

const sync=require('../miniprogram/utils/syncRepository');
test('sync overlay projects only editable fields, flags, and deletes',()=>{const base={id:'r',restaurant:'Old',liked:false,revision:2,createdBy:'owner'},value=sync.overlay(base,[{recordId:'r',kind:'flags',patch:{liked:true,createdBy:'forged'}},{recordId:'r',kind:'update',memory:{restaurant:'New',createdBy:'forged'}}]);assert.equal(value.restaurant,'New');assert.equal(value.liked,true);assert.equal(value.createdBy,'owner');assert.equal(sync.overlay(base,[{recordId:'r',kind:'delete'}]).pendingDelete,true);});
test('cloud merge excludes hidden and stale rows while retaining overlays',()=>{const local=[{id:'newer',cloudId:'newer',date:'2026-01-02',revision:3,restaurant:'Local',liked:true},{id:'overlay',cloudId:'overlay',date:'2026-01-03',revision:1,restaurant:'Server',liked:false},{id:'local',date:'2026-01-01',restaurant:'Local only'}],remote=[{id:'newer',cloudId:'newer',date:'2026-01-04',revision:2,restaurant:'Stale'},{id:'overlay',cloudId:'overlay',date:'2026-01-03',revision:1,restaurant:'Server',liked:false},{id:'hidden',cloudId:'hidden',date:'2026-01-05',revision:1,restaurant:'Hidden'}];remote.deletedIds=[];const result=sync.mergeCloud(local,remote,['hidden'],[{recordId:'overlay',kind:'flags',patch:{liked:true}}]);assert.equal(result.find(x=>x.id==='newer').restaurant,'Local');assert.equal(result.find(x=>x.id==='overlay').liked,true);assert(!result.some(x=>x.id==='hidden'));assert.equal(result.at(-1).id,'local');});

console.log(count+' Store repository checks passed.');
