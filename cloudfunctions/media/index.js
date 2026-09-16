const cloud=require('wx-server-sdk');
const {createHandler}=require('./handler');
cloud.init({env:cloud.DYNAMIC_CURRENT_ENV});const db=cloud.database({throwOnNotFound:false});
exports.main=createHandler({context:()=>cloud.getWXContext(),policy:{
 adminOpenids:String(process.env.MEDIA_ADMIN_OPENIDS||'').split(',').map(s=>s.trim()).filter(Boolean),
 retentionDays:Number(process.env.MEDIA_RETENTION_DAYS),purgeEnabled:process.env.MEDIA_PURGE_ENABLED==='true'
},repository:{async scan(cursor,limit){let q=db.collection('savor_media_assets');if(cursor)q=q.where({_id:db.command.gt(cursor)});const r=await q.orderBy('_id','asc').limit(limit).get();return r.data||[];},transaction:fn=>db.runTransaction(async t=>fn({
 async get(c,id){if(typeof id!=='string'||!id)return null;const r=await t.collection(c).doc(id).get();return r.data||null;},
 async set(c,id,value){const data={...value};delete data._id;await t.collection(c).doc(id).set({data});}
}))},storage:{
 async upload(cloudPath,fileContent){const r=await cloud.uploadFile({cloudPath,fileContent});return r.fileID;},
 async download(fileID){const r=await cloud.downloadFile({fileID});return r.fileContent;},
 async remove(fileID){const r=await cloud.deleteFile({fileList:[fileID]});if(!r.fileList||r.fileList.length!==1||r.fileList[0].status!==0)throw new Error('DELETE_FAILED');}
}});
