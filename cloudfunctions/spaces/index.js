const cloud=require('wx-server-sdk');
const {createHandler}=require('./handler');
cloud.init({env:cloud.DYNAMIC_CURRENT_ENV});
const db=cloud.database({throwOnNotFound:false});
// Provision collections with client read/write DENIED. No runtime creation.
// Transactions are mandatory: never fall back to separate non-atomic writes.
exports.main=createHandler({context:()=>cloud.getWXContext(),repository:{
 transaction:fn=>db.runTransaction(async transaction=>fn({
  async get(collection,id){
   if(typeof id!=='string'||!id)return null;
   const result=await transaction.collection(collection).doc(id).get();return result.data||null;
  },
  async set(collection,id,value){const data={...value};delete data._id;await transaction.collection(collection).doc(id).set({data});}
 }))
}});
