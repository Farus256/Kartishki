import { CardDetailModal } from '../ui/CardDetailModal';
import { audioManager } from '../AudioManager';
import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import i18n from '@kartishki/i18n';
import { DECK_SIZE, type CardDefinition } from '@kartishki/shared';
import { useEconomy } from '../EconomyContext';
import { cardRules } from '../ui/cardText';
import { PortraitPlaceholder } from '../ui/PortraitPlaceholder';
import { Backdrop } from '../ui/Backdrop';
import { GameCard, LockedSlot } from '../ui/GameCard';
import { InkButton, spring } from '../ui/InkButton';
import { TopBar } from '../ui/TopBar';
import { rarityOrder } from '../ui/rarity';
import { useCardArt } from '../ui/cardArt';

const PER_PAGE = 8;
const CARD_SCALE = 0.96;
const CURVE = [0, 1, 2, 3, 4, 5, 6, 7];
const EMPTY_ART = { url: '', crop: { x: 0.5, y: 0.22, size: 1 }, threshold: 0.5, contrast: 1.5 } as const;

export function DeckBuilderScreen({ onBack, onShop }: { onBack: () => void; onShop?: () => void }) {
  const { t } = useTranslation();
  const economy = useEconomy();
  const catalog = economy.catalog;
  const [detail, setDetail] = useState<CardDefinition>();
  const [rarity, setRarity] = useState<'all' | string>('all');
  const [mana, setMana] = useState<number | 'all'>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [name, setName] = useState('');
  const [draft, setDraft] = useState<string[]>([]);
  const [hovered, setHovered] = useState('');
  const [notice, setNotice] = useState('');
  const [flight, setFlight] = useState<{ card: CardDefinition; x: number; y: number; key: number }>();
  const [editingId, setEditingId] = useState(economy.activeDeck);

  const selected = economy.decks.find(deck => deck.id === economy.activeDeck);
  useEffect(() => { setEditingId(selected?.id ?? ''); setName(selected?.name ?? t('newDeck')); setDraft(selected?.cards ?? []); }, [selected]);

  const owned = useMemo(() => new Map(Object.entries(economy.owned)), [economy.owned]);
  const visible = useMemo(() => catalog.filter(card =>
    (rarity === 'all' || card.rarity === rarity)
    && (mana === 'all' || (mana === 10 ? card.cost >= 10 : card.cost === mana))
    && (card.name.ru + (card.name.en ?? '') + cardRules(card, t, i18n.language)).toLowerCase().includes(search.trim().toLowerCase())
  ), [catalog, rarity, mana, search]);

  const pages = Math.max(1, Math.ceil(visible.length / PER_PAGE));
  const safePage = Math.min(page, pages - 1);
  const slice = visible.slice(safePage * PER_PAGE, safePage * PER_PAGE + PER_PAGE);
  const used = (id: string) => draft.filter(card => card === id).length;
  const curve = CURVE.map(cost => draft.filter(id => {
    const card = catalog.find(item => item.id === id);
    return card && (cost === 7 ? card.cost >= 7 : card.cost === cost);
  }).length);
  const peak = Math.max(1, ...curve);

  function add(card: CardDefinition, index: number) {
    const copies = owned.get(card.id) ?? 0;
    if (draft.length >= DECK_SIZE || used(card.id) >= Math.min(2, copies)) { setNotice(t('deckLimitHint')); return; }
    setNotice('');
    setFlight({ card, x: 50 + (index % 4) * 250, y: 264 + Math.floor(index / 4) * 320, key: Date.now() });
    audioManager.play('card_place'); setDraft(list => [...list, card.id]);
  }
  function drop(id: string) {
    if (draft.includes(id)) audioManager.play('card_remove');
    setDraft(list => { const last = list.lastIndexOf(id); return last < 0 ? list : list.filter((_, n) => n !== last); });
  }

  return (
    <div className="absolute inset-0">
      <Backdrop />
      <TopBar onPlus={onShop} right={<InkButton size="sm" onClick={onBack}>{t('backToMenu')}</InkButton>} />

      <section className="absolute top-[100px] bottom-0 left-0 w-[1070px] binder-board overflow-visible border-r-[8px] border-ink px-[28px] pt-[8px]">
        <h2 className="sr-only">{t('binder')}</h2>

        <div className="mt-2 flex h-[32px] items-center gap-2">
          {(['all', ...rarityOrder] as const).map(key => (
            <button key={key} onClick={() => { setRarity(key); setPage(0); }}
              className={`border-[2px] border-ink px-3 py-[5px] font-mono text-[11px] ${rarity === key ? 'bg-ink text-paper' : 'bg-paper text-ink'}`}>
              {key === 'all' ? t('filterAll') : t(key)}
            </button>
          ))}
          <input value={search} placeholder={t('searchCard')} aria-label={t('searchCard')}
            onChange={e => { setSearch(e.target.value); setPage(0); }}
            className="ml-auto w-[250px] border-[3px] border-ink bg-paper px-3 py-[6px] font-mono text-[13px] outline-none focus:border-blood" />
        </div>

        <div className="mt-1 flex h-[42px] items-center gap-[3px]">
          <span className="mr-2 font-mono text-[11px] text-ink/50">{t('cost')}</span>
          {(['all', 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const).map(value => (
            <span key={String(value)} className="grid h-[40px] w-[36px] place-items-center">
              <button onClick={() => { setMana(value); setPage(0); }}
                className={`grid h-[24px] w-[24px] rotate-45 place-items-center border-[2px] border-ink font-mono text-[10px] ${mana === value ? 'bg-toxic text-paper' : 'bg-paper text-ink'}`}>
                <span className="-rotate-45">{value === 'all' ? '∗' : value === 10 ? '10+' : value}</span>
              </button>
            </span>
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div key={`${safePage}-${rarity}-${mana}-${search}`}
            className="mt-2 mb-[52px] grid grid-cols-4 justify-items-center gap-x-6 gap-y-5 overflow-visible px-1 pt-2"
            initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.18 }}>
            {Array.from({ length: PER_PAGE }, (_, index) => {
              const card = slice[index];
              if (!card) return <LockedSlot key={`empty-${index}`} scale={CARD_SCALE} />;
              const copies = owned.get(card.id) ?? 0;
              return <GameCard key={card.id} card={card} catalog={catalog} scale={CARD_SCALE} owned={copies > 0}
                selected={hovered === card.id} dim={copies > 0 && used(card.id) >= Math.min(2, copies)}
                onClick={() => setDetail(card)} />;
            })}
          </motion.div>
        </AnimatePresence>

        <div className="absolute bottom-[14px] left-[28px] flex items-center gap-4">
          <InkButton size="sm" disabled={safePage === 0} onClick={() => { audioManager.play('page_turn'); setPage(safePage - 1); }}>{t('prevPage')}</InkButton>
          <span className="font-hand text-[18px]">{t('page')} {safePage + 1} / {pages}</span>
          <InkButton size="sm" disabled={safePage >= pages - 1} onClick={() => { audioManager.play('page_turn'); setPage(safePage + 1); }}>{t('nextPage')}</InkButton>
          <span className="ml-4 font-mono text-[11px] text-ink/50">{t('binderHint')}</span>
        </div>
      </section>

      <aside className="absolute top-[100px] right-0 bottom-0 flex w-[530px] flex-col bg-paper px-[24px] pt-[14px]">
        <input value={name} maxLength={60} aria-label={t('deckName')} onChange={e => setName(e.target.value)}
          className="border-[3px] border-ink bg-paper px-3 py-2 font-hand text-[26px] outline-none focus:border-blood" />
        {economy.decks.length > 0 && (
          <select aria-label={t('decks')} value={editingId} onChange={e => { economy.selectDeck(e.target.value); const deck = economy.decks.find(d => d.id === e.target.value); if (deck) { setEditingId(deck.id); setName(deck.name); setDraft(deck.cards); } }}
            className="mt-2 w-full border-[2px] border-ink bg-paper px-2 py-1 font-mono text-[11px] tracking-[1px] text-ink/70">
            {!editingId && <option value="">{t('newDeck')}</option>}
            {economy.decks.map(deck => <option key={deck.id} value={deck.id}>{deck.name}</option>)}
          </select>
        )}

        <div className="mt-3 flex items-baseline gap-3">
          <span className="font-stencil text-[30px]" style={{ color: draft.length === DECK_SIZE ? '#2E8B57' : '#b96a22' }}>{draft.length}</span>
          <span className="font-mono text-[13px] text-ink/60">/ {DECK_SIZE}</span>

        </div>

        <ul className="mt-3 flex-1 overflow-y-auto pr-1">
          {[...new Set(draft)].map(id => {
            const card = catalog.find(item => item.id === id);
            return <DeckTile key={id} card={card} count={used(id)} onHover={setHovered} onDrop={() => drop(id)} />;
          })}
        </ul>

        <span className="mt-2 font-mono text-[11px] text-ink/50">{t('manaCurve')}</span>
        <div className="mt-2 flex shrink-0 h-[52px] items-end gap-[6px] border-b-[3px] border-ink">
          {curve.map((count, cost) => (
            <div key={cost} className="flex min-w-0 flex-1 flex-col items-center justify-end">
              <span className="font-mono text-[10px] leading-none text-ink/60">{count || '\u00a0'}</span>
              <motion.div className="w-3/4 bg-toxic" animate={{ height: Math.round((count / peak) * 36) }} transition={spring} />
            </div>
          ))}
        </div>
        <div className="mt-[2px] flex gap-[6px]">
          {CURVE.map(cost => (
            <span key={cost} className="min-w-0 flex-1 text-center font-mono text-[10px] leading-none text-ink/60">{cost === 7 ? '7+' : cost}</span>
          ))}
        </div>

        <p role="status" className="mt-2 min-h-[18px] font-mono text-[11px] text-blood">{notice || economy.message || (visible.length === 0 ? t('noCardsFound') : '')}</p>
        <div className="flex shrink-0 flex-wrap gap-3 py-4">
          <InkButton size="sm" tone="toxic" disabled={draft.length !== DECK_SIZE || !name.trim()}
            onClick={() => { const id = editingId || crypto.randomUUID(); if (economy.saveDeck({ id, name, cards: draft })) { setEditingId(id); setNotice(t('deckSaved')); } }}>{t('saveDeck')}</InkButton>
          <InkButton size="sm" onClick={() => setDraft([])}>{t('clearDeck')}</InkButton>
          <InkButton size="sm" onClick={() => { setEditingId(''); setName(t('newDeck')); setDraft([]); setNotice(t('newDeck')); }}>{t('newShort')}</InkButton>
          {editingId && <InkButton size="sm" tone="rose" onClick={() => economy.deleteDeck(editingId)}>{t('deleteDeck')}</InkButton>}
        </div>
      </aside>
      {detail && <CardDetailModal card={detail} catalog={catalog} onClose={() => setDetail(undefined)} canAdd={(owned.get(detail.id) ?? 0) > used(detail.id) && used(detail.id) < 2 && draft.length < 30} onAdd={() => add(detail, Math.max(0, slice.findIndex(c => c.id === detail.id)))} />}
      <AnimatePresence>{flight && <motion.div key={flight.key} className="pointer-events-none absolute z-50" initial={{ x: flight.x, y: flight.y, scale: .9, opacity: 1 }} animate={{ x: 1210, y: 330, scale: .15, opacity: 0 }} transition={{ type: 'spring', stiffness: 140, damping: 22 }} onAnimationComplete={() => setFlight(undefined)}><GameCard card={flight.card} hoverable={false} /></motion.div>}</AnimatePresence>
    </div>
  );
}

function DeckTile({ card, count, onDrop, onHover }: { card?: CardDefinition; count: number; onDrop: () => void; onHover: (id: string) => void }) {
  const { t } = useTranslation();
  const art = useCardArt(card?.art ?? EMPTY_ART, 96);
  const name = card ? (card.name[i18n.language] || card.name.ru) : '?';
  return (
    <li onMouseEnter={() => onHover(card?.id ?? '')} onMouseLeave={() => onHover('')} className="relative mb-[6px] flex h-[44px] items-center overflow-hidden border-[2px] border-ink bg-paper">
      {art && <img src={art} alt="" className="absolute top-[-20%] right-0 h-[150%] w-[44%] object-cover object-[70%_12%]" draggable={false} />}
      {!art && <div className="absolute right-0 top-[-16px] h-[88px] w-[44%]"><PortraitPlaceholder seed={card?.id} /></div>}
      <div className="absolute inset-y-0 left-0 w-[72%] bg-gradient-to-r from-ink from-[62%] to-transparent" />
      <span className="relative z-10 grid h-full w-[32px] shrink-0 place-items-center bg-toxic font-stencil text-[13px] text-paper">{card?.cost ?? '?'}</span>
      <span className="relative z-10 min-w-0 flex-1 truncate px-2 font-hand text-[17px] leading-none text-paper"
        style={{ textShadow: '0 1px 3px rgba(0,0,0,.9), 0 0 6px rgba(0,0,0,.8)' }}>{name}</span>
      <span className="relative z-10 mr-1 bg-ink px-2 py-1 font-stencil text-[13px] text-paper">×{count}</span>
      <button aria-label={t('removeCard', { name })} onFocus={() => onHover(card?.id ?? '')} onBlur={() => onHover('')} onClick={onDrop} className="absolute inset-0 z-20 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-legendary" />
    </li>
  );
}
