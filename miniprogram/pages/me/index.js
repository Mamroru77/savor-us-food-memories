const i18n = require('../../utils/i18n');
const uiFeedback = require('../../utils/uiFeedback');
// Me — port of the web MeScreen: profile heading, stats card with the
// memory chart (inline SVG data URI), and the five settings rows.
const store = require('../../utils/store');
const data = require('../../utils/data');
const metrics = require('../../utils/metrics');
const memoryStats = require('../../utils/memoryStats');
const nativeFlow = require('../../utils/nativeFlow');

const MENU_ROWS = [
  { title:'Cloud tools',subtitle:'Backups, preferences and feedback',icon:'archive',sheet:'workspace' },
  { title:'Annual reports',subtitle:'Memories, milestones and sharing',icon:'archive',sheet:'reports' },
  { title:'Shared space & wishlist',subtitle:'Invite, consent and share explicitly',icon:'users',sheet:'space' },
  { title:'Account & legacy data',subtitle:'Identity partitions, backups and recovery',icon:'shield-check',sheet:'account' },
  { title: 'Sync status', subtitle: 'Pending changes and conflicts', icon: 'arrow-up-from-line', sheet: 'sync' },
  { title: 'Personalize', subtitle: 'Page titles and your profile', icon: 'pencil', sheet: 'personalize' },
  { title: 'Preferences', subtitle: 'Dietary, cuisines, tags', icon: 'utensils', sheet: 'preferences' },
  { title: 'Memories', subtitle: 'Export, backup, import', icon: 'archive', sheet: 'library' },
  { title: 'Privacy', subtitle: 'Manage your data', icon: 'shield-check', sheet: 'privacy' },
  { title: 'Settings', subtitle: 'Notifications, theme, more', icon: 'settings', sheet: 'settings' },
  { title: 'Help & Feedback', subtitle: "We're here to help", icon: 'circle-question-mark', sheet: 'help' },
];

Page({
  onImageError(event) {
    uiFeedback.onImageError.call(this,event);
    if(this.data.profile.avatar&&event.currentTarget.dataset.source===this.data.profile.avatar){
      require('../../utils/photos').logFailure({code:'IMAGE_LOAD_FAILED'},'me-preview');
    }
  },
  data: {
    focusedField: '', imageErrors: {},
    copy: i18n.copy(), locale: i18n.locale(),
    headerTop: 60,
    ambientPhoto: '/images/le-comptoir.jpg',
    profile: data.defaultProfile,
    meals: 0,
    savedCount: 0,
    places: 0,
    menuRows: MENU_ROWS,
    chartUri: memoryStats.chart([0,0,0,0,0,0,0]),
    dusk: false,
    quiet: false,
    sheetShow: false,
    sheetType: '',
    sheetMemoryId: '',
    sheetFilter: '',
  },

  onAmbientError() { this.setData({ ambientPhoto: '/images/le-comptoir.jpg' }); },

  onLoad() {
    let capsule = { top: 0, height: 32, borderRadius: 16 };
    try { const rect = wx.getMenuButtonBoundingClientRect(); if(rect&&rect.top) capsule={top:rect.top,height:rect.height,borderRadius:rect.height/2}; } catch(e){}
    this.setData({ menuButtonTop: capsule.top, menuButtonHeight: capsule.height, menuButtonBorderRadius: capsule.borderRadius });
    this.setData({ headerTop: metrics.getMetrics().headerTop });
    this.unsubscribe = store.subscribe(this.syncState.bind(this));
  },

  onUnload() {
    nativeFlow.cancel();
    if (this._memoryPreview) this._memoryPreview.cancel();
    if (this.unsubscribe) this.unsubscribe();
  },

  onResize() { this.setData({ headerTop: metrics.getMetrics(true).headerTop }); },

  onShow() {
    try { const rect=wx.getMenuButtonBoundingClientRect(); if(rect&&rect.top) this.setData({menuButtonTop:rect.top,menuButtonHeight:rect.height,menuButtonBorderRadius:rect.height/2}); } catch(e){}
    this.setData({imageErrors:{},focusedField:''});
    this.setData({ headerTop: metrics.getMetrics(true).headerTop });
    const state = store.get();
    this._tabAppearance = {
      dusk: state.settings.theme === 'dusk', quiet: state.settings.reduceMotion,
      labels: ['Home', 'Map', 'Add', 'Us', 'Me'].map(label => i18n.t(label)), addLabel: i18n.t('Add a memory'),
    };
    const tabBar = this.getTabBar && this.getTabBar();
    if (tabBar) tabBar.showSelection(4, this._tabAppearance);
    this.syncState(state);
  },

  syncState(state) {
    const session=state.identity;
    let resumeAvatarSheet=false;
    const native=nativeFlow.snapshot();
    if(native&&session){
      if(session.locked){
        if(session.status!=='verifying')nativeFlow.cancel(native.id);
      } else if(session.userId===native.userId){
        resumeAvatarSheet=true;
      } else {
        nativeFlow.cancel(native.id);
      }
    }
    // A system chooser (album, camera) hides the mini program, so App.onShow re-verifies identity
    // while the profile sheet still holds the avatar request. The page-level sync must not tear
    // that binding down inside the window: the sheet would unmount, ProfileEditor would detach,
    // and the request plus its native flow would be destroyed before bindchooseavatar lands.
    // Only a live native flow on the profile sheet is preserved; every other identity change
    // keeps the original safe behaviour of closing the sheet. The owner is still unknown while
    // verifying, so this is an optimistic window — a different owner closes it on the next emit.
    const preserveSheet=!!native&&!!session&&session.status==='verifying'&&this.data.sheetShow&&this.data.sheetType==='profile';
    i18n.syncPage(this, state, 4, {preserveSheet});
    const summary = memoryStats.summary(state.memories);
    const isAvatarChanged = this.data.profile && this.data.profile.avatar !== state.profile.avatar;
    const patch={
      savedCount: memoryStats.countSaved(state.memories, false),
      chartUri: memoryStats.chart(summary.counts),
      profile: state.profile,
      menuRows: MENU_ROWS.map(row => Object.assign({}, row, { title: i18n.t(row.title), subtitle: i18n.t(row.subtitle) })),
      ambientPhoto: data.isSafeImage(state.profile.avatar) ? state.profile.avatar : data.photos.meal,
      meals: summary.meals,
      places: summary.places,
      dusk: state.settings.theme === 'dusk',
      quiet: state.settings.reduceMotion,
      imageErrors: isAvatarChanged ? {} : this.data.imageErrors,
    };
    if(resumeAvatarSheet)Object.assign(patch,{sheetShow:true,sheetType:'profile',sheetMemoryId:'',sheetFilter:''});
    this.setData(patch);
  },

  onStatsCard() { this.openSheet('library'); },
  onEditProfile() { this.openSheet('profile'); },
  onMenuRow(event) { if(['workspace','reports'].includes(event.currentTarget.dataset.sheet)){wx.navigateTo({url:event.currentTarget.dataset.sheet==='workspace'?'/pages/workspace/index':'/pages/reports/index'});return;} if(event.currentTarget.dataset.sheet==='space'){wx.navigateTo({url:'/pages/space/index'});return;}if(event.currentTarget.dataset.sheet==='account'){wx.navigateTo({url:'/pages/account/index'});return;}this.openSheet(event.currentTarget.dataset.sheet); },
  onPageScroll(event) { this._memoryParentScrollTop = event.scrollTop; },
  restoreMemoryParent(position) {
    if (position.scrollTop > 0 && wx.pageScrollTo) wx.pageScrollTo({scrollTop:position.scrollTop, duration:0});
  },
  onNativePreview(event) { return require('../../utils/memoryPreview').open(this, event.detail); },
  onSheetChange(event) {
    nativeFlow.cancel();
    if (this._memoryPreview) this._memoryPreview.cancel();
    this.setData({
      sheetReadingPosition: null,
      sheetType: event.detail.type,
      sheetMemoryId: event.detail.memoryId,
      sheetFilter: event.detail.filter,
    });
  },
  onSheetClose(event) {
    nativeFlow.cancel();
    if (!(event && event.detail && event.detail.reason === 'identity') && this._memoryPreview) this._memoryPreview.cancel();
    this.setData({ sheetShow: false, sheetType: '', sheetMemoryId: '', sheetFilter: '' });
  },
  openSheet(type, memoryId, filter) {
    nativeFlow.cancel();
    if (this._memoryPreview) this._memoryPreview.cancel();
    this.setData({
      sheetShow: true,
      sheetReadingPosition: null,
      sheetType: type,
      sheetMemoryId: memoryId || '',
      sheetFilter: filter || '',
    });
  },
});
