import { starterCards, type CardDefinition } from '@kartishki/shared';
import { rarityOrder, type Rarity } from './ui/rarity';

export const PACKS = [
  { id: 'basement', name: 'Подвальный пак', cost: 100, weights: [70, 22, 6, 1.8, .2] },
  { id: 'elite', name: 'Элитный куш', cost: 300, weights: [20, 45, 25, 9, 1] },
  { id: 'ultimate', name: 'Ультимативный сверток', cost: 750, weights: [0, 20, 45, 30, 5] },
];
export const CASES = [
  { id: 'yard', name: 'Дворовый тайник', cost: 150, weights: [55, 30, 12, 2.5, .5] },
  { id: 'vault', name: 'Сейф девятой жизни', cost: 500, weights: [0, 40, 40, 17, 3] },
];
export type Product = typeof PACKS[number];
export const SYMBOLS = ['$', '☠', '♠', '◆', '★', '♛', '✧', 'ฅ'];
export function slotReward(reels: number[]) {
  const counts = SYMBOLS.map((_, i) => reels.filter(n => n === i).length);
  const largest = Math.max(...counts);
  const symbol = counts.indexOf(largest);
  if (largest < 3) return { dollars: 0, cards: 0, packs: 0, label: 'Мимо. Кот забрал сдачу.' };
  const multiplier = largest === 5 ? 20 : largest === 4 ? 8 : 2;
  if (symbol === 7) return { dollars: 0, cards: largest - 2, packs: 0, label: `Кошачий улов: ${largest - 2} карт!` };
  if (symbol === 6) return { dollars: 0, cards: 0, packs: largest - 2, label: `Бонус: ${largest - 2} пак!` };
  return { dollars: 50 * multiplier, cards: 0, packs: 0, label: `Куш ×${multiplier}: $ ${50 * multiplier}!` };
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
const names = ['Кот из подвала', 'Мусорный барон', 'Блохастый джентльмен', 'Ночной скребун', 'Картонный рыцарь', 'Рыбный пророк', 'Кривой ус', 'Пыльный охотник', 'Котлета', 'Шипящий сосед', 'Слепой нотариус', 'Гроза помойки', 'Последний молочник', 'Кошмар дворника', 'Лунный вор', 'Пакетный демон', 'Коготь судьбы', 'Девятая жизнь', 'Кот Шрёдингера', 'Король подвала', 'Грязный фокусник', 'Чумной доктор', 'Стеклянный тигр', 'Хозяин пустоты'];
// Local demo cards supplement the published catalog, never the match catalog.
export const demoCards: CardDefinition[] = names.map((name, i) => ({ ...starterCards[i % starterCards.length], id: `demo-cat-${i}`, name: { ru: name, en: name }, cost: i % 11, attack: 1 + i % 7, health: 2 + i % 8, rarity: rarityOrder[i % 5] as Rarity, description: { ru: i % 2 ? 'Выживает там, где заканчивается удача.' : 'В подвале каждый кот сам за себя.', en: 'Every cat for itself.' } }));
