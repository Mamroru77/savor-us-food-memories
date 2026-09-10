// Custom TabBar — the release blocker component.
//
// Design rules (learned from the four failed ports):
//   1. ZERO `require()` calls. The previous versions did
//      `require('../../utils/store')` here, which resolves OUTSIDE the
//      miniprogram root, crashed this component on load, and — because
//      app.json sets tabBar.custom — left the app with NO bottom
//      navigation at all. This file must stay dependency-free so the tab
//      bar can never disappear again.
//   2. Tab pages push their own state into this component from onShow:
//        this.getTabBar().setData({ selected, dusk, quiet })
//      The tab bar never pulls from the store itself.
//   3. Switching tabs is a plain wx.switchTab to app.json tabBar pagePaths.

Component({
  data: {
    selected: 0,
    dusk: false,
    quiet: false,
    list: [
      { pagePath: '/pages/home/index', text: 'Home', icon: 'house', activeIcon: 'home-filled', size: 46 },
      { pagePath: '/pages/map/index', text: 'Map', icon: 'map-shield', activeIcon: 'map-shield', size: 46 },
      { pagePath: '/pages/add/index', text: 'Add', add: true },
      { pagePath: '/pages/us/index', text: 'Us', icon: 'users-round', activeIcon: 'users-round', size: 48 },
      { pagePath: '/pages/me/index', text: 'Me', icon: 'user-round', activeIcon: 'user-round', size: 46 },
    ],
  },

  methods: {
    onTabTap(event) {
      const { path, index } = event.currentTarget.dataset;
      if (index === this.data.selected) return;
      wx.switchTab({ url: path });
    },
  },
});
