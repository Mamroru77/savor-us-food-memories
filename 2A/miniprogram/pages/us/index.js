// Us: the shared space. Together card, journey card, and shared moments gallery.
const store = require('../../utils/store');
const { photos, stats, sortShared, formatDate } = require('../../utils/data');

Page({
  data: { theme: 'pearl', dusk: false, quiet: false, ink: '#1b1c1a', muted: '#565752', profile: {}, stats: {}, shared: [], loveSent: false, alexPhoto: photos.alex, parisPhoto: photos.paris },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) this.getTabBar().setData({ selected: 3 });
    this.release();
    this.unbind = store.bind(this, (state) => Object.assign(store.themeOf(state), {
      profile: state.profile,
      stats: stats(state),
      loveSent: state.settings.loveSent,
      shared: sortShared(state.memories).map((item) => ({
        id: item.id, restaurant: item.restaurant, liked: item.liked, cover: item.placePhoto || item.photo, dateLabel: formatDate(item.date),
      })),
    }));
  },
  onHide() { this.release(); },
  onUnload() { this.release(); },
  release() { if (this.unbind) { this.unbind(); this.unbind = null; } },

  openTogether() { wx.navigateTo({ url: '/pages/sheet/index?type=together' }); },
  openJourney() { wx.navigateTo({ url: '/pages/sheet/index?type=journey' }); },
  openLibrary() { wx.navigateTo({ url: '/pages/library/index?filter=shared' }); },
  openMemory(event) { wx.navigateTo({ url: '/pages/memory/index?id=' + encodeURIComponent(event.currentTarget.dataset.id) }); },
  toggleLove() {
    const next = !this.data.loveSent;
    store.updateSettings({ loveSent: next });
    if (next) store.toast('A little love, added to your shared space.');
  },
  toggleLike(event) {
    const id = event.currentTarget.dataset.id;
    const target = store.getState().memories.find((item) => item.id === id);
    if (target) store.updateMemory(id, { liked: !target.liked });
  },

  onShareAppMessage() {
    return { title: 'Our little world on Savor', path: '/pages/us/index', imageUrl: photos.paris };
  },
});
