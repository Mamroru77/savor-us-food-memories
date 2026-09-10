// Savor mini program entry. Pages use a custom navigation bar, so we measure the status bar and capsule once.
const store = require('./utils/store');

App({
  globalData: { layout: null },

  onLaunch() {
    this.measure();
    store.getState();
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
    if (!capsule || !capsule.height) {
      capsule = { top: statusBarHeight + 4, height: 32, left: info.windowWidth - 95, right: info.windowWidth - 7, width: 88 };
    }
    const gap = Math.max(0, capsule.top - statusBarHeight);
    const safeBottom = info.safeArea && info.screenHeight ? Math.max(0, info.screenHeight - info.safeArea.bottom) : 0;
    this.globalData.layout = {
      statusBarHeight,
      rowTop: capsule.top,
      rowHeight: capsule.height,
      headerHeight: statusBarHeight + gap * 2 + capsule.height,
      rightInset: Math.max(0, info.windowWidth - capsule.left) + 8,
      windowWidth: info.windowWidth,
      windowHeight: info.windowHeight,
      safeBottom,
    };
    return this.globalData.layout;
  },

  getLayout() {
    return this.globalData.layout || this.measure();
  },
});
