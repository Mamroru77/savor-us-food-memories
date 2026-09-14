const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const identityPath=require.resolve(path.join(root,'miniprogram/utils/identity'));
const partitionsPath=require.resolve(path.join(root,'miniprogram/utils/identityPartitions'));
const cloudPath=require.resolve(path.join(root,'miniprogram/utils/cloudRecords'));
const storePath=require.resolve(path.join(root,'miniprogram/utils/store'));
const validUserId='u_'+'a'.repeat(48);

function fresh(responder,{stored,initError}={}){
  [storePath,cloudPath,identityPath,partitionsPath].forEach(file=>delete require.cache[file]);
  const disk=Object.assign({},stored),calls=[];
  let networkHandler=null;
  global.wx={
    env:{USER_DATA_PATH:'/user'},
    getStorageSync:key=>disk[key],
    setStorageSync:(key,value)=>{disk[key]=value;},
    getFileSystemManager:()=>({}),
    onNetworkStatusChange:handler=>{networkHandler=handler;},
    cloud:{
      init(){},
      callFunction:async request=>{calls.push(request);return responder(request);}
    }
  };
  require.cache[cloudPath]={id:cloudPath,filename:cloudPath,loaded:true,exports:{initCloud(){if(initError)throw initError;}}};
  const identity=require(identityPath);
  identity.enableDiagnosis();
  return {identity,disk,calls,network:result=>networkHandler&&networkHandler(result)};
}

async function rejected(promise,code,stage){
  await assert.rejects(promise,error=>error.code===code&&(!stage||error.stage===stage));
}

async function main(){
  {
    const run=fresh(async request=>request.name==='account'
      ?{result:{success:true,protocolVersion:1,userId:validUserId},requestID:'account-request-123456'}
      :{result:{success:true,identityProtocol:1,userId:validUserId},requestID:'handshake-request-123456'});
    await rejected(run.identity.verify(),'DIAGNOSTIC_MODE');
    assert.equal(run.calls.length,0);
    const token=await run.identity.verify({diagnostic:true});
    assert.equal(token.userId,validUserId);
    assert.deepEqual(run.calls.map(call=>[call.name,call.data.action]),[['account','bootstrap'],['mealRecords','identityHandshake']]);
    assert.deepEqual(run.identity.diagnosticSnapshot(),{
      stage:'complete',code:'OK',at:run.identity.diagnosticSnapshot().at,elapsedMs:run.identity.diagnosticSnapshot().elapsedMs,
      identityMatch:true,requestId:'handsh…3456',calls:{account:1,handshake:1}
    });
    await rejected(run.identity.verify({diagnostic:true}),'DIAGNOSTIC_ALREADY_ATTEMPTED');
    assert.equal(run.calls.length,2);

    delete require.cache[cloudPath];
    const service=require(cloudPath),store=require(storePath);
    await rejected(store.syncCloud(),'DIAGNOSTIC_MODE');
    await rejected(store.flushOutbox(),'DIAGNOSTIC_MODE');
    await rejected(store.refreshCloudReadOnly(),'DIAGNOSTIC_MODE');
    await rejected(service.listRecords(),'DIAGNOSTIC_MODE');
    store.get();run.network({isConnected:true});await new Promise(setImmediate);
    assert.equal(run.calls.length,2);
  }
  {
    const run=fresh(async()=>({result:{success:false,code:'ACCOUNT_UNAVAILABLE'},requestID:'account-request-abcdef'}));
    await rejected(run.identity.verify({diagnostic:true}),'ACCOUNT_UNAVAILABLE','account-response');
    assert.equal(run.calls.length,1);
    assert.equal(run.identity.diagnosticSnapshot().requestId,'accoun…cdef');
  }
  {
    const run=fresh(async request=>request.name==='account'
      ?{result:{success:true,protocolVersion:1,userId:validUserId}}
      :{result:{success:false,code:'IDENTITY_MISMATCH'}});
    await rejected(run.identity.verify({diagnostic:true}),'IDENTITY_MISMATCH','handshake-response');
    assert.equal(run.identity.diagnosticSnapshot().identityMatch,false);
    assert.equal(run.calls.length,2);
  }
  {
    const secret='OPENID=private userId='+validUserId;
    const run=fresh(async request=>{if(request.name==='account')return {result:{success:true,protocolVersion:1,userId:validUserId}};throw new Error(secret);});
    await rejected(run.identity.verify({diagnostic:true}),'HANDSHAKE_TRANSPORT_FAILED','handshake-transport');
    assert(!run.identity.diagnosticMessage(new Error(secret)).includes(secret));
    assert(!JSON.stringify(run.identity.diagnosticSnapshot()).includes(validUserId));
  }
  {
    const run=fresh(async()=>({result:{success:false,code:'OPENID_private_secret'}}));
    await rejected(run.identity.verify({diagnostic:true}),'ACCOUNT_RESPONSE_INVALID','account-response');
    assert(!run.identity.diagnosticMessage().includes('private'));
  }
  {
    const corrupt={'savor-identity-partitions-v1':'{'};
    const run=fresh(async request=>request.name==='account'
      ?{result:{success:true,protocolVersion:1,userId:validUserId}}
      :{result:{success:true,identityProtocol:1,userId:validUserId}},{stored:corrupt});
    await rejected(run.identity.verify({diagnostic:true}),'CACHE_CORRUPT','partition-accept');
    assert.equal(run.calls.length,2);
  }
  {
    const problem=Object.assign(new Error('secret init text'),{code:'INIT_FAILED'});
    const run=fresh(async()=>{throw new Error('must not call');},{initError:problem});
    await rejected(run.identity.verify({diagnostic:true}),'INIT_FAILED','cloud-init');
    assert.equal(run.calls.length,0);
    assert(!run.identity.diagnosticMessage().includes('secret'));
  }
  const appSource=fs.readFileSync(path.join(root,'miniprogram/app.js'),'utf8');
  const storeSource=fs.readFileSync(path.join(root,'miniprogram/utils/store.js'),'utf8');
  assert(appSource.indexOf('enableDiagnosis()')<appSource.indexOf("require('./utils/store')"));
  assert(storeSource.includes('onNetworkStatusChange')&&storeSource.includes('identity.verify().then(()=>syncCloud())'));
  console.log('PASS identity diagnosis: staged safe codes, one-shot account/handshake, automatic verify and all diary sync boundaries blocked, no sensitive output.');
}

main().catch(error=>{console.error(error);process.exitCode=1;});
