import { useEffect, useId, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent, KeyboardEvent, ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Archive, ArrowDownToLine, ArrowUpFromLine, Bell, Bookmark, Camera, Check, ChevronDown, ChevronRight, Heart, LockKeyhole, MapPin, Plus, Search, Send, Sparkles, Trash2, Users, X } from 'lucide-react';
import { formatDate, initialMemories, isMemory, photos, readPhoto } from '../data';
import type { Memory, ScreenName, SheetState } from '../data';
import { useSavor } from '../store';
import { IconButton, MemoryRow, Photo, Rating, Stat, Toggle } from './Primitives';

interface SheetProps {
  sheet: SheetState;
  close: () => void;
  openSheet: (sheet: SheetState) => void;
  navigate: (screen: ScreenName) => void;
}

function SheetShell({ title, subtitle, close, children }: { title: string; subtitle?: string; close: () => void; children: ReactNode }) {
  const panel = useRef<HTMLElement>(null);
  const titleId = useId();
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLButtonElement>('.sheet-close')?.focus({ preventScroll: true });
    return () => { if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, []);

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') { event.stopPropagation(); close(); }
    if (event.key !== 'Tab') return;
    const elements = [...(panel.current?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([tabindex="-1"]), select, textarea, [tabindex="0"]') ?? [])]
      .filter((element) => element.offsetParent !== null);
    const first = elements[0], last = elements[elements.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }

  return <motion.div className="phone-modal" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
    <button className="sheet-scrim" onClick={close} aria-label="Dismiss dialog" tabIndex={-1} />
    <motion.section ref={panel} className="sheet-panel" role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={onKeyDown} initial={{ y: 55 }} animate={{ y: 0 }} exit={{ y: 55 }} transition={{ type: 'spring', damping: 29, stiffness: 330 }}>
      <div className="sheet-handle" aria-hidden="true" />
      <header className="sheet-heading"><div><h2 id={titleId}>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><IconButton className="sheet-close" label="Close dialog" onClick={close}><X size={17} strokeWidth={1.4} /></IconButton></header>
      <div className="sheet-content">{children}</div>
    </motion.section>
  </motion.div>;
}

function MemoryDetail({ memory, close }: { memory?: Memory; close: () => void }) {
  const { updateMemory, deleteMemory, notify, settings } = useSavor();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [photoIndex, setPhotoIndex] = useState(0);
  if (!memory) return <p className="empty-state">This memory is no longer in your diary.</p>;
  const images = [memory.photo, ...memory.extraPhotos];
  return <div className="memory-detail">
    <Photo className="detail-photo" src={images[photoIndex]} alt={`Your memory at ${memory.restaurant}`} />
    {images.length > 1 && <div className="photo-thumbnails">{images.map((photo, index) => <button key={index} className={index === photoIndex ? 'is-selected' : ''} onClick={() => setPhotoIndex(index)} aria-label={`View photo ${index + 1}`} aria-pressed={index === photoIndex}><Photo src={photo} alt="" /></button>)}</div>}
    <div className="detail-meta"><span>{formatDate(memory.date)}</span><Rating value={memory.rating} /></div>
    {settings.showLocations && <p className="detail-location"><MapPin size={12} strokeWidth={1.4} />{memory.city}, {memory.country}</p>}
    <p className="detail-notes">{memory.notes || 'Some moments need no words.'}</p>
    <div className="detail-tags">{memory.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
    <div className="detail-action-row">
      <button className={memory.liked ? 'is-active' : ''} aria-pressed={memory.liked} onClick={() => updateMemory(memory.id, { liked: !memory.liked })}><Heart size={16} fill={memory.liked ? 'currentColor' : 'none'} strokeWidth={1.4} /><span>{memory.liked ? 'Loved' : 'Love'}</span></button>
      <button className={memory.saved ? 'is-active' : ''} aria-pressed={memory.saved} onClick={() => updateMemory(memory.id, { saved: !memory.saved })}><Bookmark size={16} fill={memory.saved ? 'currentColor' : 'none'} strokeWidth={1.4} /><span>{memory.saved ? 'Saved' : 'Save place'}</span></button>
      <button className={memory.shared ? 'is-active' : ''} aria-pressed={memory.shared} onClick={() => { updateMemory(memory.id, { shared: !memory.shared }); notify(memory.shared ? 'This moment is now just for you.' : 'A new chapter in your shared story.'); }}><Users size={16} strokeWidth={1.4} /><span>{memory.shared ? 'In our space' : 'Share with us'}</span></button>
    </div>
    {confirmDelete ? <div className="delete-confirmation"><p>Let this memory go? This cannot be undone.</p><div><button className="secondary-button" onClick={() => setConfirmDelete(false)}>Keep it</button><button className="danger-button" onClick={() => { deleteMemory(memory.id); close(); notify('Memory removed from your diary.'); }}>Remove memory</button></div></div>
      : <button className="quiet-delete" onClick={() => setConfirmDelete(true)}><Trash2 size={12} strokeWidth={1.4} />Remove memory</button>}
  </div>;
}

function Library({ filter: initialFilter = 'all', openSheet }: { filter?: 'all' | 'shared' | 'favorites'; openSheet: SheetProps['openSheet'] }) {
  const { memories, importMemories, notify } = useSavor();
  const [filter, setFilter] = useState(initialFilter);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const filtered = memories.filter((memory) => (filter === 'all' || (filter === 'shared' && memory.shared) || (filter === 'favorites' && (memory.saved || memory.liked)))
    && `${memory.restaurant} ${memory.city} ${memory.tags.join(' ')}`.toLowerCase().includes(query.toLowerCase()));

  function exportDiary() {
    const blob = new Blob([JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), memories }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `savor-memories-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify('Your memories, ready to take with you. Backup downloaded.');
  }

  async function importDiary(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError('');
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error('Please use a backup smaller than 10 MB.');
      const parsed = JSON.parse(await file.text());
      const items = Array.isArray(parsed) ? parsed : parsed.memories;
      if (!Array.isArray(items) || items.length > 500 || !items.every(isMemory)) throw new Error('This is not a valid Savor backup. Choose a JSON file exported from Savor.');
      const count = importMemories(items);
      notify(count ? `${count} ${count === 1 ? 'memory' : 'memories'} welcomed back to your diary.` : 'Your diary already has every memory in this backup.');
    } catch (error) { setError(error instanceof SyntaxError ? 'This file could not be read. Choose a Savor JSON backup.' : error instanceof Error ? error.message : 'Could not import this file.'); }
  }

  return <div className="library-sheet">
    <div className="library-tabs" aria-label="Memory collection">{(['all', 'shared', 'favorites'] as const).map((value) => <button key={value} onClick={() => setFilter(value)} className={value === filter ? 'is-active' : ''} aria-pressed={value === filter}>{value === 'all' ? 'All memories' : value === 'shared' ? 'Shared' : 'Favorites'}</button>)}</div>
    <div className="sheet-search"><Search size={14} /><input aria-label="Search your memory collection" placeholder="Find a little moment..." value={query} onChange={(event) => setQuery(event.target.value)} /></div>
    <p className="library-count">{filtered.length} {filtered.length === 1 ? 'moment' : 'moments'} worth keeping</p>
    <div className="library-list">{filtered.map((memory) => <MemoryRow key={memory.id} memory={memory} onClick={() => openSheet({ type: 'memory', id: memory.id })} />)}{!filtered.length && <p className="empty-state">Nothing here just yet.<br />Try another search or save a favorite.</p>}</div>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="backup-actions"><button className="secondary-button" onClick={exportDiary}><ArrowDownToLine size={14} />Export backup</button><button className="secondary-button" onClick={() => fileInput.current?.click()}><ArrowUpFromLine size={14} />Import</button></div>
    <input ref={fileInput} type="file" className="visually-hidden" accept="application/json,.json" tabIndex={-1} onChange={importDiary} />
    <p className="local-note"><LockKeyhole size={10} />Kept on this device. Always yours.</p>
  </div>;
}

function EditProfile({ close }: { close: () => void }) {
  const { profile, updateProfile, notify } = useSavor();
  const [name, setName] = useState(profile.name);
  const [bio, setBio] = useState(profile.bio);
  const [avatar, setAvatar] = useState(profile.avatar);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const id = useId();
  async function uploadAvatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setUploading(true);
    try { setAvatar(await readPhoto(file)); setError(''); } catch (error) { setError(error instanceof Error ? error.message : 'Please try another photo.'); } finally { setUploading(false); }
  }
  function save(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) { setError('Let us know what to call you.'); return; }
    updateProfile({ name: name.trim(), bio: bio.trim(), avatar });
    notify('A little more you. Profile updated.');
    close();
  }
  return <form className="settings-form" onSubmit={save}>
    <button type="button" className="edit-avatar" onClick={() => fileInput.current?.click()} aria-label="Change profile photo"><Photo src={avatar} alt="Your profile photo" className="jamie-avatar" /><span><Camera size={15} /></span></button>
    <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" className="visually-hidden" tabIndex={-1} onChange={uploadAvatar} />
    <div className="form-field"><label htmlFor={`${id}-name`}>Your name</label><input id={`${id}-name`} value={name} onChange={(event) => setName(event.target.value)} placeholder="Jamie Lin" maxLength={32} required /></div>
    <div className="form-field"><label htmlFor={`${id}-bio`}>A little about you</label><input id={`${id}-bio`} value={bio} onChange={(event) => setBio(event.target.value)} placeholder="Where next?" maxLength={55} /></div>
    {error && <p className="form-error" role="alert">{error}</p>}
    <button className="primary-button" type="submit" disabled={uploading}><Check size={15} />{uploading ? 'Preparing photo...' : 'Save profile'}</button>
  </form>;
}

function Together({ close }: { close: () => void }) {
  const { profile, updateProfile, notify } = useSavor();
  const [partner, setPartner] = useState(profile.partner);
  const [since, setSince] = useState(profile.togetherSince);
  const id = useId();
  return <form className="settings-form" onSubmit={(event) => { event.preventDefault(); if (!partner.trim() || !since) return; updateProfile({ partner: partner.trim(), togetherSince: since }); notify('Your shared story is updated.'); close(); }}>
    <div className="sheet-couple"><Photo src={profile.avatar} alt={profile.name} className="jamie-avatar" /><Heart size={23} fill="currentColor" strokeWidth={1.3} /><Photo src={photos.alex} alt={partner} className="alex-avatar" /></div>
    <p className="together-message">The best things are better shared.</p>
    <div className="form-field"><label htmlFor={`${id}-partner`}>Your person</label><input id={`${id}-partner`} value={partner} onChange={(event) => setPartner(event.target.value)} maxLength={30} required /></div>
    <div className="form-field"><label htmlFor={`${id}-since`}>Our story began</label><input id={`${id}-since`} type="date" value={since} max={new Date().toISOString().slice(0, 10)} onChange={(event) => setSince(event.target.value)} required /></div>
    <p className="helper-note">Your shared space lives in this local diary. Memories you share appear in Us.</p>
    <button type="submit" className="primary-button"><Heart size={14} />Save our story</button>
  </form>;
}

function Preferences({ close }: { close: () => void }) {
  const { settings, updateSettings, notify } = useSavor();
  const [dietary, setDietary] = useState(settings.dietary);
  const [cuisines, setCuisines] = useState(settings.cuisines);
  const id = useId();
  return <form className="settings-form" onSubmit={(event) => { event.preventDefault(); updateSettings({ dietary, cuisines }); notify('Your tastes, remembered. Preferences saved.'); close(); }}>
    <div className="form-field"><label htmlFor={`${id}-dietary`}>At your table</label><select id={`${id}-dietary`} value={dietary} onChange={(event) => setDietary(event.target.value)}>{['No restrictions', 'Vegetarian', 'Vegan', 'Pescatarian', 'Gluten-free', 'Dairy-free'].map((value) => <option key={value}>{value}</option>)}</select></div>
    <fieldset className="cuisine-fieldset"><legend>Cuisines you love</legend><div className="cuisine-options">{['French', 'Japanese', 'Italian', 'Chinese', 'Korean', 'Mediterranean', 'Mexican', 'Indian'].map((cuisine) => <button key={cuisine} type="button" aria-pressed={cuisines.includes(cuisine)} className={cuisines.includes(cuisine) ? 'is-selected' : ''} onClick={() => setCuisines(cuisines.includes(cuisine) ? cuisines.filter((value) => value !== cuisine) : [...cuisines, cuisine])}>{cuisine}{cuisines.includes(cuisine) && <Check size={12} />}</button>)}</div></fieldset>
    <div className="preference-tip"><Sparkles size={17} strokeWidth={1.2} /><p>Make it your own. Add personal tags like Date Night or Sunday Ritual when you save a memory.</p></div>
    <button type="submit" className="primary-button"><Check size={15} />Save preferences</button>
  </form>;
}

function SettingsPanel() {
  const { settings, updateSettings } = useSavor();
  return <div className="settings-panel-content">
    <h3 className="field-section-title">Make yourself at home</h3>
    <div className="theme-options">{(['pearl', 'dusk'] as const).map((theme) => <button key={theme} aria-pressed={settings.theme === theme} className={settings.theme === theme ? 'is-selected' : ''} onClick={() => updateSettings({ theme })}><span className={`theme-preview theme-${theme}`} /><span>{theme === 'pearl' ? 'Pearl' : 'Dusk'}</span>{settings.theme === theme && <Check size={13} />}</button>)}</div>
    <Toggle label="In-app reminders" description="A nudge to notice the little moments." checked={settings.reminders} onChange={(reminders) => updateSettings({ reminders })} />
    <Toggle label="Quiet motion" description="Keep transitions simple and gentle." checked={settings.reduceMotion} onChange={(reduceMotion) => updateSettings({ reduceMotion })} />
    <div className="app-signature"><span>Savor</span><p>For the meals that become memories.</p><small>Version 1.0 / Your personal food diary</small></div>
  </div>;
}

function Privacy({ openSheet }: { openSheet: SheetProps['openSheet'] }) {
  const { settings, updateSettings } = useSavor();
  return <div className="privacy-content"><div className="privacy-intro"><LockKeyhole size={28} strokeWidth={1} /><h3>Your moments. Your choice.</h3><p>This diary is saved in your browser, not on a server. There is no account or cloud sync.</p></div>
    <Toggle label="Private by default" description="Keep new memories just for you." checked={settings.privateByDefault} onChange={(privateByDefault) => updateSettings({ privateByDefault })} />
    <Toggle label="Location in details" description="Display the city on memory pages." checked={settings.showLocations} onChange={(showLocations) => updateSettings({ showLocations })} />
    <p className="helper-note">Clearing your browser data will remove this diary. Download a backup to keep your memories safe. Map tiles and sample photos need an internet connection.</p>
    <button className="secondary-button full-width" onClick={() => openSheet({ type: 'library' })}><Archive size={15} />Manage & back up memories</button>
  </div>;
}

function Weekly({ openSheet, navigate }: Pick<SheetProps, 'openSheet' | 'navigate'>) {
  const { memories } = useSavor();
  const added = memories.length - initialMemories.length;
  return <div className="weekly-sheet"><div className="weekly-sheet-stats"><Stat value={Math.max(0, 12 + added)} label="Meals remembered" /><Stat value={5 + Math.max(0, added)} label="Places explored" /></div>
    <div className="weekly-chart" aria-label="Meal memories across the week">{[28, 54, 38, 74, 100, 65, 44].map((height, index) => <div key={index}><span style={{ height: `${height}%` }} className={index === 4 ? 'is-highlight' : ''} /><small>{['M', 'T', 'W', 'T', 'F', 'S', 'S'][index]}</small></div>)}</div>
    <p className="weekly-reflection">A good week is made of little moments.</p>
    <div className="weekly-memory-list">{memories.slice(0, 3).map((memory) => <MemoryRow key={memory.id} memory={memory} onClick={() => openSheet({ type: 'memory', id: memory.id })} />)}</div>
    <button className="primary-button" onClick={() => navigate('add')}><Plus size={17} />Keep another moment</button>
  </div>;
}

function Journey({ navigate }: Pick<SheetProps, 'navigate'>) {
  const { memories, profile } = useSavor();
  const recent = memories.find((memory) => memory.shared);
  return <div className="journey-sheet"><p className="journey-opening">Not just the places.<br />The way we felt there.</p><div className="journey-timeline">{[
    { title: recent ? `${recent.city}, ${recent.country}` : 'The next adventure', date: recent ? formatDate(recent.date) : 'Still to be written', text: 'Another little chapter in our story.' },
    { title: 'Kyoto, Japan', date: 'Jul 14, 2025', text: 'Rainy afternoons and the warmest bowls.' },
    { title: 'Copenhagen, Denmark', date: 'May 3, 2025', text: 'Long lunches. A new favorite city.' },
    { title: 'Our first meal', date: formatDate(profile.togetherSince), text: 'The start of something worth savoring.' },
  ].map((item, index) => <div className="timeline-stop" key={index}><span className="timeline-dot" /><small>{item.date}</small><h3>{item.title}</h3><p>{item.text}</p></div>)}</div><button className="primary-button" onClick={() => navigate('map')}><MapPin size={15} />Explore our places</button></div>;
}

function Notifications({ openSheet, close }: Pick<SheetProps, 'openSheet' | 'close'>) {
  const { settings, updateSettings, profile, memories } = useSavor();
  const memory = memories.find((item) => item.id === 'comptoir') ?? memories[0];
  return <div className="notifications-sheet">
    {settings.notificationsRead ? <div className="caught-up"><Check size={31} strokeWidth={1} /><h3>All caught up.</h3><p>Go make a memory worth keeping.</p></div> : <>
      {memory && <button className="notification-row" onClick={() => { updateSettings({ notificationsRead: true }); openSheet({ type: 'memory', id: memory.id }); }}><Photo src={memory.photo} alt="" /><span><strong>A moment with {profile.partner}</strong><span>Remember that dinner at {memory.restaurant}?</span><small>A little while ago</small></span><ChevronRight size={13} /></button>}
      <button className="notification-row" onClick={() => openSheet({ type: 'weekly' })}><span className="notification-symbol"><Sparkles size={21} strokeWidth={1.2} /></span><span><strong>Your week, beautifully kept</strong><span>Take a little look at your latest memories.</span><small>Your weekly reflection</small></span><ChevronRight size={13} /></button>
    </>}
    <button className="primary-button" onClick={() => { updateSettings({ notificationsRead: true }); close(); }}><Bell size={14} />{settings.notificationsRead ? 'Back to the good stuff' : 'Mark all as read'}</button>
  </div>;
}

const faqs = [
  { question: 'Where are my memories saved?', answer: 'Right here in this browser. Savor works without an account. Use Export backup in Memories to keep a copy before clearing browser data or moving to another device.' },
  { question: 'How do I share a moment?', answer: 'Open a memory and tap Share with us. It appears in the Us screen in this diary. This concept does not send data to another device or person.' },
  { question: 'Can I add my own photos?', answer: 'Of course. Tap Add, then the photo area or Add more. You can keep up to four JPG, PNG, WebP, or GIF photos in each memory.' },
];

function Help() {
  const { saveFeedback, notify, feedback } = useSavor();
  const [expanded, setExpanded] = useState<number | null>(null);
  const [message, setMessage] = useState('');
  const id = useId();
  return <div className="help-sheet"><div className="faq-list">{faqs.map((faq, index) => <div className="faq-item" key={faq.question}><button aria-expanded={expanded === index} onClick={() => setExpanded(expanded === index ? null : index)}>{faq.question}<ChevronDown size={14} className={expanded === index ? 'is-open' : ''} /></button><AnimatePresence initial={false}>{expanded === index && <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="faq-answer"><p>{faq.answer}</p></motion.div>}</AnimatePresence></div>)}</div>
    <form onSubmit={(event) => { event.preventDefault(); if (!message.trim()) return; saveFeedback(message.trim()); setMessage(''); notify('Thank you. Your feedback note is saved on this device.'); }} className="feedback-form"><div className="form-field"><label htmlFor={`${id}-feedback`}>A thought to make Savor better?</label><textarea id={`${id}-feedback`} value={message} onChange={(event) => setMessage(event.target.value)} placeholder="We would love to hear it..." rows={3} maxLength={1000} required /></div><button type="submit" className="primary-button"><Send size={14} />Save feedback note</button></form>
    <p className="helper-note">Feedback is kept locally in this concept, not sent to a server.{feedback.length > 0 ? ` You have saved ${feedback.length} ${feedback.length === 1 ? 'note' : 'notes'}.` : ''}</p>
  </div>;
}

export function PhoneSheet({ sheet, close, openSheet, navigate }: SheetProps) {
  const { memories } = useSavor();
  let title = '', subtitle = '';
  let content: ReactNode = null;
  const go = (screen: ScreenName) => { close(); navigate(screen); };
  switch (sheet.type) {
    case 'memory': {
      const memory = memories.find((item) => item.id === sheet.id);
      title = memory?.restaurant ?? 'A little memory';
      subtitle = 'A moment worth coming back to.';
      content = <MemoryDetail memory={memory} close={close} />;
      break;
    }
    case 'library': title = sheet.filter === 'shared' ? 'Our memories' : 'Your memories'; subtitle = 'Small moments. A beautiful collection.'; content = <Library filter={sheet.filter} openSheet={openSheet} />; break;
    case 'profile': title = 'A little about you'; subtitle = 'Make this space feel like home.'; content = <EditProfile close={close} />; break;
    case 'together': title = 'Our little world'; subtitle = 'Two people. One delicious story.'; content = <Together close={close} />; break;
    case 'preferences': title = 'Your kind of good'; subtitle = 'A diary with a taste for you.'; content = <Preferences close={close} />; break;
    case 'settings': title = 'The little details'; subtitle = 'Savor, just the way you like it.'; content = <SettingsPanel />; break;
    case 'privacy': title = 'Just between us'; subtitle = 'A little space you can trust.'; content = <Privacy openSheet={openSheet} />; break;
    case 'weekly': title = 'A week to savor'; subtitle = 'Your little collection of good things.'; content = <Weekly openSheet={openSheet} navigate={go} />; break;
    case 'journey': title = 'Our journey'; subtitle = 'One meal, one place, one memory at a time.'; content = <Journey navigate={go} />; break;
    case 'notifications': title = 'A little hello'; subtitle = 'The latest from your little world.'; content = <Notifications openSheet={openSheet} close={close} />; break;
    case 'help': title = 'Here for you'; subtitle = 'A little help, whenever you need it.'; content = <Help />; break;
  }
  return <SheetShell title={title} subtitle={subtitle} close={close}>{content}</SheetShell>;
}