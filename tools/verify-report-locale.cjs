// Pure poster/HTML generation only: no real export, share, filesystem or private snapshots.
const assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm');
const annual=require('../miniprogram/utils/annualReport'),i18n=require('../miniprogram/utils/i18n');
const base={year:2026,asOf:'2026-09-18',privacy:'aggregates-only',count:1,days:1,places:1,longestStreak:1,unknownLocations:0,averageRating:null,ratedCount:0,months:Array.from({length:12},(_,i)=>({month:i+1,count:i<9?0:null})),milestones:[{count:1,date:'2026-09-18'}]};
const render=locale=>{const texts=[];annual.draw({fillRect(){},fillText:t=>texts.push(String(t))},base,locale);return texts;};
const en=render('en'),zh=render('zh-CN');assert(en.includes('Meal record'));assert(en.includes('Recording day'));assert(en.includes('Confirmed place'));assert(en.some(x=>x==='Longest streak: 1 day'));assert(!en.some(x=>/[\u3400-\u9fff]/.test(x)));assert(zh.some(x=>x.includes('餐记录')));
for(const locale of ['en','zh-CN']){
 const r={...base,privacy:'selected-details',details:[{date:'2026-09-18',restaurant:'用户 Café <script>',city:'苏州',country:'中国'}]},before=JSON.stringify(r),html=annual.html(r,locale);
 assert(html.includes('lang="'+locale+'"'));assert(html.includes('用户 Café &lt;script&gt;'));assert(html.includes('苏州'));assert(!html.includes('<script>'));assert.equal(JSON.stringify(r),before);
 const summary=annual.html(base,locale);assert(!summary.includes('用户 Café'));assert(summary.includes(locale==='en'?'Summary only':'仅汇总'));
}
for(const path of ['home','me','us']){
 const source=fs.readFileSync('miniprogram/pages/'+path+'/index.wxml','utf8');
 for(const expression of [...source.matchAll(/{{([^{}]+=== 1 \? copy\.[^{}]+)}}/g)].map(m=>m[1])){
  const field=expression.match(/^(\w+) ===/)[1];
  for(const locale of ['en','zh-CN']){i18n.setLanguage(locale);const copy=i18n.copy();for(const n of [0,1,2]){const text=vm.runInNewContext(expression,{copy,[field]:n});assert(typeof text==='string'&&text.length);if(locale==='en'&&field==='days')assert.equal(text,n===1?'day':'days');}}
 }
}
const presentation={exports:{}};vm.runInNewContext(fs.readFileSync('miniprogram/utils/secondaryUI.js','utf8'),{module:presentation,require:p=>p==='./i18n'?i18n:{}});
for(const locale of ['en','zh-CN'])for(const n of [0,1,2]){i18n.setLanguage(locale);const copy=presentation.exports.copy({count:n,days:n,places:n,longestStreak:n,unknownLocations:n,ratedCount:n});if(locale==='en'){assert.equal(copy.meals,n===1?'meal record':'meal records');assert.equal(copy.dayUnit,n===1?'day':'days');assert(copy.rated.endsWith(':'));assert(copy.noEstimates.startsWith('—'));}else assert.equal(copy.meals,'餐记录');}
assert(fs.readFileSync('miniprogram/pages/reports/index.js','utf8').includes('uiText:secondaryUI.copy(this._report)'));
const us=fs.readFileSync('miniprogram/pages/us/index.wxml','utf8');assert(us.includes('days === 1 ? copy.'));assert(!us.includes('<text class="secondary-subtle">'));
console.log('PASS localized poster/HTML with singular counts, escaped untranslated user fields, no summary detail leak, and primary page 0/1/2 unit expressions');
