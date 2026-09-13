// Pure view-copy helpers. Never translate user-authored values or write records.
const defaults = {
  "home": {
    "title": "the moment.",
    "subtitle": "Collect beautiful meals and the memories that come with them.",
    "brand": "Savor"
  },
  "map": {
    "title": "Map First",
    "subtitle": "Explore where memories live."
  },
  "add": {
    "title": "Add a Memory",
    "subtitle": "Capture the flavor. Keep the feeling."
  },
  "us": {
    "title": "Us",
    "subtitle": "Our space. Our memories."
  }
};
const pages = ['home', 'map', 'add', 'us'];
function clean(value, max) {
  return typeof value === 'string' ? Array.from(value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim()).slice(0, max).join('') : '';
}
function normalize(value) {
  const result = {};
  pages.forEach(page => {
    const item = value && value[page] || {};
    result[page] = { title: clean(item.title, 24), subtitle: clean(item.subtitle, 55) };
    if (page === 'home') result[page].brand = clean(item.brand, 20);
  });
  return result;
}
function resolve(state, page, translate) {
  const base = defaults[page];
  if (!base) return {};
  const custom = normalize(state.settings.pageHeadings)[page];
  const result = {};
  Object.keys(base).forEach(field => { result[field] = custom[field] || translate(base[field]); });
  return result;
}
module.exports = { defaults, pages, clean, normalize, resolve };
