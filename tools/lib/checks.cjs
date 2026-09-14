// Shared helpers for the Savor mini program verifiers.
const fs = require('fs');
const path = require('path');

function listFiles(root, ext, ignoreDirs) {
  const out = [];
  const skip = ignoreDirs || ['node_modules', '.git'];
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir)) {
      const full = path.join(dir, entry);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        if (!skip.includes(entry)) walk(full);
      } else if (!ext || full.endsWith(ext)) {
        out.push(full);
      }
    }
  })(root);
  return out.sort();
}

// Comment-aware JS comment stripper (handles //, /* */, ', ", `).
function stripJsComments(source) {
  let out = '';
  let i = 0;
  let mode = 'code'; // code | line | block | ' | " | `
  while (i < source.length) {
    const c = source[i];
    const n = source[i + 1];
    if (mode === 'code') {
      if (c === '/' && n === '/') { mode = 'line'; out += '  '; i += 2; continue; }
      if (c === '/' && n === '*') { mode = 'block'; out += '  '; i += 2; continue; }
      if (c === "'" || c === '"' || c === '`') { mode = c; out += c; i += 1; continue; }
      out += c; i += 1;
    } else if (mode === 'line') {
      if (c === '\n') { mode = 'code'; out += '\n'; } else out += ' ';
      i += 1;
    } else if (mode === 'block') {
      if (c === '*' && n === '/') { mode = 'code'; out += '  '; i += 2; }
      else { out += c === '\n' ? '\n' : ' '; i += 1; }
    } else { // inside a string/template literal
      if (c === '\\') { out += source.slice(i, i + 2); i += 2; continue; }
      if (c === mode) mode = 'code';
      out += c; i += 1;
    }
  }
  return out;
}

// Extract every require('...') literal from real code (comments excluded).
function extractRequires(source) {
  const requires = [];
  const code = stripJsComments(source);
  const re = /require\s*\(\s*(['"])([^'")]+)\1\s*\)/g;
  let match;
  while ((match = re.exec(code)) !== null) requires.push(match[2]);
  return requires;
}

// Blank out string literal CONTENTS as well as comments — used when
// scanning for browser-only APIs so sample copy like "by the window."
// never triggers a false positive.
function stripStringsAndComments(source) {
  let out = '';
  let i = 0;
  let mode = 'code';
  while (i < source.length) {
    const c = source[i];
    const n = source[i + 1];
    if (mode === 'code') {
      if (c === '/' && n === '/') { mode = 'line'; out += '  '; i += 2; continue; }
      if (c === '/' && n === '*') { mode = 'block'; out += '  '; i += 2; continue; }
      if (c === "'" || c === '"' || c === '`') { mode = c; out += c; i += 1; continue; }
      out += c; i += 1;
    } else if (mode === 'line') {
      if (c === '\n') { mode = 'code'; out += '\n'; } else out += ' ';
      i += 1;
    } else if (mode === 'block') {
      if (c === '*' && n === '/') { mode = 'code'; out += '  '; i += 2; }
      else { out += c === '\n' ? '\n' : ' '; i += 1; }
    } else { // string: keep quotes, blank the contents
      if (c === '\\') { out += '  '; i += 2; continue; }
      if (c === mode) { mode = 'code'; out += c; } else out += ' ';
      i += 1;
    }
  }
  return out;
}

// Resolve a require target relative to the file that contains it.
function resolveRequire(fromFile, target) {
  if (!target.startsWith('.')) {
    return { error: `non-relative require '${target}' (bare modules are not available in mini programs)` };
  }
  const base = path.resolve(path.dirname(fromFile), target);
  const candidates = [
    base,
    base + '.js',
    path.join(base, 'index.js'),
    base + '.json',
    path.join(base, 'index.json'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return { resolved: candidate };
    }
  }
  return { error: `cannot resolve '${target}' from ${path.relative(process.cwd(), fromFile)}` };
}

// Full dependency walk over every .js file under the mini program root.
function buildRequireGraph(miniprogramRoot) {
  const edges = [];
  const problems = [];
  const rootAbs = path.resolve(miniprogramRoot);
  for (const file of listFiles(rootAbs, '.js')) {
    const source = fs.readFileSync(file, 'utf8');
    for (const target of extractRequires(source)) {
      const result = resolveRequire(file, target);
      if (result.error) {
        problems.push({ file: path.relative(rootAbs, file), target, reason: result.error });
        continue;
      }
      const resolvedAbs = path.resolve(result.resolved);
      if (!resolvedAbs.startsWith(rootAbs + path.sep)) {
        problems.push({
          file: path.relative(rootAbs, file),
          target,
          reason: `require escapes miniprogram root -> ${path.relative(rootAbs, resolvedAbs)}`,
        });
        continue;
      }
      edges.push({ from: path.relative(rootAbs, file), to: path.relative(rootAbs, resolvedAbs) });
    }
  }
  return { edges, problems };
}

function usingComponentPaths(json) {
  const out = [];
  if (json && typeof json.usingComponents === 'object') {
    for (const [name, ref] of Object.entries(json.usingComponents)) {
      out.push({ name, ref: String(ref) });
    }
  }
  return out;
}

function resolveComponentRef(root, ref, fromJsonPath) {
  const base = ref.startsWith('/')
    ? path.join(root, ref.slice(1))
    : path.resolve(path.dirname(fromJsonPath), ref);
  for (const candidate of [base + '.js', path.join(base, 'index.js'), base + '.json', path.join(base, 'index.json')]) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

// Minimal WXML tag-balance checker. Self-closing <tag ... /> is detected
// from the raw tag text so the attribute grammar cannot swallow the slash.
function checkWxmlBalance(source, label) {
  const problems = [];
  const stripped = source.replace(/<!--[\s\S]*?-->/g, '');
  const tagRe = /<(\/)?([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^"'>])*)>/g;
  const stack = [];
  let match;
  while ((match = tagRe.exec(stripped)) !== null) {
    const closing = Boolean(match[1]);
    const name = match[2];
    const rawTag = match[0];
    const selfClosing = !closing && /\/>\s*$/.test(rawTag);
    if (closing) {
      const top = stack.pop();
      if (!top) problems.push(`${label}: closing </${name}> without opener`);
      else if (top.name !== name) problems.push(`${label}: </${name}> closes <${top.name}>`);
    } else if (!selfClosing) {
      stack.push({ name, index: match.index });
    }
  }
  for (const left of stack) problems.push(`${label}: <${left.name}> never closed`);
  return { balanced: problems.length === 0, problems };
}

module.exports = {
  listFiles,
  stripJsComments,
  stripStringsAndComments,
  extractRequires,
  resolveRequire,
  buildRequireGraph,
  usingComponentPaths,
  resolveComponentRef,
  checkWxmlBalance,
};
