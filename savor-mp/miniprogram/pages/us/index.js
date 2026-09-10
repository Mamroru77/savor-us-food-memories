// Us — port of the web UsScreen: together card, journey card, shared moments.
const store = require('../../utils/store');
const data = require('../../utils/data');
const metrics = require('../../utils/metrics');

Page({
  data: {
    headerTop: 60,
    days: 0,
    meals: 48,
    places: 17,
    latestLabel: 'Paris, France',
    journeyPhoto: data.photos.paris,
    sharedRows: [],
    loveSent: false,
    dusk: false,
    quiet: false,
    avatar: data.photos.jamie,
    partner: 'Alex',
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
    const state = store.get();
    const tabBar = this.getTabBar && this.getTabBar();
    if (tabBar) {
      tabBar.setData({
        selected: 3,
        dusk: state.settings.theme === 'dusk',
        quiet: state.settings.reduceMotion,
      });
    }
    this.syncState(state);
  },

  syncState(state) {
    const days = Math.max(0, Math.floor((Date.now() - new Date(state.profile.togetherSince + 'T00:00:00').getTime()) / 86400000));
    const addedShared = state.memories.filter(function (m) { return m.shared; }).length
      - data.initialMemories.filter(function (m) { return m.shared; }).length;
    // web keeps a curated order for the shared rail — same rank logic here
    const order = ['comptoir', 'arabica', 'kyoto'];
    const isSeed = order.indexOf.bind(order);
    const shared = state.memories.filter(function (memory) { return memory.shared; }).sort(function (a, b) {
      const rank = function (id) {
        const at = order.indexOf(id);
        if (at >= 0) return at;
        return data.initialMemories.some(function (m) { return m.id === id; }) ? 99 : -1;
      };
      return rank(a.id) - rank(b.id);
    });
    const recentShared = shared[0];
    this.setData({
      days: days,
      meals: Math.max(0, 48 + addedShared),
      places: 17 + Math.max(0, addedShared),
      latestLabel: addedShared > 0 && recentShared ? recentShared.city + ', ' + recentShared.country : 'Paris, France',
      journeyPhoto: data.photos.paris,
      sharedRows: shared.map(function (memory) {
        return {
          id: memory.id,
          memory: memory,
          dateLabel: data.formatDate(memory.date),
          photoSrc: memory.placePhoto || memory.photo || data.photos.meal,
        };
      }),
      loveSent: state.settings.loveSent,
      dusk: state.settings.theme === 'dusk',
      quiet: state.settings.reduceMotion,
      avatar: state.profile.avatar,
      partner: state.profile.partner,
    });
  },

  onLoveTap() {
    const settings = store.get().settings;
    store.updateSettings({ loveSent: !settings.loveSent });
    if (!settings.loveSent) store.notify('A little love, added to your shared space.');
  },
  onTogether() { this.openSheet('together'); },
  onJourney() { this.openSheet('journey'); },
  onSharedOpen(event) { this.openSheet('memory', event.currentTarget.dataset.id); },
  onSeeAll() { this.openSheet('library', '', 'shared'); },
  onSharedLike(event) {
    const id = event.currentTarget.dataset.id;
    const memory = store.get().memories.find(function (m) { return m.id === id; });
    if (memory) store.updateMemory(id, { liked: !memory.liked });
  },
  onMemoryOpen(event) { this.openSheet('memory', event.detail.id); },
  onSheetChange(event) {
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
});
