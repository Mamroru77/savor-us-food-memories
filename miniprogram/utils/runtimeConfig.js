// Build-time policy, never sourced from storage or a server response.
// Normal mode enabled for the authorized map/save repair. Account boundaries remain mandatory.
const appId = 'wx65867b5568b82996';
const cloudEnv = 'cloud1-d9gqm52id66c0bcda';
module.exports = Object.freeze({
  identityMode: 'normal', // Only explicit 'normal' permits ordinary business traffic.
  appId,
  cloudEnv,
  storageNamespace: appId + ':' + cloudEnv,
  fileScope: appId+':'+cloudEnv === 'wx65867b5568b82996:cloud1-d9gqm52id66c0bcda' ? '' : encodeURIComponent(appId+':'+cloudEnv)+'/',
  // The unscoped v1 cache belongs ONLY to this historical deployment.
  legacyNamespace: 'wx65867b5568b82996:cloud1-d9gqm52id66c0bcda'
});
