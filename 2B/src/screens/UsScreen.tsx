import { motion } from 'framer-motion';
import { Heart, Settings } from 'lucide-react';
import { formatDate, initialMemories, photos } from '../data';
import type { ScreenProps } from '../data';
import { useSavor } from '../store';
import { IconButton, Photo, ScreenHeading, Stat } from '../components/Primitives';

export function UsScreen({ openSheet }: ScreenProps) {
  const { memories, profile, settings, updateSettings, updateMemory, notify } = useSavor();
  const days = Math.max(0, Math.floor((Date.now() - new Date(`${profile.togetherSince}T00:00:00`).getTime()) / 86400000));
  const added = memories.filter((memory) => memory.shared).length - initialMemories.filter((memory) => memory.shared).length;
  const shared = [...memories.filter((memory) => memory.shared)].sort((a, b) => {
    const order = ['comptoir', 'arabica', 'kyoto'];
    const ai = order.indexOf(a.id), bi = order.indexOf(b.id);
    const rank = (id: string, position: number) => position >= 0 ? position : initialMemories.some((memory) => memory.id === id) ? 99 : -1;
    return rank(a.id, ai) - rank(b.id, bi);
  });

  return <div className="us-screen screen-scroll">
    <ScreenHeading title="Us" subtitle="Our space. Our memories." action={<IconButton label="Shared space settings" onClick={() => openSheet({ type: 'together' })}><Settings size={17} strokeWidth={1.35} /></IconButton>} />
    <div className="together-card glass">
      <div className="couple-avatars">
        <Photo src={profile.avatar} alt={profile.name} className="avatar jamie-avatar" />
        <motion.button className={`couple-heart ${settings.loveSent ? 'love-sent' : ''}`} whileTap={{ scale: 0.8 }} animate={settings.loveSent ? { scale: [1, 1.2, 1] } : { scale: 1 }} transition={{ duration: 0.4 }} aria-label={settings.loveSent ? 'Remove your little love' : 'Add a little love'} aria-pressed={settings.loveSent} onClick={() => { updateSettings({ loveSent: !settings.loveSent }); if (!settings.loveSent) notify('A little love, added to your shared space.'); }}><Heart size={19} strokeWidth={1.4} fill="currentColor" /></motion.button>
        <Photo src={photos.alex} alt={profile.partner} className="avatar alex-avatar" />
      </div>
      <button className="together-count" onClick={() => openSheet({ type: 'together' })}><span>Together for</span><span><strong>{days}</strong><span>days</span></span></button>
    </div>
    <button className="journey-card glass" onClick={() => openSheet({ type: 'journey' })}>
      <span className="journey-title">Our Journey</span>
      <span className="journey-stats"><Stat value={Math.max(0, 48 + added)} label="Meals" /><Stat value={17 + Math.max(0, added)} label="Places" /><Stat value={6} label="Countries" /></span>
      <span className="journey-latest"><span>Latest: {added > 0 && shared[0] ? `${shared[0].city}, ${shared[0].country}` : 'Paris, France'}</span><Photo src={photos.paris} alt="Our latest journey, Paris" /></span>
    </button>
    <section className="shared-section" aria-label="Shared moments">
      <div className="section-heading"><h3>Shared Moments</h3><button onClick={() => openSheet({ type: 'library', filter: 'shared' })}>See all</button></div>
      <div className="shared-gallery">
        {shared.map((memory) => <article className="shared-photo-card" key={memory.id}>
          <button className="shared-photo-open" onClick={() => openSheet({ type: 'memory', id: memory.id })} aria-label={`Open shared memory at ${memory.restaurant}`}><Photo src={memory.placePhoto ?? memory.photo} alt={memory.restaurant} /><span className="shared-photo-shade" /><span className="shared-photo-copy"><strong>{memory.restaurant}</strong><span>{formatDate(memory.date)}</span></span></button>
          <motion.button whileTap={{ scale: 0.75 }} className={`shared-like ${memory.liked ? 'is-liked' : ''}`} aria-label={`${memory.liked ? 'Unlike' : 'Like'} ${memory.restaurant}`} aria-pressed={memory.liked} onClick={() => updateMemory(memory.id, { liked: !memory.liked })}><Heart size={14} strokeWidth={1.3} fill={memory.liked ? 'currentColor' : 'none'} /></motion.button>
        </article>)}
        {!shared.length && <p className="empty-state">Good food is even better together.<br />Share a memory to start your story.</p>}
      </div>
    </section>
  </div>;
}