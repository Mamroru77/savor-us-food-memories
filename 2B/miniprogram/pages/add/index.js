// Add a Memory: photos, place, notes, date, rating, tags. The draft survives leaving the tab.
const store = require('../../utils/store');
const image = require('../../utils/image');
const { photos, createId, isValidDate, isSafeImage, today, cityLocations, formatDate } = require('../../utils/data');

const DRAFT_KEY = 'savor-draft-v1';
const CITIES = Object.keys(cityLocations);
const starter = {
  restaurant: 'Le Comptoir', notes: 'Perfect late-night dinner. The duck was unforgettable.', date: '2025-08-26',
  rating: 4, tags: ['French', 'Dinner', 'Date Night'], photos: [photos.meal], city: 'Paris',
};

function loadDraft() {
  try {
    const saved = wx.getStorageSync(DRAFT_KEY);
    if (saved && typeof saved === 'object' && typeof saved.restaurant === 'string' && typeof saved.notes === 'string'
      && (saved.date === '' || isValidDate(saved.date))
      && Array.isArray(saved.photos) && saved.photos.length <= 4 && saved.photos.every(isSafeImage)
      && Array.isArray(saved.tags) && saved.tags.every((tag) => typeof tag === 'string')
      && typeof saved.rating === 'number' && saved.rating >= 1 && saved.rating <= 5 && typeof saved.city === 'string') {
      return Object.assign({}, starter, saved, { photos: saved.photos.map(image.safePhoto) });
    }
  } catch (error) { /* fall through to the starter draft */ }
  return Object.assign({}, starter);
}

Page({
  data: {
    theme: 'pearl', dusk: false, ink: '#1b1c1a', muted: '#565752', buttonInk: '#ffffff',
    draft: starter, dateLabel: '', cities: CITIES, cityIndex: 0, knownPlace: false, stars: [],
    showTagInput: false, tag: '', suggestions: [], error: '', busy: false, saving: false, today: today(),
  },

  onLoad() { this.applyDraft(loadDraft()); },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) this.getTabBar().setData({ selected: 2 });
    this.release();
    this.unbind = store.bind(this, (state) => Object.assign(store.themeOf(state), this.derive(this.data.draft, state)));
  },
  onHide() { this.release(); },
  onUnload() { this.release(); },
  release() { if (this.unbind) { this.unbind(); this.unbind = null; } },

  derive(draft, state) {
    const name = draft.restaurant.trim().toLowerCase();
    const known = !!name && state.memories.some((item) => item.restaurant.toLowerCase() === name);
    const pool = state.settings.cuisines
      .concat(state.settings.dietary === 'No restrictions' ? [] : [state.settings.dietary], ['Lunch', 'Travel', 'Favorite']);
    const suggestions = pool.filter((tag, index) => pool.indexOf(tag) === index && draft.tags.indexOf(tag) < 0).slice(0, 4);
    return {
      knownPlace: known,
      suggestions,
      dateLabel: draft.date ? formatDate(draft.date) : 'Choose a date',
      cityIndex: Math.max(0, CITIES.indexOf(draft.city)),
      stars: [1, 2, 3, 4, 5].map((value) => ({ value, filled: value <= draft.rating })),
    };
  },

  applyDraft(draft) {
    this.setData(Object.assign({ draft }, this.derive(draft, store.getState())));
    try { wx.setStorageSync(DRAFT_KEY, draft); } catch (error) { /* the form still works without a saved draft */ }
  },
  patch(changes) { this.applyDraft(Object.assign({}, this.data.draft, changes)); },

  onField(event) { this.patch({ [event.currentTarget.dataset.key]: event.detail.value }); },
  clearRestaurant() { this.patch({ restaurant: '' }); },
  onCity(event) { this.patch({ city: CITIES[Number(event.detail.value)] || 'Paris' }); },
  onDate(event) { this.patch({ date: event.detail.value }); },
  setRating(event) { this.patch({ rating: Number(event.currentTarget.dataset.value) }); },

  removeTag(event) {
    const tag = event.currentTarget.dataset.tag;
    this.patch({ tags: this.data.draft.tags.filter((item) => item !== tag) });
  },
  toggleTagInput() { this.setData({ showTagInput: !this.data.showTagInput, tag: '' }); },
  onTagInput(event) { this.setData({ tag: event.detail.value }); },
  addTag(event) {
    const raw = (event && event.currentTarget && event.currentTarget.dataset.tag) || this.data.tag;
    const clean = String(raw || '').trim().slice(0, 24);
    if (clean && !this.data.draft.tags.some((item) => item.toLowerCase() === clean.toLowerCase())) {
      this.patch({ tags: this.data.draft.tags.concat([clean]).slice(0, 6) });
    }
    this.setData({ tag: '', showTagInput: false });
  },
  confirmTag() { this.addTag(); },

  pick(count, apply) {
    if (this.data.busy) return;
    this.setData({ busy: true, error: '' });
    image.choosePhotos(count)
      .then((paths) => { if (paths.length) apply(paths); })
      .catch((error) => this.setData({ error: error.message }))
      .then(() => this.setData({ busy: false }));
  },
  replacePhoto() {
    this.pick(1, (paths) => {
      const list = this.data.draft.photos.slice();
      const previous = list[0];
      list[0] = paths[0];
      if (previous && previous !== paths[0]) image.removePhoto(previous);
      this.patch({ photos: list.slice(0, 4) });
    });
  },
  addPhotos() {
    const room = 4 - this.data.draft.photos.length;
    if (room <= 0) { store.toast('Up to four photos per memory.'); return; }
    this.pick(room, (paths) => this.patch({ photos: this.data.draft.photos.concat(paths).slice(0, 4) }));
  },
  removeLastPhoto() {
    const list = this.data.draft.photos.slice();
    image.removePhoto(list.pop());
    this.patch({ photos: list });
  },

  closeDraft() {
    store.toast('Your draft is here whenever you are ready.');
    wx.switchTab({ url: '/pages/home/index' });
  },

  save() {
    if (this.data.busy || this.data.saving) return;
    const draft = this.data.draft;
    if (!draft.restaurant.trim()) { this.setData({ error: 'Give this memory a restaurant or place name.' }); return; }
    if (!draft.photos.length) { this.setData({ error: 'Add a photo to capture the feeling.' }); return; }
    if (!isValidDate(draft.date)) { this.setData({ error: 'Choose a date for your memory.' }); return; }
    this.setData({ saving: true, error: '' });
    const state = store.getState();
    const known = state.memories.find((item) => item.restaurant.toLowerCase() === draft.restaurant.trim().toLowerCase());
    const location = cityLocations[draft.city] || cityLocations.Paris;
    store.addMemory({
      id: createId(), restaurant: draft.restaurant.trim(), notes: draft.notes.trim(), date: draft.date, rating: draft.rating,
      tags: draft.tags, photo: draft.photos[0], extraPhotos: draft.photos.slice(1),
      city: known ? known.city : draft.city, country: known ? known.country : location.country,
      neighborhood: known ? known.neighborhood : '', coordinates: known ? known.coordinates : location.coordinates,
      shared: !state.settings.privateByDefault, liked: false, saved: false,
    });
    this.applyDraft(Object.assign({}, starter, { restaurant: '', notes: '', date: today(), photos: [], tags: [] }));
    this.setData({ saving: false });
    store.toast('A little moment, kept forever.');
    wx.switchTab({ url: '/pages/home/index' });
  },
});
