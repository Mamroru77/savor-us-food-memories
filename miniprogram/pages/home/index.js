const i18n = require('../../utils/i18n');
const uiFeedback = require('../../utils/uiFeedback');
// Home — port of the web HomeScreen: hero intro, weekly snapshot card,
// recent memories. Tab bar sync happens in onShow (getTabBar).
const store = require('../../utils/store');
const data = require('../../utils/data');
const stats = require('../../utils/memoryStats');
const metrics = require('../../utils/metrics');

Page({
  onImageError: uiFeedback.onImageError,
  data: {
    focusedField: '', imageErrors: {},
    copy: i18n.copy(), locale: i18n.locale(),
    headerTop: 60,
    memories: [],
    added: 0,
    weeklyMeals: 0,
    weeklyPlaces: 0,
    weeklyPhoto: data.photos.meal,
    recentRows: [],
    hasNotifications: false,
    dusk: false,
    quiet: false,
    sheetShow: false,
    sheetType: '',
    sheetMemoryId: '',
    sheetFilter: '',
  },

  onLoad() {
    this.visible=false;this.alive=true;
    this.setData({ headerTop: metrics.getMetrics().headerTop });
    this.unsubscribe = store.subscribe(this.syncState.bind(this));
  },

  onHide() { this.visible=false; },

  onUnload() {
    if (this._memoryPreview) this._memoryPreview.cancel();
    this.visible=false;this.alive=false;
    if (this.unsubscribe) this.unsubscribe();
  },

  onResize() { this.setData({ headerTop: metrics.getMetrics(true).headerTop }); },

  onShow() {
    this.visible=true;
    this.setData({imageErrors:{},focusedField:'',headerTop:metrics.getMetrics(true).headerTop});
    // Tab bar contract: every tab page pushes selected + theme + quiet.
    const state = store.get();
    this._tabAppearance = {
      dusk: state.settings.theme === 'dusk', quiet: state.settings.reduceMotion,
      labels: ['Home', 'Map', 'Add', 'Us', 'Me'].map(label => i18n.t(label)), addLabel: i18n.t('Add a memory'),
    };
    const tabBar = this.getTabBar && this.getTabBar();
    if (tabBar) tabBar.showSelection(0, this._tabAppearance);
    this.syncState(state);
    return store.syncCloud().catch(error => {
      if(!this.alive || !this.visible || ['DIAGNOSTIC_MODE','IDENTITY_LOCKED','STALE_IDENTITY'].includes(error.code))return;
      store.notify(i18n.t('Cloud sync unavailable. Your cached memories are still here.'));
    });
  },

  syncState(state) {
    if(this.alive===false)return;
    if(this.visible===false){
      // Privacy invalidation is NOT an optional background refresh. Redact cached
      // pages immediately, so an old owner's frame cannot reappear on tab return.
      const session=state.identity;
      if(session && (this._identityGeneration!==session.generation || session.locked&&this.data.identityReady!==false)){
        i18n.syncPage(this,state,0);
        this.setData({memories:[],added:0,weeklyMeals:0,weeklyPlaces:0,weeklyPhoto:data.photos.meal,recentRows:[],hasNotifications:false,sheetShow:false,sheetType:'',sheetMemoryId:'',sheetFilter:''});
      }
      return;
    }
    i18n.syncPage(this, state, 0);
    const summary = stats.summary(state.memories);
    const memories = summary.all;
    const added = memories.length;
    const recent = memories.slice(0, 5).map(function (memory) {
      return {
        id: memory.id,
        memory: memory,
        dateLabel: data.formatDate(memory.date),
        location: require('../../utils/locations').display(memory),
      };
    });
    const patch={
      // WXML only needs length; full records are already in the five recentRows.
      memories: memories.map(memory=>memory.id),
      added: added,
      weeklyMeals: summary.weeklyMeals,
      weeklyPlaces: summary.weeklyPlaces,
      weeklyPhoto: summary.weekly.length ? summary.weekly[0].photo : data.photos.meal,
      recentRows: recent,
      hasNotifications: Boolean(state.settings.reminders && !state.settings.notificationsRead),
      dusk: state.settings.theme === 'dusk',
      quiet: state.settings.reduceMotion,
    };
    const changed={};
    Object.keys(patch).forEach(key=>{if(JSON.stringify(patch[key])!==JSON.stringify(this.data[key]))changed[key]=patch[key];});
    if(Object.keys(changed).length)this.setData(changed);
  },

  onNotifications() {
    this.openSheet('notifications');
  },
  onWeekly() {
    this.openSheet('weekly');
  },
  onMemoryOpen(event) {
    this.openSheet('memory', event.detail.id);
  },
  onEmptyAdd() {
    wx.switchTab({ url: '/pages/add/index' });
  },
  onPageScroll(event) { this._memoryParentScrollTop = event.scrollTop; },
  restoreMemoryParent(position) {
    if (position.scrollTop > 0 && wx.pageScrollTo) wx.pageScrollTo({scrollTop:position.scrollTop, duration:0});
  },
  onNativePreview(event) { return require('../../utils/memoryPreview').open(this, event.detail); },

  onSheetChange(event) {
    if (this._memoryPreview) this._memoryPreview.cancel();
    // child sheets can re-target (library → memory detail, etc.)
    this.setData({
      sheetReadingPosition: null,
      sheetType: event.detail.type,
      sheetMemoryId: event.detail.memoryId,
      sheetFilter: event.detail.filter,
    });
  },
  onSheetClose(event) {
    if (!(event && event.detail && event.detail.reason === 'identity') && this._memoryPreview) this._memoryPreview.cancel();
    this.setData({ sheetShow: false, sheetType: '', sheetMemoryId: '', sheetFilter: '' });
  },
  openSheet(type, memoryId, filter) {
    if (this._memoryPreview) this._memoryPreview.cancel();
    this.setData({
      sheetShow: true,
      sheetReadingPosition: null,
      sheetType: type,
      sheetMemoryId: memoryId || '',
      sheetFilter: filter || '',
    });
  },

  data_g ﻿() {},
});
