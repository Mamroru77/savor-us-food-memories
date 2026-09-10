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

const initialMemories = [
  {
    ...baseMemory, id: 'arabica', restaurant: '% Arabica', city: 'Tokyo', country: 'Japan',
    neighborhood: 'Shibuya', date: '2025-08-26', rating: 5,
    notes: 'A slow afternoon, a perfect coffee, and nowhere else we needed to be.',
    tags: ['Coffee', 'Japanese', 'Cafe'], photo: photos.coffee,
    coordinates: [35.6643, 139.6984], shared: true, liked: true,
  },
  {
    ...baseMemory, id: 'comptoir', restaurant: 'Le Comptoir', city: 'Paris', country: 'France',
    neighborhood: 'Saint-Germain', date: '2025-08-24', rating: 4,
    notes: 'Perfect late-night dinner. The duck was unforgettable.',
    tags: ['French', 'Dinner', 'Date Night'], photo: photos.meal, placePhoto: photos.paris,
    coordinates: [48.8523, 2.3386], shared: true, liked: true,
  },
  {
    ...baseMemory, id: 'mstand', restaurant: 'M Stand', city: 'Tokyo', country: 'Japan',
    neighborhood: 'Nakameguro', date: '2025-08-22', rating: 4,
    notes: 'Found a little corner by the window. Stayed for a second cup.',
    tags: ['Coffee', 'Breakfast'], photo: photos.cafe, placePhoto: photos.paris,
    coordinates: [35.6435, 139.6992],
  },
  {
    ...baseMemory, id: 'kyoto', restaurant: 'Kyoto Gojo', city: 'Kyoto', country: 'Japan',
    neighborhood: 'Gojo', date: '2025-07-14', rating: 5,
    notes: 'Rain outside, a warm bowl between us. A little place we will always come back to.',
    tags: ['Japanese', 'Lunch', 'Travel'], photo: photos.japanese,
    coordinates: [34.9956, 135.7649], shared: true, liked: true,
  },
  {
    ...baseMemory, id: 'kitsune', restaurant: 'Cafe Kitsune', city: 'Paris', country: 'France',
    neighborhood: 'Palais-Royal', date: '2025-08-20', rating: 5,
    notes: 'Coffee in the gardens, before the city woke up. The best kind of morning.',
    tags: ['Coffee', 'French', 'Breakfast'], photo: photos.meal,
    coordinates: [48.864, 2.3345], saved: true,
  },
  {
    ...baseMemory, id: 'flore', restaurant: 'Cafe de Flore', city: 'Paris', country: 'France',
    neighborhood: 'Saint-Germain', date: '2025-08-19', rating: 4,
    notes: 'People-watching over a long lunch. One more chapter in our Paris story.',
    tags: ['French', 'Lunch', 'Bistro'], photo: photos.japanese,
    coordinates: [48.8542, 2.3325], shared: true,
  },
  {
    ...baseMemory, id: 'vieux', restaurant: 'Au Vieux Paris', city: 'Paris', country: 'France',
    neighborhood: 'Ile de la Cite', date: '2025-08-17', rating: 5,
    notes: 'A tiny table on a beautiful street. Some places feel like a secret.',
    tags: ['French', 'Dinner', 'Date Night'], photo: photos.meal, placePhoto: photos.paris,
    coordinates: [48.8534, 2.3497],
  },
];

const defaultProfile = {
  name: 'Jamie Lin',
  bio: 'Where next?',
  avatar: photos.jamie,
  partner: 'Alex',
  togetherSince: new Date(Date.now() - 427 * 86400000).toISOString().slice(0, 10),
};

const defaultSettings = {
  dietary: 'No restrictions',
  cuisines: ['French', 'Japanese'],
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
  if (!isValidDate(date)) return 'A little while ago';
  const parts = date.split('-');
  return MONTHS[Number(parts[1]) - 1] + ' ' + Number(parts[2]) + ', ' + Number(parts[0]);
}

function createId() {
  return 'memory-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
}

function isSafeImage(value) {
  if (typeof value !== 'string') return false;
  if (/^(https?:\/\/|\/images\/|data:image\/(jpeg|jpg|png|webp|gif);base64,)/.test(value)) return true;
  const root = userRoot();
  return Boolean(root && value.indexOf(root) === 0);
}

function isMemory(value) {
  if (!value || typeof value !== 'object') return false;
  const item = value;
  return typeof item.id === 'string' && item.id.length > 0
    && typeof item.restaurant === 'string' && item.restaurant.trim().length > 0
    && typeof item.city === 'string' && typeof item.country === 'string'
    && typeof item.neighborhood === 'string' && typeof item.notes === 'string'
    && isValidDate(item.date)
    && typeof item.rating === 'number' && Number.isInteger(item.rating) && item.rating >= 1 && item.rating <= 5
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
  isMemory,
  registerUserPathReader,
};
