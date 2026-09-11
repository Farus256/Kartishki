import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import i18n from '@kartishki/i18n';
import { DECK_SIZE, type CardDefinition } from '@kartishki/shared';
import { playerSession } from '../playerSession';
import { Backdrop } from '../ui/Backdrop';
import { GameCard } from '../ui/GameCard';
import { InkButton, spring } from '../ui/InkButton';
import { TopBar } from '../ui/TopBar';
import { rarityOrder } from '../ui/rarity';
import { useCatalog } from '../ui/useCatalog';

const PER_PAGE = 10;
const CURVE = [0, 1, 2, 3, 4, 5, 6, 7];

export function DeckBuilderScreen({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation();
  const player = useSyncExternalStore(playerSession.subscribe, playerSession.getSnapshot);
  const catalog = useCatalog();
  const [rarity, setRarity] = useState<'all' | string>('all');
  const [mana, setMana] = useState<number | 'all'>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [name, setName] = useState('');
  const [draft, setDraft] = useState<string[]>([]);

  const selected = player.library?.decks.find(deck => deck.id === player.selectedDeck);
  useEffect(() => { if (selected) { setName(selected.name); setDraft(selected.cards); } }, [selected?.id, selected?.version]);

  const owned = useMemo(() => new Map(player.library?.collection.map(row => [row.cardId, row.copies]) ?? []), [player.library]);
  const visible = useMemo(() => catalog.filter(card =>
    (rarity === 'all' || card.rarity === rarity)
    && (mana === 'all' || card.cost === mana)
    && (card.name.ru + (card.name.en ?? '')).toLowerCase().includes(search.trim().toLowerCase())
  ), [catalog, rarity, mana, search]);

  const pages = Math.max(1, Math.ceil(visible.length / PER_PAGE));
  const safePage = Math.min(page, pages - 1);
  const slice = visible.slice(safePage * PER_PAGE, safePage * PER_PAGE + PER_PAGE);
  const used = (id: string) => draft.filter(card => card === id).length;
  const label = (id: string) => { const c = catalog.find(item => item.id === id); return c?.name[i18n.language] || c?.name.ru || id; };
  const curve = CURVE.map(cost => draft.filter(id => {
    const card = catalog.find(item => item.id === id);
    return card && (cost === 7 ? card.cost >= 7 : card.cost === cost);
  }).length);
  const peak = Math.max(1, ...curve);

  function add(card: CardDefinition) {
    const copies = owned.get(card.id) ?? 0;
    if (draft.length >= DECK_SIZE || used(card.id) >= copies) return;
    setDraft(list => [...list, card.id]);
  }
  function drop(id: string) {
    setDraft(list => { const last = list.lastIndexOf(id); return last < 0 ? list : list.filter((_, n) => n !== last); });
  }

  return (
    <div className="absolute inset-0">
      <Backdrop />
      <TopBar right={<InkButton size="sm" onClick={onBack}>{t('backToMenu')}</InkButton>} />

      {/* Card binder */}
      <section className="absolute top-[86px] bottom-0 left-0 w-[1070px] border-r-[4px] border-ink px-[38px] pt-[16px]">
        <div className="flex items-center gap-3">
          <h2 className="font-hand text-[34px] text-ink">{t('binder')}</h2>
          <input value={search} placeholder={t('searchCard')} aria-label={t('searchCard')}
            onChange={e => { setSearch(e.target.value); setPage(0); }}
            className="ml-auto w-[250px] border-[3px] border-ink bg-paper px-3 py-[6px] font-mono text-[13px] outline-none focus:border-blood" />
        </div>

        <div className="mt-3 flex h-[32px] items-center gap-2">
          {(['all', ...rarityOrder] as const).map(key => (
            <button key={key} onClick={() => { setRarity(key); setPage(0); }}
              className={`border-[2px] border-ink px-3 py-[5px] font-mono text-[11px] ${rarity === key ? 'bg-ink text-paper' : 'bg-paper text-ink'}`}>
              {key === 'all' ? t('filterAll') : t(key)}
            </button>
          ))}
        </div>

        {/* Rotated diamonds need a square cell of their own, otherwise they cut into the grid. */}
        <div className="mt-1 flex h-[42px] items-center gap-[3px]">
          <span className="mr-2 font-mono text-[11px] text-ink/50">{t('cost')}</span>
          {(['all', 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const).map(value => (
            <span key={String(value)} className="grid h-[40px] w-[36px] place-items-center">
              <button onClick={() => { setMana(value); setPage(0); }}
                className={`grid h-[24px] w-[24px] rotate-45 place-items-center border-[2px] border-ink font-mono text-[10px] ${mana === value ? 'bg-toxic text-paper' : 'bg-paper text-ink'}`}>
                <span className="-rotate-45">{value === 'all' ? '∗' : value}</span>
              </button>
            </span>
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div key={`${safePage}-${rarity}-${mana}-${search}`}
            className="mt-3 grid grid-cols-5 gap-x-[22px] gap-y-[16px]"
            initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.18 }}>
            {slice.map(card => {
              const copies = owned.get(card.id) ?? 0;
              return <GameCard key={card.id} card={card} scale={0.92} owned={copies > 0}
                copies={copies > 0 ? `${used(card.id)}/${copies}` : undefined}
                dim={copies > 0 && used(card.id) >= copies}
                onClick={copies > 0 ? () => add(card) : undefined} />;
            })}
          </motion.div>
        </AnimatePresence>

        <div className="absolute bottom-[18px] left-[38px] flex items-center gap-4">
          <InkButton size="sm" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>←</InkButton>
          <span className="font-mono text-[12px]">{t('page')} {safePage + 1} / {pages}</span>
          <InkButton size="sm" disabled={safePage >= pages - 1} onClick={() => setPage(safePage + 1)}>→</InkButton>
          <span className="ml-4 font-mono text-[11px] text-ink/50">{t('binderHint')}</span>
        </div>
      </section>

      {/* Active deck tray */}
      <aside className="absolute top-[86px] right-0 bottom-0 flex w-[530px] flex-col bg-paper px-[30px] pt-[18px]">
        <select aria-label={t('decks')} value={player.selectedDeck} onChange={e => playerSession.selectDeck(e.target.value)}
          className="border-[3px] border-ink bg-paper px-3 py-2 font-mono text-[13px]">
          {player.library?.decks.map(deck => <option key={deck.id} value={deck.id}>{deck.name}</option>)}
        </select>
        <input value={name} maxLength={60} aria-label={t('deckName')} onChange={e => setName(e.target.value)}
          className="mt-3 border-[3px] border-ink bg-paper px-3 py-2 font-hand text-[26px] outline-none focus:border-blood" />

        <div className="mt-3 flex items-baseline gap-3">
          <span className="font-stencil text-[30px]" style={{ color: draft.length === DECK_SIZE ? '#2E8B57' : '#D92525' }}>{draft.length}</span>
          <span className="font-mono text-[13px] text-ink/60">/ {DECK_SIZE}</span>
          <span className="ml-auto font-mono text-[11px] text-ink/50">{t('manaCurve')}</span>
        </div>

        <div className="mt-2 flex h-[86px] items-end gap-[6px] border-b-[3px] border-ink">
          {curve.map((count, cost) => (
            <div key={cost} className="flex flex-1 flex-col items-center justify-end">
              <span className="font-mono text-[10px] text-ink/60">{count || ''}</span>
              <motion.div className="w-full bg-toxic" animate={{ height: Math.round((count / peak) * 62) }} transition={spring} />
              <span className="mt-[2px] font-mono text-[10px] text-ink/60">{cost === 7 ? '7+' : cost}</span>
            </div>
          ))}
        </div>

        <ul className="mt-3 flex-1 overflow-y-auto pr-1">
          {[...new Set(draft)].map(id => {
            const card = catalog.find(item => item.id === id);
            return (
              <li key={id} className="mb-[6px] flex items-center gap-2 border-[2px] border-ink bg-paper px-2 py-[5px]">
                <span className="grid h-[22px] w-[22px] rotate-45 place-items-center bg-toxic font-mono text-[10px] text-paper">
                  <span className="-rotate-45">{card?.cost ?? '?'}</span>
                </span>
                <span className="truncate font-mono text-[12px]">{label(id)}</span>
                <span className="ml-auto font-stencil text-[13px]">×{used(id)}</span>
                <button onClick={() => drop(id)} className="border-[2px] border-ink px-2 font-mono text-[11px] hover:bg-ink hover:text-paper">−</button>
              </li>
            );
          })}
        </ul>

        {player.error && <p role="alert" className="font-mono text-[12px] text-blood">{t(player.error)}</p>}
        <div className="flex gap-3 py-4">
          <InkButton size="sm" tone="blood" disabled={player.loading || draft.length !== DECK_SIZE || !name.trim()}
            onClick={() => void playerSession.saveDeck({ ...(selected ? { id: selected.id, version: selected.version } : {}), name, cards: draft })}>
            {t('saveDeck')}
          </InkButton>
          <InkButton size="sm" onClick={() => { setName(t('newDeck')); setDraft([]); }}>{t('newDeck')}</InkButton>
          {selected && <InkButton size="sm" disabled={player.loading} onClick={() => void playerSession.deleteDeck(selected)}>{t('deleteDeck')}</InkButton>}
        </div>
      </aside>
    </div>
  );
}
