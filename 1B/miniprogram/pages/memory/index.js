const store = require('../../utils/store');
const { formatDate } = require('../../utils/data');

Page({
  data: { theme: 'pearl', dusk: false, ink: '#1b1c1a', muted: '#565752', memory: null, images: [], photoIndex: 0, showLocations: true, dateLabel: '', stars: [] },

  onLoad(query) {
    try {
      this.id = decodeURIComponent(query && query.id ? query.id : '');
    } catch (error) {
      this.id = ''; // a malformed query must not crash the page
    }
    this.unbind = store.bind(this, (state) => {
      const memory = state.memories.find((item) => item.id === this.id) || null;
      const images = memory ? [memory.photo].concat(memory.extraPhotos || []) : [];
      return Object.assign(store.themeOf(state), {
        memory, images,
        photoIndex: Math.min(this.data.photoIndex, Math.max(0, images.length - 1)),
        showLocations: state.settings.showLocations,
        dateLabel: memory ? formatDate(memory.date) : '',
        stars: memory ? [1, 2, 3, 4, 5].map((value) => ({ value, filled: value <= memory.rating })) : [],
      });
    });
  },
  onUnload() { if (this.unbind) this.unbind(); },

  selectPhoto(event) { this.setData({ photoIndex: Number(event.currentTarget.dataset.index) }); },
  previewPhoto() {
    if (this.data.images.length) wx.previewImage({ current: this.data.images[this.data.photoIndex], urls: this.data.images });
  },
  toggle(event) {
    const key = event.currentTarget.dataset.key;
    const memory = this.data.memory;
    if (!memory) return;
    const next = !memory[key];
    store.updateMemory(memory.id, { [key]: next });
    if (key === 'shared') store.toast(next ? 'A new chapter in your shared story.' : 'This moment is now just for you.');
  },
  remove() {
    wx.showModal({
      title: 'Let this memory go?', content: 'This cannot be undone.', confirmText: 'Yes', cancelText: 'Keep', confirmColor: '#954c38',
      success: (res) => {
        if (!res.confirm) return;
        store.deleteMemory(this.id);
        store.toast('Memory removed from your diary.');
        wx.navigateBack();
      },
    });
  },

  onShareAppMessage() {
    const memory = this.data.memory;
    if (!memory) return { title: 'Savor', path: '/pages/home/index' };
    return {
      title: (memory.restaurant + ': ' + (memory.notes || 'a moment worth keeping')).slice(0, 60),
      path: '/pages/memory/index?id=' + encodeURIComponent(memory.id),
      imageUrl: memory.photo,
    };
  },
});
