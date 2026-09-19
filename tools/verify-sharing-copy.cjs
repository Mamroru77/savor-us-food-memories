// Capability-to-copy contract: local collection flag is not a cross-account grant.
const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict'),crypto=require('crypto');
const i18n=require('../miniprogram/utils/i18n');
const caption='Us is your diary collection, not proof of sharing with another account. Manage cross-account access separately in Shared space.';
const key=s=>'s'+crypto.createHash('sha1').update(s).digest('hex').slice(0,10);
const source=fs.readFileSync('miniprogram/components/sheet/index.js','utf8');
for(const locale of ['en','zh-CN']){
 i18n.setLanguage(locale);assert.equal(i18n.t('Show in Us'),locale==='en'?'Show in Us':'加入「我们」');assert.equal(i18n.t('In Us'),locale==='en'?'In Us':'已加入「我们」');
 assert(i18n.t(caption).includes(locale==='en'?'not proof':'不代表'));
 for(const shared of [false,true]){
  let spec;const updates=[],messages=[],memory={id:'synthetic',shared,restaurant:'用户 Café',notes:'不翻译'};
  const deps={i18n,store:{updateMemory:(id,patch)=>updates.push([id,JSON.parse(JSON.stringify(patch))]),notify:s=>messages.push(s)}};
  vm.runInNewContext(source,{Component:s=>spec=s,require:p=>deps[p.split('/').pop()]||{}});
  const p={...spec.methods,data:{detail:{memory}}};p.onShare();assert.deepEqual(updates,[['synthetic',{shared:!shared}]]);
  assert(messages[0].includes(locale==='en'?(shared?'access is unchanged':'not sent'):(shared?'权限未改变':'未发送')));
  assert.equal(memory.restaurant,'用户 Café');assert.equal(memory.notes,'不翻译');
 }
}
for(const path of ['miniprogram/pages/us/index.wxml','miniprogram/components/sheet/index.wxml'])assert(fs.readFileSync(path,'utf8').includes(key(caption)));
assert(!source.includes('Couple binding and sending records to another person are not enabled.'));
const us=fs.readFileSync('miniprogram/pages/us/index.wxml','utf8');for(const section of ['together-card','journey-card','shared-section'])assert(us.includes(section));
console.log('PASS both locales: collection-only toggle, explicit access boundary, truthful FAQ, preserved user text and Us sections');
