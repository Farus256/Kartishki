import { VfxLayer, rand } from './vfx';

/**
 * "This minion just gained stats": one short sequence on the tile —
 *   pulse: a green/gold ring leaps out of the card's foot, the card lifts and puffs (scale punch);
 *   travel: motes stream from the centre to the attack and health badges;
 *   emphasis: the badges pop and flash; a soft outline holds for a beat;
 *   decay: everything fades within ~700ms, nothing covers the art.
 * A second buff on the same tile restarts cleanly (the previous layer is dropped).
 */
export type BuffKind = 'power' | 'ability' | 'card' | 'debuff';
const running = new WeakMap<HTMLElement, () => void>();
const PALETTE: Record<BuffKind, { ring: string; mote: string; glow: string }> = {
  card: { ring: '#8dff9a', mote: '#dfffe4', glow: '#2e8b57' },
  ability: { ring: '#ffe27a', mote: '#fff6c8', glow: '#c9a04a' },
  power: { ring: '#ffd66b', mote: '#fff3b0', glow: '#e0a32a' },
  debuff: { ring: '#ff6a5a', mote: '#ffd0c8', glow: '#b23a2e' },
};

export function playBuffFx(tile: HTMLElement, kind: BuffKind, opts: { rate?: number; reduced?: boolean } = {}): void {
  const reduced = opts.reduced ?? matchMedia('(prefers-reduced-motion: reduce)').matches;
  const rate = Math.max(.05, opts.rate ?? 1);
  if (rate >= 100) return;
  running.get(tile)?.();
  const card = tile.querySelector<HTMLElement>('.ab-minion') ?? tile;
  const stats = tile.querySelectorAll<HTMLElement>('.ab-minion-stats b, .ab-minion-stats i');
  const pal = PALETTE[kind];
  const ms = (n: number) => n / rate;
  const anims: Animation[] = [];
  const timers: number[] = [];
  const layer = reduced ? undefined : new VfxLayer(tile, { inset: 40, zIndex: 9, className: 'buff-fx' });
  if (layer) { layer.rate = rate; layer.max = 60; }
  const w = tile.offsetWidth || 150, h = tile.offsetHeight || 170, cx = w / 2, cy = h / 2;
  const down = kind === 'debuff';
  // 1. pulse: the card lifts (or sags) with a squash, and a ring leaps from its foot
  anims.push(card.animate(down
    ? [{ transform: 'translateY(0) scale(1)' }, { transform: 'translateY(6px) scale(1.04,.94)', offset: .25 }, { transform: 'translateY(2px) scale(.98,1.02)', offset: .6 }, { transform: 'translateY(0) scale(1)' }]
    : [{ transform: 'translateY(0) scale(1)' }, { transform: 'translateY(-10px) scale(1.09,.96)', offset: .22 }, { transform: 'translateY(-4px) scale(.98,1.03)', offset: .55 }, { transform: 'translateY(0) scale(1)' }],
    { duration: ms(640), easing: 'cubic-bezier(.34,1.56,.64,1)' }));
  anims.push(card.animate([{ boxShadow: `0 0 0 0 ${pal.glow}00` }, { boxShadow: `0 0 0 5px ${pal.glow}cc, 0 0 22px ${pal.ring}88`, offset: .18 }, { boxShadow: `0 0 0 3px ${pal.glow}66, 0 0 12px ${pal.ring}44`, offset: .6 }, { boxShadow: `0 0 0 0 ${pal.glow}00` }], { duration: ms(760), easing: 'ease-out' }));
  if (layer) {
    layer.spawn({ x: cx, y: down ? cy * .5 : h * .92, life: .55, size: 8, size1: w * .62, shape: 'ring', color: pal.ring, alpha: .9, fadeIn: .02, fadeOut: .7, spin: 0 });
    layer.spawn({ x: cx, y: down ? cy * .5 : h * .92, life: .4, size: 12, size1: 30, color: pal.mote, alpha: .8, fadeIn: .05, fadeOut: .8 });
    // 2. travel: motes race from the heart of the card to each stat badge (they carry the colour of the gain)
    const tileBox = tile.getBoundingClientRect();
    const zoom = tileBox.width / (tile.offsetWidth || tileBox.width) || 1;
    stats.forEach((badge, i) => {
      const b = badge.getBoundingClientRect();
      const tx = (b.left + b.width / 2 - tileBox.left) / zoom, ty = (b.top + b.height / 2 - tileBox.top) / zoom;
      const n = 5;
      for (let j = 0; j < n; j++) {
        const life = .28 + j * .04, spread = (j - 2) * 6;
        const vx = (tx - cx) / life, vy = (ty - cy) / life;
        layer.spawn({ x: cx + spread, y: cy - 10 + rand(-6, 6), vx: vx * (down ? -1 : 1) * (down ? .4 : 1), vy: vy * (down ? -1 : 1) * (down ? .4 : 1), life, size: 3.2 - j * .3, size1: 1.2, color: j % 2 ? pal.mote : pal.ring, alpha: 1, fadeIn: .1, fadeOut: .35, seed: i * 10 + j });
      }
      // 3. emphasis: the badge pops when the motes arrive, then a burst of sparkles
      timers.push(window.setTimeout(() => {
        anims.push(badge.animate([{ transform: 'scale(1)', filter: 'brightness(1)' }, { transform: `scale(${down ? .82 : 1.45})`, filter: 'brightness(1.6)', offset: .3 }, { transform: 'scale(.95)', offset: .65 }, { transform: 'scale(1)', filter: 'brightness(1)' }], { duration: ms(420), easing: 'cubic-bezier(.34,1.56,.64,1)' }));
        for (let j = 0; j < 6; j++) { const a = rand(0, Math.PI * 2), sp = rand(40, 110); layer.spawn({ x: tx, y: ty, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 30, ay: 160, drag: 1, life: rand(.3, .5), size: rand(1.4, 2.6), size1: .6, shape: 'spark', color: pal.mote, alpha: 1, fadeIn: .05, fadeOut: .5 }); }
      }, ms(300 + i * 40)));
    });
  } else {
    stats.forEach(badge => anims.push(badge.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.25)', offset: .4 }, { transform: 'scale(1)' }], { duration: ms(360) })));
  }
  const stop = () => { anims.forEach(a => { try { a.cancel(); } catch { /* done */ } }); timers.forEach(clearTimeout); layer?.destroy(); running.delete(tile); };
  timers.push(window.setTimeout(() => { if (running.get(tile) === stop) { layer?.destroy(); running.delete(tile); } }, ms(1100)));
  running.set(tile, stop);
}
