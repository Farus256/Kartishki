import i18n from '@kartishki/i18n';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { motion, useAnimationControls } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { session } from '../session';
import { InkButton, spring } from '../ui/InkButton';

const ITEM_H = 86;
const reelTitles = () => Array.from({ length: 24 }, (_, n) => { const titles = i18n.t('matchmakingTitles').split('|'); return titles[n % titles.length]!; });

/** Spinning drum of opponent titles, driven by the real Colyseus queue state. */
export function MatchmakingModal({ onFound, onCancel }: { onFound: () => void; onCancel: () => void }) {
  const REEL = reelTitles();
  const { t } = useTranslation();
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const [index, setIndex] = useState(0);
  const [locked, setLocked] = useState(false);
  const shake = useAnimationControls();
  const searching = !locked && !['active', 'selecting'].includes(state.status);
  const opponent = REEL[index % REEL.length];
  const handedOff = useRef(false);
  const onFoundRef = useRef(onFound);
  onFoundRef.current = onFound;

  useEffect(() => { void session.connect(); }, []);

  useEffect(() => {
    if (!searching) return;
    const timer = setInterval(() => setIndex(n => n + 1), 90);
    return () => clearInterval(timer);
  }, [searching]);

  useEffect(() => {
    if (!['active', 'selecting'].includes(state.status)) return;
    setLocked(true);
    setIndex(n => n + 5);
  }, [state.status]);

  useEffect(() => {
    if (!locked) return;
    const impact = setTimeout(() => void shake.start({ x: [0, -16, 13, -8, 5, 0], y: [0, 9, -7, 4, 0] }, { duration: 0.42 }), 620);
    const leave = setTimeout(() => {
      if (handedOff.current) return;
      handedOff.current = true;
      onFoundRef.current();
    }, 1450);
    return () => { clearTimeout(impact); clearTimeout(leave); };
  }, [locked]);

  return (
    <motion.div className="absolute inset-0 z-50 grid place-items-center bg-black/78"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div animate={shake} className="ink-edge relative w-[820px] border-[4px] border-paper/50 bg-[#161616] p-10 text-paper shadow-[0_0_60px_rgba(0,0,0,.9)]">
        <h2 className="text-center font-hand text-[46px]">{locked ? t('opponentFound') : t('searchingOpponent')}</h2>
        <p className="mt-1 text-center font-mono text-[12px] tracking-[3px] text-paper/50">{t(state.status)}</p>

        {/* Vintage drum */}
        <div className="relative mx-auto mt-8 h-[258px] w-[620px] overflow-hidden border-[4px] border-paper/40 bg-black/60">
          <div className="pointer-events-none absolute inset-0 z-20"
            style={{ background: 'linear-gradient(180deg,#000 0%,transparent 26%,transparent 74%,#000 100%)' }} />
          <div className="pointer-events-none absolute top-[86px] right-0 left-0 z-20 h-[86px] border-y-[3px] border-blood" />
          <motion.div className="absolute top-0 right-0 left-0"
            animate={{ y: -index * ITEM_H }}
            transition={locked ? { type: 'spring', stiffness: 60, damping: 17, mass: 1.4 } : { duration: 0.09, ease: 'linear' }}>
            {Array.from({ length: index + 8 }, (_, n) => (
              <div key={n} className="grid h-[86px] place-items-center font-hand text-[38px] text-paper/85" style={{ opacity: n === index ? 1 : 0.5 }}>
                {REEL[n % REEL.length]}
              </div>
            ))}
          </motion.div>
        </div>

        {locked && (
          <motion.p className="mt-6 text-center font-hand text-[34px] text-legendary"
            initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ ...spring, delay: 0.7 }}>
            {opponent}
          </motion.p>
        )}

        {state.error && <p role="alert" className="mt-5 text-center font-mono text-[13px] text-blood">{t(state.error)}</p>}

        <div className="mt-8 flex justify-center">
          <InkButton tone="blood" disabled={locked} onClick={() => { session.leave(); onCancel(); }}>{t('cancel')}</InkButton>
        </div>
      </motion.div>
    </motion.div>
  );
}
