// Memory detail: photos, meta, notes, tags, love / save / share-with-us, native forward, and delete with confirmation.
const store = require('../../utils/store');
const image = require('../../utils/image');
const { formatDate, photos } = require('../../utils/data');

Page({
  data: {
    theme: 'pearl', dusk: false, quiet: false, ink: '#1b1c1a', muted: '#565752',
    memory: null, missing: false, images: [], photoIndex: 0, showLocations: true, dateLabel: '', stars: [], tags: [],
  },

  onLoad(query) {
    this.id = decodeURIComponent((query && query.id) || '');
    this.unbind = store.bind(this, (state) => {
      const found = state.memories.find((item) => item.id === this.id) || null;
      const memory = found ? image.verifyMemory(found) : null;
      const images = memory ? [memory.photo].concat(memory.extraPhotos || []) : [];
      return Object.assign(store.themeOf(state), {
        memory,
        missing: !memory,
        images,
        photoIndex: Math.min(this.data.photoIndex, Math.max(0, images.length - 1)),
        showLocations: state.settings.showLocations,
        dateLabel: memory ? formatDate(memory.date) : '',
        stars: memory ? [1, 2, 3, 4, 5].map((value) => ({ value, filled: value <= memory.rating })) : [],
        tags: memory ? memory.tags.map((tag, index) => ({ tag, index })) : [],
      });
    });
  },
  onUnload() { if (this.unbind) { this.unbind(); this.unbind = null; } },

  selectPhoto(event) { this.setData({ photoIndex: Number(event.currentTarget.dataset.index) }); },
  previewPhoto() {
    if (this.data.images.length) wx.previewImage({ current: this.data.images[this.data.photoIndex], urls: this.data.images });
  },
  onPhotoError() {
    const images = this.data.images.slice();
    if (images[this.data.photoIndex] !== photos.meal) { images[this.data.photoIndex] = photos.meal; this.setData({ images }); }
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
    if (!this.data.memory) return;
    wx.showModal({
      title: 'Let this memory go?',
      content: 'This cannot be undone.',
      confirmText: 'Remove',
      cancelText: 'Keep it',
      confirmColor: '#954c38',
      success: (res) => {
        if (!res.confirm) return;
        store.deleteMemory(this.id);
        store.toast('Memory removed from your diary.');
        wx.navigateBack({ fail: () => wx.switchTab({ url: '/pages/home/index' }) });
      },
    });
  },
  goHome() { wx.switchTab({ url: '/pages/home/index' }); },

  onShareAppMessage() {
    const memory = this.data.memory;
    if (!memory) return { title: 'Savor. Food memories, shared forever.', path: '/pages/home/index', imageUrl: photos.meal };
    return {
      title: (memory.restaurant + ': ' + (memory.notes || 'a moment worth keeping')).slice(0, 60),
      path: '/pages/memory/index?id=' + encodeURIComponent(memory.id),
      imageUrl: memory.photo,
    };
  },
});
