// Your memories: collection filters, search, JSON export via chat, JSON import from chat files.
const store = require('../../utils/store');
const image = require('../../utils/image');
const { isMemory, today } = require('../../utils/data');

const TABS = [
  { value: 'all', label: 'All memories' },
  { value: 'shared', label: 'Shared' },
  { value: 'favorites', label: 'Favorites' },
];

Page({
  data: { theme: 'pearl', dusk: false, ink: '#1b1c1a', muted: '#565752', tabs: TABS, filter: 'all', query: '', list: [], count: 0, error: '' },

  onLoad(query) {
    if (TABS.some((tab) => tab.value === query.filter)) this.setData({ filter: query.filter });
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
    return { list, count: list.length };
  },
  refresh() { this.setData(this.compute(this.memories || store.getState().memories)); },
  setTab(event) { this.setData({ filter: event.currentTarget.dataset.value }, () => this.refresh()); },
  onQuery(event) { this.setData({ query: event.detail.value }, () => this.refresh()); },
  openMemory(event) { wx.navigateTo({ url: '/pages/memory/index?id=' + encodeURIComponent(event.detail.id) }); },

  exportBackup() {
    const json = JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), memories: store.getState().memories }, null, 2);
    const name = 'savor-memories-' + today() + '.json';
    try {
      const path = image.writeText(name, json);
      if (wx.canIUse('shareFileMessage')) {
        wx.shareFileMessage({
          filePath: path, fileName: name,
          success: () => store.toast('Backup shared. Keep it somewhere safe.'),
          fail: (error) => { if (!/cancel/i.test(error.errMsg || '')) this.copyBackup(json); },
        });
        return;
      }
    } catch (error) { /* fall back to the clipboard below */ }
    this.copyBackup(json);
  },
  copyBackup(json) {
    wx.setClipboardData({ data: json, success: () => store.toast('Backup copied to your clipboard.') });
  },

  importBackup() {
    if (!wx.canIUse('chooseMessageFile')) { this.setData({ error: 'Importing is not available on this device.' }); return; }
    wx.chooseMessageFile({
      count: 1, type: 'file', extension: ['json'],
      success: (res) => {
        const file = res.tempFiles && res.tempFiles[0];
        if (!file) return;
        if (file.size > 10 * 1024 * 1024) { this.setData({ error: 'Please use a backup smaller than 10 MB.' }); return; }
        image.readText(file.path).then((text) => {
          let parsed;
          try { parsed = JSON.parse(text); } catch (error) { throw new Error('This file could not be read. Choose a Savor JSON backup.'); }
          const items = Array.isArray(parsed) ? parsed : parsed && parsed.memories;
          if (!Array.isArray(items) || items.length > 500 || !items.every(isMemory)) throw new Error('This is not a valid Savor backup.');
          const count = store.importMemories(items);
          this.setData({ error: '' });
          store.toast(count ? count + (count === 1 ? ' memory' : ' memories') + ' welcomed back.' : 'Every memory in this backup is already here.');
        }).catch((error) => this.setData({ error: error.message }));
      },
      fail: (error) => { if (!/cancel/i.test(error.errMsg || '')) this.setData({ error: 'Could not open that file.' }); },
    });
  },
});
