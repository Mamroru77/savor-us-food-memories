// A small observable store persisted with wx.setStorageSync. Pages bind in onShow and release in onHide/onUnload.
const data = require('./data');
const image = require('./image');

// The key stays compatible with the web diary (`savor-diary-v1`); `schema` lets us
// migrate older payloads instead of dropping them.
const STORAGE_KEY = 'savor-diary-v1';
const SCHEMA = 2;
let state = null;
const listeners = [];

function defaults() {
  return {
    schema: SCHEMA,
    memories: data.initialMemories.slice(),
    profile: Object.assign({}, data.defaultProfile),
    settings: Object.assign({}, data.defaultSettings),
    feedback: [],
  };
}

// Storage may hold a web export, a v1 payload, or a partly corrupted object.
// One broken memory must never stop the diary from opening.
function migrate(saved) {
  const base = defaults();
  if (!saved || typeof saved !== 'object') return base;
  const rawList = Array.isArray(saved.memories) ? saved.memories : [];
  const memories = [];
  const seen = {};
  rawList.forEach((raw) => {
    const item = data.normalizeMemory(raw);
    if (!item || seen[item.id]) return;
    seen[item.id] = true;
    memories.push(item);
  });
  return {
    schema: SCHEMA,
    // An empty diary is a valid state, but an unreadable one falls back to the samples.
    memories: rawList.length && !memories.length ? base.memories : memories,
    profile: data.normalizeProfile(saved.profile),
    settings: data.normalizeSettings(saved.settings),
    feedback: Array.isArray(saved.feedback)
      ? saved.feedback.filter((note) => note && typeof note.message === 'string').slice(-50)
      : [],
  };
}

function load() {
  let saved = null;
  try {
    saved = wx.getStorageSync(STORAGE_KEY);
  } catch (error) {
    return defaults();
  }
  if (saved === '' || saved === null || saved === undefined) return defaults();
  if (typeof saved === 'string') {
    try { saved = JSON.parse(saved); } catch (error) { return defaults(); }
  }
  try {
    return migrate(saved);
  } catch (error) {
    return defaults();
  }
}

function getState() {
  if (!state) state = load();
  return state;
}

function persist() {
  try {
    wx.setStorageSync(STORAGE_KEY, state);
  } catch (error) {
    // Quota or a locked storage: keep the session usable and tell the user once.
    if (!persist.warned) {
      persist.warned = true;
      toast('Storage is full. Export a backup to stay safe.');
    }
  }
}

function setState(patch) {
  state = Object.assign({}, getState(), patch);
  persist();
  listeners.slice().forEach((listener) => {
    try { listener(state); } catch (error) { console.error('Savor listener failed', error); }
  });
}

function subscribe(listener) {
  listeners.push(listener);
  return () => {
    const index = listeners.indexOf(listener);
    if (index >= 0) listeners.splice(index, 1);
  };
}

// Apply a selector to a page or component now and on every change. `released`
// stops a late store update from touching a page that already unloaded.
function bind(target, mapState) {
  let released = false;
  const apply = (current) => {
    if (released || !target || typeof target.setData !== 'function') return;
    const patch = mapState(current);
    if (patch) target.setData(patch);
  };
  apply(getState());
  const unsubscribe = subscribe(apply);
  return () => { released = true; unsubscribe(); };
}

function themeOf(current) {
  const dusk = current.settings.theme === 'dusk';
  return {
    theme: current.settings.theme, dusk,
    ink: dusk ? '#edece5' : '#1b1c1a',
    muted: dusk ? '#bfc3b7' : '#565752',
    buttonInk: dusk ? '#303a28' : '#ffffff',
  };
}

function toast(title) {
  wx.showToast({ title, icon: 'none', duration: 2200 });
}

function addMemory(item) {
  setState({ memories: [item].concat(getState().memories) });
}

function updateMemory(id, changes) {
  setState({ memories: getState().memories.map((item) => (item.id === id ? Object.assign({}, item, changes) : item)) });
}

function deleteMemory(id) {
  const target = getState().memories.find((item) => item.id === id);
  if (target) image.removeMemoryFiles(target);
  setState({ memories: getState().memories.filter((item) => item.id !== id) });
}

function updateProfile(changes) {
  setState({ profile: Object.assign({}, getState().profile, changes) });
}

function updateSettings(changes) {
  setState({ settings: Object.assign({}, getState().settings, changes) });
}

// Imports skip duplicates and turn embedded or missing photos into local files or safe fallbacks.
function importMemories(list) {
  const known = {};
  getState().memories.forEach((item) => { known[item.id] = true; });
  const additions = [];
  list.forEach((raw) => {
    const item = data.normalizeMemory(raw);
    if (!item || known[item.id]) return;
    known[item.id] = true;
    additions.push(image.sanitizeMemory(item));
  });
  if (additions.length) setState({ memories: additions.concat(getState().memories) });
  return additions.length;
}

function saveFeedback(message) {
  setState({ feedback: getState().feedback.concat([{ message, date: new Date().toISOString() }]) });
}

module.exports = {
  getState, setState, subscribe, bind, themeOf, toast,
  addMemory, updateMemory, deleteMemory, updateProfile, updateSettings, importMemories, saveFeedback,
};
