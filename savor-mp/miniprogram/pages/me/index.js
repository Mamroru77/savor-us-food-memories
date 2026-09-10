// Me — port of the web MeScreen: profile heading, stats card with the
// memory chart (inline SVG data URI), and the five settings rows.
const store = require('../../utils/store');
const data = require('../../utils/data');
const metrics = require('../../utils/metrics');

const MENU_ROWS = [
  { title: 'Preferences', subtitle: 'Dietary, cuisines, tags', icon: 'utensils', sheet: 'preferences' },
  { title: 'Memories', subtitle: 'Export, backup, import', icon: 'archive', sheet: 'library' },
  { title: 'Privacy', subtitle: 'Manage your data', icon: 'shield-check', sheet: 'privacy' },
  { title: 'Settings', subtitle: 'Notifications, theme, more', icon: 'settings', sheet: 'settings' },
  { title: 'Help & Feedback', subtitle: "We're here to help", icon: 'circle-help', sheet: 'help' },
];

// The web draws a small line chart with inline SVG; WXSS keeps the exact
// same artwork as a data-URI background (no network, no extra file).
const CHART_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 250 52" preserveAspectRatio="none">'
  + '<path d="M0 38C22 21 35 26 51 33S82 53 105 38S131 16 156 19S207 12 250 9V52H0Z" fill="#1b1c1a" opacity=".075"/>'
  + '<path d="M0 38C22 21 35 26 51 33S82 53 105 38S131 16 156 19S207 12 250 9" fill="none" stroke="#1b1c1a" stroke-width=".6" opacity=".12"/>'
  + '<path d="M0 47C35 46 58 23 86 31S125 43 148 33S203 10 250 16" fill="none" stroke="#ffffff" stroke-width="1.15" opacity=".95"/>'
  + '<path d="M0 43C30 25 51 35 78 39S121 25 148 34S207 18 250 20" fill="none" stroke="#ffffff" stroke-width=".75" opacity=".55"/>'
  + '</svg>';

Page({
  data: {
    headerTop: 60,
    profile: data.defaultProfile,
    meals: 72,
    places: 28,
    menuRows: MENU_ROWS,
    chartUri: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(CHART_SVG),
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
    const state = store.get();
    const tabBar = this.getTabBar && this.getTabBar();
    if (tabBar) {
      tabBar.setData({
        selected: 4,
        dusk: state.settings.theme === 'dusk',
        quiet: state.settings.reduceMotion,
      });
    }
    this.syncState(state);
  },

  syncState(state) {
    const added = state.memories.length - data.initialMemories.length;
    this.setData({
      profile: state.profile,
      meals: Math.max(0, 72 + added),
      places: 28 + Math.max(0, added),
      dusk: state.settings.theme === 'dusk',
      quiet: state.settings.reduceMotion,
    });
  },

  onStatsCard() { this.openSheet('library'); },
  onEditProfile() { this.openSheet('profile'); },
  onMenuRow(event) { this.openSheet(event.currentTarget.dataset.sheet); },
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
