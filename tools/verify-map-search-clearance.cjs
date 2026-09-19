// D2 regression: production drawer geometry, synthetic anchors; no native/phone claim.
// Kept standalone while RED: node tools/verify-map-search-clearance.cjs
const fs = require('fs');
const vm = require('vm');
const assert = require('node:assert/strict');
const stack = require('../miniprogram/utils/mapStack');
let spec, width = 375;
const deps = {
  mapStack: stack,
  metrics: { getMetrics: () => ({ screenWidth: width }) },
  i18n: { copy: () => ({}), locale: () => 'en' },
  mapMarkers: { style: () => ({ iconPath: 'synthetic-fallback.png' }) },
};
vm.runInNewContext(fs.readFileSync('miniprogram/pages/map/index.js', 'utf8'), {
  Page: value => { spec = value; }, require: path => deps[path.split('/').pop()] || {}, wx: {},
});
const failures = [];
let count = 0;
function check(name, run) {
  try { run(); count++; console.log('PASS ' + name); }
  catch (error) { failures.push(name); console.error('FAIL ' + name + ': ' + error.message); }
}
function drawer({ anchorY = 400, children = 3, page = 0, progress = 1, overlayTop = 180 } = {}) {
  const members = Array.from({ length: children + 1 }, (_, i) => ({
    id: 'synthetic-' + i, coordinates: [22.6, 120.3], restaurant: 'Untranslated user name',
  }));
  const before = JSON.stringify(members);
  const p = { ...spec, drawerRootId: members[0].id, drawerProgress: progress,
    stackPositions: { [members[0].id]: { x: width / 2, y: anchorY } },
    data: { ...spec.data, clusterOpen: true, drawerPage: page, overlayTop },
  };
  const drawers = p.buildDrawers([{ memory: members[0], members }], [], members[0].id);
  assert.equal(drawers.length, 1);
  assert.equal(JSON.stringify(members), before, 'real coordinates and user copy must not be rewritten');
  return { drawers, overlayTop, anchorY };
}
function clearance(result) {
  for (const d of result.drawers) {
    // Matches the ordinary hit box in Map WXML, not just the visible chevron.
    const top = d.screenY - d.height + d.buttonBox.hitTop;
    assert(top >= result.overlayTop,
      `root=${d.rootId}, button absolute top=${top}, safe top=${result.overlayTop}`);
    assert(d.buttonBox.hitWidth >= 44);
    assert.equal(d.screenY,result.anchorY,'projection must remain the genuine root anchor');
    assert.equal(d.screenY-d.height+d.rootTop,result.anchorY-89,'root stays anchored while rows reverse');
    if(d.down){
      assert.equal(d.calloutOffset,d.frameHeight-89,'native fixed frame compensates below the real root');
      const nativeTop=d.screenY-d.frameHeight+d.calloutOffset;
      assert.equal(nativeTop,result.anchorY-89);
      assert.equal(nativeTop+d.buttonBox.hitTop-d.rootTop,top,'native and ordinary button projections agree');
      for(const row of d.rows){assert(row.top-d.rootTop>=0);assert(row.top-d.rootTop+89<=d.frameHeight);}
    }
  }
}
check('roomy lower anchor preserves upward expansion and real root', () => {
  const result = drawer({ anchorY: 760 }); clearance(result);
  const d = result.drawers[0]; assert.equal(d.rootTop - d.height, -89);
  assert.equal(d.screenY, result.anchorY);
});
for (const viewportWidth of [320, 375, 428]) {
  width = viewportWidth;
  for (const children of [1, 3, 4]) {
    for (const progress of [0, 0.5, 1]) {
      check(`near-top width=${width} children=${children} progress=${progress}`, () => {
        clearance(drawer({ children, progress }));
      });
    }
  }
  check(`short last page width=${width}`, () => clearance(drawer({ children: 4, page: 1 })));
}

// Visible-map boundary cases: root anchors start at the measured Search safe line.
// These do not certify roots underneath the header or a genuine resized device.
for(const viewportWidth of [320,375,390,428]){
 width=viewportWidth;
 check(`visible-boundary/pages/animation width=${width}`,()=>{
  for(const anchorY of [208,208.25,248,432,760])
   for(const children of [1,3,4,7,17])
    for(let page=0;page<Math.ceil(children/3);page++)
     for(const progress of [0,0.01,0.25,0.5,0.75,1]){
      const r=drawer({anchorY,children,page,progress,overlayTop:208});clearance(r);
      const d=r.drawers[0];assert.equal(d.page,page);assert.equal(d.pages,Math.ceil(children/3));
      assert.equal(d.rows.length,Math.min(3,children-page*3));
      const hitBottom=d.buttonBox.hitTop-d.rootTop+d.buttonBox.hitHeight;
      if(d.down)assert(hitBottom<=d.frameHeight+1e-9,'native fixed frame contains the complete button target');
     }
 });
}
console.log(`${count} passed, ${failures.length} failed. Synthetic geometry only; native callout alignment and phone behavior NOT VERIFIED.`);
if (failures.length) process.exitCode = 1;
