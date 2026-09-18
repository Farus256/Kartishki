import { useTranslation } from 'react-i18next';

/** Localised BOT mark next to a server-driven seat's name (leaderboard, round band, fight header). */
export function BotTag() {
  const { t } = useTranslation();
  return <i className="ab-bot-tag" data-testid="ab-bot-tag" aria-label={t('abBot')}>{t('abBot')}</i>;
}
