import { useEffect, useState } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import { Check, X } from 'lucide-react';
import { SavorProvider, useSavor } from './store';
import { Phone } from './components/Phone';
import type { ScreenName } from './data';

const screenOrder: ScreenName[] = ['home', 'map', 'add', 'us', 'me'];

function SavorGallery() {
  const { settings, toast, dismissToast } = useSavor();
  const [compact, setCompact] = useState(() => window.matchMedia('(max-width: 680px)').matches);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 680px)');
    const change = () => setCompact(media.matches);
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);

  return <MotionConfig reducedMotion={settings.reduceMotion ? 'always' : 'user'}>
    <main className="savor-page" data-theme={settings.theme} data-quiet={settings.reduceMotion}>
      <div className="ambient-photo" aria-hidden="true" /><div className="ambient-light" aria-hidden="true" />
      <div className="page-content">
        <motion.header className="page-header" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1 }}>
          <div className="brand-lockup"><h1>Savor</h1><span className="brand-rule" aria-hidden="true" /><p>Food memories.<br />Shared forever.</p></div>
          <p className="gallery-note">5 Screens. One journey.</p>
        </motion.header>
        <section className="showcase" aria-label="Savor, five screens and one journey">{(compact ? screenOrder.slice(0, 1) : screenOrder).map((screen, index) => <Phone key={screen} initialScreen={screen} index={index} compact={compact} />)}</section>
      </div>
      <AnimatePresence>{toast && <motion.div className="toast" role="status" aria-live="polite" key={toast.id} initial={{ opacity: 0, y: 18, x: '-50%' }} animate={{ opacity: 1, y: 0, x: '-50%' }} exit={{ opacity: 0, y: 8, x: '-50%' }} transition={{ duration: 0.25 }}><Check size={16} strokeWidth={1.6} /><span>{toast.message}</span><button onClick={dismissToast} aria-label="Dismiss notification"><X size={15} /></button></motion.div>}</AnimatePresence>
    </main>
  </MotionConfig>;
}

export default function App() {
  return <SavorProvider><SavorGallery /></SavorProvider>;
}
