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
  ['Объебыш', 'Fuckup'],
  ['Тухлятыш', 'Rotling'],
  ['Папизи', 'Papizi'],
  ['Хлебушек', 'Bread loaf'],
  ['Ссыкло', 'Piss-pants'],
  ['Дрищ', 'Twig'],
  ['Чмоня', 'Chmonya'],
  ['Залупыш', 'Dickhead jr.'],
  ['Пердун', 'Farter'],
  ['Хуеплёт', 'Cock-weaver'],
  ['Долбоёб', 'Dumbfuck'],
  ['Ебанько', 'Ebanko'],
  ['Говноед', 'Shit-eater'],
  ['Пиздюк', 'Pizdyuk'],
  ['Мудозвон', 'Ball-ringer'],
  ['Уебан', 'Ueban'],
  ['Дристун', 'Squirter'],
  ['Плесень', 'Mold'],
  ['Обмудок', 'Obmudok'],
  ['Сракотан', 'Ass-boy'],
  ['Гнида', 'Nit'],
  ['Чепушила', 'Chepushila'],
  ['Пидорас', 'Pidoras'],
  ['Ссаный', 'Pissed-on'],
  ['Бомжара', 'Hobo'],
  ['Жирдяй', 'Lardass'],
  ['Обсос', 'Obsos'],
  ['Хуесос', 'Cocksucker'],
  ['Терпила', 'Doormat'],
  ['Долбослав', 'Dolboslav'],
  ['Говнюк', 'Shithead'],
  ['Дегенерат', 'Degenerate'],
  ['Мразота', 'Scum'],
  ['Ебаклак', 'Ebaklak'],
  ['Пиздабол', 'Bullshitter'],
  ['Скуф', 'Skuf'],
  ['Альтушка', 'Altushka'],
  ['Анимешник', 'Weeb'],
  ['Битард', 'Bitard'],
  ['Двачер', 'Dvacher'],
  ['Куколд', 'Cuckold'],
  ['Инцел', 'Incel'],
  ['Задрот', 'Nerd'],
  ['Хикка', 'Hikki'],
  ['Омежка', 'Omega'],
  ['Сычёв', 'Sychev'],
  ['Тряпка', 'Rag'],
  ['Соевый', 'Soyboy'],
  ['Нытик', 'Whiner'],
  ['Ждун', 'Zhdun'],
  ['Пиздострадалец', 'Pussy-sufferer'],
  ['Хуйло', 'Huylo'],
  ['Ебанат', 'Ebanat'],
  ['Мудила', 'Mudila'],
  ['Гандон', 'Gandon'],
  ['Уёбище', 'Abomination'],
  ['Дерьмодемон', 'Shit-demon'],
  ['Залупа', 'Zalupa'],
  ['Пиздец', 'Pizdets'],
  ['Ебало', 'Ebalo'],
  ['Говнарь', 'Govnar'],
  ['Быдло', 'Bydlo'],
  ['Гопник', 'Gopnik'],
  ['Нарик', 'Junkie'],
  ['Алкаш', 'Drunkard'],
  ['Синяк', 'Bruise'],
  ['Ханыга', 'Wino'],
  ['Торчок', 'Tweaker'],
  ['Бухарик', 'Boozer'],
  ['Забулдыга', 'Deadbeat'],
  ['Хуета', 'Hueta'],
  ['Ебанина', 'Ebanina'],
  ['Пиздобратия', 'Cunt-brotherhood'],
  ['Хуйня', 'Huynya'],
  ['Ебучка', 'Ebuchka'],
  ['Пердильник', 'Fart-box'],
  ['Жопошник', 'Ass-man'],
  ['Сралик', 'Shitter'],
  ['Дристопад', 'Squirtfall'],
  ['Обосранец', 'Shat-himself'],
  ['Хуйлан', 'Huylan'],
  ['Мудень', 'Muden'],
  ['Долбень', 'Dolben'],
  ['Еблан', 'Eblan'],
  ['Пиздюлина', 'Pizdyulina'],
  ['Говнище', 'Shit-mountain'],
  ['Мразь', 'Vermin'],
  ['Тварь', 'Creature'],
  ['Падла', 'Padla'],
  ['Сволочь', 'Bastard'],
  ['Ублюдок', 'Bastard-son'],
  ['Выродок', 'Freak'],
  ['Отброс', 'Reject'],
  ['Ничтожество', 'Nobody'],
  ['Пустышка', 'Blank'],
  ['Хуй с горы', 'Dick off the hill'],
  ['Царь говна', 'Shit czar'],
  ['Император жопы', 'Ass emperor'],
  ['Бог пиздеца', 'God of pizdets'],
  ['Абсолютный объебыш', 'Absolute fuckup'],
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

/** 1st earns a win, last a loss, the places between slide from 35 down to 18. */
export function battlegroundsXp(place: number, count: number): number {
  if (place === 1) return MATCH_WIN_XP;
  if (place >= count) return MATCH_LOSS_XP;
  const t = (place - 1) / Math.max(1, count - 1);
  return Math.round(35 - 17 * t);
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
