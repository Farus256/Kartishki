import { useTranslation } from 'react-i18next';
import { PaperTooltip } from '../ui/PaperTooltip';

/** One ink glyph per anomaly, drawn inside the gem. */
function Glyph({ id }: { id: string }) {
  const g = { stroke: '#2a1a10', strokeWidth: 4, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const };
  switch (id) {
    case 'ab-anomaly-brawl': return <g {...g}><path d="M18 62 50 30M50 30l-6-12M50 30l12-6" fill="none" /><path d="M64 60 36 32M36 32l6-12M36 32l-12-6" fill="none" /><circle cx="42" cy="46" r="8" fill="#ffd66b" /></g>;
    case 'ab-anomaly-big-tavern': return <g {...g}><path d="M12 30h56v28H12Z" fill="#e8c27a" /><path d="M20 30v-8h40v8M40 42h20" /><circle cx="24" cy="44" r="5" fill="#fff" /><circle cx="40" cy="44" r="5" fill="#fff" /><circle cx="56" cy="44" r="5" fill="#8fe38a" /></g>;
    case 'ab-anomaly-free-refresh': return <g {...g}><path d="M22 40a18 18 0 1 1 5 13" fill="none" stroke="#fff6d2" /><path d="M18 30l10 12-14 2z" fill="#fff6d2" /><text x="38" y="56" fontSize="20" fontFamily="PT Mono,monospace" fontWeight="bold" fill="#8fe38a" stroke="none">0</text></g>;
    case 'ab-anomaly-fast-start': return <g {...g}><path d="M40 12 66 40H54v24H26V40H14Z" fill="#ffd66b" /><text x="33" y="60" fontSize="18" fontFamily="PT Mono,monospace" fontWeight="bold" fill="#2a1a10" stroke="none">2</text></g>;
    case 'ab-anomaly-deep-pockets': return <g {...g}><path d="M16 36c0-12 48-12 48 0v22c0 8-48 8-48 0Z" fill="#b98b3a" /><path d="M16 36c0 8 48 8 48 0" fill="none" /><circle cx="40" cy="26" r="9" fill="#ffd66b" /><circle cx="28" cy="20" r="6" fill="#ffd66b" /><circle cx="52" cy="20" r="6" fill="#ffd66b" /></g>;
    case 'ab-anomaly-cheap-powers': return <g {...g}><circle cx="40" cy="40" r="22" fill="#84afb3" /><path d="M44 22 30 44h12l-4 16 16-24H42Z" fill="#fff6d2" /></g>;
    case 'ab-anomaly-on-the-house': return <g {...g}><path d="M14 44h52l-6 22H20Z" fill="#e8c27a" /><path d="M20 44c0-14 40-14 40 0" fill="#fff6d6" /><path d="M24 30l4-10M40 26V14M56 30l-4-10" stroke="#fff6d2" /></g>;
    case 'ab-anomaly-long-recruit': return <g {...g}><circle cx="40" cy="42" r="24" fill="#fff6d2" /><path d="M40 42V24M40 42l14 8" /><path d="M32 12h16" /></g>;
    default: return <g {...g}><path d="M40 12l8 20 20 8-20 8-8 20-8-20-20-8 20-8Z" fill="#d9b4ff" /></g>;
  }
}

/** Round gem naming the table's rule twist; visible from the lobby on, the paper tooltip explains it. */
export function AnomalyBadge({ id }: { id: string }) {
  const { t } = useTranslation();
  if (!id) return null;
  const name = t(`abAnomaly_${id}`, { defaultValue: id });
  return (
    <PaperTooltip className="ab-anomaly-anchor" placement="beside" delay={100} content={<><strong>{t('abAnomaly')}: {name}</strong><p>{t(`abAnomalyHint_${id}`, { defaultValue: '' })}</p></>}>
      <span className="ab-anomaly" data-testid="ab-anomaly" data-anomaly={id} aria-label={`${t('abAnomaly')}: ${name}`}>
        <svg viewBox="0 0 80 80" aria-hidden><Glyph id={id} /></svg>
        <small>{name}</small>
      </span>
    </PaperTooltip>
  );
}
