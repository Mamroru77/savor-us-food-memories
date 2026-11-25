const i18n = require('../../utils/i18n');
const uiFeedback = require('../../utils/uiFeedback');
// Us — port of the web UsScreen: together card, journey card, shared moments.
const store = require('../../utils/store');
const data = require('../../utils/data');
const metrics = require('../../utils/metrics');
const memoryStats = require('../../utils/memoryStats');
const localDate = require('../../utils/localDate');
const spaces = require('../../utils/spaces');

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
    avatar: '',
    partner: '',
    sheetShow: false,
    sheetType: '',
    sheetMemoryId: '',
    sheetFilter: '',
  },

  onAmbientError() { this.setData({ ambientPhoto: '/images/paris-evening.jpg' }); },

  onLoad() {
    let capsule = { top: 0, height: 32, borderRadius: 16 };
    try { const rect = wx.getMenuButtonBoundingClientRect(); if(rect&&rect.top) capsule={top:rect.top,height:rect.height,borderRadius:rect.height/2}; } catch(e){}
    this.setData({
      menuButtonTop: capsule.top,
      menuButtonHeight: capsule.height,
      menuButtonBorderRadius: capsule.borderRadius,
      headerTop: metrics.getMetrics().headerTop,
    });
    this.unsubscribe = store.subscribe(this.syncState.bind(this));
    this.unsubscribeSpace = typeof spaces.subscribeStatus === 'function'
      ? spaces.subscribeStatus(() => this.syncState(store.get()))
      : null;
  },

  onHide() {
    this._visible = false;
  },

  onUnload() {
    this._visible = false;
    if (this._memoryPreview) this._memoryPreview.cancel();
    if (this.unsubscribe) this.unsubscribe();
    if (this.unsubscribeSpace) this.unsubscribeSpace();
  },

  onResize() { this.setData({ headerTop: metrics.getMetrics(true).headerTop }); },

  onShow() {
    this._visible = true;
    const state = store.get();
    this._tabAppearance = {
      dusk: state.settings.theme === 'dusk', quiet: state.settings.reduceMotion,
      labels: ['Home', 'Map', 'Add', 'Us', 'Me'].map(label => i18n.t(label)), addLabel: i18n.t('Add a memory'),
    };
    const tabBar = this.getTabBar && this.getTabBar();
    if (tabBar) tabBar.showSelection(3, this._tabAppearance);
    const patch = { imageErrors: {}, focusedField: '', headerTop: metrics.getMetrics(true).headerTop };
    try { const rect=wx.getMenuButtonBoundingClientRect(); if(rect&&rect.top) { patch.menuButtonTop=rect.top; patch.menuButtonHeight=rect.height; patch.menuButtonBorderRadius=rect.height/2; } } catch(e){}
    this.setData(patch);
    this._insideOnShow = true;
    this.syncState(state);
    this._insideOnShow = false;
    this.refreshSharedSpace(state);
  },

  refreshSharedSpace(state) {
    if (!this._visible) return;
    const session = state && state.identity;
    if (!session || session.locked || typeof spaces.status !== 'function') return;
    const cached = typeof spaces.peekStatus === 'function' ? spaces.peekStatus() : null;
    if (cached) {
      this._spaceState = cached.space || null;
      return;
    }
    const req = (this._spaceRequest = (this._spaceRequest || 0) + 1);
    const expectedGen = `${session.userId}:${session.generation}`;
    Promise.resolve(spaces.status()).then(res => {
      if (!this._visible || req !== this._spaceRequest) return;
      const latest = store.get();
      const s = latest && latest.identity;
      const latestGen = s && !s.locked ? `${s.userId}:${s.generation}` : '';
      if (latestGen !== expectedGen) return;
      this._spaceState = res && res.space ? res.space : null;
      const effectiveSince = (this._spaceState && this._spaceState.togetherSince)
        ? this._spaceState.togetherSince
        : (latest.profile && latest.profile.togetherSince) || '';
      this.setData({ days: localDate.daysInclusive(effectiveSince) });
    }).catch(() => { /* offline fallback keeps local togetherSince */ });
  },

  syncState(state) {
    const session = state && state.identity;
    const gen = session && !session.locked ? `${session.userId}:${session.generation}` : '';
    const genChanged = gen !== (this._spaceGeneration || '');
    if (!gen) {
      this._spaceState = null;
      this._spaceGeneration = '';
    } else if (genChanged) {
      this._spaceState = null;
      this._spaceGeneration = gen;
    }
    i18n.syncPage(this, state, 3);
    const summary = memoryStats.summary(state.memories, true);
    const cached = typeof spaces.peekStatus === 'function' ? spaces.peekStatus() : null;
    if (cached) this._spaceState = cached.space || null;
    const activeSpace = cached ? cached.space : this._spaceState;
    const effectiveSince = (activeSpace && activeSpace.togetherSince)
      ? activeSpace.togetherSince
      : (state.profile && state.profile.togetherSince) || '';
    const days = localDate.daysInclusive(effectiveSince);
    if (gen && genChanged && !this._insideOnShow && this._visible) {
      this.refreshSharedSpace(state);
    }
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
    uiFeedback.tapHaptic && uiFeedback.tapHaptic(this.data.quiet);
    const settings = store.get().settings;
    store.updateSettings({ loveSent: !settings.loveSent });
    if (!settings.loveSent) store.notify(i18n.t('A little love, added to your shared space.'));
  },
  onTogether() { this.openSheet('together'); },
  onJourney() { this.openSheet('journey'); },
  onGalleryScroll(event) { this._memoryGalleryScrollLeft = event.detail.scrollLeft; },
  onSharedOpen(event) { this.openSheet('memory', event.currentTarget.dataset.id); },
  onSeeAll() { this.openSheet('library', '', 'shared'); },
  onSharedLike(event) {
    uiFeedback.tapHaptic && uiFeedback.tapHaptic(this.data.quiet);
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
