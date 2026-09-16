'use strict';
const assert=require('assert');
const {createHandler}=require('../cloudfunctions/account/handler');
(async()=>{
  let count=0;
  for(const stage of ['find','insert']) for(const diagnostic of [false,true]) {
    const handler=createHandler({
      context:()=>({OPENID:'private-test-openid',APPID:'test-app'}),
      repository:{
        find:async()=>{if(stage==='find')throw Object.assign(Error('private-exception-text'),{errCode:-502005});return null;},
        insert:async()=>{throw Object.assign(Error('private-exception-text'),{errCode:-501007});}
      },diagnosticLog:()=>{}
    });
    const result=await handler({action:'bootstrap',protocolVersion:1,diagnostic});
    assert.equal(result.code,'ACCOUNT_UNAVAILABLE');
    assert.equal('diagnostics' in result,diagnostic);
    if(diagnostic){
      assert.equal(result.diagnostics[0].stage,'account-'+stage);
      for(const entry of result.diagnostics)assert.deepEqual(Object.keys(entry).sort(),['category','elapsedMs','event','sdkCode','stage','type']);
      assert(!JSON.stringify(result).includes('private-test-openid'));
      assert(!JSON.stringify(result).includes('private-exception-text'));
    } else assert.deepEqual(result,{success:false,code:'ACCOUNT_UNAVAILABLE'});
    count++;
  }
  const handler=createHandler({context:()=>({OPENID:'test',APPID:'test'}),repository:{find:async()=>({userId:'u_'+'a'.repeat(48),profileRevision:0,membershipVersion:0})}});
  const success=await handler({action:'bootstrap',protocolVersion:1,diagnostic:true});
  assert.equal(success.success,true);assert.equal('diagnostics' in success,false);count++;
  console.log(`PASS ${count} account diagnostic-response checks (L2 mock; no network).`);
})().catch(error=>{console.error(error);process.exitCode=1;});
