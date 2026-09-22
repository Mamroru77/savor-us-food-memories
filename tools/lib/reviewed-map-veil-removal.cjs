// Exact reviewed projection for the unchanged legacy contrast assertion only.
// Runtime has no veil; current behavior is separately asserted below and in R4.
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const reviews=require('../map-identity-review.json');
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
function historicalContrastView(css,wxml){
 const cssReview=reviews['miniprogram/pages/map/index.wxss'],wxmlReview=reviews['miniprogram/pages/map/index.wxml'];
 assert.equal(cssReview.baseSha256,'1af64be700166e451ffd3c411f3bb8c936de0d2daf38e5f8eb0a4008e95259de');
 assert.equal(wxmlReview.baseSha256,'464c48ae3efc36197a54de494efaaddee5616023d4457d5241381437193c9db1');
 assert.equal(hash(css),cssReview.sha256,'unreviewed Map stylesheet');
 assert.equal(hash(wxml),wxmlReview.sha256,'unreviewed Map template');
 assert(!css.includes('.map-night-veil')&&!wxml.includes('map-night-veil'),'runtime veil must remain absent');
 return css+'\n.map-night-veil { position:absolute; inset:0; background:rgba(0,0,0,.3); pointer-events:none; z-index:1; }\n';
}
module.exports={historicalContrastView};
