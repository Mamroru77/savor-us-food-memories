// Shared content, types, validation, and derived statistics. Mirrors src/data.ts of the web concept.
// Every sample photo ships inside the mini program package: no request/downloadFile
// domain has to be whitelisted and the diary still looks complete offline.
const photos = {
  meal: '/images/le-comptoir.jpg',
  paris: '/images/paris-evening.jpg',
  coffee: '/images/coffee.jpg',
  japanese: '/images/japanese.jpg',
  cafe: '/images/cafe.jpg',
  jamie: '/images/jamie.jpg',
  alex: '/images/alex.jpg',
};

const FALLBACK_PHOTO = photos.meal;
const BUNDLED_PHOTOS = Object.keys(photos).map((key) => photos[key]);

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function pad(value) { return (value < 10 ? '0' : '') + value; }
function toDateString(date) { return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()); }
function today() { return toDateString(new Date()); }
function daysAgo(days) { return toDateString(new Date(Date.now() - days * 86400000)); }
function parseDate(value) {
  const parts = String(value).split('-').map(Number);
  return new Date(parts[0], (parts[1] || 1) - 1, parts[2] || 1);
}
function isValidDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parts = value.split('-').map(Number);
  const date = new Date(parts[0], parts[1] - 1, parts[2]);
  return date.getFullYear() === parts[0] && date.getMonth() === parts[1] - 1 && date.getDate() === parts[2];
}
function formatDate(value) {
  if (!isValidDate(value)) return 'A little while ago';
  const parts = value.split('-').map(Number);
  return MONTHS[parts[1] - 1] + ' ' + parts[2] + ', ' + parts[0];
}
function createId() { return 'memory-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8); }

function memory(fields) {
  return Object.assign({ extraPhotos: [], shared: false, liked: false, saved: false }, fields);
}

const initialMemories = [
  memory({ id: 'arabica', restaurant: '% Arabica', city: 'Tokyo', country: 'Japan', neighborhood: 'Shibuya', date: '2025-08-26', rating: 5, notes: 'A slow afternoon, a perfect coffee, and nowhere else we needed to be.', tags: ['Coffee', 'Japanese', 'Cafe'], photo: photos.coffee, coordinates: [35.6643, 139.6984], shared: true, liked: true }),
  memory({ id: 'comptoir', restaurant: 'Le Comptoir', city: 'Paris', country: 'France', neighborhood: 'Saint-Germain', date: '2025-08-24', rating: 4, notes: 'Perfect late-night dinner. The duck was unforgettable.', tags: ['French', 'Dinner', 'Date Night'], photo: photos.meal, placePhoto: photos.paris, coordinates: [48.8523, 2.3386], shared: true, liked: true }),
  memory({ id: 'mstand', restaurant: 'M Stand', city: 'Tokyo', country: 'Japan', neighborhood: 'Nakameguro', date: '2025-08-22', rating: 4, notes: 'Found a little corner by the window. Stayed for a second cup.', tags: ['Coffee', 'Breakfast'], photo: photos.cafe, placePhoto: photos.paris, coordinates: [35.6435, 139.6992] }),
  memory({ id: 'kyoto', restaurant: 'Kyoto Gojo', city: 'Kyoto', country: 'Japan', neighborhood: 'Gojo', date: '2025-07-14', rating: 5, notes: 'Rain outside, a warm bowl between us. A little place we will always come back to.', tags: ['Japanese', 'Lunch', 'Travel'], photo: photos.japanese, coordinates: [34.9956, 135.7649], shared: true, liked: true }),
  memory({ id: 'kitsune', restaurant: 'Cafe Kitsune', city: 'Paris', country: 'France', neighborhood: 'Palais-Royal', date: '2025-08-20', rating: 5, notes: 'Coffee in the gardens, before the city woke up. The best kind of morning.', tags: ['Coffee', 'French', 'Breakfast'], photo: photos.meal, coordinates: [48.864, 2.3345], saved: true }),
  memory({ id: 'flore', restaurant: 'Cafe de Flore', city: 'Paris', country: 'France', neighborhood: 'Saint-Germain', date: '2025-08-19', rating: 4, notes: 'People-watching over a long lunch. One more chapter in our Paris story.', tags: ['French', 'Lunch', 'Bistro'], photo: photos.japanese, coordinates: [48.8542, 2.3325], shared: true }),
  memory({ id: 'vieux', restaurant: 'Au Vieux Paris', city: 'Paris', country: 'France', neighborhood: 'Ile de la Cite', date: '2025-08-17', rating: 5, notes: 'A tiny table on a beautiful street. Some places feel like a secret.', tags: ['French', 'Dinner', 'Date Night'], photo: photos.meal, placePhoto: photos.paris, coordinates: [48.8534, 2.3497] }),
];

const defaultProfile = { name: 'Jamie Lin', bio: 'Where next?', avatar: photos.jamie, partner: 'Alex', togetherSince: daysAgo(427) };

const defaultSettings = {
  dietary: 'No restrictions', cuisines: ['French', 'Japanese'], privateByDefault: false, showLocations: true,
  reminders: true, reduceMotion: false, theme: 'pearl', loveSent: false, notificationsRead: false,
};

const cityLocations = {
  Paris: { country: 'France', coordinates: [48.8535, 2.3392] },
  Tokyo: { country: 'Japan', coordinates: [35.6643, 139.6984] },
  Kyoto: { country: 'Japan', coordinates: [34.9956, 135.7649] },
  Copenhagen: { country: 'Denmark', coordinates: [55.6761, 12.5683] },
  London: { country: 'United Kingdom', coordinates: [51.5074, -0.1278] },
  'New York': { country: 'United States', coordinates: [40.7128, -74.006] },
  Shanghai: { country: 'China', coordinates: [31.2304, 121.4737] },
  Beijing: { country: 'China', coordinates: [39.9042, 116.4074] },
};

function isSafeImage(value) {
  if (typeof value !== 'string' || !value) return false;
  if (/^(https:\/\/|\/images\/|wxfile:\/\/|http:\/\/(usr|tmp|store)\/|data:image\/(jpeg|png|webp|gif);base64,)/.test(value)) return true;
  const userPath = typeof wx !== 'undefined' && wx.env ? wx.env.USER_DATA_PATH : '';
  return !!userPath && value.indexOf(userPath) === 0;
}

function isMemory(value) {
  if (!value || typeof value !== 'object') return false;
  const item = value;
  return typeof item.id === 'string' && item.id.length > 0
    && typeof item.restaurant === 'string' && item.restaurant.trim().length > 0
    && typeof item.city === 'string' && typeof item.country === 'string'
    && typeof item.neighborhood === 'string' && typeof item.notes === 'string'
    && isValidDate(item.date)
    && typeof item.rating === 'number' && item.rating % 1 === 0 && item.rating >= 1 && item.rating <= 5
    && Array.isArray(item.tags) && item.tags.every((tag) => typeof tag === 'string')
    && isSafeImage(item.photo) && (item.placePhoto === undefined || isSafeImage(item.placePhoto))
    && Array.isArray(item.extraPhotos) && item.extraPhotos.every(isSafeImage)
    && Array.isArray(item.coordinates) && item.coordinates.length === 2
    && item.coordinates.every((coordinate) => typeof coordinate === 'number' && isFinite(coordinate))
    && Math.abs(item.coordinates[0]) <= 90 && Math.abs(item.coordinates[1]) <= 180
    && typeof item.shared === 'boolean' && typeof item.liked === 'boolean' && typeof item.saved === 'boolean';
}

// Repairs a memory coming from storage or a backup file instead of throwing the
// whole diary away. Returns null only when the record cannot be a memory at all.
function normalizeMemory(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = typeof raw.id === 'string' && raw.id ? raw.id : createId();
  const restaurant = typeof raw.restaurant === 'string' ? raw.restaurant.trim() : '';
  if (!restaurant) return null;
  const text = (value, fallback) => (typeof value === 'string' ? value : fallback);
  const rating = Math.min(5, Math.max(1, Math.round(Number(raw.rating) || 4)));
  const tags = Array.isArray(raw.tags) ? raw.tags.filter((tag) => typeof tag === 'string').slice(0, 6) : [];
  const extra = Array.isArray(raw.extraPhotos) ? raw.extraPhotos.filter(isSafeImage).slice(0, 3) : [];
  const coordinates = Array.isArray(raw.coordinates) && raw.coordinates.length === 2
    && typeof raw.coordinates[0] === 'number' && typeof raw.coordinates[1] === 'number'
    && isFinite(raw.coordinates[0]) && isFinite(raw.coordinates[1])
    && Math.abs(raw.coordinates[0]) <= 90 && Math.abs(raw.coordinates[1]) <= 180
    ? [raw.coordinates[0], raw.coordinates[1]]
    : (cityLocations[text(raw.city, '')] || cityLocations.Paris).coordinates.slice();
  const item = {
    id,
    restaurant: restaurant.slice(0, 70),
    city: text(raw.city, 'Paris'),
    country: text(raw.country, 'France'),
    neighborhood: text(raw.neighborhood, ''),
    date: isValidDate(raw.date) ? raw.date : today(),
    notes: text(raw.notes, '').slice(0, 1500),
    rating,
    tags,
    photo: isSafeImage(raw.photo) ? raw.photo : FALLBACK_PHOTO,
    extraPhotos: extra,
    coordinates,
    shared: !!raw.shared,
    liked: !!raw.liked,
    saved: !!raw.saved,
  };
  if (isSafeImage(raw.placePhoto)) item.placePhoto = raw.placePhoto;
  return item;
}

function normalizeProfile(raw) {
  const base = Object.assign({}, defaultProfile);
  if (!raw || typeof raw !== 'object') return base;
  if (typeof raw.name === 'string' && raw.name.trim()) base.name = raw.name.trim().slice(0, 32);
  if (typeof raw.bio === 'string') base.bio = raw.bio.slice(0, 55);
  if (isSafeImage(raw.avatar)) base.avatar = raw.avatar;
  if (typeof raw.partner === 'string' && raw.partner.trim()) base.partner = raw.partner.trim().slice(0, 30);
  if (isValidDate(raw.togetherSince)) base.togetherSince = raw.togetherSince;
  return base;
}

function normalizeSettings(raw) {
  const base = Object.assign({}, defaultSettings);
  if (!raw || typeof raw !== 'object') return base;
  if (typeof raw.dietary === 'string') base.dietary = raw.dietary;
  if (Array.isArray(raw.cuisines)) base.cuisines = raw.cuisines.filter((item) => typeof item === 'string');
  ['privateByDefault', 'showLocations', 'reminders', 'reduceMotion', 'loveSent', 'notificationsRead']
    .forEach((key) => { if (typeof raw[key] === 'boolean') base[key] = raw[key]; });
  if (raw.theme === 'pearl' || raw.theme === 'dusk') base.theme = raw.theme;
  return base;
}

// Shared moments keep the concept's order: newly shared memories first, then the featured trio.
function sortShared(memories) {
  const featured = ['comptoir', 'arabica', 'kyoto'];
  const initialIds = initialMemories.map((item) => item.id);
  const rank = (id) => {
    const position = featured.indexOf(id);
    if (position >= 0) return position;
    return initialIds.indexOf(id) >= 0 ? 99 : -1;
  };
  return memories.filter((item) => item.shared).sort((a, b) => rank(a.id) - rank(b.id));
}

// The concept's lifetime totals stay as sample values; additions and removals move them.
function stats(state) {
  const memories = state.memories;
  const added = memories.length - initialMemories.length;
  const shared = memories.filter((item) => item.shared);
  const sharedAdded = shared.length - initialMemories.filter((item) => item.shared).length;
  const initialIds = initialMemories.map((item) => item.id);
  const fresh = shared.find((item) => initialIds.indexOf(item.id) < 0);
  const days = Math.max(0, Math.floor((Date.now() - parseDate(state.profile.togetherSince).getTime()) / 86400000));
  return {
    added, sharedAdded, days,
    weekMeals: Math.max(0, 12 + added), weekPlaces: 5 + Math.max(0, added),
    journeyMeals: Math.max(0, 48 + sharedAdded), journeyPlaces: 17 + Math.max(0, sharedAdded), journeyCountries: 6,
    meals: Math.max(0, 72 + added), places: 28 + Math.max(0, added), countries: 9, years: 2,
    latest: fresh ? fresh.city + ', ' + fresh.country : 'Paris, France',
  };
}

module.exports = {
  photos, FALLBACK_PHOTO, BUNDLED_PHOTOS, initialMemories, defaultProfile, defaultSettings, cityLocations,
  today, daysAgo, parseDate, isValidDate, formatDate, createId, isSafeImage, isMemory,
  normalizeMemory, normalizeProfile, normalizeSettings, sortShared, stats,
};
