const identity=require('./identity'),avatar=require('./avatar');
const client=require('./workspaceClient'),files=require('./workspaceFiles'),archive=require('./archiveService');
const fail=code=>{throw Object.assign(new Error(code),{code});};
async function chooseAvatar(){
 let token=identity.lease();const picked=await new Promise((resolve,reject)=>wx.chooseMedia({count:1,mediaType:['image'],sourceType:['album','camera'],success:resolve,fail:reject}));token=await identity.resumeNative(token);
 const src=picked.tempFiles&&picked.tempFiles[0]&&picked.tempFiles[0].tempFilePath;if(!src)fail('NO_AVATAR_SELECTED');
 return avatar.forCloud(await avatar.prepare(src,token,'album'),token);
}
module.exports={call:client.call,writeFile:files.writeFile,...archive,chooseAvatar};
