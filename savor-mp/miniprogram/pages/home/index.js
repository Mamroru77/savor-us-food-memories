// Home — port of the web HomeScreen: hero intro, weekly snapshot card,
// recent memories. Tab bar sync happens in onShow (getTabBar).
const store = require('../../utils/store');
const data = require('../../utils/data');
const metrics = require('../../utils/metrics');

Page({
  data: {
    headerTop: 60,
    memories: [],
    added: 0,
    weeklyMeals: 12,
    weeklyPlaces: 5,
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

  onShow() {
    // Tab bar contract: every tab page pushes selected + theme + quiet.
    const state = store.get();
    const tabBar = this.getTabBar && this.getTabBar();
    if (tabBar) {
      tabBar.setData({
        selected: 0,
        dusk: state.settings.theme === 'dusk',
        quiet: state.settings.reduceMotion,
      });
    }
    this.syncState(state);
  },

  syncState(state) {
    const memories = state.memories;
    const added = memories.length - data.initialMemories.length;
    const recent = memories.slice(0, 5).map(function (memory) {
      return {
        id: memory.id,
        memory: memory,
        dateLabel: data.formatDate(memory.date),
        location: (memory.neighborhood ? memory.neighborhood + ', ' : '') + memory.city,
      };
    });
    this.setData({
      memories: memories,
      added: added,
      weeklyMeals: Math.max(0, 12 + added),
      weeklyPlaces: 5 + Math.max(0, added),
      weeklyPhoto: added > 0 ? memories[0].photo : data.photos.meal,
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
