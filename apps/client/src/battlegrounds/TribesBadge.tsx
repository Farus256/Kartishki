import { useTranslation } from 'react-i18next';
import { abCopyName, type AutoBattlerCopy } from '@kartishki/shared';

/** The tribes this table plays (a handful per match, Hearthstone-style), lettered above the tavern's refresh button. */
export function TribesBadge({ tribes, copy }: { tribes: string[]; copy?: AutoBattlerCopy }) {
  const { t, i18n } = useTranslation();
  if (!tribes.length) return null;
  return <p className="ab-tribes" data-testid="ab-tribes" aria-label={t('abTribesInPlay')}>
    <small>{t('abTribesInPlay')}</small>
    <span>{tribes.map(id => abCopyName(copy, 'tribes', id, i18n.language, t(`abTribe_${id}`, { defaultValue: id }))).join(' · ')}</span>
  </p>;
}
