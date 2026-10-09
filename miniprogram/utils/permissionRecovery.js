// Permission recovery. Every decision here comes from an AUTHORIZED PLATFORM SIGNAL, never from
// matching native message text.
//
// Two platform surfaces are consulted because they answer different questions:
//   wx.getSetting().authSetting[scope]      the mini-program scope decision
//                                           (undefined = never asked, true = allowed,
//                                            false = denied and no longer prompted)
//   wx.getAppAuthorizeSetting()[systemKey]  the SYSTEM decision behind it
//                                           ('authorized' | 'denied' | 'not determined' | ...)
// A denial is reported only for an explicit negative from one of them. undefined / 'not determined'
// / 'authorized' all mean "not a permanent denial", so the recovery affordance can never appear
// after a plain cancel or a transient failure.
//
// `denied()` is only ever consulted AFTER a chooser has actually failed, so it explains a real
// failure rather than predicting one. That is what keeps it free of false positives: a cancel never
// reaches it (cancels are classified separately) and a success never reaches it either.
const ACTIONS = {
  location: { scope: 'scope.userLocation', system: 'locationAuthorized' },
  // `chooseMedia`/`chooseImage` gate the camera entry through scope.camera; album access is a
  // system permission (albumAuthorized is reported on platforms that expose it). Either explicit
  // denial explains a failed picker.
  photo: { scope: 'scope.camera', system: 'cameraAuthorized', album: 'albumAuthorized' },
};

function readScopes() {
  return new Promise(function (resolve) {
    if (!wx.getSetting) return resolve({});
    wx.getSetting({
      success: function (r) { resolve((r && r.authSetting) || {}); },
      fail: function () { resolve({}); },
    });
  });
}
function readSystemAuthorization() {
  try { return (wx.getAppAuthorizeSetting && wx.getAppAuthorizeSetting()) || {}; }
  catch (e) { return {}; }
}
// Resolves true only when the platform explicitly reports a denial for this action.
function denied(action) {
  const map = ACTIONS[action];
  if (!map) return Promise.resolve(false);
  const system = readSystemAuthorization();
  if (map.system && system[map.system] === 'denied') return Promise.resolve(true);
  if (map.album && system[map.album] === 'denied') return Promise.resolve(true);
  return readScopes().then(function (auth) { return auth[map.scope] === false; });
}
// wx.openSetting has no effect without a user gesture, so this is called from a tap handler only.
function openSettings() {
  return new Promise(function (resolve) {
    if (!wx.openSetting) return resolve(false);
    wx.openSetting({
      success: function (r) { resolve(!!(r && r.authSetting)); },
      fail: function () { resolve(false); },
    });
  });
}
module.exports = { ACTIONS, denied, openSettings };
