import { useEffect, useId, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { CalendarDays, Check, LoaderCircle, MapPin, Pencil, Plus, Sparkles, X } from 'lucide-react';
import { createId, formatDate, isSafeImage, isValidDate, photos, readPhoto } from '../data';
import type { Memory, ScreenProps } from '../data';
import { useSavor } from '../store';
import { IconButton, Photo, Rating } from '../components/Primitives';

interface Draft {
  restaurant: string;
  notes: string;
  date: string;
  rating: number;
  tags: string[];
  photos: string[];
  city: string;
}

const starterDraft: Draft = {
  restaurant: 'Le Comptoir', notes: 'Perfect late-night dinner. The duck was unforgettable.',
  date: '2025-08-26', rating: 4, tags: ['French', 'Dinner', 'Date Night'], photos: [photos.meal], city: 'Paris',
};

function loadDraft(): Draft {
  try {
    const saved = JSON.parse(sessionStorage.getItem('savor-draft-v1') ?? 'null');
    if (saved && typeof saved.restaurant === 'string' && typeof saved.notes === 'string'
      && (saved.date === '' || isValidDate(saved.date))
      && Array.isArray(saved.photos) && saved.photos.length <= 4 && saved.photos.every(isSafeImage)
      && Array.isArray(saved.tags) && saved.tags.every((tag: unknown) => typeof tag === 'string')
      && Number.isInteger(saved.rating) && saved.rating >= 1 && saved.rating <= 5
      && typeof saved.city === 'string') return { ...starterDraft, ...saved };
  } catch { /* An unavailable draft store must not block adding a memory. */ }
  return starterDraft;
}

const cityLocations: Record<string, { country: string; coordinates: [number, number] }> = {
  Paris: { country: 'France', coordinates: [48.8535, 2.3392] },
  Tokyo: { country: 'Japan', coordinates: [35.6643, 139.6984] },
  Kyoto: { country: 'Japan', coordinates: [34.9956, 135.7649] },
  Copenhagen: { country: 'Denmark', coordinates: [55.6761, 12.5683] },
  London: { country: 'United Kingdom', coordinates: [51.5074, -0.1278] },
  'New York': { country: 'United States', coordinates: [40.7128, -74.006] },
};

export function AddScreen({ navigate }: ScreenProps) {
  const { memories, addMemory, settings, notify } = useSavor();
  const [draft, setDraft] = useState<Draft>(loadDraft);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showTagInput, setShowTagInput] = useState(false);
  const [tag, setTag] = useState('');
  const replaceInput = useRef<HTMLInputElement>(null);
  const addInput = useRef<HTMLInputElement>(null);
  const restaurantInput = useRef<HTMLInputElement>(null);
  const saveLock = useRef(false);
  const formId = useId();
  const knownPlace = memories.find((memory) => memory.restaurant.toLowerCase() === draft.restaurant.trim().toLowerCase());
  const suggestedTags = [...new Set([...settings.cuisines, ...(settings.dietary === 'No restrictions' ? [] : [settings.dietary]), 'Lunch', 'Travel', 'Favorite'])]
    .filter((value) => !draft.tags.includes(value)).slice(0, 4);

  useEffect(() => {
    try { sessionStorage.setItem('savor-draft-v1', JSON.stringify(draft)); } catch { /* The form still works without session storage. */ }
  }, [draft]);

  const change = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((previous) => ({ ...previous, [key]: value }));

  async function upload(event: ChangeEvent<HTMLInputElement>, replace: boolean) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (!files.length) return;
    const available = replace ? 1 : 4 - draft.photos.length;
    if (available <= 0) { notify('You can keep up to four photos in one memory.'); return; }
    setUploading(true);
    setError('');
    try {
      const images = await Promise.all(files.slice(0, available).map(readPhoto));
      setDraft((previous) => ({ ...previous, photos: (replace ? [images[0], ...previous.photos.slice(1)] : [...previous.photos, ...images]).slice(0, 4) }));
    } catch (error) {
      setError(error instanceof Error ? error.message : 'That photo could not be opened. Please try another.');
    } finally { setUploading(false); }
  }

  function addTag(value: string) {
    const clean = value.trim().slice(0, 24);
    if (clean && !draft.tags.some((existing) => existing.toLowerCase() === clean.toLowerCase())) {
      change('tags', [...draft.tags, clean].slice(0, 6));
    }
    setTag('');
    setShowTagInput(false);
  }

  function save(event: FormEvent) {
    event.preventDefault();
    if (saveLock.current || uploading) return;
    if (!draft.restaurant.trim()) { setError('Give this memory a restaurant or place name.'); restaurantInput.current?.focus(); return; }
    if (!draft.photos.length) { setError('Add a photo to capture the feeling.'); return; }
    if (!isValidDate(draft.date)) { setError('Choose a date for your memory.'); return; }
    saveLock.current = true;
    setSaving(true);
    const location = cityLocations[draft.city] ?? cityLocations.Paris;
    const memory: Memory = {
      id: createId(), restaurant: draft.restaurant.trim(), notes: draft.notes.trim(), date: draft.date,
      rating: draft.rating, tags: draft.tags, photo: draft.photos[0], extraPhotos: draft.photos.slice(1),
      city: knownPlace?.city ?? draft.city, country: knownPlace?.country ?? location.country,
      neighborhood: knownPlace?.neighborhood ?? '', coordinates: knownPlace?.coordinates ?? location.coordinates,
      shared: !settings.privateByDefault, liked: false, saved: false,
    };
    addMemory(memory);
    const fresh = { ...starterDraft, restaurant: '', notes: '', date: new Date().toISOString().slice(0, 10), photos: [], tags: [] };
    try { sessionStorage.setItem('savor-draft-v1', JSON.stringify(fresh)); } catch { /* Saving the memory does not depend on the draft. */ }
    notify('A little moment, kept forever. Memory saved.');
    navigate('home');
  }

  return <div className="add-screen screen-scroll">
    <header className="add-heading">
      <IconButton label="Close and keep draft" className="close-add" onClick={() => { navigate('home'); notify('Your draft is here whenever you are ready.'); }}><X size={18} strokeWidth={1.5} /></IconButton>
      <div><h2>Add a Memory</h2><p>Capture the flavor. Keep the feeling.</p></div>
    </header>
    <form onSubmit={save} className="memory-form" aria-label="New food memory" aria-busy={uploading || saving}>
      <div className="photo-editor-row">
        <div className={`main-photo-wrap ${!draft.photos.length ? 'no-photo' : ''}`}>
          {draft.photos.length ? <Photo src={draft.photos[0]} alt="Photo for your new memory" className="main-memory-photo" /> : <button type="button" className="photo-placeholder" onClick={() => replaceInput.current?.click()}><Plus size={26} strokeWidth={1.2} /><span>A moment worth keeping</span></button>}
          {draft.photos.length > 0 && <button type="button" className="edit-photo" disabled={uploading} onClick={() => replaceInput.current?.click()}><Pencil size={11} strokeWidth={1.4} />Edit</button>}
          {uploading && <div className="photo-uploading"><LoaderCircle size={22} className="spin" /></div>}
        </div>
        <div className="more-photos-wrap">
          <button type="button" className={`add-photo ${draft.photos.length > 1 ? 'has-photo' : ''}`} onClick={() => addInput.current?.click()} disabled={uploading} aria-label="Add more photos">
            {draft.photos.length > 1 && <Photo src={draft.photos[draft.photos.length - 1]} alt="Additional memory photo" />}
            <span><Plus size={21} strokeWidth={1.2} /><span>{draft.photos.length > 1 ? `${draft.photos.length} photos` : 'Add more'}</span></span>
          </button>
          {draft.photos.length > 1 && <IconButton className="remove-extra" label="Remove last added photo" onClick={() => change('photos', draft.photos.slice(0, -1))}><X size={12} /></IconButton>}
        </div>
        <input ref={replaceInput} className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp,image/gif" tabIndex={-1} onChange={(event) => upload(event, true)} />
        <input ref={addInput} className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple tabIndex={-1} onChange={(event) => upload(event, false)} />
      </div>

      <div className="form-field restaurant-field">
        <label htmlFor={`${formId}-restaurant`}>Restaurant</label>
        <div className="input-wrap"><input ref={restaurantInput} id={`${formId}-restaurant`} list={`${formId}-places`} value={draft.restaurant} onChange={(event) => change('restaurant', event.target.value)} placeholder="A place to remember" maxLength={70} autoComplete="off" aria-required="true" />
          {draft.restaurant && <IconButton label="Clear restaurant" onClick={() => { change('restaurant', ''); restaurantInput.current?.focus(); }}><X size={13} strokeWidth={1.2} /></IconButton>}
        </div>
        <datalist id={`${formId}-places`}>{[...new Set(memories.map((memory) => memory.restaurant))].map((name) => <option key={name} value={name} />)}</datalist>
        {!knownPlace && draft.restaurant.trim() && <div className="new-place-location"><MapPin size={11} /><label htmlFor={`${formId}-city`}>New place in</label><select id={`${formId}-city`} value={draft.city} onChange={(event) => change('city', event.target.value)}>{Object.keys(cityLocations).map((city) => <option key={city}>{city}</option>)}</select></div>}
      </div>
      <div className="form-field notes-field"><label htmlFor={`${formId}-notes`}>Notes</label><textarea id={`${formId}-notes`} value={draft.notes} onChange={(event) => change('notes', event.target.value)} placeholder="What made it special?" maxLength={1500} rows={2} /></div>
      <div className="date-rating-row">
        <div className="form-field"><label htmlFor={`${formId}-date`}>Date</label><div className="date-input"><span>{draft.date ? formatDate(draft.date) : 'Choose a date'}</span><CalendarDays size={13} strokeWidth={1.4} /><input id={`${formId}-date`} aria-label="Memory date" type="date" value={draft.date} max={new Date().toISOString().slice(0, 10)} onChange={(event) => change('date', event.target.value)} required /></div></div>
        <div className="form-field"><span className="field-label">Rating</span><Rating value={draft.rating} onChange={(rating) => change('rating', rating)} /></div>
      </div>
      <div className="form-field tags-field"><span className="field-label">Tags</span>
        <div className="tag-list">{draft.tags.map((value) => <button key={value} type="button" className="tag" onClick={() => change('tags', draft.tags.filter((existing) => existing !== value))} title={`Remove ${value}`} aria-label={`Remove ${value} tag`}>{value}</button>)}
          {draft.tags.length < 6 && <IconButton className="add-tag" label="Add a tag" onClick={() => setShowTagInput(!showTagInput)}><Plus size={17} strokeWidth={1.3} /></IconButton>}
        </div>
        {showTagInput && <div className="tag-popover glass"><div className="tag-input-row"><input autoFocus aria-label="New tag" placeholder="Name a feeling..." maxLength={24} value={tag} onChange={(event) => setTag(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addTag(tag); } if (event.key === 'Escape') { event.stopPropagation(); setShowTagInput(false); } }} /><IconButton label="Confirm tag" onClick={() => addTag(tag)}><Check size={16} /></IconButton></div><div className="suggested-tags">{suggestedTags.map((value) => <button key={value} type="button" onClick={() => addTag(value)}>{value}</button>)}</div></div>}
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button type="submit" className="primary-button save-memory" disabled={uploading || saving}>{uploading ? <LoaderCircle size={14} className="spin" /> : saving ? <Check size={14} /> : <Sparkles size={14} strokeWidth={1.5} />}<span>{uploading ? 'Preparing photo...' : saving ? 'Memory saved' : 'Save Memory'}</span></button>
    </form>
  </div>;
}