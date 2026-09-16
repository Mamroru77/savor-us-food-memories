const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict'),crypto=require('crypto');
const source=fs.readFileSync('miniprogram/pages/me/index.js','utf8');
const menu=s=>JSON.parse(JSON.stringify(vm.runInNewContext(s.match(/const MENU_ROWS = (\[[\s\S]*?\n\]);/)[1])));
const rows=menu(source),catalog=require('../miniprogram/utils/locales');
for(const row of rows)for(const k of ['title','subtitle'])assert(catalog.some(x=>x.en===row[k]),'Missing English source key: '+row[k]);
console.log('PASS every Me menu title/subtitle resolves through the existing catalog');
const expected=new Map();for(const line of fs.readFileSync('tools/lib/locale-translations.tsv','utf8').trim().split('\n')){const [en,zh]=line.split('\t');expected.set(en,{key:'s'+crypto.createHash('sha1').update(en).digest('hex').slice(0,10),en,zh});}assert.deepEqual(catalog,[...expected.values()]);
console.log('PASS generated locale catalog exactly matches TSV source');
const moduleStub={exports:{}};vm.runInNewContext(fs.readFileSync('miniprogram/utils/i18n.js','utf8'),{module:moduleStub,require:p=>p==='./locales'?catalog:p==='./pageHeadings'?{}:assert.fail(p),wx:{getAppBaseInfo:()=>({language:'en'})}});const i18n=moduleStub.exports;
for(const [lang,expected] of [['en',['Cloud tools','Backups, preferences and feedback','Annual reports','Memories, milestones and sharing']],['zh-CN',['云端工具','备份、偏好与反馈','年度报告','日记、里程碑与主动分享']]]){i18n.setLanguage(lang);assert.deepEqual(rows.slice(0,2).flatMap(r=>[i18n.t(r.title),i18n.t(r.subtitle)]),expected);}
console.log('PASS both language preferences produce single-language entry labels');
const before=fs.readFileSync('reports/lifecycle-review-20260916/batch4/backup/miniprogram/pages/me/index.js','utf8');assert.deepEqual(rows.map(({title,subtitle,...other})=>other),menu(before).map(({title,subtitle,...other})=>other));assert.equal(source.replace(/const MENU_ROWS = [\s\S]*?\n\];/,'MENU'),before.replace(/const MENU_ROWS = [\s\S]*?\n\];/,'MENU'));
console.log('PASS menu count/order/icons/routes and every non-menu line are unchanged');
console.log('4/4 menu copy checks passed. No live preferences or private content modified.');
