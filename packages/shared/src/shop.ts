import { CASE_XP, CASINO_XP, PACK_XP } from './leveling';
import { COSMETICS, cosmeticById, cosmeticRefund } from './cosmetics';

export const SHOP_RARITIES = ['common', 'rare', 'epic', 'legendary', 'ultimate'] as const;
export type ShopCatalogCard = { id: string; name: Record<string, string>; rarity: (typeof SHOP_RARITIES)[number] };
/** 'cosmetic' draws one random skin from the shared COSMETICS table (amount is always 1). */
export type ShopPrize = { kind: 'cards' | 'currency' | 'xp' | 'cosmetic'; amount: number; weight: number };
export type ShopProduct = { id: string; name: string; kind: 'wheel' | 'slots' | 'pack' | 'chest'; cost: number; draws: number; weights: number[]; prizes: ShopPrize[] };
export type ShopConfig = {
  products: ShopProduct[];
  slots: { weights: number[]; pair: number[]; triple: number[] };
  sellPrices: number[];
};
const cardPrizes: ShopPrize[] = [{ kind: 'cards', amount: 1, weight: 100 }];
const mixed: ShopPrize[] = [{ kind: 'currency', amount: 50, weight: 28 }, { kind: 'xp', amount: 15, weight: 20 }, { kind: 'cards', amount: 1, weight: 32 }, { kind: 'cosmetic', amount: 1, weight: 10 }, { kind: 'currency', amount: 250, weight: 8 }, { kind: 'cards', amount: 3, weight: 2 }];
// Wardrobe loot: mostly skins, cash to soften a dry roll.
const wardrobe: ShopPrize[] = [{ kind: 'cosmetic', amount: 1, weight: 50 }, { kind: 'currency', amount: 100, weight: 28 }, { kind: 'xp', amount: 30, weight: 10 }, { kind: 'currency', amount: 300, weight: 8 }, { kind: 'cards', amount: 1, weight: 4 }];
// EV $68 per $75 auto spin (RTP 90.7%); manual $400 spin lands by visual slice, RTP ~39%.
const wheelCash: ShopPrize[] = [
  { kind: 'currency', amount: 25, weight: 62 },
  { kind: 'currency', amount: 50, weight: 24 },
  { kind: 'currency', amount: 100, weight: 8 },
  { kind: 'currency', amount: 200, weight: 3.5 },
  { kind: 'currency', amount: 500, weight: 1.5 },
  { kind: 'currency', amount: 1000, weight: 0.8 },
  { kind: 'currency', amount: 5000, weight: 0.2 },
];
export const defaultShop: ShopConfig = {
  products: [
    { id: 'wheel', name: 'Колесо фортуны', kind: 'wheel', cost: 75, draws: 1, weights: [65, 25, 8, 1.8, .2], prizes: wheelCash },
    { id: 'slots', name: 'Машина Юзи', kind: 'slots', cost: 50, draws: 1, weights: [65, 25, 8, 1.8, .2], prizes: cardPrizes },
    { id: 'basement', name: 'Подвальный пак', kind: 'pack', cost: 100, draws: 5, weights: [70, 22, 6, 1.8, .2], prizes: cardPrizes },
    { id: 'elite', name: 'Элитный куш', kind: 'pack', cost: 300, draws: 5, weights: [20, 45, 25, 9, 1], prizes: cardPrizes },
    { id: 'ultimate', name: 'Золотой свёрток', kind: 'pack', cost: 750, draws: 5, weights: [0, 20, 45, 30, 5], prizes: cardPrizes },
    { id: 'mixed-pack', name: 'Всё включено', kind: 'pack', cost: 150, draws: 3, weights: [55, 30, 12, 2.5, .5], prizes: mixed },
    { id: 'wardrobe-pack', name: 'Гардероб', kind: 'pack', cost: 400, draws: 3, weights: [55, 30, 12, 2.5, .5], prizes: wardrobe },
    { id: 'yard', name: 'Дворовый тайник', kind: 'chest', cost: 150, draws: 1, weights: [55, 30, 12, 2.5, .5], prizes: cardPrizes },
    { id: 'vault', name: 'Сейф коллекционера', kind: 'chest', cost: 500, draws: 1, weights: [0, 40, 40, 17, 3], prizes: cardPrizes },
    { id: 'mixed-chest', name: 'Контрабанда', kind: 'chest', cost: 200, draws: 1, weights: [30, 40, 22, 7, 1], prizes: mixed },
    { id: 'atelier', name: 'Ателье', kind: 'chest', cost: 350, draws: 1, weights: [30, 40, 22, 7, 1], prizes: wardrobe },
  ],
  // 3 reels x weightedIndex: EV $44.49 per $50 bet (RTP 89.0%), any payout 50.9%, jackpot 1 in 296k.
  slots: { weights: [32, 23, 16, 11, 8, 5.5, 3, 1.5], pair: [25, 50, 100, 150, 250, 300, 500, 1000], triple: [150, 300, 500, 900, 1250, 2000, 3000, 10000] },
  sellPrices: [5, 20, 60, 180, 500],
};
const integer = (v: unknown, min: number, max: number) => Number.isInteger(v) && Number(v) >= min && Number(v) <= max;
const weights = (v: unknown, n: number) => Array.isArray(v) && v.length === n && v.every(x => typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= 10000) && v.some(x => x > 0);
export function validateShopConfig(value: unknown): value is ShopConfig {
  if (!value || typeof value !== 'object') return false;
  const c = value as ShopConfig;
  return Array.isArray(c.products) && c.products.length >= 4 && c.products.length <= 24
    && new Set(c.products.map(p => p?.id)).size === c.products.length
    && ['wheel', 'slots', 'pack', 'chest'].every(k => c.products.some(p => p?.kind === k))
    && c.products.every(p => p && typeof p.id === 'string' && /^[a-z0-9-]{1,60}$/.test(p.id) && typeof p.name === 'string' && p.name.trim().length > 0 && p.name.length <= 60
      && ['wheel', 'slots', 'pack', 'chest'].includes(p.kind) && integer(p.cost, 1, 100000) && integer(p.draws, 1, 5)
      && (!['wheel','slots'].includes(p.kind) || p.draws === 1) && weights(p.weights, 5)
      && Array.isArray(p.prizes) && p.prizes.length > 0 && p.prizes.length <= 12
      && p.prizes.every(r => r && ['cards', 'currency', 'xp', 'cosmetic'].includes(r.kind) && integer(r.amount, 1, r.kind === 'cards' ? 5 : r.kind === 'cosmetic' ? 1 : 100000) && typeof r.weight === 'number' && Number.isFinite(r.weight) && r.weight > 0 && r.weight <= 10000))
    && !!c.slots && weights(c.slots.weights, 8) && [c.slots.pair, c.slots.triple].every(a => Array.isArray(a) && a.length === 8 && a.every(x => integer(x, 0, 100000)))
    && Array.isArray(c.sellPrices) && c.sellPrices.length === 5 && c.sellPrices.every(x => integer(x, 0, 100000));
}
export function resolveShop(value: unknown): ShopConfig {
  const c = validateShopConfig(value) ? value : defaultShop;
  return { products: structuredClone(c.products), slots: structuredClone(c.slots), sellPrices: [...c.sellPrices] };
}
export const SLOT_BETS = [25, 50, 75, 100, 125, 150, 175, 200] as const;
export const WHEEL_MANUAL_COST = 400;
export function slotStake(value: unknown, fallback = 50) {
  return (SLOT_BETS as readonly number[]).includes(value as number) ? value as number
    : (SLOT_BETS as readonly number[]).includes(fallback) ? fallback : 50;
}
export function scaleSlot(amount: number, bet: number, base = 50) {
  return Math.round(amount * bet / (base || 50));
}
export type ShopAction = { type: 'buy'; productId: string; bet?: number; land?: number };
export type ShopReward =
  | { kind: 'card'; cardId: string }
  | { kind: 'duplicate'; cardId: string; amount: number }
  | { kind: 'cosmetic'; itemId: string }
  | { kind: 'cosmeticDuplicate'; itemId: string; amount: number }
  | { kind: 'currency' | 'xp'; amount: number };
export type ShopResult = { kind: ShopProduct['kind']; name: string; cost: number; rewards: ShopReward[]; prizeIndex: number; reels?: number[]; product?: ShopProduct };
/** `unlocks` is the account's bought cosmetics; a guest (undefined) gets the refund cash instead of a skin. */
export type ShopWallet = { currency: number; xp: number; owned: Record<string, number>; unlocks?: string[] };
export function parseShopAction(value: unknown): ShopAction | undefined {
  if (!value || typeof value !== 'object') return;
  const a = value as Record<string, unknown>;
  if (a.type === 'buy' && typeof a.productId === 'string') {
    const land = Number.isInteger(a.land) && (a.land as number) >= 0 && (a.land as number) <= 12 ? a.land as number : undefined;
    return { type: 'buy', productId: a.productId, ...((SLOT_BETS as readonly number[]).includes(a.bet as number) ? { bet: a.bet as number } : {}), ...(land != null ? { land } : {}) };
  }
}
export function shopProducts(config: ShopConfig, kind: ShopProduct['kind']) { return config.products.filter(p => p.kind === kind); }
export function shopMixed(product: ShopProduct) { return product.prizes.some(p => p.kind !== 'cards'); }
export function shopPrizeLabel(prize: ShopPrize) {
  if (prize.kind === 'currency') return `$${prize.amount}`;
  if (prize.kind === 'xp') return `+${prize.amount} опыта`;
  if (prize.kind === 'cosmetic') return 'Скин';
  return prize.amount === 1 ? '1 карта' : `${prize.amount} карты`;
}
export function shopBonusXp(kind: ShopResult['kind']) {
  if (kind === 'pack') return PACK_XP;
  if (kind === 'chest') return CASE_XP;
  if (kind === 'wheel' || kind === 'slots') return CASINO_XP;
  return 0;
}
export function shopCash(rewards: ShopReward[]) {
  return rewards.reduce((sum, reward) => sum + (reward.kind === 'currency' || reward.kind === 'duplicate' || reward.kind === 'cosmeticDuplicate' ? reward.amount : 0), 0);
}
export function weightedIndex(list: number[], random = Math.random) {
  const total = list.reduce((a, b) => a + b, 0);
  if (total <= 0) throw new Error('emptyCatalog');
  let n = random() * total;
  for (let i = 0; i < list.length; i++) { n -= list[i]!; if (n < 0) return i; }
  return list.length - 1;
}
export function shopCard(catalog: ShopCatalogCard[], odds: number[], random = Math.random) {
  const pools = SHOP_RARITIES.map(r => catalog.filter(c => c.rarity === r));
  const index = weightedIndex(odds.map((w, i) => pools[i]!.length ? w : 0), random);
  const pool = pools[index]!;
  return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))]!;
}
export function cardPayout(rarity: ShopCatalogCard['rarity'], prices: number[]) {
  return prices[SHOP_RARITIES.indexOf(rarity)] ?? 0;
}
/** Mutates `owned` so a second copy in the same grant becomes cash. */
export function takeAlbumCard(owned: Record<string, number>, card: ShopCatalogCard, prices: number[]): ShopReward {
  if ((owned[card.id] ?? 0) > 0) return { kind: 'duplicate', cardId: card.id, amount: cardPayout(card.rarity, prices) };
  owned[card.id] = 1;
  return { kind: 'card', cardId: card.id };
}
/** Mutates `unlocks` so a second roll in the same grant becomes cash; guests (no unlocks) always take the cash. */
export function takeCosmetic(unlocks: string[] | undefined, random = Math.random): ShopReward {
  const item = COSMETICS[Math.min(COSMETICS.length - 1, Math.floor(random() * COSMETICS.length))]!;
  if (!unlocks) return { kind: 'currency', amount: cosmeticRefund(item) };
  if (unlocks.includes(item.id)) return { kind: 'cosmeticDuplicate', itemId: item.id, amount: cosmeticRefund(item) };
  unlocks.push(item.id);
  return { kind: 'cosmetic', itemId: item.id };
}
export function cardTitle(card: ShopCatalogCard) { return card.name.ru?.trim() || card.name.en?.trim() || card.id; }
/** Same rules for guests and accounts; account randomness and writes stay on the server. */
export function resolveShopAction(config: ShopConfig, catalog: ShopCatalogCard[], wallet: ShopWallet, action: ShopAction, random = Math.random): ShopResult {
  if (!action || action.type !== 'buy') throw new Error('invalidRequest');
  const p = config.products.find(item => item.id === action.productId);
  if (!p) throw new Error('invalidProduct');
  const manual = p.kind === 'wheel' && Number.isInteger(action.land) && action.land! >= 0 && action.land! < p.prizes.length;
  const cost = p.kind === 'slots' ? slotStake(action.bet, p.cost) : manual ? WHEEL_MANUAL_COST : p.cost;
  if (wallet.currency < cost) throw new Error('insufficientFunds');
  if (p.kind === 'slots') {
    const reels = Array.from({ length: 3 }, () => weightedIndex(config.slots.weights, random));
    const counts = config.slots.weights.map((_, i) => reels.filter(r => r === i).length);
    const n = Math.max(...counts), symbol = counts.indexOf(n);
    const table = n === 3 ? config.slots.triple[symbol] : n === 2 ? config.slots.pair[symbol] : 0;
    const amount = scaleSlot(table ?? 0, cost, p.cost);
    return { kind: p.kind, name: p.name, cost, product: structuredClone(p), rewards: [{ kind: 'currency', amount }], prizeIndex: symbol, reels };
  }
  const owned = { ...wallet.owned };
  const unlocks = wallet.unlocks ? [...wallet.unlocks] : undefined;
  const rewards: ShopReward[] = [];
  let prizeIndex = 0;
  for (let i = 0; i < p.draws; i++) {
    prizeIndex = manual ? action.land! : weightedIndex(p.prizes.map(r => r.weight), random);
    const prize = p.prizes[prizeIndex]!;
    if (prize.kind === 'cards') for (let j = 0; j < prize.amount; j++) rewards.push(takeAlbumCard(owned, shopCard(catalog, p.weights, random), config.sellPrices));
    else if (prize.kind === 'cosmetic') rewards.push(takeCosmetic(unlocks, random));
    else rewards.push({ kind: prize.kind, amount: prize.amount });
  }
  return { kind: p.kind, name: p.name, cost, rewards, prizeIndex, product: structuredClone(p) };
}
export function applyShopDebit(wallet: ShopWallet, result: ShopResult): ShopWallet {
  return { ...wallet, owned: { ...wallet.owned }, currency: wallet.currency - result.cost };
}
export function applyShopCredit(wallet: ShopWallet, result: ShopResult): ShopWallet {
  const next = { ...wallet, owned: { ...wallet.owned }, currency: wallet.currency, xp: wallet.xp, ...(wallet.unlocks ? { unlocks: [...wallet.unlocks] } : {}) };
  for (const reward of result.rewards) {
    if (reward.kind === 'card') next.owned[reward.cardId] = (next.owned[reward.cardId] ?? 0) + 1;
    else if (reward.kind === 'cosmetic') { if (next.unlocks && cosmeticById(reward.itemId) && !next.unlocks.includes(reward.itemId)) next.unlocks.push(reward.itemId); }
    else if (reward.kind === 'duplicate' || reward.kind === 'currency' || reward.kind === 'cosmeticDuplicate') next.currency += reward.amount;
    else next.xp += reward.amount;
  }
  return next;
}
export function applyShopResult(wallet: ShopWallet, result: ShopResult): ShopWallet {
  return applyShopCredit(applyShopDebit(wallet, result), result);
}
