// Shared content, validation, repair and derived statistics. Mirrors src/data.ts of the web concept,
// with sample photos served from the package so the core screens never depend on the network.
const photos = {
  meal: '/images/le-comptoir.jpg',
  paris: '/images/paris-evening.jpg',
  coffee: '/images/coffee.jpg',
  japanese: '/images/japanese.jpg',
  cafe: '/images/cafe.jpg',
  jamie: '/images/jamie.jpg',
  alex: '/images/alex.jpg',
};

// Web backups (and earlier mini program builds) reference the same photos on Pexels. Map them to the bundled copies.
const LEGACY_PHOTOS = {
  '35393901': photos.coffee,
  '20571437': photos.japanese,
  '38575652': photos.cafe,
  '14368870': photos.jamie,
  '5715795': photos.alex,
};

// Reverse map used by exports so a mini program backup renders the same sample photos in the web app.
const PEXELS = 'https://images.pexels.com/photos/';
const PEXELS_SUFFIX = '/pexels-photo-ID.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=1200&w=800';
const SAMPLE_REMOTE = {};
Object.keys(LEGACY_PHOTOS).forEach((id) => { SAMPLE_REMOTE[LEGACY_PHOTOS[id]] = PEXELS + id + PEXELS_SUFFIX.replace('ID', id); });

const DIARY_VERSION = 2;
const STORAGE_KEY = 'savor-diary-v1';
const DRAFT_KEY = 'savor-draft-v1';
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
function plural(count, one, many) { return count + ' ' + (count === 1 ? one : many); }

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
};

const DIETARY_OPTIONS = ['No restrictions', 'Vegetarian', 'Vegan', 'Pescatarian', 'Gluten-free', 'Dairy-free'];
const CUISINE_OPTIONS = ['French', 'Japanese', 'Italian', 'Chinese', 'Korean', 'Mediterranean', 'Mexican', 'Indian'];

function userDataPath() {
  return typeof wx !== 'undefined' && wx.env && wx.env.USER_DATA_PATH ? wx.env.USER_DATA_PATH : '';
}

// Accepts bundled images, https, mini program file paths and (for import only) embedded data URIs.
function isSafeImage(value) {
  if (typeof value !== 'string' || !value) return false;
  if (/^(https:\/\/|\/images\/|wxfile:\/\/|http:\/\/(usr|tmp|store)\/|data:image\/(jpeg|png|webp|gif);base64,)/.test(value)) return true;
  const base = userDataPath();
  return !!base && value.indexOf(base) === 0;
}

// Replace the Pexels sample URLs from web exports with the bundled copies. Other values pass through untouched.
function localizePhoto(value) {
  if (typeof value !== 'string') return value;
  const match = /^https:\/\/images\.pexels\.com\/photos\/(\d+)\//.exec(value);
  return match && LEGACY_PHOTOS[match[1]] ? LEGACY_PHOTOS[match[1]] : value;
}

// Bundled sample photos that the web build does not ship are exported as their public URLs.
function remotePhoto(value) {
  return SAMPLE_REMOTE[value] || value;
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

function text(value, fallback, max) {
  const clean = typeof value === 'string' ? value : (typeof value === 'number' ? String(value) : fallback);
  return clean.slice(0, max || 2000);
}

// Repairs a partially valid memory (older backups, hand-edited JSON) instead of dropping the whole diary.
// Returns null only when nothing meaningful can be recovered.
function normalizeMemory(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const restaurant = text(raw.restaurant, '', 70).trim();
  if (!restaurant) return null;
  const city = text(raw.city, '', 60);
  const known = cityLocations[city] || null;
  let coordinates = Array.isArray(raw.coordinates) && raw.coordinates.length === 2 ? raw.coordinates.map(Number) : null;
  if (!coordinates || !coordinates.every((n) => isFinite(n)) || Math.abs(coordinates[0]) > 90 || Math.abs(coordinates[1]) > 180) {
    coordinates = known ? known.coordinates.slice() : cityLocations.Paris.coordinates.slice();
  }
  let rating = Math.round(Number(raw.rating));
  if (!isFinite(rating)) rating = 4;
  rating = Math.min(5, Math.max(1, rating));
  const tags = Array.isArray(raw.tags) ? raw.tags.filter((tag) => typeof tag === 'string' && tag.trim()).map((tag) => tag.trim().slice(0, 24)).slice(0, 6) : [];
  const photo = localizePhoto(raw.photo);
  const extraPhotos = Array.isArray(raw.extraPhotos) ? raw.extraPhotos.map(localizePhoto).filter(isSafeImage).slice(0, 3) : [];
  const placePhoto = localizePhoto(raw.placePhoto);
  const item = {
    id: typeof raw.id === 'string' && raw.id ? raw.id.slice(0, 80) : createId(),
    restaurant,
    city: city || (known ? city : 'Paris'),
    country: text(raw.country, known ? known.country : (city ? '' : 'France'), 60),
    neighborhood: text(raw.neighborhood, '', 60),
    date: isValidDate(raw.date) ? raw.date : today(),
    notes: text(raw.notes, '', 1500),
    rating,
    tags,
    photo: isSafeImage(photo) ? photo : photos.meal,
    extraPhotos,
    coordinates,
    shared: raw.shared === true,
    liked: raw.liked === true,
    saved: raw.saved === true,
  };
  if (isSafeImage(placePhoto)) item.placePhoto = placePhoto;
  return item;
}

function normalizeProfile(raw) {
  const base = Object.assign({}, defaultProfile);
  if (!raw || typeof raw !== 'object') return base;
  return {
    name: text(raw.name, base.name, 32).trim() || base.name,
    bio: text(raw.bio, base.bio, 55),
    avatar: isSafeImage(localizePhoto(raw.avatar)) ? localizePhoto(raw.avatar) : base.avatar,
    partner: text(raw.partner, base.partner, 30).trim() || base.partner,
    togetherSince: isValidDate(raw.togetherSince) ? raw.togetherSince : base.togetherSince,
  };
}

function normalizeSettings(raw) {
  const base = Object.assign({}, defaultSettings);
  if (!raw || typeof raw !== 'object') return base;
  const bool = (key) => (typeof raw[key] === 'boolean' ? raw[key] : base[key]);
  return {
    dietary: DIETARY_OPTIONS.indexOf(raw.dietary) >= 0 ? raw.dietary : base.dietary,
    cuisines: Array.isArray(raw.cuisines) ? raw.cuisines.filter((c) => CUISINE_OPTIONS.indexOf(c) >= 0) : base.cuisines,
    privateByDefault: bool('privateByDefault'),
    showLocations: bool('showLocations'),
    reminders: bool('reminders'),
    reduceMotion: bool('reduceMotion'),
    theme: raw.theme === 'dusk' ? 'dusk' : 'pearl',
    loveSent: bool('loveSent'),
    notificationsRead: bool('notificationsRead'),
  };
}

// Builds a complete, versioned diary from whatever was stored. Bad entries are repaired or skipped, never fatal.
function migrateDiary(saved) {
  const diary = {
    version: DIARY_VERSION,
    memories: initialMemories.map((item) => Object.assign({}, item)),
    profile: Object.assign({}, defaultProfile),
    settings: Object.assign({}, defaultSettings),
    feedback: [],
  };
  if (!saved || typeof saved !== 'object') return diary;
  if (Array.isArray(saved.memories)) {
    const seen = {};
    diary.memories = saved.memories.map(normalizeMemory).filter((item) => {
      if (!item || seen[item.id]) return false;
      seen[item.id] = true;
      return true;
    });
  }
  diary.profile = normalizeProfile(saved.profile);
  diary.settings = normalizeSettings(saved.settings);
  diary.feedback = Array.isArray(saved.feedback)
    ? saved.feedback.filter((note) => note && typeof note.message === 'string').map((note) => ({ message: note.message.slice(0, 1000), date: typeof note.date === 'string' ? note.date : new Date().toISOString() })).slice(-100)
    : [];
  return diary;
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
  const fresh = sortShared(memories).find((item) => initialIds.indexOf(item.id) < 0);
  const days = Math.max(0, Math.floor((Date.now() - parseDate(state.profile.togetherSince).getTime()) / 86400000));
  return {
    added, sharedAdded, days,
    weekMeals: Math.max(0, 12 + added), weekPlaces: 5 + Math.max(0, added),
    journeyMeals: Math.max(0, 48 + sharedAdded), journeyPlaces: 17 + Math.max(0, sharedAdded), journeyCountries: 6,
    meals: Math.max(0, 72 + added), places: 28 + Math.max(0, added), countries: 9, years: 2,
    latest: sharedAdded > 0 && fresh ? fresh.city + ', ' + fresh.country : 'Paris, France',
  };
}

module.exports = {
  photos, initialMemories, defaultProfile, defaultSettings, cityLocations, DIETARY_OPTIONS, CUISINE_OPTIONS,
  DIARY_VERSION, STORAGE_KEY, DRAFT_KEY,
  today, daysAgo, parseDate, isValidDate, formatDate, createId, plural,
  isSafeImage, localizePhoto, remotePhoto, isMemory, normalizeMemory, normalizeProfile, normalizeSettings, migrateDiary, sortShared, stats,
};
