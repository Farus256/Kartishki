import { audioManager } from './AudioManager';
import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { applyShopCredit, applyShopDebit, applyShopResult, resolveShopAction, shopBonusXp, shopCard, shopCash, shopMixed, type CardDefinition, type ShopAction, type ShopProduct, type ShopResult, type ShopReward, type ShopWallet } from '@kartishki/shared';
import { playerSession } from './playerSession';
import { useCatalog, useShopConfig } from './ui/useCatalog';
import { demoCards } from './economy';

export type ChestTile = { kind: 'card'; card: CardDefinition } | { kind: 'currency' | 'xp' | 'cards'; amount: number };
export type Opening = { kind: 'packs'; result: ShopResult; name: string; cards: { card: CardDefinition; duplicate?: number }[]; extras: ShopReward[] }
  | { kind: 'chests'; result: ShopResult; reel: ChestTile[]; landing: number }
  | { kind: 'slots'; result: ShopResult; reels: number[]; label: string; credited: boolean }
  | { kind: 'casino'; result: ShopResult; credited: boolean };
export type LocalDeck = { id: string; name: string; cards: string[] };
type State = { dollars: number; owned: Record<string, number>; decks: LocalDeck[]; activeDeck: string; inventory: Record<string, number>; opening?: Opening };
const KEY = 'kartishki-demo-economy-v1';
const SHOP_ERRORS: Record<string, string> = {
  insufficientFunds: 'Не хватает долларов.', invalidProduct: 'Нет такого товара.', invalidCard: 'Нет такой карты.',
  emptyCatalog: 'В каталоге нет карт этой редкости.', invalidRequest: 'Некорректный запрос.',
};
function initial(): State {
  const cards = demoCards.slice(0, 15).flatMap(c => [c.id, c.id]);
  const fresh: State = { dollars: 1500, owned: Object.fromEntries(demoCards.slice(0, 18).map(c => [c.id, 2])), decks: [{ id: 'starter', name: 'Подвальная банда', cards }], activeDeck: 'starter', inventory: {} };
  try { const s = JSON.parse(localStorage.getItem(KEY) ?? 'null'); if (s && Number.isSafeInteger(s.dollars) && s.dollars >= 0 && Array.isArray(s.decks) && s.decks.every((d: LocalDeck) => typeof d.id === 'string' && typeof d.name === 'string' && Array.isArray(d.cards)) && s.owned && Object.values(s.owned).every(n => Number.isSafeInteger(n) && Number(n) >= 0) && s.inventory && typeof s.activeDeck === 'string') {
    if (s.opening && !['packs', 'chests', 'slots', 'casino'].includes(s.opening.kind)) delete s.opening;
    if (s.opening?.kind === 'packs') {
      if (!Array.isArray(s.opening.extras)) s.opening.extras = [];
      if (!Array.isArray(s.opening.cards)) delete s.opening;
      else s.opening.cards = s.opening.cards.map((item: CardDefinition | { card: CardDefinition; duplicate?: number }) => 'id' in item ? { card: item } : item);
    }
    if ((s.opening?.kind === 'slots' || s.opening?.kind === 'casino' || s.opening?.kind === 'chests') && !s.opening.result) delete s.opening;
    return s;
  } } catch { /* start a fresh demo if storage is unavailable */ }
  return fresh;
}
function lootOf(result: ShopResult, catalog: CardDefinition[]) {
  return result.rewards.flatMap(reward => {
    if (reward.kind !== 'card' && reward.kind !== 'duplicate') return [];
    const card = catalog.find(item => item.id === reward.cardId);
    return card ? [{ card, duplicate: reward.kind === 'duplicate' ? reward.amount : undefined }] : [];
  });
}
function cardsOf(result: ShopResult, catalog: CardDefinition[]) { return lootOf(result, catalog).map(item => item.card); }
function extrasOf(result: ShopResult) { return result.rewards.filter(reward => reward.kind === 'currency' || reward.kind === 'xp'); }
function slotLabel(result: ShopResult) {
  const amount = result.rewards[0]?.kind === 'currency' ? result.rewards[0].amount : 0;
  if (!result.reels || !amount) return 'В этот раз без выигрыша.';
  const counts = [0, 1, 2, 3, 4, 5, 6, 7].map(i => result.reels!.filter(n => n === i).length);
  const n = Math.max(...counts);
  return n >= 3 ? `Тройка: $ ${amount}!` : n >= 2 ? `Пара: $ ${amount}!` : 'В этот раз без выигрыша.';
}
function prizeTile(prize: ShopProduct['prizes'][number]): ChestTile {
  if (prize.kind === 'currency' || prize.kind === 'xp') return { kind: prize.kind, amount: prize.amount };
  return { kind: 'cards', amount: prize.amount };
}
function chestReel(result: ShopResult, catalog: CardDefinition[], product: ShopProduct) {
  const landing = 40;
  const prize = product.prizes[result.prizeIndex] ?? product.prizes[0]!;
  const cards = cardsOf(result, catalog);
  // Vault-style card ribbon whenever the landing prize is cards (incl. Контрабанда).
  if (!shopMixed(product) || prize.kind === 'cards') {
    const reel: ChestTile[] = Array.from({ length: 48 }, () => ({ kind: 'card', card: shopCard(catalog, product.weights) as CardDefinition }));
    if (cards[0]) reel[landing] = { kind: 'card', card: cards[0] };
    return { reel, landing };
  }
  const reel: ChestTile[] = Array.from({ length: 48 }, () => prizeTile(product.prizes[Math.min(product.prizes.length - 1, Math.floor(Math.random() * product.prizes.length))]!));
  reel[landing] = prizeTile(prize);
  return { reel, landing };
}
function useEconomyState() {
  const published = useCatalog();
  const shop = useShopConfig();
  const catalog = [...demoCards, ...published.filter(c => !demoCards.some(d => d.id === c.id))];
  const account = useSyncExternalStore(playerSession.subscribe, playerSession.getSnapshot);
  const [state, setState] = useState(initial);
  const current = useRef(state);
  const [message, setMessage] = useState('');
  const [currencyEvents, setCurrencyEvents] = useState<{ id: number; amount: number }[]>([]);
  const eventId = useRef(0);
  const appliedReward = useRef(account.lastReward);
  function currency(amount: number) {
    if (!amount) return;
    setCurrencyEvents(events => [...events.slice(-5), { id: ++eventId.current, amount }]);
    audioManager.play(amount < 0 ? 'coins_spend' : 'coins_win');
  }
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { setMessage('Хранилище недоступно: прогресс сохранён только до закрытия страницы.'); } }, [state]);
  useEffect(() => {
    const reward = account.lastReward;
    if (!reward || reward === appliedReward.current) return;
    appliedReward.current = reward;
    if (reward.gained > 0) {
      if (!account.library) commit({ ...current.current, dollars: current.current.dollars + reward.gained });
      currency(reward.gained);
    }
  }, [account.lastReward]);
  function commit(next: State) { current.current = next; setState(next); }
  function guestWallet(s: State, extra = 0): ShopWallet {
    return { currency: s.dollars + extra, xp: account.xp, owned: s.owned };
  }
  function fail(error: unknown) {
    const code = error instanceof Error ? error.message : '';
    setMessage(SHOP_ERRORS[code] ?? (account.error && SHOP_ERRORS[account.error]) ?? 'Не хватает долларов.');
    return false;
  }
  function openingFor(result: ShopResult): Opening | undefined {
    if (result.kind === 'pack') return { kind: 'packs', result, name: result.name, cards: lootOf(result, catalog), extras: extrasOf(result) };
    if (result.kind === 'chest' && result.product) return { kind: 'chests', result, ...chestReel(result, catalog, result.product) };
    if (result.kind === 'slots' && result.reels) return { kind: 'slots', result, reels: result.reels, label: slotLabel(result), credited: !!account.library };
    if (result.kind === 'wheel') return { kind: 'casino', result, credited: !!account.library };
  }
  async function play(action: ShopAction, free = false) {
    const s = current.current;
    if (s.opening) { setMessage('Сначала заберите награду.'); return false; }
    try {
      let result: ShopResult;
      if (account.library) {
        const payload = await playerSession.shop(action);
        if (!payload) return fail(new Error(playerSession.getSnapshot().error || 'invalidRequest'));
        result = payload.result;
        commit({ ...s, opening: openingFor(result) });
      } else {
        const padded = guestWallet(s, free && action.type === 'buy' ? (shop.products.find(p => p.id === action.productId)?.cost ?? 0) : 0);
        result = resolveShopAction(shop, catalog, padded, action);
        const delayed = result.kind === 'slots' || result.kind === 'wheel' || result.kind === 'pack' || result.kind === 'chest';
        const next = delayed ? applyShopDebit(padded, result) : applyShopResult(padded, result);
        commit({ ...s, dollars: next.currency, owned: next.owned, opening: openingFor(result), inventory: action.type === 'buy' && free ? { ...s.inventory, [action.productId]: Math.max(0, (s.inventory[action.productId] ?? 0) - 1) } : s.inventory });
        playerSession.grantXp(shopBonusXp(result.kind) + (delayed ? 0 : next.xp - padded.xp));
      }
      if (!free && result.cost) currency(-result.cost);
      const cash = shopCash(result.rewards);
      if (result.kind !== 'slots' && result.kind !== 'wheel' && result.kind !== 'pack' && result.kind !== 'chest' && cash) currency(cash);

      setMessage('');
      return true;
    } catch (error) { return fail(error); }
  }
  async function creditOpening() {
    const s = current.current;
    if (!s.opening) return;
    if (s.opening.kind === 'packs' || s.opening.kind === 'chests') {
      const { result } = s.opening;
      const win = shopCash(result.rewards);
      const xp = result.rewards.reduce((sum, reward) => sum + (reward.kind === 'xp' ? reward.amount : 0), 0);
      if (!account.library) {
        const next = applyShopCredit(guestWallet(s), result);
        commit({ ...s, dollars: next.currency, owned: next.owned, opening: undefined });
        playerSession.grantXp(xp);
      } else commit({ ...s, opening: undefined });
      currency(win);
      if (cardsOf(result, catalog).length || xp) audioManager.play('case_win');
      return;
    }
    const { result, credited } = s.opening;
    const win = shopCash(result.rewards);
    const xp = result.rewards.reduce((sum, reward) => sum + (reward.kind === 'xp' ? reward.amount : 0), 0);
    if (!credited && !account.library) {
      const next = applyShopCredit(guestWallet(s), result);
      commit({ ...s, dollars: next.currency, owned: next.owned, opening: undefined });
      playerSession.grantXp(xp);
    } else commit({ ...s, opening: undefined });
    currency(win);
    if (cardsOf(result, catalog).length || xp) audioManager.play('case_win');
  }
  const owned = account.library ? Object.fromEntries(account.library.collection.map(row => [row.cardId, row.copies])) : state.owned;
  const rawDollars = account.library?.profile.currency ?? state.dollars;
  const openingHold = account.library && state.opening && (state.opening.kind === 'packs' || state.opening.kind === 'chests')
    ? shopCash(state.opening.result.rewards) : 0;
  return { ...state, owned, shop, dollars: rawDollars - openingHold, catalog, message, currencyEvents,
    dismissCurrency(id: number) { setCurrencyEvents(events => events.filter(event => event.id !== id)); },
    clearMessage: () => setMessage(''),
    selectDeck(id: string) { if (current.current.decks.some(d => d.id === id)) commit({ ...current.current, activeDeck: id }); },
    saveDeck(deck: LocalDeck) {
      const s = current.current;
      if (!deck.name.trim() || deck.cards.length !== 30 || deck.cards.some(id => !catalog.some(c => c.id === id) || deck.cards.filter(c => c === id).length > Math.min(2, s.owned[id] ?? 0))) { setMessage('Нужно 30 карт, максимум 2 принадлежащие вам копии каждой.'); return false; }
      commit({ ...s, decks: [...s.decks.filter(d => d.id !== deck.id), { ...deck, name: deck.name.trim() }], activeDeck: deck.id }); setMessage('Колода сохранена.'); return true;
    },
    deleteDeck(id: string) { const s = current.current; const decks = s.decks.filter(d => d.id !== id); commit({ ...s, decks, activeDeck: s.activeDeck === id ? decks[0]?.id ?? '' : s.activeDeck }); setMessage('Колода удалена.'); },
    openPack(id: string) { return play({ type: 'buy', productId: id }, (current.current.inventory[id] ?? 0) > 0); },
    openCase(id: string) { return play({ type: 'buy', productId: id }); },
    spin(bet?: number) { const product = shop.products.find(p => p.kind === 'slots'); return product ? play({ type: 'buy', productId: product.id, bet }) : false; },
    playCasino(id: string, land?: number) { return play({ type: 'buy', productId: id, ...(land != null ? { land } : {}) }); },
    settleSlot() { return creditOpening(); },
    settleCasino() { return creditOpening(); },
    finish() { return creditOpening(); },
  };
}
type Economy = ReturnType<typeof useEconomyState>;
const Context = createContext<Economy | null>(null);
export function EconomyProvider({ children }: { children: ReactNode }) { const value = useEconomyState(); return <Context.Provider value={value}>{children}</Context.Provider>; }
export function useEconomy() { const value = useContext(Context); if (!value) throw new Error('EconomyProvider missing'); return value; }
