// Static verification helper for the Savor mini program.
// Run from within miniprogram/:  node tools/verify.js
// Checks JSON validity, WXML tag balance, page/component path wiring, and image references.
const fs = require('fs');
const path = require('path');

function walk(dir, ext, out = []) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    const st = fs.statSync(p);
    if (st.isDirectory()) {
      if (f !== 'node_modules' && f !== 'tools') walk(p, ext, out);
    } else if (p.endsWith(ext)) {
      out.push(p);
    }
  }
  return out;
}

let errors = 0;
function fail(msg) { errors += 1; console.log('  ✗ ' + msg); }
function ok(msg) { console.log('  ✓ ' + msg); }

console.log('1. JSON validity');
const jsons = walk('.', '.json');
for (const f of jsons) {
  try { JSON.parse(fs.readFileSync(f, 'utf8')); ok(f); }
  catch (e) { fail(f + ' -> ' + e.message); }
}

console.log('2. WXML tag balance');
const voidTags = new Set(['image', 'input', 'import', 'include', 'cover-image', 'icon']);
for (const f of walk('.', '.wxml')) {
  const clean = fs.readFileSync(f, 'utf8').replace(/<!--[\s\S]*?-->/g, '');
  const stack = [];
  const re = /<\/?([a-zA-Z][a-zA-Z0-9-]*)((?:'[^']*'|"[^"]*"|\{\{[^}]*\}\}|[^>'"])*)>/g;
  let m, bad = false;
  while ((m = re.exec(clean))) {
    const tag = m[1];
    const raw = m[0];
    const closing = /^<\//.test(raw);
    const selfClosing = /\/\s*>$/.test(raw);
    if (voidTags.has(tag) || selfClosing) continue;
    if (closing) {
      if (stack.length === 0 || stack[stack.length - 1] !== tag) { fail(f + ' expected </' + stack[stack.length - 1] + '> got </' + tag + '>'); bad = true; break; }
      stack.pop();
    } else {
      stack.push(tag);
    }
  }
  if (!bad && stack.length) { fail(f + ' unclosed: ' + stack.join(',')); bad = true; }
  if (!bad) ok(f);
}

console.log('3. app.json pages resolve');
const app = JSON.parse(fs.readFileSync('app.json', 'utf8'));
for (const p of app.pages) {
  const base = p + '.wxml';
  fs.existsSync(base) ? ok(base) : fail('missing page ' + base);
}
for (const t of (app.tabBar && app.tabBar.list) || []) {
  const base = t.pagePath + '.wxml';
  fs.existsSync(base) ? ok('tab ' + base) : fail('missing tab page ' + base);
}

console.log('4. usingComponents / component refs resolve');
function checkComponents(jsonFile) {
  const dir = path.dirname(jsonFile);
  let cfg;
  try { cfg = JSON.parse(fs.readFileSync(jsonFile, 'utf8')); } catch (e) { return; }
  const refs = cfg.usingComponents || {};
  for (const key of Object.keys(refs)) {
    let target = refs[key];
    if (target.startsWith('/')) target = '.' + target;
    else target = path.join(dir, target);
    // normalize no-extension reference
    const candidates = [target + '.json', target + '.js', target + '/index.json', target + '/index.js'];
    const found = candidates.some((c) => fs.existsSync(c));
    found ? ok(jsonFile + ' -> ' + key) : fail(jsonFile + ' -> ' + key + ' (' + refs[key] + ') not found');
  }
}
checkComponents('app.json');
for (const f of walk('.', '.json').filter((x) => x !== 'app.json' && x !== 'project.config.json' && x !== 'sitemap.json')) checkComponents(f);

console.log('5. image references resolve');
for (const f of walk('.', '.js').concat(walk('.', '.wxml'))) {
  const src = fs.readFileSync(f, 'utf8');
  const re = /\/images\/([a-zA-Z0-9._-]+)/g;
  let m;
  while ((m = re.exec(src))) {
    const target = 'images/' + m[1];
    if (!fs.existsSync(target)) fail(f + ' references missing ' + target);
  }
}
// silence the no-match case (we log nothing when all resolve)

console.log('6. store/data require graph loads (Node shim for wx)');
global.wx = {
  getStorageSync: () => '',
  setStorageSync: () => {},
  showToast: () => {},
  env: { USER_DATA_PATH: '/usr/tmp' },
  getFileSystemManager: () => ({
    accessSync: () => { throw new Error('missing'); },
    mkdirSync: () => {},
    copyFileSync: () => {},
    unlinkSync: () => {},
    writeFileSync: () => {},
    readFile: () => {},
  }),
};
try {
  const vm = require('vm');
  // Load a CommonJS file in a sandbox that resolves `./x` and `../x` relative to that file.
  function loadCjs(absFile, registry) {
    const code = fs.readFileSync(absFile, 'utf8');
    const m = { exports: {} };
    const requireFrom = (fromDir, reqPath) => {
      const resolved = path.resolve(fromDir, reqPath);
      const key = resolved + '.js';
      if (registry[key]) return registry[key];
      registry[key] = loadCjs(key, registry);
      return registry[key];
    };
    const ctx = vm.createContext({
      module: m, exports: m.exports, require: (reqPath) => requireFrom(path.dirname(absFile), reqPath),
      wx: global.wx,
    });
    vm.runInContext(code, ctx, { filename: absFile });
    return m.exports;
  }
  const registry = {};
  const data = loadCjs(path.resolve(__dirname, '../utils/data.js'), registry);
  const image = loadCjs(path.resolve(__dirname, '../utils/image.js'), registry);
  const icons = loadCjs(path.resolve(__dirname, '../utils/icons.js'), registry);
  const store = loadCjs(path.resolve(__dirname, '../utils/store.js'), registry);

  const st = store.getState();
  if (!Array.isArray(st.memories) || st.memories.length < 5) fail('store: seeds missing');
  else ok('store: ' + st.memories.length + ' seed memories');
  if (!data.isMemory(st.memories[0])) fail('data.isMemory rejects valid seed');
  else ok('data.isMemory accepts valid seed');
  if (data.isMemory({})) fail('data.isMemory accepts empty object');
  else ok('data.isMemory rejects invalid object');
  if (typeof icons.iconSvg('bell') !== 'string' || !icons.iconSvg('bell')) fail('icons: bell missing');
  else ok('icons: bell renders');
  const all = new Set(st.memories.map((m) => m.id));
  if (all.size !== st.memories.length) fail('store: duplicate ids among seeds');
  else ok('store: unique ids');
} catch (e) {
  fail('require graph / smoke test failed: ' + e.message);
}

console.log('');
console.log(errors === 0 ? 'ALL CHECKS PASSED' : errors + ' PROBLEM(S) FOUND');
process.exit(errors === 0 ? 0 : 1);
