const identity=require('./identity'),data=require('./data'),config=require('./runtimeConfig');

function directory(token){identity.assertLease(token);const path=wx.env.USER_DATA_PATH+'/savor-workspace/'+config.fileScope+token.userId;try{wx.getFileSystemManager().accessSync(path);}catch(error){wx.getFileSystemManager().mkdirSync(path,true);}return path;}
function writeFile(contents,suffix='json',token=identity.lease()){const path=directory(token)+'/savor-'+Date.now()+'-'+data.createId()+'.'+suffix;wx.getFileSystemManager().writeFileSync(path,contents,'utf8');identity.assertLease(token);return path;}

module.exports={directory,writeFile};
