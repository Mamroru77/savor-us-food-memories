const fs=require('node:fs'),assert=require('node:assert/strict'),vm=require('node:vm');
const read=p=>fs.readFileSync(p,'utf8');let failures=0;
function test(n,f){try{f();console.log('PASS '+n)}catch(e){failures++;console.error('FAIL '+n+': '+e.message)}}
const sheet=read('miniprogram/components/sheet/index.wxml'),css=read('miniprogram/components/sheet/index.wxss');
test('Memory renders raw restaurant identity before its photo without replacing the title',()=>{
 const node=sheet.match(/<text wx:if="\{\{detail.memory.restaurant\}\}" class="detail-restaurant">\{\{([^}]+)\}\}<\/text>/);assert(node,'missing identity node');assert(node.index<sheet.indexOf('<image class="detail-photo"'));
 for(const restaurant of ['食堂！','A & B <Kitchen>','Very long restaurant '.repeat(12)])assert.equal(vm.runInNewContext(node[1],{detail:{memory:{restaurant}}}),restaurant);
 assert(sheet.includes('<text class="sheet-title">{{title}}</text>'));assert.match(css,/\.detail-restaurant\s*\{[^}]*word-break:\s*break-all/);
});
test('Sync empty queue uses secondary retry; nonempty queue retains primary retry and handler',()=>{
 const node=sheet.match(/<view class="\{\{([^}]+)\}\}" bindtap="onSyncRetry"/);assert(node,'unconditional primary retry');for(const length of [0,1,17])assert.equal(vm.runInNewContext(node[1],{syncRows:{length}}),length?'primary-button':'secondary-button');
});
const cloud=read('miniprogram/pages/workspace/index.wxml');
test('Cloud tools places factual busy/pending/error/loaded status before tool cards',()=>{
 assert(cloud.indexOf('class="workspace-summary"')>=0);assert(cloud.indexOf('class="workspace-summary"')<cloud.indexOf('{{labels.backup}}'));
 for(const guard of ['{{busy}}','{{pending}}',"{{message && message !== labels.ready && message !== labels.done}}",'{{message === labels.ready || message === labels.done}}'])assert(cloud.includes(guard));
 assert(cloud.includes('labels.states[item.state] || labels.unknownState'));
 assert(cloud.includes('<block wx:if="{{config.reminderReady}}">'));
});
test('Cloud state labels cover known states, retain uncertainty and work in both languages',()=>{
 let locale='en';const module={exports:{}};vm.runInNewContext(read('miniprogram/utils/workspaceCopy.js'),{module,require:p=>{assert.equal(p,'./i18n');return {locale:()=>locale}}});
 for(const lang of ['en','zh-CN']){locale=lang;const c=module.exports();for(const key of ['loadingStatus','reviewStatus','loadedStatus','chooseTool','unknownState'])assert.equal(typeof c[key],'string');for(const state of ['collecting','uploading','ready','running','done','cancelled','queued','blocked_config','sending','sent','failed','uncertain','stored'])assert(c.states[state]);}
 locale='en';const en=module.exports();assert(/unknown|unconfirmed/i.test(en.states.uncertain));assert(/not.*read/i.test(en.states.sent));assert(/not.*read|not.*resolved/i.test(en.states.stored));
});
test('Tencent native base map has no whole-map night veil; camera and map component retained',()=>{
 const m=read('miniprogram/pages/map/index.wxml'),c=read('miniprogram/pages/map/index.wxss');assert(!m.includes('map-night-veil'));assert(!c.includes('.map-night-veil'));assert(m.includes('scale="{{initialMapScale}}"'));assert(m.includes('bindregionchange="onMapRegionChange"'));
});
if(failures)process.exitCode=1;
