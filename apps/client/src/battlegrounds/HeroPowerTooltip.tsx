import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { abCopyDescription, abCopyName, type AutoBattlerCatalog } from '@kartishki/shared';
import type { AbPlayer } from '../autoBattlerSession';
import { PaperTooltip } from '../ui/PaperTooltip';

export function HeroPowerTooltip({ power, catalog, combat = false, children, className }: {
  power: AbPlayer['power']; catalog: AutoBattlerCatalog; combat?: boolean; children: ReactNode; className?: string;
}) {
  const { t, i18n } = useTranslation();
  const ru = i18n.language.startsWith('ru');
  const name = abCopyName(catalog.copy, 'powers', power.id, i18n.language, t(`abPower_${power.id}`, { defaultValue: t('abPower') }));
  const fallback = t(`abHint_${power.id}`, { defaultValue: '' }).replace(/\$\d+/g, `$${power.goldCost}`);
  const description = abCopyDescription(catalog.copy, 'powers', power.id, i18n.language, fallback);
  const status = power.isPassive ? t('abPassive') : combat ? (ru ? 'Доступна во время найма.' : 'Available during recruitment.')
    : power.isExhausted ? (ru ? 'Уже использована. Обновится в следующем ходу.' : 'Used. Refreshes next turn.')
    : power.targeted ? (ru ? 'Нажмите и выберите цель или перетащите способность на неё.' : 'Click and select a target, or drag the power onto it.')
    : (ru ? 'Нажмите, чтобы применить.' : 'Click to activate.');
  return <PaperTooltip className={className} delay={180} content={<><strong>{name}</strong><p>{description}</p><p>{power.isPassive ? '' : `${ru ? 'Стоимость' : 'Cost'}: ${power.goldCost}. `}{status}</p></>}>
    {children}
  </PaperTooltip>;
}
