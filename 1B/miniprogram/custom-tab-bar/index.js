// Each tab page owns its own tab bar instance; pages sync `selected` in onShow via this.getTabBar().
const store = require('../../utils/store');

Component({
  data: {
    selected: 0,
    dusk: false,
    list: [
      { pagePath: '/pages/home/index', text: 'Home', icon: 'house', activeIcon: 'home-filled', size: 20 },
      { pagePath: '/pages/map/index', text: 'Map', icon: 'map-shield', activeIcon: 'map-shield', size: 20 },
      { pagePath: '/pages/add/index', text: 'Add', add: true },
      { pagePath: '/pages/us/index', text: 'Us', icon: 'users-round', activeIcon: 'users-round', size: 21 },
      { pagePath: '/pages/me/index', text: 'Me', icon: 'user-round', activeIcon: 'user-round', size: 20 },
    ],
  },
  lifetimes: {
    attached() {
      this.unbind = store.bind(this, (state) => ({ dusk: state.settings.theme === 'dusk' }));
    },
    detached() {
      if (this.unbind) this.unbind();
    },
  },
  methods: {
    switchTab(event) {
      const { path, index } = event.currentTarget.dataset;
      if (index === this.data.selected) return;
      wx.switchTab({ url: path });
    },
  },
});
