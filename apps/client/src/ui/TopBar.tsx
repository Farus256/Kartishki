import { motion } from 'framer-motion';
import { useSyncExternalStore, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useEconomy } from '../EconomyContext';
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
  const economy = useEconomy();
  const deck = economy.decks.find(d => d.id === economy.activeDeck);
  return (
    <header className="absolute top-0 right-0 left-0 z-20 flex h-[100px] items-center gap-6 bg-paper px-10">
      <div className="flex items-center gap-3">
        <CatStamp />
        <p className="font-hand text-[30px] leading-none font-bold text-ink">{name}</p>
      </div>

      <div className="tape-cut max-w-[470px] truncate bg-ink px-5 py-3 font-hand text-[23px] text-paper">
        {deck ? deck.name + ' • ' + deck.cards.length + '/30' : 'Колода не выбрана'}
      </div>
      <div className="ml-auto flex items-center gap-3">
        <div title="Доллары • локальная демо-экономика" className="relative ink-edge flex items-center gap-3 border-[3px] border-ink bg-[#c5d3ac] px-4 py-2 text-[#245037] shadow-[4px_5px_0_#1a1a1a]">
          {economy.currencyEvents.map((event, index) => <motion.span key={event.id} className={`currency-badge ${event.amount > 0 ? 'gain' : 'spend'}`} style={{ right: index * 18 }} initial={{ opacity: 1, y: 20, scale: .85 }} animate={{ opacity: [1, 1, 0], y: [20, -5, -45], scale: event.amount > 0 ? [1, 1.2, 1, 1.15, 1] : 1 }} transition={{ duration: 1.8 }} onAnimationComplete={() => economy.dismissCurrency(event.id)}>{event.amount > 0 ? '+' : '-'}${Math.abs(event.amount)}</motion.span>)}
          <b data-testid="balance" className="font-hand text-[30px]">$ {economy.dollars.toLocaleString('en-US')}</b>
          <button aria-label="Магазин" onClick={onPlus} disabled={!onPlus} className="border-2 border-ink px-2 text-[24px] disabled:opacity-30">+</button>
        </div>
        <button aria-label="Настройки" onClick={() => window.dispatchEvent(new Event('open-settings'))} className="border-[3px] border-ink px-3 py-2 text-[25px]">⚙</button>
        {right}
      </div>
      <span className="ink-rule" aria-hidden />
    </header>
  );
}
