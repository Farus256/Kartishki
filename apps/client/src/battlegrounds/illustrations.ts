/**
 * Original cut-paper characters, one per card id. Shared SVG source for DOM portraits and Pixi textures.
 *
 * Every portrait is assembled from a family (human, pirate, beast, mech, undead, dragon) and a seeded pick of
 * head shape, eyes, mouth, headgear, facial hair, collar, prop, pose and backdrop, so two cards of the same
 * family never share a face. The id's words steer the obvious things (a "king" wears a crown, a "scribe" has
 * glasses, a "frog" is a frog); the seed decides the rest. Style stays the same throughout: flat paper fills,
 * a 5px ink line, one hatch overlay.
 */
const cache = new Map<string, string>();

/** Deterministic PRNG per id (mulberry32) so a portrait is the same in every hand, on every table, on every reload. */
function rng(seedText: string) {
  let a = 0x9e3779b9;
  for (const ch of seedText) a = Math.imul(a ^ ch.charCodeAt(0), 0x85ebca6b) >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
type R = () => number;
const pick = <T,>(r: R, list: readonly T[]) => list[Math.floor(r() * list.length)]!;
const chance = (r: R, p: number) => r() < p;
const range = (r: R, a: number, b: number) => a + r() * (b - a);

type Family = 'human' | 'pirate' | 'beast' | 'mech' | 'undead' | 'dragon' | 'demon';
function familyOf(id: string, tribes: readonly string[] = []): Family {
  const has = (t: string) => tribes.includes(t);
  // Demon-dragons (the Devourer) draw as demons: the tribe list is checked before the id words.
  if (has('demon') || /imp|fiend|gobbler|demon|soul-warden|blood-|feeder|ravenous|devourer|fel-|glutton|pain-priest|gourmand|gargoyle/.test(id)) return 'demon';
  if (has('dragon') || /drake|dragon|whelp|drakonid|razorgore|tarecgosa|aspect|glyph-guardian|bronze-warden/.test(id)) return 'dragon';
  if (has('undead') || /ghoul|skel|lich|banshee|revenant|bone|grave|crypt|wraith|shade|necro|ashes|omen|corpse|priestess|reaper|butcher|harvester/.test(id)) return 'undead';
  if (has('mech') || /ward|aegis|knight|colossus|bulwark|bot|mech|module|gear|shield|tin-|cobalt|omega|deflector|rover|junk|annoyer|magnetron|forge|welder|tinkerer|overclock|golem|titan|mite|carousel/.test(id)) return 'mech';
  if (has('beast') || /viper|alpha|fang|hydra|howler|breeder|hyena|hound|bear|rat|frog|raptor|boar|spider|egg|kennel|goldrinn|hunter|brood|magpie|poison|cub|nest|primal|scavenger|den-mother|bilge|parrot|leviathan|many-heads|zoo/.test(id)) return 'beast';
  if (has('pirate') || /pirate|deckhand|swab|broker|pickpocket|dervish|smuggler|drummer|trader|hook|cannoneer|assassin|admiral|dreadnought|sailor|sellsword|cabin|freebooter|mate|southsea|looter|coin|ripsnarl|bosun|hoggarr|corsair|eliza|lookout/.test(id)) return 'pirate';
  return 'human';
}

// Paper palette: backdrops, skins, furs, metals — every family draws from its own row so a robot is never fur-coloured.
const BACKDROPS = ['#dcd6c5', '#d9cbb0', '#cfd3c4', '#d8c9c2', '#c9cfd6', '#d6d0bd', '#e0d3b8'];
const SKINS = ['#e9c39a', '#d9a67a', '#c98c5e', '#b57a52', '#8a5a3c', '#f0d2b0', '#a8b08a'];
const FURS = ['#9a9b79', '#bd9567', '#899c92', '#b98568', '#9c9290', '#6f6a5a', '#c7b08a', '#d9d2c0'];
const METALS = ['#a9b0b5', '#b6a98d', '#8d9aa3', '#c2b280', '#7d8a8f', '#b78f6a', '#9aa39a'];
const BONES = ['#e7e2d3', '#d8d0bc', '#cfc5ab', '#f0ece0'];
const SCALES = ['#7f9c6b', '#b85c4a', '#5f7f9c', '#c99a4a', '#8a6fa0', '#4f7f6e', '#c9705a'];
const CLOTH = ['#d92525', '#3f473b', '#2f4a6b', '#6b3f3f', '#c9a04a', '#4a4a4a', '#7a5a8a', '#2e8b57'];
const INK = '#1a1a1a', PAPER = '#efece4';

/* ---------------------------------------------------------------------------------------------------------
   Parts. Every part is SVG markup in a 256×256 box, drawn around a head centred at (128,118). The stroke group
   supplies the ink line; parts only set fills. `r` is the card's own generator.
   --------------------------------------------------------------------------------------------------------- */
function eyesHuman(r: R, hints: Hints) {
  if (hints.patch) return `<circle cx="104" cy="112" r="6" fill="${INK}"/><path d="M142 100 L166 100 L166 122 L142 122 Z" fill="${INK}"/><path d="M96 84 L170 96"/>`;
  if (hints.glasses) return pick(r, [
    `<circle cx="104" cy="112" r="15" fill="${PAPER}"/><circle cx="152" cy="112" r="15" fill="${PAPER}"/><path d="M119 112 L137 112 M89 110 L74 104 M167 110 L182 104"/><circle cx="106" cy="113" r="4" fill="${INK}"/><circle cx="154" cy="113" r="4" fill="${INK}"/>`,
    `<path d="M88 100 L120 100 L120 124 L88 124 Z M136 100 L168 100 L168 124 L136 124 Z" fill="${PAPER}"/><path d="M120 110 L136 110 M88 106 L74 102 M168 106 L182 102"/><circle cx="104" cy="113" r="4" fill="${INK}"/><circle cx="152" cy="113" r="4" fill="${INK}"/>`,
  ]);
  return pick(r, [
    `<circle cx="104" cy="112" r="6" fill="${INK}"/><circle cx="152" cy="112" r="6" fill="${INK}"/>`,
    `<circle cx="104" cy="112" r="11" fill="${PAPER}"/><circle cx="152" cy="112" r="11" fill="${PAPER}"/><circle cx="106" cy="113" r="5" fill="${INK}"/><circle cx="154" cy="113" r="5" fill="${INK}"/>`,
    `<path d="M92 112 L116 110 M140 110 L164 112"/>`,
    `<path d="M92 108 L116 114 M140 114 L164 108"/><circle cx="104" cy="118" r="4" fill="${INK}"/><circle cx="152" cy="118" r="4" fill="${INK}"/>`,
    `<circle cx="104" cy="112" r="6" fill="${INK}"/><circle cx="152" cy="112" r="6" fill="${INK}"/><path d="M92 96 L116 102 M140 102 L164 96"/>`,
    `<circle cx="104" cy="112" r="6" fill="${INK}"/><circle cx="152" cy="112" r="6" fill="${INK}"/><path d="M90 100 L118 96 M138 96 L166 100"/>`,
    `<path d="M96 112 Q104 104 112 112 M144 112 Q152 104 160 112"/>`,
  ]);
}
function mouthHuman(r: R, hints: Hints) {
  if (hints.beard) return '';
  return pick(r, [
    `<path d="M108 150 Q128 166 148 150"/>`,
    `<path d="M108 156 Q128 144 148 156"/>`,
    `<path d="M104 148 L152 148 L146 162 L110 162 Z" fill="${PAPER}"/><path d="M118 148 L118 162 M132 148 L132 162"/>`,
    `<ellipse cx="128" cy="154" rx="12" ry="9" fill="${INK}"/>`,
    `<path d="M110 152 L146 152"/>`,
    `<path d="M112 150 Q128 158 144 150 M150 150 L182 142" /><circle cx="184" cy="141" r="5" fill="${INK}"/>`,
    `<path d="M108 150 Q120 162 132 150 Q140 146 148 152"/>`,
  ]);
}
function hairHuman(r: R, hints: Hints, cloth: string) {
  if (hints.crown) return `<path d="M82 74 L86 40 L104 58 L128 30 L152 58 L170 40 L174 74 Z" fill="#e0a32a"/><circle cx="128" cy="44" r="5" fill="${INK}"/>`;
  if (hints.hood) return `<path d="M70 150 Q60 40 128 34 Q196 40 186 150 L166 150 Q160 76 128 70 Q96 76 90 150 Z" fill="${cloth}"/>`;
  return pick(r, [
    '',
    `<path d="M78 92 Q78 46 128 44 Q178 46 178 92 L170 92 Q160 66 128 64 Q96 66 86 92 Z" fill="${INK}"/>`,
    `<path d="M118 70 L114 26 L128 44 L142 26 L138 70 Z" fill="${INK}"/><path d="M84 88 Q90 70 118 70 L138 70 Q166 70 172 88 Z" fill="${INK}"/>`,
    `<path d="M78 96 Q70 40 128 40 Q186 40 178 96 L178 170 L164 170 L166 100 Q140 80 90 100 L92 170 L78 170 Z" fill="${INK}"/>`,
    `<path d="M78 84 L178 84 L178 70 Q178 44 128 40 Q78 44 78 70 Z" fill="${cloth}"/><path d="M70 84 L190 84 L190 96 L70 96 Z" fill="${cloth}"/>`,
    `<path d="M80 90 Q84 46 128 46 Q172 46 176 90 Z" fill="${cloth}"/><path d="M76 86 L180 86 L180 98 L76 98 Z" fill="${cloth}"/><path d="M92 62 L164 62" stroke-width="3" opacity=".4"/>`,
    `<path d="M96 76 L96 40 L160 40 L160 76 Z" fill="${INK}"/><path d="M72 76 L184 76 L184 88 L72 88 Z" fill="${INK}"/>`,
    `<path d="M76 92 Q76 50 128 46 Q180 50 180 92 Q160 72 128 74 Q96 72 76 92 Z" fill="${cloth}"/><path d="M180 92 L196 120" stroke-width="3"/>`,
    `<path d="M76 100 L84 56 Q128 26 172 56 L180 100 Q160 60 128 62 Q96 60 76 100 Z" fill="#c9a04a"/>`,
    `<path d="M74 98 Q80 40 128 42 Q176 40 182 98 Z" fill="${INK}"/><path d="M70 108 Q70 96 84 96 L172 96 Q186 96 186 108 Z" fill="${INK}"/>`,
  ]);
}
function beardHuman(r: R, hints: Hints) {
  if (hints.beard || chance(r, .3)) return pick(r, [
    `<path d="M88 130 Q90 196 128 202 Q166 196 168 130 Q150 150 128 148 Q106 150 88 130 Z" fill="${INK}"/><path d="M112 156 Q128 166 144 156" stroke="${PAPER}"/>`,
    `<path d="M104 140 Q128 154 152 140 L150 150 Q128 158 106 150 Z" fill="${INK}"/><path d="M108 156 Q128 168 148 156"/>`,
    `<path d="M92 132 Q96 180 128 184 Q160 180 164 132 L150 140 Q128 150 106 140 Z" fill="#c9c2b3"/><path d="M112 156 Q128 164 144 156"/>`,
    `<path d="M100 142 L156 142 L152 176 L104 176 Z" fill="${INK}"/><path d="M96 138 Q128 150 160 138"/>`,
  ]);
  return '';
}
function collar(r: R, cloth: string, family: Family) {
  const extra = family === 'pirate' ? [`<path d="M60 236 L196 236 L184 200 L72 200 Z" fill="${cloth}"/><path d="M76 210 L182 210 M78 222 L180 222" stroke="${PAPER}" stroke-width="4"/>`] : [];
  return pick(r, [
    `<path d="M92 197 L61 230 207 237 165 192 129 211 Z" fill="${PAPER}"/><path d="M116 209 L137 210 143 249 106 246 Z" fill="${cloth}"/>`,
    `<path d="M66 240 L82 196 L128 214 L174 196 L190 240 Z" fill="${cloth}"/><path d="M82 196 L128 230 L174 196"/>`,
    `<path d="M60 238 L74 200 L182 200 L196 238 Z" fill="${cloth}"/><path d="M96 200 L92 238 M160 200 L164 238"/><circle cx="128" cy="220" r="5" fill="${PAPER}"/>`,
    `<path d="M62 240 L78 198 L178 198 L194 240 Z" fill="#8d9aa3"/><path d="M78 198 L128 224 L178 198 M112 214 L144 214" /><circle cx="90" cy="222" r="3" fill="${INK}"/><circle cx="166" cy="222" r="3" fill="${INK}"/>`,
    `<path d="M64 240 Q64 196 128 196 Q192 196 192 240 Z" fill="${cloth}"/><path d="M100 196 L128 220 L156 196" fill="${PAPER}"/>`,
    ...extra,
  ]);
}
/** Hand-held things at the bottom right: the character is doing something, not just posing. */
function prop(r: R, family: Family, hints: Hints) {
  if (hints.prop === 'none') return '';
  const set: Record<Family, string[]> = {
    human: ['mug', 'book', 'coin', 'cards', 'bottle'],
    pirate: ['dagger', 'mug', 'coin', 'hook', 'bottle'],
    beast: ['bone', 'fish', 'none', 'none'],
    mech: ['wrench', 'gear', 'none', 'bolt'],
    undead: ['candle', 'bone', 'none', 'scythe'],
    dragon: ['coin', 'none', 'none', 'egg'],
    demon: ['candle', 'none', 'none', 'dagger', 'bone'],
  };
  const kind = hints.prop ?? pick(r, set[family]);
  const shapes: Record<string, string> = {
    none: '',
    mug: `<path d="M178 190 L214 190 L210 240 L182 240 Z" fill="#e2a12e"/><path d="M214 200 Q234 204 226 226 L212 228"/><path d="M176 188 Q196 176 216 188 L214 196 Q196 200 178 196 Z" fill="${PAPER}"/>`,
    bottle: `<path d="M192 178 L204 178 L204 194 Q216 200 216 214 L216 246 L180 246 L180 214 Q180 200 192 194 Z" fill="#3f6b2e"/><path d="M184 216 L212 216 L212 236 L184 236 Z" fill="${PAPER}"/>`,
    book: `<path d="M170 196 L218 190 L222 240 L174 246 Z" fill="#6b3f3f"/><path d="M180 206 L212 202 M181 216 L213 212 M182 226 L214 222" stroke-width="3"/>`,
    coin: `<circle cx="200" cy="216" r="22" fill="#e0a32a"/><path d="M200 202 L200 230 M192 210 L208 210 M192 222 L208 222" stroke-width="4"/>`,
    cards: `<path d="M176 200 L204 194 L214 236 L186 242 Z" fill="${PAPER}"/><path d="M190 196 L218 196 L218 240 L190 240 Z" fill="${PAPER}"/><path d="M198 208 L210 220 L198 232 L186 220 Z" fill="#d92525"/>`,
    dagger: `<path d="M186 246 L196 216 L206 246 Z" fill="${PAPER}"/><path d="M196 216 L196 170 L200 168 L212 214 Z" fill="#c9c2b3"/><path d="M180 214 L216 208" stroke-width="6"/>`,
    hook: `<path d="M196 246 L196 220 Q196 196 216 200 Q232 206 222 222" fill="none" stroke-width="8"/><path d="M186 246 L206 246 L204 234 L188 234 Z" fill="${INK}"/>`,
    bone: `<path d="M172 236 L212 196" stroke-width="10"/><circle cx="170" cy="230" r="8" fill="${PAPER}"/><circle cx="178" cy="240" r="8" fill="${PAPER}"/><circle cx="208" cy="190" r="8" fill="${PAPER}"/><circle cx="216" cy="200" r="8" fill="${PAPER}"/>`,
    fish: `<path d="M170 222 Q196 196 224 222 Q196 246 170 222 Z" fill="#8fa4ad"/><path d="M224 222 L240 210 L238 234 Z" fill="#8fa4ad"/><circle cx="184" cy="218" r="3" fill="${INK}"/>`,
    wrench: `<path d="M180 246 L206 200" stroke-width="10"/><path d="M198 188 L218 188 L220 206 L210 214 L200 208 Z" fill="#8d9aa3"/>`,
    gear: `<circle cx="200" cy="216" r="18" fill="#8d9aa3"/><circle cx="200" cy="216" r="6" fill="${PAPER}"/><path d="M200 190 L200 200 M200 232 L200 242 M174 216 L184 216 M216 216 L226 216 M182 198 L189 205 M211 227 L218 234 M218 198 L211 205 M189 227 L182 234" stroke-width="6"/>`,
    bolt: `<path d="M200 184 L214 212 L204 212 L212 246 L186 206 L198 206 Z" fill="#ffd66b"/>`,
    candle: `<path d="M190 208 L210 208 L210 246 L190 246 Z" fill="${PAPER}"/><path d="M200 208 L200 196"/><path d="M200 172 Q212 186 200 194 Q188 186 200 172 Z" fill="#e0a32a"/>`,
    scythe: `<path d="M186 246 L214 176" stroke-width="7"/><path d="M214 176 Q244 172 236 200 Q232 184 214 184 Z" fill="#c9c2b3"/>`,
    egg: `<path d="M200 186 Q226 210 214 240 Q200 250 186 240 Q174 210 200 186 Z" fill="${PAPER}"/><path d="M186 216 L200 226 L214 216" fill="none" stroke-width="3"/>`,
  };
  return shapes[kind] ?? '';
}

/* Heads per family. Each returns the markup drawn between backdrop and collar; the collar/prop go over it. */
function human(r: R, hints: Hints, family: Family) {
  const skin = pick(r, SKINS), cloth = pick(r, CLOTH);
  const head = pick(r, [
    `<path d="M67 97 Q54 172 107 195 L154 194 Q187 163 175 100 Z" fill="${skin}"/>`,
    `<path d="M76 72 L180 72 L184 176 Q160 200 128 200 Q96 200 72 176 Z" fill="${skin}"/>`,
    `<ellipse cx="128" cy="126" rx="54" ry="68" fill="${skin}"/>`,
    `<path d="M70 96 Q70 60 128 58 Q186 60 186 96 L178 176 Q160 198 128 198 Q96 198 78 176 Z" fill="${skin}"/>`,
    `<path d="M84 80 L172 80 L186 130 L172 188 L84 188 L70 130 Z" fill="${skin}"/>`,
  ]);
  const ears = chance(r, .6) ? `<path d="M73 119 L69 154 M178 115 L184 148"/>` : `<ellipse cx="72" cy="128" rx="8" ry="12" fill="${skin}"/><ellipse cx="184" cy="128" rx="8" ry="12" fill="${skin}"/>`;
  const nose = pick(r, [`<path d="M122 134 L110 159 138 157"/>`, `<path d="M128 126 L120 156 L136 156"/>`, `<circle cx="128" cy="148" r="7" fill="${INK}" opacity=".85"/>`, `<path d="M118 150 Q128 160 138 150"/>`]);
  const marks = chance(r, .25) ? pick(r, [`<path d="M150 90 L166 120" stroke="#8a2a2a" stroke-width="3"/>`, `<circle cx="100" cy="140" r="7" fill="#d92525" opacity=".35"/><circle cx="156" cy="140" r="7" fill="#d92525" opacity=".35"/>`, `<path d="M92 72 L100 90 M108 68 L110 90" stroke-width="3"/>`]) : '';
  const earring = family === 'pirate' && chance(r, .6) ? `<circle cx="182" cy="152" r="6" fill="none" stroke="#e0a32a" stroke-width="3"/>` : '';
  const brows = pick(r, [`<path d="M83 126 L113 122 M142 120 L166 118"/>`, `<path d="M88 100 L116 106 M140 106 L168 100"/>`, `<path d="M90 100 L112 96 M144 96 L166 100"/>`, '']);
  return head + ears + nose + brows + eyesHuman(r, hints) + mouthHuman(r, hints) + beardHuman(r, hints) + marks + earring + hairHuman(r, hints, cloth) + collar(r, cloth, family);
}
function beast(r: R, hints: Hints) {
  const fur = pick(r, FURS), fur2 = pick(r, FURS), cloth = pick(r, CLOTH);
  const species = hints.species ?? pick(r, ['cat', 'dog', 'boar', 'bird', 'snake', 'rat', 'bear', 'frog'] as const);
  const eyes = pick(r, [`<circle cx="102" cy="120" r="7" fill="${INK}"/><circle cx="154" cy="120" r="7" fill="${INK}"/>`, `<circle cx="102" cy="120" r="11" fill="#ffd66b"/><circle cx="154" cy="120" r="11" fill="#ffd66b"/><path d="M102 111 L102 129 M154 111 L154 129" stroke-width="4"/>`, `<path d="M90 114 L114 122 M142 122 L166 114"/><circle cx="102" cy="126" r="4" fill="${INK}"/><circle cx="154" cy="126" r="4" fill="${INK}"/>`, `<circle cx="102" cy="120" r="10" fill="${PAPER}"/><circle cx="154" cy="120" r="10" fill="${PAPER}"/><circle cx="104" cy="121" r="4" fill="${INK}"/><circle cx="156" cy="121" r="4" fill="${INK}"/>`]);
  const collarBit = chance(r, .5) ? pick(r, [`<path d="M70 210 Q128 236 186 210 L190 226 Q128 252 66 226 Z" fill="${cloth}"/><circle cx="128" cy="236" r="6" fill="#e0a32a"/>`, `<path d="M70 210 Q128 236 186 210 L190 226 Q128 252 66 226 Z" fill="${INK}"/><path d="M84 218 L88 208 M110 226 L112 214 M146 226 L144 214 M172 218 L168 208" stroke="${PAPER}" stroke-width="4"/>`, `<path d="M64 206 L192 206 L176 232 Q128 246 80 232 Z" fill="${cloth}"/>`]) : '';
  const bodies: Record<string, string> = {
    cat: `<path d="M74 110 L60 40 L104 84 L152 84 L196 40 L182 110 Q196 190 128 200 Q60 190 74 110 Z" fill="${fur}"/><path d="M72 56 L96 88 M184 56 L160 88"/>${eyes}<path d="M118 148 L128 158 L138 148 Z" fill="${INK}"/><path d="M128 158 Q116 172 104 164 M128 158 Q140 172 152 164"/><path d="M60 150 L26 144 M62 162 L26 168 M196 150 L230 144 M194 162 L230 168"/>`,
    dog: `<path d="M84 96 Q84 46 128 46 Q172 46 172 96 L176 160 Q170 200 128 204 Q86 200 80 160 Z" fill="${fur}"/><path d="M84 92 Q56 100 60 160 Q68 184 86 172 Z" fill="${fur2}"/><path d="M172 92 Q200 100 196 160 Q188 184 170 172 Z" fill="${fur2}"/>${eyes}<ellipse cx="128" cy="154" rx="14" ry="10" fill="${INK}"/><path d="M128 164 L128 178 M110 180 Q128 194 146 180"/><path d="M114 192 L118 204 M142 192 L138 204" stroke="${PAPER}" stroke-width="4"/>`,
    boar: `<path d="M74 100 Q80 50 128 52 Q176 50 182 100 L186 170 Q170 208 128 210 Q86 208 70 170 Z" fill="${fur}"/><path d="M70 96 L48 60 L92 80 Z M186 96 L208 60 L164 80 Z" fill="${fur}"/>${eyes}<ellipse cx="128" cy="172" rx="30" ry="20" fill="${fur2}"/><circle cx="118" cy="172" r="4" fill="${INK}"/><circle cx="138" cy="172" r="4" fill="${INK}"/><path d="M96 190 Q90 210 100 214 M160 190 Q166 210 156 214" stroke="${PAPER}" stroke-width="6"/>`,
    bird: `<ellipse cx="128" cy="124" rx="58" ry="64" fill="${fur}"/><path d="M104 60 L96 30 L120 52 L128 26 L138 54 L160 32 L152 62 Z" fill="${fur2}"/><circle cx="100" cy="112" r="12" fill="${PAPER}"/><circle cx="156" cy="112" r="12" fill="${PAPER}"/><circle cx="102" cy="112" r="5" fill="${INK}"/><circle cx="158" cy="112" r="5" fill="${INK}"/><path d="M104 138 L152 138 L128 178 Z" fill="#e0a32a"/><path d="M104 138 L152 138"/>`,
    snake: `<path d="M84 70 L172 70 L192 130 Q186 200 128 210 Q70 200 64 130 Z" fill="${fur}"/><path d="M96 96 L120 108 M160 96 L136 108"/><path d="M104 104 L116 118 L104 128 Z M152 104 L140 118 L152 128 Z" fill="#ffd66b"/><path d="M110 116 L110 118 M146 116 L146 118" stroke-width="3"/><path d="M100 168 Q128 186 156 168"/><path d="M128 180 L128 210 L118 224 M128 210 L138 224" stroke="#d92525" stroke-width="4"/><path d="M80 130 L100 150 M96 120 L116 140 M176 130 L156 150 M160 120 L140 140" opacity=".35"/>`,
    rat: `<path d="M80 110 Q84 60 128 58 Q172 60 176 110 L170 180 Q150 206 128 210 Q106 206 86 180 Z" fill="${fur}"/><circle cx="74" cy="76" r="26" fill="${fur}"/><circle cx="182" cy="76" r="26" fill="${fur}"/><circle cx="74" cy="76" r="14" fill="${fur2}"/><circle cx="182" cy="76" r="14" fill="${fur2}"/>${eyes}<circle cx="128" cy="170" r="9" fill="${INK}"/><path d="M118 186 L124 202 M138 186 L132 202 M112 184 L144 184" stroke-width="3"/><path d="M60 176 L20 168 M62 188 L20 196 M196 176 L236 168 M194 188 L236 196" stroke-width="3"/>`,
    bear: `<path d="M76 104 Q80 54 128 52 Q176 54 180 104 L184 172 Q170 208 128 212 Q86 208 72 172 Z" fill="${fur}"/><circle cx="82" cy="66" r="20" fill="${fur}"/><circle cx="174" cy="66" r="20" fill="${fur}"/>${eyes}<ellipse cx="128" cy="164" rx="30" ry="22" fill="${fur2}"/><ellipse cx="128" cy="156" rx="12" ry="8" fill="${INK}"/><path d="M116 176 Q128 184 140 176"/>`,
    frog: `<path d="M70 120 Q70 70 128 70 Q186 70 186 120 L184 176 Q160 208 128 208 Q96 208 72 176 Z" fill="${fur}"/><circle cx="96" cy="76" r="22" fill="${fur}"/><circle cx="160" cy="76" r="22" fill="${fur}"/><circle cx="96" cy="76" r="12" fill="#ffd66b"/><circle cx="160" cy="76" r="12" fill="#ffd66b"/><circle cx="98" cy="77" r="5" fill="${INK}"/><circle cx="162" cy="77" r="5" fill="${INK}"/><path d="M88 156 Q128 190 168 156"/><circle cx="116" cy="130" r="3" fill="${INK}"/><circle cx="140" cy="130" r="3" fill="${INK}"/><circle cx="84" cy="176" r="10" fill="${fur2}" opacity=".6"/><circle cx="172" cy="176" r="10" fill="${fur2}" opacity=".6"/>`,
  };
  const extra = chance(r, .35) ? pick(r, [`<path d="M78 84 L178 84 L178 70 Q178 44 128 40 Q78 44 78 70 Z" fill="${cloth}"/><path d="M70 84 L190 84 L190 96 L70 96 Z" fill="${cloth}"/>`, `<circle cx="102" cy="120" r="16" fill="none" stroke-width="4"/><circle cx="154" cy="120" r="16" fill="none" stroke-width="4"/><path d="M118 120 L138 120"/>`, `<path d="M96 60 L108 32 L128 50 L148 32 L160 60" fill="#e0a32a"/>`]) : '';
  return bodies[species]! + extra + collarBit;
}
function mech(r: R, hints: Hints) {
  const metal = pick(r, METALS), accent = pick(r, ['#d92525', '#62d8ff', '#ffd66b', '#7ed321', '#ff7de9']);
  const head = pick(r, [
    `<path d="M64 62 L183 55 194 177 65 181 Z" fill="${metal}"/>`,
    `<path d="M66 176 L66 120 Q66 50 128 50 Q190 50 190 120 L190 176 Z" fill="${metal}"/>`,
    `<path d="M60 70 L196 70 L196 180 L60 180 Z" fill="${metal}"/><path d="M72 82 L184 82 L184 168 L72 168 Z" fill="#3f473b"/>`,
    `<path d="M84 52 L172 52 L192 116 L172 180 L84 180 L64 116 Z" fill="${metal}"/>`,
    `<ellipse cx="128" cy="116" rx="66" ry="60" fill="${metal}"/><path d="M62 116 L194 116"/>`,
  ]);
  const eyes = pick(r, [
    `<path d="M80 100 L176 94 175 130 80 131 Z" fill="${PAPER}"/><path d="M104 104 L108 127 M151 99 L151 125"/>`,
    `<circle cx="102" cy="112" r="16" fill="${PAPER}"/><circle cx="154" cy="112" r="16" fill="${PAPER}"/><circle cx="102" cy="112" r="6" fill="${accent}"/><circle cx="154" cy="112" r="6" fill="${accent}"/>`,
    `<circle cx="128" cy="110" r="24" fill="${PAPER}"/><circle cx="128" cy="110" r="10" fill="${accent}"/><circle cx="128" cy="110" r="3" fill="${INK}"/>`,
    `<path d="M84 104 L172 104 L172 122 L84 122 Z" fill="${INK}"/><path d="M92 113 L164 113" stroke="${accent}" stroke-width="4"/>`,
    `<circle cx="96" cy="110" r="10" fill="${accent}"/><circle cx="128" cy="104" r="10" fill="${accent}"/><circle cx="160" cy="110" r="10" fill="${accent}"/>`,
    `<path d="M86 100 L118 112 L86 124 Z M170 100 L138 112 L170 124 Z" fill="${accent}"/>`,
  ]);
  const mouth = pick(r, [`<path d="M91 153 L163 149"/>`, `<path d="M96 144 L160 144 L160 164 L96 164 Z" fill="${INK}"/><path d="M108 144 L108 164 M124 144 L124 164 M140 144 L140 164" stroke="${PAPER}" stroke-width="3"/>`, `<circle cx="128" cy="154" r="12" fill="${INK}"/><circle cx="128" cy="154" r="5" fill="${PAPER}"/>`, `<path d="M104 150 L152 150 M104 160 L152 160" stroke-width="3"/>`, `<path d="M108 158 Q128 146 148 158"/>`]);
  const top = pick(r, [`<path d="M78 42 L168 42 180 65 65 70 Z" fill="${INK}"/>`, `<path d="M128 52 L128 20"/><circle cx="128" cy="16" r="8" fill="${accent}"/>`, `<path d="M100 52 L96 24 M156 52 L160 24"/><circle cx="96" cy="20" r="6" fill="${INK}"/><circle cx="160" cy="20" r="6" fill="${INK}"/>`, `<path d="M96 54 L160 54 L152 30 L104 30 Z" fill="${metal}"/><circle cx="128" cy="42" r="6" fill="${accent}"/>`, `<path d="M84 58 L96 22 L108 58 M148 58 L160 22 L172 58" fill="${metal}"/>`, '']);
  const sides = pick(r, [`<path d="M60 87 L40 87 40 149 65 149 M189 84 L209 86 208 139 192 146" fill="#b6a98d"/>`, `<circle cx="58" cy="118" r="16" fill="${INK}"/><circle cx="198" cy="118" r="16" fill="${INK}"/>`, `<path d="M62 100 L36 96 L36 140 L62 136 Z M194 100 L220 96 L220 140 L194 136 Z" fill="${metal}"/><path d="M42 106 L56 106 M42 130 L56 130 M200 106 L214 106 M200 130 L214 130" stroke-width="3"/>`, '']);
  const rivets = chance(r, .6) ? `<circle cx="76" cy="72" r="3" fill="${INK}"/><circle cx="180" cy="70" r="3" fill="${INK}"/><circle cx="78" cy="168" r="3" fill="${INK}"/><circle cx="182" cy="166" r="3" fill="${INK}"/>` : '';
  const damage = chance(r, .3) ? `<path d="M150 150 L168 168 L160 172 M84 96 L96 104" stroke-width="3"/><path d="M150 150 L168 168 L160 172 Z" fill="#6f6a5a"/>` : '';
  const chest = pick(r, [`<path d="M70 236 L82 190 L174 190 L186 236 Z" fill="${metal}"/><circle cx="128" cy="214" r="9" fill="${accent}"/>`, `<path d="M66 240 L80 196 L176 196 L190 240 Z" fill="#4a4a4a"/><path d="M94 206 L100 240 M162 206 L156 240 M110 220 L146 220" stroke="${accent}" stroke-width="3"/>`, `<path d="M88 236 L96 190 L160 190 L168 236 Z" fill="${metal}"/><path d="M60 236 Q64 206 88 206 M196 236 Q192 206 168 206" fill="none"/>`]);
  return head + rivets + damage + eyes + mouth + top + sides + chest;
}
function undead(r: R, hints: Hints) {
  const bone = pick(r, BONES), glow = pick(r, ['#7ed321', '#c77dff', '#62d8ff', '#ff5b47', '#ffd66b']), cloth = pick(r, ['#2b1a3a', '#3f473b', '#1a1a1a', '#4a2a2a', '#2f4a6b']);
  const skull = pick(r, [
    `<path d="M74 110 Q74 46 128 46 Q182 46 182 110 Q182 150 164 160 L164 190 L92 190 L92 160 Q74 150 74 110 Z" fill="${bone}"/>`,
    `<path d="M80 96 Q80 44 128 44 Q176 44 176 96 L176 164 L156 196 L100 196 L80 164 Z" fill="${bone}"/>`,
    `<path d="M70 120 Q70 50 128 50 Q186 50 186 120 L178 176 L156 186 L100 186 L78 176 Z" fill="${bone}"/>`,
    `<path d="M84 100 Q84 54 128 54 Q172 54 172 100 L176 150 Q156 174 128 176 Q100 174 80 150 Z" fill="${bone}"/>`,
  ]);
  const sockets = pick(r, [
    `<ellipse cx="104" cy="118" rx="16" ry="18" fill="${INK}"/><ellipse cx="152" cy="118" rx="16" ry="18" fill="${INK}"/><circle cx="104" cy="120" r="5" fill="${glow}"/><circle cx="152" cy="120" r="5" fill="${glow}"/>`,
    `<path d="M86 104 L120 116 L112 136 L86 130 Z M170 104 L136 116 L144 136 L170 130 Z" fill="${INK}"/><circle cx="104" cy="122" r="4" fill="${glow}"/><circle cx="152" cy="122" r="4" fill="${glow}"/>`,
    `<circle cx="104" cy="118" r="15" fill="${INK}"/><circle cx="152" cy="118" r="15" fill="${INK}"/>`,
    `<ellipse cx="104" cy="118" rx="16" ry="18" fill="${INK}"/><path d="M136 100 L170 100 L170 136 L136 136 Z" fill="${INK}"/><circle cx="104" cy="120" r="5" fill="${glow}"/><path d="M144 110 L162 126 M162 110 L144 126" stroke="${glow}" stroke-width="3"/>`,
  ]);
  const nose = pick(r, [`<path d="M128 138 L120 156 L136 156 Z" fill="${INK}"/>`, `<path d="M122 142 L128 154 L134 142" fill="${INK}"/>`]);
  const jaw = pick(r, [
    `<path d="M96 168 L160 168 L160 186 L96 186 Z" fill="${bone}"/><path d="M108 168 L108 186 M120 168 L120 186 M132 168 L132 186 M144 168 L144 186"/>`,
    `<path d="M100 166 L156 166 L150 196 L106 196 Z" fill="${INK}"/><path d="M104 166 L108 178 M116 166 L118 180 M140 166 L138 180 M152 166 L148 178" stroke="${bone}" stroke-width="4"/>`,
    `<path d="M98 168 Q128 178 158 168 L156 180 Q128 190 100 180 Z" fill="${bone}"/><path d="M112 170 L112 182 M128 172 L128 186 M144 170 L144 182"/>`,
  ]);
  const cracks = chance(r, .5) ? pick(r, [`<path d="M150 60 L160 84 L152 96" stroke-width="3"/>`, `<path d="M96 66 L88 90 L98 100 M170 140 L162 150" stroke-width="3"/>`]) : '';
  const wear = hints.crown ? `<path d="M84 60 L88 26 L106 46 L128 18 L150 46 L168 26 L172 60 Z" fill="#e0a32a"/><circle cx="128" cy="34" r="5" fill="#d92525"/>`
    : pick(r, ['', `<path d="M64 200 Q56 60 128 40 Q200 60 192 200 L168 200 Q164 84 128 76 Q92 84 88 200 Z" fill="${cloth}"/>`, `<path d="M78 84 L178 84 L178 70 Q178 44 128 40 Q78 44 78 70 Z" fill="${cloth}"/><path d="M70 84 L190 84 L190 96 L70 96 Z" fill="${cloth}"/>`, `<path d="M80 72 Q128 30 176 72 L176 60 Q128 10 80 60 Z" fill="${cloth}"/>`]);
  const body = pick(r, [`<path d="M60 240 L76 200 L180 200 L196 240 Z" fill="${cloth}"/><path d="M92 200 L128 226 L164 200"/>`, `<path d="M66 240 Q66 196 128 196 Q190 196 190 240 Z" fill="${cloth}"/><path d="M100 218 L156 218 M104 230 L152 230" stroke="${bone}" stroke-width="4"/>`, `<path d="M70 240 L82 204 L174 204 L186 240 Z" fill="${bone}"/><path d="M96 204 L96 240 M112 204 L112 240 M144 204 L144 240 M160 204 L160 240" stroke-width="3"/>`]);
  return skull + cracks + sockets + nose + jaw + wear + body;
}
function dragon(r: R, hints: Hints) {
  const scale = pick(r, SCALES), belly = pick(r, ['#e0d3b8', '#f0e6c8', '#d8c9a0']), eyeCol = pick(r, ['#ffd66b', '#7ed321', '#ff5b47', '#62d8ff']);
  const head = pick(r, [
    `<path d="M70 108 Q78 56 128 56 Q178 56 186 108 L196 150 Q180 176 140 178 L116 178 Q76 176 60 150 Z" fill="${scale}"/><path d="M96 154 L160 154 L156 176 L100 176 Z" fill="${belly}"/>`,
    `<path d="M74 112 Q70 60 128 60 Q186 60 182 112 L212 160 Q188 184 140 182 L116 182 Q68 184 44 160 Z" fill="${scale}"/><path d="M84 160 L172 160 L166 180 L90 180 Z" fill="${belly}"/>`,
    `<path d="M80 100 Q84 50 128 50 Q172 50 176 100 L176 150 Q160 190 128 190 Q96 190 80 150 Z" fill="${scale}"/><path d="M100 150 L156 150 L150 186 L106 186 Z" fill="${belly}"/>`,
  ]);
  const horns = pick(r, [
    `<path d="M92 70 Q70 40 78 12 Q96 34 106 62 Z M164 70 Q186 40 178 12 Q160 34 150 62 Z" fill="${belly}"/>`,
    `<path d="M120 56 L128 8 L136 56 Z" fill="${belly}"/><path d="M96 66 L84 34 L110 60 Z M160 66 L172 34 L146 60 Z" fill="${belly}"/>`,
    `<path d="M84 76 L60 44 L92 62 Z M104 62 L96 26 L118 56 Z M152 62 L160 26 L138 56 Z M172 76 L196 44 L164 62 Z" fill="${belly}"/>`,
    `<path d="M86 74 Q70 74 60 96 Q76 90 92 92 Z M170 74 Q186 74 196 96 Q180 90 164 92 Z" fill="${scale}"/>`,
  ]);
  const eyes = pick(r, [
    `<ellipse cx="102" cy="116" rx="14" ry="10" fill="${eyeCol}"/><ellipse cx="154" cy="116" rx="14" ry="10" fill="${eyeCol}"/><path d="M102 108 L102 124 M154 108 L154 124" stroke-width="4"/><path d="M86 104 L116 110 M140 110 L170 104"/>`,
    `<circle cx="102" cy="116" r="11" fill="${eyeCol}"/><circle cx="154" cy="116" r="11" fill="${eyeCol}"/><circle cx="102" cy="116" r="4" fill="${INK}"/><circle cx="154" cy="116" r="4" fill="${INK}"/>`,
    `<path d="M86 112 L118 118 L86 124 Z M170 112 L138 118 L170 124 Z" fill="${eyeCol}"/>`,
  ]);
  const snout = pick(r, [
    `<circle cx="112" cy="146" r="4" fill="${INK}"/><circle cx="144" cy="146" r="4" fill="${INK}"/><path d="M92 160 Q128 170 164 160"/><path d="M104 160 L108 172 M124 162 L126 174 M144 162 L142 174 M156 160 L152 170" stroke="${PAPER}" stroke-width="4"/>`,
    `<circle cx="112" cy="146" r="4" fill="${INK}"/><circle cx="144" cy="146" r="4" fill="${INK}"/><path d="M96 158 L160 158 L152 172 L104 172 Z" fill="${INK}"/><path d="M104 158 L110 170 M120 158 L124 170 M136 158 L132 170 M152 158 L146 170" stroke="${PAPER}" stroke-width="4"/><path d="M60 176 Q48 160 60 146 Q72 156 62 168" fill="#ff9a1f" opacity=".85"/>`,
    `<path d="M104 148 Q128 156 152 148"/><path d="M110 150 L112 162 M146 150 L144 162"/><path d="M186 132 Q206 116 200 100 Q208 122 194 136" fill="#c9c2b3" opacity=".7"/>`,
  ]);
  const scales = chance(r, .7) ? `<path d="M96 88 Q104 78 112 88 M120 84 Q128 74 136 84 M144 88 Q152 78 160 88 M108 100 Q116 90 124 100 M132 100 Q140 90 148 100" fill="none" stroke-width="3" opacity=".5"/>` : '';
  const frill = chance(r, .4) ? `<path d="M60 150 L36 130 L52 166 L28 160 L56 184 Z M196 150 L220 130 L204 166 L228 160 L200 184 Z" fill="${scale}"/>` : '';
  const body = pick(r, [`<path d="M62 240 L80 196 L176 196 L194 240 Z" fill="${scale}"/><path d="M96 196 L92 240 M160 196 L164 240 M112 214 L144 214 M108 228 L148 228" stroke-width="3" opacity=".6"/>`, `<path d="M62 240 L80 196 L176 196 L194 240 Z" fill="${scale}"/><path d="M100 196 L96 240 L160 240 L156 196 Z" fill="${belly}"/><path d="M100 208 L156 208 M99 220 L157 220 M98 232 L158 232" stroke-width="3" opacity=".5"/>`]);
  return frill + head + scales + horns + eyes + snout + body;
}

const HIDES = ['#b8352a', '#8e2a6a', '#6a2bd9', '#c9552a', '#4a2a5a', '#a63a3a', '#7a3a8a'];
/** Demons: horned heads on a hot hide, ember eyes, a fanged grin and, often, bat wings behind the shoulders. The Devourer's jaws are the gluttons' look. */
function demon(r: R, hints: Hints) {
  const hide = pick(r, HIDES), hide2 = pick(r, HIDES), ember = pick(r, ['#ffd66b', '#ff9a1f', '#7ed321', '#62d8ff', '#ff5b47']), horn = pick(r, ['#e7e2d3', '#3a2a2a', '#c9b58a']);
  const wings = chance(r, .55) ? `<path d="M64 132 L20 84 L44 130 L12 118 L50 158 L28 164 L70 176 Z" fill="${hide2}"/><path d="M192 132 L236 84 L212 130 L244 118 L206 158 L228 164 L186 176 Z" fill="${hide2}"/>` : '';
  const head = pick(r, [
    `<path d="M76 106 Q80 54 128 54 Q176 54 180 106 L184 168 Q170 206 128 208 Q86 206 72 168 Z" fill="${hide}"/>`,
    `<path d="M70 96 L186 96 L196 160 Q176 200 128 204 Q80 200 60 160 Z" fill="${hide}"/>`,
    `<path d="M82 112 Q78 56 128 56 Q178 56 174 112 L192 150 Q176 196 128 200 Q80 196 64 150 Z" fill="${hide}"/>`,
    `<path d="M78 100 Q84 52 128 52 Q172 52 178 100 L176 176 Q156 208 128 210 Q100 208 80 176 Z" fill="${hide}"/><path d="M96 84 L160 84 L152 100 L104 100 Z" fill="${hide2}"/>`,
  ]);
  const horns = pick(r, [
    `<path d="M92 68 Q60 50 62 14 Q90 30 108 62 Z M164 68 Q196 50 194 14 Q166 30 148 62 Z" fill="${horn}"/>`,
    `<path d="M96 66 L82 20 L114 58 Z M160 66 L174 20 L142 58 Z" fill="${horn}"/>`,
    `<path d="M88 74 Q56 74 50 36 Q76 48 100 66 Z M168 74 Q200 74 206 36 Q180 48 156 66 Z" fill="${horn}"/><path d="M60 46 L72 56 M196 46 L184 56" stroke-width="3"/>`,
    `<path d="M104 60 L96 22 L120 54 Z M152 60 L160 22 L136 54 Z M120 52 L128 18 L136 52 Z" fill="${horn}"/>`,
  ]);
  const eyes = pick(r, [
    `<path d="M86 106 L120 116 L88 128 Z M170 106 L136 116 L168 128 Z" fill="${ember}"/><circle cx="100" cy="117" r="3" fill="${INK}"/><circle cx="156" cy="117" r="3" fill="${INK}"/>`,
    `<ellipse cx="102" cy="116" rx="13" ry="9" fill="${ember}"/><ellipse cx="154" cy="116" rx="13" ry="9" fill="${ember}"/><path d="M102 108 L102 124 M154 108 L154 124" stroke-width="4"/><path d="M86 100 L118 108 M138 108 L170 100"/>`,
    `<circle cx="102" cy="116" r="10" fill="${ember}"/><circle cx="154" cy="116" r="10" fill="${ember}"/><circle cx="102" cy="116" r="4" fill="${INK}"/><circle cx="154" cy="116" r="4" fill="${INK}"/><path d="M88 102 L116 110 M140 110 L168 102"/>`,
    `<circle cx="128" cy="112" r="16" fill="${ember}"/><circle cx="128" cy="112" r="6" fill="${INK}"/><path d="M96 104 L112 112 M160 104 L144 112"/>`,
  ]);
  const grin = pick(r, [
    `<path d="M98 156 Q128 176 158 156 L156 172 Q128 190 100 172 Z" fill="${INK}"/><path d="M106 160 L110 174 M122 166 L124 180 M134 166 L132 180 M150 160 L146 174" stroke="${PAPER}" stroke-width="4"/>`,
    `<path d="M92 150 Q128 140 164 150 L160 180 Q128 196 96 180 Z" fill="${INK}"/><path d="M100 154 L106 176 M116 152 L120 182 M140 152 L136 182 M156 154 L150 176" stroke="${PAPER}" stroke-width="4"/><path d="M104 176 Q128 186 152 176" stroke="#d92525" stroke-width="3"/>`,
    `<path d="M104 158 Q128 170 152 158"/><path d="M108 160 L112 174 M148 160 L144 174" stroke="${PAPER}" stroke-width="5"/><path d="M108 160 L112 174 M148 160 L144 174" stroke-width="2"/>`,
    `<path d="M100 160 L156 160 L148 184 L108 184 Z" fill="${INK}"/><path d="M106 160 L110 172 M118 160 L122 176 M138 160 L134 176 M150 160 L146 172 M112 184 L116 174 M144 184 L140 174" stroke="${PAPER}" stroke-width="4"/>`,
  ]);
  const marks = chance(r, .5) ? pick(r, [`<path d="M92 92 L100 100 M164 92 L156 100 M128 140 L128 146" stroke-width="3"/>`, `<path d="M84 136 Q92 130 100 136 M156 136 Q164 130 172 136" stroke="${ember}" stroke-width="3"/>`, `<circle cx="88" cy="140" r="3" fill="${INK}"/><circle cx="168" cy="140" r="3" fill="${INK}"/><circle cx="96" cy="150" r="2" fill="${INK}"/><circle cx="160" cy="150" r="2" fill="${INK}"/>`]) : '';
  const ears = chance(r, .6) ? `<path d="M74 116 L40 96 L70 136 Z M182 116 L216 96 L186 136 Z" fill="${hide}"/>` : '';
  const body = pick(r, [
    `<path d="M62 240 L80 198 L176 198 L194 240 Z" fill="${hide2}"/><path d="M96 198 L128 224 L160 198"/><path d="M118 226 L138 226" stroke="${ember}" stroke-width="4"/>`,
    `<path d="M66 240 Q66 196 128 196 Q190 196 190 240 Z" fill="#2b1a3a"/><path d="M108 210 L128 232 L148 210 Z" fill="${ember}"/>`,
    `<path d="M70 240 L82 200 L174 200 L186 240 Z" fill="${hide}"/><path d="M90 206 L96 240 M166 206 L160 240 M104 214 L152 214 M100 226 L156 226" stroke-width="3" opacity=".5"/>`,
  ]);
  const crown = hints.crown ? `<path d="M84 60 L88 26 L106 46 L128 18 L150 46 L168 26 L172 60 Z" fill="#e0a32a"/><circle cx="128" cy="34" r="5" fill="#d92525"/>` : '';
  return wings + ears + head + marks + horns + eyes + grin + crown + body;
}

/** Word hints from the id: the obvious trappings a name promises. */
type Hints = { crown?: boolean; glasses?: boolean; patch?: boolean; beard?: boolean; hood?: boolean; species?: 'cat' | 'dog' | 'boar' | 'bird' | 'snake' | 'rat' | 'bear' | 'frog'; prop?: string };
function hintsOf(id: string, r: R, family: Family): Hints {
  const h: Hints = {};
  if (/king|lord|queen|baron|admiral|titan|mogul|master|ringmaster/.test(id)) h.crown = true;
  if (/scribe|mentor|magician|scholar|collector|bottler|trainer|zookeeper/.test(id)) h.glasses = true;
  if (family === 'pirate' && /hook|admiral|ripsnarl|bosun|first-mate|dreadnought|smuggler/.test(id)) h.patch = true;
  if (/mate|bosun|admiral|hoggarr|warlord|bruiser|bouncer|drunk|smuggler|gravedigger/.test(id)) h.beard = true;
  if (/priestess|necro|wraith|shade|assassin|omen|dark/.test(id)) h.hood = true;
  if (/cat|lightfang|fang/.test(id)) h.species = 'cat';
  else if (/hound|kennel|dog|hyena|howler|alpha|goldrinn|hunter/.test(id)) h.species = 'dog';
  // Order matters: the Boar Brute token and Boar Raptor are boars, but a plain "cub" is the bear cub.
  else if (/boar|hoggarr|token-cub|primal|raptor|many-heads/.test(id)) h.species = 'boar';
  else if (/parrot|magpie|bird|brood|nest/.test(id)) h.species = 'bird';
  else if (/viper|snake|hydra|many-heads|leviathan|whelp|poison-master/.test(id)) h.species = 'snake';
  else if (/rat|bilge|scavenger|breeder/.test(id)) h.species = 'rat';
  else if (/bear|mama|den-mother|bruiser|cub/.test(id)) h.species = 'bear';
  else if (/frog/.test(id)) h.species = 'frog';
  if (/coin|broker|trader|looter|pickpocket|gold|mogul/.test(id)) h.prop = 'coin';
  else if (/drunk|bottler|tavern|swab/.test(id)) h.prop = 'bottle';
  else if (/scribe|mentor|magician|necro|scholar/.test(id)) h.prop = 'book';
  else if (/hook/.test(id)) h.prop = 'hook';
  else if (/assassin|twin-blade|sellsword|butcher|cannoneer/.test(id)) h.prop = 'dagger';
  else if (/welder|mechanic|tinkerer|forge|junk/.test(id)) h.prop = 'wrench';
  else if (/harvester|reaper|gravedigger/.test(id)) h.prop = 'scythe';
  else if (/egg/.test(id)) h.prop = 'egg';
  else if (/token/.test(id)) h.prop = 'none';
  void r;
  return h;
}

export function illustrationUrl(id: string, tribes?: readonly string[]): string {
  const key = tribes?.length ? `${id}|${tribes.join(',')}` : id;
  if (cache.has(key)) return cache.get(key)!;
  const r = rng(id);
  const family = familyOf(id, tribes);
  const hints = hintsOf(id, r, family);
  const backdrop = pick(r, BACKDROPS);
  // Backdrop treatment: plain card, stripes, halftone, sunburst — the room the character is in.
  const pattern = pick(r, ['', `<path d="M0 0 L256 256 M40 0 L256 216 M0 40 L216 256 M80 0 L256 176 M0 80 L176 256" stroke="${INK}" stroke-width="2" opacity=".07"/>`, `<circle cx="128" cy="140" r="96" fill="${INK}" opacity=".06"/>`, `<g stroke="${INK}" stroke-width="2" opacity=".08">${Array.from({ length: 12 }, (_, i) => { const a = i / 12 * Math.PI * 2; return `<path d="M128 130 L${(128 + Math.cos(a) * 240).toFixed(0)} ${(130 + Math.sin(a) * 240).toFixed(0)}"/>`; }).join('')}</g>`, `<path d="M0 200 L256 200 L256 256 L0 256 Z" fill="${INK}" opacity=".08"/>`]);
  const figure = family === 'beast' ? beast(r, hints) : family === 'mech' ? mech(r, hints) : family === 'undead' ? undead(r, hints) : family === 'dragon' ? dragon(r, hints) : family === 'demon' ? demon(r, hints) : human(r, hints, family);
  const held = prop(r, family, hints);
  // Pose: a slight tilt and offset so the cards on a row don't all stand to attention; scale keeps big heads inside the frame.
  const tilt = range(r, -7, 7).toFixed(1), dx = range(r, -10, 10).toFixed(0), dy = range(r, -6, 8).toFixed(0), s = range(r, .9, 1.02).toFixed(3);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><defs><pattern id="h" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(25)"><path d="M0 0V9" stroke="${INK}" opacity=".08"/></pattern></defs><path fill="#cac8b7" d="M0 0H256V256H0Z"/><path d="M13 231L28 23 235 17 246 242Z" fill="${backdrop}"/>${pattern}<g stroke="${INK}" stroke-width="5" stroke-linejoin="round" stroke-linecap="round" transform="translate(${dx} ${dy}) rotate(${tilt} 128 150) scale(${s}) translate(${((1 - Number(s)) * 128).toFixed(1)} ${((1 - Number(s)) * 150).toFixed(1)})">${figure}${held}</g><path fill="url(#h)" d="M0 0H256V256H0Z"/><path d="M15 18L59 14M220 219L233 241M23 208L32 240" stroke="${INK}" stroke-width="2" opacity=".3"/></svg>`;
  const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  cache.set(key, url);
  return url;
}
