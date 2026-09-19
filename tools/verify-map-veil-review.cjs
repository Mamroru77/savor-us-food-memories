const fs=require('node:fs'),assert=require('node:assert/strict');
const {historicalContrastView}=require('./lib/reviewed-map-veil-removal.cjs');
const css=fs.readFileSync('miniprogram/pages/map/index.wxss','utf8'),wxml=fs.readFileSync('miniprogram/pages/map/index.wxml','utf8');
assert(!css.includes('.map-night-veil')&&!wxml.includes('map-night-veil'));
assert.match(historicalContrastView(css,wxml),/\.map-night-veil\s*\{[^}]*pointer-events:none/);
assert.throws(()=>historicalContrastView(css+'\n.memory-map{opacity:.5}',wxml),/unreviewed Map stylesheet/);
assert.throws(()=>historicalContrastView(css,wxml+'<view class="map-night-veil" />'),/unreviewed Map template/);
assert.throws(()=>historicalContrastView(css+'\n.map-night-veil{pointer-events:auto}',wxml),/unreviewed Map stylesheet/);
console.log('PASS runtime veil absent; exact legacy projection; altered stylesheet, template and intercepting veil all rejected');
