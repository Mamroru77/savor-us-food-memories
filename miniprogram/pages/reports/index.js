const identity=require('../../utils/identity'),store=require('../../utils/store'),report=require('../../utils/annualReport'),files=require('../../utils/workspace');
Page({
 data:{locked:true,years:[],year:'',report:null,details:false,message:'',dusk:false,busy:false},
 onLoad(){this.off=identity.subscribe(()=>this.reset());this.reset();},
 onShow(){this._hidden=false;this.reset();},onHide(){this._hidden=true;this.clear();},onUnload(){this._disposed=true;if(this.off)this.off();this.clear();},
 clear(){if(this._canvas){this._canvas.width=0;this._canvas.height=0;}this._aggregate=null;this._report=null;this._canvas=null;this.setData({report:null,details:false,message:'',busy:false});},
 reset(){this.clear();const s=identity.snapshot(),year=new Date().getFullYear(),years=Array.from({length:year-1899},(_,i)=>String(year-i));this.setData({locked:s.locked,years,year:String(year),dusk:store.get().settings.theme==='dusk'});if(!s.locked&&!this._hidden)this.generate();},
 alive(token){return !this._hidden&&!this._disposed&&identity.isCurrent(token);},
 selectYear(e){this.setData({year:this.data.years[Number(e.detail.value)]});this.generate();},
 details(e){this.setData({details:e.detail.value});this.generate();},
 generate(){
  if(this.data.locked)return;const token=identity.lease();this._report=report.build(store.get().memories,Number(this.data.year),{details:this.data.details});this._aggregate=report.build(store.get().memories,Number(this.data.year));this._canvas=null;
  this.setData({report:this._report,message:''},()=>{if(!this.alive(token))return;wx.createSelectorQuery().in(this).select('#report-canvas').fields({node:true,size:true}).exec(result=>{if(!this.alive(token)||!result[0]||!result[0].node)return;const canvas=result[0].node;canvas.width=720;canvas.height=1040;report.draw(canvas.getContext('2d'),this._aggregate);this._canvas=canvas;});});
 },
 async exportHtml(){
  if(this.data.busy||this.data.locked||!this._report)return;const token=identity.lease(),snapshot=this._report;this.setData({busy:true});
  try{const consent=await new Promise((resolve,reject)=>wx.showModal({title:'导出年度报告',content:snapshot.details?'包含日期、餐厅和已确认城市，不含笔记/照片。分享后无法撤回副本。确认继续？':'仅导出汇总与里程碑日期，不含姓名、餐厅、笔记或照片。分享后无法撤回副本。',success:resolve,fail:reject}));if(!consent.confirm||!this.alive(token))return;const filePath=files.writeFile(report.html(snapshot),'html',token);this.setData({message:filePath});if(wx.shareFileMessage)wx.shareFileMessage({filePath});}catch(e){if(this.alive(token))this.setData({message:e.code||e.message});}finally{if(this.alive(token))this.setData({busy:false});}
 },
 sharePoster(){
  if(this.data.busy||this.data.locked||!this._canvas)return;const token=identity.lease(),canvas=this._canvas;this.setData({busy:true});
  wx.canvasToTempFilePath({canvas,fileType:'png',success:r=>{if(!this.alive(token))return;this.setData({busy:false,message:'海报仅含汇总。分享后无法撤回对方保存的副本。'});if(wx.showShareImageMenu)wx.showShareImageMenu({path:r.tempFilePath});else wx.previewImage({urls:[r.tempFilePath]});},fail:()=>{if(this.alive(token))this.setData({busy:false,message:'海报暂不可用，请导出 HTML 报告。'});}},this);
 }
});
