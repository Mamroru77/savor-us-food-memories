// Custom navigation bar: status bar spacer, optional back/close button, serif title, and a right slot left of the capsule.
Component({
  options: { styleIsolation: 'apply-shared' },
  properties: {
    title: { type: String, value: '' },
    subtitle: { type: String, value: '' },
    back: { type: Boolean, value: false },
    close: { type: Boolean, value: false },
    ink: { type: String, value: '#1b1c1a' },
  },
  data: { rowTop: 24, rowHeight: 32, rightInset: 102 },
  lifetimes: {
    attached() {
      const layout = getApp().getLayout();
      this.setData({ rowTop: layout.rowTop, rowHeight: layout.rowHeight, rightInset: layout.rightInset });
    },
  },
  methods: {
    goBack() {
      this.triggerEvent('back');
      if (this.data.close) return;
      if (getCurrentPages().length > 1) wx.navigateBack();
      else wx.switchTab({ url: '/pages/home/index' });
    },
  },
});
