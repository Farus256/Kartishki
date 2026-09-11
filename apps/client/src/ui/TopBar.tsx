import { useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { playerSession } from '../playerSession';

/** Avatar, nickname, ELO badge and currency counter shown on the metagame screens. */
export function TopBar({ right }: { right?: React.ReactNode }) {
  const { t } = useTranslation();
  const player = useSyncExternalStore(playerSession.subscribe, playerSession.getSnapshot);
  const profile = player.library?.profile;
  const name = profile?.username ?? t('guest');
  return (
    <header className="absolute top-0 right-0 left-0 flex h-[86px] items-center gap-5 border-b-[4px] border-ink bg-paper px-8">
      <div className="ink-edge grid h-[54px] w-[54px] place-items-center border-[3px] border-ink bg-ink font-hand text-[30px] text-paper">
        {name.slice(0, 1).toUpperCase()}
      </div>
      <div className="leading-tight">
        <p className="font-hand text-[26px] text-ink">{name}</p>
        <p className="font-mono text-[10px] tracking-[2px] text-ink/55">{profile ? t('account') : t('guestMode')}</p>
      </div>
      <span className="ml-4 border-[3px] border-ink bg-ink px-4 py-[6px] font-mono text-[13px] text-paper">
        {t('elo')} <b className="font-stencil text-legendary">{profile?.elo ?? '—'}</b>
      </span>
      <span className="border-[3px] border-legendary bg-paper px-4 py-[6px] font-mono text-[13px] text-ink">
        <b className="font-stencil text-[15px]">{profile?.currency ?? '—'}</b> ✦ {t('currency')}
      </span>
      <div className="ml-auto flex items-center gap-3">{right}</div>
    </header>
  );
}
