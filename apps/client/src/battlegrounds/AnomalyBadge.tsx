import { useTranslation } from 'react-i18next';
import { PaperTooltip } from '../ui/PaperTooltip';
import { AnomalyGlyph } from './AnomalyGlyph';

/** Round gem naming the table's rule twist; visible from the lobby on, the paper tooltip explains it. */
export function AnomalyBadge({ id }: { id: string }) {
  const { t } = useTranslation();
  if (!id) return null;
  const name = t(`abAnomaly_${id}`, { defaultValue: id });
  return (
    <PaperTooltip className="ab-anomaly-anchor" placement="left" delay={100} content={<><strong>{t('abAnomaly')}: {name}</strong><p>{t(`abAnomalyHint_${id}`, { defaultValue: '' })}</p></>}>
      <span className="ab-anomaly" data-testid="ab-anomaly" data-anomaly={id} aria-label={`${t('abAnomaly')}: ${name}`}>
        <AnomalyGlyph id={id} />
        <small>{name}</small>
      </span>
    </PaperTooltip>
  );
}
