// UI state only. Never write failed image paths or focus state to the diary/store.
function onFieldFocus(event) {
  this.setData({focusedField:event.currentTarget.dataset.focusKey || ''});
}
function onFieldBlur(event) {
  if(this.data.focusedField === event.currentTarget.dataset.focusKey) this.setData({focusedField:''});
}
function onImageError(event) {
  const source=event.currentTarget.dataset.source;
  if(typeof source!=='string' || !source || (this.data.imageErrors && this.data.imageErrors[source]))return;
  const errors=Object.assign({},this.data.imageErrors || {});
  errors[source]=true;
  this.setData({imageErrors:errors});
}
module.exports={onFieldFocus,onFieldBlur,onImageError};
