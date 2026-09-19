// Production Map return hook; fixtures only, no native or phone claim.
const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
let spec,locked=false;
const identity={snapshot:()=>({locked})};
vm.runInNewContext(fs.readFileSync('miniprogram/pages/map/index.js','utf8'),{
 Page:s=>spec=s,require:p=>p.endsWith('/identity')?identity:p.endsWith('/i18n')?{copy:()=>({}),locale:()=> 'en'}:{},wx:{},
});
const child={id:'child',restaurant:'用户 Café',city:'City',country:'Country',tags:[],saved:true};
function page(){const calls=[];const p={...spec,active:true,disposed:false,allMemories:[child],
 data:{...spec.data,sheetShow:true,sheetType:'memory',sheetMemoryId:'child',selectedId:'fallback',selected:{id:'fallback'},query:'Café',filter:'favorites'},
 applyFilters(q,f,id,mode){calls.push({q,f,id,mode});this.data.selectedId=id;this.data.selected=this.allMemories.find(m=>m.id===id);}};return {p,calls};}
assert.equal(typeof spec.restoreMemoryParent,'function','Map must restore selected child after verified Memory preview return');
let tests=0;
function check(name,run){locked=false;run();tests++;console.log('PASS '+name);}
check('verified reading return selects same visible child without changing query/filter',()=>{const {p,calls}=page(),before=JSON.stringify(p.allMemories);p.restoreMemoryParent();assert.equal(p.data.selectedId,'child');assert.equal(p.data.selected.id,'child');assert.deepEqual(calls,[{q:'Café',f:'favorites',id:'child',mode:'preserve'}]);assert.equal(JSON.stringify(p.allMemories),before);});
for(const [name,mutate] of [
 ['locked',p=>locked=true],['hidden',p=>p.active=false],['disposed',p=>p.disposed=true],
 ['closed sheet',p=>p.data.sheetShow=false],['other sheet',p=>p.data.sheetType='weekly'],
 ['missing record',p=>p.allMemories=[]],['unknown place',p=>p.allMemories=[{...child,locationUnknown:true}]],
 ['query changed',p=>p.data.query='not a match'],['filter changed',p=>p.data.filter='shared'],
 ['already selected',p=>{p.data.selectedId='child';p.data.selected=child;}],
])check(name+' does not rebuild Map',()=>{const {p,calls}=page();mutate(p);p.restoreMemoryParent();assert.equal(calls.length,0);});
check('matching id with mismatched card is repaired',()=>{const {p,calls}=page();p.data.selectedId='child';p.restoreMemoryParent();assert.equal(p.data.selected.id,'child');assert.equal(calls.length,1);});
console.log(tests+' Map preview-selection checks passed; owner/lease restoration remains covered by verify-memory-return.');
