export const LEVEL_COUNT = 100;
export const PACK_XP = 25;
export const CASE_XP = 20;
export const CASINO_XP = 15;
export const MATCH_WIN_XP = 40;
export const MATCH_LOSS_XP = 15;
export const MATCH_DRAW_XP = 20;
export const XP_AWARDS = [PACK_XP, CASE_XP, CASINO_XP, MATCH_WIN_XP, MATCH_LOSS_XP, MATCH_DRAW_XP] as const;
export const DEFAULT_BATTLEGROUNDS_ELO = 32;
export const BATTLEGROUNDS_ELO_MAX = 200;

export type LevelDef = { ru: string; en: string; xp: number };
export type PlayerLeveling = { levels: LevelDef[]; battlegroundsElo?: number };
export type LevelProgress = {
  level: number;
  name: LevelDef;
  current: number;
  need: number;
  left: number;
  maxed: boolean;
};

const NAMES: Array<[string, string]> = [
  ['Новичок', 'Rookie'],
  ['Дворовый', 'Yard kid'],
  ['Картонщик', 'Cardboarder'],
  ['Лавочник', 'Shop regular'],
  ['Завсегдатай', 'Regular'],
  ['Сборщик', 'Collector'],
  ['Раздатчик', 'Dealer'],
  ['Шулер', 'Hustler'],
  ['Костяной', 'Bonehand'],
  ['Старшина', 'Foreman'],
  ['Браконьер', 'Poacher'],
  ['Капитан', 'Captain'],
  ['Чернильный', 'Inkhand'],
  ['Барон колоды', 'Deck baron'],
  ['Хозяин стола', 'Table host'],
  ['Мастер блефа', 'Bluff master'],
  ['Архивариус', 'Archivist'],
  ['Король пачки', 'Pack king'],
  ['Тень таверны', 'Tavern shade'],
  ['Легенда двора', 'Yard legend'],
  ['Магистр', 'Magister'],
  ['Верховный', 'High hand'],
  ['Несокрушимый', 'Unbreakable'],
  ['Властелин', 'Overlord'],
  ['Оракул', 'Oracle'],
  ['Патриарх', 'Patriarch'],
  ['Миф', 'Myth'],
  ['Эпоха', 'Epoch'],
  ['Бессмертный', 'Undying'],
  ['Карточный бог', 'Card god'],
  ['Хранитель колоды', 'Deck keeper'],
  ['Страж стола', 'Table guard'],
  ['Ночной игрок', 'Night player'],
  ['Карточный волк', 'Card wolf'],
  ['Смотритель', 'Warden'],
  ['Туз двора', 'Yard ace'],
  ['Серый блеф', 'Grey bluff'],
  ['Костяной круг', 'Bone circle'],
  ['Чернильный след', 'Ink trail'],
  ['Хозяин пачки', 'Pack host'],
  ['Тайный раздатчик', 'Secret dealer'],
  ['Дворовый хан', 'Yard khan'],
  ['Мастер сдачи', 'Deal master'],
  ['Тень колоды', 'Deck shade'],
  ['Железный игрок', 'Iron player'],
  ['Карточный рыцарь', 'Card knight'],
  ['Старший шулер', 'Senior hustler'],
  ['Хранитель блефа', 'Bluff keeper'],
  ['Владыка стола', 'Table lord'],
  ['Ночной барон', 'Night baron'],
  ['Чернильный король', 'Ink king'],
  ['Легенда пачки', 'Pack legend'],
  ['Гроза таверны', 'Tavern storm'],
  ['Мастер колоды', 'Deck master'],
  ['Верховный раздатчик', 'High dealer'],
  ['Страж блефа', 'Bluff guard'],
  ['Карточный герцог', 'Card duke'],
  ['Тёмный туз', 'Dark ace'],
  ['Хозяин блефа', 'Bluff host'],
  ['Дворовый миф', 'Yard myth'],
  ['Печать колоды', 'Deck seal'],
  ['Вечный игрок', 'Eternal player'],
  ['Карточный жнец', 'Card reaper'],
  ['Тень эпохи', 'Epoch shade'],
  ['Магистр стола', 'Table magister'],
  ['Оракул пачки', 'Pack oracle'],
  ['Владыка блефа', 'Bluff overlord'],
  ['Ночной миф', 'Night myth'],
  ['Хранитель эпохи', 'Epoch keeper'],
  ['Карточный титан', 'Card titan'],
  ['Железный туз', 'Iron ace'],
  ['Серый король', 'Grey king'],
  ['Страж пачки', 'Pack guard'],
  ['Чернильный миф', 'Ink myth'],
  ['Барон блефа', 'Bluff baron'],
  ['Легенда стола', 'Table legend'],
  ['Верховный туз', 'High ace'],
  ['Тень бога', 'God shade'],
  ['Мастер эпохи', 'Epoch master'],
  ['Хозяин мифа', 'Myth host'],
  ['Карточный император', 'Card emperor'],
  ['Дворовый бог', 'Yard god'],
  ['Печать блефа', 'Bluff seal'],
  ['Вечный туз', 'Eternal ace'],
  ['Гроза колоды', 'Deck storm'],
  ['Ночной оракул', 'Night oracle'],
  ['Владыка пачки', 'Pack overlord'],
  ['Страж эпохи', 'Epoch guard'],
  ['Чернильный титан', 'Ink titan'],
  ['Магистр блефа', 'Bluff magister'],
  ['Легенда мифа', 'Myth legend'],
  ['Карточный абсолют', 'Card absolute'],
  ['Железный бог', 'Iron god'],
  ['Тёмный оракул', 'Dark oracle'],
  ['Хранитель бога', 'God keeper'],
  ['Верховный миф', 'High myth'],
  ['Печать эпохи', 'Epoch seal'],
  ['Вечный король', 'Eternal king'],
  ['Тень абсолюта', 'Absolute shade'],
  ['Карточный предел', 'Card apex'],
];

export const starterLeveling: PlayerLeveling = {
  levels: NAMES.map(([ru, en], i) => ({ ru, en, xp: 40 + i * 20 })),
  battlegroundsElo: DEFAULT_BATTLEGROUNDS_ELO,
};

function levelRowOk(row: unknown): row is LevelDef {
  return !!row && typeof (row as LevelDef).ru === 'string' && (row as LevelDef).ru.trim().length > 0 && (row as LevelDef).ru.length <= 40
    && typeof (row as LevelDef).en === 'string' && (row as LevelDef).en.length <= 40
    && Number.isInteger((row as LevelDef).xp) && (row as LevelDef).xp >= 1 && (row as LevelDef).xp <= 10000;
}

export function validatePlayerLeveling(data: unknown): data is PlayerLeveling {
  if (!data || typeof data !== 'object' || !Array.isArray((data as PlayerLeveling).levels)) return false;
  const table = data as PlayerLeveling;
  if (table.levels.length !== LEVEL_COUNT) return false;
  if (table.battlegroundsElo !== undefined
    && (!Number.isInteger(table.battlegroundsElo) || table.battlegroundsElo < 0 || table.battlegroundsElo > BATTLEGROUNDS_ELO_MAX)) return false;
  return table.levels.every(levelRowOk);
}

/** Accept shorter saved tables (e.g. old 30) and pad to LEVEL_COUNT from starter. */
export function coercePlayerLeveling(data: unknown): PlayerLeveling | undefined {
  if (validatePlayerLeveling(data)) return data;
  if (!data || typeof data !== 'object' || !Array.isArray((data as PlayerLeveling).levels)) return;
  const table = data as PlayerLeveling;
  if (table.levels.length < 1 || table.levels.length > LEVEL_COUNT || !table.levels.every(levelRowOk)) return;
  if (table.battlegroundsElo !== undefined
    && (!Number.isInteger(table.battlegroundsElo) || table.battlegroundsElo < 0 || table.battlegroundsElo > BATTLEGROUNDS_ELO_MAX)) return;
  return {
    levels: [...table.levels, ...starterLeveling.levels.slice(table.levels.length)],
    battlegroundsElo: resolveBattlegroundsElo(table),
  };
}

export function resolveBattlegroundsElo(table?: PlayerLeveling): number {
  const n = table?.battlegroundsElo;
  return Number.isInteger(n) && n! >= 0 && n! <= BATTLEGROUNDS_ELO_MAX ? n! : DEFAULT_BATTLEGROUNDS_ELO;
}

export function battlegroundsEloDelta(place: number, count: number, amount = DEFAULT_BATTLEGROUNDS_ELO): number {
  if (count < 2 || place < 1 || place > count) return 0;
  return Math.round(amount * (2 * (count - place) / (count - 1) - 1));
}

export function battlegroundsXp(place: number, count: number): number {
  if (place === 1) return MATCH_WIN_XP;
  if (place <= Math.ceil(count / 2)) return MATCH_DRAW_XP;
  return MATCH_LOSS_XP;
}

export function resolveLeveling(data: unknown): PlayerLeveling {
  const table = coercePlayerLeveling(data) ?? starterLeveling;
  return { ...table, battlegroundsElo: resolveBattlegroundsElo(table) };
}

export function levelFromXp(xp: number, table: PlayerLeveling = starterLeveling): LevelProgress {
  const total = Math.max(0, Math.floor(Number.isFinite(xp) ? xp : 0));
  const levels = resolveLeveling(table).levels;
  let rest = total;
  for (let i = 0; i < levels.length; i++) {
    const need = levels[i]!.xp;
    if (rest < need) return { level: i + 1, name: levels[i]!, current: rest, need, left: need - rest, maxed: false };
    rest -= need;
  }
  const last = levels[levels.length - 1]!;
  return { level: LEVEL_COUNT, name: last, current: last.xp, need: last.xp, left: 0, maxed: true };
}
