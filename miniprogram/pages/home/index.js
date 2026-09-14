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
    this.setData({ headerTop: metrics.getMetrics().headerTop });
    this.unsubscribe = store.subscribe(this.syncState.bind(this));
  },

  onUnload() {
    if (this.unsubscribe) this.unsubscribe();
  },

  onResize() { this.setData({ headerTop: metrics.getMetrics(true).headerTop }); },

  onShow() {
    this.setData({imageErrors:{},focusedField:''});
    this.setData({ headerTop: metrics.getMetrics(true).headerTop });
    // Tab bar contract: every tab page pushes selected + theme + quiet.
    const state = store.get();
    this._tabAppearance = {
      dusk: state.settings.theme === 'dusk', quiet: state.settings.reduceMotion,
      labels: ['Home', 'Map', 'Add', 'Us', 'Me'].map(label => i18n.t(label)), addLabel: i18n.t('Add a memory'),
    };
    const tabBar = this.getTabBar && this.getTabBar();
    if (tabBar) tabBar.showSelection(0, this._tabAppearance);
    this.syncState(state);
    return store.syncCloud().catch(function () {
      store.notify(i18n.t('Cloud sync unavailable. Your cached memories are still here.'));
    });
  },

  syncState(state) {
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
    this.setData({
      memories: memories,
      added: added,
      weeklyMeals: summary.weeklyMeals,
      weeklyPlaces: summary.weeklyPlaces,
      weeklyPhoto: summary.weekly.length ? summary.weekly[0].photo : data.photos.meal,
      recentRows: recent,
      hasNotifications: Boolean(state.settings.reminders && !state.settings.notificationsRead),
      dusk: state.settings.theme === 'dusk',
      quiet: state.settings.reduceMotion,
    });
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
  onSheetChange(event) {
    // child sheets can re-target (library → memory detail, etc.)
    this.setData({
      sheetType: event.detail.type,
      sheetMemoryId: event.detail.memoryId,
      sheetFilter: event.detail.filter,
    });
  },
  onSheetClose() {
    this.setData({ sheetShow: false, sheetType: '', sheetMemoryId: '', sheetFilter: '' });
  },
  openSheet(type, memoryId, filter) {
    this.setData({
      sheetShow: true,
      sheetType: type,
      sheetMemoryId: memoryId || '',
      sheetFilter: filter || '',
    });
  },

  data_g ﻿() {},
});
