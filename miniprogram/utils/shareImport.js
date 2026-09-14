// Offline, user-initiated text parsing only. No fetch, clipboard read, geocoding or writes.
const category = require('./restaurantCategory');
const locations = require('./locations');
const SOURCES = ['dianping', 'meituan', 'other-delivery'];
function fail(code) { const e = new Error(code); e.code = code; throw e; }
function sourceUrl(value) {
  const v = String(value || '').replace(/&amp;/g, '&');
  // Keep only known restaurant/share routes, dropping tracking parameters.
  // Never resolve this URL here; arbitrary links remain plain input text only.
  const m = v.match(/^https?:\/\/(m\.dianping\.com\/shopinfo\/[A-Za-z0-9]+|dpurl\.cn\/[A-Za-z0-9]+)(?:[?#].*)?$/i);
  return m ? 'https://' + m[1] : '';
}
function parse(text, source) {
  if (!SOURCES.includes(source)) fail('SOURCE_REQUIRED');
  if (typeof text !== 'string' || !text.trim()) fail('TEXT_REQUIRED');
  if (text.length > 6000) fail('TEXT_TOO_LONG');
  const plain = text.replace(/&amp;/g, '&').replace(/\[([^\]\n]*)\]\((https?:\/\/[^\s)]+)\)/g, '$2').replace(/\r\n?/g, '\n').trim();
  const links = [...new Set(plain.match(/https?:\/\/[^\s<>\]）)]+/g) || [])];
  if (links.length > 1) fail('ONE_SHOP_ONLY');
  const names = [], namePattern = /【([^】\n]+)】|「([^」\n]+)」/g;
  let match;
  while ((match = namePattern.exec(plain))) names.push((match[1] || match[2]).trim());
  if (names.length > 1) fail('ONE_SHOP_ONLY');
  const name = names[0] || '';
  if (name.length > 70) fail('NAME_TOO_LONG');
  const url = sourceUrl(links[0]);
  if ((source !== 'dianping' && /m\.dianping\.com\//i.test(url)) || (source === 'dianping' && /美团外卖/.test(plain))) fail('SOURCE_MISMATCH');
  const lines = plain.split('\n').map(s => s.trim()).filter(Boolean);
  const priceAt = lines.findIndex(s => /^[¥￥]\s*\d+(?:\.\d+)?\s*\/\s*人$/.test(s));
  const priceMatch = priceAt >= 0 ? lines[priceAt].match(/[\d.]+/) : null;
  const ratingLine = lines.find(s => /^[★☆]+\s*\d(?:\.\d+)?$/.test(s));
  const rating = ratingLine ? Number(ratingLine.match(/\d+(?:\.\d+)?$/)[0]) : null;
  // A deliberately narrow Dianping multiline template; unknown layouts stay blank.
  const areaLine = source === 'dianping' && priceAt >= 0 ? lines[priceAt + 1] || '' : '';
  const areaMatch = areaLine.match(/^([^\s]+)\s+([^\s]+)$/);
  const addressLine = areaMatch ? lines[priceAt + 2] || '' : '';
  const address = addressLine && !/https?:\/\/|[【】「」★☆]/.test(addressLine) ? addressLine : '';
  const sourceCategory=areaMatch?areaMatch[2]:'';
  return Object.assign({
    name, address: address.slice(0, 150), areaText: areaMatch ? areaMatch[1] : '',
    cuisine: areaMatch ? areaMatch[2].slice(0, 30) : '',
    platformRating: source === 'dianping' && rating >= 0 && rating <= 5 ? rating : null,
    platformAveragePriceCny: source === 'dianping' && priceMatch && Number(priceMatch[0]) <= 1000000 ? Number(priceMatch[0]) : null,
    sourcePlatform: source, sourceUrl: url,
    diningMode: source === 'dianping' ? 'dine-in' : 'delivery',
    evidence: 'user-share-text', webVerified: false,
    categorySuggestion:category.suggestion(name)
  },category.explicit(sourceCategory,'share-text'));
}
function applyCandidate(draft, candidate) {
  if (draft.editingId || draft.editOperationId || draft.cloudAttempt) fail('DRAFT_LOCKED');
  if (!candidate || !SOURCES.includes(candidate.sourcePlatform)) fail('SOURCE_REQUIRED');
  const name = String(candidate.name || '').trim();
  if (!name || name.length > 70) fail('NAME_REQUIRED');
  return Object.assign({}, draft, {
    restaurant: name, cuisine: candidate.cuisine || '', diningTypes:(candidate.diningTypes||[]).filter(t=>category.TYPES.includes(t)), sourceCategory:candidate.sourceCategory||'', categorySource:candidate.categorySource||'',
    location: locations.confirmed(candidate.confirmedLocation)?candidate.confirmedLocation:null, city:'',country:'',date:'',
    diningMode: candidate.sourcePlatform === 'dianping' ? 'dine-in' : 'delivery',
    sourcePlatform: candidate.sourcePlatform, sourceUrl: sourceUrl(candidate.sourceUrl),
    // Draft-only hint, never coordinates or a claimed verified address.
    importAddressHint: String(candidate.address || '').slice(0, 150),
    importAreaText: String(candidate.areaText || '').slice(0,80),
    platformRating: typeof candidate.platformRating==='number'&&Number.isFinite(candidate.platformRating)&&candidate.platformRating>=0&&candidate.platformRating<=5?candidate.platformRating:null,
    platformAveragePriceCny: typeof candidate.platformAveragePriceCny==='number'&&Number.isFinite(candidate.platformAveragePriceCny)&&candidate.platformAveragePriceCny>=0&&candidate.platformAveragePriceCny<=1000000?candidate.platformAveragePriceCny:null
  });
}
function attachLocation(candidate,pick,categoryText) {
  if(!locations.confirmed(pick))fail('INVALID_LOCATION');
  const next=Object.assign({},candidate,{confirmedLocation:pick});
  if(!candidate.categorySource&&categoryText)Object.assign(next,category.explicit(categoryText,'tencent-poi'));
  return next;
}
module.exports = { parse, applyCandidate, sourceUrl, attachLocation };
