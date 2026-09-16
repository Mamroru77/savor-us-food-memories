const cloud=require('wx-server-sdk');
const {createHandler}=require('./lookup');
cloud.init({env:cloud.DYNAMIC_CURRENT_ENV});
exports.main=createHandler({getOpenid:()=>cloud.getWXContext().OPENID,env:process.env});
