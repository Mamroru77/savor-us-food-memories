#!/usr/bin/env node
// Asset manifest verifier — no more “the code mentions /images/x.jpg but the
// file never made it into the package”. Every local asset referenced from
// JS, WXML, WXSS or JSON must physically exist under miniprogram/images.
// Usage: node tools/verify-assets.cjs [miniprogramDir]
const fs = require('fs');
const path = require('path');
const { listFiles } = require('./lib/checks.cjs');

const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..', 'miniprogram'));
const problems = [];
const references = new Map(); // ref -> [files]

// 1. collect every /images/... reference from text sources
for (const file of listFiles(ROOT)) {
  if (!/\.(js|wxml|wxss|json)$/.test(file)) continue;
  const source = fs.readFileSync(file, 'utf8');
  const re = /\/images\/[a-zA-Z0-9._-]+\.(?:png|jpg|jpeg|svg|gif|webp)/g;
  let match;
  while ((match = re.exec(source)) !== null) {
    const ref = match[0];
    if (!references.has(ref)) references.set(ref, []);
    references.get(ref).push(path.relative(ROOT, file));
  }
}

// 2. each referenced file must exist with sane size and a valid header
let totalBytes = 0;
const imageFiles = listFiles(path.join(ROOT, 'images')).filter((f) => /\.(png|jpg|jpeg|gif|webp)$/i.test(f));
const imageBytes = {};
for (const file of imageFiles) {
  const stat = fs.statSync(file);
  imageBytes[path.relative(ROOT, file)] = stat.size;
  totalBytes += stat.size;
  if (stat.size === 0) problems.push(`empty file: ${path.relative(ROOT, file)}`);
  if (stat.size > 300 * 1024) problems.push(`oversized image (>300KB): ${path.relative(ROOT, file)} (${(stat.size / 1024).toFixed(0)}KB)`);
  const fd = fs.openSync(file, 'r');
  const header = Buffer.alloc(8);
  fs.readSync(fd, header, 0, 8, 0);
  fs.closeSync(fd);
  const isJpg = header[0] === 0xff && header[1] === 0xd8;
  const isPng = header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4e && header[3] === 0x47;
  const ext = path.extname(file).toLowerCase();
  if ((ext === '.jpg' || ext === '.jpeg') && !isJpg) problems.push(`bad JPEG header: ${path.relative(ROOT, file)}`);
  if (ext === '.png' && !isPng) problems.push(`bad PNG header: ${path.relative(ROOT, file)}`);
}

// 3. every reference must resolve
for (const [ref, sources] of references) {
  const target = path.join(ROOT, ref);
  if (!fs.existsSync(target)) {
    problems.push(`MISSING ASSET ${ref} referenced by ${sources.join(', ')}`);
  }
}

// 4. known-critical sample images (web baseline + map pin)
const CRITICAL = [
  '/images/le-comptoir.jpg',  // weekly card + photo fallback
  '/images/paris-evening.jpg',// journey card + comptoir place photo
  '/images/coffee.jpg',
  '/images/japanese.jpg',
  '/images/cafe.jpg',
  '/images/jamie.jpg',
  '/images/alex.jpg',
  '/images/pin.png',          // map marker iconPath
];
for (const ref of CRITICAL) {
  if (!fs.existsSync(path.join(ROOT, ref))) problems.push(`critical asset missing: ${ref}`);
}

console.log('\n=== Asset verification —', ROOT, '===');
console.log(`  referenced local assets : ${references.size}`);
for (const [ref] of references) console.log(`    ${ref}`);
console.log(`  bundled image files     : ${imageFiles.length} (${(totalBytes / 1024).toFixed(0)} KB total)`);
for (const [file, size] of Object.entries(imageBytes)) console.log(`    ${file}  ${(size / 1024).toFixed(1)} KB`);

if (problems.length) {
  console.error('\nASSET PROBLEMS:');
  for (const p of problems) console.error('  ✗ ' + p);
  console.error('ASSET VERIFICATION FAILED');
  process.exit(1);
}
console.log('\nASSET VERIFICATION PASSED');
