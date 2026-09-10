// Home: intro, weekly snapshot, and the five most recent memories.
const store = require('../../utils/store');
const { photos, stats } = require('../../utils/data');

Page({
  data: { theme: 'pearl', dusk: false, quiet: false, ink: '#1b1c1a', muted: '#565752', recent: [], stats: {}, weeklyPhoto: photos.meal, showDot: false },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) this.getTabBar().setData({ selected: 0 });
    this.release();
    this.unbind = store.bind(this, (state) => {
      const summary = stats(state);
      return Object.assign(store.themeOf(state), {
        recent: state.memories.slice(0, 5),
        stats: summary,
        weeklyPhoto: summary.added > 0 && state.memories[0] ? state.memories[0].photo : photos.meal,
        showDot: state.settings.reminders && !state.settings.notificationsRead,
      });
    });
  },
  onHide() { this.release(); },
  onUnload() { this.release(); },
  release() { if (this.unbind) { this.unbind(); this.unbind = null; } },

  openMemory(event) { wx.navigateTo({ url: '/pages/memory/index?id=' + encodeURIComponent(event.detail.id) }); },
  openWeekly() { wx.navigateTo({ url: '/pages/sheet/index?type=weekly' }); },
  openNotifications() { wx.navigateTo({ url: '/pages/sheet/index?type=notifications' }); },
  goAdd() { wx.switchTab({ url: '/pages/add/index' }); },
  onWeeklyPhotoError() { if (this.data.weeklyPhoto !== photos.meal) this.setData({ weeklyPhoto: photos.meal }); },

  onShareAppMessage() {
    return { title: 'Savor. Food memories, shared forever.', path: '/pages/home/index', imageUrl: photos.meal };
  },
});
