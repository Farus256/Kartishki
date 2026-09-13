import { starterCards, type CardDefinition } from '@kartishki/shared';
import { rarityOrder, type Rarity } from './ui/rarity';

export const PACKS = [
  { id: 'basement', name: 'Подвальный пак', cost: 100, weights: [70, 22, 6, 1.8, .2] },
  { id: 'elite', name: 'Элитный куш', cost: 300, weights: [20, 45, 25, 9, 1] },
  { id: 'ultimate', name: 'Ультимативный сверток', cost: 750, weights: [0, 20, 45, 30, 5] },
];
export const CASES = [
  { id: 'yard', name: 'Дворовый тайник', cost: 150, weights: [55, 30, 12, 2.5, .5] },
  { id: 'vault', name: 'Сейф коллекционера', cost: 500, weights: [0, 40, 40, 17, 3] },
];
export type Product = typeof PACKS[number];
export type CasinoPrize = { label: string; weight: number; dollars?: number; xp?: number; cards?: number };
export type CasinoGame = {
  id: 'money-wheel' | 'money-case' | 'money-pack';
  name: string;
  kind: 'wheel' | 'case' | 'pack';
  cost: number;
  prizes: readonly CasinoPrize[];
};
export const CASINO_GAMES: readonly CasinoGame[] = [
  {
    id: 'money-wheel', name: 'Колесо фортуны', kind: 'wheel', cost: 75,
    prizes: [
      { label: '$25', weight: 24, dollars: 25 }, { label: '$100', weight: 18, dollars: 100 },
      { label: '+15 опыта', weight: 20, xp: 15 }, { label: '1 карта', weight: 20, cards: 1 },
      { label: '$300', weight: 8, dollars: 300 }, { label: '+40 опыта', weight: 5, xp: 40 },
      { label: '3 карты', weight: 5, cards: 3 },
    ],
  },
  {
    id: 'money-case', name: 'Денежный кейс', kind: 'case', cost: 200,
    prizes: [
      { label: '$75', weight: 25, dollars: 75 }, { label: '$200', weight: 22, dollars: 200 },
      { label: '+25 опыта', weight: 18, xp: 25 }, { label: '1 редкая карта', weight: 20, cards: 1 },
      { label: '$600', weight: 8, dollars: 600 }, { label: '+40 опыта', weight: 4, xp: 40 },
      { label: '3 карты', weight: 3, cards: 3 },
    ],
  },
  {
    id: 'money-pack', name: 'Пак с наличными', kind: 'pack', cost: 125,
    prizes: [
      { label: '$50', weight: 24, dollars: 50 }, { label: '$150', weight: 18, dollars: 150 },
      { label: '+15 опыта', weight: 18, xp: 15 }, { label: '1 карта', weight: 25, cards: 1 },
      { label: '$400', weight: 7, dollars: 400 }, { label: '+25 опыта', weight: 5, xp: 25 },
      { label: '2 карты', weight: 3, cards: 2 },
    ],
  },
] as const;

export function pickCasinoPrize(game: CasinoGame, random = Math.random): CasinoPrize {
  const total = game.prizes.reduce((sum, prize) => sum + prize.weight, 0);
  let roll = random() * total;
  for (const prize of game.prizes) {
    roll -= prize.weight;
    if (roll < 0) return prize;
  }
  return game.prizes[game.prizes.length - 1]!;
}
export type SlotPay = { dollars?: number; packs?: number; cards?: number };
/** Weighted like a hall machine: common faces often, jackpot rarely. Sums to 100. */
export const SLOT_WEIGHTS = [26, 18, 14, 12, 10, 8, 7, 5];
export const SLOT_PAIR: SlotPay[] = [
  { dollars: 50 }, { dollars: 75 }, { dollars: 100 }, { dollars: 125 },
  { dollars: 150 }, { dollars: 200 }, { packs: 1 }, { cards: 1 },
];
export const SLOT_TRIPLE: SlotPay[] = [
  { dollars: 250 }, { dollars: 400 }, { dollars: 600 }, { dollars: 900 },
  { dollars: 1400 }, { dollars: 2500 }, { packs: 3 }, { cards: 5 },
];
export function pickSlotSymbol(random = Math.random) {
  let roll = random() * SLOT_WEIGHTS.reduce((sum, w) => sum + w, 0);
  for (let i = 0; i < SLOT_WEIGHTS.length; i++) {
    roll -= SLOT_WEIGHTS[i];
    if (roll < 0) return i;
  }
  return SLOT_WEIGHTS.length - 1;
}
function payOf(table: SlotPay[], symbol: number) {
  const pay = table[symbol] ?? {};
  return { dollars: pay.dollars ?? 0, packs: pay.packs ?? 0, cards: pay.cards ?? 0 };
}
export function slotReward(reels: number[]) {
  const counts = SLOT_WEIGHTS.map((_, i) => reels.filter(n => n === i).length);
  const largest = Math.max(...counts);
  const symbol = counts.indexOf(largest);
  if (largest < 2) return { dollars: 0, cards: 0, packs: 0, label: 'В этот раз без выигрыша.' };
  const pay = payOf(largest >= 3 ? SLOT_TRIPLE : SLOT_PAIR, symbol);
  const kind = largest >= 3 ? 'Тройка' : 'Пара';
  const label = pay.packs ? `${kind}: ${pay.packs} пак!` : pay.cards ? `${kind}: ${pay.cards} карт!` : `${kind}: $ ${pay.dollars}!`;
  return { ...pay, label };
}
export function drawCard(catalog: CardDefinition[], weights: number[], random = Math.random) {
  const pools = rarityOrder.map(r => catalog.filter(c => c.rarity === r));
  const total = weights.reduce((sum, w, i) => sum + (pools[i].length ? w : 0), 0);
  let roll = random() * total;
  for (let i = 0; i < pools.length; i++) {
    if (!pools[i].length || !weights[i]) continue;
    roll -= weights[i];
    if (roll < 0) return pools[i][Math.min(pools[i].length - 1, Math.floor(random() * pools[i].length))];
  }
  return catalog[0];
}
const names = ['Завсегдатай', 'Мусорный барон', 'Местный джентльмен', 'Ночной скребун', 'Картонный рыцарь', 'Рыбный пророк', 'Старый знакомый', 'Пыльный охотник', 'Котлета', 'Шумный сосед', 'Слепой нотариус', 'Гроза помойки', 'Последний молочник', 'Кошмар дворника', 'Лунный вор', 'Пакетный демон', 'Ирония судьбы', 'Второе дыхание', 'Парадокс', 'Король подвала', 'Грязный фокусник', 'Чумной доктор', 'Стеклянный страж', 'Хозяин пустоты'];
// Local demo cards supplement the published catalog, never the match catalog.
export const demoCards: CardDefinition[] = names.map((name, i) => ({ ...starterCards[i % starterCards.length], id: `demo-cat-${i}`, name: { ru: name, en: name }, cost: i % 11, attack: 1 + i % 7, health: 2 + i % 8, rarity: rarityOrder[i % 5] as Rarity, description: { ru: i % 2 ? 'Выживает там, где заканчивается удача.' : 'За этим столом у каждого свой план.', en: 'Everyone has a plan at this table.' } }));
