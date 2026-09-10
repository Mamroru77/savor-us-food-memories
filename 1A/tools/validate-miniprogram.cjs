/**
 * Static validation for the Savor WeChat mini program.
 * Run with: node tools/validate-miniprogram.cjs
 *
 * Checks: JS syntax, JSON validity, WXML tag balance and binding syntax,
 * WXSS brace balance, page/component/tabBar paths, and every referenced
 * package image, so broken references are caught without the IDE.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..', 'miniprogram');
const problems = [];
const notes = [];

function fail(file, message) { problems.push(`${file}: ${message}`); }

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const files = walk(root);
const rel = (file) => path.relative(root, file).replace(/\\/g, '/');

// 1. JavaScript syntax (CommonJS, mini program runtime).
for (const file of files.filter((f) => f.endsWith('.js'))) {
  const code = fs.readFileSync(file, 'utf8');
  try {
    new vm.Script(code, { filename: file });
  } catch (error) {
    fail(rel(file), `syntax error - ${error.message}`);
  }
  if (/\bconsole\.log\(/.test(code)) fail(rel(file), 'leftover console.log');
  if (/\bdocument\.(getElement|createElement|body)|\bwindow\.(setTimeout|location|matchMedia|addEventListener)|localStorage|sessionStorage/.test(code)) {
    fail(rel(file), 'browser API reference');
  }
}

// 2. JSON validity.
const json = {};
for (const file of files.filter((f) => f.endsWith('.json'))) {
  try {
    json[rel(file)] = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    fail(rel(file), `invalid JSON - ${error.message}`);
  }
}

const app = json['app.json'];
if (!app) fail('app.json', 'missing or unreadable');

// 3. Pages, tabBar entries, and global components resolve to real files.
const exists = (p) => fs.existsSync(path.join(root, p));
if (app) {
  for (const page of app.pages || []) {
    for (const ext of ['.js', '.wxml']) {
      if (!exists(page + ext)) fail('app.json', `page ${page}${ext} is missing`);
    }
  }
  for (const tab of (app.tabBar && app.tabBar.list) || []) {
    if (!(app.pages || []).includes(tab.pagePath)) fail('app.json', `tabBar path ${tab.pagePath} is not in pages`);
  }
  for (const [name, target] of Object.entries(app.usingComponents || {})) {
    const file = target.replace(/^\//, '') + '.js';
    if (!exists(file)) fail('app.json', `component ${name} -> ${file} is missing`);
  }
  if (app.tabBar && app.tabBar.custom && !exists('custom-tab-bar/index.js')) {
    fail('app.json', 'custom tab bar is enabled but custom-tab-bar/index.js is missing');
  }
}

// 4. Page level usingComponents.
for (const [name, value] of Object.entries(json)) {
  if (name === 'app.json' || !value || !value.usingComponents) continue;
  const dir = path.dirname(name);
  for (const [tag, target] of Object.entries(value.usingComponents)) {
    const resolved = target.startsWith('/')
      ? target.replace(/^\//, '')
      : path.posix.normalize(path.posix.join(dir, target));
    if (!exists(resolved + '.js')) fail(name, `component ${tag} -> ${resolved}.js is missing`);
  }
}

// 5. WXML: tag balance, binding braces, wx:for keys.
const VOID_TAGS = new Set(['import', 'include', 'wxs', 'input', 'image', 'icon', 'progress', 'slot', 'switch', 'audio', 'video', 'camera', 'live-player', 'live-pusher', 'canvas', 'open-data', 'ad', 'cover-image']);
for (const file of files.filter((f) => f.endsWith('.wxml'))) {
  const source = fs.readFileSync(file, 'utf8');
  const stack = [];
  // Scan tags manually: attribute values may contain ">" inside a {{ }} expression.
  const tags = [];
  for (let i = 0; i < source.length; i += 1) {
    if (source[i] !== '<') continue;
    if (source.startsWith('<!--', i)) { i = source.indexOf('-->', i); if (i < 0) break; continue; }
    if (!/[a-zA-Z/]/.test(source[i + 1] || '')) continue;
    let quote = '';
    let j = i + 1;
    for (; j < source.length; j += 1) {
      const character = source[j];
      if (quote) { if (character === quote) quote = ''; continue; }
      if (character === '"' || character === "'") { quote = character; continue; }
      if (character === '>') break;
    }
    const raw = source.slice(i + 1, j);
    const head = /^(\/?)([a-zA-Z][\w-]*)/.exec(raw);
    if (!head) continue;
    tags.push({ closing: head[1], tag: head[2], attrs: raw.slice(head[0].length).replace(/\/$/, ''), selfClose: raw.trim().endsWith('/') ? '/' : '' });
    i = j;
  }
  for (const match of tags) {
    const { closing, tag, attrs, selfClose } = match;
    if (closing) {
      const open = stack.pop();
      if (open !== tag) fail(rel(file), `tag </${tag}> does not close <${open || 'nothing'}>`);
    } else if (!selfClose && !VOID_TAGS.has(tag)) {
      stack.push(tag);
    }
    if (attrs && (attrs.match(/{{/g) || []).length !== (attrs.match(/}}/g) || []).length) {
      fail(rel(file), `unbalanced {{ }} in <${tag}>`);
    }
  }
  if (stack.length) fail(rel(file), `unclosed tags: ${stack.join(', ')}`);
  if ((source.match(/{{/g) || []).length !== (source.match(/}}/g) || []).length) {
    fail(rel(file), 'unbalanced {{ }} in the document');
  }
  const loops = source.match(/wx:for="[^"]*"/g) || [];
  const keys = source.match(/wx:key="[^"]*"/g) || [];
  if (loops.length > keys.length) notes.push(`${rel(file)}: ${loops.length - keys.length} wx:for without wx:key`);
}

// 6. WXSS brace balance.
for (const file of files.filter((f) => f.endsWith('.wxss'))) {
  const source = fs.readFileSync(file, 'utf8');
  if ((source.match(/{/g) || []).length !== (source.match(/}/g) || []).length) fail(rel(file), 'unbalanced { }');
}

// 7. Every /images/... reference exists in the package.
const imagePattern = /['"`](\/images\/[\w.-]+)['"`]/g;
for (const file of files.filter((f) => /\.(js|wxml|wxss|json)$/.test(f))) {
  const source = fs.readFileSync(file, 'utf8');
  let match;
  while ((match = imagePattern.exec(source))) {
    if (!exists(match[1].replace(/^\//, ''))) fail(rel(file), `missing asset ${match[1]}`);
  }
  if (/pexels\.com|fonts\.googleapis|basemaps\.cartocdn|tile\.openstreetmap/.test(source)) {
    fail(rel(file), 'references a web-only remote asset');
  }
}

// 8. Package size sanity (main package limit is 2 MB).
const bytes = files.reduce((total, file) => total + fs.statSync(file).size, 0);
notes.push(`package size: ${(bytes / 1024).toFixed(0)} KB across ${files.length} files`);
if (bytes > 2 * 1024 * 1024) fail('package', 'main package is larger than 2 MB');

notes.forEach((note) => console.info(`note  ${note}`));
if (problems.length) {
  problems.forEach((problem) => console.error(`error ${problem}`));
  process.exit(1);
}
console.info(`ok    ${files.length} mini program files passed static validation`);
