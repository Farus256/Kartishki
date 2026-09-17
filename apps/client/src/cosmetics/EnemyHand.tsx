import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { CardBackFace } from './CardBackFace';

/**
 * The opponent's hand as a fan of their card backs, tucked behind the left edge of the table. Only the
 * public hand size is drawn — the cards themselves never leave the server. Cards slide in from off-screen
 * when drawn and slip back out when played.
 */
export function EnemyHand({ count, back, name }: { count: number; back?: string; name?: string }) {
  const { t } = useTranslation();
  const n = Math.max(0, Math.min(10, count));
  return <div className="enemy-hand" data-testid="enemy-hand" aria-label={name ? `${name}: ${t('handLabel')} ${n}` : undefined} data-count={n}>
    <AnimatePresence initial={false}>
      {Array.from({ length: n }, (_, i) => {
        const spread = (i - (n - 1) / 2);
        return <motion.div key={i} className="enemy-hand-card" style={{ zIndex: i }}
          initial={{ x: -120, rotate: -40, opacity: 0 }}
          animate={{ x: spread * 6 + 8, y: Math.abs(spread) * 5, rotate: spread * 7 - 14, opacity: 1 }}
          exit={{ x: -140, rotate: -50, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 24 }}>
          <CardBackFace id={back} shape="card" />
        </motion.div>;
      })}
    </AnimatePresence>
    {n > 0 && <b className="enemy-hand-count">{n}</b>}
  </div>;
}
