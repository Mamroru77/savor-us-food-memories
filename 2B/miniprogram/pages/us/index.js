const store = require('../../utils/store');
const { photos, stats, sortShared, formatDate } = require('../../utils/data');

Page({
  data: { theme: 'pearl', dusk: false, ink: '#1b1c1a', muted: '#565752', profile: {}, loveSent: false, stats: {}, shared: [], alexPhoto: photos.alex, parisPhoto: photos.paris },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) this.getTabBar().setData({ selected: 3 });
    this.release();
    this.unbind = store.bind(this, (state) => Object.assign(store.themeOf(state), {
      profile: state.profile,
      loveSent: state.settings.loveSent,
      stats: stats(state),
      shared: sortShared(state.memories).map((item) => Object.assign({}, item, { cover: item.placePhoto || item.photo, dateLabel: formatDate(item.date) })),
    }));
  },
  onHide() { this.release(); },
  onUnload() { this.release(); },
  release() { if (this.unbind) { this.unbind(); this.unbind = null; } },

  toggleLove() {
    const next = !this.data.loveSent;
    store.updateSettings({ loveSent: next });
    if (next) store.toast('A little love, added to your shared space.');
  },
  openTogether() { wx.navigateTo({ url: '/pages/sheet/index?type=together' }); },
  openJourney() { wx.navigateTo({ url: '/pages/sheet/index?type=journey' }); },
  seeAll() { wx.navigateTo({ url: '/pages/library/index?filter=shared' }); },
  openMemory(event) { wx.navigateTo({ url: '/pages/memory/index?id=' + encodeURIComponent(event.currentTarget.dataset.id) }); },
  toggleLike(event) {
    const id = event.currentTarget.dataset.id;
    const item = this.data.shared.find((entry) => entry.id === id);
    if (item) store.updateMemory(id, { liked: !item.liked });
  },

  onShareAppMessage() {
    return { title: this.data.profile.name + ' & ' + this.data.profile.partner + ': our food story', path: '/pages/us/index', imageUrl: photos.paris };
  },
});
