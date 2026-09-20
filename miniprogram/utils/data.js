const i18n = require('./i18n');
// Data model — ported line-for-line in spirit from the web baseline
// (src/data.ts). Web-only concepts (File/URL/canvas) are replaced by
// helpers suited to the WeChat runtime; everything else keeps the exact
// sample data, validators, and semantics.

const SCREEN_ORDER = ['home', 'map', 'add', 'us', 'me'];

// Core sample photos are bundled locally in miniprogram/images — the app
// must look complete with no network access (web baseline used two local
// files + five Pexels URLs; all seven now ship inside the package).
const photos = {
  meal: '/images/le-comptoir.jpg',
  paris: '/images/paris-evening.jpg',
  coffee: '/images/coffee.jpg',
  japanese: '/images/japanese.jpg',
  cafe: '/images/cafe.jpg',
  jamie: '/images/jamie.jpg',
  alex: '/images/alex.jpg',
};

const baseMemory = {
  extraPhotos: [],
  shared: false,
  liked: false,
  saved: false,
};

const initialMemories = [];

const defaultProfile = {
  name: '',
  bio: '',
  avatar: '',
  partner: '',
  togetherSince: '',
};

const defaultSettings = {
  language: 'system',
  dietary: 'No restrictions',
  cuisines: [],
  privateByDefault: false,
  showLocations: true,
  reminders: true,
  reduceMotion: false,
  theme: 'pearl',
  loveSent: false,
  notificationsRead: false,
};

const screenInfo = {
  home: { title: 'Home', description: 'Your highlights, recents\nand weekly snapshot.' },
  map: { title: 'Map', description: 'Discover places and\nrelive past moments.' },
  add: { title: 'Add', description: 'Capture meals, places,\nnotes and feelings.' },
  us: { title: 'Us', description: 'Shared memories, milestones\nand your journey together.' },
  me: { title: 'Me', description: 'Your profile, preferences\nand app settings.' },
};

// The web's user-data root is wx.env.USER_DATA_PATH; allow bundled paths,
// https(s) URLs, data URLs, and local persisted files.
let userDataReader = null;
function registerUserPathReader(reader) {
  userDataReader = reader;
}
function userRoot() {
  try {
    return (wx.env && wx.env.USER_DATA_PATH) || '';
  } catch (error) {
    return '';
  }
}

function isValidDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T12:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatDate(date) {
  if (!isValidDate(date)) return i18n.t('A little while ago');
  const parts = date.split('-');
  if (i18n.locale() === 'zh-CN') return Number(parts[0]) + '年' + Number(parts[1]) + '月' + Number(parts[2]) + '日';
  return MONTHS[Number(parts[1]) - 1] + ' ' + Number(parts[2]) + ', ' + Number(parts[0]);
}

function createId() {
  return 'memory-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
}

function isCloudImage(value) {
  return typeof value === 'string' && value.length <= 500
    && /^cloud:\/\/[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/.test(value)
    && !value.split('/').some(function (part) { return part === '.' || part === '..'; });
}

function isSafeImage(value) {
  if (typeof value !== 'string') return false;
  if (isCloudImage(value)) return true;
  if (/^(https?:\/\/|\/images\/|wxfile:\/\/|data:image\/(jpeg|jpg|png|webp|gif);base64,)/.test(value)) return true;
  if (/^http:\/\/tmp\//.test(value) || /^wxfile:\/\//.test(value)) return true;
  const root = userRoot();
  return Boolean(root && value.indexOf(root + '/') === 0 && !value.split('/').some(function (p) { return p === '..'; }));
}

function isMemory(value) {
  if (!value || typeof value !== 'object') return false;
  const item = value;
  return typeof item.id === 'string' && item.id.length > 0
    && typeof item.restaurant === 'string' && item.restaurant.trim().length > 0
    && typeof item.city === 'string' && typeof item.country === 'string'
    && typeof item.neighborhood === 'string' && typeof item.notes === 'string'
    && isValidDate(item.date)
    && typeof item.rating === 'number' && Number.isInteger(item.rating) && item.rating >= 0 && item.rating <= 5
    && Array.isArray(item.tags) && item.tags.every(function (tag) { return typeof tag === 'string'; })
    && isSafeImage(item.photo) && (item.placePhoto === undefined || item.placePhoto === null || isSafeImage(item.placePhoto))
    && Array.isArray(item.extraPhotos) && item.extraPhotos.every(isSafeImage)
    && Array.isArray(item.coordinates) && item.coordinates.length === 2
    && item.coordinates.every(function (c) { return typeof c === 'number' && Number.isFinite(c); })
    && Math.abs(item.coordinates[0]) <= 90 && Math.abs(item.coordinates[1]) <= 180
    && typeof item.shared === 'boolean' && typeof item.liked === 'boolean' && typeof item.saved === 'boolean';
}

module.exports = {
  SCREEN_ORDER,
  photos,
  initialMemories,
  defaultProfile,
  defaultSettings,
  screenInfo,
  isValidDate,
  formatDate,
  createId,
  isSafeImage,
  isCloudImage,
  isMemory,
  registerUserPathReader,
};
