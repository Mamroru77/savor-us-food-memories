const cloud = require('wx-server-sdk');
const { createHandler } = require('./handler');
cloud.init({ env:cloud.DYNAMIC_CURRENT_ENV });
const collection = cloud.database().collection('savor_accounts');
// Provision the collection with client read/write denied before deployment.
// No collections or permissions are created/changed by this function.
exports.main = createHandler({ context:() => cloud.getWXContext(), repository:{
  async find(key) { const result = await collection.where({ _id:key }).limit(1).get(); return result.data[0] || null; },
  async insert(account) { await collection.add({ data:account }); }
} });
