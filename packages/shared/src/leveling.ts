export const LEVEL_COUNT = 30;
export const PACK_XP = 25;
export const CASE_XP = 20;
export const CASINO_XP = 15;
export const MATCH_WIN_XP = 40;
export const MATCH_LOSS_XP = 15;
export const MATCH_DRAW_XP = 20;
export const XP_AWARDS = [PACK_XP, CASE_XP, CASINO_XP, MATCH_WIN_XP, MATCH_LOSS_XP, MATCH_DRAW_XP] as const;

export type LevelDef = { ru: string; en: string; xp: number };
export type PlayerLeveling = { levels: LevelDef[] };
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
};

export function validatePlayerLeveling(data: unknown): data is PlayerLeveling {
  if (!data || typeof data !== 'object' || !Array.isArray((data as PlayerLeveling).levels)) return false;
  const levels = (data as PlayerLeveling).levels;
  if (levels.length !== LEVEL_COUNT) return false;
  return levels.every(row =>
    row && typeof row.ru === 'string' && row.ru.trim().length > 0 && row.ru.length <= 40
    && typeof row.en === 'string' && row.en.length <= 40
    && Number.isInteger(row.xp) && row.xp >= 1 && row.xp <= 10000);
}

export function resolveLeveling(data: unknown): PlayerLeveling {
  return validatePlayerLeveling(data) ? data : starterLeveling;
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
