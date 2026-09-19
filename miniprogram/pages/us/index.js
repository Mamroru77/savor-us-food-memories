const i18n = require('../../utils/i18n');
const uiFeedback = require('../../utils/uiFeedback');
// Us — port of the web UsScreen: together card, journey card, shared moments.
const store = require('../../utils/store');
const data = require('../../utils/data');
const metrics = require('../../utils/metrics');
const memoryStats = require('../../utils/memoryStats');

Page({
  onImageError: uiFeedback.onImageError,
  data: {
    focusedField: '', imageErrors: {},
    copy: i18n.copy(), locale: i18n.locale(),
    headerTop: 60,
    ambientPhoto: '/images/paris-evening.jpg',
    days: 0,
    meals: 0,
    savedCount: 0,
    places: 0,
    latestLabel: '',
    journeyPhoto: data.photos.paris,
    sharedRows: [], sharedScrollLeft: 0,
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

  onAmbientError() { this.setData({ ambientPhoto: '/images/paris-evening.jpg' }); },

  onLoad() {
    this.setData({ headerTop: metrics.getMetrics().headerTop });
    this.unsubscribe = store.subscribe(this.syncState.bind(this));
  },

  onUnload() {
    if (this._memoryPreview) this._memoryPreview.cancel();
    if (this.unsubscribe) this.unsubscribe();
  },

  onResize() { this.setData({ headerTop: metrics.getMetrics(true).headerTop }); },

  onShow() {
    this.setData({imageErrors:{},focusedField:''});
    this.setData({ headerTop: metrics.getMetrics(true).headerTop });
    const state = store.get();
    this._tabAppearance = {
      dusk: state.settings.theme === 'dusk', quiet: state.settings.reduceMotion,
      labels: ['Home', 'Map', 'Add', 'Us', 'Me'].map(label => i18n.t(label)), addLabel: i18n.t('Add a memory'),
    };
    const tabBar = this.getTabBar && this.getTabBar();
    if (tabBar) tabBar.showSelection(3, this._tabAppearance);
    this.syncState(state);
  },

  syncState(state) {
    i18n.syncPage(this, state, 3);
    const summary = memoryStats.summary(state.memories, true);
    const days = require('../../utils/localDate').daysSince(state.profile.togetherSince);
    const shared = summary.all;
    const recentShared = shared[0];
    this.setData({
      savedCount: memoryStats.countSaved(state.memories, true),
      days: days,
      meals: summary.meals,
      places: summary.places,
      latestLabel: recentShared ? require('../../utils/locations').display(recentShared) : i18n.t('The next adventure'),
      journeyPhoto: recentShared ? (recentShared.placePhoto || recentShared.photo) : data.photos.paris,
      ambientPhoto: recentShared ? (recentShared.placePhoto || recentShared.photo) : data.photos.paris,
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
    if (!settings.loveSent) store.notify(i18n.t('A little love, added to your shared space.'));
  },
  onManageSpace(){wx.navigateTo({url:'/pages/space/index'});},
  onTogether() { this.openSheet('together'); },
  onJourney() { this.openSheet('journey'); },
  onGalleryScroll(event) { this._memoryGalleryScrollLeft = event.detail.scrollLeft; },
  onSharedOpen(event) { this.openSheet('memory', event.currentTarget.dataset.id); },
  onSeeAll() { this.openSheet('library', '', 'shared'); },
  onSharedLike(event) {
    const id = event.currentTarget.dataset.id;
    const memory = store.get().memories.find(function (m) { return m.id === id; });
    if (memory) store.updateMemory(id, { liked: !memory.liked });
  },
  onMemoryOpen(event) { this.openSheet('memory', event.detail.id); },
  onPageScroll(event) { this._memoryParentScrollTop = event.scrollTop; },
  restoreMemoryParent(position) {
    this.setData({sharedScrollLeft:position.galleryLeft});
    if (position.scrollTop > 0 && wx.pageScrollTo) wx.pageScrollTo({scrollTop:position.scrollTop, duration:0});
  },
  onNativePreview(event) { return require('../../utils/memoryPreview').open(this, event.detail); },

  onSheetChange(event) {
    if (this._memoryPreview) this._memoryPreview.cancel();
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
});
