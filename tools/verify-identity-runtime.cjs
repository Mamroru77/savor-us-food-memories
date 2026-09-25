require('./fixtures/normal-identity-mode.cjs');
// REAL identity + store + service modules with mock CloudBase transport.
// Unlike verify-cloud's known-session fixture, this suite exercises partitions.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname,'..'),mp=path.join(root,'miniprogram/utils');
let owner='A',offline=false,failStorage=false,holdList=null,lostAdd=false,holdUpload=null,oldServer=false,holdBootstrap=null;
const accounts=new Map(),rows=new Map(),disk={},calls=[];
const sdk={DYNAMIC_CURRENT_ENV:'test',init(){},getWXContext:()=>({OPENID:owner,APPID:'app'}),database:()=>({
 command:{gt:v=>({gt:v}),exists:v=>({exists:v}),remove:()=>({remove:true})},serverDate:()=>new Date().toISOString(),async createCollection(){},
 collection(name){const map=name==='savor_accounts'?accounts:rows;let where={},limit=100,order='_id',dir='asc';const matches=r=>Object.keys(where).every(k=>where[k]&&where[k].gt!==undefined?r[k]>where[k].gt:where[k]&&where[k].exists!==undefined?(r[k]!==undefined)===where[k].exists:r[k]===where[k]);const q={where(v){where=v;return q;},limit(v){limit=v;return q;},orderBy(k,d){order=k;dir=d;return q;},async get(){return {data:[...map.values()].filter(matches).sort((a,b)=>String(a[order]).localeCompare(String(b[order]))*(dir==='desc'?-1:1)).slice(0,limit).map(r=>JSON.parse(JSON.stringify(r)))};},async add({data}){if(map.has(data._id))throw Error('duplicate');const id=data._id||'id-'+map.size;map.set(id,{...data,_id:id});return {_id:id};},async update({data}){let updated=0;for(const [id,r]of map)if(matches(r)){map.set(id,{...r,...data});updated++;}return {stats:{updated}};}};return q;}
})};
const account=require('../cloudfunctions/account/handler').createHandler({context:()=>sdk.getWXContext(),repository:{find:async key=>accounts.get(key),insert:async row=>{if(accounts.has(row._id))throw Error('duplicate');accounts.set(row._id,row);}}});
const file=path.join(root,'cloudfunctions/mealRecords/index.js'),exportsObject={};
vm.runInNewContext(fs.readFileSync(file,'utf8'),{exports:exportsObject,console:{error(){}},require:n=>n==='wx-server-sdk'?sdk:require(n.startsWith('.')?path.resolve(path.dirname(file),n):n)});
const main=exportsObject.main;
global.wx={env:{USER_DATA_PATH:'/user'},getStorageSync:k=>disk[k],removeStorageSync:k=>{delete disk[k];},setStorageSync(k,v){if(failStorage)throw Error('quota');disk[k]=v;},getFileSystemManager:()=>({statSync:()=>({size:1024})}),getImageInfo(o){o.success({width:800,height:600,type:'jpeg'});},compressImage(o){o.success({tempFilePath:o.src});},cloud:{init(){},async callFunction({name,data}){calls.push({name,data,owner});if(offline)throw Error('offline');if(name==='account'){const gate=holdBootstrap,result=await account(data);if(gate)await gate;return {result};}if(oldServer&&data.action==='identityHandshake')return {result:{success:false,code:'UNKNOWN_ACTION'}};const result=await main(data);if(data.action==='list'&&holdList)await holdList;if(data.action==='add'&&lostAdd){lostAdd=false;throw Error('lost');}return {result};},async uploadFile({cloudPath}){if(holdUpload)await holdUpload;return {fileID:'cloud://env.bucket/'+cloudPath};},async getTempFileURL({fileList}){return {fileList:fileList.map(fileID=>({fileID,status:0,tempFileURL:'https://test/photo'}))};}}};
const identity=require(path.join(mp,'identity')),store=require(path.join(mp,'store')),data=require(path.join(mp,'data')),service=require(path.join(mp,'cloudRecords')),recovery=require(path.join(mp,'legacyRecovery'));
const sample=()=>({
 id:data.createId(),restaurant:'Private restaurant',notes:'Private note',date:'2025-08-26',
 city:'Tokyo',country:'Japan',neighborhood:'Shibuya',rating:5,tags:['Private'],
 photo:data.photos.meal,noPhoto:true,extraPhotos:[],coordinates:[35.6643,139.6984],
 shared:false,liked:false,saved:false
});
const draft=()=>({...store.freshDraft(),restaurant:'Private draft'});
let n=0;async function test(name,fn){await fn();n++;console.log('PASS '+name);}
(async()=>{
 disk['savor-diary-v1']=JSON.stringify({memories:[sample()],outbox:[{id:'legacy-new',recordId:'unknown',kind:'delete'}]});
 disk['savor-draft-v1']=JSON.stringify({...draft(),restaurant:'Legacy private',cloudAttempt:{id:'unknown-create-001'}});
 const legacy=disk['savor-diary-v1'];
 await test('cold start hides unverified legacy records and cannot send outbox',async()=>{assert.equal(store.get().memories.length,0);await assert.rejects(store.syncCloud());assert.equal(calls.length,0);assert.equal(store.saveDraft(draft()),false);});
 let a,b,tokenA,memoryA;
 await test('bootstrap opens empty A partition; original keys and quarantined operations preserved',async()=>{tokenA=await identity.verify();a=tokenA.userId;assert.equal(store.get().memories.length,0);assert.equal(store.get().outbox.length,0);assert.equal(disk['savor-diary-v1'],legacy);assert.equal(identity.quarantine()['savor-diary-v1'],legacy);});
 await test('cloud serializer preserves valid fields without optional metadata',async()=>{const memory=sample(),record=service.memoryToCloudRecord(memory);assert.deepEqual(record.tags,memory.tags);assert.deepEqual(record.coordinates,memory.coordinates);assert.equal(record.rating,5);});
 await test('cloud serializer rejects missing required fields clearly',async()=>{for(const field of ['tags','coordinates'])assert.throws(()=>service.memoryToCloudRecord({...sample(),[field]:undefined}),e=>e&&e.code==='INVALID_RECORD'&&/invalid/i.test(e.message));});
 await test('A private data, draft and device theme persist; offline-known session accepts local drafts',async()=>{store.addMemory(sample());store.updateProfile({name:'Private A'});store.updateSettings({theme:'dusk'});offline=true;assert(store.saveDraft(draft()));offline=false;memoryA=await store.createCloudMemory(sample(),draft());assert(memoryA.cloudId);});
 await test('lost Add reply remains durable, same identity retry is idempotent',async()=>{lostAdd=true;await assert.rejects(store.createCloudMemory(sample(),draft()));const pending=store.loadDraft();assert(pending.cloudAttempt.submitted);assert.equal(pending.cloudAttempt.actorUserId,a);const count=rows.size;await store.createCloudMemory(sample(),pending);assert.equal(rows.size,count);});
 await test('offline outbox actor is A; B never inherits or sends it',async()=>{offline=true;store.updateMemory(memoryA.id,{saved:true});await store.flushOutbox();assert.equal(store.get().outbox[0].actorUserId,a);store.saveDraft(draft());offline=false;owner='B';b=(await identity.verify()).userId;assert.notEqual(b,a);assert.equal(store.get().memories.length,0);assert.equal(store.get().outbox.length,0);assert.equal(store.loadDraft().restaurant,'');assert.notEqual(store.get().profile.name,'Private A');assert.equal(store.get().settings.theme,'dusk');const count=calls.length;await store.syncCloud();assert(!calls.slice(count).some(c=>['flags','delete','update','add'].includes(c.data.action)));assert.throws(()=>identity.assertLease(tokenA));});
 await test('A restored with unsent draft and queue, B data retained separately',async()=>{store.addMemory({...sample(),restaurant:'B only'});owner='A';await identity.verify();assert.equal(store.get().profile.name,'Private A');assert.equal(store.loadDraft().restaurant,'Private draft');assert.equal(store.get().outbox.length,1);assert(!store.get().memories.some(m=>m.restaurant==='B only'));await store.flushOutbox();assert.equal(rows.get(memoryA.id).saved,true);});
 await test('server rejects missing, spoofed and cross-account expected identity',async()=>{assert.equal((await main({action:'list'})).code,'IDENTITY_REQUIRED');assert.equal((await main({action:'list',identityProtocol:1,expectedUserId:b,OPENID:'B'})).code,'IDENTITY_MISMATCH');owner='B';await assert.rejects(service.listRecords(),e=>e.code==='IDENTITY_MISMATCH');assert(identity.snapshot().locked);await identity.verify();assert.equal((await service.listRecords()).length,0);});
 await test('late list from A cannot merge into B or erase B local state',async()=>{owner='A';await identity.verify();let release;holdList=new Promise(r=>release=r);const flight=store.syncCloud();await new Promise(setImmediate);owner='B';await identity.verify();release();holdList=null;await assert.rejects(flight);assert(store.get().memories.some(m=>m.restaurant==='B only'));assert(!store.get().memories.some(m=>m.cloudId===memoryA.id));});
 await test('identity change during upload cannot submit or clear A draft',async()=>{owner='A';await identity.verify();let release;holdUpload=new Promise(r=>release=r);const input={...sample(),noPhoto:false,photo:'/user/savor-photos/a.jpg'};const flight=store.createCloudMemory(input,draft());await new Promise(setImmediate);const count=rows.size;owner='B';await identity.verify();release();holdUpload=null;await assert.rejects(flight);assert.equal(rows.size,count);owner='A';await identity.verify();assert(store.loadDraft().cloudAttempt);assert.equal(store.loadDraft().cloudAttempt.actorUserId,a);});
 await test('unowned legacy new requests remain unresolved and are never replayed',async()=>{owner='B';await identity.verify();const count=rows.size;const results=await recovery.inspect();assert(results.some(x=>x.kind==='create'&&x.status==='unresolved'));assert.equal(rows.size,count);assert.equal(disk['savor-diary-v1'],legacy);});
 await test('explicit import creates private local copies, strips remote authority/media and deduplicates',async()=>{const before=rows.size;const imported={...sample(),id:'foreign',cloudId:'foreign',coupleId:'space',shared:true,photo:'cloud://env.bucket/private',ratings:{A:5,B:2}};assert.equal(store.importMemories([imported]),1);assert.equal(store.importMemories([imported]),0);const copy=store.get().memories.find(m=>m.importSourceId==='foreign');assert(!copy.cloudId&&!copy.coupleId&&!copy.shared&&!copy.ratings);assert(copy.noPhoto);assert.equal(rows.size,before);});
 await test('quota failure cannot activate a new account or overwrite legacy backup',async()=>{identity.invalidate();owner='C';failStorage=true;await assert.rejects(identity.verify());assert(identity.snapshot().locked);assert.equal(disk['savor-diary-v1'],legacy);failStorage=false;});
 await test('offline re-verification locks sensitive content without deleting partitions',async()=>{owner='A';await identity.verify();const key=require('../miniprogram/utils/identityPartitions').partitionKey(identity.lease().userId),before=disk[key];offline=true;await assert.rejects(identity.verify());assert(identity.snapshot().locked);assert.equal(store.get().memories.length,0);assert.equal(disk[key],before);offline=false;await identity.verify();assert(store.get().memories.some(m=>m.id===memoryA.id));});
 await test('old mealRecords server cannot activate a session or receive a new mutation',async()=>{const before=rows.size;oldServer=true;await assert.rejects(store.createCloudMemory(sample(),draft()),e=>e.code==='UPGRADE_REQUIRED');assert.equal(rows.size,before);await assert.rejects(identity.verify(),e=>e.code==='UPGRADE_REQUIRED');assert(identity.snapshot().locked);oldServer=false;await identity.verify();});
 await test('native chooser may resume only after verifying the same owner',async()=>{const original=identity.lease();await identity.verify();assert(!identity.isCurrent(original));const resumed=await identity.resumeNative(original);assert(identity.isCurrent(resumed));owner='B';await identity.verify();await assert.rejects(identity.resumeNative(original));owner='A';await identity.verify();});
 await test('owner-scoped new-request result confirms A but not B',async()=>{const request=calls.find(c=>c.owner==='A'&&c.data.action==='add').data.requestId;const found=await service.requestResult(request);assert(found.cloudId);owner='B';await identity.verify();await assert.rejects(service.requestResult(request),e=>e.code==='NOT_FOUND');owner='A';await identity.verify();});
 await test('active partition quota failure leaves profile and memories unchanged',async()=>{const before=JSON.stringify(store.get());failStorage=true;assert.throws(()=>store.updateProfile({name:'must-not-appear'}));assert.throws(()=>store.importMemories([{...sample(),id:'quota-copy'}]));assert.equal(JSON.stringify(store.get()),before);failStorage=false;});
 await test('unsupported envelope remains intact and session stays locked',async()=>{const key=require('../miniprogram/utils/identityPartitions').partitionKey(identity.lease().userId),backup=disk[key];disk[key]=JSON.stringify({formatVersion:999,partitions:{},legacyQuarantine:{}});const unsupported=disk[key];await assert.rejects(identity.verify());assert(identity.snapshot().locked);assert.equal(disk[key],unsupported);disk[key]=backup;await identity.verify();});
 await test('invalidated pending A verification does not block B verification or replace B on arrival',async()=>{
   let release;holdBootstrap=new Promise(r=>release=r);const old=identity.verify();old.catch(()=>{});await new Promise(setImmediate);
   identity.invalidate();owner='B';holdBootstrap=null;const current=await identity.verify();assert.equal(current.userId,b);
   release();await assert.rejects(old,e=>e.code==='STALE_IDENTITY');assert(identity.isCurrent(current));
   owner='A';await identity.verify();
 });
 await test('old verification finalizer cannot clear a newer in-flight verification',async()=>{
   let releaseOld,releaseNew;holdBootstrap=new Promise(r=>releaseOld=r);const old=identity.verify();old.catch(()=>{});await new Promise(setImmediate);
   identity.invalidate();holdBootstrap=new Promise(r=>releaseNew=r);const fresh=identity.verify();fresh.catch(()=>{});await new Promise(setImmediate);
   releaseOld();await assert.rejects(old,e=>e.code==='STALE_IDENTITY');
   const before=calls.filter(c=>c.name==='account').length;const joined=identity.verify();await new Promise(setImmediate);
   assert.equal(calls.filter(c=>c.name==='account').length,before);releaseNew();holdBootstrap=null;
   const [one,two]=await Promise.all([fresh,joined]);assert.equal(one.generation,two.generation);assert(identity.isCurrent(one));
 });
 await test('device preferences reject private or malformed fields on both read and write',async()=>{
   const key='savor-device-settings-v1',before=disk[key];disk[key]=JSON.stringify({theme:'dusk',language:'en',reduceMotion:false,pageHeadings:{home:{title:'A private title'}},cuisines:['A private preference'],profile:{name:'A'}});
   assert.deepEqual(identity.deviceSettings(),{theme:'dusk',language:'en',reduceMotion:false});
   identity.saveDeviceSettings({theme:'invalid',language:'xx',reduceMotion:'false',pageHeadings:{home:'secret'}});assert.deepEqual(JSON.parse(disk[key]),{});
   disk[key]='[]';assert.deepEqual(identity.deviceSettings(),{});disk[key]=before;
 });
 await test('malformed active manifest is preserved but cannot activate a session',async()=>{
   const key=require('../miniprogram/utils/identityPartitions').partitionKey(identity.lease().userId),backup=disk[key],invalid=JSON.parse(backup);invalid.count=-1;disk[key]=JSON.stringify(invalid);
   const raw=disk[key];await assert.rejects(identity.verify(),e=>e.code==='CACHE_CORRUPT');assert(identity.snapshot().locked);assert.equal(disk[key],raw);
   disk[key]=backup;await identity.verify();
 });
 console.log(`${n}/${n} S1 runtime checks passed. Mock transport only; native/CloudBase deployment NOT_EXECUTED.`);
 store.dismissToast();
})().catch(e=>{console.error(e);process.exitCode=1;});
