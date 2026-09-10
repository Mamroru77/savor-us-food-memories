import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { House, Plus, UserRound, UsersRound, Wifi } from 'lucide-react';
import { screenInfo } from '../data';
import type { ScreenName, SheetState } from '../data';
import { HomeScreen } from '../screens/HomeScreen';
import { MapScreen } from '../screens/MapScreen';
import { AddScreen } from '../screens/AddScreen';
import { UsScreen } from '../screens/UsScreen';
import { MeScreen } from '../screens/MeScreen';
import { PhoneSheet } from './Sheets';

const screens = { home: HomeScreen, map: MapScreen, add: AddScreen, us: UsScreen, me: MeScreen };
const navigation: ScreenName[] = ['home', 'map', 'add', 'us', 'me'];

function StatusBar() {
  return <div className="status-bar" aria-hidden="true"><span>9:41</span><span className="status-symbols"><span className="cellular-signal"><i /><i /><i /><i /></span><Wifi size={14} strokeWidth={2.3} /><svg width="21" height="11" viewBox="0 0 23 12" fill="none"><rect x=".5" y="1.5" width="19" height="9" rx="2" stroke="currentColor" strokeOpacity=".5" /><rect x="2" y="3" width="15.8" height="6" rx="1" fill="currentColor" /><path d="M21 4V8" stroke="currentColor" strokeOpacity=".5" strokeWidth="1.5" strokeLinecap="round" /></svg></span></div>;
}

function NavigationIcon({ screen, active }: { screen: ScreenName; active: boolean }) {
  if (screen === 'home') return active ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M3.5 10L12 2.8L20.5 10V21H14.6V14H9.4V21H3.5V10Z" fill="currentColor" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" /></svg> : <House size={18} strokeWidth={1.2} />;
  if (screen === 'map') return <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 2.5C14.6 4.3 17.2 4.8 20 5V12.2C20 17.1 16.2 20.3 12 22C7.8 20.3 4 17.1 4 12.2V5C6.8 4.8 9.4 4.3 12 2.5Z" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" /><path d="M10 7V10.5C10 12 14 12 14 10.5V7M12 7V16" stroke={active ? '#f5f4f1' : 'currentColor'} strokeWidth="1.1" strokeLinecap="round" /></svg>;
  if (screen === 'us') return <UsersRound size={19} strokeWidth={1.2} fill={active ? 'currentColor' : 'none'} />;
  return <UserRound size={18} strokeWidth={1.2} fill={active ? 'currentColor' : 'none'} />;
}

function BottomNav({ screen, navigate, index }: { screen: ScreenName; navigate: (screen: ScreenName) => void; index: number }) {
  return <nav className="bottom-nav" aria-label={`Phone ${index + 1} navigation`}>
    {navigation.map((item) => item === 'add'
      ? <motion.button key={item} className="add-nav-button" whileTap={{ scale: 0.91 }} whileHover={{ y: -2 }} aria-label="Add a memory" title="Add a memory" aria-current={screen === 'add' ? 'page' : undefined} onClick={() => navigate(item)}><Plus size={28} strokeWidth={1.6} /></motion.button>
      : <button key={item} className={`nav-item ${screen === item ? 'is-active' : ''}`} onClick={() => navigate(item)} aria-label={`Go to ${screenInfo[item].title}`} aria-current={screen === item ? 'page' : undefined}><NavigationIcon screen={item} active={screen === item} /><span>{screenInfo[item].title}</span></button>)}
  </nav>;
}

export function Phone({ initialScreen, index, compact }: { initialScreen: ScreenName; index: number; compact: boolean }) {
  const [screen, setScreen] = useState<ScreenName>(initialScreen);
  const [sheet, setSheet] = useState<SheetState | null>(null);
  const [scale, setScale] = useState(1);
  const device = useRef<HTMLDivElement>(null);
  const navigate = useCallback((next: ScreenName) => { setSheet(null); setScreen(next); }, []);
  const close = useCallback(() => setSheet(null), []);

  useLayoutEffect(() => {
    if (!device.current) return;
    // Keep the original 300 x 670 composition crisp at every gallery width.
    const resize = () => { if (device.current) setScale(device.current.clientWidth / 300); };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(device.current);
    return () => observer.disconnect();
  }, []);

  const Screen = screens[screen];
  const caption = screenInfo[compact ? screen : initialScreen];
  return <motion.figure className="device-column" initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.85, delay: 0.12 + index * 0.09, ease: [0.2, 0.65, 0.3, 1] }}>
    <div ref={device} className={`device device-${screen}`} style={{ '--device-scale': scale } as CSSProperties} role="region" aria-label={`Savor ${screenInfo[screen].title} screen`}>
      <div className="phone-canvas">
        <div className="phone-wallpaper" aria-hidden="true" />
        <div className="phone-ui" inert={sheet !== null}>
          <StatusBar />
          <div className="screen-viewport"><AnimatePresence mode="wait" initial={false}><motion.div key={screen} className="screen-transition" initial={{ opacity: 0, x: 7 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -5 }} transition={{ duration: 0.17, ease: 'easeOut' }}><Screen navigate={navigate} openSheet={setSheet} /></motion.div></AnimatePresence></div>
          <BottomNav screen={screen} navigate={navigate} index={index} />
          <div className="home-indicator" aria-hidden="true" />
        </div>
        <AnimatePresence>{sheet && <PhoneSheet key={sheet.type === 'memory' ? `memory-${sheet.id}` : sheet.type} sheet={sheet} close={close} navigate={navigate} openSheet={setSheet} />}</AnimatePresence>
      </div>
    </div>
    <figcaption className="device-caption"><h2>{compact ? '' : `${index + 1}. `}{caption.title}</h2><p>{caption.description}</p></figcaption>
  </motion.figure>;
}