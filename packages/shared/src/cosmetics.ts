import type { AutoBattlerLoc } from './autoBattler';

const L = (ru: string, en: string): AutoBattlerLoc => ({ ru, en });

/** Inline SVG as a CSS image: the premium tables texture their felt with these (procedural, no assets). */
const svg = (markup: string) => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' ${markup}</svg>`)}")`;
const TEXTURE = {
  /** Wood grain: stretched turbulence, faint dark streaks. */
  wood: svg(`width='400' height='400'><filter id='g'><feTurbulence baseFrequency='.012 .35' numOctaves='3' seed='4'/><feColorMatrix values='0 0 0 0 .12  0 0 0 0 .05  0 0 0 0 .02  0 0 0 .34 -.1'/></filter><rect width='400' height='400' filter='url(#g)'/>`),
  /** Occult: a chalk sigil — double ring, pentacle, tick marks. */
  sigil: svg(`width='600' height='600' viewBox='0 0 600 600' fill='none' stroke='#d9b3ff' stroke-opacity='.5' stroke-width='2.5'><circle cx='300' cy='300' r='250'/><circle cx='300' cy='300' r='232'/><circle cx='300' cy='300' r='120'/><path d='M300 68 L436 464 L96 220 L504 220 L164 464 Z'/><g stroke-width='3'>${Array.from({ length: 24 }, (_, i) => { const a = i / 24 * Math.PI * 2; const x1 = 300 + Math.cos(a) * 240, y1 = 300 + Math.sin(a) * 240, x2 = 300 + Math.cos(a) * 250, y2 = 300 + Math.sin(a) * 250; return `<path d='M${x1.toFixed(1)} ${y1.toFixed(1)} L${x2.toFixed(1)} ${y2.toFixed(1)}'/>`; }).join('')}</g>`),
  /** Arcane: tiled hexagon lattice with a lit node in every other cell. */
  hex: svg(`width='56' height='97' viewBox='0 0 56 97' fill='none' stroke='#9bd7ff' stroke-opacity='.32' stroke-width='1.4'><path d='M28 0 L56 16 L56 48 L28 64 L0 48 L0 16 Z M28 64 L56 80 L56 112 M28 64 L0 80 L0 112'/><circle cx='28' cy='32' r='3' fill='#9bd7ff' fill-opacity='.55' stroke='none'/>`),
  /** Industrial: brushed plate with rivets on a grid. */
  plate: svg(`width='96' height='96' viewBox='0 0 96 96'><rect width='96' height='96' fill='none'/><g fill='#000' fill-opacity='.22'><circle cx='10' cy='10' r='3.5'/><circle cx='86' cy='10' r='3.5'/><circle cx='10' cy='86' r='3.5'/><circle cx='86' cy='86' r='3.5'/></g><g fill='#fff' fill-opacity='.08'><circle cx='9' cy='9' r='1.6'/><circle cx='85' cy='9' r='1.6'/><circle cx='9' cy='85' r='1.6'/><circle cx='85' cy='85' r='1.6'/></g><path d='M0 48 H96' stroke='#000' stroke-opacity='.18' stroke-width='2'/><path d='M0 47 H96' stroke='#fff' stroke-opacity='.05'/>`),
  /** Library: lined parchment with a faint marginal rule. */
  parchment: svg(`width='300' height='300'><filter id='p'><feTurbulence baseFrequency='.9' numOctaves='2' seed='9'/><feColorMatrix values='0 0 0 0 .2  0 0 0 0 .12  0 0 0 0 .04  0 0 0 .18 -.04'/></filter><rect width='300' height='300' filter='url(#p)'/><g stroke='#3a2a14' stroke-opacity='.16'>${Array.from({ length: 12 }, (_, i) => `<path d='M0 ${18 + i * 24} H300'/>`).join('')}</g><path d='M40 0 V300' stroke='#8a2a2a' stroke-opacity='.22' stroke-width='1.5'/>`),
  /** Blood pit: dark stone with cracks and dried drips. */
  cracks: svg(`width='240' height='240' viewBox='0 0 240 240' fill='none' stroke='#000' stroke-opacity='.45' stroke-width='1.6'><path d='M10 30 L60 70 L52 120 L110 150 L130 210 M60 70 L120 40 L170 60 L200 120 L190 180 M110 150 L80 200 M170 60 L230 20 M52 120 L0 140'/><g fill='#5a0a0a' fill-opacity='.5' stroke='none'><ellipse cx='150' cy='40' rx='5' ry='9'/><ellipse cx='60' cy='190' rx='4' ry='12'/><ellipse cx='210' cy='150' rx='3.5' ry='8'/></g>`),
  /** Rain window: subtle glass streaks. */
  glass: svg(`width='120' height='300' viewBox='0 0 120 300' fill='none' stroke='#dff4ff' stroke-opacity='.1' stroke-width='1.4'><path d='M14 0 v90 M38 40 v120 M62 0 v60 M86 80 v150 M108 20 v80'/>`),
  /** Garden: scattered leaves. */
  leaves: svg(`width='140' height='140' viewBox='0 0 140 140' fill='#2f6b2e' fill-opacity='.22'><path d='M20 30 q18 -18 30 0 q-18 18 -30 0z M90 20 q16 -12 28 4 q-16 12 -28 -4z M50 100 q14 -20 32 -4 q-14 20 -32 4z M110 110 q12 -16 26 2 q-12 16 -26 -2z'/>`),
  /** Neon: wet asphalt grid. */
  grid: svg(`width='48' height='48' viewBox='0 0 48 48' fill='none'><path d='M0 .5 H48 M.5 0 V48' stroke='#62d8ff' stroke-opacity='.3'/><path d='M0 24.5 H48 M24.5 0 V48' stroke='#ff7de9' stroke-opacity='.16'/>`),
};

/** Table look: CSS custom properties the Battlegrounds screen reads (see battlegrounds.css tokens). */
export type BoardPreset = { id: string; name: AutoBattlerLoc; cost: number; vars: Record<string, string> };
export const BOARD_PRESETS: BoardPreset[] = [
  { id: 'oak', name: L('Дубовый стол', 'Oak table'), cost: 0, vars: {} },
  { id: 'green', name: L('Зелёное сукно', 'Green felt'), cost: 0, vars: { '--ab-felt': '#4f7d4a', '--ab-felt-light': '#79a86f', '--ab-felt-dark': '#2f5030', '--ab-wood': '#5a4030', '--ab-wood-light': '#8b6547', '--ab-wood-dark': '#1f181c' } },
  { id: 'crimson', name: L('Багровый бархат', 'Crimson velvet'), cost: 300, vars: { '--ab-felt': '#8f2f34', '--ab-felt-light': '#c25a5c', '--ab-felt-dark': '#571a1f', '--ab-wood': '#3d2a2c', '--ab-wood-light': '#6b4a4a', '--ab-wood-dark': '#17111a', '--ab-ridge': '#c9a04a' } },
  { id: 'night', name: L('Ночная смена', 'Night shift'), cost: 500, vars: { '--ab-felt': '#2c3a52', '--ab-felt-light': '#4a6080', '--ab-felt-dark': '#1a2334', '--ab-wood': '#2a2430', '--ab-wood-light': '#4a4054', '--ab-wood-dark': '#0f0c14', '--ab-ridge': '#8fa3c9', '--ab-ring': '#1a1620' } },
  { id: 'ice', name: L('Ледяной погреб', 'Ice cellar'), cost: 500, vars: { '--ab-felt': '#7fb0c4', '--ab-felt-light': '#b6dceb', '--ab-felt-dark': '#4f7f95', '--ab-wood': '#5c6e78', '--ab-wood-light': '#8fa4ad', '--ab-wood-dark': '#232c33', '--ab-ridge': '#dfeef5', '--ab-amber': '#e8f6ff' } },
  // Textured tables: the felt carries an SVG pattern (see --ab-felt-texture in battlegrounds.css) and its own ambience.
  { id: 'tavern', name: L('Трактир', 'Tavern'), cost: 700, vars: { '--ab-felt': '#8a5a34', '--ab-felt-light': '#b98352', '--ab-felt-dark': '#4e2f1c', '--ab-wood': '#3b2416', '--ab-wood-light': '#6b4528', '--ab-wood-dark': '#160d08', '--ab-ridge': '#d9a253', '--ab-amber': '#ffd88a', '--ab-felt-texture': TEXTURE.wood, '--ab-felt-texture-size': '400px 400px', '--ab-felt-texture-repeat': 'repeat' } },
  { id: 'occult', name: L('Оккультный круг', 'Occult circle'), cost: 800, vars: { '--ab-felt': '#2b1a3a', '--ab-felt-light': '#4a2f5e', '--ab-felt-dark': '#160c20', '--ab-wood': '#1d1420', '--ab-wood-light': '#3a2a3e', '--ab-wood-dark': '#090509', '--ab-ridge': '#b98cff', '--ab-ring': '#0d0710', '--ab-amber': '#e6c3ff', '--ab-felt-texture': TEXTURE.sigil, '--ab-felt-texture-size': 'min(88%, 620px)', '--ab-felt-texture-repeat': 'no-repeat' } },
  { id: 'arcane', name: L('Чародейская лаборатория', 'Arcane lab'), cost: 800, vars: { '--ab-felt': '#1e2a5a', '--ab-felt-light': '#34468a', '--ab-felt-dark': '#10173a', '--ab-wood': '#1a1d33', '--ab-wood-light': '#2f3560', '--ab-wood-dark': '#07091a', '--ab-ridge': '#9bd7ff', '--ab-ring': '#0a0c22', '--ab-amber': '#dff4ff', '--ab-felt-texture': TEXTURE.hex, '--ab-felt-texture-size': '56px 97px', '--ab-felt-texture-repeat': 'repeat' } },
  { id: 'industrial', name: L('Цех', 'Workshop floor'), cost: 800, vars: { '--ab-felt': '#4a4e52', '--ab-felt-light': '#6d7276', '--ab-felt-dark': '#2a2d30', '--ab-wood': '#2a2c2e', '--ab-wood-light': '#4a4d50', '--ab-wood-dark': '#0f1011', '--ab-ridge': '#c9a04a', '--ab-ring': '#141516', '--ab-amber': '#ffcf6a', '--ab-felt-texture': TEXTURE.plate, '--ab-felt-texture-size': '96px 96px', '--ab-felt-texture-repeat': 'repeat' } },
  { id: 'library', name: L('Библиотека', 'Library'), cost: 600, vars: { '--ab-felt': '#c9b58a', '--ab-felt-light': '#e6d6b0', '--ab-felt-dark': '#8f7a52', '--ab-wood': '#4a2e1a', '--ab-wood-light': '#7a4f2e', '--ab-wood-dark': '#1d110a', '--ab-ridge': '#c9a04a', '--ab-ring': '#2a1a0e', '--ab-amber': '#fff0c8', '--ab-felt-texture': TEXTURE.parchment, '--ab-felt-texture-size': '300px 300px', '--ab-felt-texture-repeat': 'repeat' } },
  { id: 'bloodpit', name: L('Кровавая яма', 'Blood pit'), cost: 700, vars: { '--ab-felt': '#3a1414', '--ab-felt-light': '#5a2020', '--ab-felt-dark': '#1a0808', '--ab-wood': '#2a1a1a', '--ab-wood-light': '#4a2a2a', '--ab-wood-dark': '#0c0505', '--ab-ridge': '#b23a2e', '--ab-ring': '#120606', '--ab-amber': '#ff8a7a', '--ab-felt-texture': TEXTURE.cracks, '--ab-felt-texture-size': '240px 240px', '--ab-felt-texture-repeat': 'repeat' } },
  { id: 'rain', name: L('Дождь за окном', 'Rain on the window'), cost: 800, vars: { '--ab-felt': '#3a4a5a', '--ab-felt-light': '#5a6f84', '--ab-felt-dark': '#1e2a36', '--ab-wood': '#2a2a30', '--ab-wood-light': '#4a4a54', '--ab-wood-dark': '#0f0f14', '--ab-ridge': '#9fb8cc', '--ab-ring': '#141820', '--ab-amber': '#dff4ff', '--ab-felt-texture': TEXTURE.glass, '--ab-felt-texture-size': '120px 300px', '--ab-felt-texture-repeat': 'repeat' } },
  { id: 'garden', name: L('Ночной сад', 'Night garden'), cost: 800, vars: { '--ab-felt': '#2f5a3a', '--ab-felt-light': '#4f8a58', '--ab-felt-dark': '#1a3322', '--ab-wood': '#3a2a1a', '--ab-wood-light': '#6b4a2a', '--ab-wood-dark': '#150e08', '--ab-ridge': '#ffb3d9', '--ab-ring': '#0f1a10', '--ab-amber': '#ffe1ee', '--ab-felt-texture': TEXTURE.leaves, '--ab-felt-texture-size': '140px 140px', '--ab-felt-texture-repeat': 'repeat' } },
  { id: 'neon', name: L('Неоновый переулок', 'Neon alley'), cost: 900, vars: { '--ab-felt': '#14161f', '--ab-felt-light': '#232636', '--ab-felt-dark': '#0a0b10', '--ab-wood': '#1a1421', '--ab-wood-light': '#2c2236', '--ab-wood-dark': '#07050a', '--ab-ridge': '#ff7de9', '--ab-ring': '#08060c', '--ab-amber': '#9ef0ff', '--ab-felt-texture': TEXTURE.grid, '--ab-felt-texture-size': '48px 48px', '--ab-felt-texture-repeat': 'repeat' } },
];

/** Hero frame: a CSS look applied to the portrait (data-skin on .ab-hero-face); bought once, worn by any hero. */
export type HeroSkin = { id: string; name: AutoBattlerLoc; cost: number };
export const HERO_SKINS: HeroSkin[] = [
  { id: 'skin-gold', name: L('Золотая рама', 'Gold frame'), cost: 400 },
  { id: 'skin-ice', name: L('Ледяная рама', 'Frost frame'), cost: 400 },
  { id: 'skin-blood', name: L('Кровавая рама', 'Blood frame'), cost: 400 },
  { id: 'skin-ink', name: L('Чернильный контур', 'Ink outline'), cost: 500 },
  { id: 'skin-comic', name: L('Комикс', 'Comic panel'), cost: 500 },
  { id: 'skin-neon', name: L('Неоновая вывеска', 'Neon sign'), cost: 700 },
  { id: 'skin-arcane', name: L('Чародейская рама', 'Arcane frame'), cost: 900 },
  { id: 'skin-bone', name: L('Костяная рама', 'Bone frame'), cost: 600 },
  { id: 'skin-royal', name: L('Королевский пурпур', 'Royal purple'), cost: 800 },
  { id: 'skin-sketch', name: L('Набросок', 'Sketch'), cost: 350 },
  { id: 'skin-vines', name: L('Живые лозы', 'Living vines'), cost: 600 },
  { id: 'skin-fire', name: L('Пламенная рама', 'Flame frame'), cost: 900 },
  { id: 'skin-electric', name: L('Электрическая рама', 'Electric frame'), cost: 900 },
  { id: 'skin-liquid-gold', name: L('Жидкое золото', 'Liquid gold'), cost: 1000 },
];

/** Hero slam: the effect that lands on the loser's portrait when a hero hits it (data-slam on .ab-slam-fx). */
export type HeroSlam = { id: string; name: AutoBattlerLoc; cost: number };
export const HERO_SLAMS: HeroSlam[] = [
  { id: 'slam-fire', name: L('Огненный удар', 'Fire impact'), cost: 600 },
  { id: 'slam-lightning', name: L('Молния', 'Lightning strike'), cost: 600 },
  { id: 'slam-ice', name: L('Ледяной раскол', 'Ice shatter'), cost: 600 },
  { id: 'slam-ink', name: L('Чернильный взрыв', 'Ink explosion'), cost: 700 },
  { id: 'slam-comic', name: L('Комикс-удар', 'Comic impact'), cost: 700 },
  { id: 'slam-arcane', name: L('Чародейский всплеск', 'Arcane burst'), cost: 800 },
  { id: 'slam-neon', name: L('Неоновая волна', 'Neon shockwave'), cost: 800 },
  { id: 'slam-glitch', name: L('Глитч', 'Glitch strike'), cost: 900 },
  { id: 'slam-comet', name: L('Комета', 'Comet'), cost: 1000 },
  { id: 'slam-shadow', name: L('Теневой удар', 'Shadow strike'), cost: 800 },
  { id: 'slam-petal', name: L('Лепестковый вихрь', 'Petal storm'), cost: 700 },
];

/** Portrait effect: a living aura around the hero portrait for the whole match (data-aura on .ab-hero-face). */
export type PortraitFx = { id: string; name: AutoBattlerLoc; cost: number };
export const PORTRAIT_FX: PortraitFx[] = [
  { id: 'aura-embers', name: L('Тлеющие угли', 'Embers'), cost: 500 },
  { id: 'aura-frost', name: L('Иней', 'Frost'), cost: 500 },
  { id: 'aura-sparks', name: L('Искры', 'Sparks'), cost: 500 },
  { id: 'aura-smoke', name: L('Дым', 'Smoke'), cost: 600 },
  { id: 'aura-halo', name: L('Нимб', 'Halo'), cost: 800 },
  { id: 'aura-fireflies', name: L('Светлячки', 'Fireflies'), cost: 600 },
  { id: 'aura-shadow', name: L('Тень', 'Shadow'), cost: 700 },
];

/** Name effect: a CSS look applied to the player's nickname wherever it is printed (data-name-fx). */
export type NameFx = { id: string; name: AutoBattlerLoc; cost: number };
export const NAME_FX: NameFx[] = [
  { id: 'name-gold', name: L('Золотой блеск', 'Golden shine'), cost: 250 },
  { id: 'name-blood', name: L('Кровавое имя', 'Blood name'), cost: 250 },
  { id: 'name-ice', name: L('Ледяное имя', 'Ice name'), cost: 250 },
  { id: 'name-glow', name: L('Неоновое имя', 'Neon glow'), cost: 400 },
  { id: 'name-fire', name: L('Огненное имя', 'Fire name'), cost: 500 },
  { id: 'name-electric', name: L('Электрическое имя', 'Electric name'), cost: 500 },
  { id: 'name-holo', name: L('Голограмма', 'Hologram'), cost: 600 },
  { id: 'name-glitch', name: L('Глитч-имя', 'Glitch name'), cost: 600 },
  { id: 'name-rainbow', name: L('Радужное имя', 'Rainbow name'), cost: 700 },
  { id: 'name-toxic', name: L('Ядовитое имя', 'Toxic name'), cost: 450 },
  { id: 'name-royal', name: L('Королевское имя', 'Royal name'), cost: 550 },
];

/** Card back: the reverse of a full card and of the oval minion token on the table (data-back on .card-back). */
export type CardBack = { id: string; name: AutoBattlerLoc; cost: number };
export const CARD_BACKS: CardBack[] = [
  { id: 'back-tavern', name: L('Пивная', 'Taproom'), cost: 300 },
  { id: 'back-frost', name: L('Иней', 'Frost'), cost: 400 },
  { id: 'back-occult', name: L('Оккультная', 'Occult'), cost: 500 },
  { id: 'back-fire', name: L('Пламя', 'Flame'), cost: 600 },
  { id: 'back-arcane', name: L('Руны', 'Runes'), cost: 700 },
  { id: 'back-neon', name: L('Неон', 'Neon'), cost: 700 },
  { id: 'back-gold', name: L('Жидкое золото', 'Liquid gold'), cost: 900 },
];

export type CosmeticKind = 'board' | 'heroSkin' | 'heroSlam' | 'portraitFx' | 'nameFx' | 'cardBack';
export type Cosmetic = { id: string; kind: CosmeticKind; cost: number; name: AutoBattlerLoc };
export const COSMETICS: Cosmetic[] = [
  ...BOARD_PRESETS.filter(p => p.cost > 0).map(p => ({ id: `board-${p.id}`, kind: 'board' as const, cost: p.cost, name: p.name })),
  ...HERO_SKINS.map(s => ({ id: s.id, kind: 'heroSkin' as const, cost: s.cost, name: s.name })),
  ...HERO_SLAMS.map(s => ({ id: s.id, kind: 'heroSlam' as const, cost: s.cost, name: s.name })),
  ...PORTRAIT_FX.map(s => ({ id: s.id, kind: 'portraitFx' as const, cost: s.cost, name: s.name })),
  ...NAME_FX.map(s => ({ id: s.id, kind: 'nameFx' as const, cost: s.cost, name: s.name })),
  ...CARD_BACKS.map(s => ({ id: s.id, kind: 'cardBack' as const, cost: s.cost, name: s.name })),
];

export function cosmeticById(id: string): Cosmetic | undefined {
  return COSMETICS.find(c => c.id === id);
}

/** Settings key that holds the equipped item of each kind (board settings store the preset id without the `board-` prefix). */
export const COSMETIC_SETTING: Record<CosmeticKind, 'board' | 'heroSkin' | 'heroSlam' | 'portraitFx' | 'nameFx' | 'cardBack'> = { board: 'board', heroSkin: 'heroSkin', heroSlam: 'heroSlam', portraitFx: 'portraitFx', nameFx: 'nameFx', cardBack: 'cardBack' };

/** Visual tier from price: drives the card's trim in the shop. */
export function cosmeticTier(cost: number): 'common' | 'rare' | 'epic' | 'legendary' {
  return cost >= 900 ? 'legendary' : cost >= 600 ? 'epic' : cost >= 400 ? 'rare' : 'common';
}

/** Duplicate cosmetic from a pack or chest pays half its price back. */
export function cosmeticRefund(cosmetic: Cosmetic): number {
  return Math.round(cosmetic.cost / 2);
}

export function boardPreset(id: string | undefined): BoardPreset {
  return BOARD_PRESETS.find(p => p.id === id) ?? BOARD_PRESETS[0]!;
}

/** A table preset the player may equip: free, or bought. */
export function boardOwned(id: string, unlocks: readonly string[]): boolean {
  const preset = BOARD_PRESETS.find(p => p.id === id);
  return !!preset && (preset.cost === 0 || unlocks.includes(`board-${id}`));
}

/** '' (none) is always allowed; anything else must be a known bought item of that kind. */
function ownedOf(list: readonly { id: string }[], id: string, unlocks: readonly string[]): boolean {
  return id === '' || (list.some(s => s.id === id) && unlocks.includes(id));
}
export function heroSkinOwned(id: string, unlocks: readonly string[]): boolean { return ownedOf(HERO_SKINS, id, unlocks); }
export function heroSlamOwned(id: string, unlocks: readonly string[]): boolean { return ownedOf(HERO_SLAMS, id, unlocks); }
export function portraitFxOwned(id: string, unlocks: readonly string[]): boolean { return ownedOf(PORTRAIT_FX, id, unlocks); }
export function cardBackOwned(id: string, unlocks: readonly string[]): boolean { return ownedOf(CARD_BACKS, id, unlocks); }
export function nameFxOwned(id: string, unlocks: readonly string[]): boolean { return ownedOf(NAME_FX, id, unlocks); }
