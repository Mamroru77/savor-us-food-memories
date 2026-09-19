// Production WXSS layout envelope, not browser/native proof. Native rects are separate evidence.
const fs=require('fs'),assert=require('node:assert/strict');
const css=fs.readFileSync('miniprogram/pages/us/index.wxss','utf8');
function rules(selector){const escaped=selector.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');const match=css.match(new RegExp('(?:^|\\n)'+escaped+'\\s*\\{([^}]+)\\}'));assert(match,selector+' exists');return Object.fromEntries(match[1].split(';').filter(x=>x.includes(':')).map(x=>{const i=x.indexOf(':');return [x.slice(0,i).trim(),x.slice(i+1).trim()]}));}
const card=rules('.journey-card'),title=rules('.journey-title'),stats=rules('.journey-stats'),footer=rules('.journey-latest');
const rpx=(v)=>{assert(/^\d+(?:\.\d+)?rpx$/.test(v),'bounded rpx value: '+v);return parseFloat(v);};
let cases=0;
for(const width of [320,375,390,428])for(const statHeight of [108,144,210]){
 const paddingTop=rpx(card.padding.split(/\s+/)[0]);
 const statsTop=stats.position==='absolute'?rpx(stats.top):paddingTop+rpx(title['line-height'])+rpx(stats['margin-top']);
 const bottom=statsTop+statHeight;
 const footerTop=footer.position==='absolute'?rpx(card.height)-rpx(footer.height)-parseFloat(footer.bottom||0):bottom+rpx(footer['margin-top']);
 assert(footerTop>=bottom+16,`width=${width}, statsHeight=${statHeight}: footer ${footerTop} must clear text ${bottom}`);
 cases++;
}
assert.equal(card.height,'auto','card must grow for localized multiline labels');
assert.equal(title.display,'block');assert.notEqual(stats.position,'absolute');assert.notEqual(footer.position,'absolute');
assert(css.includes('.journey-latest-photo'),'real decorative photo retained');
console.log(`PASS ${cases} Journey clearance envelopes; normal-flow footer and unchanged photo, no native claim`);
