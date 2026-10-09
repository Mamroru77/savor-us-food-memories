#!/usr/bin/env node
// Additional icon provenance/semantic checks. Does not replace any existing suite.
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),crypto=require('crypto');
const {listFiles}=require('./lib/checks.cjs');
const root=path.join(__dirname,'..'),mp=path.join(root,'miniprogram'),dir=path.join(mp,'images/icons/lucide');
const sources=JSON.parse(fs.readFileSync(path.join(root,'tools/assets/icons/lucide','SOURCES.json'))),nodes=require(path.join(mp,'utils/lucideMorphNodes'));
const {icons,iconSvg}=require(path.join(mp,'utils/icons')),aliases=require('./icon-aliases.json');
const parse=s=>[...s.matchAll(/<(path|line|rect|circle|ellipse|polyline|polygon)\s+([^>]+)\/>/g)].map(m=>[m[1],Object.fromEntries([...m[2].matchAll(/([\w-]+)="([^"]*)"/g)].map(a=>[a[1],a[2]]))]);
// 2026-10-01 (Me P1-2): 49 -> 51. Two plain official Lucide originals were added through the
// existing path (svg + SOURCES.json + tools/build-icons.cjs): `cloud` for the Me "Cloud tools"
// row and `library` for the Me "Memories" row. The per-source loop below still proves each one
// against its recorded official URL and SHA-256, so this is a count, not a weakening.
assert.equal(sources.length,51);assert.equal(Object.keys(nodes).length,51);assert.equal(Object.keys(aliases).length,29);
assert.deepEqual(sources.map(s=>s.name).sort(),Object.keys(nodes).sort());
assert(fs.readFileSync(path.join(dir,'LICENSE.txt'),'utf8').includes('ISC'));
for(const source of sources){
 const svg=fs.readFileSync(path.join(dir,source.name+'.svg'),'utf8');
 assert.equal(source.url,'https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/'+source.name+'.svg');
 assert.equal(crypto.createHash('sha256').update(svg).digest('hex'),source.sha256,source.name+' source changed');
 assert.deepEqual(nodes[source.name],parse(svg),source.name+' node mismatch');
 assert.deepEqual(parse(icons[source.name]),nodes[source.name]);
 assert.match(decodeURIComponent(iconSvg(source.name)),/stroke-width="1.75"/);
}
for(const [alias,name] of Object.entries(aliases))assert.equal(icons[alias],icons[name]);
// Morph name-path coverage (2026-09-30). components/morph-icon's fallback for the name path renders
// <s-icon name="{{'lucide-' + name}}">, so every name a morph is driven with must exist as a
// 'lucide-<name>' alias — otherwise that fallback paints an empty circle while the morph itself is
// fine. The Add quick-clear morph (name/from-name "eraser") had no such alias, so the control showed
// a bare circular surface. This asserts the requirement directly: an alias-total assertion would not
// have caught it, and must not be the only thing standing between us and the same regression.
assert.match(fs.readFileSync(path.join(mp,'components/morph-icon/index.wxml'),'utf8'),/'lucide-'\s*\+/,'morph fallback must keep the lucide- prefix convention');
const morphDriven=new Set();
for(const f of listFiles(mp).filter(f=>f.endsWith('.wxml'))){
 for(const m of fs.readFileSync(f,'utf8').matchAll(/<s-morph\b[^>]*>/g)){
  for(const attr of ['name','from-name']){
   const v=m[0].match(new RegExp('\\s'+attr+'="([^"]+)"'));
   if(v&&!v[1].startsWith('{{'))morphDriven.add(v[1]);
  }
 }
}
// The Add quick-clear pair is bound through clearIcon, so read its literals from the page itself.
for(const m of fs.readFileSync(path.join(mp,'pages/add/index.js'),'utf8').matchAll(/clearIcon:\s*\{([^}]*)\}/g)){
 for(const k of ['name','fromName']){const v=m[1].match(new RegExp(k+":\\s*'([a-z0-9-]+)'"));if(v)morphDriven.add(v[1]);}
}
assert(morphDriven.has('eraser'),'the Add quick-clear morph name must be covered by this check');
for(const n of morphDriven)assert(icons['lucide-'+n],'morph fallback name lucide-'+n+' must resolve to a non-empty icon source');
assert.equal(aliases['lucide-eraser'],'eraser','lucide-eraser must alias eraser');
assert.match(decodeURIComponent(iconSvg('lucide-eraser')),/<(path|line|rect|circle|ellipse|polyline|polygon) /,'lucide-eraser must render an SVG shape body');
for(const removed of ['sparkles','map-shield','home-filled','loader','circle-help','trash-2'])assert.equal(icons[removed],undefined);
assert.equal(iconSvg('missing-icon'),'');
assert.match(decodeURIComponent(iconSvg('heart',{stroke:'#dec8a7',fill:'#dec8a7'})),/fill="#dec8a7" stroke="#dec8a7"/);
assert.match(fs.readFileSync(path.join(mp,'components/icon/index.js'),'utf8'),/stroke: \{ type: null, value: 1.75 \}/);
let count=0;
for(const f of listFiles(mp).filter(f=>/\.(wxml|wxss|js)$/.test(f))){
 const text=fs.readFileSync(f,'utf8');
 assert(!text.includes('/images/pin.png'),'obsolete pin still referenced');
 if(!f.endsWith('.wxml'))continue;
 assert(!/[▾▴▼▲×‹›★☆✓✔✕✖]/u.test(text),'character icon in '+f);
 for(const m of text.matchAll(/<s-icon\b(?:[^>"']|"[^"]*"|'[^']*')*>/g)){
  count++;const name=m[0].match(/\bname="([^"]+)"/),stroke=m[0].match(/\bstroke="([^"]+)"/);
  if(name&&!name[1].startsWith('{{'))assert(icons[name[1]],name[1]);
  if(stroke)assert.equal(stroke[1],'1.75',f);
 }
}
assert.equal(count,90); // Includes reviewed identity-loading and avatar-fallback states. The Add quick-clear button now renders one <s-morph> pair (eraser -> check) instead of a static <s-icon> (2026-09-25 user-authorized). 2026-09-26 user-authorized: the Add dining-type manager adds five icons (+ chip, hide x, restore +, custom remove x, confirm check). 2026-09-28 user-authorized: the Map zoom stepper adds two (plus, minus). 2026-09-30 user-authorized: the Map native-POI visibility toggle adds one, driven from product state. 2026-10-03: back to 88 — the Map card's lower-left disclosure control is restored verbatim and it renders one <s-icon name="chevron-down">, which is exactly the count this line had before the withdrawn native-marker round. 2026-10-03 user-authorized: the gear sheet's couple row is unified with the Us page's identity card, so it now draws the same two <s-icon name="user-round"> empty-avatar glyphs the Us card draws (+2). The sheet's heart icon changed size 55 -> 47 but not its declaration count.
// The Map POI toggle drives its glyph from the product state, so both branches must resolve or the
// control would silently paint an empty circle in one of its two states.
const mapPoiToggle=fs.readFileSync(path.join(mp,'pages/map/index.wxml'),'utf8').match(/name="\{\{[^}]*?'(map-pin)'[^}]*?'(map-pin-off)'[^}]*?\}\}"/);
assert(mapPoiToggle,'the Map POI toggle must drive one icon from the product state');
for(const n of [mapPoiToggle[1],mapPoiToggle[2]])assert(icons[n],'the Map POI toggle icon '+n+' must resolve to a non-empty icon source');
// Silhouette-collision guard (2026-09-30): the Map page's two floating 88rpx circles sat next to each
// other showing map-pinned and map-pin, which at 20-23px are the same teardrop pin with a small
// difference in the base — two near-duplicates. The POI toggle legitimately needs the pin family
// (map-pin / map-pin-off is the only true on/off places pair), so the OTHER circle must stay out of it.
// This asserts the relationship, not a spelling: whichever name the recenter uses must not be a pin.
const mapRecenter=(()=>{
 const block=fs.readFileSync(path.join(mp,'pages/map/index.wxml'),'utf8').match(/<view class="recenter-map[\s\S]*?<\/view>/);
 assert(block,'the Map recenter control must exist');
 const m=block[0].match(/<s-icon[^>]*\bname="([^"]+)"/);
 return m&&m[1];
})();
assert(mapRecenter,'the Map recenter must declare an icon');
assert(!/^map-pin/.test(mapRecenter),'the Map recenter must not reuse a pin glyph ('+mapRecenter+') beside the pin-family POI toggle');
const sheet=fs.readFileSync(path.join(mp,'components/sheet/index.wxml'),'utf8');
const settings=fs.readFileSync(path.join(mp,'components/settings-editor/index.wxml'),'utf8');
assert.match(settings,/class="preference-tip">\s*<s-icon name="lightbulb"/);
assert.match(sheet,/class="notification-symbol">\s*<s-icon name="bell"/);
const add=fs.readFileSync(path.join(mp,'pages/add/index.wxml'),'utf8');
assert.match(add,/<s-icon wx:else name="notebook-pen"/);assert.match(add,/name="chevron-down" size="28"/);
assert.match(fs.readFileSync(path.join(mp,'pages/map/index.wxml'),'utf8'),/name="map-pin-off"/);
const me=fs.readFileSync(path.join(mp,'pages/me/index.js'),'utf8');for(const m of me.matchAll(/icon: '([^']+)'/g))assert(icons[m[1]],m[1]);
for(const state of ['normal','selected'])for(const kind of ['frame','fallback']){
 const name='landmark-'+state+'-'+kind,svg=fs.readFileSync(path.join(root,'docs/design',name+'.svg'),'utf8');
 const found=[];
 for(const m of svg.matchAll(/<g\s+([^>]*data-lucide="([^"]+)"[^>]*)>([\s\S]*?)<\/g>/g)){
  found.push(m[2]);assert.match(m[1],/stroke-width="1.75"/);assert.deepEqual(parse(m[3]),nodes[m[2]]);
 }
 const expected=['utensils'];if(state==='selected')expected.push('check');if(kind==='fallback')expected.push('image');assert.deepEqual(found.sort(),expected.sort());
 assert.match(svg,/>S<\/text>/);assert.match(svg,/width="256" height="286" viewBox="0 0 256 286"/);
 const png=fs.readFileSync(path.join(mp,'images/markers',name+'.png'));assert.equal(png.readUInt32BE(16),768);assert.equal(png.readUInt32BE(20),858);
}
for(const direction of ['up','down'])for(const suffix of ['', '-dusk']){
 const svg=fs.readFileSync(path.join(root,'tools/assets/markers','stack-button-'+direction+suffix+'.svg'),'utf8');const group=svg.match(/<g\s+([^>]*data-lucide="([^"]+)"[^>]*)>([\s\S]*?)<\/g>/);
 assert(group);assert.equal(group[2],'chevron-'+direction);assert.deepEqual(parse(group[3]),nodes[group[2]]);assert.match(group[1],/stroke-width="1.75"/);
}
const pixelReport=JSON.parse(fs.readFileSync(path.join(root,'tools/fixtures/regression/icon-unification-validation.json')));
assert.equal(pixelReport.stampPixelChecks.length,4);
for(const item of pixelReport.stampPixelChecks){
 assert.equal(item.unchangedOutsideIconRegions,true);
 for(const [file,digest] of [[item.asset,item.pngSha256],[item.composition,item.compositionSha256]])assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file.replace(/^design-references\//,'docs/design/')))).digest('hex'),digest,'stamp export drift: '+file);
}
const generated=['miniprogram/utils/icons.js','miniprogram/utils/lucideMorphNodes.js','tools/_gen/icons.json'];const before=generated.map(f=>fs.readFileSync(path.join(root,f),'utf8'));
const run=require('child_process').spawnSync(process.execPath,[path.join(__dirname,'build-icons.cjs')],{encoding:'utf8'});assert.equal(run.status,0,run.stderr);
generated.forEach((f,i)=>assert.equal(fs.readFileSync(path.join(root,f),'utf8'),before[i],'generator drift: '+f));
console.log('ICON VERIFICATION PASSED: 51 official SVGs, 29 compatibility aliases (incl. morph-fallback coverage), '+count+' template declarations, semantic roles, native SVG/PNG contracts, repeatable generation. Native visual acceptance still required.');
