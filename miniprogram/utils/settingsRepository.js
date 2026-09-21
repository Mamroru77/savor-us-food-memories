const data = require('./data');

const DEVICE_KEYS = ['theme', 'language', 'reduceMotion'];
const language = value => ['system', 'zh-CN', 'en'].includes(value) ? value : 'system';

function normalize(saved) {
  const value = Object.assign({}, data.defaultSettings, saved && typeof saved === 'object' ? saved : {});
  if (value.theme !== 'dusk') value.theme = 'pearl';
  value.language = language(value.language);
  return value;
}

function merge(current, changes) {
  const value = Object.assign({}, current, changes);
  value.language = language(value.language);
  return value;
}

function requiresLease(changes) {
  return Object.keys(changes).some(key => !DEVICE_KEYS.includes(key));
}

module.exports = { normalize, merge, requiresLease };
