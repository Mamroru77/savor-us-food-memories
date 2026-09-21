const identity=require('./identity'),records=require('./cloudRecords');
const fail=code=>{throw Object.assign(new Error(code),{code});};

async function call(action,args={},token=identity.lease()){
 identity.assertBusinessCloudAllowed();identity.assertLease(token);records.initCloud();
 const response=await wx.cloud.callFunction({name:'workspace',data:{...args,action,protocolVersion:1,expectedUserId:token.userId}});
 identity.assertLease(token);const result=response&&response.result;
 if(result&&result.code==='IDENTITY_MISMATCH'){identity.invalidate();fail('IDENTITY_MISMATCH');}
 if(!result||!result.success)fail(result&&result.code||'WORKSPACE_UNAVAILABLE');
 if(result.protocolVersion!==1)fail('UPGRADE_REQUIRED');return result;
}

module.exports={call};
