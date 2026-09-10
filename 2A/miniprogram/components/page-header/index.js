// Custom navigation bar: status bar spacer, optional back/close button, serif title/subtitle, and a right slot
// that always stays left of the WeChat capsule. Heights come from the measured capsule, never hard-coded.
Component({
  options: { styleIsolation: 'shared', multipleSlots: true },
  properties: {
    title: { type: String, value: '' },
    subtitle: { type: String, value: '' },
    back: { type: Boolean, value: false },
    close: { type: Boolean, value: false },
    ink: { type: String, value: '#1b1c1a' },
    transparent: { type: Boolean, value: false },
  },
  data: { rowTop: 44, rowHeight: 32, rightInset: 102, gap: 6 },
  lifetimes: {
    attached() {
      const layout = getApp().getLayout();
      this.setData({ rowTop: layout.rowTop, rowHeight: layout.rowHeight, rightInset: layout.rightInset, gap: Math.max(4, layout.rowTop - layout.statusBarHeight) });
    },
  },
  methods: {
    goBack() {
      this.triggerEvent('back');
      if (this.data.close) return;
      if (getCurrentPages().length > 1) wx.navigateBack({ fail: () => wx.switchTab({ url: '/pages/home/index' }) });
      else wx.switchTab({ url: '/pages/home/index' });
    },
  },
});
