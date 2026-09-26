// Resident dining-type options for the Add picker.
//
// restaurantCategory.TYPES stays the canonical built-in taxonomy. "Deleting" a built-in in the UI
// only hides it from the manual picker: the taxonomy keeps the name, so historical memories still
// validate, restaurantCategory.classify() is unaffected, old drafts stay valid and the option can be
// restored later. Custom names are a separate list and never enter the taxonomy.
const category = require('./restaurantCategory');
const diningTypeText = require('./diningTypeText');

const MAX_CUSTOM = 20;
const MAX_ITEM_LENGTH = diningTypeText.MAX_ITEM_LENGTH;

function isBuiltin(name) { return category.TYPES.includes(name); }

function normalizeCustom(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of value) {
    const name = diningTypeText.normalizeStoredType(raw);
    if (!name || isBuiltin(name) || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
    if (out.length >= MAX_CUSTOM) break;
  }
  return out;
}

function normalizeHidden(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  for (const raw of value) {
    if (typeof raw !== 'string') continue;
    const name = raw.trim();
    if (!isBuiltin(name)) continue;
    seen.add(name);
  }
  // Canonical order keeps the stored value stable no matter how it was assembled.
  return category.TYPES.filter(name => seen.has(name));
}

function options(settings) {
  const source = settings && typeof settings === 'object' ? settings : {};
  const custom = normalizeCustom(source.customDiningTypes);
  const hidden = normalizeHidden(source.hiddenDiningTypes);
  const builtin = category.TYPES.filter(name => !hidden.includes(name));
  return { builtin, custom, visible: builtin.concat(custom.filter(name => !builtin.includes(name))) };
}

// Adding only makes the name resident; it never selects it on the current draft.
function addCustom(settings, raw) {
  const source = settings && typeof settings === 'object' ? settings : {};
  const custom = normalizeCustom(source.customDiningTypes);
  const name = typeof raw === 'string' ? raw.trim() : '';
  if (!name) return { ok: false, reason: 'EMPTY', custom };
  if (name.length > MAX_ITEM_LENGTH) return { ok: false, reason: 'TOO_LONG', custom };
  if (isBuiltin(name) || custom.includes(name)) return { ok: false, reason: 'DUPLICATE', custom };
  if (custom.length >= MAX_CUSTOM) return { ok: false, reason: 'LIMIT', custom };
  return { ok: true, name, custom: custom.concat([name]) };
}

function removeCustom(settings, name) {
  const source = settings && typeof settings === 'object' ? settings : {};
  return normalizeCustom(source.customDiningTypes).filter(item => item !== name);
}

function hideBuiltin(settings, name) {
  const source = settings && typeof settings === 'object' ? settings : {};
  if (!isBuiltin(name)) return normalizeHidden(source.hiddenDiningTypes);
  return normalizeHidden(source.hiddenDiningTypes.concat([name]));
}

function restoreBuiltin(settings, name) {
  const source = settings && typeof settings === 'object' ? settings : {};
  return normalizeHidden(source.hiddenDiningTypes).filter(item => item !== name);
}

module.exports = {
  MAX_CUSTOM, MAX_ITEM_LENGTH, isBuiltin,
  normalizeStoredType: diningTypeText.normalizeStoredType,
  normalizeStoredTypes: diningTypeText.normalizeStoredTypes,
  normalizeCustom, normalizeHidden, options, addCustom, removeCustom, hideBuiltin, restoreBuiltin,
};
