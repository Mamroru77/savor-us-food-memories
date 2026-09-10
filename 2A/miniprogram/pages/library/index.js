// Your memories: collection filters, search, JSON export (web-compatible) and import from chat files.
const store = require('../../utils/store');
const image = require('../../utils/image');
const { today, plural, DIARY_VERSION } = require('../../utils/data');

const TABS = [
  { value: 'all', label: 'All memories' },
  { value: 'shared', label: 'Shared' },
  { value: 'favorites', label: 'Favorites' },
];

Page({
  data: { theme: 'pearl', dusk: false, quiet: false, ink: '#1b1c1a', muted: '#565752', tabs: TABS, filter: 'all', query: '', list: [], countLabel: '', error: '', title: 'Your memories', exporting: false },

  onLoad(query) {
    const filter = query && TABS.some((tab) => tab.value === query.filter) ? query.filter : 'all';
    this.setData({ filter, title: filter === 'shared' ? 'Our memories' : 'Your memories' });
  },
  onShow() {
    this.release();
    this.unbind = store.bind(this, (state) => {
      this.memories = state.memories;
      return Object.assign(store.themeOf(state), this.compute(state.memories));
    });
  },
  onHide() { this.release(); },
  onUnload() { this.release(); },
  release() { if (this.unbind) { this.unbind(); this.unbind = null; } },

  compute(memories) {
    const needle = this.data.query.trim().toLowerCase();
    const filter = this.data.filter;
    const list = memories.filter((item) => {
      if (filter === 'shared' && !item.shared) return false;
      if (filter === 'favorites' && !(item.saved || item.liked)) return false;
      return !needle || (item.restaurant + ' ' + item.city + ' ' + item.tags.join(' ')).toLowerCase().indexOf(needle) >= 0;
    });
    return { list, countLabel: plural(list.length, 'moment', 'moments') + ' worth keeping' };
  },
  refresh() { this.setData(this.compute(this.memories || store.getState().memories)); },
  setTab(event) { this.setData({ filter: event.currentTarget.dataset.value }, () => this.refresh()); },
  onQuery(event) { this.setData({ query: event.detail.value }, () => this.refresh()); },
  openMemory(event) { wx.navigateTo({ url: '/pages/memory/index?id=' + encodeURIComponent(event.detail.id) }); },

  // Export: user photos become data URIs so the same file opens in the web app; bundled photos keep /images paths.
  exportBackup() {
    if (this.data.exporting) return;
    this.setData({ exporting: true, error: '' });
    wx.showLoading({ title: 'Preparing backup', mask: true });
    setTimeout(() => {
      let json = '';
      let path = '';
      const name = 'savor-memories-' + today() + '.json';
      try {
        const memories = store.getState().memories.map(image.exportMemory);
        json = JSON.stringify({ version: DIARY_VERSION, app: 'savor', exportedAt: new Date().toISOString(), memories }, null, 2);
        path = image.writeText(name, json);
      } catch (error) {
        wx.hideLoading();
        this.setData({ exporting: false, error: 'The backup could not be prepared. Free up some space and try again.' });
        return;
      }
      wx.hideLoading();
      const finish = () => this.setData({ exporting: false });
      if (wx.canIUse('shareFileMessage')) {
        wx.shareFileMessage({
          filePath: path,
          fileName: name,
          success: () => { store.toast('Your memories, ready to take with you. Backup shared.'); finish(); },
          fail: (error) => {
            if (/cancel/i.test(error.errMsg || '')) { finish(); return; }
            this.copyBackup(json, finish);
          },
        });
        return;
      }
      this.copyBackup(json, finish);
    }, 60);
  },
  copyBackup(json, done) {
    if (json.length > 4 * 1024 * 1024) {
      this.setData({ error: 'This backup is too large for the clipboard. Share the file from a device that supports file sharing.' });
      done();
      return;
    }
    wx.setClipboardData({
      data: json,
      success: () => store.toast('Backup copied to your clipboard.'),
      fail: () => this.setData({ error: 'Could not share or copy the backup on this device.' }),
      complete: done,
    });
  },

  importBackup() {
    if (!wx.canIUse('chooseMessageFile')) { this.setData({ error: 'Importing needs a newer WeChat version.' }); return; }
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: ['json'],
      success: (res) => {
        const file = res.tempFiles && res.tempFiles[0];
        if (!file) return;
        if (file.size > 10 * 1024 * 1024) { this.setData({ error: 'Please use a backup smaller than 10 MB.' }); return; }
        wx.showLoading({ title: 'Reading backup', mask: true });
        image.readText(file.path).then((text) => {
          let parsed;
          try { parsed = JSON.parse(text); } catch (error) { throw new Error('This file could not be read. Choose a Savor JSON backup.'); }
          const items = Array.isArray(parsed) ? parsed : parsed && parsed.memories;
          if (!Array.isArray(items) || !items.length || items.length > 500) throw new Error('This is not a valid Savor backup. Choose a JSON file exported from Savor.');
          const count = store.importMemories(items);
          wx.hideLoading();
          this.setData({ error: '' });
          store.toast(count ? plural(count, 'memory', 'memories') + ' welcomed back to your diary.' : 'Your diary already has every memory in this backup.');
        }).catch((error) => {
          wx.hideLoading();
          this.setData({ error: error.message || 'Could not import this file.' });
        });
      },
      fail: (error) => { if (!/cancel/i.test(error.errMsg || '')) this.setData({ error: 'Could not open that file.' }); },
    });
  },
});
