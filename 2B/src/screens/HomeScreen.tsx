import { Bell, NotebookPen } from 'lucide-react';
import { initialMemories, photos } from '../data';
import type { ScreenProps } from '../data';
import { useSavor } from '../store';
import { IconButton, MemoryRow, Photo, Stat } from '../components/Primitives';

export function HomeScreen({ openSheet, navigate }: ScreenProps) {
  const { memories, settings } = useSavor();
  const added = memories.length - initialMemories.length;
  return <div className="home-screen screen-scroll">
    <IconButton className="notification-button" label="Notifications" onClick={() => openSheet({ type: 'notifications' })}>
      <Bell size={18} strokeWidth={1.4} />
      {settings.reminders && !settings.notificationsRead && <span className="notification-dot" />}
    </IconButton>
    <div className="home-intro">
      <h2>Savor<br />the moment.</h2>
      <p>Collect beautiful meals<br />and the memories that<br />come with them.</p>
    </div>
    <button className="weekly-card glass" onClick={() => openSheet({ type: 'weekly' })} aria-label="View this week's memories">
      <span className="weekly-heading"><span>This week</span><NotebookPen size={13} strokeWidth={1.3} /></span>
      <span className="weekly-stats"><Stat value={Math.max(0, 12 + added)} label="Meals" /><Stat value={5 + Math.max(0, added)} label="Places" /></span>
      <Photo src={added > 0 ? memories[0].photo : photos.meal} alt="A meal worth remembering" className="weekly-photo" />
    </button>
    <section className="recent-section" aria-label="Recent memories">
      <h3>Recent</h3>
      <div className="recent-list glass">
        {memories.slice(0, 5).map((memory) => <MemoryRow key={memory.id} memory={memory} onClick={() => openSheet({ type: 'memory', id: memory.id })} />)}
        {memories.length === 0 && <button className="empty-state" onClick={() => navigate('add')}>Your story starts with a meal.<br /><span>Add your first memory</span></button>}
      </div>
    </section>
  </div>;
}