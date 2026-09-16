'use strict';
const assert=require('assert'),path=require('path'),fs=require('fs'),vm=require('vm');
let networkAttempts=0;const block=()=>{networkAttempts++;throw Error('NETWORK_FORBIDDEN');};require('http').request=block;require('https').request=block;require('net').Socket.prototype.connect=block;
const sdkRoot=path.resolve(process.env.ACCOUNT_SDK_ROOT||'cloudfunctions/account/node_modules');
const cloud=require(path.join(sdkRoot,'wx-server-sdk'));process.env.TCB_ENV='synthetic-env';cloud.init({env:'synthetic-env'});let checks=0;
(async()=>{for(const name of ['spaces','media','workspace']){
 let deps,reply;const sdk={DYNAMIC_CURRENT_ENV:cloud.DYNAMIC_CURRENT_ENV,init(){},getWXContext(){return{};},database(options){assert.equal(options.throwOnNotFound,false);const db=cloud.database(options);db._db.runTransaction=async callback=>callback({collection(){return {doc(){return {get:async()=>reply,set:async()=>({updated:1})};}};}});return db;}};
 const file=path.resolve('cloudfunctions',name,'index.js');vm.runInNewContext(fs.readFileSync(file,'utf8'),{exports:{},require:n=>n==='wx-server-sdk'?sdk:n==='./handler'?{createHandler:d=>{deps=d;return()=>{};}}:require(n),process:{env:{}},URL,Buffer,setTimeout,clearTimeout});
 reply={data:null};assert.equal(await deps.repository.transaction(tx=>tx.get('synthetic','missing')),null);checks++;
 reply={data:{_id:'synthetic',value:3}};assert.equal((await deps.repository.transaction(tx=>tx.get('synthetic','present'))).value,3);checks++;
 for(const [code,errCode]of [['DATABASE_COLLECTION_NOT_EXIST',-502005],['DATABASE_COLLECTION_EXCEED_LIMIT',-502004],['DATABASE_PERMISSION_DENIED',-502003],['INVALID_PARAM',-501007]]){reply={code,message:'document.get: collection does not exist'};await assert.rejects(()=>deps.repository.transaction(tx=>tx.get('synthetic','id')),e=>e.errCode===errCode);checks++;}
 console.log('PASS '+name+': actual SDK transaction wrapper treats only successful empty results as null; four platform errors propagate');
 }assert.equal(networkAttempts,0);console.log(JSON.stringify({checks,networkAttempts,level:'Actual wx SDK transaction wrapper; lower transaction transport intercepted, NOT live CloudBase transactions'}));})().catch(e=>{console.error(e);process.exitCode=1;});
