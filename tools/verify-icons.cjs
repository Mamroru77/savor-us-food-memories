#!/usr/bin/env node
// Additional icon provenance/semantic checks. Does not replace any existing suite.
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),crypto=require('crypto');
const {listFiles}=require('./lib/checks.cjs');
const root=path.join(__dirname,'..'),mp=path.join(root,'miniprogram'),dir=path.join(mp,'images/icons/lucide');
const sources=JSON.parse(fs.readFileSync(path.join(dir,'SOURCES.json'))),nodes=require(path.join(mp,'utils/lucideMorphNodes'));
const {icons,iconSvg}=require(path.join(mp,'utils/icons')),aliases=require('./icon-aliases.json');
const parse=s=>[...s.matchAll(/<(path|line|rect|circle|ellipse|polyline|polygon)\s+([^>]+)\/>/g)].map(m=>[m[1],Object.fromEntries([...m[2].matchAll(/([\w-]+)="([^"]*)"/g)].map(a=>[a[1],a[2]]))]);
assert.equal(sources.length,48);assert.equal(Object.keys(nodes).length,48);assert.equal(Object.keys(aliases).length,28);
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
assert.equal(count,73); // Tab atomic fallback is a direct image; generic morph fallback retained.
const sheet=fs.readFileSync(path.join(mp,'components/sheet/index.wxml'),'utf8');
assert.match(sheet,/class="preference-tip">\s*<s-icon name="lightbulb"/);
assert.match(sheet,/class="notification-symbol">\s*<s-icon name="bell"/);
const add=fs.readFileSync(path.join(mp,'pages/add/index.wxml'),'utf8');
assert.match(add,/<s-icon wx:else name="notebook-pen"/);assert.match(add,/name="chevron-down" size="28"/);
assert.match(fs.readFileSync(path.join(mp,'pages/map/index.wxml'),'utf8'),/name="map-pin-off"/);
const me=fs.readFileSync(path.join(mp,'pages/me/index.js'),'utf8');for(const m of me.matchAll(/icon: '([^']+)'/g))assert(icons[m[1]],m[1]);
for(const state of ['normal','selected'])for(const kind of ['frame','fallback']){
 const name='landmark-'+state+'-'+kind,svg=fs.readFileSync(path.join(root,'design-references',name+'.svg'),'utf8');
 const found=[];
 for(const m of svg.matchAll(/<g\s+([^>]*data-lucide="([^"]+)"[^>]*)>([\s\S]*?)<\/g>/g)){
  found.push(m[2]);assert.match(m[1],/stroke-width="1.75"/);assert.deepEqual(parse(m[3]),nodes[m[2]]);
 }
 const expected=['utensils'];if(state==='selected')expected.push('check');if(kind==='fallback')expected.push('image');assert.deepEqual(found.sort(),expected.sort());
 assert.match(svg,/>S<\/text>/);assert.match(svg,/width="256" height="286" viewBox="0 0 256 286"/);
 const png=fs.readFileSync(path.join(mp,'images/markers',name+'.png'));assert.equal(png.readUInt32BE(16),768);assert.equal(png.readUInt32BE(20),858);
}
for(const direction of ['up','down'])for(const suffix of ['', '-dusk']){
 const svg=fs.readFileSync(path.join(mp,'images/markers','stack-button-'+direction+suffix+'.svg'),'utf8');const group=svg.match(/<g\s+([^>]*data-lucide="([^"]+)"[^>]*)>([\s\S]*?)<\/g>/);
 assert(group);assert.equal(group[2],'chevron-'+direction);assert.deepEqual(parse(group[3]),nodes[group[2]]);assert.match(group[1],/stroke-width="1.75"/);
}
const pixelReport=JSON.parse(fs.readFileSync(path.join(root,'reports/icon-unification-validation.json')));
assert.equal(pixelReport.stampPixelChecks.length,4);
for(const item of pixelReport.stampPixelChecks){
 assert.equal(item.unchangedOutsideIconRegions,true);
 for(const [file,digest] of [[item.asset,item.pngSha256],[item.composition,item.compositionSha256]])assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex'),digest,'stamp export drift: '+file);
}
const generated=['miniprogram/utils/icons.js','miniprogram/utils/lucideMorphNodes.js','tools/_gen/icons.json'];const before=generated.map(f=>fs.readFileSync(path.join(root,f),'utf8'));
const run=require('child_process').spawnSync(process.execPath,[path.join(__dirname,'build-icons.cjs')],{encoding:'utf8'});assert.equal(run.status,0,run.stderr);
generated.forEach((f,i)=>assert.equal(fs.readFileSync(path.join(root,f),'utf8'),before[i],'generator drift: '+f));
console.log('ICON VERIFICATION PASSED: 48 official SVGs, 28 compatibility aliases, 73 template declarations, semantic roles, native SVG/PNG contracts, repeatable generation. Native visual acceptance still required.');
