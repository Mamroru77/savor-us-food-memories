// Narrow projection of the already-reviewed A integration for the historical menu-only guard.
// Unknown bytes fail closed BEFORE any projection. This does not edit the fixture or product.
const assert=require('node:assert/strict'),crypto=require('crypto');
const approvedSha256='a94224efd485a4e9aa9267c0d309d19e04a61b536fc9990573d120a10aae93c4';
const reviewedHunks=[
  [
    "\n  onUnload() {\n    if (this._memoryPreview) this._memoryPreview.cancel();\n    if (this.unsubscribe) this.unsubscribe();\n  },\n",
    "\n  onUnload() {\n    if (this.unsubscribe) this.unsubscribe();\n  },\n"
  ],
  [
    "  onEditProfile() { this.openSheet('profile'); },\n  onMenuRow(event) { if(['workspace','reports'].includes(event.currentTarget.dataset.sheet)){wx.navigateTo({url:event.currentTarget.dataset.sheet==='workspace'?'/pages/workspace/index':'/pages/reports/index'});return;} if(event.currentTarget.dataset.sheet==='space'){wx.navigateTo({url:'/pages/space/index'});return;}if(event.currentTarget.dataset.sheet==='account'){wx.navigateTo({url:'/pages/account/index'});return;}this.openSheet(event.currentTarget.dataset.sheet); },\n  onPageScroll(event) { this._memoryParentScrollTop = event.scrollTop; },\n  restoreMemoryParent(position) {\n    if (position.scrollTop > 0 && wx.pageScrollTo) wx.pageScrollTo({scrollTop:position.scrollTop, duration:0});\n  },\n  onNativePreview(event) { return require('../../utils/memoryPreview').open(this, event.detail); },\n\n  onSheetChange(event) {\n    if (this._memoryPreview) this._memoryPreview.cancel();\n    this.setData({\n      sheetReadingPosition: null,\n      sheetType: event.detail.type,\n      sheetMemoryId: event.detail.memoryId,\n",
    "  onEditProfile() { this.openSheet('profile'); },\n  onMenuRow(event) { if(['workspace','reports'].includes(event.currentTarget.dataset.sheet)){wx.navigateTo({url:event.currentTarget.dataset.sheet==='workspace'?'/pages/workspace/index':'/pages/reports/index'});return;} if(event.currentTarget.dataset.sheet==='space'){wx.navigateTo({url:'/pages/space/index'});return;}if(event.currentTarget.dataset.sheet==='account'){wx.navigateTo({url:'/pages/account/index'});return;}this.openSheet(event.currentTarget.dataset.sheet); },\n  onSheetChange(event) {\n    this.setData({\n      sheetType: event.detail.type,\n      sheetMemoryId: event.detail.memoryId,\n"
  ],
  [
    "    });\n  },\n  onSheetClose(event) {\n    if (!(event && event.detail && event.detail.reason === 'identity') && this._memoryPreview) this._memoryPreview.cancel();\n    this.setData({ sheetShow: false, sheetType: '', sheetMemoryId: '', sheetFilter: '' });\n  },\n  openSheet(type, memoryId, filter) {\n    if (this._memoryPreview) this._memoryPreview.cancel();\n    this.setData({\n      sheetShow: true,\n      sheetReadingPosition: null,\n      sheetType: type,\n      sheetMemoryId: memoryId || '',\n",
    "    });\n  },\n  onSheetClose() {\n    this.setData({ sheetShow: false, sheetType: '', sheetMemoryId: '', sheetFilter: '' });\n  },\n  openSheet(type, memoryId, filter) {\n    this.setData({\n      sheetShow: true,\n      sheetType: type,\n      sheetMemoryId: memoryId || '',\n"
  ]
];
function project(source){
 assert.equal(crypto.createHash('sha256').update(source).digest('hex'),approvedSha256,'Me source differs from exact reviewed A+menu integration');
 for(const [from,to] of reviewedHunks){assert.equal(source.split(from).length,2,'Reviewed A hunk must match once');source=source.replace(from,to);}
 return source;
}
module.exports={project,approvedSha256};
