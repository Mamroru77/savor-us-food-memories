const assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm');
let tests=0;function test(name,fn){fn();tests++;console.log('PASS '+name);}
const read=p=>fs.readFileSync(p,'utf8'),base='tools/fixtures/regression/ui-polish-20260916/backup/';
const attrs=s=>Array.from(s.matchAll(/\b(bindtap|bindinput|bindchange)="([^"]+)"/g),m=>m[1]+':'+m[2]).sort();
for(const name of ['account','space','workspace','reports'])test(name+' preserves all business interaction bindings',()=>{const p='miniprogram/pages/'+name+'/index.wxml';assert.deepEqual(attrs(read(p)),attrs(read(base+p)));});
for(const name of ['workspace','reports'])test(name+' displays gate OR normal content, never a full-screen gate above normal content',()=>{const s=read('miniprogram/pages/'+name+'/index.wxml');assert.match(s,/^<s-identity-gate wx:if="\{\{locked\}\}"\s*\/>\s*<view wx:else/);assert.equal((s.match(/<s-identity-gate/g)||[]).length,1);});
test('four secondary pages share scoped material/control stylesheet',()=>{for(const name of ['account','space','workspace','reports'])assert(read('miniprogram/pages/'+name+'/index.wxss').includes('../../styles/secondary.wxss'));const css=read('miniprogram/styles/secondary.wxss');for(const token of ['--control-height','--control-radius','--content-card-bg','--content-card-shadow','safe-area-inset-bottom'])assert(css.includes(token));assert(!/\bpage\s*\{/.test(css));});
test('appearance helper changes presentation only and handles both locales/themes',()=>{let locale='zh-CN',theme='dusk',nav;const module={exports:{}};vm.runInNewContext(read('miniprogram/utils/secondaryUI.js'),{module,require:p=>p==='./i18n'?{locale:()=>locale}:p==='./uiFeedback'?{}:p==='./store'?{get:()=>({settings:{theme}})}:assert.fail(p),wx:{setNavigationBarColor:x=>nav=x}});const page={data:{},setData:p=>Object.assign(page.data,p)};module.exports.sync(page);assert.equal(page.data.dusk,true);assert.equal(page.data.uiText.reportTitle,'年度报告与里程碑');assert.equal(nav.backgroundColor,'#121315');theme='pearl';locale='en';module.exports.sync(page);assert.equal(page.data.dusk,false);assert.equal(page.data.uiText.reportTitle,'Your year & milestones');assert.equal(nav.backgroundColor,'#eeece9');for(const value of Object.values(page.data.uiText))assert.equal(typeof value,'string');});
test('identity gate reads device theme without verification or private reads',()=>{let spec,calls=0;const id={deviceSettings:()=>({theme:'dusk'}),snapshot:()=>({status:'blocked'}),subscribe:()=>()=>{},verify:()=>calls++};vm.runInNewContext(read('miniprogram/components/identity-gate/index.js'),{Component:x=>spec=x,require:p=>p.endsWith('/identity')?id:()=>({})});const c={data:{},setData:p=>Object.assign(c.data,p)};spec.lifetimes.attached.call(c);assert.equal(c.data.dusk,true);assert.equal(calls,0);spec.lifetimes.detached.call(c);});
test('empty lists are not claimed during loading or errors',()=>{for(const [page,list] of [['workspace','tasks'],['workspace','jobs'],['space','wishes'],['space','meals']])assert(read('miniprogram/pages/'+page+'/index.wxml').includes('!busy && !message && !'+list+'.length'));});
test('Us entry and help cloud entry use existing secondary controls',()=>{assert(read('miniprogram/pages/us/index.wxml').includes('space-management secondary-button'));const s=read('miniprogram/components/sheet/index.wxml');assert.match(s,/class="secondary-button cloud-feedback-link" bindtap="onCloudFeedback"/);assert(s.includes("locale === 'zh-CN' ? '云端反馈' : 'Cloud feedback'"));});
test('year report poster dimensions and sharing safeguards remain intact',()=>{const js=read('miniprogram/pages/reports/index.js');assert(js.includes('canvas.width=720;canvas.height=1040'));assert(js.includes('if(!consent.confirm||!this.alive(token))return'));assert(read('miniprogram/pages/reports/index.wxml').includes('checked="{{details}}" bindchange="details"'));assert(read('miniprogram/pages/reports/index.wxss').includes('height:991rpx'));});
test('normal mode and native map/tab geometries are unchanged',()=>{assert.equal(require('../miniprogram/utils/runtimeConfig').identityMode,'normal');const changed=JSON.parse(read('tools/fixtures/regression/ui-polish-20260916/changes.json')).files.map(x=>x.path);for(const p of changed)assert(!p.includes('custom-tab-bar')&&!p.includes('pages/map/')&&!p.includes('pages/home/'));});
// Official WXSS compatibility: native disabled semantics stay authoritative.
const controlTemplates=['components/identity-gate','pages/account','pages/space','pages/workspace','pages/reports'].map(p=>'miniprogram/'+p+'/index.wxml');
const openingButtons=s=>s.match(/<button\b(?:[^>"']|"[^"]*"|'[^']*')*>/g)||[];
const buttonAttributes=s=>Object.fromEntries(Array.from(s.matchAll(/\s([\w:-]+)="([^"]*)"/g),m=>[m[1],m[2]]));
test('official WXSS state classes preserve every button attribute and existing class',()=>{
  for(const p of controlTemplates){
    const before=openingButtons(read('tools/fixtures/regression/official-review-20260916/backup/'+p));
    const after=openingButtons(read(p));assert.equal(after.length,before.length,p);
    before.forEach((tag,i)=>{const a=buttonAttributes(tag),b=buttonAttributes(after[i]);const ca=a.class||'',cb=b.class||'';delete a.class;delete b.class;assert.deepEqual(b,a,p+' button '+i);
      const d=a.disabled&&a.disabled.match(/^\{\{([\s\S]*)\}\}$/);
      assert.equal(cb,d?(ca?ca+' ':'')+"{{("+d[1]+") ? 'ui-disabled' : ''}}":ca,p+' button state '+i);
    });
  }
});
test('disabled styles use scoped WXSS classes rather than unsupported attribute selectors',()=>{
  const secondary=read('miniprogram/styles/secondary.wxss'),gate=read('miniprogram/components/identity-gate/index.wxss');
  assert(!/\[disabled\]/.test(secondary+gate));
  for(const selector of ['.secondary-screen .ui-disabled','.secondary-screen .ui-primary.ui-disabled','.secondary-screen.dusk .ui-primary.ui-disabled'])assert(secondary.includes(selector));
  assert(gate.includes('.gate-button.ui-disabled'));assert(gate.includes('.dusk .gate-button.ui-disabled'));
});
console.log(`${tests}/${tests} secondary UI checks passed. Native screens must be checked separately.`);
