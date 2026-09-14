import { starterCards, type CardDefinition } from '@kartishki/shared';
import { rarityOrder, type Rarity } from './ui/rarity';

const names = ['Завсегдатай', 'Мусорный барон', 'Местный джентльмен', 'Ночной скребун', 'Картонный рыцарь', 'Рыбный пророк', 'Старый знакомый', 'Пыльный охотник', 'Котлета', 'Шумный сосед', 'Слепой нотариус', 'Гроза помойки', 'Последний молочник', 'Кошмар дворника', 'Лунный вор', 'Пакетный демон', 'Ирония судьбы', 'Второе дыхание', 'Парадокс', 'Король подвала', 'Грязный фокусник', 'Чумной доктор', 'Стеклянный страж', 'Хозяин пустоты'];
// Local demo cards supplement the published catalog, never the match catalog.
export const demoCards: CardDefinition[] = names.map((name, i) => ({ ...starterCards[i % starterCards.length], id: `demo-cat-${i}`, name: { ru: name, en: name }, cost: i % 11, attack: 1 + i % 7, health: 2 + i % 8, rarity: rarityOrder[i % 5] as Rarity, description: { ru: i % 2 ? 'Выживает там, где заканчивается удача.' : 'За этим столом у каждого свой план.', en: 'Everyone has a plan at this table.' } }));
