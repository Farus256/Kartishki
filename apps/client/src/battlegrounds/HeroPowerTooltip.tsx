import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { abCopyDescription, abCopyName, type AutoBattlerCatalog } from '@kartishki/shared';
import type { AbPlayer } from '../autoBattlerSession';
import { PaperTooltip } from '../ui/PaperTooltip';

/** Localised power name and description (set copy first, then the i18n hint with the real gold cost filled in). */
export function powerCopy(power: AbPlayer['power'], catalog: AutoBattlerCatalog, lang: string, t: (key: string, opts?: { defaultValue?: string }) => string) {
  const name = abCopyName(catalog.copy, 'powers', power.id, lang, t(`abPower_${power.id}`, { defaultValue: t('abPower') }));
  // Only the leading price of an active power follows the live cost (free-powers anomaly); payouts quoted inside hints stay as written.
  const fallback = t(`abHint_${power.id}`, { defaultValue: '' }).replace(/^(За|Pay) \$\d+/, `$1 $${power.goldCost}`);
  return { name, description: abCopyDescription(catalog.copy, 'powers', power.id, lang, fallback) };
}

export function HeroPowerTooltip({ power, catalog, combat = false, children, className }: {
  power: AbPlayer['power']; catalog: AutoBattlerCatalog; combat?: boolean; children: ReactNode; className?: string;
}) {
  const { t, i18n } = useTranslation();
  const ru = i18n.language.startsWith('ru');
  const { name, description } = powerCopy(power, catalog, i18n.language, t);
  const status = power.isPassive ? t('abPassive') : combat ? (ru ? 'Доступна во время найма.' : 'Available during recruitment.')
    : power.isExhausted ? (ru ? 'Уже использована. Обновится в следующем ходу.' : 'Used. Refreshes next turn.')
    : power.targeted ? (ru ? 'Нажмите и выберите цель или перетащите способность на неё.' : 'Click and select a target, or drag the power onto it.')
    : (ru ? 'Нажмите, чтобы применить.' : 'Click to activate.');
  return <PaperTooltip className={className} delay={180} content={<><strong>{name}</strong><p>{description}</p><p>{power.isPassive ? '' : `${ru ? 'Стоимость' : 'Cost'}: ${power.goldCost}. `}{status}</p></>}>
    {children}
  </PaperTooltip>;
}
