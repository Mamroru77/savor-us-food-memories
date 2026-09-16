const secondaryUI=require('../../utils/secondaryUI');
const identity=require('../../utils/identity');
const recovery=require('../../utils/legacyRecovery');
const copy=require('../../utils/identityCopy');
Page({
 onFieldFocus:secondaryUI.onFieldFocus,onFieldBlur:secondaryUI.onFieldBlur,
  data:{locked:true,shortId:'',message:'',results:[],busy:false,labels:copy()},
  onLoad(){this.off=identity.subscribe(()=>this.refresh());this.refresh();},
  onUnload(){this.disposed=true;if(this.off)this.off();},
  onShow(){secondaryUI.sync(this);},
  refresh(){
    secondaryUI.sync(this);
    const s=identity.snapshot(),labels=copy();
    this.setData({locked:s.locked,shortId:s.userId.slice(-8),results:[],message:'',busy:false,labels});
    wx.setNavigationBarTitle({title:labels.title});
  },
  showError(token,error){if(!this.disposed&&identity.isCurrent(token))this.setData({message:error.message});},
  async inspect(){
    const token=identity.lease();this.setData({busy:true,message:''});
    try{const results=await recovery.inspect();identity.assertLease(token);if(!this.disposed)this.setData({results,message:copy().report});}
    catch(e){this.showError(token,e);}
    finally{if(!this.disposed&&identity.isCurrent(token))this.setData({busy:false});}
  },
  confirm(action){
    const token=identity.lease(),labels=copy();
    wx.showModal({title:labels.confirm,content:labels.consent,success:r=>{
      try{identity.assertLease(token);if(!r.confirm||this.disposed)return;action();this.setData({message:labels.done});}
      catch(e){this.showError(token,e);}
    }});
  },
  copyProfile(){this.confirm(()=>recovery.copyProfile());},
  copyMemories(){this.confirm(()=>recovery.copyLocalMemories());},
  copyDraft(){this.confirm(()=>recovery.copyDraft());},
  exportCurrent(){this.exportBackup(false);},
  exportRaw(){this.exportBackup(true);},
  exportBackup(legacy){
    const token=identity.lease(),labels=copy();
    wx.showModal({title:labels.exportTitle,content:labels.exportConsent,success:r=>{
      try{
        identity.assertLease(token);if(!r.confirm||this.disposed)return;
        const filePath=wx.env.USER_DATA_PATH+'/savor-'+(legacy?'quarantine':'private')+'-'+Date.now()+'.json';
        const payload=legacy?recovery.rawBackup():identity.exportCurrent();
        wx.getFileSystemManager().writeFileSync(filePath,JSON.stringify(payload,null,2),'utf8');
        if(wx.shareFileMessage)wx.shareFileMessage({filePath});
        this.setData({message:labels.saved});
      }catch(e){this.showError(token,e);}
    }});
  }
});
