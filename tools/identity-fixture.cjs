// Known-session fixture for pre-S1 business regression suites ONLY.
// Actual cold-start/partition/identity-transition tests use the real modules.
function fixture(storage, user=()=> 'u_'+'a'.repeat(48)) {
 return {enableDiagnosis(){},assertBusinessCloudAllowed(){},markOffline(){},resumeNative:async token=>token,isCurrent:token=>!!token&&token.userId===user(),lease:()=>({userId:user(),generation:1}),assertLease(token){if(!token||token.userId!==user())throw Error('STALE_IDENTITY');},snapshot:()=>({userId:user(),generation:1,status:'verified',locked:false}),subscribe:()=>()=>{},getStorageSync:key=>storage.getStorageSync(key),setStorageSync:(k,v)=>storage.setStorageSync(k,v),deviceSettings:()=>({}),saveDeviceSettings(){},invalidate(){},quarantine:()=>({})};
}
module.exports={fixture};
