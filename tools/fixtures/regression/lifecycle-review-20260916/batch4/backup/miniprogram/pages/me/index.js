const i18n = require('../../utils/i18n');
const uiFeedback = require('../../utils/uiFeedback');
// Me — port of the web MeScreen: profile heading, stats card with the
// memory chart (inline SVG data URI), and the five settings rows.
const store = require('../../utils/store');
const data = require('../../utils/data');
const metrics = require('../../utils/metrics');
const memoryStats = require('../../utils/memoryStats');

const MENU_ROWS = [
  { title:'云端工具 / Cloud tools',subtitle:'备份、偏好、提醒与反馈 / Private cloud tasks',icon:'archive',sheet:'workspace' },
  { title:'年度报告 / Annual reports',subtitle:'真实日记、里程碑与主动分享 / Your real memories',icon:'archive',sheet:'reports' },
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
  onImageError: uiFeedback.onImageError,
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
    i18n.syncPage(this, state, 4);
    const summary = memoryStats.summary(state.memories);
    this.setData({
      savedCount: memoryStats.countSaved(state.memories, false),
      chartUri: memoryStats.chart(summary.counts),
      profile: state.profile,
      menuRows: MENU_ROWS.map(row => Object.assign({}, row, { title: i18n.t(row.title), subtitle: i18n.t(row.subtitle) })),
      ambientPhoto: data.isSafeImage(state.profile.avatar) ? state.profile.avatar : data.photos.meal,
      meals: summary.meals,
      places: summary.places,
      dusk: state.settings.theme === 'dusk',
      quiet: state.settings.reduceMotion,
    });
  },

  onStatsCard() { this.openSheet('library'); },
  onEditProfile() { this.openSheet('profile'); },
  onMenuRow(event) { if(['workspace','reports'].includes(event.currentTarget.dataset.sheet)){wx.navigateTo({url:event.currentTarget.dataset.sheet==='workspace'?'/pages/workspace/index':'/pages/reports/index'});return;} if(event.currentTarget.dataset.sheet==='space'){wx.navigateTo({url:'/pages/space/index'});return;}if(event.currentTarget.dataset.sheet==='account'){wx.navigateTo({url:'/pages/account/index'});return;}this.openSheet(event.currentTarget.dataset.sheet); },
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
