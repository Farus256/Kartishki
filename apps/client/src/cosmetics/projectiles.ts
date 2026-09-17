import { VfxLayer, noise2, pick, rand, rgba } from './vfx';

/**
 * Ranged hits. Some bought styles never close the distance: the striker only winds up (strikeMotion 'cast') and
 * something crosses the gap instead — a lightning bolt, a comet, a breath of frost, a thrown mug, a rune orb, a
 * neon beam, a gust of petals, a blob of ink. `playProjectile` draws that crossing on a canvas over `host` (the
 * combat field or the shop stage), from the striker's centre to the target's, and resolves the moment it lands so
 * the caller can play the impact effect. Coordinates are host-relative and undo the field's CSS scale.
 */
export type RangedKind = 'bolt' | 'comet' | 'breath' | 'mug' | 'orb' | 'beam' | 'gust' | 'blob';

type Pt = { x: number; y: number };
function centre(host: HTMLElement, el: HTMLElement): Pt {
  const hr = host.getBoundingClientRect(), r = el.getBoundingClientRect();
  const scale = hr.width / Math.max(1, host.offsetWidth);
  return { x: (r.left + r.width / 2 - hr.left) / scale, y: (r.top + r.height / 2 - hr.top) / scale };
}
const lerp = (a: number, b: number, u: number) => a + (b - a) * u;

/** Flight time at rate 1 per kind, so the caller can plan the impact. */
export const RANGED_MS: Record<RangedKind, number> = { bolt: 160, comet: 560, breath: 520, mug: 520, orb: 480, beam: 140, gust: 600, blob: 460 };

export function playProjectile(host: HTMLElement, from: HTMLElement, to: HTMLElement, kind: RangedKind, opts: { rate?: number } = {}): Promise<void> & { cancel: () => void } {
  const rate = Math.max(.05, opts.rate ?? 1);
  let done!: () => void;
  const promise = new Promise<void>(resolve => { done = resolve; }) as Promise<void> & { cancel: () => void };
  if (rate >= 100 || matchMedia('(prefers-reduced-motion: reduce)').matches) { queueMicrotask(done); promise.cancel = () => {}; return promise; }
  const layer = new VfxLayer(host, { inset: 0, zIndex: 32, className: 'hfx-projectile' });
  layer.rate = rate; layer.max = 220;
  const a = centre(host, from), b = centre(host, to);
  const dx = b.x - a.x, dy = b.y - a.y, dist = Math.hypot(dx, dy) || 1;
  const nx = -dy / dist, ny = dx / dist; // perpendicular, for arcs and wobble
  // Take off from the striker's edge and land on the target's edge, not centre to centre.
  const r0 = Math.min(from.offsetWidth, from.offsetHeight) * .45, r1 = Math.min(to.offsetWidth, to.offsetHeight) * .4;
  const p0 = { x: a.x + dx / dist * r0, y: a.y + dy / dist * r0 }, p1 = { x: b.x - dx / dist * r1, y: b.y - dy / dist * r1 };
  const total = RANGED_MS[kind] / 1000;
  let landed = false, cancelled = false;
  const land = () => { if (!landed) { landed = true; done(); } };
  const finish = window.setTimeout(() => layer.destroy(), (RANGED_MS[kind] + 700) / rate);
  promise.cancel = () => { cancelled = true; window.clearTimeout(finish); layer.destroy(); land(); };

  const along = (u: number, bulge = 0): Pt => ({ x: lerp(p0.x, p1.x, u) + nx * bulge * Math.sin(u * Math.PI), y: lerp(p0.y, p1.y, u) + ny * bulge * Math.sin(u * Math.PI) });
  let age = 0;
  const off = layer.emitter((dt, t) => {
    if (cancelled) return;
    age += dt;
    const u = Math.min(1, age / total);
    switch (kind) {
      case 'bolt': {
        // A jagged bolt with a branch or two, redrawn every frame for the flicker; it lands at once.
        layer.paint((ctx) => {
          ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
          const n = 9, pts: Pt[] = [];
          for (let i = 0; i <= n; i++) { const v = i / n; const jag = i === 0 || i === n ? 0 : noise2(i * 3.1, t * 60) * 22; pts.push({ x: lerp(p0.x, p1.x, v) + nx * jag, y: lerp(p0.y, p1.y, v) + ny * jag }); }
          const flick = .6 + .4 * Math.abs(Math.sin(t * 70));
          for (const [w, col] of [[14, `rgba(98,216,255,${.3 * flick})`], [5, `rgba(191,243,255,${.9 * flick})`], [2, '#ffffff']] as const) { ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.stroke(); }
          for (let k = 0; k < 2; k++) { const i = 3 + k * 3, p = pts[i]!; ctx.strokeStyle = `rgba(191,243,255,${.7 * flick})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + nx * (k ? -30 : 26) + dx / dist * 18, p.y + ny * (k ? -30 : 26) + dy / dist * 18); ctx.stroke(); }
        });
        if (age < .05) for (let i = 0; i < 2; i++) { const v = rand(0, 1); const p = along(v); layer.spawn({ x: p.x, y: p.y, vx: nx * rand(-80, 80), vy: ny * rand(-80, 80), ay: 200, drag: 1, life: rand(.2, .4), size: rand(1.5, 2.5), size1: .6, shape: 'spark', color: '#ffffff', alpha: 1, fadeIn: .02, fadeOut: .5 }); }
        if (age >= .08) land();
        if (age > .22) off();
        return;
      }
      case 'beam': {
        layer.paint((ctx) => {
          ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
          const fade = age < .06 ? 1 : Math.max(0, 1 - (age - .06) / .3);
          const hum = .8 + .2 * Math.sin(t * 90);
          for (const [w, col] of [[26, `rgba(255,125,233,${.22 * fade * hum})`], [12, `rgba(98,216,255,${.5 * fade})`], [4, `rgba(255,255,255,${.95 * fade})`]] as const) { ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke(); }
        });
        if (age < .12 && Math.random() < .6) { const p = along(rand(.1, .9)); layer.spawn({ x: p.x, y: p.y, vx: nx * rand(-60, 60), vy: ny * rand(-60, 60), drag: 2, life: rand(.2, .35), size: rand(1.4, 2.2), size1: .5, shape: 'spark', color: pick(['#ff7de9', '#9ef0ff', '#ffffff']), alpha: 1, fadeIn: .02, fadeOut: .5 }); }
        if (age >= .06) land();
        if (age > .4) off();
        return;
      }
      case 'comet': {
        const p = along(u, -60);
        layer.paint((ctx) => {
          ctx.globalCompositeOperation = 'lighter';
          const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 22); g.addColorStop(0, '#fffbe6'); g.addColorStop(.3, 'rgba(255,214,107,.9)'); g.addColorStop(.7, 'rgba(255,122,26,.4)'); g.addColorStop(1, 'rgba(255,122,26,0)');
          ctx.fillStyle = g; ctx.fillRect(p.x - 22, p.y - 22, 44, 44);
        });
        for (let i = 0; i < 4; i++) layer.spawn({ x: p.x + rand(-4, 4), y: p.y + rand(-4, 4), vx: -dx / dist * rand(40, 120) + nx * rand(-30, 30), vy: -dy / dist * rand(40, 120) + ny * rand(-30, 30), drag: 1.2, life: rand(.3, .6), size: rand(5, 9), size1: 1, color: pick(['#ffd66b', '#ff9a1f', '#ff5a1a']), alpha: .9, fadeIn: .02, fadeOut: .6 });
        if (Math.random() < .5) layer.spawn({ x: p.x, y: p.y, vx: -dx / dist * 30, vy: -dy / dist * 30, turb: 30, life: rand(.5, .9), size: 8, size1: 22, shape: 'wisp', blend: 'source-over', color: rgba(60, 40, 30, .25), alpha: 1, fadeIn: .1, fadeOut: .5 });
        if (u >= 1) { land(); off(); }
        return;
      }
      case 'blob': {
        const p = along(u, -40);
        layer.paint((ctx) => { ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = '#1a1a1a'; ctx.beginPath(); ctx.ellipse(p.x, p.y, 13, 9 + 4 * Math.sin(t * 20), Math.atan2(dy, dx), 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#3a2f2a'; ctx.beginPath(); ctx.arc(p.x - 4, p.y - 3, 3, 0, Math.PI * 2); ctx.fill(); });
        if (Math.random() < .6) layer.spawn({ x: p.x, y: p.y + 4, vx: -dx / dist * 20, vy: 30, ay: 300, life: rand(.4, .7), size: rand(2, 3.5), size1: 1.4, shape: 'drop', blend: 'source-over', color: '#1a1a1a', alpha: .95, fadeIn: .02, fadeOut: .3 });
        if (u >= 1) { land(); off(); }
        return;
      }
      case 'mug': {
        const p = along(u, -70), spin = u * 9;
        layer.paint((ctx) => {
          // A glass mug tumbling end over end: body, handle, foam head, a little beer inside.
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(spin); ctx.scale(1.6, 1.6); ctx.globalCompositeOperation = 'source-over';
          ctx.fillStyle = 'rgba(226,154,44,.9)'; ctx.fillRect(-9, -6, 18, 18);
          ctx.fillStyle = 'rgba(255,248,230,.95)'; ctx.fillRect(-9, -12, 18, 7);
          ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 2.5; ctx.strokeRect(-9, -12, 18, 24);
          ctx.beginPath(); ctx.arc(11, 1, 6, -Math.PI / 2, Math.PI / 2); ctx.stroke();
          ctx.restore();
        });
        if (Math.random() < .7) layer.spawn({ x: p.x + rand(-6, 6), y: p.y, vx: -dx / dist * rand(10, 40) + nx * rand(-20, 20), vy: rand(-20, 10), ay: 320, life: rand(.4, .7), size: rand(1.8, 3), size1: 1.4, shape: 'drop', blend: 'source-over', color: '#e29a2c', alpha: .95, fadeIn: .02, fadeOut: .3 });
        if (Math.random() < .4) layer.spawn({ x: p.x, y: p.y - 10, vx: nx * rand(-15, 15), vy: rand(-20, -5), life: rand(.4, .6), size: rand(2, 3.5), size1: rand(2, 4), shape: 'bubble', blend: 'source-over', color: 'rgba(255,248,230,.9)', alpha: .9, fadeIn: .05, fadeOut: .4 });
        if (u >= 1) { land(); off(); }
        return;
      }
      case 'orb': {
        const p = along(u, 0); const wob = Math.sin(t * 14) * 8;
        const q = { x: p.x + nx * wob, y: p.y + ny * wob };
        layer.paint((ctx) => {
          ctx.globalCompositeOperation = 'lighter';
          const g = ctx.createRadialGradient(q.x, q.y, 0, q.x, q.y, 20); g.addColorStop(0, '#f7e6ff'); g.addColorStop(.35, 'rgba(199,125,255,.85)'); g.addColorStop(1, 'rgba(106,43,217,0)');
          ctx.fillStyle = g; ctx.fillRect(q.x - 20, q.y - 20, 40, 40);
          ctx.strokeStyle = 'rgba(247,230,255,.8)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(q.x, q.y, 16, 6, t * 4, 0, Math.PI * 2); ctx.stroke();
        });
        if (Math.random() < .8) layer.spawn({ x: q.x, y: q.y, vx: -dx / dist * rand(20, 60), vy: -dy / dist * rand(20, 60), drag: 1.5, life: rand(.4, .7), size: rand(4, 7), size1: 2, shape: 'rune', color: '#dff4ff', alpha: .9, fadeIn: .05, fadeOut: .5, seed: rand(0, 6), rot: rand(0, 6), spin: rand(-3, 3) });
        if (u >= 1) { land(); off(); }
        return;
      }
      case 'breath': {
        // A cone of frost streaming from the striker; the target is reached a third of the way through and keeps taking it.
        for (let i = 0; i < 5; i++) { const spread = rand(-.3, .3); layer.spawn({ x: p0.x + nx * rand(-8, 8), y: p0.y + ny * rand(-8, 8), vx: (dx / dist + nx * spread) * rand(260, 420), vy: (dy / dist + ny * spread) * rand(260, 420), drag: .9, turb: 40, life: rand(.35, .6), size: rand(3, 7), size1: rand(6, 12), shape: Math.random() < .3 ? 'flake' : 'glow', color: pick(['#ffffff', '#bff3ff', '#dff4ff']), alpha: .85, fadeIn: .05, fadeOut: .5, rot: rand(0, 6), spin: rand(-4, 4) }); }
        if (Math.random() < .8) layer.spawn({ x: p0.x, y: p0.y, vx: dx / dist * rand(180, 300), vy: dy / dist * rand(180, 300), drag: 1, turb: 30, life: rand(.5, .8), size: 10, size1: 30, shape: 'wisp', blend: 'source-over', color: rgba(220, 244, 255, .28), alpha: 1, fadeIn: .1, fadeOut: .5 });
        if (u >= .35) land();
        if (u >= 1) off();
        return;
      }
      case 'gust': {
        for (let i = 0; i < 3; i++) { const p = along(Math.min(1, u + rand(-.1, .05)), nx ? 30 * Math.sin(t * 6 + i) : 0); layer.spawn({ x: p.x, y: p.y, vx: dx / dist * rand(60, 140) + nx * rand(-50, 50), vy: dy / dist * rand(60, 140) + ny * rand(-50, 50), drag: 1.2, turb: 60, life: rand(.5, .9), size: rand(4, 7), size1: rand(4, 7), shape: 'drop', blend: 'source-over', color: pick(['#ffb3d9', '#ffd1e8', '#ff8fc4']), alpha: .95, fadeIn: .05, fadeOut: .4, rot: rand(0, 6), spin: rand(-6, 6) }); }
        if (u >= .9) land();
        if (u >= 1) off();
        return;
      }
    }
  });
  return promise;
}
