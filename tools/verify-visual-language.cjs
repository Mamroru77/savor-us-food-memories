// Structural design contracts, not screenshot or device-performance certification.
const fs=require('fs'),assert=require('node:assert/strict');
const read=p=>fs.readFileSync('miniprogram/'+p,'utf8'),app=read('app.wxss'),tokens=read('styles/visual-tokens.wxss');let count=0;
function test(name,fn){fn();count++;console.log('PASS '+name);}
test('one imported vocabulary owns the shared surfaces and type hierarchy',()=>{assert(app.startsWith('@import "styles/visual-tokens.wxss";'));for(const key of ['surface-page','surface-card','surface-elevated','page-gutter','card-inset','radius-card','radius-panel','type-page','type-page-zh','type-section','type-caption'])assert(tokens.includes('--'+key+':'));assert(app.includes('--content-card-bg: var(--surface-card)'));});
test('light atmosphere is bounded and is not implemented through additional blur',()=>{const alpha=Number(tokens.match(/--ambient-opacity:\s*([.\d]+)/)[1]);assert(alpha>=.08&&alpha<=.16);assert(app.includes('opacity: var(--ambient-opacity)'));assert(app.includes('--content-card-blur: 20px'));assert(!read('components/sheet/index.wxss').includes('blur(62rpx)'));});
test('three shadow roles and distinct dark surfaces remain defined',()=>{assert.equal(new Set([...tokens.matchAll(/--(shadow-[\w-]+):/g)].map(m=>m[1])).size,3);assert(tokens.includes('.dusk'));assert(app.includes('.screen.dusk'));assert(app.includes('--content-card-bg: linear-gradient(155deg,rgba(38,33,29,.92),rgba(27,24,20,.92))'));});
test('main non-map pages and secondary pages consume shared page spacing',()=>{for(const n of ['home','add','us','me'])assert(read('pages/'+n+'/index.wxss').includes('padding-left: var(--page-gutter)'));assert(read('styles/secondary.wxss').includes('var(--page-gutter)'));});
test('form refinement retains focus/errors, 88rpx controls and dark field overrides',()=>{const add=read('pages/add/index.wxss');assert(app.includes('--control-height: 88rpx'));assert(app.includes('.is-focused'));assert(app.includes('.has-error'));assert(add.includes('.dusk .add-screen .form-input'));assert(add.includes('flex:0 0 88rpx'));assert(add.includes('flex: 1 1 0'));});
test('Me menu can grow for long copy and retains all dynamic entries',()=>{const css=read('pages/me/index.wxss'),rule=css.match(/\.profile-menu-row\s*\{([^}]+)/)[1];assert(rule.includes('min-height: 136rpx'));assert(rule.includes('height: auto'));assert(read('pages/me/index.wxml').includes('wx:for="{{menuRows}}"'));});
test('shared rows retain real images and panel keeps scrolling and motion cleanup contracts',()=>{const row=read('components/memory-row/index.wxss'),sheet=read('components/sheet/index.wxss');assert(row.includes('height: 128rpx'));assert(row.includes('width: 112rpx'));assert(row.includes('var(--radius-image,28rpx)'));assert(read('components/memory-row/index.wxml').includes('mode="aspectFill"'));assert(sheet.includes('var(--radius-panel,56rpx)'));assert(read('components/sheet/index.wxml').includes('scroll-y enhanced'));assert(sheet.includes('.quiet .sheet-panel'));});
test('Us gives its relationship card more height than secondary statistics',()=>{const css=read('pages/us/index.wxss');const h=n=>Number(css.match(new RegExp('\\.'+n+'\\s*\\{[^}]*?height:\\s*(\\d+)rpx'))[1]);assert(h('together-card')>h('journey-card'));assert(h('journey-card')>=280);assert(css.includes('font-size: var(--type-stat-secondary)'));});
test('Add reserves Tab clearance once and retains the shared safe-area spacer',()=>{const css=read('pages/add/index.wxss'),rule=css.match(/\.add-screen\s*\{([^}]+)/)[1];assert(rule.includes('padding-bottom: var(--space-sm)'));assert(!rule.includes('--tab-clearance'));assert(read('pages/add/index.wxml').includes('<view class="tab-spacer" />'));assert(app.includes('height: calc(var(--tab-clearance) + 24rpx)'));});
// Round 5 regression guard. The five-star row wrapped at the approved 428pt width because an obsolete
// pre-P1-A `flex-wrap: wrap` on .rating-input survived the cascade (P1-A replaced the column sizing but
// never restated that declaration) and the Rating column was left free to shrink below the five-target
// width. This asserts the PRODUCT CONTRACT, not one implementation: five independent 88rpx targets, a
// star row that is structurally incapable of wrapping, and a Rating column that reserves the five-target
// width. Any equivalent CSS satisfies it; the exact flex/width spellings are not pinned.
test('Add Rating keeps five independent 88rpx targets on one non-wrapping row',()=>{
  const stripComments=css=>css.replace(/\/\*[\s\S]*?\*\//g,'');
  const add=stripComments(read('pages/add/index.wxss'));
  const wxml=read('pages/add/index.wxml');
  const bodies=sel=>[...add.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(m=>m[1].trim().replace(/\s+/g,' ')===sel).map(m=>m[2]);
  // Last declaration wins, so this reads the computed cascade rather than any single rule.
  const last=(sel,prop)=>{let v=null;for(const body of bodies(sel)){
    const re=new RegExp('(?:^|;)\\s*'+prop+'\\s*:\\s*([^;]+)','g');let m;
    while((m=re.exec(body)))v=m[1].trim();}return v;};
  const px=sel=>Number((last(sel,'min-width')||'').replace('rpx',''));
  const loop=(wxml.match(/wx:for="\{\{([^}]+)\}\}"[^>]*class="rating-star"/)||[])[1];
  assert(loop,'the rating targets must be rendered by one loop');
  assert(/^\[\s*1\s*,\s*2\s*,\s*3\s*,\s*4\s*,\s*5\s*\]$/.test(loop.trim()),
    'the rating row must render exactly five targets, got '+loop);
  assert.equal(last('.rating-star','width'),'88rpx');
  assert.equal(last('.rating-star','height'),'88rpx');
  assert.match(last('.rating-star','flex'),/^0\s+0\s+88rpx$/);
  assert.equal(last('.rating-input','flex-wrap'),'nowrap','the star row must never be able to wrap');
  // 5 x 88rpx of star content + the 1rpx frame border on each side; any reservation >= this passes.
  assert(px('.date-rating-row > .form-field:last-child')>=5*88+2,
    'the Rating column must reserve at least the five-target width');
  // The Date column must stay shrinkable, so it can never push Rating under its floor.
  assert.equal(last('.date-rating-row > .form-field','min-width'),'0');
});
// Home final pass. Two PRODUCT CONTRACTS, both read from the real cascade (last declaration per
// selector), never from one literal spelling:
//  (1) the "Recent" section label must sit on the same left rail as the rows it labels — the concept
//      board aligns them, and a 5rpx drift is visible because the label sits directly above the column;
//  (2) the Chinese hero subtitle must not be forced into an orphan line — CJK has no word spaces, so a
//      measure sized for the English sentence splits the shipped Chinese line after 15 glyphs.
// Any equivalent CSS satisfies both; the token names and exact widths are not pinned.
test('Home keeps the section label on the row rail and a CJK-safe hero measure',()=>{
  const strip=css=>css.replace(/\/\*[\s\S]*?\*\//g,'');
  const home=strip(read('pages/home/index.wxss')),row=strip(read('components/memory-row/index.wxss'));
  const last=(css,sel,prop)=>{let v=null;
    for(const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)){
      if(m[1].trim().replace(/\s+/g,' ')!==sel)continue;
      const re=new RegExp('(?:^|;)\\s*'+prop+'\\s*:\\s*([^;]+)','g');let x;
      while((x=re.exec(m[2])))v=x[1].trim();
    }return v;};
  const token=name=>{const m=tokens.match(new RegExp('--'+name+':\\s*([^;]+)'));return m?m[1].trim():null;};
  const rpx=value=>{if(value===null||value===undefined)return null;
    const lit=String(value).match(/^([\d.]+)rpx$/);if(lit)return Number(lit[1]);
    const ref=String(value).match(/^var\(--([\w-]+)\)$/);return ref?rpx(token(ref[1])):null;};
  // The rail only holds if the row itself contributes no horizontal padding of its own.
  const rowPadding=(last(row,'.memory-row','padding')||'').split(/\s+/);
  assert.equal(rowPadding[rowPadding.length-1],'0','the recent row must not add its own horizontal inset');
  const labelRail=rpx((last(home,'.recent-title','margin')||'').split(/\s+/)[1]);
  const listPadding=(last(home,'.recent-list','padding')||'').split(/\s+/);
  const listRail=rpx(listPadding[listPadding.length-1]);
  assert(labelRail!==null&&listRail!==null,'both the label and the list must declare a resolvable left rail');
  assert.equal(labelRail,listRail,'the Recent label must share the row content rail ('+labelRail+' vs '+listRail+' rpx)');
  // The shipped Chinese hero sentence is 17 full-width glyphs at the 27rpx subtitle size.
  const zhMeasure=rpx(last(home,'.locale-zh .home-intro-sub','max-width'));
  assert(zhMeasure!==null,'the Chinese hero measure must be stated explicitly, not inherited from the English one');
  assert(zhMeasure>=17*27,'the Chinese hero measure must fit the shipped sentence on one line ('+zhMeasure+' < '+(17*27)+' rpx)');
});
// Map final pass. Two PRODUCT CONTRACTS read from the real cascade (last declaration per selector):
//  (1) the header title and the search field must share ONE left rail. The concept board starts the
//      "Map First" glyph on the search field's own left edge, and the field is the wider element that
//      defines that rail; a separate heading inset breaks the alignment. Any equivalent CSS passes.
//  (2) BOTH themes must HOLD their top scrim before decaying. The map tiles stay light in either
//      theme, so a dusk scrim that decays from the first pixel leaves the light muted subtitle at
//      ~1.8:1 contrast, and no text colour can recover from that backdrop (white tops out at 3.65:1).
test('Map header keeps one rail and both themes hold their top scrim',()=>{
  const strip=css=>css.replace(/\/\*[\s\S]*?\*\//g,'');
  const map=strip(read('pages/map/index.wxss'));
  const last=(sel,prop)=>{let v=null;
    for(const m of map.matchAll(/([^{}]+)\{([^{}]*)\}/g)){
      if(m[1].trim().replace(/\s+/g,' ')!==sel)continue;
      const re=new RegExp('(?:^|;)\\s*'+prop+'\\s*:\\s*([^;]+)','g');let x;
      while((x=re.exec(m[2])))v=x[1].trim();
    }return v;};
  const token=name=>{const m=tokens.match(new RegExp('--'+name+':\\s*([^;]+)'));return m?m[1].trim():null;};
  const rpx=value=>{if(value===null||value===undefined)return null;
    if(String(value).trim()==='0')return 0;
    const lit=String(value).match(/^([\d.]+)rpx$/);if(lit)return Number(lit[1]);
    const ref=String(value).match(/^var\(--([\w-]+)\)$/);return ref?rpx(token(ref[1])):null;};
  const headPad=rpx(last('.map-head','padding-left'));
  const marginValue=last('.map-heading','margin');
  const marginParts=marginValue===null?[]:String(marginValue).trim().split(/\s+/);
  const headingMargin=marginParts.length?rpx(marginParts.length>=2?marginParts[1]:marginParts[0]):null;
  assert(headPad!==null&&headingMargin!==null,'the header padding and the heading margin must both resolve');
  assert.equal(headingMargin,0,'the heading must not add its own left inset on top of the header padding');
  assert.equal(headPad,rpx(token('page-gutter')),'the header must sit on the shared page gutter');
  const hold=sel=>{const bg=last(sel,'background')||'';const m=bg.match(/linear-gradient\([^)]*\)\s*([\d.]+)%/);return m?Number(m[1]):0;};
  assert(hold('.map-top-fade')>0,'the pearl scrim must hold a stop before decaying');
  assert(hold('.dusk .map-top-fade')>=30,
    'the dusk scrim must hold long enough to cover the header lines, got '+hold('.dusk .map-top-fade')+'%');
});
// Map provider-POI product contract. A previous revision hardcoded enable-poi="false", which encoded
// the WRONG product decision: native POI / landmark names are geographic context and must stay
// available, and the user chooses whether to simplify the map. This asserts the REQUIREMENT rather
// than a variable name: enable-poi must be a data binding, the product default must be ON in both the
// page and the device-level settings store, the control must carry the two localised accessible
// labels, the preference must be written through the existing settings pattern, and Savor's own
// markers must not be conditioned on the flag.
test('Map native POI visibility is a user preference that defaults ON',()=>{
  const wxml=read('pages/map/index.wxml'),page=read('pages/map/index.js');
  const bound=(wxml.match(/\benable-poi="\{\{\s*([A-Za-z_$][\w$]*)\s*\}\}"/)||[])[1];
  assert(bound&&!['true','false','null','undefined'].includes(bound),
    'enable-poi must be bound to product state, not a hardcoded literal');
  const dataBlock=page.match(/\n  data: \{([\s\S]*?)\n  \},/);
  assert(dataBlock,'the page must declare its data block');
  assert(new RegExp('\\b'+bound+'\\s*:\\s*true\\b').test(dataBlock[1]),'the page default must show native POIs');
  const defaults=read('utils/data.js').match(/const defaultSettings = \{([\s\S]*?)\n\};/);
  assert(defaults,'defaultSettings must be stated');
  const declared=defaults[1].match(new RegExp('\\b'+bound+'\\s*:\\s*(true|false)'));
  assert.equal(declared&&declared[1],'true','the device-level default must show native POIs');
  assert(new RegExp('updateSettings\\s*\\(\\s*\\{\\s*'+bound).test(page),
    'the control must write the preference through the existing settings pattern');
  assert(!new RegExp('markers="\\{\\{[^}]*'+bound).test(wxml),
    'Savor markers must stay independent of the native POI flag');
  const catalog=require('../miniprogram/utils/locales');
  const en=key=>{const row=catalog.find(entry=>entry.key===key);assert(row,'missing catalog entry '+key);return row.en;};
  const labels=[...wxml.matchAll(/aria-label="\{\{[^}]*?\?\s*copy\.(s[0-9a-f]+)\s*:\s*copy\.(s[0-9a-f]+)[^}]*?\}\}"/g)];
  assert(labels.length>=1,'the toggle must expose a state-dependent accessible label');
  assert(labels.some(m=>en(m[1])==='Hide map places'&&en(m[2])==='Show map places'),
    'the toggle must carry the Hide/Show map places accessible labels');
});
console.log(count+' visual source contracts passed; native visual review remains separate.');
