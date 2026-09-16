const cloud=require('wx-server-sdk'),https=require('https');
const {createHandler}=require('./handler');
cloud.init({env:cloud.DYNAMIC_CURRENT_ENV});const db=cloud.database({throwOnNotFound:false}),env=process.env;
let endpoint=null;try{const u=new URL(env.FEEDBACK_WEBHOOK_URL||'');if(u.protocol==='https:'&&!u.username&&!u.password)endpoint=u;}catch(e){}
// Release policy: no reminders or external feedback; credentials alone cannot enable delivery.
const config={remindersDisabled:true,feedbackMode:'cloud_only',templateId:env.REMINDER_TEMPLATE_ID||'',thingKey:env.REMINDER_THING_KEY||'',timeKey:env.REMINDER_TIME_KEY||'',feedbackReady:!!(endpoint&&env.FEEDBACK_WEBHOOK_TOKEN),feedbackIdempotent:env.FEEDBACK_IDEMPOTENT==='true',workerSecret:env.WORKSPACE_WORKER_SECRET||'',adminOpenids:(env.WORKSPACE_ADMIN_OPENIDS||'').split(',').map(s=>s.trim()).filter(Boolean)};
const repository={
 transaction:fn=>db.runTransaction(async tx=>fn({
  async get(c,id){return (await tx.collection(c).doc(id).get()).data||null;},
  async set(c,id,value){const data={...value};delete data._id;await tx.collection(c).doc(id).set({data});}
 })),
 async list(c,ownerUserId,cursor,limit){return (await db.collection(c).where({ownerUserId,_id:db.command.gt(cursor)}).orderBy('_id','asc').limit(limit).get()).data;},
 async dueJobs(time,limit){return (await db.collection('savor_delivery_jobs').where({state:db.command.in(['queued','blocked_config','sending']),nextAttemptAt:db.command.lte(time)}).orderBy('nextAttemptAt','asc').limit(limit).get()).data;}
};
function deadline(promise){let timer;return Promise.race([promise,new Promise((resolve,reject)=>{timer=setTimeout(()=>reject(new Error('TRANSPORT_TIMEOUT')),10000);})]).finally(()=>clearTimeout(timer));}
const transport={
 async reminder(j){
  const date=new Date(j.dueAt-j.timezoneOffset*60000).toISOString().slice(0,16).replace('T',' ');
  try{const r=await deadline(cloud.openapi.subscribeMessage.send({touser:j.toOpenid,templateId:j.templateId,page:'pages/home/index',miniprogramState:env.REMINDER_MINIPROGRAM_STATE||'formal',lang:'zh_CN',data:{[config.thingKey]:{value:Array.from(j.title).slice(0,20).join('')},[config.timeKey]:{value:date}}}));
   if(r&&r.errCode===0)return {accepted:true,id:r.msgid||''};throw Object.assign(new Error('PROVIDER_REJECTED'),{definitive:!!(r&&Number.isInteger(r.errCode)&&r.errCode!==0)});
  }catch(e){if(Number.isInteger(e.errCode)&&e.errCode>0)e.definitive=true;throw e;}
 },
 feedback(j){return new Promise((resolve,reject)=>{
  // No redirects; endpoint/token are operator configuration, never caller input.
  const body=JSON.stringify({ticketId:j._id,userId:j.ownerUserId,message:j.message,contact:j.contact,createdAt:j.createdAt});
  const req=https.request(endpoint,{method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body),'Authorization':'Bearer '+env.FEEDBACK_WEBHOOK_TOKEN,'Idempotency-Key':j._id}},res=>{
   let bytes=0,body='';res.on('data',c=>{bytes+=c.length;if(bytes>16384){req.destroy(new Error('RESPONSE_TOO_LARGE'));return;}body+=c;});res.on('error',reject);
   res.on('end',()=>{try{const r=JSON.parse(body);if(res.statusCode>=200&&res.statusCode<300&&r.accepted===true&&typeof r.id==='string'&&r.id)return resolve({accepted:true,id:r.id});}catch(e){}
    // No positive acknowledgement: conservatively unknown, not falsely sent.
    reject(new Error('NO_ACK'));});
  });req.setTimeout(10000,()=>req.destroy(new Error('TIMEOUT')));req.on('error',reject);req.end(body);
 });}
};
const handle=createHandler({context:()=>cloud.getWXContext(),repository,transport,config});
exports.main=async(event={})=>{
 // SCF timer CustomArgument arrives as Message. This is routing, NOT authority:
 // handler still requires no real OPENID + constant-time server secret match.
 if(!event.action&&typeof event.Message==='string'&&event.Message.length<=4096){
  try{const body=JSON.parse(event.Message);if(body&&body.action==='worker')event={action:'worker',workerSecret:body.workerSecret};}catch(e){}
 }
 return handle(event);
};
