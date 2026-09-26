const data = require('./data');
const diningTypeOptions = require('./diningTypeOptions');

const DEVICE_KEYS = ['theme', 'language', 'reduceMotion'];
const language = value => ['system', 'zh-CN', 'en'].includes(value) ? value : 'system';

// Resident dining types live in the owner's settings partition (never the device-level key), so they
// are per-owner durable. Present values are re-normalised on every load and every merge, so a
// malformed persisted value can never reach the picker. A key that is absent stays absent: merge
// only ever preserves and cleans what it was given, and normalize adds the defaults.
function withDiningTypes(value) {
  if ('customDiningTypes' in value) value.customDiningTypes = diningTypeOptions.normalizeCustom(value.customDiningTypes);
  if ('hiddenDiningTypes' in value) value.hiddenDiningTypes = diningTypeOptions.normalizeHidden(value.hiddenDiningTypes);
  return value;
}

function normalize(saved) {
  const value = Object.assign({}, data.defaultSettings, saved && typeof saved === 'object' ? saved : {});
  if (value.theme !== 'dusk') value.theme = 'pearl';
  value.language = language(value.language);
  return withDiningTypes(value);
}

function merge(current, changes) {
  const value = Object.assign({}, current, changes);
  value.language = language(value.language);
  return withDiningTypes(value);
}

function requiresLease(changes) {
  return Object.keys(changes).some(key => !DEVICE_KEYS.includes(key));
}

module.exports = { normalize, merge, requiresLease };
