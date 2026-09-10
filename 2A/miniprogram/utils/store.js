// Observable diary store persisted with wx storage. Pages bind in onShow/onLoad and release in onHide/onUnload.
// Listeners are wrapped so a page that has already unloaded can never receive a stale setData.
const data = require('./data');
const image = require('./image');

let state = null;
let listeners = [];
let persistTimer = null;
let storageWarned = false;

function load() {
  let saved = null;
  try {
    saved = wx.getStorageSync(data.STORAGE_KEY);
    if (typeof saved === 'string') saved = JSON.parse(saved);
  } catch (error) {
    saved = null;
  }
  const diary = data.migrateDiary(saved);
  // Older builds stored data without a version; write the migrated shape back once.
  if (!saved || saved.version !== data.DIARY_VERSION) writeNow(diary);
  return diary;
}

function getState() {
  if (!state) state = load();
  return state;
}

function writeNow(diary) {
  try {
    wx.setStorageSync(data.STORAGE_KEY, diary);
    return true;
  } catch (error) {
    if (!storageWarned) {
      storageWarned = true;
      wx.showModal({
        title: 'Storage is full',
        content: 'Savor could not save your latest change. Export a backup from Me > Memories to keep everything safe.',
        showCancel: false,
        confirmText: 'OK',
      });
    }
    return false;
  }
}

// Coalesce rapid updates (toggles, typing) into a single storage write.
function persist() {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    writeNow(state);
  }, 120);
}

function setState(patch) {
  state = Object.assign({}, getState(), patch, { version: data.DIARY_VERSION });
  persist();
  listeners.slice().forEach((entry) => {
    if (!entry.active) return;
    try { entry.fn(state); } catch (error) { /* a failing subscriber must not break the others */ }
  });
}

function subscribe(fn) {
  const entry = { fn, active: true };
  listeners.push(entry);
  return () => {
    entry.active = false;
    listeners = listeners.filter((item) => item !== entry);
  };
}

// Apply a selector to a page or component now and on every change. Returns the release function.
function bind(target, mapState) {
  const apply = (current) => {
    const next = mapState(current);
    if (next) target.setData(next);
  };
  apply(getState());
  return subscribe(apply);
}

function themeOf(current) {
  const dusk = current.settings.theme === 'dusk';
  return {
    theme: current.settings.theme,
    dusk,
    quiet: !!current.settings.reduceMotion,
    ink: dusk ? '#edece5' : '#1b1c1a',
    muted: dusk ? '#bfc3b7' : '#565752',
    buttonInk: dusk ? '#303a28' : '#ffffff',
  };
}

function toast(title, icon) {
  wx.showToast({ title, icon: icon || 'none', duration: 2400 });
}

function addMemory(item) {
  setState({ memories: [item].concat(getState().memories) });
}

function updateMemory(id, changes) {
  setState({ memories: getState().memories.map((item) => (item.id === id ? Object.assign({}, item, changes) : item)) });
}

function deleteMemory(id) {
  const memories = getState().memories;
  const target = memories.find((item) => item.id === id);
  if (!target) return false;
  const remaining = memories.filter((item) => item.id !== id);
  setState({ memories: remaining });
  // Remove user files only if no other memory or the profile still points at them.
  image.removeMemoryFiles(target, image.referencedFiles(remaining, getState().profile));
  return true;
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
    additions.push(image.materializeMemory(item));
  });
  if (additions.length) setState({ memories: additions.concat(getState().memories) });
  return additions.length;
}

function saveFeedback(message) {
  setState({ feedback: getState().feedback.concat([{ message, date: new Date().toISOString() }]).slice(-100) });
}

function flush() {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
    writeNow(state);
  }
}

module.exports = {
  getState, setState, subscribe, bind, themeOf, toast, flush,
  addMemory, updateMemory, deleteMemory, updateProfile, updateSettings, importMemories, saveFeedback,
};
