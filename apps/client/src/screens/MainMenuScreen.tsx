import { useSyncExternalStore } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { DAILY_REWARD } from '@kartishki/shared';
import { playerSession } from '../playerSession';
import { Backdrop } from '../ui/Backdrop';
import { InkButton, spring } from '../ui/InkButton';
import { TopBar } from '../ui/TopBar';

type Props = { onPlay: () => void; onDeck: () => void; onShop: () => void; onSettings: () => void; onExit: () => void };

export function MainMenuScreen({ onPlay, onDeck, onShop, onSettings, onExit }: Props) {
  const { t } = useTranslation();
  const player = useSyncExternalStore(playerSession.subscribe, playerSession.getSnapshot);
  const account = !!player.library;
  const deck = player.library?.decks.find(item => item.id === player.selectedDeck);
  const items = [
    { key: 'menuPlay', tone: 'blood' as const, run: onPlay, pulse: true, mark: '⚔', enabled: true },
    { key: 'menuDeck', tone: 'paper' as const, run: onDeck, pulse: false, mark: '▤', enabled: account },
    { key: 'menuShop', tone: 'gold' as const, run: onShop, pulse: false, mark: '✦', enabled: account },
    { key: 'menuSettings', tone: 'paper' as const, run: onSettings, pulse: false, mark: '⚙', enabled: true },
    { key: 'menuExit', tone: 'ink' as const, run: onExit, pulse: false, mark: '⤺', enabled: true },
  ];

  return (
    <div className="absolute inset-0">
      <Backdrop />
      <div className="absolute inset-0" style={{ background: 'linear-gradient(160deg, rgba(216,205,182,.9), rgba(196,182,154,.75))' }} />
      <TopBar />

      <div className="absolute top-[118px] bottom-[40px] left-[110px] w-[660px]">
        {items.map((item, index) => (
          <motion.div key={item.key} className="mb-[22px]"
            initial={{ opacity: 0, x: -60 }} animate={{ opacity: 1, x: 0 }} transition={{ ...spring, delay: 0.05 * index }}>
            <InkButton tone={item.tone} size="lg" pulse={item.pulse} disabled={!item.enabled}
              title={item.enabled ? undefined : t('loginRequired')}
              onClick={item.run} className="flex w-full items-center gap-6">
              <span className="font-stencil text-[30px] opacity-80">{item.mark}</span>
              <span className="tracking-[3px]">{t(item.key)}</span>
            </InkButton>
          </motion.div>
        ))}
      </div>

      <motion.aside className="ink-edge absolute top-[128px] right-[110px] w-[560px] border-[4px] border-ink bg-paper p-7 shadow-[9px_11px_0_rgba(26,26,26,.35)]"
        initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 0.2 }}>
        <span className="absolute -top-[14px] left-[40%] h-[26px] w-[110px] rotate-[-4deg] bg-ink/85" />
        <h2 className="font-hand text-[38px] text-ink">{t('dashboard')}</h2>
        <p className="mt-1 font-mono text-[12px] text-ink/60">{t('playHint')}</p>

        <div className="mt-6 border-t-[2px] border-ink/30 pt-5">
          <p className="font-mono text-[12px] tracking-[2px] text-ink/60">{t('activeDeck')}</p>
          <p className="mt-1 font-hand text-[30px] text-ink">{deck?.name ?? t('serverDeck')}</p>
          <p className="font-mono text-[12px] text-ink/60">{t('deckCount', { count: deck?.cards.length ?? 30 })}</p>
        </div>

        {account && (
          <div className="mt-6 border-t-[2px] border-ink/30 pt-5">
            <InkButton tone="gold" disabled={player.loading} onClick={() => void playerSession.claimDaily()}>
              {t('daily', { amount: DAILY_REWARD })}
            </InkButton>
            {player.error && <p role="alert" className="mt-3 font-mono text-[12px] text-blood">{t(player.error)}</p>}
          </div>
        )}
      </motion.aside>
    </div>
  );
}
