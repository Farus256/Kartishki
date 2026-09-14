import { motion } from 'framer-motion';
import { useSyncExternalStore, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { levelFromXp } from '@kartishki/shared';
import { useEconomy } from '../EconomyContext';
import { playerSession } from '../playerSession';
import { usePlayerLeveling } from './useCatalog';

function PlayerStamp() {
  return (
    <span className="ink-edge relative grid h-[62px] w-[52px] shrink-0 place-items-center overflow-hidden border-[3px] border-ink bg-ink shadow-[3px_4px_0_rgba(26,26,26,.4)]">
      <svg viewBox="0 0 52 62" className="h-full w-full" aria-hidden>
        <rect width="52" height="62" fill="#1a1a1a" />
        <circle cx="26" cy="22" r="10" fill="#d5cfc3" />
        <path d="M8 58V48a18 18 0 0 1 36 0v10Z" fill="#8c918b" />
      </svg>
    </span>
  );
}

/** Avatar, nickname, ELO badge and currency counter shown on the metagame screens. */
export function TopBar({ right, onPlus }: { right?: ReactNode; onPlus?: () => void }) {
  const { t, i18n } = useTranslation();
  const player = useSyncExternalStore(playerSession.subscribe, playerSession.getSnapshot);
  const profile = player.library?.profile;
  const name = profile?.username ?? t('guest');
  const leveling = usePlayerLeveling();
  const progress = levelFromXp(profile?.xp ?? player.xp, leveling);
  const title = i18n.language.startsWith('en') ? (progress.name.en || progress.name.ru) : progress.name.ru;
  const economy = useEconomy();
  const rank = player.beerRank;
  const dark = rank.league === 'dark';
  return (
    <header className="absolute top-0 right-0 left-0 z-[10000] flex h-[100px] items-center gap-6 bg-paper px-10">
      <PlayerStamp />
      <div className="level-bar" data-testid="player-level">
        <p className="level-bar-name">{name} · {t('playerLevel', { n: progress.level })} · {title}</p>
        <span className="level-bar-row">
          <span className="level-bar-track"><i style={{ width: `${Math.round(progress.current / progress.need * 100)}%` }} /></span>
          <span className="level-bar-xp">{t('xpNow', { now: progress.current, need: progress.need })} · {progress.maxed ? t('xpMax') : t('xpLeft', { n: progress.left })}</span>
        </span>
      </div>
      <div className="ml-auto flex items-center gap-5">
        <div className="top-rank">
          <span className={`beer-league-badge${dark ? ' is-dark' : ''}`} data-testid="beer-league">{dark ? 'II / ЛИГА «ТЁМНОЕ»' : 'I / ЛИГА «СВЕТЛОЕ»'}</span>
          <strong data-testid="beer-volume" className="top-rank-ml">{rank.remainingMl.toLocaleString('ru-RU')}<small>мл</small></strong>
        </div>
        <div className="relative">
          <div title={profile ? 'Доллары аккаунта' : 'Доллары • локальная демо-экономика'} className="ink-edge flex min-w-[168px] shrink-0 items-center gap-3 border-[3px] border-ink bg-[#c5d3ac] px-4 py-2 text-[#245037] shadow-[4px_5px_0_#1a1a1a]">
            <b data-testid="balance" className="min-w-[7.5rem] text-right font-hand text-[30px] tabular-nums">$ {economy.dollars.toLocaleString('en-US')}</b>
            <button aria-label="Магазин" onClick={onPlus} disabled={!onPlus} className="border-2 border-ink px-2 text-[24px] disabled:opacity-30">+</button>
          </div>
          <div className="pointer-events-none absolute inset-x-0 top-full z-[10000] mt-1 flex justify-end gap-1" aria-hidden>
            {economy.currencyEvents.map((event, index) => (
              <motion.span
                key={event.id}
                className={`currency-badge ${event.amount > 0 ? 'gain' : 'spend'}`}
                style={{ marginRight: index * 6 }}
                initial={{ opacity: 1, y: -8, scale: .85 }}
                animate={{ opacity: [1, 1, 0], y: [-8, 6, 28], scale: event.amount > 0 ? [1, 1.2, 1, 1.15, 1] : 1 }}
                transition={{ duration: 1.8 }}
                onAnimationComplete={() => economy.dismissCurrency(event.id)}
              >{event.amount > 0 ? '+' : '-'}${Math.abs(event.amount)}</motion.span>
            ))}
          </div>
        </div>
        <button aria-label="Настройки" onClick={() => window.dispatchEvent(new Event('open-settings'))} className="border-[3px] border-ink px-3 py-2 text-[25px]">⚙</button>
        {right}
      </div>
      <span className="ink-rule" aria-hidden />
    </header>
  );
}
