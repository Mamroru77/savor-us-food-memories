const secondaryUI=require('../../utils/secondaryUI');
const identity=require('../../utils/identity'),store=require('../../utils/store'),report=require('../../utils/annualReport'),files=require('../../utils/workspace');
Page({
 onFieldFocus:secondaryUI.onFieldFocus,onFieldBlur:secondaryUI.onFieldBlur,
 data:{locked:true,years:[],year:'',report:null,details:false,message:'',dusk:false,busy:false},
 // Subscribe once; onShow owns the first generation as well as later returns.
 onLoad(){this._hidden=true;this.off=identity.subscribe(()=>this.reset());},
 onShow(){this._hidden=false;this.reset();},onHide(){this._hidden=true;this.clear();},onUnload(){this._disposed=true;if(this.off)this.off();this.clear();},
 clear(){this._renderSerial=(this._renderSerial||0)+1;if(this._canvas){this._canvas.width=0;this._canvas.height=0;}this._aggregate=null;this._report=null;this._canvas=null;this.setData({report:null,details:false,message:'',busy:false});},
 reset(){secondaryUI.sync(this,!this._hidden&&!this._disposed?'Annual reports':'');this.clear();const s=identity.snapshot(),year=new Date().getFullYear(),years=Array.from({length:year-1899},(_,i)=>String(year-i));this.setData({locked:s.locked,years,year:String(year),dusk:store.get().settings.theme==='dusk'});if(!s.locked&&!this._hidden)this.generate();},
 alive(token){return !this._hidden&&!this._disposed&&identity.isCurrent(token);},
 selectYear(e){this.setData({year:this.data.years[Number(e.detail.value)]});this.generate();},
 details(e){this.setData({details:e.detail.value});this.generate();},
 generate(){
  if(this.data.locked)return;const token=identity.lease(),serial=this._renderSerial=(this._renderSerial||0)+1;this._report=report.build(store.get().memories,Number(this.data.year),{details:this.data.details});this._aggregate=report.build(store.get().memories,Number(this.data.year));this._canvas=null;
  this.setData({report:this._report,uiText:secondaryUI.copy(this._report),message:''},()=>{if(!this.alive(token)||serial!==this._renderSerial)return;wx.createSelectorQuery().in(this).select('#report-canvas').fields({node:true,size:true}).exec(result=>{if(!this.alive(token)||serial!==this._renderSerial||!result||!result[0]||!result[0].node)return;const canvas=result[0].node;canvas.width=720;canvas.height=1040;report.draw(canvas.getContext('2d'),this._aggregate,this.data.locale);this._canvas=canvas;});});
 },
 async exportHtml(){
  if(this.data.busy||this.data.locked||!this._report)return;const token=identity.lease(),snapshot=this._report;this.setData({busy:true});
  try{const consent=await new Promise((resolve,reject)=>wx.showModal({title:secondaryUI.copy().exportTitle,content:snapshot.details?secondaryUI.copy().exportDetailConsent:secondaryUI.copy().exportSummaryConsent,success:resolve,fail:reject}));if(!consent.confirm||!this.alive(token))return;const filePath=files.writeFile(report.html(snapshot,this.data.locale),'html',token);this.setData({message:filePath});if(wx.shareFileMessage)wx.shareFileMessage({filePath});}catch(e){if(this.alive(token))this.setData({message:e.code||e.message});}finally{if(this.alive(token))this.setData({busy:false});}
 },
 sharePoster(){
  if(this.data.busy||this.data.locked||!this._canvas)return;const token=identity.lease(),canvas=this._canvas;this.setData({busy:true});
  wx.canvasToTempFilePath({canvas,fileType:'png',success:r=>{if(!this.alive(token))return;this.setData({busy:false,message:secondaryUI.copy().posterShared});if(wx.showShareImageMenu)wx.showShareImageMenu({path:r.tempFilePath});else wx.previewImage({urls:[r.tempFilePath]});},fail:()=>{if(this.alive(token))this.setData({busy:false,message:secondaryUI.copy().posterUnavailable});}},this);
 }
});
