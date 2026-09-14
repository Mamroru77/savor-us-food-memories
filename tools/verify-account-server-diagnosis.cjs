const assert=require('node:assert/strict');
const {createHandler}=require('../cloudfunctions/account/handler');
const valid='u_'+'a'.repeat(48),winner={userId:'u_'+'b'.repeat(48),profileRevision:2,membershipVersion:3};
function make(repository,options={}){
  const logs=[];
  const handler=createHandler({context:options.context||(()=>({OPENID:'owner-secret',APPID:'app-secret'})),repository,
    randomId:options.randomId||(()=> 'a'.repeat(48)),now:options.now||(()=>123),diagnosticLog:entry=>logs.push(entry)});
  return {handler,logs};
}
function safe(run,res,secret='raw-secret'){
  const text=JSON.stringify({logs:run.logs,res});
  assert(!text.includes(secret));assert(!text.includes('owner-secret'));assert(!text.includes('app-secret'));
  for(const log of run.logs)assert.deepEqual(Object.keys(log),['event','stage','sdkCode','category','type','elapsedMs']);
}
async function main(){
  {
    let inserts=0;const error=Object.assign(new Error('raw-secret'),{errCode:-502003,document:{secret:'raw-secret'}});
    const run=make({find:async()=>{throw error;},insert:async()=>{inserts++;}}),res=await run.handler({action:'bootstrap',protocolVersion:1});
    assert.equal(res.code,'ACCOUNT_UNAVAILABLE');assert.equal(inserts,0);assert.deepEqual(run.logs.map(x=>[x.stage,x.sdkCode,x.category]),[['account-find','DATABASE_PERMISSION_DENIED','permission']]);safe(run,res);
  }
  {
    const run=make({find:async()=>null,insert:async()=>assert.fail('inserted')},{randomId:()=>{throw new TypeError('raw-secret');}}),res=await run.handler({action:'bootstrap',protocolVersion:1});
    assert.equal(res.code,'ACCOUNT_UNAVAILABLE');assert.equal(run.logs[0].stage,'account-build');assert.equal(run.logs[0].type,'TypeError');safe(run,res);
  }
  {
    let reads=0;const run=make({find:async()=>{reads++;},insert:async()=>{}},{context:()=>({OPENID:'owner-secret',APPID:1n})}),res=await run.handler({action:'bootstrap',protocolVersion:1});
    assert.equal(res.code,'ACCOUNT_UNAVAILABLE');assert.equal(reads,0);assert.equal(run.logs[0].stage,'account-build');safe(run,res);
  }
  {
    let reads=0;const run=make({find:async()=>++reads===1?null:winner,insert:async()=>{throw Object.assign(new Error('raw-secret'),{code:'DUPLICATE_KEY'});}}),res=await run.handler({action:'bootstrap',protocolVersion:1});
    assert.equal(res.success,true);assert.equal(res.userId,winner.userId);assert.deepEqual(run.logs.map(x=>[x.stage,x.category]),[['account-insert','duplicate']]);safe(run,res);
  }
  {
    const run=make({find:async()=>null,insert:async()=>{throw new Error('raw-secret');}}),res=await run.handler({action:'bootstrap',protocolVersion:1});
    assert.equal(res.code,'ACCOUNT_UNAVAILABLE');assert.deepEqual(run.logs.map(x=>[x.stage,x.category]),[['account-insert','unknown'],['account-reread','not-found']]);safe(run,res);
  }
  {
    let reads=0;const timeout=Object.assign(new Error('raw-secret'),{errCode:-501002});
    const run=make({find:async()=>{if(++reads===1)return null;throw timeout;},insert:async()=>{throw new Error('raw-secret');}}),res=await run.handler({action:'bootstrap',protocolVersion:1});
    assert.equal(res.code,'ACCOUNT_UNAVAILABLE');assert.deepEqual(run.logs.map(x=>[x.stage,x.sdkCode]),[['account-insert','UNKNOWN'],['account-reread','SERVER_TIMEOUT']]);safe(run,res);
  }
  {
    const legal=make({find:async()=>({userId:valid,profileRevision:0,membershipVersion:0}),insert:async()=>{}}),ok=await legal.handler({action:'bootstrap',protocolVersion:1});
    assert.equal(ok.success,true);assert.equal(legal.logs.length,0);
    const invalid=make({find:async()=>({userId:'bad'}),insert:async()=>{}}),bad=await invalid.handler({action:'bootstrap',protocolVersion:1});
    assert.equal(bad.code,'ACCOUNT_INVALID');assert.equal(invalid.logs.length,0);
    let calls=0;const denied=make({find:async()=>{calls++;},insert:async()=>{calls++;}},{context:()=>({OPENID:'',APPID:'app'})});
    assert.equal((await denied.handler({action:'bootstrap',protocolVersion:1})).code,'IDENTITY_UNAVAILABLE');assert.equal((await denied.handler({action:'bootstrap',protocolVersion:2})).code,'UNSUPPORTED_PROTOCOL');assert.equal(calls,0);
  }
  {
    const account={get userId(){throw Object.assign(new RangeError('raw-secret'),{code:'NOT_WHITELISTED',token:'raw-secret'});}};
    const run=make({find:async()=>account,insert:async()=>{}}),res=await run.handler({action:'bootstrap',protocolVersion:1});
    assert.equal(res.code,'ACCOUNT_UNAVAILABLE');assert.deepEqual(run.logs.map(x=>[x.stage,x.sdkCode,x.type]),[['account-result-check','UNKNOWN','RangeError']]);safe(run,res);
  }
  console.log('PASS account server diagnosis: safe stages, SDK classification, winner reread, unchanged protocol, and no sensitive logs.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
