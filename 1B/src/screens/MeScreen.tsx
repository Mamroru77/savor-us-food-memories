import { Archive, ChevronRight, CircleHelp, Pencil, Settings, ShieldCheck, Utensils } from 'lucide-react';
import { initialMemories } from '../data';
import type { ScreenProps, SheetState } from '../data';
import { useSavor } from '../store';
import { IconButton, Photo, Stat } from '../components/Primitives';

const rows: { title: string; subtitle: string; icon: typeof Settings; sheet: SheetState }[] = [
  { title: 'Preferences', subtitle: 'Dietary, cuisines, tags', icon: Utensils, sheet: { type: 'preferences' } },
  { title: 'Memories', subtitle: 'Export, backup, import', icon: Archive, sheet: { type: 'library' } },
  { title: 'Privacy', subtitle: 'Manage your data', icon: ShieldCheck, sheet: { type: 'privacy' } },
  { title: 'Settings', subtitle: 'Notifications, theme, more', icon: Settings, sheet: { type: 'settings' } },
  { title: 'Help & Feedback', subtitle: "We're here to help", icon: CircleHelp, sheet: { type: 'help' } },
];

export function MeScreen({ openSheet }: ScreenProps) {
  const { memories, profile } = useSavor();
  const added = memories.length - initialMemories.length;
  return <div className="me-screen screen-scroll">
    <header className="profile-heading"><Photo src={profile.avatar} alt={profile.name} className="profile-avatar jamie-avatar" /><div className="profile-copy"><h2>{profile.name}</h2><p>{profile.bio}</p></div><IconButton className="edit-profile-button" label="Edit profile" onClick={() => openSheet({ type: 'profile' })}><Pencil size={17} strokeWidth={1.3} /></IconButton></header>
    <button className="profile-stats-card glass" onClick={() => openSheet({ type: 'library' })} aria-label="Explore your food memories">
      <span className="profile-stats"><Stat value={Math.max(0, 72 + added)} label="Meals" /><Stat value={28 + Math.max(0, added)} label="Places" /><Stat value={9} label="Countries" /><Stat value={2} label="Years" /></span>
      <svg className="memory-chart" viewBox="0 0 250 52" fill="none" role="img" aria-label="A gently growing collection of food memories">
        <path d="M0 38C22 21 35 26 51 33S82 53 105 38S131 16 156 19S207 12 250 9V52H0Z" fill="currentColor" opacity=".075" />
        <path d="M0 38C22 21 35 26 51 33S82 53 105 38S131 16 156 19S207 12 250 9" stroke="currentColor" strokeWidth=".6" opacity=".12" />
        <path d="M0 47C35 46 58 23 86 31S125 43 148 33S203 10 250 16" stroke="white" strokeWidth="1.15" opacity=".95" />
        <path d="M0 43C30 25 51 35 78 39S121 25 148 34S207 18 250 20" stroke="white" strokeWidth=".75" opacity=".55" />
      </svg>
    </button>
    <div className="profile-menu glass">{rows.map(({ title, subtitle, icon: Icon, sheet }) => <button key={title} className="profile-menu-row" onClick={() => openSheet(sheet)}><Icon size={16} strokeWidth={1.4} /><span><strong>{title}</strong><small>{subtitle}</small></span><ChevronRight size={15} strokeWidth={1.2} /></button>)}</div>
  </div>;
}