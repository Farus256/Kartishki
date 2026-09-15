import type { AutoBattlerMinionDef } from './autoBattler';

type Loc = { ru: string; en: string };
const L = (ru: string, en: string): Loc => ({ ru, en });

/**
 * Starter tavern. Tribes keep one identity each: beasts breed tokens and hunt in packs,
 * mechs shield and stack armour, pirates chase gold and grow each turn, undead come back
 * and feed on their dead, neutrals are plain bodies with a few tavern-wide tricks.
 * Effects are data (see AutoBattlerEffect); the server interprets them.
 */
export const starterAutoBattlerMinions: AutoBattlerMinionDef[] = [
  // Tokens (never offered)
  { id: 'ab-token-1-1', name: L('Жетон', 'Token'), tavernTier: 1, attack: 1, health: 1, keywords: [], tribes: ['neutral'], token: true, inTavern: false, inDiscover: false },
  { id: 'ab-token-rat', name: L('Крыса', 'Rat'), tavernTier: 1, attack: 1, health: 1, keywords: [], tribes: ['beast'], token: true, inTavern: false, inDiscover: false },
  { id: 'ab-token-skel', name: L('Скелет-слуга', 'Bone Servant'), tavernTier: 1, attack: 2, health: 1, keywords: [], tribes: ['undead'], token: true, inTavern: false, inDiscover: false },
  { id: 'ab-token-cub', name: L('Медведь', 'Bear'), tavernTier: 3, attack: 3, health: 3, keywords: [], tribes: ['beast'], token: true, inTavern: false, inDiscover: false },

  // Spells (bought like minions, played from hand)
  { id: 'ab-discover', name: L('Открытие', 'Discover'), description: L('Выберите одно из трёх существ.', 'Discover one of three minions.'), tavernTier: 1, attack: 0, health: 1, keywords: [], tribes: ['neutral'], spell: { kind: 'discover' }, generated: true, inTavern: false, inDiscover: false },
  { id: 'ab-spell-coin', name: L('Монета', 'Coin'), description: L('Получите 1 доллар.', 'Gain 1 gold.'), tavernTier: 1, attack: 0, health: 1, keywords: [], tribes: ['neutral'], spell: { kind: 'coin', amount: 1 }, poolCopies: 8, inDiscover: false },
  { id: 'ab-spell-refresh', name: L('Свежая партия', 'Fresh Batch'), description: L('Следующее обновление лавки бесплатно.', 'Your next tavern refresh is free.'), tavernTier: 1, attack: 0, health: 1, keywords: [], tribes: ['neutral'], spell: { kind: 'freeReroll', amount: 1 }, poolCopies: 8, inDiscover: false },
  { id: 'ab-spell-tonic', name: L('Настойка', 'Tonic'), description: L('Сыграйте на существо: +2/+2.', 'Play onto a minion: +2/+2.'), tavernTier: 2, attack: 0, health: 1, keywords: [], tribes: ['neutral'], spell: { kind: 'tonic', amount: 2 }, poolCopies: 8, inDiscover: false },
  { id: 'ab-spell-deposit', name: L('Вклад', 'Deposit'), description: L('Получите 2 доллара.', 'Gain 2 gold.'), tavernTier: 3, attack: 0, health: 1, keywords: [], tribes: ['neutral'], spell: { kind: 'coin', amount: 2 }, poolCopies: 6, inDiscover: false },

  // ── Tier 1 ──
  { id: 'ab-whelp', name: L('Змееныш', 'Whelp'), tavernTier: 1, attack: 2, health: 1, keywords: [], tribes: ['beast'] },
  { id: 'ab-ward', name: L('Страж', 'Ward'), tavernTier: 1, attack: 1, health: 3, keywords: ['taunt'], tribes: ['mech'] },
  { id: 'ab-aegis', name: L('Эгида', 'Aegis'), tavernTier: 1, attack: 2, health: 2, keywords: ['divineShield'], tribes: ['mech'] },
  { id: 'ab-broker', name: L('Маклер', 'Broker'), description: L('Боевой клич: +1 доллар.', 'Battlecry: gain 1 gold.'), tavernTier: 1, attack: 1, health: 2, keywords: ['battlecry'], tribes: ['pirate'], battlecryId: 'ab-bc-gold', effects: [{ trigger: 'battlecry', action: { kind: 'gold', amount: 1 } }] },
  { id: 'ab-rat-pack', name: L('Крысиная стая', 'Rat Pack'), description: L('Предсмертный хрип: призывает Крысу 1/1.', 'Deathrattle: summon a 1/1 Rat.'), tavernTier: 1, attack: 1, health: 2, keywords: ['deathrattle'], tribes: ['beast'], deathrattle: { summonId: 'ab-token-rat', count: 1 } },
  { id: 'ab-scrap-bot', name: L('Хламобот', 'Scrap Bot'), description: L('Предсмертный хрип: призывает Жетон 1/1.', 'Deathrattle: summon a 1/1 Token.'), tavernTier: 1, attack: 1, health: 1, keywords: ['deathrattle'], tribes: ['mech'], deathrattle: { summonId: 'ab-token-1-1', count: 1 } },
  { id: 'ab-deckhand', name: L('Юнга', 'Deckhand'), description: L('В конце хода: +1 к атаке.', 'At the end of your turn: +1 attack.'), tavernTier: 1, attack: 2, health: 1, keywords: [], tribes: ['pirate'], effects: [{ trigger: 'endTurn', target: 'self', action: { kind: 'buff', attack: 1, health: 0 } }] },
  { id: 'ab-ghoul', name: L('Гуль', 'Ghoul'), tavernTier: 1, attack: 1, health: 1, keywords: ['reborn'], tribes: ['undead'] },
  { id: 'ab-cub', name: L('Медвежонок', 'Cub'), description: L('Купили зверя — +1/+1.', 'After you buy a beast: +1/+1.'), tavernTier: 1, attack: 1, health: 1, keywords: [], tribes: ['beast'], effects: [{ trigger: 'buy', onTribe: 'beast', target: 'self', action: { kind: 'buff', attack: 1, health: 1 } }] },
  { id: 'ab-tinkerer', name: L('Жестянщик', 'Tinkerer'), description: L('Боевой клич: случайный ваш механизм получает +1/+1.', 'Battlecry: a random friendly mech gets +1/+1.'), tavernTier: 1, attack: 2, health: 1, keywords: ['battlecry'], tribes: ['mech'], effects: [{ trigger: 'battlecry', target: 'random', tribe: 'mech', action: { kind: 'buff', attack: 1, health: 1 } }] },
  { id: 'ab-swab', name: L('Швабра', 'Swab'), description: L('Продаётся за 2 доллара.', 'Sells for 2 gold.'), tavernTier: 1, attack: 1, health: 1, keywords: [], tribes: ['pirate'], effects: [{ trigger: 'sell', action: { kind: 'gold', amount: 1 } }] },
  { id: 'ab-drunk', name: L('Пьянчуга', 'Drunk'), tavernTier: 1, attack: 2, health: 2, keywords: [], tribes: ['neutral'] },

  // ── Tier 2 ──
  { id: 'ab-viper', name: L('Гадюка', 'Viper'), tavernTier: 2, attack: 1, health: 2, keywords: ['poisonous'], tribes: ['beast'] },
  { id: 'ab-breeder', name: L('Заводчик', 'Breeder'), description: L('Предсмертный хрип: призывает Жетон 1/1.', 'Deathrattle: summon a 1/1 Token.'), tavernTier: 2, attack: 2, health: 2, keywords: ['deathrattle'], tribes: ['beast'], deathrattle: { summonId: 'ab-token-1-1', count: 1 } },
  { id: 'ab-bruiser', name: L('Громила', 'Bruiser'), tavernTier: 2, attack: 3, health: 3, keywords: [], tribes: ['neutral'] },
  { id: 'ab-alpha', name: L('Вожак', 'Alpha'), description: L('Другие ваши звери получают +2 к атаке в бою.', 'Your other beasts have +2 attack in combat.'), tavernTier: 2, attack: 2, health: 3, keywords: [], tribes: ['beast'], auraId: 'ab-aura-beasts', effects: [{ trigger: 'aura', tribe: 'beast', action: { kind: 'aura', attack: 2 } }] },
  { id: 'ab-shieldbot', name: L('Щитобот', 'Shieldbot'), description: L('Боевой клич: соседи получают +1/+1.', 'Battlecry: adjacent minions get +1/+1.'), tavernTier: 2, attack: 1, health: 3, keywords: ['taunt', 'battlecry'], tribes: ['mech'], effects: [{ trigger: 'battlecry', target: 'adjacent', action: { kind: 'buff', attack: 1, health: 1 } }] },
  { id: 'ab-parrot', name: L('Попугай', 'Parrot'), description: L('Сыграли зверя — +1/+1.', 'Whenever you play a beast: +1/+1.'), tavernTier: 2, attack: 2, health: 1, keywords: [], tribes: ['beast'], effects: [{ trigger: 'play', onTribe: 'beast', target: 'self', action: { kind: 'buff', attack: 1, health: 1 } }] },
  { id: 'ab-skeleton', name: L('Скелет', 'Skeleton'), tavernTier: 2, attack: 2, health: 2, keywords: ['reborn'], tribes: ['undead'] },
  { id: 'ab-gravedigger', name: L('Могильщик', 'Gravedigger'), description: L('Предсмертный хрип: случайная ваша нежить получает +2/+2.', 'Deathrattle: a random friendly undead gets +2/+2.'), tavernTier: 2, attack: 2, health: 3, keywords: ['deathrattle'], tribes: ['undead'], effects: [{ trigger: 'deathrattle', target: 'random', tribe: 'undead', action: { kind: 'buff', attack: 2, health: 2 } }] },
  { id: 'ab-mechanic', name: L('Механик', 'Mechanic'), description: L('Триплет: все ваши механизмы получают +1/+1.', 'Whenever you make a triple: your mechs get +1/+1.'), tavernTier: 2, attack: 2, health: 2, keywords: [], tribes: ['mech'], effects: [{ trigger: 'triple', target: 'friendly', tribe: 'mech', action: { kind: 'buff', attack: 1, health: 1 } }] },
  { id: 'ab-bouncer', name: L('Вышибала', 'Bouncer'), tavernTier: 2, attack: 3, health: 2, keywords: ['taunt'], tribes: ['neutral'] },
  { id: 'ab-pickpocket', name: L('Карманник', 'Pickpocket'), description: L('Продаётся за 3 доллара.', 'Sells for 3 gold.'), tavernTier: 2, attack: 2, health: 2, keywords: [], tribes: ['pirate'], effects: [{ trigger: 'sell', action: { kind: 'gold', amount: 2 } }] },
  { id: 'ab-nest', name: L('Гнездо', 'Nest'), description: L('Предсмертный хрип: призывает двух Крыс 1/1.', 'Deathrattle: summon two 1/1 Rats.'), tavernTier: 2, attack: 1, health: 3, keywords: ['deathrattle'], tribes: ['beast'], deathrattle: { summonId: 'ab-token-rat', count: 2 } },

  // ── Tier 3 ──
  { id: 'ab-bulwark', name: L('Бастион', 'Bulwark'), tavernTier: 3, attack: 2, health: 5, keywords: ['taunt'], tribes: ['mech'] },
  { id: 'ab-fang', name: L('Клык', 'Fang'), tavernTier: 3, attack: 3, health: 2, keywords: ['poisonous'], tribes: ['beast'] },
  { id: 'ab-dervish', name: L('Дервиш', 'Dervish'), tavernTier: 3, attack: 2, health: 2, keywords: ['windfury'], tribes: ['pirate'] },
  { id: 'ab-smuggler', name: L('Контрабандист', 'Smuggler'), description: L('В конце хода: +1 доллар.', 'At the end of your turn: gain 1 gold.'), tavernTier: 3, attack: 3, health: 3, keywords: [], tribes: ['pirate'], effects: [{ trigger: 'endTurn', action: { kind: 'gold', amount: 1 } }] },
  { id: 'ab-houndmaster', name: L('Псарь', 'Houndmaster'), description: L('Боевой клич: случайный ваш зверь получает +2/+2.', 'Battlecry: a random friendly beast gets +2/+2.'), tavernTier: 3, attack: 3, health: 3, keywords: ['battlecry'], tribes: ['beast'], effects: [{ trigger: 'battlecry', target: 'random', tribe: 'beast', action: { kind: 'buff', attack: 2, health: 2 } }] },
  { id: 'ab-welder', name: L('Сварщик', 'Welder'), description: L('Купленный механизм получает +1/+1.', 'After you buy a mech, it gets +1/+1.'), tavernTier: 3, attack: 2, health: 4, keywords: [], tribes: ['mech'], effects: [{ trigger: 'buy', onTribe: 'mech', target: 'bought', action: { kind: 'buff', attack: 1, health: 1 } }] },
  { id: 'ab-banshee', name: L('Банши', 'Banshee'), description: L('В начале боя: ваша нежить получает +1/+1.', 'Start of combat: your undead get +1/+1.'), tavernTier: 3, attack: 3, health: 3, keywords: [], tribes: ['undead'], effects: [{ trigger: 'startCombat', target: 'friendly', tribe: 'undead', action: { kind: 'buff', attack: 1, health: 1 } }] },
  { id: 'ab-drummer', name: L('Барабанщик', 'Drummer'), description: L('В конце хода: соседи получают +1/+1.', 'At the end of your turn: adjacent minions get +1/+1.'), tavernTier: 3, attack: 2, health: 4, keywords: [], tribes: ['pirate'], effects: [{ trigger: 'endTurn', target: 'adjacent', action: { kind: 'buff', attack: 1, health: 1 } }] },
  { id: 'ab-lich', name: L('Лич', 'Lich'), description: L('Предсмертный хрип: призывает двух Скелетов-слуг 2/1.', 'Deathrattle: summon two 2/1 Bone Servants.'), tavernTier: 3, attack: 3, health: 4, keywords: ['deathrattle'], tribes: ['undead'], deathrattle: { summonId: 'ab-token-skel', count: 2 } },
  { id: 'ab-collector', name: L('Коллекционер', 'Collector'), description: L('Триплет: +2/+2.', 'Whenever you make a triple: +2/+2.'), tavernTier: 3, attack: 3, health: 3, keywords: [], tribes: ['neutral'], effects: [{ trigger: 'triple', target: 'self', action: { kind: 'buff', attack: 2, health: 2 } }] },
  { id: 'ab-trader', name: L('Торгаш', 'Trader'), description: L('Боевой клич: +2 доллара.', 'Battlecry: gain 2 gold.'), tavernTier: 3, attack: 3, health: 2, keywords: ['battlecry'], tribes: ['pirate'], effects: [{ trigger: 'battlecry', action: { kind: 'gold', amount: 2 } }] },

  // ── Tier 4 ──
  { id: 'ab-knight', name: L('Рыцарь', 'Knight'), tavernTier: 4, attack: 4, health: 4, keywords: ['divineShield'], tribes: ['mech'] },
  { id: 'ab-howler', name: L('Ревун', 'Howler'), tavernTier: 4, attack: 3, health: 6, keywords: ['taunt'], tribes: ['beast'] },
  { id: 'ab-butcher', name: L('Мясник', 'Butcher'), tavernTier: 4, attack: 3, health: 3, keywords: ['cleave'], tribes: ['undead'] },
  { id: 'ab-den-mother', name: L('Мать стаи', 'Den Mother'), description: L('В конце хода: ваши звери получают +1/+1.', 'At the end of your turn: your beasts get +1/+1.'), tavernTier: 4, attack: 4, health: 4, keywords: [], tribes: ['beast'], effects: [{ trigger: 'endTurn', target: 'friendly', tribe: 'beast', action: { kind: 'buff', attack: 1, health: 1 } }] },
  { id: 'ab-forgemaster', name: L('Кузнец', 'Forgemaster'), description: L('Боевой клич: ваши механизмы получают +2/+1.', 'Battlecry: your mechs get +2/+1.'), tavernTier: 4, attack: 4, health: 5, keywords: ['battlecry'], tribes: ['mech'], effects: [{ trigger: 'battlecry', target: 'friendly', tribe: 'mech', action: { kind: 'buff', attack: 2, health: 1 } }] },
  { id: 'ab-hook', name: L('Крюк', 'Hook'), description: L('Купили пирата — +2/+1.', 'After you buy a pirate: +2/+1.'), tavernTier: 4, attack: 4, health: 3, keywords: [], tribes: ['pirate'], effects: [{ trigger: 'buy', onTribe: 'pirate', target: 'self', action: { kind: 'buff', attack: 2, health: 1 } }] },
  { id: 'ab-revenant', name: L('Ревенант', 'Revenant'), description: L('Предсмертный хрип: случайная ваша нежить получает +3/+3.', 'Deathrattle: a random friendly undead gets +3/+3.'), tavernTier: 4, attack: 4, health: 4, keywords: ['reborn', 'deathrattle'], tribes: ['undead'], effects: [{ trigger: 'deathrattle', target: 'random', tribe: 'undead', action: { kind: 'buff', attack: 3, health: 3 } }] },
  { id: 'ab-warlord', name: L('Полководец', 'Warlord'), description: L('Другие ваши существа получают +1 к атаке в бою.', 'Your other minions have +1 attack in combat.'), tavernTier: 4, attack: 3, health: 5, keywords: [], tribes: ['neutral'], effects: [{ trigger: 'aura', tribe: 'all', action: { kind: 'aura', attack: 1 } }] },
  { id: 'ab-scavenger', name: L('Стервятник', 'Scavenger'), description: L('Продали существо — случайный ваш зверь получает +2/+2.', 'Whenever you sell a minion: a random friendly beast gets +2/+2.'), tavernTier: 4, attack: 4, health: 3, keywords: [], tribes: ['beast'], effects: [{ trigger: 'sell', target: 'random', tribe: 'beast', action: { kind: 'buff', attack: 2, health: 2 } }] },
  { id: 'ab-cannoneer', name: L('Канонир', 'Cannoneer'), description: L('В начале боя: +3 к атаке.', 'Start of combat: +3 attack.'), tavernTier: 4, attack: 5, health: 3, keywords: [], tribes: ['pirate'], effects: [{ trigger: 'startCombat', target: 'self', action: { kind: 'buff', attack: 3, health: 0 } }] },

  // ── Tier 5 ──
  { id: 'ab-hydra', name: L('Гидра', 'Hydra'), description: L('Предсмертный хрип: призывает два Жетона 1/1.', 'Deathrattle: summon two 1/1 Tokens.'), tavernTier: 5, attack: 2, health: 8, keywords: ['deathrattle'], tribes: ['beast'], deathrattle: { summonId: 'ab-token-1-1', count: 2 } },
  { id: 'ab-assassin', name: L('Убийца', 'Assassin'), tavernTier: 5, attack: 6, health: 3, keywords: ['poisonous'], tribes: ['pirate'] },
  { id: 'ab-ashes', name: L('Пепел', 'Ashes'), tavernTier: 5, attack: 4, health: 2, keywords: ['reborn'], tribes: ['undead'] },
  { id: 'ab-magnetron', name: L('Магнетрон', 'Magnetron'), description: L('Купили механизм — +2/+2.', 'After you buy a mech: +2/+2.'), tavernTier: 5, attack: 5, health: 5, keywords: ['divineShield'], tribes: ['mech'], effects: [{ trigger: 'buy', onTribe: 'mech', target: 'self', action: { kind: 'buff', attack: 2, health: 2 } }] },
  { id: 'ab-admiral', name: L('Адмирал', 'Admiral'), description: L('В конце хода: ваши пираты получают +2/+1.', 'At the end of your turn: your pirates get +2/+1.'), tavernTier: 5, attack: 5, health: 5, keywords: [], tribes: ['pirate'], effects: [{ trigger: 'endTurn', target: 'friendly', tribe: 'pirate', action: { kind: 'buff', attack: 2, health: 1 } }] },
  { id: 'ab-bone-king', name: L('Костяной король', 'Bone King'), description: L('Предсмертный хрип: ваша нежить получает +3/+3.', 'Deathrattle: your undead get +3/+3.'), tavernTier: 5, attack: 5, health: 6, keywords: ['deathrattle'], tribes: ['undead'], effects: [{ trigger: 'deathrattle', target: 'friendly', tribe: 'undead', action: { kind: 'buff', attack: 3, health: 3 } }] },
  { id: 'ab-primal', name: L('Первозверь', 'Primal Beast'), description: L('Боевой клич: ваши звери получают +3/+3.', 'Battlecry: your beasts get +3/+3.'), tavernTier: 5, attack: 6, health: 6, keywords: ['battlecry'], tribes: ['beast'], effects: [{ trigger: 'battlecry', target: 'friendly', tribe: 'beast', action: { kind: 'buff', attack: 3, health: 3 } }] },
  { id: 'ab-golem', name: L('Голем', 'Golem'), tavernTier: 5, attack: 7, health: 7, keywords: ['taunt'], tribes: ['neutral'] },

  // ── Tier 6 ──
  { id: 'ab-colossus', name: L('Колосс', 'Colossus'), tavernTier: 6, attack: 8, health: 8, keywords: [], tribes: ['mech'] },
  { id: 'ab-omen', name: L('Знамение', 'Omen'), tavernTier: 6, attack: 6, health: 7, keywords: ['taunt', 'divineShield'], tribes: ['undead'] },
  { id: 'ab-leviathan', name: L('Левиафан', 'Leviathan'), description: L('Предсмертный хрип: призывает двух Медведей 3/3.', 'Deathrattle: summon two 3/3 Bears.'), tavernTier: 6, attack: 7, health: 9, keywords: ['deathrattle'], tribes: ['beast'], deathrattle: { summonId: 'ab-token-cub', count: 2 } },
  { id: 'ab-dreadnought', name: L('Дредноут', 'Dreadnought'), description: L('Боевой клич: ваши пираты получают +3/+3.', 'Battlecry: your pirates get +3/+3.'), tavernTier: 6, attack: 6, health: 9, keywords: ['taunt', 'battlecry'], tribes: ['pirate'], effects: [{ trigger: 'battlecry', target: 'friendly', tribe: 'pirate', action: { kind: 'buff', attack: 3, health: 3 } }] },
  { id: 'ab-necropolis', name: L('Некрополь', 'Necropolis'), description: L('Предсмертный хрип: призывает трёх Скелетов-слуг 2/1.', 'Deathrattle: summon three 2/1 Bone Servants.'), tavernTier: 6, attack: 5, health: 9, keywords: ['reborn', 'deathrattle'], tribes: ['undead'], deathrattle: { summonId: 'ab-token-skel', count: 3 } },
  { id: 'ab-overclocker', name: L('Разгонщик', 'Overclocker'), description: L('В конце хода: ваши механизмы получают +2/+2.', 'At the end of your turn: your mechs get +2/+2.'), tavernTier: 6, attack: 6, health: 6, keywords: [], tribes: ['mech'], effects: [{ trigger: 'endTurn', target: 'friendly', tribe: 'mech', action: { kind: 'buff', attack: 2, health: 2 } }] },
  { id: 'ab-titan', name: L('Титан', 'Titan'), description: L('Триплет: +4/+4.', 'Whenever you make a triple: +4/+4.'), tavernTier: 6, attack: 9, health: 9, keywords: [], tribes: ['neutral'], effects: [{ trigger: 'triple', target: 'self', action: { kind: 'buff', attack: 4, health: 4 } }] },
];
