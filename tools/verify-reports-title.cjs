// Actual Reports + presentation helper; synthetic identity/canvas, no files exported.
const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const catalog=require('../miniprogram/utils/locales');
let checks=0;
for(const locale of ['zh-CN','en'])for(const theme of ['pearl','dusk'])for(const quiet of [false,true]){
 let spec,listener,locked=false;const titles=[],queries=[],builds=[],state={settings:{theme,reduceMotion:quiet},memories:[{restaurant:'用户 Café',notes:'不翻译'}]};
 const identity={snapshot:()=>({locked}),subscribe:fn=>(listener=fn,()=>{}),lease:()=>({generation:1}),isCurrent:()=>true};
 const wx={setNavigationBarTitle:o=>titles.push(o.title),setNavigationBarColor(){},createSelectorQuery:()=>({in(){return this},select(){return this},fields(){return this},exec:cb=>queries.push(cb)})};
 const i18n={locale:()=>locale,t:text=>{const row=catalog.find(x=>x.en===text);return row?(locale==='en'?row.en:row.zh):text;}};
 const module={exports:{}},deps={i18n,uiFeedback:{},store:{get:()=>state}};
 vm.runInNewContext(fs.readFileSync('miniprogram/utils/secondaryUI.js','utf8'),{module,require:p=>deps[p.split('/').pop()],wx});
 const pages={secondaryUI:module.exports,identity,store:deps.store,annualReport:{build:(rows,year)=>{builds.push(rows);return {year}},draw(){}},workspaceFiles:{}};
 vm.runInNewContext(fs.readFileSync('miniprogram/pages/reports/index.js','utf8'),{Page:p=>spec=p,require:p=>{const key=p.split('/').pop();assert(key in pages,'Unexpected Reports dependency '+key);return pages[key]},wx,Date});
 const p={...spec,data:{...spec.data},setData(patch,cb){Object.assign(this.data,patch);if(cb)cb();}};
 p.onLoad();assert.equal(builds.length,0);p.onShow();assert.equal(builds.length,2);assert.equal(queries.length,1);
 assert.equal(titles.at(-1),locale==='en'?'Annual reports':'年度报告');
 const count=titles.length;p.onHide();listener();assert.equal(titles.length,count,'hidden identity refresh cannot rename another page');assert.equal(builds.length,2);
 p.onShow();assert.equal(builds.length,4);assert.equal(queries.length,2);assert.equal(p.data.dusk,theme==='dusk');
 assert.equal(state.memories[0].restaurant,'用户 Café');assert.equal(state.memories[0].notes,'不翻译');
 locked=true;listener();assert.equal(builds.length,4);assert.equal(p.data.report,null);p.onUnload();checks++;
}
console.log('PASS '+checks+' locale/theme/Quiet Reports lifecycle/title combinations; synthetic only');
