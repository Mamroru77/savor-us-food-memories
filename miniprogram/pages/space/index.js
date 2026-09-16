const secondaryUI=require('../../utils/secondaryUI');
const identity=require('../../utils/identity'),spaces=require('../../utils/spaces'),copy=require('../../utils/spaceCopy');
const store=require('../../utils/store'),media=require('../../utils/sharedMedia'),photos=require('../../utils/photos');
Page({
 onFieldFocus:secondaryUI.onFieldFocus,onFieldBlur:secondaryUI.onFieldBlur,
 data:{locked:true,busy:false,pending:false,mediaPending:false,labels:copy(),space:null,invitation:null,wishes:[],meals:[],publishCandidates:[],message:'',inviteText:'',wishTitle:'',wishNote:'',userId:''},
 onLoad(){this._serial=0;this.off=identity.subscribe(()=>{this.clear();if(this.active&&!identity.snapshot().locked)this.refresh();});},
 onShow(){this.active=true;this.refresh();},
 onHide(){this.active=false;this.clear();},
 onUnload(){this.disposed=true;this.onHide();if(this.off)this.off();},
 clear(){media.clear();this._serial++;clearTimeout(this.timer);this._expires=0;this.setData({locked:identity.snapshot().locked,busy:false,space:null,invitation:null,wishes:[],meals:[],publishCandidates:[],inviteText:'',wishTitle:'',wishNote:'',message:'',pending:false,mediaPending:false});},
 onInvite(e){this.setData({inviteText:e.detail.value});},onTitle(e){this.setData({wishTitle:e.detail.value});},onNote(e){this.setData({wishNote:e.detail.value});},
 async refresh(){
  if(this.disposed||!this.active)return;
  secondaryUI.sync(this);
  const labels=copy();this.setData({labels,locked:identity.snapshot().locked});wx.setNavigationBarTitle({title:labels.title});
  if(identity.snapshot().locked)return;
  media.clear();
  const token=identity.lease(),serial=++this._serial;clearTimeout(this.timer);
  // No persistent shared cache. Mask expired data before any refresh starts.
  this.setData({wishes:[],meals:[],publishCandidates:[],busy:true,pending:!!identity.spaceIntent(),mediaPending:!!identity.mediaIntent()});
  try{
   const result=await spaces.load();if(!identity.isCurrent(token)||serial!==this._serial||!this.active)return;
   const members=result.space?result.space.members:[];
   const wishes=result.wishes.map(w=>({...w,preferenceLabel:members.map((m,i)=>(m.userId===token.userId?labels.mine:labels.other)+': '+(labels[w.preferences[m.userId]]||'—')).join(' · ')}));
   const meals=result.meals.map(m=>({...m,ratingLabel:members.map((p,i)=>(p.userId===token.userId?labels.mine:labels.other)+': '+(m.ratings[p.userId]||'—')).join(' · ')}));
   this._expires=result.expiresAt;this.setData({space:result.space,invitation:result.invitation||null,wishes,meals,userId:token.userId,pending:!!result.pending,mediaPending:!!identity.mediaIntent(),busy:false});
   this.timer=setTimeout(()=>{media.clear();this.setData({wishes:[],meals:[],publishCandidates:[],message:copy().expired});this.refresh();},Math.max(0,result.expiresAt-Date.now()));
  }catch(e){if(identity.isCurrent(token)&&serial===this._serial&&this.active)this.setData({space:null,invitation:null,busy:false,message:labels.error+(e.code||e.message)});}
 },
 scope(){if(!this.data.space||Date.now()>=this._expires)throw new Error('SHARED_LEASE_EXPIRED');return {spaceId:this.data.space.id,membershipVersion:this.data.space.version};},
 async perform(action,args){
  if(this.data.busy)return;const token=identity.lease();this.setData({busy:true,message:''});
  try{await spaces.submit(action,args);if(identity.isCurrent(token)&&this.active){this.setData({message:copy().saved,wishTitle:'',wishNote:''});await this.refresh();}}
  catch(e){if(identity.isCurrent(token)&&this.active)this.setData({busy:false,pending:!!identity.spaceIntent(),message:copy().error+(e.code||e.message)});}
 },
 async retry(){if(this.data.busy)return;const token=identity.lease();this.setData({busy:true});try{await spaces.retry();if(identity.isCurrent(token))await this.refresh();}catch(e){if(identity.isCurrent(token))this.setData({busy:false,pending:!!identity.spaceIntent(),message:copy().error+(e.code||e.message)});}},
 createInvite(){this.perform('createInvite',{});},
 copyInvite(){if(this.data.invitation)wx.setClipboardData({data:'savor-invite:'+this.data.invitation.token});},
 revokeInvite(){if(this.data.invitation)this.perform('revokeInvite',{token:this.data.invitation.token});},
 async acceptInvite(){
  if(this.data.busy)return;const lease=identity.lease();
  try{const token=spaces.parseToken(this.data.inviteText);await spaces.preview(token);identity.assertLease(lease);this.confirm(copy().joinConsent,()=>this.perform('acceptInvite',{token,consent:true}));}
  catch(e){if(identity.isCurrent(lease))this.setData({message:copy().error+(e.code||e.message)});}
 },
 confirm(content,fn){const token=identity.lease();wx.showModal({title:copy().confirm,content,success:r=>{if(r.confirm&&identity.isCurrent(token)&&this.active)fn();}});},
 leave(){try{const scope=this.scope();this.confirm(copy().leaveConsent,()=>this.perform('leave',{...scope,consent:true}));}catch(e){this.setData({message:e.message});}},
 addWish(){try{this.perform('addWish',{...this.scope(),title:this.data.wishTitle,note:this.data.wishNote});}catch(e){this.setData({message:e.message});}},
 preference(e){this.changeWish('wishPreference',e,{preference:e.currentTarget.dataset.value});},
 wishStatus(e){this.changeWish('wishStatus',e,{status:e.currentTarget.dataset.value});},
 changeWish(action,e,patch){try{const w=this.data.wishes.find(w=>w._id===e.currentTarget.dataset.id);if(w)this.perform(action,{...this.scope(),id:w._id,revision:w.revision,...patch});}catch(e){this.setData({message:e.message});}},
 toDraft(e){try{this.scope();const w=this.data.wishes.find(w=>w._id===e.currentTarget.dataset.id);if(!w)return;spaces.toDraft(w);store.notify(copy().draftDone);wx.switchTab({url:'/pages/add/index'});}catch(e){this.setData({message:copy().error+(e.code||e.message)});}},
 publishMeal(){try{this.scope();this.setData({publishCandidates:store.get().memories.filter(m=>m.cloudId&&!m.deleted)});}catch(e){this.setData({message:e.message});}},
 async publishCandidate(e){const token=identity.lease();try{const scope=this.scope(),recordId=e.currentTarget.dataset.id;const state=await spaces.publicationState({...scope,recordId});identity.assertLease(token);this.confirm(copy().publishConsent,()=>this.perform('publishMeal',{...scope,recordId,revision:state.publication.revision,consent:true}));}catch(e){if(identity.isCurrent(token))this.setData({message:e.message});}},
 async addMedia(e){
  if(this.data.busy||identity.mediaIntent())return;
  const original=identity.lease();let scope;try{scope={...this.scope(),mealId:e.currentTarget.dataset.id};}catch(err){this.setData({message:err.message});return;}
  this.confirm(copy().photoConsent,async()=>{
   this.setData({busy:true});
   try{const selected=await photos.choosePhotos(1);await identity.resumeNative(original);if(!selected[0]){if(this.active)this.setData({busy:false});return;}
    const path=await media.compressForSharing(selected[0]);await media.upload(scope,path);
    if(this.active&&!identity.snapshot().locked)await this.refresh();
   }catch(err){if(this.active&&identity.snapshot().userId===original.userId)this.setData({busy:false,mediaPending:!!identity.mediaIntent(),message:copy().error+(err.code||err.message)});}
  });
 },
 async retryMedia(){if(this.data.busy)return;const token=identity.lease();this.setData({busy:true});try{await media.retry();if(identity.isCurrent(token))await this.refresh();}catch(e){if(identity.isCurrent(token))this.setData({busy:false,mediaPending:!!identity.mediaIntent(),message:copy().error+(e.code||e.message)});}},
 async cancelMedia(){if(this.data.busy)return;const token=identity.lease();this.setData({busy:true});try{await media.cancel();if(identity.isCurrent(token))await this.refresh();}catch(e){if(identity.isCurrent(token))this.setData({busy:false,mediaPending:!!identity.mediaIntent(),message:copy().error+(e.code||e.message)});}},
 async viewMedia(e){
  if(this.data.busy)return;const token=identity.lease(),serial=this._serial;this.setData({busy:true});
  try{const mealId=e.currentTarget.dataset.id,images=await media.read(this.scope(),mealId,this._expires);
   if(!identity.isCurrent(token)||serial!==this._serial||!this.active)return;
   this.setData({busy:false,meals:this.data.meals.map(m=>m._id===mealId?{...m,sharedImages:images}:m)});
  }catch(err){if(identity.isCurrent(token)&&serial===this._serial)this.setData({busy:false,message:copy().error+(err.code||err.message)});}
 },
 async withdrawMedia(e){if(this.data.busy)return;const token=identity.lease();this.setData({busy:true});try{await media.withdraw(this.scope(),e.currentTarget.dataset.id);if(identity.isCurrent(token)){media.clear();await this.refresh();}}catch(err){if(identity.isCurrent(token))this.setData({busy:false,message:copy().error+(err.code||err.message)});}},
 onSharedImageError(e){const id=e.currentTarget.dataset.id;this.setData({meals:this.data.meals.map(m=>({...m,sharedImages:(m.sharedImages||[]).map(p=>p.id===id?{...p,failed:true}:p)}))});},
 rateMeal(e){try{const scope=this.scope(),m=this.data.meals.find(m=>m._id===e.currentTarget.dataset.id),token=identity.lease();if(!m)return;wx.showActionSheet({itemList:['1','2','3','4','5'],success:r=>{if(identity.isCurrent(token)&&this.active)this.perform('rateMeal',{...scope,id:m._id,revision:m.revision,rating:r.tapIndex+1});}});}catch(e){this.setData({message:e.message});}},
 unrateMeal(e){this.changeMeal('rateMeal',e,{rating:0});},retractMeal(e){this.changeMeal('retractMeal',e,{});},
 changeMeal(action,e,patch){try{const m=this.data.meals.find(m=>m._id===e.currentTarget.dataset.id);if(m)this.perform(action,{...this.scope(),id:m._id,revision:m.revision,...patch});}catch(e){this.setData({message:e.message});}}
});
