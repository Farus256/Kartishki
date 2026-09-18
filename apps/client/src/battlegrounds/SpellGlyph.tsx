import type { AutoBattlerSpellKind } from '@kartishki/shared';

/**
 * Cut-paper glyph for a tavern spell, one per spell kind (the id stays the same in every hand and on every table).
 * Same style as the procedural portraits: flat paper fills, a thick ink line, one accent colour per kind.
 */
const INK = '#1a1a1a';
const GLYPHS: Record<AutoBattlerSpellKind, { fill: string; body: string }> = {
  /* Coin: a stamped coin with a $ */
  coin: { fill: '#ffd66b', body: '<circle cx="50" cy="50" r="30"/><circle cx="50" cy="50" r="22" fill="none"/><text x="50" y="60" font-size="30" font-weight="700" text-anchor="middle" font-family="PT Mono,monospace" fill="#1a1a1a" stroke="none">$</text>' },
  /* Bank: a purse with a drawstring */
  bank: { fill: '#c9a04a', body: '<path d="M30 42c-8 14-8 34 20 34s28-20 20-34Z"/><path d="M36 42c0-10 28-10 28 0" fill="#fff6d2"/><path d="M32 34l6-8M68 34l-6-8M50 30V20" fill="none"/>' },
  /* Free refresh: a circular arrow with a zero */
  freeReroll: { fill: '#8fe38a', body: '<path d="M30 52a20 20 0 1 1 6 14" fill="none"/><path d="M24 40l10 12-14 2z"/><text x="46" y="60" font-size="22" font-weight="700" font-family="PT Mono,monospace" fill="#1a1a1a" stroke="none">0</text>' },
  /* Refresh: the circular arrow with a sparkle */
  refresh: { fill: '#8fe38a', body: '<path d="M30 52a20 20 0 1 1 6 14" fill="none"/><path d="M24 40l10 12-14 2z"/><path d="M56 40l3 7 7 1-5 5 1 7-6-4-6 4 1-7-5-5 7-1Z" fill="#fff6d2"/>' },
  /* Tonic: a corked bottle */
  tonic: { fill: '#d94a4a', body: '<path d="M42 22h16v12l8 10v30H34V44l8-10Z"/><path d="M44 16h12v6H44Z" fill="#c9a04a"/><path d="M40 50h20" fill="none" stroke="#fff6d2"/>' },
  /* Temporary: a frothy mug */
  temp: { fill: '#e29a2c', body: '<path d="M30 34h34v40H30Z"/><path d="M28 28h38v10H28Z" fill="#fff8e6"/><path d="M64 44h8a6 6 0 0 1 0 14h-8" fill="none"/>' },
  /* Keyword: a wax-sealed scroll */
  keyword: { fill: '#f6efdc', body: '<path d="M28 20h44v56H28Z"/><path d="M36 34h28M36 44h28M36 54h16" fill="none"/><circle cx="60" cy="62" r="8" fill="#b3150e"/>' },
  /* Tribe buff: a banner */
  tribeBuff: { fill: '#3f5a9c', body: '<path d="M28 18h44v52l-22-12-22 12Z"/><path d="M50 30l4 9 9 1-7 6 2 9-8-5-8 5 2-9-7-6 9-1Z" fill="#ffd66b"/>' },
  /* Hand buff: a fanned hand of cards */
  handBuff: { fill: '#84afb3', body: '<path d="M26 70l6-34h14l-4 34Z"/><path d="M40 70l4-34h14l-2 34Z" fill="#a9c9cc"/><path d="M56 70l2-34h14v34Z"/>' },
  /* Tavern buff: a counter with three bottles */
  tavernBuff: { fill: '#e8c27a', body: '<path d="M18 52h64v18H18Z"/><path d="M28 30h8v22h-8ZM46 26h8v26h-8ZM64 32h8v20h-8Z" fill="#8fe38a"/>' },
  /* Upgrade: a shield with an arrow */
  upgrade: { fill: '#ffd66b', body: '<path d="M50 14 78 24v22c0 16-12 28-28 34-16-6-28-18-28-34V24Z"/><path d="M50 30l14 16h-8v14H44V46h-8Z" fill="#fff6d2"/>' },
  /* Summon: a bell */
  summon: { fill: '#c9a04a', body: '<path d="M32 60c0-24 8-30 18-32 10 2 18 8 18 32l6 8H26Z"/><path d="M44 70h12v6H44Z"/><circle cx="50" cy="24" r="4"/>' },
  /* Discover: a star on a card */
  discover: { fill: '#f6efdc', body: '<path d="M34 16h32v68H34Z"/><path d="M50 30l5 11 12 1-9 8 3 12-11-6-11 6 3-12-9-8 12-1Z" fill="#ffd66b"/>' },
  /* Blood price: a heart with a dagger through it */
  selfDamage: { fill: '#b3150e', body: '<path d="M50 78C34 64 22 52 22 38c0-10 8-16 16-15 6 1 9 5 12 10 3-5 6-9 12-10 8-1 16 5 16 15 0 14-12 26-28 40Z"/><path d="M64 14 40 62" stroke-width="7" stroke="#f6efdc"/><path d="M64 14 40 62" stroke-width="3" stroke="#1a1a1a"/><path d="M58 12l10 8-4 4-10-8Z" fill="#1a1a1a"/>' },
  /* Devour: open fanged jaws */
  devour: { fill: '#6a2bd9', body: '<path d="M18 30c8-10 56-10 64 0l-4 20c-6 4-50 4-56 0Z"/><path d="M18 70c8 10 56 10 64 0l-4-20c-6-4-50-4-56 0Z"/><path d="M28 50l4 12 4-12M40 50l4 16 4-16M52 50l4 16 4-16M64 50l4 12 4-12" fill="#f6efdc"/><path d="M32 40l3-8 3 8M44 38l3-10 3 10M56 38l3-10 3 10M68 40l3-8 3 8" fill="#f6efdc"/><ellipse cx="50" cy="50" rx="18" ry="6" fill="#1a1a1a" stroke="none"/>' },
};

export function SpellGlyph({ kind }: { kind: AutoBattlerSpellKind }) {
  const g = GLYPHS[kind] ?? GLYPHS.discover;
  return <svg className="ab-spell-glyph" viewBox="0 0 100 100" aria-hidden dangerouslySetInnerHTML={{ __html: `<g fill="${g.fill}" stroke="${INK}" stroke-width="5" stroke-linejoin="round" stroke-linecap="round">${g.body}</g>` }} />;
}
