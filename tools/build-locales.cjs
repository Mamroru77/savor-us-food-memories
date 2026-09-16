// Deterministic copy compilation; no network or front-end dependencies.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const lines = fs.readFileSync(path.join(__dirname, 'lib/locale-translations.tsv'), 'utf8').trim().split('\n');
const entries = new Map();
for (const line of lines) {
  const [en, zh] = line.split('\t');
  if (!en || !zh) throw new Error('Both languages are required: ' + line);
  if (entries.has(en) && entries.get(en).zh !== zh) throw new Error('Conflicting translation: ' + en);
  entries.set(en, { key: 's' + crypto.createHash('sha1').update(en).digest('hex').slice(0, 10), en, zh });
}
fs.writeFileSync(path.join(root, 'miniprogram/utils/locales.js'), '// UI copy only. Source: tools/lib/locale-translations.tsv\nmodule.exports = ' + JSON.stringify([...entries.values()], null, 2) + ';\n');
