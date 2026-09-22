const data=require('./data');

const PREFERENCES=['dietary','cuisines','privateByDefault','showLocations','reminders'];
const ASSET_SOURCES=['chooseAvatar','album','camera','cloud','legacy'];
const SYNC_STATES=['local','pending','synced','failed'];
const has=(value,key)=>Object.prototype.hasOwnProperty.call(value,key);

function legacyAsset(localPath){
 return localPath?{formatVersion:1,localPath,digest:null,mime:null,width:null,height:null,source:'legacy',syncState:'local',remoteRef:null}:null;
}

function cleanAsset(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||value.formatVersion!==1||!data.isSafeImage(value.localPath))return null;
 return {
  formatVersion:1,
  localPath:value.localPath,
  digest:typeof value.digest==='string'&&/^[a-f0-9]{64}$/.test(value.digest)?value.digest:null,
  mime:['image/jpeg','image/png','image/gif','image/webp'].includes(value.mime)?value.mime:null,
  width:Number.isFinite(value.width)&&value.width>0?value.width:null,
  height:Number.isFinite(value.height)&&value.height>0?value.height:null,
  source:ASSET_SOURCES.includes(value.source)?value.source:'legacy',
  syncState:SYNC_STATES.includes(value.syncState)?value.syncState:'local',
  remoteRef:typeof value.remoteRef==='string'?value.remoteRef:null,
 };
}

function migrate(value,defaults){
 const original=value&&typeof value==='object'&&!Array.isArray(value)?value:{};
 const profile={...defaults,...original};
 const path=typeof profile.avatar==='string'&&data.isSafeImage(profile.avatar)?profile.avatar:'';
 const asset=cleanAsset(profile.avatarAsset);
 profile.avatarAsset=asset&&asset.localPath===path?asset:legacyAsset(path);
 profile.avatar=profile.avatarAsset?profile.avatarAsset.localPath:'';
 return {profile,changed:JSON.stringify(profile)!==JSON.stringify(original)};
}

function save(state,changes){
 const profile={...state.profile,...changes};
 if(has(changes,'avatarAsset')){
  const asset=cleanAsset(changes.avatarAsset);
  profile.avatarAsset=asset;
  profile.avatar=asset?asset.localPath:'';
 }
 return {...state,schemaVersion:2,profile:migrate(profile,data.defaultProfile).profile};
}

function payload(state){
 const p=state.profile,s=state.settings;
 return {profile:{name:p.name,bio:p.bio,avatar:null},preferences:{dietary:s.dietary,cuisines:s.cuisines.slice(),privateByDefault:s.privateByDefault,showLocations:s.showLocations,reminders:s.reminders}};
}

function applyCloud(state,profile,preferences){
 const changes={name:profile.name,bio:profile.bio};
 if(has(profile,'avatarAsset'))changes.avatarAsset=profile.avatarAsset;
 else if(profile.avatar)changes.avatar=profile.avatar;
 const next=save(state,changes),settings={...next.settings};
 PREFERENCES.forEach(key=>{if(preferences[key]!==undefined)settings[key]=key==='cuisines'?preferences[key].slice():preferences[key];});
 return {...next,settings};
}

module.exports={migrate,save,payload,applyCloud};
