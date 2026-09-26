// Shared text rules for dining-type names.
//
// This is a LEAF module: it requires nothing. Both layers need the same limits, and neither may
// depend on the other:
//   - restaurantCategory (canonical taxonomy + classify + summary) must never require the settings
//     layer, and must not require diningTypeOptions (which requires restaurantCategory).
//   - diningTypeOptions (picker option lists) builds on the taxonomy.
// Keeping the rules here gives one source of truth for the length limit with no cycle and no
// dependency inversion.
const MAX_ITEM_LENGTH = 20;

// Only a non-empty, trimmed, in-limit string is a dining type. Anything else (object, number, null,
// array) and anything longer than the limit is IGNORED rather than coerced or truncated: cutting an
// over-long value down to the limit would invent a label that never existed in the stored data.
function normalizeStoredType(value) {
  if (typeof value !== 'string') return '';
  const name = value.trim();
  if (!name || name.length > MAX_ITEM_LENGTH) return '';
  return name;
}

function normalizeStoredTypes(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of value) {
    const name = normalizeStoredType(raw);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}

module.exports = { MAX_ITEM_LENGTH, normalizeStoredType, normalizeStoredTypes };
