import { VfxLayer, edgeWeight, noise2, pick, rand, rgba } from './vfx';

/**
 * Portrait auras and board ambience as procedural emitters on a VfxLayer. Each one has its own
 * motion profile (spawn region, lifetime, size curve, turbulence, blend) — no shared preset.
 * `mountAura(host, id)` / `mountBoardAmbience(host, id)` return a dispose function.
 */
const REDUCED = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

type Aura = (layer: VfxLayer, w: number, h: number) => void;
const AURAS: Record<string, Aura> = {
  /* Embers: motes born along the bottom rim, rising and wobbling, cooling from yellow to red; a warm floor glow breathes. */
  'aura-embers': (layer, w, h) => {
    let acc = 0;
    layer.emitter((dt, t) => {
      acc += dt * (REDUCED() ? 4 : 14);
      while (acc >= 1) {
        acc -= 1;
        const hot = Math.random() < .3;
        layer.spawn({ x: rand(-10, w + 10), y: rand(h * .55, h + 12), vx: rand(-8, 8), vy: rand(-26, -14), ay: -18, turb: 90, drag: .3,
          life: rand(1.4, 2.6), size: rand(3, 6) * (hot ? 1.5 : 1), size1: 1, color: hot ? '#fff1a8' : pick(['#ff9a1f', '#ff6a1a', '#ffb347']), alpha: rand(.6, 1), fadeIn: .12, fadeOut: .5 });
      }
      layer.paint((ctx, W, H) => {
        const g = ctx.createRadialGradient(W / 2, H * .92, 4, W / 2, H * .92, W * .6);
        const pulse = .55 + .25 * Math.sin(t * 2.1) + .1 * noise2(t * 3, 7);
        g.addColorStop(0, `rgba(255,120,30,${.55 * pulse})`); g.addColorStop(.6, `rgba(255,60,20,${.18 * pulse})`); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      });
    });
  },
  /* Smoke: layered wisps — big slow background plumes behind the rim, thinner foreground curls that cross the
     face at low alpha, both steered by value noise so no two paths repeat; alpha thins toward the centre. */
  'aura-smoke': (layer, w, h) => {
    const weight = edgeWeight(layer, .32);
    let acc = 0;
    layer.emitter(dt => {
      acc += dt * (REDUCED() ? 2.5 : 9.5);
      while (acc >= 1) {
        acc -= 1;
        const fore = Math.random() < .35;
        const side = Math.random() < .5 ? -1 : 1;
        const grey = fore ? rand(150, 190) : rand(95, 130);
        layer.spawn({
          x: w / 2 + side * rand(w * .2, w * .55), y: rand(h * .5, h + 20),
          vx: -side * rand(4, 14), vy: rand(-22, -10), ay: -4, turb: fore ? 70 : 40, drag: .25,
          life: fore ? rand(2.6, 4) : rand(3.5, 5.5), size: fore ? rand(18, 28) : rand(34, 50), size1: fore ? rand(44, 64) : rand(84, 120),
          rot: rand(0, 6.3), spin: rand(-.35, .35), shape: 'wisp', blend: 'source-over',
          color: rgba(grey + 20, grey + 14, grey + 8, fore ? .17 : .27), alpha: 1, fadeIn: .25, fadeOut: .45, weight,
        });
      }
    });
  },
  /* Sparks: short white-gold pops that jump off random points of the rim and fall, with a faint after-glow. */
  'aura-sparks': (layer, w, h) => {
    let next = 0;
    layer.emitter((_dt, t) => {
      if (t < next) return;
      next = t + rand(.07, .3) * (REDUCED() ? 3 : 1);
      const a = rand(0, Math.PI * 2), rx = w * .52, ry = h * .52;
      const x = w / 2 + Math.cos(a) * rx, y = h / 2 + Math.sin(a) * ry;
      const n = 1 + Math.floor(rand(0, 3));
      for (let i = 0; i < n; i++) {
        const dir = a + rand(-.7, .7), sp = rand(60, 160);
        layer.spawn({ x, y, vx: Math.cos(dir) * sp, vy: Math.sin(dir) * sp - 40, ay: 260, drag: .8, life: rand(.3, .6), size: rand(2.2, 3.6), size1: 1, shape: 'spark', color: pick(['#fff6d6', '#ffd66b', '#ffb347']), alpha: 1, fadeIn: .05, fadeOut: .5 });
      }
      layer.spawn({ x, y, life: .4, size: 16, size1: 26, color: '#ffd66b', alpha: .85, fadeIn: .1, fadeOut: .8 });
    });
  },
  /* Frost: tiny crystals drifting down and outward from the top of the rim, catching light as they turn; a cold breath curls up. */
  'aura-frost': (layer, w, h) => {
    let acc = 0;
    layer.emitter(dt => {
      acc += dt * (REDUCED() ? 2 : 9);
      while (acc >= 1) {
        acc -= 1;
        const crystal = Math.random() < .45;
        layer.spawn({ x: rand(-6, w + 6), y: rand(-16, h * .45), vx: rand(-9, 9), vy: rand(6, 18), ay: 6, turb: 30, drag: .2,
          life: rand(1.6, 3), size: crystal ? rand(3, 6) : rand(5, 10), size1: crystal ? rand(3, 6) : 1.5, rot: rand(0, 6), spin: rand(-1.5, 1.5),
          shape: crystal ? 'flake' : 'glow', color: crystal ? '#eaffff' : '#bff3ff', alpha: crystal ? .9 : .55, fadeIn: .2, fadeOut: .4 });
      }
      if (Math.random() < dt * 2) layer.spawn({ x: w / 2 + rand(-w * .3, w * .3), y: -4, vx: rand(-6, 6), vy: rand(-14, -8), turb: 40, life: rand(1.8, 2.6), size: 22, size1: 48, shape: 'wisp', blend: 'source-over', color: rgba(220, 244, 255, .22), alpha: 1, fadeIn: .3, fadeOut: .5 });
    });
  },
  /* Fireflies: two depths of light — big near ones that drift slowly and leave a faint trail as they brighten,
     small far ones twinkling in the hedge behind the frame. Each has its own blink rhythm and a lazy noise-driven path. */
  'aura-fireflies': (layer, w, h) => {
    let acc = 0;
    const blink = (p: { age: number; seed: number }, speed: number) => .22 + .78 * Math.max(0, Math.sin(p.age * speed + p.seed)) ** 1.6;
    layer.emitter(dt => {
      acc += dt * (REDUCED() ? 2 : 5);
      while (acc >= 1) {
        acc -= 1;
        const near = Math.random() < .5;
        const a = rand(0, Math.PI * 2), r = near ? rand(.55, .8) : rand(.45, .95);
        const x = w / 2 + Math.cos(a) * w * r, y = h / 2 + Math.sin(a) * h * r;
        const speed = near ? rand(1.6, 2.4) : rand(2.6, 4);
        layer.spawn({ x, y, vx: rand(-8, 8), vy: rand(-8, 8), turb: near ? 45 : 70, drag: .7, life: near ? rand(5, 8) : rand(3, 5), size: near ? rand(4.5, 6.5) : rand(2, 3.2), size1: near ? 4 : 1.6, color: near ? '#d8ff9a' : pick(['#9dff7a', '#eaffb0']), alpha: near ? 1 : .7, fadeIn: .25, fadeOut: .3, seed: rand(0, 6.3), weight: p => blink(p, speed) });
        if (near) layer.spawn({ x, y, vx: rand(-8, 8), vy: rand(-8, 8), turb: 45, drag: .7, life: rand(5, 8), size: 14, size1: 12, color: '#7ee081', alpha: .35, fadeIn: .25, fadeOut: .3, seed: rand(0, 6.3), weight: p => blink(p, speed) });
      }
      if (Math.random() < dt * 6) { const a = rand(0, 6.3), r = rand(.5, .85); layer.spawn({ x: w / 2 + Math.cos(a) * w * r, y: h / 2 + Math.sin(a) * h * r, vx: rand(-30, 30), vy: rand(-30, 30), drag: 2.5, life: rand(.4, .7), size: 1.6, size1: .8, shape: 'spark', color: '#eaffb0', alpha: .8, fadeIn: .1, fadeOut: .6 }); }
    });
  },
  /* Shadow: ink-dark tendrils climb from below and curl over the frame; a violet ember or two glints inside them. */
  'aura-shadow': (layer, w, h) => {
    const weight = edgeWeight(layer, .3);
    let acc = 0;
    layer.emitter(dt => {
      acc += dt * (REDUCED() ? 2 : 8);
      while (acc >= 1) {
        acc -= 1;
        const side = Math.random() < .5 ? -1 : 1;
        layer.spawn({ x: w / 2 + side * rand(w * .1, w * .55), y: rand(h * .6, h + 10), vx: -side * rand(2, 10), vy: rand(-30, -14), ay: -6, turb: 110, drag: .3, life: rand(2, 3.6), size: rand(14, 24), size1: rand(34, 52), rot: rand(0, 6), spin: rand(-.6, .6), shape: 'wisp', blend: 'source-over', color: rgba(28, 14, 42, .42), alpha: 1, fadeIn: .2, fadeOut: .5, weight });
        if (Math.random() < .25) layer.spawn({ x: w / 2 + side * rand(0, w * .5), y: rand(h * .5, h), vx: rand(-6, 6), vy: rand(-24, -10), turb: 60, life: rand(1, 1.8), size: rand(2, 3.4), size1: 1, color: '#c77dff', alpha: .9, fadeIn: .2, fadeOut: .5 });
      }
    });
  },
  /* Halo: golden motes sift down from the ring and a slow shimmer of light rays pulses above the head. */
  'aura-halo': (layer, w, h) => {
    let acc = 0;
    layer.emitter((dt, t) => {
      acc += dt * (REDUCED() ? 2 : 7);
      while (acc >= 1) {
        acc -= 1;
        layer.spawn({ x: w / 2 + rand(-w * .3, w * .3), y: rand(-26, -14), vx: rand(-4, 4), vy: rand(8, 20), turb: 14, life: rand(1.4, 2.4), size: rand(2.6, 4.4), size1: 1, color: pick(['#fff3b0', '#ffd76a']), alpha: rand(.6, 1), fadeIn: .2, fadeOut: .5 });
      }
      layer.paint((ctx, W, H) => {
        ctx.globalCompositeOperation = 'lighter';
        const cx = W / 2, top = layer.inset - 22;
        for (let i = 0; i < 5; i++) {
          const a = Math.PI / 2 + (i - 2) * .32 + Math.sin(t * .7 + i) * .05;
          const len = H * .5 * (.7 + .3 * Math.sin(t * 1.3 + i * 1.7));
          const g = ctx.createLinearGradient(cx, top, cx + Math.cos(a) * len, top + Math.sin(a) * len);
          g.addColorStop(0, `rgba(255,215,106,${.32 + .12 * Math.sin(t * 2 + i)})`); g.addColorStop(1, 'rgba(255,215,106,0)');
          ctx.strokeStyle = g; ctx.lineWidth = 16; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(cx, top); ctx.lineTo(cx + Math.cos(a) * len, top + Math.sin(a) * len); ctx.stroke();
        }
      });
    });
  },
};

/** Attach a procedural aura to a hero portrait (or the shop preview of one). */
export function mountAura(host: HTMLElement, id: string): () => void {
  const aura = AURAS[id];
  if (!aura) return () => {};
  const layer = new VfxLayer(host, { inset: 96, zIndex: 5, className: 'ab-aura-layer' });
  aura(layer, host.offsetWidth, host.offsetHeight);
  layer.warm(3);
  return () => layer.destroy();
}

/* Frames with their own motion: flames licking the rim, arcs jumping across it, molten gold running around it. */
const FRAME_FX: Record<string, Aura> = {
  'skin-fire': (layer, w, h) => {
    let acc = 0;
    layer.emitter((dt, t) => {
      acc += dt * (REDUCED() ? 8 : 36);
      while (acc >= 1) {
        acc -= 1;
        // Born on the rim (elliptical ring), rising fast and dying as they cool: tongues of flame all the way round.
        const a = rand(0, Math.PI * 2), x = w / 2 + Math.cos(a) * w * .5, y = h / 2 + Math.sin(a) * h * .5;
        layer.spawn({ x, y, vx: Math.cos(a) * rand(4, 14), vy: rand(-46, -22), ay: -30, turb: 120, drag: .6, life: rand(.45, .9), size: rand(8, 15), size1: 2, color: pick(['#fff1a8', '#ffb347', '#ff7a1a', '#ff3b1a']), alpha: rand(.7, 1), fadeIn: .1, fadeOut: .55 });
      }
      layer.paint((ctx, W, H) => { ctx.globalCompositeOperation = 'lighter'; const p = .75 + .25 * noise2(t * 5, 11); const g = ctx.createRadialGradient(W / 2, H * .72, W * .2, W / 2, H * .72, W * .62); g.addColorStop(0, 'rgba(255,90,20,0)'); g.addColorStop(.7, `rgba(255,110,30,${.22 * p})`); g.addColorStop(1, 'rgba(255,60,20,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); });
    });
  },
  'skin-electric': (layer, w, h) => {
    let next = 0;
    layer.emitter((_dt, t) => {
      if (t < next) return;
      next = t + rand(.08, .35) * (REDUCED() ? 3 : 1);
      // An arc: a jagged polyline hugging the rim between two random angles, drawn for a few frames, plus sparks at its ends.
      const a0 = rand(0, Math.PI * 2), span = rand(.5, 1.6), n = 5 + Math.floor(rand(0, 5));
      const pts = Array.from({ length: n }, (_, i) => { const a = a0 + span * i / (n - 1), r = 1 + rand(-.06, .08); return [w / 2 + Math.cos(a) * w * .52 * r, h / 2 + Math.sin(a) * h * .52 * r] as const; });
      const born = t;
      const life = rand(.08, .16);
      const draw = (ctx: CanvasRenderingContext2D) => { ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; for (const [wd, col] of [[6, 'rgba(98,216,255,.35)'], [2.2, '#ffffff']] as const) { ctx.strokeStyle = col; ctx.lineWidth = wd; ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x + layer.inset, y + layer.inset) : ctx.moveTo(x + layer.inset, y + layer.inset)); ctx.stroke(); } };
      const paintArc = (_dt2: number, t2: number) => { if (t2 - born < life) layer.paint(draw); else off(); };
      const off = layer.emitter(paintArc);
      for (const [x, y] of [pts[0]!, pts[n - 1]!]) for (let i = 0; i < 3; i++) { const d = rand(0, 6.3), sp = rand(40, 120); layer.spawn({ x, y, vx: Math.cos(d) * sp, vy: Math.sin(d) * sp, ay: 200, drag: 1, life: rand(.2, .4), size: rand(1.4, 2.4), size1: .6, shape: 'spark', color: pick(['#ffffff', '#9ef0ff']), alpha: 1, fadeIn: .02, fadeOut: .5 }); }
    });
  },
  'skin-liquid-gold': (layer, w, h) => {
    layer.emitter((dt, t) => {
      // Two molten beads chase each other round the rim, trailing a soft glow; drips let go at the bottom.
      layer.paint((ctx, W, H) => {
        ctx.globalCompositeOperation = 'lighter';
        for (let k = 0; k < 2; k++) { const a = t * .9 + k * Math.PI; const x = W / 2 + Math.cos(a) * w * .5, y = H / 2 + Math.sin(a) * h * .5; const g = ctx.createRadialGradient(x, y, 0, x, y, 20); g.addColorStop(0, 'rgba(255,250,220,.95)'); g.addColorStop(.35, 'rgba(255,214,107,.5)'); g.addColorStop(1, 'rgba(255,180,60,0)'); ctx.fillStyle = g; ctx.fillRect(x - 20, y - 20, 40, 40); }
      });
      if (Math.random() < dt * 1.4) layer.spawn({ x: w / 2 + rand(-w * .3, w * .3), y: h + 2, vx: 0, vy: rand(10, 20), ay: 60, life: rand(.6, 1), size: rand(2.5, 4), size1: 1.5, shape: 'drop', blend: 'source-over', color: '#f2cf6a', alpha: .95, fadeIn: .1, fadeOut: .4 });
    });
  },
};
export function mountFrameFx(host: HTMLElement, id: string): () => void {
  const fx = FRAME_FX[id];
  if (!fx) return () => {};
  const layer = new VfxLayer(host, { inset: 40, zIndex: 4, className: 'ab-frame-layer' });
  layer.max = 160;
  fx(layer, host.offsetWidth, host.offsetHeight);
  layer.warm(1.5);
  return () => layer.destroy();
}

type Ambience = (layer: VfxLayer, w: number, h: number) => void;
/** Motion lives on the table's rim; the centre only ever sees the faintest drift so cards stay readable. */
const rim = (w: number, h: number, band = .18) => {
  const side = Math.floor(rand(0, 4));
  const bw = w * band, bh = h * band;
  if (side === 0) return { x: rand(0, w), y: rand(0, bh) };
  if (side === 1) return { x: rand(0, w), y: rand(h - bh, h) };
  if (side === 2) return { x: rand(0, bw), y: rand(0, h) };
  return { x: rand(w - bw, w), y: rand(0, h) };
};
const AMBIENCE: Record<string, Ambience> = {
  /* Crimson velvet: candle-lit lounge — golden dust in slow air, warm light breathing in the upper corners. */
  crimson: (layer, w, h) => {
    let acc = 0;
    layer.emitter((dt, t) => {
      acc += dt * (REDUCED() ? 3 : 12);
      while (acc >= 1) {
        acc -= 1;
        const center = Math.random() < .15;
        const at = center ? { x: rand(0, w), y: rand(0, h) } : rim(w, h, .22);
        layer.spawn({ ...at, vx: rand(-6, 6), vy: rand(-9, -2), turb: 16, drag: .1, life: rand(4, 8), size: rand(1.6, 3.2), size1: rand(1.6, 3.2), color: '#ffd98a', alpha: center ? .22 : rand(.4, .75), fadeIn: .3, fadeOut: .3 });
      }
      layer.paint((ctx, W, H) => {
        ctx.globalCompositeOperation = 'lighter';
        for (const [cx, seed] of [[W * .06, 1], [W * .94, 5]] as const) {
          const flick = .7 + .3 * noise2(t * 9, seed) + .1 * Math.sin(t * 21 + seed);
          const g = ctx.createRadialGradient(cx, H * .12, 6, cx, H * .12, W * .22);
          g.addColorStop(0, `rgba(255,170,70,${.3 * flick})`); g.addColorStop(1, 'rgba(255,120,40,0)');
          ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        }
      });
    });
  },
  /* Night shift: fireflies blinking on wandering paths, cold fog creeping along the lower edge. */
  night: (layer, w, h) => {
    let acc = 0, fog = 0;
    layer.emitter(dt => {
      acc += dt * (REDUCED() ? 1 : 3);
      while (acc >= 1) {
        acc -= 1;
        const at = rim(w, h, .26);
        layer.spawn({ ...at, vx: rand(-14, 14), vy: rand(-10, 10), turb: 60, drag: .5, life: rand(3, 6), size: rand(3.5, 5.5), size1: 2, color: pick(['#c9ff9a', '#9ef0ff']), alpha: rand(.55, .95), fadeIn: .35, fadeOut: .35,
          weight: p => .35 + .65 * Math.max(0, Math.sin(p.age * rand(2.5, 3.5) + p.seed)) });
      }
      fog += dt * (REDUCED() ? .5 : 1.8);
      while (fog >= 1) {
        fog -= 1;
        layer.spawn({ x: rand(-40, w + 40), y: rand(h * .78, h + 10), vx: rand(-12, 12), vy: rand(-6, -2), life: rand(7, 11), turb: 30, size: rand(40, 70), size1: rand(90, 130), shape: 'wisp', blend: 'source-over', color: rgba(160, 185, 220, .09), alpha: 1, fadeIn: .3, fadeOut: .4 });
      }
    });
  },
  /* Ice cellar: fine snow sifting down along the rim, an occasional flake crossing the table, breath-cold haze at the top. */
  ice: (layer, w, h) => {
    let acc = 0;
    layer.emitter(dt => {
      acc += dt * (REDUCED() ? 4 : 16);
      while (acc >= 1) {
        acc -= 1;
        const center = Math.random() < .12;
        const x = center ? rand(0, w) : (Math.random() < .5 ? rand(0, w * .2) : rand(w * .8, w));
        layer.spawn({ x, y: rand(-20, h * .1), vx: rand(-8, 8), vy: rand(14, 32), turb: 22, drag: .1, life: rand(5, 9), size: rand(1.8, 3.6), size1: rand(1.8, 3.6), shape: Math.random() < .3 ? 'flake' : 'glow', color: '#f2fbff', alpha: center ? .3 : rand(.6, 1), fadeIn: .2, fadeOut: .25, rot: rand(0, 6), spin: rand(-.8, .8) });
      }
      if (Math.random() < dt * .5) layer.spawn({ x: rand(0, w), y: rand(-10, h * .12), vx: rand(-10, 10), vy: rand(2, 6), turb: 12, life: rand(6, 9), size: rand(50, 80), size1: rand(110, 150), shape: 'wisp', blend: 'source-over', color: rgba(225, 245, 255, .1), alpha: 1, fadeIn: .35, fadeOut: .4 });
    });
  },
  /* Tavern: candle flames flickering at the four corners, warm dust, a curl of candle smoke now and then. */
  tavern: (layer, w, h) => {
    let acc = 0;
    const candles = [[.05, .1], [.95, .1], [.05, .9], [.95, .9]] as const;
    layer.emitter((dt, t) => {
      acc += dt * (REDUCED() ? 2 : 8);
      while (acc >= 1) { acc -= 1; layer.spawn({ ...rim(w, h, .2), vx: rand(-5, 5), vy: rand(-8, -2), turb: 14, life: rand(4, 8), size: rand(1.4, 2.8), size1: rand(1.4, 2.8), color: '#ffd98a', alpha: rand(.3, .6), fadeIn: .3, fadeOut: .3 }); }
      candles.forEach(([fx, fy], i) => {
        const flick = .75 + .25 * noise2(t * 11, i * 3) + .08 * Math.sin(t * 27 + i);
        const cx = w * fx, cy = h * fy;
        layer.paint((ctx) => { ctx.globalCompositeOperation = 'lighter'; const g = ctx.createRadialGradient(cx, cy, 4, cx, cy, w * .16 * flick); g.addColorStop(0, `rgba(255,190,90,${.32 * flick})`); g.addColorStop(.5, `rgba(255,120,40,${.1 * flick})`); g.addColorStop(1, 'rgba(255,120,40,0)'); ctx.fillStyle = g; ctx.fillRect(cx - w * .2, cy - w * .2, w * .4, w * .4); });
        if (Math.random() < dt * 1.5) layer.spawn({ x: cx + rand(-3, 3), y: cy - 6, vx: rand(-4, 4), vy: rand(-22, -14), turb: 45, life: rand(1.6, 2.6), size: 5, size1: 18, shape: 'wisp', blend: 'source-over', color: rgba(120, 100, 90, .18), alpha: 1, fadeIn: .2, fadeOut: .5 });
      });
    });
  },
  /* Occult: violet fog rolling low, sigil glow pulsing in slow waves, a stray purple ember. */
  occult: (layer, w, h) => {
    let fog = 0, ember = 0;
    layer.emitter((dt, t) => {
      fog += dt * (REDUCED() ? .6 : 2);
      while (fog >= 1) { fog -= 1; layer.spawn({ ...rim(w, h, .3), vx: rand(-10, 10), vy: rand(-5, 3), turb: 26, life: rand(6, 10), size: rand(40, 70), size1: rand(90, 130), shape: 'wisp', blend: 'source-over', color: rgba(120, 70, 170, .11), alpha: 1, fadeIn: .35, fadeOut: .4 }); }
      ember += dt * (REDUCED() ? .5 : 1.6);
      while (ember >= 1) { ember -= 1; layer.spawn({ ...rim(w, h, .24), vx: rand(-6, 6), vy: rand(-14, -6), turb: 40, life: rand(2, 4), size: rand(1.6, 3), size1: 1, color: pick(['#d9b3ff', '#b98cff']), alpha: rand(.6, 1), fadeIn: .2, fadeOut: .5 }); }
      layer.paint((ctx, W, H) => { ctx.globalCompositeOperation = 'lighter'; const pulse = .5 + .5 * Math.sin(t * .9); const g = ctx.createRadialGradient(W / 2, H / 2, W * .18, W / 2, H / 2, W * .36); g.addColorStop(0, 'rgba(180,120,255,0)'); g.addColorStop(.7, `rgba(180,120,255,${.05 + .07 * pulse})`); g.addColorStop(1, 'rgba(180,120,255,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); });
    });
  },
  /* Arcane: rune rings pulse open along the rim, energy motes drift toward the centre of the lattice. */
  arcane: (layer, w, h) => {
    let next = 0, acc = 0;
    layer.emitter((dt, t) => {
      acc += dt * (REDUCED() ? 2 : 6);
      while (acc >= 1) { acc -= 1; const at = rim(w, h, .24); layer.spawn({ ...at, vx: (w / 2 - at.x) * .04, vy: (h / 2 - at.y) * .04, turb: 24, drag: .2, life: rand(3, 5), size: rand(1.4, 2.6), size1: .6, color: pick(['#9bd7ff', '#dff4ff']), alpha: rand(.5, .9), fadeIn: .3, fadeOut: .4 }); }
      if (t >= next) { next = t + rand(.6, 1.6) * (REDUCED() ? 3 : 1); const at = rim(w, h, .22); for (let i = 0; i < 2; i++) layer.spawn({ ...at, life: 1.4, size: 6, size1: 36 + i * 14, shape: 'ring', color: '#9bd7ff', alpha: .8, fadeIn: .05, fadeOut: .7, rot: rand(0, 6), spin: .6 }); layer.spawn({ ...at, life: .9, size: 14, size1: 30, color: '#dff4ff', alpha: .6, fadeIn: .1, fadeOut: .8 }); }
    });
  },
  /* Workshop floor: welding sparks spit from the rim now and then, steam sighs up from the corners, a lamp blinks. */
  industrial: (layer, w, h) => {
    let next = 0, steam = 0;
    layer.emitter((dt, t) => {
      if (t >= next) { next = t + rand(.4, 1.4) * (REDUCED() ? 3 : 1); const at = rim(w, h, .12); const n = 4 + Math.floor(rand(0, 6)); for (let i = 0; i < n; i++) { const a = rand(-Math.PI, 0), sp = rand(80, 220); layer.spawn({ ...at, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, ay: 380, drag: .5, life: rand(.4, .9), size: rand(1.6, 2.8), size1: .8, shape: 'spark', color: pick(['#fff6d6', '#ffcf6a', '#ff9a3a']), alpha: 1, fadeIn: .03, fadeOut: .4 }); } layer.spawn({ ...at, life: .3, size: 18, size1: 30, color: '#ffd98a', alpha: .9, fadeIn: .05, fadeOut: .8 }); }
      steam += dt * (REDUCED() ? .5 : 1.4);
      while (steam >= 1) { steam -= 1; const left = Math.random() < .5; layer.spawn({ x: left ? rand(0, w * .12) : rand(w * .88, w), y: rand(h * .8, h), vx: rand(-6, 6), vy: rand(-26, -14), turb: 30, life: rand(3, 5), size: rand(20, 36), size1: rand(60, 90), shape: 'wisp', blend: 'source-over', color: rgba(210, 215, 220, .14), alpha: 1, fadeIn: .3, fadeOut: .45 }); }
      layer.paint((ctx, W, H) => { ctx.globalCompositeOperation = 'lighter'; const on = Math.sin(t * 2.4) > .2 ? 1 : .15; const g = ctx.createRadialGradient(W * .5, H * .02, 2, W * .5, H * .02, W * .12); g.addColorStop(0, `rgba(255,80,60,${.35 * on})`); g.addColorStop(1, 'rgba(255,80,60,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H * .25); });
    });
  },
  /* Neon alley: the sign hums and flickers in magenta/cyan along the top edge, wet haze drifts through, reflections shimmer at the bottom. */
  neon: (layer, w, h) => {
    let haze = 0;
    layer.emitter((dt, t) => {
      haze += dt * (REDUCED() ? .5 : 1.6);
      while (haze >= 1) { haze -= 1; layer.spawn({ ...rim(w, h, .28), vx: rand(-14, 14), vy: rand(-4, 4), turb: 20, life: rand(5, 9), size: rand(40, 70), size1: rand(80, 120), shape: 'wisp', blend: 'source-over', color: Math.random() < .5 ? rgba(255, 125, 233, .07) : rgba(98, 216, 255, .07), alpha: 1, fadeIn: .35, fadeOut: .4 }); }
      layer.paint((ctx, W, H) => {
        ctx.globalCompositeOperation = 'lighter';
        const flick = Math.random() < .03 ? .25 : .85 + .15 * noise2(t * 6, 2);
        const top = ctx.createLinearGradient(0, 0, 0, H * .22); top.addColorStop(0, `rgba(255,125,233,${.22 * flick})`); top.addColorStop(1, 'rgba(255,125,233,0)'); ctx.fillStyle = top; ctx.fillRect(0, 0, W, H * .22);
        const bottom = ctx.createLinearGradient(0, H, 0, H * .8); bottom.addColorStop(0, `rgba(98,216,255,${.16 * flick})`); bottom.addColorStop(1, 'rgba(98,216,255,0)'); ctx.fillStyle = bottom; ctx.fillRect(0, H * .8, W, H * .2);
        for (let i = 0; i < 3; i++) { const x = W * (.2 + .3 * i) + Math.sin(t * .8 + i) * 20; const g = ctx.createLinearGradient(x, H * .78, x, H); g.addColorStop(0, 'rgba(255,125,233,0)'); g.addColorStop(1, `rgba(255,125,233,${.12 * flick})`); ctx.fillStyle = g; ctx.fillRect(x - 6, H * .78, 12, H * .22); }
      });
    });
  },
  /* Rain on the window: streaks run down the top and sides, glass sweat beads, and once in a while lightning throws the room white. */
  rain: (layer, w, h) => {
    let acc = 0, flash = 0, next = rand(4, 9);
    layer.emitter((dt, t) => {
      acc += dt * (REDUCED() ? 6 : 26);
      while (acc >= 1) { acc -= 1; const side = Math.random(); const x = side < .7 ? rand(0, w) : side < .85 ? rand(0, w * .1) : rand(w * .9, w); const y = side < .7 ? rand(-10, h * .16) : rand(0, h); layer.spawn({ x, y, vx: rand(-4, 2), vy: rand(220, 340), life: rand(.35, .7), size: rand(1.2, 2), size1: 1, shape: 'spark', color: '#dff4ffcc', alpha: rand(.35, .7), fadeIn: .1, fadeOut: .3 }); }
      if (Math.random() < dt * 1.2) layer.spawn({ ...rim(w, h, .14), vx: 0, vy: rand(3, 8), turb: 4, life: rand(3, 6), size: rand(1.4, 2.4), size1: rand(2, 3.4), color: '#eaffff', alpha: .5, fadeIn: .4, fadeOut: .3 });
      if (t >= next) { next = t + rand(6, 14); flash = 1; }
      if (flash > 0) { const f = flash; flash = Math.max(0, flash - dt * 4 * (Math.random() < .5 ? 2 : 1)); layer.paint((ctx, W, H) => { ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = `rgba(220,236,255,${.3 * f})`; ctx.fillRect(0, 0, W, H); }); }
    });
  },
  /* Night garden: petals tumble diagonally across the rim, the odd firefly hangs in the hedge. */
  garden: (layer, w, h) => {
    let acc = 0;
    layer.emitter(dt => {
      acc += dt * (REDUCED() ? 1.5 : 5);
      while (acc >= 1) { acc -= 1; const at = Math.random() < .8 ? rim(w, h, .22) : { x: rand(0, w), y: rand(0, h) }; layer.spawn({ ...at, vx: rand(14, 30), vy: rand(6, 16), turb: 40, drag: .1, life: rand(5, 9), size: rand(3, 5), size1: rand(3, 5), rot: rand(0, 6), spin: rand(-1.5, 1.5), shape: 'drop', blend: 'source-over', color: pick(['#ffb3d9', '#ffd1e8', '#ff8fc4']), alpha: at.x > w * .22 && at.x < w * .78 && at.y > h * .22 && at.y < h * .78 ? .35 : .85, fadeIn: .2, fadeOut: .3 }); }
      if (Math.random() < dt * 1.5) layer.spawn({ ...rim(w, h, .18), vx: rand(-8, 8), vy: rand(-6, 6), turb: 50, drag: .5, life: rand(3, 5), size: rand(2.4, 4), size1: 1.5, color: '#c9ff9a', alpha: 1, fadeIn: .3, fadeOut: .3, weight: p => .1 + .9 * Math.max(0, Math.sin(p.age * 2.8 + p.seed)) ** 2 });
    });
  },
  /* Green felt: nothing but the faintest drifting motes — the free tables stay quiet. */
  green: (layer, w, h) => {
    let acc = 0;
    layer.emitter(dt => {
      acc += dt * (REDUCED() ? 0 : 1.2);
      while (acc >= 1) { acc -= 1; layer.spawn({ ...rim(w, h, .16), vx: rand(-4, 4), vy: rand(-5, -1), turb: 10, life: rand(5, 9), size: rand(.8, 1.6), size1: rand(.8, 1.6), color: '#e9dfc9', alpha: rand(.15, .3), fadeIn: .3, fadeOut: .3 }); }
    });
  },
};

export function mountBoardAmbience(host: HTMLElement, id: string): () => void {
  const fx = AMBIENCE[id];
  if (!fx) return () => {};
  const layer = new VfxLayer(host, { inset: 0, zIndex: 1, className: 'ab-ambience-layer' });
  layer.max = 320;
  fx(layer, host.offsetWidth, host.offsetHeight);
  layer.warm(5);
  return () => layer.destroy();
}
