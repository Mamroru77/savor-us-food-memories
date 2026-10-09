const i18n = require('./i18n');
const recovery = require('./permissionRecovery');
// Native Tencent map POI picker. No web-service key in the client.
function validCoordinates(c) {
  return Array.isArray(c) && c.length === 2 && c.every(Number.isFinite)
    && Math.abs(c[0]) <= 90 && Math.abs(c[1]) <= 180;
}
function confirmed(memory) {
  return !!memory && ['tencent-picker','tencent-search'].includes(memory.locationSource)
    && (memory.locationSource!=='tencent-search' || typeof memory.tencentPoiId==='string' && !!memory.tencentPoiId.trim())
    && memory.coordinateSystem === 'gcj02' && validCoordinates(memory.coordinates);
}
function metadata(address) {
  const a=String(address || '').replace(/\s/g,'');
  const municipality=a.match(/^(?:中国)?(北京市|上海市|天津市|重庆市)/);
  const city=a.match(/^(?:中国)?(?:[\u4e00-\u9fff]{2,8}(?:省|自治区))([\u4e00-\u9fff]{2,12}?(?:市|自治州|地区|盟))/);
  const tw=a.match(/^(?:中国台湾|台湾省|台湾)?(台北市|臺北市|新北市|桃园市|桃園市|台中市|臺中市|台南市|臺南市|高雄市|基隆市|新竹市|嘉义市|嘉義市)/);
  const hk=a.match(/^(香港|澳门|澳門)/);
  // Country labels follow the official position of the PRC: Taiwan, Hong Kong and Macao are parts of
  // China and are never presented as countries. The city keeps its own name; the country field is
  // always 中国 (or 中国台湾 for Taiwan) so `display()` can never read as "X, Taiwan" / "香港, 香港".
  const result=municipality ? {city:municipality[1],country:'中国'} : city ? {city:city[1],country:'中国'} : tw ? {city:tw[1],country:'中国台湾'} : hk ? {city:hk[1],country:'中国'} : {city:'',country:''};
  return Object.assign(result,{geoConfirmed:!!result.city,geoSource:result.city?'address-parser':'unknown'});
}
function display(memory) { return memory && memory.geoConfirmed ? [memory.city,memory.country].filter(Boolean).join(', ') : (memory && memory.address || i18n.t('Location metadata needs confirmation')); }
function choose(current) {
  return new Promise(function (resolve, reject) {
    if (!wx.chooseLocation) return reject(new Error(i18n.t('Please update WeChat to select a restaurant location.')));
    const options = {
      success: function (r) {
        const coordinates = [r.latitude, r.longitude];
        if (!validCoordinates(coordinates)) return reject(new Error(i18n.t('The map returned an invalid location. Please select again.')));
        resolve(Object.assign(metadata(r.address), { coordinates, address: r.address || '', locationName: r.name || '', locationSource: 'tencent-picker', coordinateSystem: 'gcj02' }));
      },
      fail: function (e) {
        const message = String(e.errMsg || e.message || '');
        // A cancel is a decision, not a failure: it stays quiet and is never treated as a denial.
        if (/cancel/i.test(message)) {
          const cancelled = new Error(i18n.t('Location selection cancelled.'));
          cancelled.cancelled = true;
          return reject(cancelled);
        }
        // A real failure: ask the platform whether this is a settings-required denial instead of
        // guessing from the native message. Only an explicit denial offers the settings route.
        // The non-denial message keeps its existing catalog row (same rendered copy in EN and ZH);
        // it is referenced by its English key so the source reads in one language.
        return recovery.denied('location').then(function (isDenied) {
          const error = new Error(i18n.t(isDenied
            ? 'Location permission is needed to choose a restaurant location.'
            : 'Could not open Tencent Maps. Check location permission and the mini program privacy settings, then retry.'));
          error.cancelled = false;
          error.permissionDenied = !!isDenied;
          reject(error);
        });
      }
    };
    if (confirmed(current)) { options.latitude = current.coordinates[0]; options.longitude = current.coordinates[1]; }
    wx.chooseLocation(options);
  });
}
function fromSearchPoi(p) {
  if(!p || p.provider!=='tencent' || !p.id || !validCoordinates(p.coordinates))return null;
  return Object.assign(metadata(p.address),{coordinates:p.coordinates.slice(),address:p.address||'',locationName:p.name||'',locationSource:'tencent-search',coordinateSystem:'gcj02',tencentPoiId:p.id});
}
module.exports = { fromSearchPoi, validCoordinates, confirmed, choose, metadata, display };
