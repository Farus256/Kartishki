export const LEVEL_COUNT = 30;
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
];

export const starterLeveling: PlayerLeveling = {
  levels: NAMES.map(([ru, en], i) => ({ ru, en, xp: 40 + i * 20 })),
  battlegroundsElo: DEFAULT_BATTLEGROUNDS_ELO,
};

export function validatePlayerLeveling(data: unknown): data is PlayerLeveling {
  if (!data || typeof data !== 'object' || !Array.isArray((data as PlayerLeveling).levels)) return false;
  const table = data as PlayerLeveling;
  if (table.levels.length !== LEVEL_COUNT) return false;
  if (table.battlegroundsElo !== undefined
    && (!Number.isInteger(table.battlegroundsElo) || table.battlegroundsElo < 0 || table.battlegroundsElo > BATTLEGROUNDS_ELO_MAX)) return false;
  return table.levels.every(row =>
    row && typeof row.ru === 'string' && row.ru.trim().length > 0 && row.ru.length <= 40
    && typeof row.en === 'string' && row.en.length <= 40
    && Number.isInteger(row.xp) && row.xp >= 1 && row.xp <= 10000);
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
  const table = validatePlayerLeveling(data) ? data : starterLeveling;
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
