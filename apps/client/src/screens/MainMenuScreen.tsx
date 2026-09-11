import { useEffect, useState, useSyncExternalStore } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { DAILY_REWARD, starterCards, type CardDefinition } from '@kartishki/shared';
import { playerSession } from '../playerSession';
import { Backdrop } from '../ui/Backdrop';
import { useCardArt } from '../ui/cardArt';
import { InkButton, spring } from '../ui/InkButton';
import { TopBar } from '../ui/TopBar';
import { useCatalog } from '../ui/useCatalog';

type Props = { onPlay: () => void; onDeck: () => void; onShop: () => void; onSettings: () => void; onExit: () => void };

const LEAGUES = [
  { min: 1400, key: 'leagueInkLord', mark: '♛', next: null },
  { min: 1200, key: 'leaguePress', mark: '♚', next: 1400 },
  { min: 1000, key: 'leagueYard', mark: '♞', next: 1200 },
  { min: 0, key: 'leaguePuddle', mark: '♟', next: 1000 },
] as const;

const hatch = { backgroundImage: 'repeating-linear-gradient(-35deg,rgba(26,26,26,.14) 0 1px,transparent 1px 5px)' } as const;

function pad(n: number) { return String(n).padStart(2, '0'); }
function untilMidnight() {
  const next = new Date(); next.setHours(24, 0, 0, 0);
  const ms = Math.max(0, next.getTime() - Date.now());
  return `${pad(Math.floor(ms / 3600000))}:${pad(Math.floor((ms % 3600000) / 60000))}:${pad(Math.floor((ms % 60000) / 1000))}`;
}

export function MainMenuScreen({ onPlay, onDeck, onShop, onSettings, onExit }: Props) {
  const { t } = useTranslation();
  const player = useSyncExternalStore(playerSession.subscribe, playerSession.getSnapshot);
  const catalog = useCatalog();
  const account = !!player.library;
  const profile = player.library?.profile;
  const deck = player.library?.decks.find(item => item.id === player.selectedDeck);
  const dailyReady = !!profile?.dailyAvailable;
  const [timer, setTimer] = useState(untilMidnight);
  useEffect(() => {
    if (dailyReady || !account) return;
    const tick = () => setTimer(untilMidnight());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [dailyReady, account]);

  const items = [
    { key: 'menuPlay', tone: 'blood' as const, run: onPlay, pulse: true, mark: '⚔', enabled: true, play: true },
    { key: 'menuDeck', tone: 'paper' as const, run: onDeck, pulse: false, mark: '▤', enabled: account, play: false },
    { key: 'menuShop', tone: 'gold' as const, run: onShop, pulse: false, mark: '✦', enabled: account, play: false },
    { key: 'menuSettings', tone: 'paper' as const, run: onSettings, pulse: false, mark: '⚙', enabled: true, play: false },
    { key: 'menuExit', tone: 'ink' as const, run: onExit, pulse: false, mark: '↩', enabled: true, play: false },
  ];

  return (
    <div className="absolute inset-0">
      <Backdrop />
      <div className="absolute inset-0" style={{ background: 'linear-gradient(160deg, rgba(216,205,182,.9), rgba(196,182,154,.75))' }} />
      <TopBar onPlus={account ? onShop : undefined} />

      <div className="absolute top-[156px] bottom-[28px] left-[52px] w-[710px]">
        {items.map((item, index) => (
          <motion.div key={item.key} className={item.play ? 'relative mb-[28px]' : 'mb-[16px]'}
            initial={{ opacity: 0, x: -60 }} animate={{ opacity: 1, x: 0 }} transition={{ ...spring, delay: 0.05 * index }}>
            {item.play && (
              <motion.div aria-hidden className="ink-edge pointer-events-none absolute -inset-[8px] border-[3px] border-legendary"
                style={{ boxShadow: '0 0 18px rgba(217,37,37,.7)' }}
                animate={{ opacity: [0.4, 1, 0.4], scale: [1, 1.02, 1] }}
                transition={{ duration: 1.7, repeat: Infinity, ease: 'easeInOut' }} />
            )}
            <InkButton tone={item.tone} size={item.play ? 'xl' : 'lg'} pulse={item.pulse} glow={item.play}
              disabled={!item.enabled} title={item.enabled ? undefined : t('loginRequired')}
              onClick={item.run}
              className={`flex w-full items-center gap-6 ${item.play ? '!bg-[#c20808] !py-7' : ''}`}>
              <span className="relative z-10 font-hand text-[32px] opacity-85">{item.mark}</span>
              <span className="relative z-10 font-hand tracking-[2px]">{t(item.key)}</span>
            </InkButton>
          </motion.div>
        ))}
      </div>

      <motion.aside className="ink-edge absolute top-[124px] right-[44px] bottom-[28px] flex w-[690px] flex-col border-[4px] border-ink bg-paper px-8 pt-7 pb-9 shadow-[9px_11px_0_rgba(26,26,26,.35)]"
        initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 0.2 }}>
        <span className="pointer-events-none absolute inset-0 opacity-[.12]" style={hatch} />
        <span className="absolute -top-[14px] left-[42%] h-[28px] w-[120px] rotate-[-4deg] bg-ink/85" />
        <h2 className="relative font-hand text-[40px] text-ink">{t('dashboard')}</h2>

        <div className="relative mt-5 flex items-center gap-6 border-t-[2px] border-ink/30 pt-5">
          <DeckFan ids={deck?.cards ?? starterCards.map(card => card.id)} catalog={catalog} />
          <div className="min-w-0 flex-1">
            <p className="font-stencil text-[18px] tracking-[3px] text-ink/70">{t('activeDeck')}</p>
            <p className="mt-1 truncate font-hand text-[34px] leading-none text-ink">{deck?.name ?? t('serverDeck')}</p>
            <p className="mt-3 font-stencil text-[30px] leading-none text-ink">{t('deckCount', { count: deck?.cards.length ?? 30 })}</p>
          </div>
        </div>

        <div className="relative mt-6 flex items-center gap-5 border-t-[2px] border-ink/30 pt-5">
          <LeagueStamp elo={profile?.elo} />
          <LeagueProgress elo={profile?.elo} />
        </div>

        {account && (
          <div className="relative mt-auto border-t-[2px] border-ink/30 pt-5">
            <InkButton tone="gold" pulse={dailyReady} disabled={!dailyReady || player.loading}
              onClick={() => void playerSession.claimDaily()} className="w-full !px-6 !py-4">
              {dailyReady
                ? (
                  <span className="relative z-10 flex flex-col items-center leading-tight">
                    <span className="font-stencil text-[18px] tracking-[1px]">{t('dailyLabel')}</span>
                    <span className="font-stencil text-[26px]">{DAILY_REWARD} ✦</span>
                  </span>
                )
                : (
                  <span className="relative z-10 flex flex-col items-center leading-tight">
                    <span className="font-stencil text-[16px] tracking-[1px]">{t('dailyNextLabel')}</span>
                    <span className="font-stencil text-[28px]">{timer}</span>
                  </span>
                )}
            </InkButton>
            {player.error && <p role="alert" className="mt-3 font-mono text-[12px] text-blood">{t(player.error)}</p>}
          </div>
        )}
      </motion.aside>
    </div>
  );
}

function leagueOf(elo: number) {
  const current = LEAGUES.find(item => elo >= item.min) ?? LEAGUES[LEAGUES.length - 1]!;
  const progress = current.next == null ? 1 : Math.min(1, Math.max(0, (elo - current.min) / (current.next - current.min)));
  return { ...current, progress };
}

function LeagueStamp({ elo }: { elo?: number }) {
  const league = leagueOf(elo ?? 0);
  return (
    <div className="ink-edge relative grid h-[108px] w-[108px] shrink-0 place-items-center border-[4px] border-ink bg-ink text-paper shadow-[4px_5px_0_rgba(26,26,26,.4)] -rotate-3">
      <span className="pointer-events-none absolute inset-0 opacity-25" style={hatch} />
      <span className="relative font-stencil text-[52px] leading-none">{elo == null ? '?' : league.mark}</span>
    </div>
  );
}

function LeagueProgress({ elo }: { elo?: number }) {
  const { t } = useTranslation();
  if (elo == null) {
    return (
      <div className="min-w-0 flex-1">
        <p className="font-stencil text-[18px] tracking-[3px] text-ink/70">{t('league')}</p>
        <p className="mt-1 font-hand text-[30px] text-ink/55">{t('guestMode')}</p>
      </div>
    );
  }
  const league = leagueOf(elo);
  return (
    <div className="min-w-0 flex-1">
      <p className="font-stencil text-[18px] tracking-[3px] text-ink/70">{t('league')}</p>
      <p className="mt-1 font-hand text-[30px] leading-none text-ink">{t(league.key)}</p>
      <div className="mt-3 h-[16px] border-[2px] border-ink bg-paper">
        <div className="h-full bg-ink" style={{ width: `${Math.round(league.progress * 100)}%` }} />
      </div>
      <p className="mt-2 font-mono text-[14px] text-ink/65">
        {league.next == null ? t('leagueMax') : `${t('leagueProgress')} · ${elo} → ${league.next}`}
      </p>
    </div>
  );
}

function DeckFan({ ids, catalog }: { ids: string[]; catalog: CardDefinition[] }) {
  const unique = [...new Set(ids)];
  const painted = unique.filter(id => catalog.find(card => card.id === id)?.art.url);
  const picks = (painted.length >= 3 ? painted : unique).slice(0, 3);
  const cards = picks.map(id => catalog.find(card => card.id === id) ?? starterCards.find(card => card.id === id));
  return (
    <div className="relative h-[188px] w-[220px] shrink-0">
      {cards.map((card, index) => (
        <FanCard key={`${picks[index]}-${index}`} card={card} index={index} total={cards.length} />
      ))}
    </div>
  );
}

function FanCard({ card, index, total }: { card?: CardDefinition; index: number; total: number }) {
  const art = useCardArt(card?.art ?? starterCards[0]!.art, 160);
  const mid = (total - 1) / 2;
  const rot = (index - mid) * 12;
  const x = (index - mid) * 30;
  return (
    <div className="ink-edge absolute top-2 left-10 h-[168px] w-[118px] overflow-hidden border-[3px] border-ink bg-[#2b2924] shadow-[5px_6px_0_rgba(26,26,26,.4)]"
      style={{ transform: `translateX(${x}px) rotate(${rot}deg)`, zIndex: index }}>
      {art && <img src={art} alt="" className="h-full w-full object-cover object-[50%_18%]" draggable={false} />}
      <span className="pointer-events-none absolute inset-0 opacity-20" style={hatch} />
    </div>
  );
}
