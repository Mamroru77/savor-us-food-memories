const PREFERENCES=['dietary','cuisines','privateByDefault','showLocations','reminders'];

function save(state,changes){
 return {...state,profile:{...state.profile,...changes}};
}

function payload(state){
 const p=state.profile,s=state.settings;
 return {profile:{name:p.name,bio:p.bio,avatar:null},preferences:{dietary:s.dietary,cuisines:s.cuisines.slice(),privateByDefault:s.privateByDefault,showLocations:s.showLocations,reminders:s.reminders}};
}

function applyCloud(state,profile,preferences){
 const nextProfile={...state.profile,name:profile.name,bio:profile.bio};
 if(profile.avatar)nextProfile.avatar=profile.avatar;
 const settings={...state.settings};
 PREFERENCES.forEach(key=>{if(preferences[key]!==undefined)settings[key]=key==='cuisines'?preferences[key].slice():preferences[key];});
 return {...state,profile:nextProfile,settings};
}

module.exports={save,payload,applyCloud};
