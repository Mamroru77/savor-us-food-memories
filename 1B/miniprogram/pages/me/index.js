const store = require('../../utils/store');
const { stats } = require('../../utils/data');
const { svgDataUri } = require('../../utils/icons');

const rows = [
  { title: 'Preferences', subtitle: 'Dietary, cuisines, tags', icon: 'utensils', url: '/pages/sheet/index?type=preferences' },
  { title: 'Memories', subtitle: 'Export, backup, import', icon: 'archive', url: '/pages/library/index' },
  { title: 'Privacy', subtitle: 'Manage your data', icon: 'shield-check', url: '/pages/sheet/index?type=privacy' },
  { title: 'Settings', subtitle: 'Notifications, theme, more', icon: 'settings', url: '/pages/sheet/index?type=settings' },
  { title: 'Help & Feedback', subtitle: "We're here to help", icon: 'circle-help', url: '/pages/sheet/index?type=help' },
];

function chart(dusk) {
  const area = dusk ? '#edece5' : '#1b1c1a';
  const line = dusk ? '#e6ecd8' : '#ffffff';
  return svgDataUri('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 250 52" preserveAspectRatio="none" fill="none">'
    + '<path d="M0 38C22 21 35 26 51 33S82 53 105 38S131 16 156 19S207 12 250 9V52H0Z" fill="' + area + '" fill-opacity=".075"/>'
    + '<path d="M0 38C22 21 35 26 51 33S82 53 105 38S131 16 156 19S207 12 250 9" stroke="' + area + '" stroke-width=".6" stroke-opacity=".12"/>'
    + '<path d="M0 47C35 46 58 23 86 31S125 43 148 33S203 10 250 16" stroke="' + line + '" stroke-width="1.15" stroke-opacity=".95"/>'
    + '<path d="M0 43C30 25 51 35 78 39S121 25 148 34S207 18 250 20" stroke="' + line + '" stroke-width=".75" stroke-opacity=".55"/></svg>');
}

Page({
  data: { theme: 'pearl', dusk: false, ink: '#1b1c1a', muted: '#565752', profile: {}, stats: {}, rows, chart: chart(false) },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) this.getTabBar().setData({ selected: 4 });
    this.release();
    this.unbind = store.bind(this, (state) => {
      const theme = store.themeOf(state);
      return Object.assign(theme, { profile: state.profile, stats: stats(state), chart: chart(theme.dusk) });
    });
  },
  onHide() { this.release(); },
  onUnload() { this.release(); },
  release() { if (this.unbind) { this.unbind(); this.unbind = null; } },

  editProfile() { wx.navigateTo({ url: '/pages/sheet/index?type=profile' }); },
  openLibrary() { wx.navigateTo({ url: '/pages/library/index' }); },
  openRow(event) { wx.navigateTo({ url: event.currentTarget.dataset.url }); },
});
