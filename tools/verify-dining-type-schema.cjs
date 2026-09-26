// Server-side diningTypes validation. Both cloud schemas must accept built-ins AND user-created
// names, ignore malformed values instead of truncating them, and stay behaviourally identical.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const MEAL = require(path.join(root, 'cloudfunctions/mealRecords/schema.js'));
const WORK = require(path.join(root, 'cloudfunctions/workspace/schema.js'));
const BUILTINS = ['火锅', '自助餐', '烧烤', '小吃', '面馆', '咖啡馆', '甜品', '酒馆'];
let passed = 0;
const cases = [];
const test = (name, fn) => cases.push({ name, fn });

// A minimal record that passes every unrelated validator, so only diningTypes varies.
const base = () => ({ restaurantName: 'Test Diner', date: '2026-09-26', photos: [], city: '', country: '', neighborhood: '', cuisine: '', dishes: [], tags: [], note: '' });
const normalized = (schema, diningTypes) => Array.from(schema.normalizeRecord(Object.assign(base(), { diningTypes }), 'owner-A').diningTypes);

test('A. mealRecords keeps a builtin and a custom name together', () => {
  assert.deepEqual(normalized(MEAL, ['酒馆', '测试']), ['酒馆', '测试']);
});

test('B. workspace keeps a builtin and a custom name together', () => {
  assert.deepEqual(normalized(WORK, ['酒馆', '测试']), ['酒馆', '测试']);
});

test('C. every builtin still passes unchanged (no regression)', () => {
  for (const schema of [MEAL, WORK]) {
    // The picker caps a memory at six types, so compare a full-length builtin selection.
    assert.deepEqual(normalized(schema, BUILTINS.slice(0, 6)), BUILTINS.slice(0, 6));
    assert.deepEqual(normalized(schema, ['火锅']), ['火锅']);
    assert.deepEqual(normalized(schema, ['酒馆']), ['酒馆']);
    assert.deepEqual(normalized(schema, ['火锅', '烧烤']), ['火锅', '烧烤']);
    assert.deepEqual(normalized(schema, ['甜品', '酒馆']), ['甜品', '酒馆']);
  }
});

test('D. a custom-only record keeps its custom name', () => {
  for (const schema of [MEAL, WORK]) {
    assert.deepEqual(normalized(schema, ['日料']), ['日料']);
    assert.deepEqual(normalized(schema, [' 自定义店型 ']), ['自定义店型']);
  }
});

test('E. duplicates are deduped after trimming', () => {
  for (const schema of [MEAL, WORK]) {
    assert.deepEqual(normalized(schema, ['测试', '测试']), ['测试']);
    assert.deepEqual(normalized(schema, ['日料', ' 日料 ', '日料']), ['日料']);
    assert.deepEqual(normalized(schema, ['酒馆', '酒馆', '测试']), ['酒馆', '测试']);
  }
});

test('F. malformed values are ignored, never coerced or truncated', () => {
  for (const schema of [MEAL, WORK]) {
    assert.deepEqual(normalized(schema, [null, 123, '', '   ', 'x'.repeat(21), {}, [], undefined, true]), []);
    assert.deepEqual(normalized(schema, ['测试', null, 123, '', '   ', 'x'.repeat(21)]), ['测试']);
  }
});

test('G. the 20 character boundary is accepted whole and 21 is not truncated', () => {
  for (const schema of [MEAL, WORK]) {
    const exact = 'x'.repeat(20);
    assert.deepEqual(normalized(schema, [exact]), [exact]);
    assert.deepEqual(normalized(schema, ['x'.repeat(21)]), [], '21 chars must be ignored, not cut to 20');
  }
});

test('H. at most six entries survive', () => {
  for (const schema of [MEAL, WORK]) {
    const many = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8'];
    assert.deepEqual(normalized(schema, many), ['a1', 'a2', 'a3', 'a4', 'a5', 'a6']);
  }
});

test('I. a non-array diningTypes value yields no dining types', () => {
  for (const schema of [MEAL, WORK]) {
    assert.deepEqual(normalized(schema, '测试'), []);
    assert.deepEqual(normalized(schema, null), []);
    assert.deepEqual(normalized(schema, undefined), []);
    assert.deepEqual(normalized(schema, { 0: '测试' }), []);
  }
});

test('J. the two schemas agree on every input, so one can never re-drop what the other kept', () => {
  const inputs = [
    ['酒馆', '测试'], ['日料'], [' 自定义店型 '], ['测试', '测试'], ['酒馆', '酒馆', '测试'],
    [null, 123, '', '   ', 'x'.repeat(21), {}, []], ['x'.repeat(20)], ['x'.repeat(21)],
    ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7'], '测试', null, undefined, [], BUILTINS,
  ];
  for (const input of inputs) {
    assert.deepEqual(normalized(WORK, input), normalized(MEAL, input), 'schemas disagree on ' + JSON.stringify(input));
  }
});

test('K. neither schema still filters against the builtin whitelist', () => {
  for (const rel of ['cloudfunctions/mealRecords/schema.js', 'cloudfunctions/workspace/schema.js']) {
    const source = fs.readFileSync(path.join(root, rel), 'utf8');
    assert(!source.includes("'火锅','自助餐','烧烤'"), rel + ' still hard-codes the builtin allowlist');
    assert(!/diningTypes[\s\S]{0,200}includes\(t\)/.test(source), rel + ' still filters dining types by membership');
    assert(source.includes('function diningType('), rel + ' must own a strict dining-type normalizer');
    assert(source.includes('value.slice(0, DINING_TYPE_COUNT)'), rel + ' must cap the count');
  }
});

test('L. the generic text() helper is untouched, so other fields keep their own rules', () => {
  for (const rel of ['cloudfunctions/mealRecords/schema.js', 'cloudfunctions/workspace/schema.js']) {
    const source = fs.readFileSync(path.join(root, rel), 'utf8');
    assert(source.includes("function text(v, n) { return typeof v === 'string' ? v.trim().slice(0, n) : ''; }"),
      rel + ': the shared text() helper must keep its existing behaviour');
  }
});

test('M. the local-only dining settings never enter cloud preferences or a record', () => {
  const profile = fs.readFileSync(path.join(root, 'miniprogram/utils/profileRepository.js'), 'utf8');
  const declared = /const PREFERENCES=\[([^\]]*)\]/.exec(profile);
  assert(declared, 'PREFERENCES must stay declared in profileRepository');
  const keys = declared[1].split(',').map(part => part.trim().replace(/^'|'$/g, '')).filter(Boolean);
  assert.deepEqual(keys, ['dietary', 'cuisines', 'privateByDefault', 'showLocations', 'reminders'],
    'customDiningTypes / hiddenDiningTypes must stay local-only');
  for (const rel of ['cloudfunctions/mealRecords/schema.js', 'cloudfunctions/workspace/schema.js']) {
    const source = fs.readFileSync(path.join(root, rel), 'utf8');
    assert(!source.includes('customDiningTypes') && !source.includes('hiddenDiningTypes'),
      rel + ' must not accept the local-only settings');
  }
  const record = MEAL.normalizeRecord(Object.assign(base(), { diningTypes: ['测试'], customDiningTypes: ['日料'], hiddenDiningTypes: ['酒馆'] }), 'owner-A');
  assert(!('customDiningTypes' in record) && !('hiddenDiningTypes' in record), 'a stored record must not carry them');
});

(async () => {
  for (const entry of cases) {
    try { await entry.fn(); passed++; console.log('PASS ' + entry.name); }
    catch (error) { console.error('FAIL ' + entry.name); console.error('  ' + (error && error.message || error)); process.exitCode = 1; }
  }
  console.log(passed + '/' + cases.length + ' cloud dining-type schema checks passed.');
})();
