// A small observable store persisted with wx.setStorageSync. Pages bind in onShow and release in onHide/onUnload.
const data = require('./data');
const image = require('./image');

const STORAGE_KEY = 'savor-diary-v1';
let state = null;
const listeners = [];

function defaults() {
  return {
    memories: data.initialMemories.slice(),
    profile: Object.assign({}, data.defaultProfile),
    settings: Object.assign({}, data.defaultSettings),
    feedback: [],
  };
}

function load() {
  const base = defaults();
  try {
    const saved = wx.getStorageSync(STORAGE_KEY);
    if (!saved || typeof saved !== 'object') return base;
    if (!Array.isArray(saved.memories) || !saved.memories.every(data.isMemory)) return base;
    return {
      memories: saved.memories,
      profile: Object.assign(base.profile, saved.profile),
      settings: Object.assign(base.settings, saved.settings),
      feedback: Array.isArray(saved.feedback) ? saved.feedback : [],
    };
  } catch (error) {
    return base;
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
    toast('Storage is full. Export a backup to stay safe.');
  }
}

function setState(patch) {
  state = Object.assign({}, getState(), patch);
  persist();
  listeners.slice().forEach((listener) => {
    try { listener(state); } catch (error) { /* a stale listener (page already unloaded) must not break the store */ }
  });
}

function subscribe(listener) {
  listeners.push(listener);
  return () => {
    const index = listeners.indexOf(listener);
    if (index >= 0) listeners.splice(index, 1);
  };
}

// Apply a selector to a page or component now and on every change.
function bind(target, mapState) {
  const apply = (current) => target.setData(mapState(current));
  apply(getState());
  return subscribe(apply);
}

function themeOf(current) {
  const dusk = current.settings.theme === 'dusk';
  const reduceMotion = !!current.settings.reduceMotion;
  return {
    theme: current.settings.theme, dusk, reduceMotion,
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
  list.forEach((item) => {
    if (known[item.id]) return;
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
