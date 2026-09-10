// Savor mini program entry. Pages use a custom navigation bar, so the status bar and capsule are measured once.
const store = require('./utils/store');
const image = require('./utils/image');
const data = require('./utils/data');

App({
  globalData: { layout: null },

  onLaunch() {
    this.measure();
    const state = store.getState();
    this.cleanupFiles(state);
  },

  onHide() { store.flush(); },

  // Remove user files that no memory, draft, or profile references (deleted memories, interrupted picks).
  cleanupFiles(state) {
    try {
      const keep = image.referencedFiles(state.memories, state.profile);
      const draft = wx.getStorageSync(data.DRAFT_KEY);
      if (draft && Array.isArray(draft.photos)) draft.photos.forEach((path) => { if (image.isUserFile(path)) keep[path] = true; });
      image.sweepOrphans(keep);
    } catch (error) { /* best effort housekeeping */ }
  },

  measure() {
    let info;
    try {
      info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    } catch (error) {
      info = { statusBarHeight: 20, windowWidth: 375, windowHeight: 667, screenHeight: 667, safeArea: null };
    }
    let capsule = null;
    try { capsule = wx.getMenuButtonBoundingClientRect(); } catch (error) { capsule = null; }
    const statusBarHeight = info.statusBarHeight || 20;
    if (!capsule || !capsule.height || capsule.top < statusBarHeight - 2) {
      capsule = { top: statusBarHeight + 4, height: 32, left: info.windowWidth - 95, right: info.windowWidth - 7, width: 88 };
    }
    const gap = Math.max(4, capsule.top - statusBarHeight);
    const safeBottom = info.safeArea && info.screenHeight ? Math.max(0, info.screenHeight - info.safeArea.bottom) : 0;
    this.globalData.layout = {
      statusBarHeight,
      rowTop: capsule.top,
      rowHeight: capsule.height,
      headerHeight: capsule.top + capsule.height + gap,
      rightInset: Math.max(0, info.windowWidth - capsule.left) + 8,
      windowWidth: info.windowWidth,
      windowHeight: info.windowHeight,
      safeBottom,
      pixelRatio: info.pixelRatio || 2,
    };
    return this.globalData.layout;
  },

  getLayout() {
    return this.globalData.layout || this.measure();
  },
});
