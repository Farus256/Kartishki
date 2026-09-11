import { useSyncExternalStore, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { playerSession } from '../playerSession';

function CatStamp() {
  return (
    <span className="ink-edge relative grid h-[62px] w-[52px] shrink-0 place-items-center overflow-hidden border-[3px] border-ink bg-ink shadow-[3px_4px_0_rgba(26,26,26,.4)]">
      <svg viewBox="0 0 52 62" className="h-full w-full" aria-hidden>
        <rect width="52" height="62" fill="#1a1a1a" />
        <path d="M10 28 L10 16 L18 22 L26 14 L34 22 L42 16 L42 28 C42 46 34 54 26 54 C18 54 10 46 10 28Z" fill="#0d0d0d" stroke="#efece4" strokeWidth="1.4" />
        <circle cx="20" cy="32" r="4.2" fill="#efece4" />
        <circle cx="32" cy="32" r="4.2" fill="#efece4" />
        <circle cx="20" cy="32" r="1.6" fill="#1a1a1a" />
        <circle cx="32" cy="32" r="1.6" fill="#1a1a1a" />
        <path d="M18 44 Q26 40 34 44" fill="none" stroke="#efece4" strokeWidth="1.3" strokeDasharray="2 1.5" />
      </svg>
    </span>
  );
}

/** Avatar, nickname, ELO badge and currency counter shown on the metagame screens. */
export function TopBar({ right, onPlus }: { right?: ReactNode; onPlus?: () => void }) {
  const { t } = useTranslation();
  const player = useSyncExternalStore(playerSession.subscribe, playerSession.getSnapshot);
  const profile = player.library?.profile;
  const name = profile?.username ?? t('guest');
  const broke = (profile?.currency ?? 0) === 0;
  return (
    <header className="absolute top-0 right-0 left-0 z-20 flex h-[100px] items-center gap-6 bg-paper px-10">
      <div className="flex items-center gap-3">
        <CatStamp />
        <p className="font-hand text-[30px] leading-none font-bold text-ink">{name}</p>
      </div>

      <div className="tape-cut flex items-center gap-3 bg-ink px-5 py-[10px] shadow-[4px_5px_0_rgba(26,26,26,.35)]" aria-label={`${t('elo')} ${profile?.elo ?? '—'}`}>
        <span className="text-[22px] leading-none text-paper" aria-hidden>☠</span>
        <span className="font-mono text-[11px] tracking-[2px] text-paper/70">{t('elo')}</span>
        <b className="font-stencil text-[28px] leading-none text-legendary">{profile?.elo ?? '—'}</b>
      </div>

      <div className="ink-edge flex items-center gap-3 border-[3px] border-ink bg-paper px-4 py-[8px] shadow-[4px_5px_0_rgba(26,26,26,.35)]">
        <span className="grid h-[34px] w-[26px] place-items-center" aria-hidden>
          <svg viewBox="0 0 20 28" className="h-[28px] w-[20px]">
            <path d="M10 1 C10 1 2 12 2 18 A8 8 0 0 0 18 18 C18 12 10 1 10 1Z" fill="#1a1a1a" />
            <circle cx="10" cy="19" r="3" fill="#efece4" />
          </svg>
        </span>
        <b className={`font-hand text-[30px] leading-none ${broke ? 'text-ink/45' : 'text-ink'}`}>{profile?.currency ?? '—'}</b>
        <span className="font-hand text-[16px] text-ink/70">{t('currency')}</span>
        <button type="button" onClick={onPlus} disabled={!onPlus} title={t('menuShop')}
          className="ml-1 grid h-[28px] w-[28px] place-items-center border-[2px] border-ink bg-ink font-hand text-[22px] leading-none text-paper disabled:opacity-40">
          +
        </button>
      </div>

      <div className="ml-auto flex items-center gap-3">{right}</div>
      <span className="ink-rule" aria-hidden />
    </header>
  );
}
