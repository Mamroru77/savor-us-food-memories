// Map zoom stepper: adjacent-integer semantics, the single camera command channel, and the
// rapid-tap / pinch / same-value contracts. Runs the PRODUCTION page methods, no re-implementation.
//
// The camera channel is the bound `scale` prop, and the platform floors fractional values, so
// every level this control may ask for is a whole number. The algorithm is deliberately
// direction-aware: round(current) + delta would send 13.49 up to 14 while 13.51 jumps to 15.
const fs = require('fs'), vm = require('vm'), assert = require('node:assert/strict');
const layout = require('../miniprogram/utils/mapLayout');

let spec;
const deps = { i18n: { copy: () => ({}), locale: () => 'en' }, mapLayout: layout };
vm.runInNewContext(fs.readFileSync('miniprogram/pages/map/index.js', 'utf8'), {
  Page: p => { spec = p; }, require: p => deps[p.split('/').pop()] || {}, wx: {},
  setTimeout: () => 0, clearTimeout: () => {},
});

// A page whose only observable side effect we care about is the camera binding write.
// `cameraCommands` records every write of the bound field, INCLUDING a write of the value
// it already holds: that write is the command, so a same-value tap must still appear here.
function page(o) {
  o = o || {};
  const p = Object.assign({}, spec, {
    active: true, disposed: false, stackGesture: false,
    data: Object.assign({}, spec.data, {
      mapScale: o.scale === undefined ? 13 : o.scale,
      commandScale: o.cmd === undefined ? 13 : o.cmd,
      mapError: false,
    }),
    allMemories: [], markerGroups: [],
    cameraCommands: [], reads: [], writes: [],
    setData(patch) {
      if (Object.hasOwn(patch, 'commandScale')) this.cameraCommands.push(patch.commandScale);
      this.writes.push(patch);
      Object.assign(this.data, patch);
    },
    onStackRelease() {}, rebindReadyMarkerPhotos() {}, stopDrawerReveal() {},
    syncStackPositions() {}, renderDrawerPhotos() {}, renderMarkerPhotos() {}, applyFilters() {},
  });
  p.native = o.native === undefined ? p.data.mapScale : o.native;
  p.mapCtx = {
    getScale(cb) { p.reads.push(1); cb.success({ scale: p.native }); },
  };
  return p;
}

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('PASS ' + name); }
  catch (e) { failed++; console.error('FAIL ' + name + ': ' + e.message); }
}

// ---- Z1-Z6: direction-aware adjacent level --------------------------------------
test('Z1 current 13 -> zoom in asks for 14', () => {
  const p = page({ scale: 13 }); p.onZoomIn();
  assert.deepEqual(p.cameraCommands, [14]); assert.equal(p.data.commandScale, 14);
});
test('Z2 current 13 -> zoom out asks for 12', () => {
  const p = page({ scale: 13 }); p.onZoomOut();
  assert.deepEqual(p.cameraCommands, [12]); assert.equal(p.data.commandScale, 12);
});
test('Z3 between levels 13.31 -> zoom in rounds UP to 14', () => {
  const p = page({ scale: 13.31 }); p.onZoomIn();
  assert.deepEqual(p.cameraCommands, [14]);
});
test('Z4 between levels 13.31 -> zoom out rounds DOWN to 13', () => {
  const p = page({ scale: 13.31 }); p.onZoomOut();
  assert.deepEqual(p.cameraCommands, [13]);
});
test('Z5 between levels 13.72 -> + goes to 14 and - goes to 13', () => {
  const up = page({ scale: 13.72 }); up.onZoomIn(); assert.deepEqual(up.cameraCommands, [14]);
  const down = page({ scale: 13.72 }); down.onZoomOut(); assert.deepEqual(down.cameraCommands, [13]);
});
test('Z6 a scale within epsilon of 14 counts as being AT 14', () => {
  const up = page({ scale: 13.99 }); up.onZoomIn(); assert.deepEqual(up.cameraCommands, [15]);
  const down = page({ scale: 13.99 }); down.onZoomOut(); assert.deepEqual(down.cameraCommands, [13]);
});
test('threshold jump is impossible: 13.49 and 13.51 both zoom in to 14', () => {
  // round(current) + delta would give 14 and 15 for these two inputs.
  assert.equal(spec.zoomAdjacentLevel(13.49, 1), 14);
  assert.equal(spec.zoomAdjacentLevel(13.51, 1), 14);
  assert.equal(spec.zoomAdjacentLevel(13.49, -1), 13);
  assert.equal(spec.zoomAdjacentLevel(13.51, -1), 13);
  assert.equal(spec.zoomAdjacentLevel(13.31, 1), 14);
  assert.equal(spec.zoomAdjacentLevel(13.31, -1), 13);
  assert.equal(spec.zoomAdjacentLevel(13, 1), 14);
  assert.equal(spec.zoomAdjacentLevel(13, -1), 12);
});

// ---- Z7-Z8: clamp is functional, not just grey ----------------------------------
test('Z7 at MAX the zoom-in control issues no camera command at all', () => {
  const p = page({ scale: 18, cmd: 18 }); p.onZoomIn();
  assert.deepEqual(p.cameraCommands, []); assert.deepEqual(p.writes, []);
  assert.equal(spec.zoomAdjacentLevel(18, 1), 18);
});
test('Z8 at MIN the zoom-out control issues no camera command at all', () => {
  const p = page({ scale: 3, cmd: 3 }); p.onZoomOut();
  assert.deepEqual(p.cameraCommands, []); assert.deepEqual(p.writes, []);
  assert.equal(spec.zoomAdjacentLevel(3, -1), 3);
});
test('Z7b/Z8b the disabled ink is derived from the same constants the handler clamps with', () => {
  assert.equal(spec.data.zoomInDisabledAt, 17.95);
  assert.equal(spec.data.zoomOutDisabledAt, 3.05);
  const wxml = fs.readFileSync('miniprogram/pages/map/index.wxml', 'utf8');
  assert(wxml.includes('{{mapScale >= zoomInDisabledAt ? \'is-disabled\' : \'\'}}'));
  assert(wxml.includes('{{mapScale <= zoomOutDisabledAt ? \'is-disabled\' : \'\'}}'));
  const wxss = fs.readFileSync('miniprogram/pages/map/index.wxss', 'utf8');
  assert(wxss.includes('.zoom-step.is-disabled'), 'disabled ink must be styled');
});

// ---- Z9-Z10: rapid taps advance one level per tap ------------------------------
test('Z9 rapid +++ from 13 asks for 14, 15, 16 - not 14, 14, 14', () => {
  const p = page({ scale: 13 });
  p.onZoomIn(); p.onZoomIn(); p.onZoomIn();
  assert.deepEqual(p.cameraCommands, [14, 15, 16]);
});
test('Z10 rapid --- from 13 asks for 12, 11, 10', () => {
  const p = page({ scale: 13 });
  p.onZoomOut(); p.onZoomOut(); p.onZoomOut();
  assert.deepEqual(p.cameraCommands, [12, 11, 10]);
});
test('Z9b a rapid burst stops at MAX instead of running past it', () => {
  const p = page({ scale: 17 });
  for (let i = 0; i < 5; i++) p.onZoomIn();
  assert.deepEqual(p.cameraCommands, [18]);
  assert.equal(p.data.commandScale, 18);
});

// ---- Z11: a finger outranks a settling command --------------------------------
test('Z11 a user pinch during a pending command cancels the stale target', () => {
  const p = page({ scale: 13 });
  p.onZoomIn();                                   // pending 14
  assert.equal(p.zoomPendingTarget, 14);
  p.onMapRegionChange({ detail: { type: 'begin', causedBy: 'gesture' } });
  assert.equal(p.zoomPendingTarget, undefined, 'gesture begin must drop the pending target');
  // The user's pinch lands on 15.6; the next tap must resolve from THERE, not from 14.
  p.native = 15.6;
  p.onMapRegionChange({ detail: { type: 'end', scale: 15.6 } });
  p.onZoomIn();
  assert.deepEqual(p.cameraCommands, [14, 16], 'the cancelled target must not be re-issued');
});
test('Z11b a fractional native scale while a command is in flight also cancels it', () => {
  const p = page({ scale: 13 });
  p.onZoomIn();                                   // pending 14
  p.native = 15.4;
  p.readMapScale(15.4);                           // no causedBy on this platform
  assert.equal(p.zoomPendingTarget, undefined);
  p.onZoomIn();
  assert.deepEqual(p.cameraCommands, [14, 16]);
});
test('Z11c a command that reaches its own level is not cancelled by the confirmation', () => {
  const p = page({ scale: 13 });
  p.onZoomIn();                                   // pending 14
  p.native = 14;
  p.readMapScale(14);
  assert.equal(p.zoomPendingTarget, undefined, 'converged command clears its pending target');
  assert.deepEqual(p.cameraCommands, [14]);
});

// ---- Z12: the historical same-value case still commands -------------------------
test('Z12 a pinch that leaves native on 13.4 while the binding already holds 13 still commands', () => {
  const p = page({ scale: 13.4, cmd: 13 });
  p.onZoomOut();                                  // floor(13.4) = 13, which the binding already holds
  assert.deepEqual(p.cameraCommands, [13], 'the write itself is the command; it must not be skipped');
});

// ---- Z13: observation never becomes a command ----------------------------------
test('Z13 regionchange observation issues zero camera commands', () => {
  const p = page({ scale: 13 });
  p.onMapRegionChange({ detail: { type: 'begin', causedBy: 'update' } });
  p.native = 15;
  p.onMapRegionChange({ detail: { type: 'end', scale: 15 } });
  p.readMapScale(15);
  assert.deepEqual(p.cameraCommands, []);
  assert.equal(p.data.mapScale, 15, 'observation is still recorded');
});
test('Z13b the observed scale is never bound back to the camera', () => {
  const wxml = fs.readFileSync('miniprogram/pages/map/index.wxml', 'utf8');
  assert(wxml.includes('scale="{{commandScale}}"'));
  assert(!wxml.includes('scale="{{mapScale}}"'));
});

// ---- Z14: one tap, at most one camera command ----------------------------------
test('Z14 a single tap issues exactly one camera command and one native read', () => {
  const p = page({ scale: 13 }); p.onZoomIn();
  assert.equal(p.cameraCommands.length, 1);
  assert.equal(p.reads.length, 1, 'the tap resolves from a fresh native read');
  assert.equal(p.writes.length, 1);
  assert.deepEqual(Object.keys(p.writes[0]), ['commandScale'], 'the command writes nothing else');
});
test('Z14b the pending path respects the clamp too: 17 -> 18, then no further command', () => {
  const p = page({ scale: 17 });
  p.onZoomIn(); p.onZoomIn(); p.onZoomIn();
  assert.deepEqual(p.cameraCommands, [18], 'a burst must not run past MAX');
  assert.equal(p.zoomPendingTarget, 18);
  const down = page({ scale: 4 });
  down.onZoomOut(); down.onZoomOut(); down.onZoomOut();
  assert.deepEqual(down.cameraCommands, [3], 'a burst must not run past MIN');
});

// ---- guards: a hidden / dragging / errored page must not command ---------------
test('hidden, disposed, dragging and errored pages issue no camera command', () => {
  for (const key of ['disposed', 'stackGesture']) {
    const p = page({ scale: 13 }); p[key] = true; p.onZoomIn();
    assert.deepEqual(p.cameraCommands, [], key + ' must not command');
  }
  const hidden = page({ scale: 13 }); hidden.active = false; hidden.onZoomIn();
  assert.deepEqual(hidden.cameraCommands, []);
  const errored = page({ scale: 13 }); errored.data.mapError = true; errored.onZoomIn();
  assert.deepEqual(errored.cameraCommands, []);
});
test('a late native reply from a hidden page cannot command', () => {
  const p = page({ scale: 13 });
  let reply = null;
  p.mapCtx.getScale = cb => { reply = cb; };
  p.onZoomIn();
  p.zoomReadRequest = (p.zoomReadRequest || 0) + 1;   // onHide invalidates the read
  reply.success({ scale: 13 });
  assert.deepEqual(p.cameraCommands, []);
});

// ---- UI contract ---------------------------------------------------------------
test('UI: vertical stepper, no scale number, existing icon system, one tool column', () => {
  const wxml = fs.readFileSync('miniprogram/pages/map/index.wxml', 'utf8');
  assert(wxml.includes('class="map-tool-column"'));
  assert(wxml.includes('bindtap="onZoomIn"') && wxml.includes('bindtap="onZoomOut"'));
  assert(wxml.includes('name="plus"') && wxml.includes('name="minus"'), 'must reuse the existing icon system');
  assert(!wxml.includes('{{mapScale}}'), 'the stepper must not display a scale number');
  assert(wxml.includes('class="zoom-step-divider"'));
  const column = wxml.match(/<view class="map-tool-column"[\s\S]*?<\/view>\s*<\/view>/)[0];
  assert(column.includes('class="recenter-map glass"'), 'recenter stays inside the shared column');
  assert(column.includes('bindtap="recenter"'), 'recenter keeps its handler');
  assert(column.includes('name="map-pinned"'), 'recenter keeps its icon');
  const wxss = fs.readFileSync('miniprogram/pages/map/index.wxss', 'utf8');
  assert(/\.zoom-step\s*\{[^}]*width: 72rpx[^}]*height: 72rpx/.test(wxss), '72x72rpx hit cell');
  assert(/\.zoom-stepper\s*\{[^}]*width: 72rpx/.test(wxss), 'stepper is lighter than the 88rpx recenter');
  assert(wxss.includes('--radius-control'), 'radius follows the existing token');
  assert(/\.zoom-step-divider\s*\{[^}]*height: 1rpx/.test(wxss), '1rpx divider');
  assert(!/\.zoom-stepper[^{]*\{[^}]*background-image/.test(wxss), 'no new image asset');
});

console.log(passed + ' passed, ' + failed + ' failed; production methods, synthetic native replies.');
if (failed) process.exitCode = 1;
