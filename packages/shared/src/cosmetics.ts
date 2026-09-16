import type { AutoBattlerLoc } from './autoBattler';

const L = (ru: string, en: string): AutoBattlerLoc => ({ ru, en });

/** Table look: CSS custom properties the Battlegrounds screen reads (see battlegrounds.css tokens). */
export type BoardPreset = { id: string; name: AutoBattlerLoc; cost: number; vars: Record<string, string> };
export const BOARD_PRESETS: BoardPreset[] = [
  { id: 'oak', name: L('Дубовый стол', 'Oak table'), cost: 0, vars: {} },
  { id: 'green', name: L('Зелёное сукно', 'Green felt'), cost: 0, vars: { '--ab-felt': '#4f7d4a', '--ab-felt-light': '#79a86f', '--ab-felt-dark': '#2f5030', '--ab-wood': '#5a4030', '--ab-wood-light': '#8b6547', '--ab-wood-dark': '#1f181c' } },
  { id: 'crimson', name: L('Багровый бархат', 'Crimson velvet'), cost: 300, vars: { '--ab-felt': '#8f2f34', '--ab-felt-light': '#c25a5c', '--ab-felt-dark': '#571a1f', '--ab-wood': '#3d2a2c', '--ab-wood-light': '#6b4a4a', '--ab-wood-dark': '#17111a', '--ab-ridge': '#c9a04a' } },
  { id: 'night', name: L('Ночная смена', 'Night shift'), cost: 500, vars: { '--ab-felt': '#2c3a52', '--ab-felt-light': '#4a6080', '--ab-felt-dark': '#1a2334', '--ab-wood': '#2a2430', '--ab-wood-light': '#4a4054', '--ab-wood-dark': '#0f0c14', '--ab-ridge': '#8fa3c9', '--ab-ring': '#1a1620' } },
  { id: 'ice', name: L('Ледяной погреб', 'Ice cellar'), cost: 500, vars: { '--ab-felt': '#7fb0c4', '--ab-felt-light': '#b6dceb', '--ab-felt-dark': '#4f7f95', '--ab-wood': '#5c6e78', '--ab-wood-light': '#8fa4ad', '--ab-wood-dark': '#232c33', '--ab-ridge': '#dfeef5', '--ab-amber': '#e8f6ff' } },
];

/** Hero frame: a CSS look applied to the portrait (data-skin on .ab-hero-face); bought once, worn by any hero. */
export type HeroSkin = { id: string; name: AutoBattlerLoc; cost: number };
export const HERO_SKINS: HeroSkin[] = [
  { id: 'skin-gold', name: L('Золотая рама', 'Gold frame'), cost: 400 },
  { id: 'skin-ice', name: L('Ледяная рама', 'Frost frame'), cost: 400 },
  { id: 'skin-blood', name: L('Кровавая рама', 'Blood frame'), cost: 400 },
  { id: 'skin-neon', name: L('Неоновая вывеска', 'Neon sign'), cost: 700 },
];

/** Heroes that must be bought before they can show up in a player's hero offer. */
export const PREMIUM_HEROES: { heroId: string; cost: number }[] = [
  { heroId: 'ab-hero-tycoon', cost: 500 },
  { heroId: 'ab-hero-collector', cost: 500 },
  { heroId: 'ab-hero-alchemist', cost: 500 },
  { heroId: 'ab-hero-necromancer', cost: 500 },
];

export type Cosmetic = { id: string; kind: 'board' | 'heroSkin' | 'hero'; cost: number; name?: AutoBattlerLoc; heroId?: string };
export const COSMETICS: Cosmetic[] = [
  ...BOARD_PRESETS.filter(p => p.cost > 0).map(p => ({ id: `board-${p.id}`, kind: 'board' as const, cost: p.cost, name: p.name })),
  ...HERO_SKINS.map(s => ({ id: s.id, kind: 'heroSkin' as const, cost: s.cost, name: s.name })),
  ...PREMIUM_HEROES.map(h => ({ id: `hero-${h.heroId}`, kind: 'hero' as const, cost: h.cost, heroId: h.heroId })),
];

export function cosmeticById(id: string): Cosmetic | undefined {
  return COSMETICS.find(c => c.id === id);
}

export function boardPreset(id: string | undefined): BoardPreset {
  return BOARD_PRESETS.find(p => p.id === id) ?? BOARD_PRESETS[0]!;
}

/** A table preset the player may equip: free, or bought. */
export function boardOwned(id: string, unlocks: readonly string[]): boolean {
  const preset = BOARD_PRESETS.find(p => p.id === id);
  return !!preset && (preset.cost === 0 || unlocks.includes(`board-${id}`));
}

export function heroSkinOwned(id: string, unlocks: readonly string[]): boolean {
  return id === '' || (HERO_SKINS.some(s => s.id === id) && unlocks.includes(id));
}

/** Heroes this player can be offered: every free hero plus the premium ones they bought. */
export function heroAllowed(heroId: string, unlocks: readonly string[]): boolean {
  const premium = PREMIUM_HEROES.find(h => h.heroId === heroId);
  return !premium || unlocks.includes(`hero-${heroId}`);
}
