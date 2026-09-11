import { audioManager } from './AudioManager';
﻿import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { CardDefinition } from '@kartishki/shared';
import { useCatalog } from './ui/useCatalog';
import { CASES, PACKS, demoCards, drawCard, slotReward } from './economy';
import { craftCost } from './ui/rarity';

export type LocalDeck = { id: string; name: string; cards: string[] };
type Opening = { kind: 'packs'; cards: CardDefinition[]; name: string } | { kind: 'cases'; reel: CardDefinition[]; landing: number; prize: CardDefinition } | { kind: 'slots'; reels: number[]; label: string; cards: CardDefinition[]; pendingReward?: { dollars: number; packs: number } };
type State = { dollars: number; owned: Record<string, number>; decks: LocalDeck[]; activeDeck: string; inventory: Record<string, number>; opening?: Opening };
const KEY = 'kartishki-demo-economy-v1';
function initial(): State {
  const cards = demoCards.slice(0, 15).flatMap(c => [c.id, c.id]);
  const fresh: State = { dollars: 1500, owned: Object.fromEntries(demoCards.slice(0, 18).map(c => [c.id, 2])), decks: [{ id: 'starter', name: 'Подвальная банда', cards }], activeDeck: 'starter', inventory: {} };
  try { const s = JSON.parse(localStorage.getItem(KEY) ?? 'null'); if (s && Number.isSafeInteger(s.dollars) && s.dollars >= 0 && Array.isArray(s.decks) && s.decks.every((d: LocalDeck) => typeof d.id === 'string' && typeof d.name === 'string' && Array.isArray(d.cards)) && s.owned && Object.values(s.owned).every(n => Number.isSafeInteger(n) && Number(n) >= 0) && s.inventory && typeof s.activeDeck === 'string') return s; } catch { /* start a fresh demo if storage is unavailable */ }
  return fresh;
}
function useEconomyState() {
  const published = useCatalog();
  const catalog = [...demoCards, ...published.filter(c => !demoCards.some(d => d.id === c.id))];
  const [state, setState] = useState(initial);
  const current = useRef(state);
  const [message, setMessage] = useState('');
  const [currencyEvents, setCurrencyEvents] = useState<{ id: number; amount: number }[]>([]);
  const eventId = useRef(0);
  function currency(amount: number) {
    if (!amount) return;
    setCurrencyEvents(events => [...events.slice(-5), { id: ++eventId.current, amount }]);
    audioManager.play(amount < 0 ? 'coins_spend' : 'coins_win');
  }
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { setMessage('Хранилище недоступно: прогресс сохранён только до закрытия страницы.'); } }, [state]);
  function commit(next: State) { current.current = next; setState(next); }
  function transaction(cost: number, cards: CardDefinition[], patch: Partial<State> = {}) {
    const s = current.current;
    if (s.opening || s.dollars < cost) { setMessage(s.opening ? 'Сначала заберите награду.' : 'Не хватает долларов.'); return false; }
    const owned = { ...s.owned };
    cards.forEach(c => { owned[c.id] = (owned[c.id] ?? 0) + 1; });
    commit({ ...s, dollars: s.dollars - cost, owned, ...patch }); currency(-cost); setMessage(''); return true;
  }
  return { ...state, catalog, message, currencyEvents,
    dismissCurrency(id: number) { setCurrencyEvents(events => events.filter(event => event.id !== id)); },
    clearMessage: () => setMessage(''),
    selectDeck(id: string) { if (current.current.decks.some(d => d.id === id)) commit({ ...current.current, activeDeck: id }); },
    saveDeck(deck: LocalDeck) {
      const s = current.current;
      if (!deck.name.trim() || deck.cards.length !== 30 || deck.cards.some(id => !catalog.some(c => c.id === id) || deck.cards.filter(c => c === id).length > Math.min(2, s.owned[id] ?? 0))) { setMessage('Нужно 30 карт, максимум 2 принадлежащие вам копии каждой.'); return false; }
      commit({ ...s, decks: [...s.decks.filter(d => d.id !== deck.id), { ...deck, name: deck.name.trim() }], activeDeck: deck.id }); setMessage('Колода сохранена.'); return true;
    },
    deleteDeck(id: string) { const s = current.current; const decks = s.decks.filter(d => d.id !== id); commit({ ...s, decks, activeDeck: s.activeDeck === id ? decks[0]?.id ?? '' : s.activeDeck }); setMessage('Колода удалена.'); },
    craft(card: CardDefinition) { if (transaction(craftCost[card.rarity], [card])) setMessage(`${card.name.ru} — в коллекции!`); },
    openPack(id: string) { const p = PACKS.find(p => p.id === id); if (!p) return; const s = current.current; const free = (s.inventory[id] ?? 0) > 0; const cards = Array.from({ length: 5 }, () => drawCard(catalog, p.weights)); transaction(free ? 0 : p.cost, cards, { inventory: { ...s.inventory, [id]: Math.max(0, (s.inventory[id] ?? 0) - 1) }, opening: { kind: 'packs', cards, name: p.name } }); },
    openCase(id: string) { const p = CASES.find(p => p.id === id); if (!p) return; const prize = drawCard(catalog, p.weights); const reel = Array.from({ length: 48 }, () => drawCard(catalog, p.weights)); reel[40] = prize; transaction(p.cost, [prize], { opening: { kind: 'cases', reel, landing: 40, prize } }); },
    spin() {
      const s = current.current;
      if (s.opening || s.dollars < 50) return false;
      const reels = Array.from({ length: 3 }, () => Math.floor(Math.random() * 8));
      const reward = slotReward(reels);
      const cards = Array.from({ length: reward.cards }, () => drawCard(catalog, PACKS[1].weights));
      return transaction(50, [], { opening: { kind: 'slots', reels, label: reward.label, cards, pendingReward: { dollars: reward.dollars, packs: reward.packs } } });
    },
    settleSlot() {
      const s = current.current;
      if (s.opening?.kind !== 'slots') return;
      const { pendingReward: reward, cards } = s.opening;
      // Old saved spins already paid their rewards; only new pending spins settle here.
      const owned = { ...s.owned };
      if (reward) cards.forEach(c => { owned[c.id] = (owned[c.id] ?? 0) + 1; });
      commit({ ...s, opening: undefined, owned, dollars: s.dollars + (reward?.dollars ?? 0), inventory: { ...s.inventory, basement: (s.inventory.basement ?? 0) + (reward?.packs ?? 0) } });
      currency(reward?.dollars ?? 0);
    },
    finish() { commit({ ...current.current, opening: undefined }); },
  };
}
type Economy = ReturnType<typeof useEconomyState>;
const Context = createContext<Economy | null>(null);
export function EconomyProvider({ children }: { children: ReactNode }) { const value = useEconomyState(); return <Context.Provider value={value}>{children}</Context.Provider>; }
export function useEconomy() { const value = useContext(Context); if (!value) throw new Error('EconomyProvider missing'); return value; }
