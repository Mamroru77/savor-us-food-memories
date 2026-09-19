// No network/storage writes; negative tests for the exact historical-contract projection.
const fs=require('fs'),assert=require('node:assert/strict'),crypto=require('crypto');
const review=require('./lib/reviewed-me-memory-return.cjs');
const source=fs.readFileSync('miniprogram/pages/me/index.js','utf8');
const fixture=fs.readFileSync('tools/fixtures/regression/lifecycle-review-20260916/batch4/backup/miniprogram/pages/me/index.js','utf8');
assert.equal(crypto.createHash('sha256').update(fixture).digest('hex'),'899d7486a1b7b089e715660ad6b81d24060381cf657c4784eb3d32e34ba6103e');
const menu=s=>s.replace(/const MENU_ROWS = [\s\S]*?\n\];/,'MENU');
assert.equal(menu(review.project(source)),menu(fixture));
for(const [label,changed] of [
 ['unknown line',source+'\n// unreviewed'],
 ['route',source.replace('/pages/reports/index','/pages/home/index')],
 ['remove restoration',source.replace('restoreMemoryParent(position)','restoreMemoryParent_DISABLED(position)')],
 ['menu label',source.replace("title:'Cloud tools'","title:'Other'")],
]){assert.notEqual(changed,source);assert.throws(()=>review.project(changed),/exact reviewed/);console.log('PASS rejects '+label);}
console.log('PASS historical non-menu equality after exact approved A projection; fixture SHA unchanged');
require('./verify-memory-return.cjs');
