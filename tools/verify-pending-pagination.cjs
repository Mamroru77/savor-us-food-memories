// All pending items are reachable within the native six-entry limit; no real chooser/save.
const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
let spec,current=true;const shown=[],picked=[];
const deps={identity:{lease:()=>({generation:1}),isCurrent:()=>current},i18n:{copy:()=>({}),locale:()=> 'en',t:x=>x}};
vm.runInNewContext(fs.readFileSync('miniprogram/pages/map/index.js','utf8'),{Page:p=>spec=p,require:p=>deps[p.split('/').pop()]||{},wx:{showActionSheet:o=>shown.push(o)}});
const items=Array.from({length:17},(_,i)=>({id:'synthetic-'+i,restaurant:'用户 '+i,date:'2026-09-18'}));
const p={...spec,active:true,pendingLocations:items,data:{},setData(x){Object.assign(this.data,x)},pickLocationFor:m=>picked.push(m.id)};
for(const total of [0,1,6,8,17]){
 p.pendingLocations=items.slice(0,total);shown.length=0;picked.length=0;current=true;p.onFillLocation();
 if(!total){assert.equal(shown.length,0);continue;}
 const seen=[];let sheet=shown.at(-1),rounds=0;
 while(sheet){assert(sheet.itemList.length<=6);assert(++rounds<=5,'bounded pagination');
  const next=sheet.itemList.indexOf('Next page');
  sheet.itemList.forEach((label,index)=>{if(label.startsWith('用户 ')){seen.push(label.split(' · ')[0]);sheet.success({tapIndex:index});}});
  if(next<0)break;sheet.success({tapIndex:next});sheet=shown.at(-1);
 }
 assert.equal(seen.length,total);assert.equal(new Set(picked).size,total);
 const last=shown.at(-1),previous=last.itemList.indexOf('Previous page');
 if(previous>=0){const count=picked.length;last.success({tapIndex:previous});assert.equal(picked.length,count);assert.notEqual(shown.at(-1),last);}
 const calls=picked.length,windows=shown.length;current=false;shown.at(-1).success({tapIndex:0});assert.equal(picked.length,calls);assert.equal(shown.length,windows);
}
console.log('PASS pending counts 0/1/6/8/17: all reachable, <=6 entries, reversible paging, stale identity blocked');
