import { useTranslation } from 'react-i18next';
import { PaperTooltip } from '../ui/PaperTooltip';

/** One ink glyph per anomaly, drawn inside the gem. */
function Glyph({ id }: { id: string }) {
  const g = { stroke: '#2a1a10', strokeWidth: 4, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const };
  switch (id) {
    case 'ab-anomaly-big-tavern': return <g {...g}><path d="M12 30h56v28H12Z" fill="#e8c27a" /><path d="M20 30v-8h40v8M40 42h20" /><circle cx="24" cy="44" r="5" fill="#fff" /><circle cx="40" cy="44" r="5" fill="#fff" /><circle cx="56" cy="44" r="5" fill="#8fe38a" /></g>;
    case 'ab-anomaly-free-refresh': return <g {...g}><path d="M22 40a18 18 0 1 1 5 13" fill="none" stroke="#fff6d2" /><path d="M18 30l10 12-14 2z" fill="#fff6d2" /><text x="38" y="56" fontSize="20" fontFamily="PT Mono,monospace" fontWeight="bold" fill="#8fe38a" stroke="none">0</text></g>;
    case 'ab-anomaly-fast-start': return <g {...g}><path d="M40 12 66 40H54v24H26V40H14Z" fill="#ffd66b" /><text x="33" y="60" fontSize="18" fontFamily="PT Mono,monospace" fontWeight="bold" fill="#2a1a10" stroke="none">2</text></g>;
    case 'ab-anomaly-deep-pockets': return <g {...g}><path d="M16 36c0-12 48-12 48 0v22c0 8-48 8-48 0Z" fill="#b98b3a" /><path d="M16 36c0 8 48 8 48 0" fill="none" /><circle cx="40" cy="26" r="9" fill="#ffd66b" /><circle cx="28" cy="20" r="6" fill="#ffd66b" /><circle cx="52" cy="20" r="6" fill="#ffd66b" /></g>;
    case 'ab-anomaly-cheap-powers': return <g {...g}><circle cx="40" cy="40" r="22" fill="#84afb3" /><path d="M44 22 30 44h12l-4 16 16-24H42Z" fill="#fff6d2" /></g>;
    case 'ab-anomaly-fence': return <g {...g}><path d="M14 40h52v20H14Z" fill="#e8c27a" /><circle cx="40" cy="30" r="10" fill="#ffd66b" /><text x="33" y="56" fontSize="18" fontFamily="PT Mono,monospace" fontWeight="bold" fill="#2a1a10" stroke="none">2</text></g>;
    case 'ab-anomaly-back-room': return <g {...g}><path d="M22 16h36v52H22Z" fill="#6a4a34" /><circle cx="50" cy="44" r="4" fill="#ffd66b" /><path d="M40 12 60 30" fill="none" stroke="#ffd66b" /></g>;
    case 'ab-anomaly-bloodbath': return <g {...g}><path d="M40 12c-10 16-18 26-18 36a18 18 0 0 0 36 0c0-10-8-20-18-36Z" fill="#b3150e" /><path d="M32 46c0 6 3 10 8 12" fill="none" stroke="#ff6a55" /></g>;
    case 'ab-anomaly-plated': return <g {...g}><path d="M40 12 62 20v18c0 14-10 22-22 28-12-6-22-14-22-28V20Z" fill="#fff1a0" /><path d="M32 40l6 6 12-14" fill="none" /></g>;
    case 'ab-anomaly-second-wind': return <g {...g}><path d="M22 44a18 18 0 1 1 6 12" fill="none" stroke="#9ef0ff" /><path d="M18 34l10 12-14 2z" fill="#9ef0ff" /><circle cx="40" cy="42" r="6" fill="#fff" /></g>;
    /* Golden age: two coins fusing under one golden star. */
    case 'ab-anomaly-golden-age': return <g {...g}><circle cx="30" cy="48" r="12" fill="#ffd66b" /><circle cx="50" cy="48" r="12" fill="#ffd66b" /><path d="M40 10l4 9 9 1-7 6 2 9-8-5-8 5 2-9-7-6 9-1Z" fill="#fff6d2" /></g>;
    /* Curio market: a scroll with a star over two extra counter slots. */
    case 'ab-anomaly-spell-market': return <g {...g}><path d="M22 14h36v44H22Z" fill="#f6efdc" /><path d="M40 26l3 7 7 1-5 5 1 7-6-4-6 4 1-7-5-5 7-1Z" fill="#d9b4ff" /><path d="M12 68h16M52 68h16" stroke="#8fe38a" strokeWidth="6" /></g>;
    /* Long night: a crescent moon over a fanned hand of cards. */
    case 'ab-anomaly-long-night': return <g {...g}><path d="M46 12a16 16 0 1 0 12 26 13 13 0 1 1-12-26Z" fill="#fff6d2" /><path d="M16 68l6-22h12l-4 22Z" fill="#84afb3" /><path d="M30 68l4-22h12l-2 22Z" fill="#a9c9cc" /><path d="M44 68l2-22h12v22Z" fill="#84afb3" /></g>;
    /* Overtime: a clock with the hands past midnight. */
    case 'ab-anomaly-overtime': return <g {...g}><circle cx="40" cy="42" r="24" fill="#fff6d2" /><path d="M40 42V24M40 42l12 8" fill="none" /><path d="M40 42l-14 4" fill="none" stroke="#b3150e" /><circle cx="40" cy="42" r="3" fill="#2a1a10" /></g>;
    /* Double trouble: two overlapping shout bursts. */
    case 'ab-anomaly-double-trouble': return <g {...g}><path d="M14 22h30l-4 8 10 4-8 8 6 10-14-4-6 10-4-12-10 2 6-10-8-6 10-2Z" fill="#ffd66b" /><path d="M40 30h26l-3 7 8 3-6 7 5 9-12-3-5 9-3-11-9 2 5-9-7-5 9-2Z" fill="#ff9a5a" /></g>;
    default: return <g {...g}><path d="M40 12l8 20 20 8-20 8-8 20-8-20-20-8 20-8Z" fill="#d9b4ff" /></g>;
  }
}

/** Round gem naming the table's rule twist; visible from the lobby on, the paper tooltip explains it. */
export function AnomalyBadge({ id }: { id: string }) {
  const { t } = useTranslation();
  if (!id) return null;
  const name = t(`abAnomaly_${id}`, { defaultValue: id });
  return (
    <PaperTooltip className="ab-anomaly-anchor" placement="left" delay={100} content={<><strong>{t('abAnomaly')}: {name}</strong><p>{t(`abAnomalyHint_${id}`, { defaultValue: '' })}</p></>}>
      <span className="ab-anomaly" data-testid="ab-anomaly" data-anomaly={id} aria-label={`${t('abAnomaly')}: ${name}`}>
        <svg viewBox="0 0 80 80" aria-hidden><Glyph id={id} /></svg>
        <small>{name}</small>
      </span>
    </PaperTooltip>
  );
}
