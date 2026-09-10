// Add — port of the web AddScreen. Draft persists in savor-draft-v1;
// photos go through wx.chooseMedia → compress → USER_DATA_PATH before
// their paths ever reach the store.
const store = require('../../utils/store');
const data = require('../../utils/data');
const photos = require('../../utils/photos');
const metrics = require('../../utils/metrics');

const cityLocations = {
  Paris: { country: 'France', coordinates: [48.8535, 2.3392] },
  Tokyo: { country: 'Japan', coordinates: [35.6643, 139.6984] },
  Kyoto: { country: 'Japan', coordinates: [34.9956, 135.7649] },
  Copenhagen: { country: 'Denmark', coordinates: [55.6761, 12.5683] },
  London: { country: 'United Kingdom', coordinates: [51.5074, -0.1278] },
  'New York': { country: 'United States', coordinates: [40.7128, -74.006] },
};
const CITY_NAMES = Object.keys(cityLocations);

Page({
  data: {
    headerTop: 60,
    draft: store.starterDraft,
    knownPlace: null,
    suggestedTags: [],
    cityNames: CITY_NAMES,
    cityIndex: 0,
    today: '',
    uploading: false,
    saving: false,
    error: '',
    showTagInput: false,
    tag: '',
    dusk: false,
    quiet: false,
  },

  onLoad() {
    this.setData({
      headerTop: metrics.getMetrics().headerTop,
      draft: store.loadDraft(),
      today: new Date().toISOString().slice(0, 10),
    });
    this.saveLock = false;
    this.unsubscribe = store.subscribe(this.syncContext.bind(this));
    this.syncContext(store.get());
  },

  onUnload() {
    if (this.unsubscribe) this.unsubscribe();
  },

  onShow() {
    const state = store.get();
    const tabBar = this.getTabBar && this.getTabBar();
    if (tabBar) {
      tabBar.setData({
        selected: 2,
        dusk: state.settings.theme === 'dusk',
        quiet: state.settings.reduceMotion,
      });
    }
    this.syncContext(state);
  },

  syncContext(state) {
    const draft = this.data.draft;
    const knownPlace = state.memories.find(function (memory) {
      return memory.restaurant.toLowerCase() === draft.restaurant.trim().toLowerCase();
    }) || null;
    const suggestedTags = [];
    state.settings.cuisines.forEach(function (c) { if (draft.tags.indexOf(c) < 0) suggestedTags.push(c); });
    if (state.settings.dietary !== 'No restrictions' && draft.tags.indexOf(state.settings.dietary) < 0) {
      suggestedTags.push(state.settings.dietary);
    }
    ['Lunch', 'Travel', 'Favorite'].forEach(function (c) {
      if (draft.tags.indexOf(c) < 0 && suggestedTags.indexOf(c) < 0) suggestedTags.push(c);
    });
    const cityIndex = Math.max(0, CITY_NAMES.indexOf(draft.city));
    this.setData({
      knownPlace: knownPlace,
      suggestedTags: suggestedTags.slice(0, 4),
      cityIndex: cityIndex,
      dusk: state.settings.theme === 'dusk',
      quiet: state.settings.reduceMotion,
    });
  },

  changeDraft(key, value) {
    const draft = Object.assign({}, this.data.draft);
    draft[key] = value;
    this.setData({ draft: draft });
    store.saveDraft(draft);
    this.syncContext(store.get());
  },

  // ---------- photos ----------
  onReplacePhoto() {
    if (this.data.uploading) return;
    this.pickPhotos(1, true);
  },
  onAddMore() {
    if (this.data.uploading) return;
    const available = 4 - this.data.draft.photos.length;
    if (available <= 0) {
      store.notify('You can keep up to four photos in one memory.');
      return;
    }
    this.pickPhotos(available, false);
  },
  onRemoveExtra() {
    const draft = this.data.draft;
    const removed = draft.photos[draft.photos.length - 1];
    photos.removePhoto(removed); // only user-copied files are deleted
    this.changeDraft('photos', draft.photos.slice(0, -1));
  },
  pickPhotos(count, replace) {
    const that = this;
    this.setData({ uploading: true, error: '' });
    photos.choosePhotos(count).then(function (paths) {
      const draft = that.data.draft;
      let next;
      if (replace) {
        const discarded = draft.photos[0];
        photos.removePhoto(discarded);
        next = [paths[0]].concat(draft.photos.slice(1));
      } else {
        next = draft.photos.concat(paths).slice(0, 4);
      }
      that.setData({ uploading: false });
      that.changeDraft('photos', next);
    }).catch(function () {
      that.setData({ uploading: false }); // cancelled or failed quietly
    });
  },

  // ---------- fields ----------
  onRestaurant(event) { this.changeDraft('restaurant', event.detail.value); },
  onRestaurantClear() { this.changeDraft('restaurant', ''); },
  onNotes(event) { this.changeDraft('notes', event.detail.value); },
  onDate(event) { this.changeDraft('date', event.detail.value); },
  onCity(event) {
    const index = Number(event.detail.value);
    this.changeDraft('city', CITY_NAMES[index]);
  },
  onRating(event) { this.changeDraft('rating', Number(event.currentTarget.dataset.value)); },

  onToggleTagInput() {
    this.setData({ showTagInput: !this.data.showTagInput, tag: '' });
  },
  onTagInput(event) { this.setData({ tag: event.detail.value }); },
  onTagConfirm() {
    const value = this.data.tag.trim().slice(0, 24);
    const draft = this.data.draft;
    const exists = draft.tags.some(function (t) { return t.toLowerCase() === value.toLowerCase(); });
    if (value && !exists && draft.tags.length < 6) {
      this.changeDraft('tags', draft.tags.concat([value]));
    }
    this.setData({ tag: '', showTagInput: false });
  },
  onSuggestedTag(event) {
    const value = event.currentTarget.dataset.value;
    const draft = this.data.draft;
    if (draft.tags.length < 6 && draft.tags.indexOf(value) < 0) {
      this.changeDraft('tags', draft.tags.concat([value]));
    }
    this.setData({ showTagInput: false });
  },
  onRemoveTag(event) {
    const value = event.currentTarget.dataset.value;
    const draft = this.data.draft;
    this.changeDraft('tags', draft.tags.filter(function (t) { return t !== value; }));
  },

  // ---------- save ----------
  onSave() {
    if (this.saveLock || this.data.uploading) return;
    const draft = this.data.draft;
    if (!draft.restaurant.trim()) {
      this.setData({ error: 'Give this memory a restaurant or place name.' });
      return;
    }
    if (!draft.photos.length) {
      this.setData({ error: 'Add a photo to capture the feeling.' });
      return;
    }
    if (!data.isValidDate(draft.date)) {
      this.setData({ error: 'Choose a date for your memory.' });
      return;
    }
    this.saveLock = true;
    this.setData({ saving: true });
    const state = store.get();
    const location = cityLocations[draft.city] || cityLocations.Paris;
    const known = this.data.knownPlace;
    const memory = {
      id: data.createId(),
      restaurant: draft.restaurant.trim(),
      notes: draft.notes.trim(),
      date: draft.date,
      rating: draft.rating,
      tags: draft.tags.slice(),
      photo: draft.photos[0],
      extraPhotos: draft.photos.slice(1),
      city: known ? known.city : draft.city,
      country: known ? known.country : location.country,
      neighborhood: known ? known.neighborhood : '',
      coordinates: known ? known.coordinates : location.coordinates,
      shared: !state.settings.privateByDefault,
      liked: false,
      saved: false,
    };
    store.addMemory(memory);
    store.clearDraft();
    this.setData({
      saving: false,
      draft: store.freshDraft(),
      error: '',
      showTagInput: false,
      tag: '',
    });
    this.saveLock = false;
    store.notify('A little moment, kept forever. Memory saved.');
    wx.switchTab({ url: '/pages/home/index' });
  },

  onClose() {
    wx.switchTab({ url: '/pages/home/index' });
    store.notify('Your draft is here whenever you are ready.');
  },
});
