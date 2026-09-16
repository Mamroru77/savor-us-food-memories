const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
let checks = 0;
const test = (name, fn) => { fn(); checks++; console.log('PASS ' + name); };
for (const file of ['README.md', 'docs/README.md', 'docs/guides/development.md', 'archive/README.md']) {
  test(file + ' local navigation resolves', () => {
    const text = fs.readFileSync(path.join(root, file), 'utf8');
    for (const match of text.matchAll(/!?\[[^\]\n]*\]\(([^\s)]+)\)/g)) {
      const url = match[1];
      if (/^(?:[a-z]+:|#)/i.test(url)) continue;
      const target = path.resolve(root, path.dirname(file), decodeURI(url.split('#')[0]));
      assert(fs.existsSync(target), file + ' broken link: ' + url);
    }
  });
}
test('current application entry stays at the repository root', () => {
  const config = JSON.parse(fs.readFileSync(path.join(root, 'project.config.json'), 'utf8'));
  assert.equal(config.miniprogramRoot, 'miniprogram/');
  assert.equal(config.cloudfunctionRoot, 'cloudfunctions/');
  assert.equal(require('../miniprogram/utils/runtimeConfig').identityMode, 'normal');
});
test('regression evidence is tracked separately from local reports', () => {
  const dir = path.join(root, 'tools/fixtures/regression');
  const walk = d => fs.readdirSync(d, {withFileTypes:true}).flatMap(e => e.isDirectory() ? walk(path.join(d,e.name)) : [path.join(d,e.name)]);
  assert.equal(walk(dir).filter(f => path.basename(f) !== 'README.md').length, 16);
  assert(fs.readFileSync(path.join(root, '.gitignore'), 'utf8').split(/\r?\n/).includes('/reports/'));
});
console.log(`${checks} repository structure checks passed.`);
