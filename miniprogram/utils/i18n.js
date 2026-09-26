// Application copy only. User restaurant names, notes, tags and stored data
// are never translated. TabBar receives translated labels from pages (zero require).
const catalog = require('./locales');
const headings = require('./pageHeadings');
let preference = 'system';
const listeners = [];
function locale() {
  if (preference === 'zh-CN' || preference === 'en') return preference;
  try {
    const info = wx.getAppBaseInfo ? wx.getAppBaseInfo() : wx.getSystemInfoSync();
    return /^zh/i.test(info.language || '') ? 'zh-CN' : 'en';
  } catch (e) { return 'en'; }
}
function setLanguage(value) {
  preference = ['system', 'zh-CN', 'en'].indexOf(value) >= 0 ? value : 'system';
  listeners.slice().forEach(fn => fn());
}
function t(value, params) {
  if (typeof value !== 'string') return value;
  const item = catalog.find(row => row.en === value || row.zh === value);
  let result = item ? (locale() === 'zh-CN' ? item.zh : item.en) : value;
  if (params) Object.keys(params).forEach(key => { result = result.split('{' + key + '}').join(String(params[key])); });
  return result;
}
function copy() {
  const result = {};
  const chinese = locale() === 'zh-CN';
  catalog.forEach(row => { result[row.key] = chinese ? row.zh : row.en; });
  return result;
}
function options() {
  return [ { value: 'system', label: t('Follow system') }, { value: 'zh-CN', label: '简体中文' }, { value: 'en', label: 'English' } ];
}
function syncPage(page, state, selected, options) {
  const session=state.identity;
  if(session){
    const changed=page._identityGeneration!==undefined&&page._identityGeneration!==session.generation;
    page._identityGeneration=session.generation;
    const patch={identityReady:!session.locked};
    if(changed){
      Object.assign(patch,{imageErrors:{},focusedField:''});
      // A system chooser (album, camera) hides the mini program, so App.onShow re-verifies
      // identity while a page may still be holding a native round trip. Callers that own such a
      // round trip ask to keep the sheet binding intact; otherwise the sheet hides, its mounted
      // block unmounts, the editor detaches and the pending native result is destroyed.
      // The caller decides — this module never inspects the native flow.
      if(!(options&&options.preserveSheet===true))Object.assign(patch,{sheetShow:false,sheetType:'',sheetMemoryId:'',sheetFilter:''});
      if(selected===2){
        // A locked session cannot read this owner's partition, so store.loadDraft() would
        // fabricate a freshDraft() and overwrite the projection the user is looking at.
        // "Cannot read" is not "there is nothing": a transient locked window must never discard
        // business input (the draft, the 万能导入 editor, the pending tag). A CONFIRMED owner
        // change clears them from the page instead, where the new owner is actually known.
        const add={knownPlace:null,error:'',saving:false,uploading:false};
        if(!session.locked)Object.assign(add,{draft:require('./store').loadDraft(),importOpen:false,importText:'',importCandidate:null,importMatches:[],importCity:'',importLookupError:'',tag:''});
        Object.assign(patch,add);
        page.lookupSerial=(page.lookupSerial||0)+1;page.saveLock=false;
      }
      if(selected===1){page.markerGeneration=(page.markerGeneration||0)+1;if(page.pinRenderer)page.pinRenderer.dispose();page.pinRenderer=null;Object.assign(patch,{mapDrawers:[],markers:[],clusterOpen:false,stackPositionsReady:false});}
    }
    page.setData(patch,()=>{if(changed&&selected===1&&!session.locked&&page.onReady){page.markerCanvas=null;page.onReady();}});
  }
  const dusk = state.settings.theme === 'dusk';
  page.setData({ copy: copy(), locale: locale(), pageHeading: headings.resolve(state, ['home','map','add','us','me'][selected], t) });
  page._tabAppearance = { dusk, quiet: state.settings.reduceMotion,
    labels: ['Home', 'Map', 'Add', 'Us', 'Me'].map(label => t(label)), addLabel: t('Add a memory') };
  const tabBar = page.getTabBar && page.getTabBar();
  if (tabBar) tabBar.updateAppearance(selected, page._tabAppearance);
  try {
    if (wx.setNavigationBarColor) wx.setNavigationBarColor({ frontColor: dusk ? '#ffffff' : '#000000', backgroundColor: dusk ? '#121315' : '#eeece9' });
  } catch (e) { /* app content and TabBar still render */ }
}
function subscribe(fn) {
  listeners.push(fn);
  return function () { const index = listeners.indexOf(fn); if (index >= 0) listeners.splice(index, 1); };
}
function modal(options) {
  const identity=require('./identity'),token=identity.lease(),original=options.success;
  options=Object.assign({},options,{success:r=>{if(identity.isCurrent(token)&&original)original(r);}});
  wx.showModal(Object.assign({}, options, { title: t(options.title), content: t(options.content), confirmText: t('OK'), cancelText: t('Cancel') }));
}
module.exports = { locale, setLanguage, t, copy, options, syncPage, subscribe, modal };
