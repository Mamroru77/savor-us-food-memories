// New key deliberately does not inherit consent from the misleading old merchant-search label.
// Local preference only; never changes the backend allowlist, key or kill switch.
const KEY='savor-tencent-location-search-v1';
function enabled() { try { return wx.getStorageSync(KEY)===true; } catch(e) { return false; } }
function setEnabled(value) { try { wx.setStorageSync(KEY,value===true); return true; } catch(e) { return false; } }
module.exports={enabled,setEnabled,get cloudPlaceSearchEnabled(){return enabled();},set cloudPlaceSearchEnabled(value){setEnabled(value);}};
