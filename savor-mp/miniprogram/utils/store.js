// Diary store — CommonJS singleton port of the web baseline (src/store.tsx).
// Storage keys, defaults, validation, migration and dedupe semantics are
// preserved; localStorage is replaced by wx storage with a corrupt-data
// fallback, and photo files are cleaned up on delete (utils/photos).
//
// NOTE: the custom tab bar must never require this module. Pages push
// theme state into the tab bar via this.getTabBar().setData(...) so a
// store failure can never take down navigation.

const data = require('./data');

const STORAGE_KEY = 'savor-diary-v1';
const DRAFT_KEY = 'savor-draft-v1';

const state = {
  memories: data.initialMemories.slice(),
  profile: Object.assign({}, data.defaultProfile),
  settings: Object.assign({}, data.defaultSettings),
  feedback: [],
};

let loaded = false;
const listeners = [];
const toastListeners = [];
let toastTimer = null;
let currentToast = null;

function defaults() {
  return {
    memories: data.initialMemories.slice(),
    profile: Object.assign({}, data.defaultProfile),
    settings: Object.assign({}, data.defaultSettings),
    feedback: [],
  };
}

// Strict mode: every memory must fully validate (web parity).
function allMemoriesValid(list) {
  return Array.isArray(list) && list.every(data.isMemory);
}

// Migration / normalize path: accept older or slightly malformed entries,
// coerce known shapes, and drop only irreparable items.
function normalizeMemory(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const item = Object.assign({}, raw);
  item.id = typeof item.id === 'string' && item.id ? item.id : data.createId();
  item.restaurant = typeof item.restaurant === 'string' ? item.restaurant.trim() : '';
  item.city = typeof item.city === 'string' ? item.city : '';
  item.country = typeof item.country === 'string' ? item.country : '';
  item.neighborhood = typeof item.neighborhood === 'string' ? item.neighborhood : '';
  item.notes = typeof item.notes === 'string' ? item.notes : '';
  item.rating = Math.round(Number(item.rating));
  if (!(item.rating >= 1 && item.rating <= 5)) item.rating = Math.min(5, Math.max(1, item.rating || 3));
  item.tags = Array.isArray(item.tags) ? item.tags.filter(function (t) { return typeof t === 'string'; }) : [];
  item.photo = typeof item.photo === 'string' ? item.photo : data.photos.meal;
  if (item.placePhoto !== undefined && !data.isSafeImage(item.placePhoto)) item.placePhoto = undefined;
  item.extraPhotos = Array.isArray(item.extraPhotos) ? item.extraPhotos.filter(data.isSafeImage) : [];
  if (Array.isArray(item.coordinates) && item.coordinates.length === 2
    && item.coordinates.every(function (c) { return typeof c === 'number' && Number.isFinite(c); })
    && Math.abs(item.coordinates[0]) <= 90 && Math.abs(item.coordinates[1]) <= 180) {
    item.coordinates = [item.coordinates[0], item.coordinates[1]];
  } else {
    item.coordinates = [48.8535, 2.3392];
  }
  item.shared = Boolean(item.shared);
  item.liked = Boolean(item.liked);
  item.saved = Boolean(item.saved);
  return data.isMemory(item) ? item : null;
}

function loadDiary() {
  let parsed = null;
  try {
    const saved = wx.getStorageSync(STORAGE_KEY);
    if (saved && typeof saved === 'string') parsed = JSON.parse(saved);
    else if (saved && typeof saved === 'object') parsed = saved;
  } catch (error) {
    return defaults(); // corrupt storage → clean fallback
  }
  if (!parsed || typeof parsed !== 'object') return defaults();

  const memories = Array.isArray(parsed.memories)
    ? parsed.memories.filter(data.isMemory).concat(
        // migrate repairable entries after the strict pass
        parsed.memories.filter(function (m) { return !data.isMemory(m); })
          .map(normalizeMemory).filter(Boolean)
      )
    : data.initialMemories.slice();
  // dedupe by id (first wins)
  const seen = Object.create(null);
  const deduped = [];
  memories.forEach(function (memory) {
    if (!seen[memory.id]) { seen[memory.id] = true; deduped.push(memory); }
  });

  const profile = Object.assign({}, data.defaultProfile, parsed.profile && typeof parsed.profile === 'object' ? parsed.profile : {});
  const settings = Object.assign({}, data.defaultSettings, parsed.settings && typeof parsed.settings === 'object' ? parsed.settings : {});
  if (settings.theme !== 'dusk') settings.theme = 'pearl';
  const feedback = Array.isArray(parsed.feedback) ? parsed.feedback.filter(function (f) {
    return f && typeof f.message === 'string' && typeof f.date === 'string';
  }) : [];
  return { memories: deduped, profile, settings, feedback };
}

function persist() {
  try {
    wx.setStorageSync(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    notify('Storage is full or unavailable. Export your memories to keep a backup.');
  }
}

function ensureLoaded() {
  if (!loaded) {
    const loadedState = loadDiary();
    state.memories = loadedState.memories;
    state.profile = loadedState.profile;
    state.settings = loadedState.settings;
    state.feedback = loadedState.feedback;
    loaded = true;
    if (!state.memories.length) {
      // never boot into a dead screen: sample data returns when empty
      state.memories = data.initialMemories.slice();
    }
  }
}

function emit() {
  persist();
  listeners.slice().forEach(function (listener) {
    try { listener(state); } catch (error) { /* one bad subscriber must not break the rest */ }
  });
}

function get() {
  ensureLoaded();
  return state;
}

function subscribe(listener) {
  listeners.push(listener);
  return function unsubscribe() {
    const index = listeners.indexOf(listener);
    if (index >= 0) listeners.splice(index, 1);
  };
}

function notify(message) {
  currentToast = { id: Date.now(), message };
  toastListeners.slice().forEach(function (listener) {
    try { listener(currentToast); } catch (error) { /* ignore */ }
  });
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(function () {
    currentToast = null;
    toastListeners.slice().forEach(function (listener) {
      try { listener(null); } catch (error) { /* ignore */ }
    });
  }, 4200);
}

function dismissToast() {
  if (toastTimer) { clearTimeout(toastTimer); toastTimer = null; }
  currentToast = null;
  toastListeners.slice().forEach(function (listener) {
    try { listener(null); } catch (error) { /* ignore */ }
  });
}

function onToast(listener) {
  toastListeners.push(listener);
  return function () {
    const index = toastListeners.indexOf(listener);
    if (index >= 0) toastListeners.splice(index, 1);
  };
}

function addMemory(memory) {
  ensureLoaded();
  state.memories = [memory].concat(state.memories);
  emit();
}

function updateMemory(id, changes) {
  ensureLoaded();
  state.memories = state.memories.map(function (memory) {
    return memory.id === id ? Object.assign({}, memory, changes) : memory;
  });
  emit();
}

// `collectFiles` (optional) lets the caller clean orphan photos after the
// state change; photos module handles the actual deletion.
function deleteMemory(id) {
  ensureLoaded();
  state.memories = state.memories.filter(function (memory) { return memory.id !== id; });
  emit();
}

function updateProfile(changes) {
  ensureLoaded();
  state.profile = Object.assign({}, state.profile, changes);
  emit();
}

function updateSettings(changes) {
  ensureLoaded();
  state.settings = Object.assign({}, state.settings, changes);
  emit();
}

function importMemories(memories) {
  ensureLoaded();
  const knownIds = Object.create(null);
  state.memories.forEach(function (memory) { knownIds[memory.id] = true; });
  const additions = [];
  (memories || []).forEach(function (memory) {
    if (knownIds[memory.id]) return;
    knownIds[memory.id] = true;
    additions.push(memory);
  });
  if (additions.length) {
    state.memories = additions.concat(state.memories);
    emit();
  }
  return additions.length;
}

function saveFeedback(message) {
  ensureLoaded();
  state.feedback = state.feedback.concat([{ message: message, date: new Date().toISOString() }]);
  emit();
}

// ---------------- draft (savor-draft-v1) ----------------

const starterDraft = {
  restaurant: 'Le Comptoir',
  notes: 'Perfect late-night dinner. The duck was unforgettable.',
  date: '2025-08-26',
  rating: 4,
  tags: ['French', 'Dinner', 'Date Night'],
  photos: [data.photos.meal],
  city: 'Paris',
};

function loadDraft() {
  try {
    const saved = wx.getStorageSync(DRAFT_KEY);
    const parsed = typeof saved === 'string' ? JSON.parse(saved) : saved;
    if (parsed && typeof parsed === 'object'
      && typeof parsed.restaurant === 'string' && typeof parsed.notes === 'string'
      && (parsed.date === '' || data.isValidDate(parsed.date))
      && Array.isArray(parsed.photos) && parsed.photos.length <= 4 && parsed.photos.every(data.isSafeImage)
      && Array.isArray(parsed.tags) && parsed.tags.every(function (t) { return typeof t === 'string'; })
      && Number.isInteger(parsed.rating) && parsed.rating >= 1 && parsed.rating <= 5
      && typeof parsed.city === 'string') {
      return Object.assign({}, starterDraft, parsed);
    }
  } catch (error) { /* An unavailable draft store must not block adding a memory. */ }
  return Object.assign({}, starterDraft);
}

function saveDraft(draft) {
  try {
    wx.setStorageSync(DRAFT_KEY, JSON.stringify(draft));
  } catch (error) { /* The form still works without a persisted draft. */ }
}

function freshDraft() {
  return {
    restaurant: '',
    notes: '',
    date: new Date().toISOString().slice(0, 10),
    rating: starterDraft.rating,
    tags: [],
    photos: [],
    city: starterDraft.city,
  };
}

function clearDraft() {
  saveDraft(freshDraft());
}

module.exports = {
  STORAGE_KEY,
  DRAFT_KEY,
  get,
  subscribe,
  notify,
  dismissToast,
  onToast,
  addMemory,
  updateMemory,
  deleteMemory,
  updateProfile,
  updateSettings,
  importMemories,
  saveFeedback,
  loadDraft,
  saveDraft,
  clearDraft,
  freshDraft,
  starterDraft,
};
