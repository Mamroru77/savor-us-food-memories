// Release gate: the project package budget, and the boundary between build-only sources
// (tools/assets/) and runtime assets (miniprogram/). Read-only.
//
// Budget policy lives in tools/lib/checks.cjs (PACKAGE_BUDGET) so this gate and
// verify-miniprogram.cjs can never disagree:
//   SOFT_WARNING_MIB      1.70  -> printed as a warning, verify still passes
//   PROJECT_HARD_LIMIT_MIB 1.90  -> verify fails
//   WECHAT_PLATFORM_LIMIT_MB 2   -> WeChat's official single main package / single subpackage
//                                  limit. 1.90 MiB is THIS PROJECT's own safety margin and is
//                                  deliberately not claimed to be a WeChat limit.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { PACKAGE_BUDGET } = require('./lib/checks.cjs');
const root = path.resolve(__dirname, '..');
const mp = path.join(root, 'miniprogram');
const MiB = 1024 * 1024;
const KiB = 1024;
let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('PASS ' + name); };
const sha256 = buffer => crypto.createHash('sha256').update(buffer).digest('hex');
function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out); else out.push(full);
  }
  return out;
}
const packageFiles = walk(mp);
const packageBytes = packageFiles.reduce((sum, f) => sum + fs.statSync(f).size, 0);
const packageMiB = packageBytes / MiB;

// ---------------------------------------------------------------- package budget
test('the package stays below the project hard limit', () => {
  assert(packageMiB < PACKAGE_BUDGET.PROJECT_HARD_LIMIT_MIB,
    'package size ' + packageBytes + ' B = ' + packageMiB.toFixed(6) + ' MiB is at or above the project hard limit '
    + PACKAGE_BUDGET.PROJECT_HARD_LIMIT_MIB + ' MiB (WeChat platform limit is ' + PACKAGE_BUDGET.WECHAT_PLATFORM_LIMIT_MB + ' MB)');
});

test('the soft warning is a warning, not a failure, and the policy never claims to be a WeChat limit', () => {
  assert(PACKAGE_BUDGET.SOFT_WARNING_MIB < PACKAGE_BUDGET.PROJECT_HARD_LIMIT_MIB, 'the soft warning must sit below the hard limit');
  assert(PACKAGE_BUDGET.PROJECT_HARD_LIMIT_MIB < PACKAGE_BUDGET.WECHAT_PLATFORM_LIMIT_MB, 'the project hard limit must leave headroom under the platform limit');
  assert(packageMiB < PACKAGE_BUDGET.SOFT_WARNING_MIB, 'the current size must be below the soft warning');
  assert(/not a WeChat limit/i.test(PACKAGE_BUDGET.NOTE), 'the policy note must state that 1.90 MiB is not a WeChat limit');
  const gate = fs.readFileSync(path.join(root, 'tools/verify-miniprogram.cjs'), 'utf8');
  assert(gate.includes('mb < PACKAGE_BUDGET.PROJECT_HARD_LIMIT_MIB'), 'verify-miniprogram must fail on the project hard limit');
  assert(gate.includes('mb >= PACKAGE_BUDGET.SOFT_WARNING_MIB') && gate.includes('console.warn'), 'the soft threshold must warn without failing');
  assert(!/mb < 1\.5\b/.test(gate), 'the retired 1.5 MiB gate must not come back');
  assert(gate.includes('WECHAT_PLATFORM_LIMIT_MB'), 'the gate must state the WeChat platform limit');
});

// ---------------------------------------------------------------- build-only sources
// The expected digests are frozen in a fixture rather than read back from git history: the move
// commit itself removes the old paths, so a `git show HEAD:<old path>` comparison would break the
// moment this change lands. The fixture pins byte-identity permanently.
const MOVED = JSON.parse(fs.readFileSync(path.join(root, 'tools/fixtures/moved-build-sources.json'), 'utf8'));

test('every build-only source left the package and no runtime asset followed it', () => {
  assert.equal(MOVED.moved.length, 6, 'the fixture must list the six moved build sources');
  for (const entry of MOVED.moved) {
    assert(!fs.existsSync(path.join(root, entry.from)), 'still shipped in the package: ' + entry.from);
    const target = path.join(root, entry.to);
    assert(fs.existsSync(target), 'build source missing from tools/assets: ' + entry.to);
    assert.equal(fs.statSync(target).size, entry.bytes, 'build source size changed while moving: ' + entry.to);
    assert.equal(sha256(fs.readFileSync(target)), entry.sha256, 'build source changed while moving: ' + entry.to);
  }
  // The runtime assets must not move with them, and must not change byte-for-byte.
  assert.equal(MOVED.runtimePngs.length, 11, 'the fixture must list all eleven shipped PNGs');
  for (const entry of MOVED.runtimePngs) {
    const target = path.join(root, entry.path);
    assert(fs.existsSync(target), 'runtime asset removed: ' + entry.path);
    assert.equal(sha256(fs.readFileSync(target)), entry.sha256, 'runtime asset bytes changed: ' + entry.path);
  }
  // The ISC notice travels with the distributed icons on purpose; only the tooling reads it.
  assert(fs.existsSync(path.join(mp, 'images/icons/lucide/LICENSE.txt')), 'the ISC notice must stay with the shipped icons');
});

test('build-map-icons reads the moved sources and still writes the runtime PNGs', () => {
  const script = fs.readFileSync(path.join(root, 'tools/build-map-icons.py'), 'utf8');
  assert(script.includes("BUTTON_SVG=ROOT/'tools/assets/markers'"), 'stack button sources must be read from tools/assets/markers');
  assert(script.includes("MARKERS=ROOT/'miniprogram/images/markers'"), 'PNG output must stay at miniprogram/images/markers');
  assert(script.includes("write_to=str(MARKERS/f'stack-button-{direction}{suffix}.png')"), 'stack button PNG output path changed');
  assert(!script.includes("miniprogram/images/markers/stack-button-"), 'the script must not read the SVG back out of the package');
  assert(script.includes("ICONS=ROOT/'miniprogram/images/icons/lucide'"), 'lucide glyph sources stay in the package');
});

test('the moved SVGs are byte-identical to the sources that produced the shipped PNGs', () => {
  // tools/build-map-icons.py inlines the lucide glyph into each SVG (sync()) and then rasterises.
  // Re-running sync() in Node must be a no-op on the moved files: that proves the sources now sitting
  // in tools/assets/markers are exactly the ones the current PNGs were exported from.
  const ICONS = path.join(mp, 'images/icons/lucide');
  const norm = value => value.replace(/>\s+</g, '><').trim();
  for (const name of ['stack-button-up', 'stack-button-down', 'stack-button-up-dusk', 'stack-button-down-dusk']) {
    const file = path.join(root, 'tools/assets/markers', name + '.svg');
    const text = fs.readFileSync(file, 'utf8');
    const groups = [...text.matchAll(/<g\b([^>]*data-lucide="([^"]+)"[^>]*)>([\s\S]*?)<\/g>/g)];
    assert(groups.length === 1, name + ' must carry exactly one data-lucide group');
    const glyph = fs.readFileSync(path.join(ICONS, groups[0][2] + '.svg'), 'utf8');
    const inner = [...glyph.matchAll(/<(path|line|rect|circle|ellipse|polyline|polygon)\b([^>]*)\/>/g)]
      .map(m => '<' + m[1] + m[2] + '/>').join('');
    const rebuilt = text.replace(groups[0][0], '<g' + groups[0][1] + '>' + inner + '</g>');
    // ElementTree re-serialises the appended children with a newline before </g>; whitespace
    // between tags is not significant in SVG, so compare the normalised markup.
    assert.equal(norm(rebuilt), norm(text), name + ': sync() is not idempotent, the PNG would change on regeneration');
    assert(norm(rebuilt).includes('width="28" height="28" rx="12"'), name + ' lost its container geometry');
    const png = fs.readFileSync(path.join(mp, 'images/markers', name + '.png'));
    assert.equal(png.readUInt32BE(16), 96);
    assert.equal(png.readUInt32BE(20), 96);
    assert.equal(png.subarray(1, 4).toString('latin1'), 'PNG');
  }
});

// ---------------------------------------------------------------- report
const toMiB = bytes => (bytes / MiB).toFixed(6) + ' MiB';
const distance = limitMiB => {
  const bytes = Math.round(limitMiB * MiB) - packageBytes;
  return bytes + ' B (' + (bytes / KiB).toFixed(1) + ' KiB)';
};
console.log('\npackage exact bytes                    : ' + packageBytes);
console.log('package MiB (bytes / 1048576)          : ' + toMiB(packageBytes));
console.log('distance to project 1.70 MiB warning   : ' + distance(PACKAGE_BUDGET.SOFT_WARNING_MIB));
console.log('distance to project 1.90 MiB hard limit: ' + distance(PACKAGE_BUDGET.PROJECT_HARD_LIMIT_MIB));
console.log('distance to WeChat 2 MB platform limit : ' + distance(PACKAGE_BUDGET.WECHAT_PLATFORM_LIMIT_MB) + '   [2 MB = 2 * 1048576 B, the unit WeChat reports]');
console.log(passed + ' package/build-asset checks passed.');
