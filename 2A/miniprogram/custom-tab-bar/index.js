// Custom tab bar. Each tab page owns its own instance; pages sync `selected` in onShow through this.getTabBar().
// Theme changes are observed from the store so Pearl / Dusk switch without leaving the page.
const store = require('../../utils/store');

const TABS = [
  { pagePath: '/pages/home/index', text: 'Home', icon: 'house', activeIcon: 'home-filled', size: 20 },
  { pagePath: '/pages/map/index', text: 'Map', icon: 'map-shield', activeIcon: 'map-shield', size: 20 },
  { pagePath: '/pages/add/index', text: 'Add', add: true },
  { pagePath: '/pages/us/index', text: 'Us', icon: 'users-round', activeIcon: 'users-round', size: 21 },
  { pagePath: '/pages/me/index', text: 'Me', icon: 'user-round', activeIcon: 'user-round', size: 20 },
];

Component({
  data: { selected: 0, dusk: false, quiet: false, list: TABS },
  lifetimes: {
    attached() {
      this.unbind = store.bind(this, (state) => ({ dusk: state.settings.theme === 'dusk', quiet: !!state.settings.reduceMotion }));
    },
    detached() {
      if (this.unbind) { this.unbind(); this.unbind = null; }
    },
  },
  methods: {
    switchTab(event) {
      const { path, index } = event.currentTarget.dataset;
      if (Number(index) === this.data.selected) return;
      wx.switchTab({ url: path });
    },
  },
});
