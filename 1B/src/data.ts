export type ScreenName = 'home' | 'map' | 'add' | 'us' | 'me';

export interface Memory {
  id: string;
  restaurant: string;
  city: string;
  country: string;
  neighborhood: string;
  date: string;
  notes: string;
  rating: number;
  tags: string[];
  photo: string;
  extraPhotos: string[];
  placePhoto?: string;
  coordinates: [number, number];
  shared: boolean;
  liked: boolean;
  saved: boolean;
}

export interface Profile {
  name: string;
  bio: string;
  avatar: string;
  partner: string;
  togetherSince: string;
}

export interface Settings {
  dietary: string;
  cuisines: string[];
  privateByDefault: boolean;
  showLocations: boolean;
  reminders: boolean;
  reduceMotion: boolean;
  theme: 'pearl' | 'dusk';
  loveSent: boolean;
  notificationsRead: boolean;
}

export type SheetState =
  | { type: 'memory'; id: string }
  | { type: 'library'; filter?: 'all' | 'shared' | 'favorites' }
  | { type: 'weekly' | 'notifications' | 'preferences' | 'privacy' | 'settings' | 'help' | 'profile' | 'journey' | 'together' };

export interface ScreenProps {
  navigate: (screen: ScreenName) => void;
  openSheet: (sheet: SheetState) => void;
}

export const photos = {
  meal: '/images/le-comptoir.jpg',
  paris: '/images/paris-evening.jpg',
  coffee: 'https://images.pexels.com/photos/35393901/pexels-photo-35393901.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=1200&w=800',
  japanese: 'https://images.pexels.com/photos/20571437/pexels-photo-20571437.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=1200&w=800',
  cafe: 'https://images.pexels.com/photos/38575652/pexels-photo-38575652.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=1200&w=800',
  jamie: 'https://images.pexels.com/photos/14368870/pexels-photo-14368870.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=1200&w=800',
  alex: 'https://images.pexels.com/photos/5715795/pexels-photo-5715795.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=1200&w=800',
};

const baseMemory = {
  extraPhotos: [],
  shared: false,
  liked: false,
  saved: false,
};

export const initialMemories: Memory[] = [
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

export const defaultProfile: Profile = {
  name: 'Jamie Lin',
  bio: 'Where next?',
  avatar: photos.jamie,
  partner: 'Alex',
  togetherSince: new Date(Date.now() - 427 * 86400000).toISOString().slice(0, 10),
};

export const defaultSettings: Settings = {
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

export const screenInfo: Record<ScreenName, { title: string; description: string }> = {
  home: { title: 'Home', description: 'Your highlights, recents\nand weekly snapshot.' },
  map: { title: 'Map', description: 'Discover places and\nrelive past moments.' },
  add: { title: 'Add', description: 'Capture meals, places,\nnotes and feelings.' },
  us: { title: 'Us', description: 'Shared memories, milestones\nand your journey together.' },
  me: { title: 'Me', description: 'Your profile, preferences\nand app settings.' },
};

export function isValidDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function formatDate(date: string) {
  if (!isValidDate(date)) return 'A little while ago';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    .format(new Date(`${date}T12:00:00`));
}

export function createId() {
  return globalThis.crypto?.randomUUID?.() ?? `memory-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function isSafeImage(value: unknown): value is string {
  return typeof value === 'string' && /^(https:\/\/|\/images\/|data:image\/(jpeg|png|webp);base64,)/.test(value);
}

export function isMemory(value: unknown): value is Memory {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return typeof item.id === 'string' && item.id.length > 0
    && typeof item.restaurant === 'string' && item.restaurant.trim().length > 0
    && typeof item.city === 'string' && typeof item.country === 'string'
    && typeof item.neighborhood === 'string' && typeof item.notes === 'string'
    && isValidDate(item.date)
    && typeof item.rating === 'number' && Number.isInteger(item.rating) && item.rating >= 1 && item.rating <= 5
    && Array.isArray(item.tags) && item.tags.every((tag) => typeof tag === 'string')
    && isSafeImage(item.photo) && (item.placePhoto === undefined || isSafeImage(item.placePhoto))
    && Array.isArray(item.extraPhotos) && item.extraPhotos.every(isSafeImage)
    && Array.isArray(item.coordinates) && item.coordinates.length === 2
    && item.coordinates.every((coordinate) => typeof coordinate === 'number' && Number.isFinite(coordinate))
    && Math.abs(item.coordinates[0]) <= 90 && Math.abs(item.coordinates[1]) <= 180
    && typeof item.shared === 'boolean' && typeof item.liked === 'boolean' && typeof item.saved === 'boolean';
}

export async function readPhoto(file: File): Promise<string> {
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
    throw new Error('Please choose a JPG, PNG, WebP, or GIF photo.');
  }
  if (file.size > 12 * 1024 * 1024) throw new Error('Please choose a photo smaller than 12 MB.');
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    // Resize uploads before storing them so the local diary stays lightweight.
    const scale = Math.min(1, 900 / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(image.width * scale);
    canvas.height = Math.round(image.height * scale);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('This browser could not prepare your photo.');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.78);
  } finally {
    URL.revokeObjectURL(url);
  }
}