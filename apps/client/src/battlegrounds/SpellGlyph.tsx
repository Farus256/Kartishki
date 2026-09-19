import type { AutoBattlerSpellKind } from '@kartishki/shared';

/**
 * Cut-paper glyph for a tavern spell, one per spell kind (the id stays the same in every hand and on every table).
 * Same style as the procedural portraits: flat paper fills, a thick ink line, one accent colour per kind — with a
 * second plane (shadow, rim, highlight) and a few props so each reads as a little object rather than a pictogram.
 * Geometry lives inside 12…88 of the 100×100 box; `fill` is the default paint for paths without their own.
 */
const INK = '#1a1a1a';
const PAPER = '#f6efdc';
const GLYPHS: Record<AutoBattlerSpellKind, { fill: string; body: string }> = {
  /* Coin: a short stack of coins, the top one stamped with a $, two glints */
  coin: { fill: '#ffd66b', body:
    '<ellipse cx="50" cy="72" rx="30" ry="10" fill="#c9a04a"/><path d="M20 62v10a30 10 0 0 0 60 0V62Z" fill="#c9a04a"/><ellipse cx="50" cy="62" rx="30" ry="10" fill="#e6b84a"/>'
    + '<path d="M20 50v12a30 10 0 0 0 60 0V50Z" fill="#c9a04a"/><ellipse cx="50" cy="50" rx="30" ry="10" fill="#e6b84a"/>'
    + '<path d="M20 38v12a30 10 0 0 0 60 0V38Z" fill="#c9a04a"/><ellipse cx="50" cy="38" rx="30" ry="10"/><ellipse cx="50" cy="38" rx="21" ry="6" fill="none" stroke-width="3"/>'
    + '<text x="50" y="43" font-size="16" font-weight="700" text-anchor="middle" font-family="PT Mono,monospace" fill="#1a1a1a" stroke="none">$</text>'
    + '<path d="M28 34l4-3M72 34l-4-3" stroke="#fff6d2" stroke-width="3"/><path d="M82 24l2 5 5 2-5 2-2 5-2-5-5-2 5-2Z" fill="#fff6d2" stroke-width="3"/>' },
  /* Bank: a stitched purse with a drawstring, coins spilling at its foot */
  bank: { fill: '#c9a04a', body:
    '<ellipse cx="50" cy="84" rx="30" ry="4" fill="#00000033" stroke="none"/>'
    + '<circle cx="24" cy="78" r="8" fill="#ffd66b"/><circle cx="24" cy="78" r="4" fill="none" stroke-width="3"/><circle cx="78" cy="79" r="7" fill="#ffd66b"/><circle cx="78" cy="79" r="3.5" fill="none" stroke-width="3"/>'
    + '<path d="M30 40c-10 14-10 36 20 36s30-22 20-36Z"/><path d="M34 44c-6 12-6 26 12 30" fill="none" stroke="#fff6d2" stroke-width="3"/>'
    + '<path d="M40 60v8M46 62v10M54 62v10M60 60v8" fill="none" stroke="#7a5a20" stroke-width="3" stroke-dasharray="1 4"/>'
    + '<path d="M36 40c0-10 28-10 28 0" fill="#fff6d2"/><path d="M38 34c4-6 20-6 24 0" fill="none"/>'
    + '<path d="M30 30l6 8M70 30l-6 8M50 28V16" fill="none"/><circle cx="30" cy="28" r="3.5" fill="#7a5a20"/><circle cx="70" cy="28" r="3.5" fill="#7a5a20"/>' },
  /* Free refresh: two chasing arrows around a bold zero, sparks thrown off the rim */
  freeReroll: { fill: '#8fe38a', body:
    '<circle cx="50" cy="52" r="30" fill="#e8f7e6"/>'
    + '<path d="M30 42a22 22 0 0 1 38-6" fill="none"/><path d="M68 24l2 14-14-2Z"/><path d="M70 62a22 22 0 0 1-38 6" fill="none"/><path d="M32 80l-2-14 14 2Z"/>'
    + '<text x="50" y="62" font-size="30" font-weight="700" text-anchor="middle" font-family="PT Mono,monospace" fill="#1a1a1a" stroke="none">0</text>'
    + '<path d="M16 26l3 5M12 40h6M84 76l-3-5M88 62h-6" stroke="#5fa35a" stroke-width="3"/>' },
  /* Refresh: the chasing arrows with a four-point sparkle and a scatter of stars */
  refresh: { fill: '#8fe38a', body:
    '<circle cx="50" cy="52" r="30" fill="#e8f7e6"/>'
    + '<path d="M30 42a22 22 0 0 1 38-6" fill="none"/><path d="M68 24l2 14-14-2Z"/><path d="M70 62a22 22 0 0 1-38 6" fill="none"/><path d="M32 80l-2-14 14 2Z"/>'
    + '<path d="M50 38l4 9 9 2-7 6 2 9-8-5-8 5 2-9-7-6 9-2Z" fill="#fff6d2"/>'
    + '<path d="M18 22l2 4 4 2-4 2-2 4-2-4-4-2 4-2Z" fill="#fff6d2" stroke-width="3"/><path d="M82 78l2 4 4 2-4 2-2 4-2-4-4-2 4-2Z" fill="#fff6d2" stroke-width="3"/>' },
  /* Tonic: a corked bottle with a paper label, the brew fizzing inside */
  tonic: { fill: '#d94a4a', body:
    '<ellipse cx="50" cy="82" rx="18" ry="4" fill="#00000033" stroke="none"/>'
    + '<path d="M44 16h12v8H44Z" fill="#c9a04a"/><path d="M46 20h8" fill="none" stroke="#7a5a20" stroke-width="3"/>'
    + '<path d="M42 24h16v10l8 10v32H34V44l8-10Z" fill="#f2c9c9"/>'
    + '<path d="M36 48c0-4 6-6 8-6h12c2 0 8 2 8 6v28H36Z"/>'
    + '<path d="M38 56h24v12H38Z" fill="#fff6d2"/><path d="M42 60h16M42 64h10" fill="none" stroke-width="3"/>'
    + '<path d="M38 30v16" fill="none" stroke="#fff6d2" stroke-width="3"/>'
    + '<circle cx="44" cy="50" r="2.5" fill="#fff6d2" stroke="none"/><circle cx="56" cy="46" r="2" fill="#fff6d2" stroke="none"/><circle cx="52" cy="74" r="2.5" fill="#fff6d2" stroke="none"/>' },
  /* Temporary: a frothy tankard with an hourglass stamped on the side */
  temp: { fill: '#e29a2c', body:
    '<ellipse cx="46" cy="82" rx="20" ry="4" fill="#00000033" stroke="none"/>'
    + '<path d="M28 34h36v42H28Z"/><path d="M32 40v30M40 40v30" fill="none" stroke="#a86a14" stroke-width="3"/>'
    + '<path d="M64 44h8a7 7 0 0 1 0 14h-8" fill="none"/><path d="M66 48h6a3 3 0 0 1 0 6h-6" fill="none" stroke="#a86a14" stroke-width="3"/>'
    + '<path d="M26 30c0-8 10-10 20-10s20 2 20 10v6H26Z" fill="#fff8e6"/><circle cx="34" cy="26" r="6" fill="#fff8e6"/><circle cx="58" cy="24" r="7" fill="#fff8e6"/><circle cx="46" cy="20" r="6" fill="#fff8e6"/>'
    + '<path d="M30 36c2 8 0 12-2 16" fill="none" stroke="#fff8e6"/>'
    + '<path d="M48 48h10l-4 6 4 6H48l4-6Z" fill="#fff8e6" stroke-width="3"/><path d="M48 46h10M48 62h10" stroke-width="3"/>' },
  /* Keyword: a rolled scroll with lines of script and a ribboned wax seal */
  keyword: { fill: PAPER, body:
    '<path d="M28 24h44v52H28Z"/><path d="M72 24v52" fill="none" stroke="#00000022" stroke-width="8"/>'
    + '<path d="M22 18h50a6 6 0 0 1 0 12H22a6 6 0 0 1 0-12Z" fill="#e8dcbd"/><path d="M22 70h50a6 6 0 0 1 0 12H22a6 6 0 0 1 0-12Z" fill="#e8dcbd"/>'
    + '<circle cx="22" cy="24" r="6" fill="#c9b98a"/><circle cx="22" cy="76" r="6" fill="#c9b98a"/>'
    + '<path d="M36 40h28M36 48h28M36 56h14" fill="none" stroke-width="4"/>'
    + '<path d="M56 62l6 16 6-16" fill="#b3150e" stroke-width="3"/><circle cx="62" cy="60" r="9" fill="#b3150e"/><path d="M58 58l4 4 4-4" fill="none" stroke="#f6efdc" stroke-width="3"/>' },
  /* Tribe buff: a banner on a pole, fringed hem, a gold star on the field */
  tribeBuff: { fill: '#3f5a9c', body:
    '<path d="M50 88V12" fill="none" stroke-width="6"/><circle cx="50" cy="12" r="5" fill="#ffd66b"/>'
    + '<path d="M20 22h60v46l-30-12-30 12Z"/><path d="M26 22v40" fill="none" stroke="#6a86c8" stroke-width="3"/>'
    + '<path d="M20 22h60v8H20Z" fill="#ffd66b"/><path d="M20 66l6 6 6-8 6 8 6-8 6 6 6-6 6 8 6-8 6 8 6-6" fill="none" stroke="#ffd66b" stroke-width="3"/>'
    + '<path d="M50 34l4 9 10 1-7 7 2 10-9-5-9 5 2-10-7-7 10-1Z" fill="#ffd66b"/>' },
  /* Hand buff: a fanned hand of cards, the front one raised with a growing arrow */
  handBuff: { fill: '#84afb3', body:
    '<path d="M18 74l8-40h16l-6 40Z" fill="#6f9599"/><path d="M24 40l-2 10" fill="none" stroke="#a9c9cc" stroke-width="3"/>'
    + '<path d="M34 74l4-40h16l-2 40Z" fill="#a9c9cc"/><path d="M42 40l-1 10" fill="none" stroke="#fff6d2" stroke-width="3"/>'
    + '<path d="M52 74l2-40h18v40Z"/><path d="M58 40v10" fill="none" stroke="#a9c9cc" stroke-width="3"/>'
    + '<path d="M62 56l8-12 8 12h-5v10h-6V56Z" fill="#ffd66b" stroke-width="3"/>'
    + '<path d="M14 80h72" fill="none" stroke-width="3"/>' },
  /* Tavern buff: a bar counter with shelved bottles and a mug, drop of light on each */
  tavernBuff: { fill: '#e8c27a', body:
    '<path d="M14 54h72v22H14Z"/><path d="M14 54h72v6H14Z" fill="#c99a48"/><path d="M20 66h8M34 66h8M48 66h8M62 66h8" fill="none" stroke="#a86a14" stroke-width="3"/>'
    + '<path d="M28 30h8v24h-8Z" fill="#8fe38a"/><path d="M30 26h4v4h-4Z" fill="#c9a04a"/><path d="M30 34v10" fill="none" stroke="#fff6d2" stroke-width="3"/>'
    + '<path d="M46 26h8v28h-8Z" fill="#d94a4a"/><path d="M48 22h4v4h-4Z" fill="#c9a04a"/><path d="M48 32v12" fill="none" stroke="#fff6d2" stroke-width="3"/>'
    + '<path d="M64 38h10v16H64Z" fill="#fff8e6"/><path d="M74 42h4a3 3 0 0 1 0 8h-4" fill="none"/><path d="M62 36c0-4 4-6 7-6s7 2 7 6Z" fill="#fff8e6"/>' },
  /* Upgrade: a riveted shield with a rising arrow and chevrons beneath */
  upgrade: { fill: '#ffd66b', body:
    '<path d="M50 12 80 22v24c0 18-13 30-30 38-17-8-30-20-30-38V22Z"/>'
    + '<path d="M50 20 72 28v18c0 13-9 22-22 29V20Z" fill="#e6b84a"/>'
    + '<circle cx="30" cy="30" r="2.5" fill="#7a5a20"/><circle cx="70" cy="30" r="2.5" fill="#7a5a20"/><circle cx="26" cy="50" r="2.5" fill="#7a5a20"/><circle cx="74" cy="50" r="2.5" fill="#7a5a20"/>'
    + '<path d="M50 30l14 16h-8v12H44V46h-8Z" fill="#fff6d2"/><path d="M40 66l10 6 10-6M40 74l10 6 10-6" fill="none" stroke="#fff6d2" stroke-width="3"/>' },
  /* Summon: a brass bell on a ribbon, clapper swinging, sound rings in the air */
  summon: { fill: '#c9a04a', body:
    '<path d="M44 14h12v6H44Z" fill="#b3150e"/><path d="M46 12l-4-4M54 12l4-4" fill="none" stroke="#b3150e" stroke-width="3"/>'
    + '<path d="M32 60c0-24 8-32 18-34 10 2 18 10 18 34l7 8H25Z"/><path d="M38 58c0-18 4-26 10-30" fill="none" stroke="#fff6d2" stroke-width="3"/>'
    + '<path d="M40 30c2-6 6-8 10-8" fill="none" stroke="#7a5a20" stroke-width="3"/>'
    + '<path d="M25 68h50v6H25Z" fill="#e6b84a"/>'
    + '<path d="M44 74h12v8H44Z"/><circle cx="50" cy="84" r="4" fill="#7a5a20"/>'
    + '<path d="M18 40a12 12 0 0 0 0 20M12 34a20 20 0 0 0 0 32M82 40a12 12 0 0 1 0 20M88 34a20 20 0 0 1 0 32" fill="none" stroke-width="3"/>' },
  /* Discover: three cards fanned, the front one struck by a shining star */
  discover: { fill: PAPER, body:
    '<path d="M18 32l30-10 10 46-30 10Z" fill="#e8dcbd" transform="rotate(-8 34 50)"/><path d="M82 32 52 22 42 68l30 10Z" fill="#e8dcbd" transform="rotate(8 66 50)"/>'
    + '<path d="M34 18h32v66H34Z"/><path d="M40 24h20v6H40Z" fill="#e8dcbd" stroke="none"/><path d="M40 70h20M40 76h12" fill="none" stroke-width="3"/>'
    + '<path d="M50 32l5 11 12 1-9 8 3 12-11-6-11 6 3-12-9-8 12-1Z" fill="#ffd66b"/>'
    + '<path d="M22 14l2 4 4 2-4 2-2 4-2-4-4-2 4-2Z" fill="#ffd66b" stroke-width="3"/><path d="M78 76l2 4 4 2-4 2-2 4-2-4-4-2 4-2Z" fill="#ffd66b" stroke-width="3"/>' },
  /* Blood price: a heart run through with a dagger, blood dripping from the wound */
  selfDamage: { fill: '#b3150e', body:
    '<path d="M50 78C34 64 22 52 22 38c0-10 8-16 16-15 6 1 9 5 12 10 3-5 6-9 12-10 8-1 16 5 16 15 0 14-12 26-28 40Z"/>'
    + '<path d="M30 34c0-6 4-9 8-9" fill="none" stroke="#e8605a" stroke-width="3"/>'
    + '<path d="M64 14 40 62" stroke-width="9" stroke="#1a1a1a"/><path d="M64 14 40 62" stroke-width="5" stroke="#f6efdc"/><path d="M52 38 40 62" stroke-width="2" stroke="#c9c2ad"/>'
    + '<path d="M58 8l12 10-4 4-12-10Z" fill="#7a5a20"/><path d="M50 22l12 10" stroke-width="7"/><path d="M50 22l12 10" stroke="#c9a04a" stroke-width="3"/>'
    + '<path d="M40 64c-3 6-3 10 0 12 3-2 3-6 0-12Z" stroke-width="3"/><path d="M58 70c-3 6-3 10 0 12 3-2 3-6 0-12Z" stroke-width="3"/><path d="M46 82c-2 4-2 6 0 8 2-2 2-4 0-8Z" stroke-width="3"/>' },
  /* Devour: open fanged jaws, a tongue in the dark, a string of drool */
  devour: { fill: '#6a2bd9', body:
    '<path d="M18 30c8-12 56-12 64 0l-4 16c-6 4-50 4-56 0Z"/><path d="M24 30c8-6 44-6 52 0" fill="none" stroke="#9a6cf0" stroke-width="3"/>'
    + '<path d="M18 70c8 12 56 12 64 0l-4-16c-6-4-50-4-56 0Z"/>'
    + '<ellipse cx="50" cy="50" rx="27" ry="13" fill="#1a1a1a" stroke="none"/>'
    + '<ellipse cx="50" cy="58" rx="12" ry="5" fill="#d94a4a" stroke-width="3"/>'
    + '<path d="M28 42l4 10 4-10M40 42l4 12 4-12M52 42l4 12 4-12M64 42l4 10 4-10" fill="#f6efdc" stroke-width="4"/>'
    + '<path d="M32 60l4-8 4 8M46 60l4-10 4 10M60 60l4-8 4 8" fill="#f6efdc" stroke-width="4"/>'
    + '<circle cx="34" cy="20" r="3" fill="#1a1a1a" stroke="none"/><circle cx="66" cy="20" r="3" fill="#1a1a1a" stroke="none"/>' },
};

export function SpellGlyph({ kind }: { kind: AutoBattlerSpellKind }) {
  const g = GLYPHS[kind] ?? GLYPHS.discover;
  return <svg className="ab-spell-glyph" viewBox="0 0 100 100" aria-hidden dangerouslySetInnerHTML={{ __html: `<g fill="${g.fill}" stroke="${INK}" stroke-width="5" stroke-linejoin="round" stroke-linecap="round">${g.body}</g>` }} />;
}
