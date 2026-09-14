// Incremental Stage 2 schema. Identity and future membership are server-owned.
const cloudFile = /^cloud:\/\/[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/;
function text(v, n) { return typeof v === 'string' ? v.trim().slice(0, n) : ''; }
function validDate(v) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(v + 'T12:00:00Z');
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v;
}
function image(v) {
  return typeof v === 'string' && v.length <= 500 && !v.split('/').some(p => p === '..' || p === '.')
    && (cloudFile.test(v) || /^\/images\/[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp)$/.test(v) || /^https:\/\/[^\s]+$/.test(v));
}
function normalizeRecord(input, openid) {
  const list = (v, n, length) => Array.isArray(v) ? v.slice(0, n).map(x => text(x, length)).filter(Boolean) : [];
  if(input.perCapita!==undefined && input.perCapita!=='' && input.perCapita!==null && (!['number','string'].includes(typeof input.perCapita) || !Number.isFinite(Number(input.perCapita)) || Number(input.perCapita)<0 || Number(input.perCapita)>1000000)) throw new Error('INVALID_PER_CAPITA');
  const photos = input.photos || [];
  if (!Array.isArray(photos) || photos.length > 9 || !photos.every(image)) throw new Error('INVALID_PHOTOS');
  if (input.placePhoto && !image(input.placePhoto)) throw new Error('INVALID_PHOTOS');
  const record = {
    schemaVersion: 3,
    restaurantName: text(input.restaurantName, 80), date: text(input.date, 10),
    city: text(input.city, 80), country: text(input.country, 80),
    address: text(input.address, 150), neighborhood: text(input.neighborhood, 150),
    cuisine: text(input.cuisine, 30), perCapita: Math.max(0, Math.min(1000000, Number(input.perCapita) || 0)),
    dishes: list(input.dishes, 20, 30), note: text(input.note, 1500),
    tags: list(input.tags, 20, 40), photos: photos.slice(),
    shared: input.shared === true, liked: input.liked === true, saved: input.saved === true,
    createdBy: openid, memberOpenids: [openid], coupleId: ''
  };
  record.diningTypes = Array.from(new Set(list(input.diningTypes,6,20).filter(t=>['火锅','自助餐','烧烤','小吃','面馆','咖啡馆','甜品','酒馆'].includes(t))));
  record.importAddressHint=text(input.importAddressHint,150);
  record.importAreaText=text(input.importAreaText,80);
  record.platformRating=typeof input.platformRating==='number'&&Number.isFinite(input.platformRating)&&input.platformRating>=0&&input.platformRating<=5?input.platformRating:null;
  record.platformAveragePriceCny=typeof input.platformAveragePriceCny==='number'&&Number.isFinite(input.platformAveragePriceCny)&&input.platformAveragePriceCny>=0&&input.platformAveragePriceCny<=1000000?input.platformAveragePriceCny:null;
  record.sourceCategory = text(input.sourceCategory,120);
  record.categorySource = ['share-text','tencent-poi','user-confirmed'].includes(input.categorySource)?input.categorySource:'';
  record.tencentPoiId = text(input.tencentPoiId,100);
  record.diningMode = ['dine-in','delivery'].includes(input.diningMode) ? input.diningMode : '';
  record.sourcePlatform = ['dianping','meituan','other-delivery'].includes(input.sourcePlatform) ? input.sourcePlatform : '';
  if(!record.sourcePlatform){record.importAddressHint='';record.importAreaText='';record.platformRating=null;record.platformAveragePriceCny=null;}
  const source = text(input.sourceUrl, 300);
  record.sourceUrl = /^https:\/\/(m\.dianping\.com\/shopinfo\/[A-Za-z0-9]+|dpurl\.cn\/[A-Za-z0-9]+)$/.test(source) ? source : '';
  if (!record.restaurantName) throw new Error('RESTAURANT_REQUIRED');
  if (!validDate(record.date)) throw new Error('INVALID_DATE');
  if (input.rating !== undefined) {
    if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) throw new Error('INVALID_RATING');
    record.rating = input.rating;
  }
  // Only retain explicitly supplied individual scores; do not invent votes.
  record.ratings = {};
  ['lajiChong', 'xiaoXiaoQi'].forEach(k => {
    if (input.ratings && input.ratings[k] !== undefined) {
      const v = Number(input.ratings[k]);
      if (!Number.isFinite(v) || v < 0 || v > 5) throw new Error('INVALID_RATING');
      record.ratings[k] = v;
    }
  });
  if (input.coordinates !== undefined) {
    const c = input.coordinates;
    if (!Array.isArray(c) || c.length !== 2 || !c.every(Number.isFinite) || Math.abs(c[0]) > 90 || Math.abs(c[1]) > 180) throw new Error('INVALID_COORDINATES');
    record.coordinates = c.slice();
  }
  if (input.locationSource !== undefined) Object.assign(record, normalizeLocation(input));
  if (input.placePhoto) record.placePhoto = input.placePhoto;
  return record;
}
function normalizeLocation(input) {
  const c = input.coordinates;
  if (!['tencent-picker','tencent-search'].includes(input.locationSource) || (input.locationSource==='tencent-search' && !text(input.tencentPoiId,100)) || input.coordinateSystem !== 'gcj02'
    || !Array.isArray(c) || c.length !== 2 || !c.every(Number.isFinite)
    || Math.abs(c[0]) > 90 || Math.abs(c[1]) > 180) throw new Error('INVALID_LOCATION');
  return { coordinates: c.slice(), address: text(input.address, 150), locationName: text(input.locationName, 80), locationSource: input.locationSource, tencentPoiId:input.locationSource==='tencent-search'?text(input.tencentPoiId,100):'', coordinateSystem: 'gcj02', city: input.geoConfirmed === true ? text(input.city,80) : '', country: input.geoConfirmed === true ? text(input.country,80) : '', geoConfirmed: input.geoConfirmed === true && !!text(input.city,80) && !!text(input.country,80), geoSource: input.geoConfirmed === true ? (input.geoSource === 'address-parser' ? 'address-parser' : 'user-confirmed') : 'unknown' };
}
module.exports = { normalizeRecord, normalizeLocation };
