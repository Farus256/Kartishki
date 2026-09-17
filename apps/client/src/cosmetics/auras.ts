import { RUNE_STROKES, VfxLayer, edgeWeight, noise2, pick, rand, rgba } from './vfx';

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
        // Quantised: every distinct colour string becomes a cached sprite canvas, so a float grey would allocate one per particle.
        const grey = Math.round((fore ? rand(150, 190) : rand(95, 130)) / 5) * 5;
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
  /* Halo: light circulates round the ring itself (two beads chasing each other on the CSS halo's ellipse, brightest
     at the front), a warm glow breathes above the head, and golden motes sift down from the ring. No rays over the face. */
  'aura-halo': (layer, w, h) => {
    let acc = 0;
    // The ring the CSS draws: inset -30px, 18%…82% of the width, 22px tall (see cosmetics.css aura-halo).
    const cx = w / 2, cy = -19, rx = w * .32, ry = 11;
    layer.emitter((dt, t) => {
      acc += dt * (REDUCED() ? 2 : 7);
      while (acc >= 1) {
        acc -= 1;
        layer.spawn({ x: cx + rand(-rx, rx), y: rand(-26, -14), vx: rand(-4, 4), vy: rand(8, 20), turb: 14, life: rand(1.4, 2.4), size: rand(2.6, 4.4), size1: 1, color: pick(['#fff3b0', '#ffd76a']), alpha: rand(.6, 1), fadeIn: .2, fadeOut: .5 });
      }
      layer.paint((ctx) => {
        ctx.globalCompositeOperation = 'lighter';
        const ox = layer.inset, oy = layer.inset;
        const breathe = .7 + .3 * Math.sin(t * 1.1);
        const glow = ctx.createRadialGradient(ox + cx, oy + cy + 10, 2, ox + cx, oy + cy + 10, rx * 1.1);
        glow.addColorStop(0, `rgba(255,220,120,${.28 * breathe})`); glow.addColorStop(1, 'rgba(255,200,90,0)');
        ctx.fillStyle = glow; ctx.fillRect(ox + cx - rx * 1.2, oy + cy - 30, rx * 2.4, 70);
        for (let k = 0; k < 2; k++) {
          const a = t * 1.4 * (REDUCED() ? .3 : 1) + k * Math.PI;
          // The front of the ring (sin > 0) is nearer the viewer: the bead there is bigger and brighter.
          const front = .55 + .45 * Math.sin(a);
          const x = ox + cx + Math.cos(a) * rx, y = oy + cy + Math.sin(a) * ry, r = 5 + 6 * front;
          const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2.2);
          g.addColorStop(0, `rgba(255,250,220,${.95 * front})`); g.addColorStop(.3, `rgba(255,215,106,${.55 * front})`); g.addColorStop(1, 'rgba(255,215,106,0)');
          ctx.fillStyle = g; ctx.fillRect(x - r * 2.2, y - r * 2.2, r * 4.4, r * 4.4);
          // …and it leaves a short comet tail along the ring behind it.
          ctx.strokeStyle = `rgba(255,235,160,${.5 * front})`; ctx.lineWidth = 3 * front; ctx.lineCap = 'round'; ctx.beginPath();
          for (let i = 0; i <= 8; i++) { const b = a - i * .11; const px = ox + cx + Math.cos(b) * rx, py = oy + cy + Math.sin(b) * ry; if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); }
          ctx.stroke();
        }
      });
      if (Math.random() < dt * 2.5) { const a = rand(0, 6.3); layer.spawn({ x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry, life: .6, size: 1, size1: 5, shape: 'star', color: '#fff8e6', alpha: .9, fadeIn: .3, fadeOut: .5, rot: rand(0, 1), spin: 1 }); }
    });
  },
  /* Rune orbit (arcane): glyphs circle the frame on two counter-rotating rings at different heights, each one
     fading in, burning brightest as it passes the top, and fading out; every few seconds one flares and pops a ring. */
  'aura-arcane': (layer, w, h) => {
    const rim = rimPath(w, h, 14);
    const glyphs = Array.from({ length: 9 }, (_, i) => ({ t: i / 9, speed: i % 2 ? .05 : -.036, seed: Math.floor(rand(0, 6)), phase: rand(0, 6.3), size: rand(5, 8) }));
    let next = rand(1, 3);
    layer.emitter((dt, t) => {
      layer.paint((ctx) => {
        ctx.globalCompositeOperation = 'lighter';
        for (const g of glyphs) {
          g.t += g.speed * dt * (REDUCED() ? .3 : 1);
          const p = rim(g.t);
          const bright = .35 + .65 * Math.max(0, -p.ny) * (.7 + .3 * Math.sin(t * 2 + g.phase));
          const x = layer.inset + p.x + p.nx * 4, y = layer.inset + p.y + p.ny * 4;
          const halo = ctx.createRadialGradient(x, y, 0, x, y, g.size * 2.6);
          halo.addColorStop(0, `rgba(155,215,255,${.5 * bright})`); halo.addColorStop(1, 'rgba(155,215,255,0)');
          ctx.fillStyle = halo; ctx.fillRect(x - g.size * 3, y - g.size * 3, g.size * 6, g.size * 6);
          ctx.save(); ctx.translate(x, y); ctx.rotate(Math.sin(t * .8 + g.phase) * .3);
          ctx.strokeStyle = `rgba(243,220,255,${.35 + .65 * bright})`; ctx.lineWidth = 1.8; ctx.lineCap = 'round'; ctx.beginPath();
          for (const [x0, y0, x1, y1] of RUNE_STROKES[g.seed % RUNE_STROKES.length]!) { ctx.moveTo(x0 * g.size, y0 * g.size); ctx.lineTo(x1 * g.size, y1 * g.size); }
          ctx.stroke(); ctx.restore();
        }
      });
      if (Math.random() < dt * 3) { const p = rim(rand(0, 1)); layer.spawn({ x: p.x + p.nx * 10, y: p.y + p.ny * 10, vx: -p.nx * 6, vy: -p.ny * 6, turb: 20, life: rand(1.2, 2), size: rand(1.2, 2.2), size1: .5, color: pick(['#9bd7ff', '#dff4ff']), alpha: rand(.5, .9), fadeIn: .3, fadeOut: .4 }); }
      if (t >= next) {
        next = t + rand(2.5, 5) * (REDUCED() ? 3 : 1);
        const g = pick(glyphs), p = rim(g.t);
        layer.spawn({ x: p.x + p.nx * 4, y: p.y + p.ny * 4, life: 1.1, size: 6, size1: 34, shape: 'ring', color: '#c77dff', alpha: .8, fadeIn: .05, fadeOut: .7, spin: .8 });
        layer.spawn({ x: p.x + p.nx * 4, y: p.y + p.ny * 4, life: .7, size: 14, size1: 26, color: '#f3dcff', alpha: .7, fadeIn: .05, fadeOut: .8 });
        for (let i = 0; i < 5; i++) { const a = rand(0, 6.3), sp = rand(30, 70); layer.spawn({ x: p.x + p.nx * 4, y: p.y + p.ny * 4, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: 1.5, life: rand(.6, 1), size: rand(3, 5), size1: 2, shape: 'rune', color: '#dff4ff', alpha: 1, fadeIn: .05, fadeOut: .5, seed: rand(0, 6), rot: rand(0, 6), spin: rand(-2, 2) }); }
      }
    });
  },
  /* Neon haze (neon): magenta and cyan mist rolling round the frame, a tube hum that flickers the whole haze,
     and the odd stray spark when the sign stutters. Colours never mix on the face — the haze is thinnest there. */
  'aura-neon': (layer, w, h) => {
    const weight = edgeWeight(layer, .18);
    let acc = 0, stutter = 0;
    layer.emitter((dt, t) => {
      acc += dt * (REDUCED() ? 2 : 7);
      while (acc >= 1) {
        acc -= 1;
        const a = rand(0, Math.PI * 2), r = rand(.5, .72);
        const pink = Math.random() < .5;
        layer.spawn({ x: w / 2 + Math.cos(a) * w * r, y: h / 2 + Math.sin(a) * h * r, vx: -Math.sin(a) * rand(6, 14), vy: Math.cos(a) * rand(6, 14), turb: 30, drag: .2, life: rand(2.6, 4.2), size: rand(14, 22), size1: rand(30, 44), rot: rand(0, 6.3), spin: rand(-.3, .3), shape: 'wisp', blend: 'source-over', color: pink ? rgba(255, 125, 233, .16) : rgba(98, 216, 255, .16), alpha: 1, fadeIn: .3, fadeOut: .4, weight });
      }
      if (stutter <= 0 && Math.random() < dt * .35) stutter = rand(.08, .22);
      if (stutter > 0) {
        stutter -= dt;
        if (Math.random() < .5) { const a = rand(0, 6.3); layer.spawn({ x: w / 2 + Math.cos(a) * w * .55, y: h / 2 + Math.sin(a) * h * .55, vx: rand(-60, 60), vy: rand(-60, 60), drag: 3, life: rand(.2, .35), size: rand(1.4, 2.4), size1: .6, shape: 'spark', color: pick(['#ffffff', '#ff7de9', '#9ef0ff']), alpha: 1, fadeIn: .02, fadeOut: .5 }); }
      }
      layer.paint((ctx, W, H) => {
        ctx.globalCompositeOperation = 'lighter';
        const hum = stutter > 0 ? .25 : .75 + .25 * noise2(t * 7, 5);
        const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * .3, W / 2, H / 2, Math.min(W, H) * .62);
        g.addColorStop(0, 'rgba(255,125,233,0)'); g.addColorStop(.55, `rgba(255,125,233,${.12 * hum})`); g.addColorStop(.8, `rgba(98,216,255,${.1 * hum})`); g.addColorStop(1, 'rgba(98,216,255,0)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      });
    });
  },
  /* Hops and foam (tavern): beer bubbles rise along the sides and pop at the top rim; hop leaves tumble down slowly
     behind the frame; a foam head clings to the top of the arch and sheds a bubble now and then. */
  'aura-hops': (layer, w, h) => {
    const rim = rimPath(w, h, 6);
    let bub = 0, leaf = 0;
    layer.emitter((dt, t) => {
      bub += dt * (REDUCED() ? 2 : 9);
      while (bub >= 1) {
        bub -= 1;
        const side = Math.random() < .5 ? -1 : 1;
        layer.spawn({ x: w / 2 + side * (w * .5 + rand(2, 14)), y: rand(h * .35, h + 8), vx: side * rand(-2, 4), vy: rand(-30, -16), ay: -10, turb: 24, drag: .15, life: rand(1.2, 2.2), size: rand(1.6, 3.6), size1: rand(2, 4.4), shape: 'bubble', blend: 'source-over', color: 'rgba(255,240,200,.85)', alpha: .9, fadeIn: .2, fadeOut: .25 });
      }
      leaf += dt * (REDUCED() ? .4 : 1.3);
      while (leaf >= 1) {
        leaf -= 1;
        layer.spawn({ x: rand(-10, w + 10), y: -16, vx: rand(-8, 8), vy: rand(10, 18), turb: 40, drag: .1, life: rand(3, 4.5), size: rand(4, 6), size1: rand(4, 6), rot: rand(0, 6.3), spin: rand(-1.4, 1.4), shape: 'leaf', blend: 'source-over', color: pick(['#7ea24a', '#9bbf5a', '#5f8a36']), alpha: .85, fadeIn: .2, fadeOut: .3 });
      }
      layer.paint((ctx) => {
        // Foam head: a row of overlapping soft discs along the top of the arch that wobble very slightly.
        ctx.globalCompositeOperation = 'source-over';
        for (let i = 0; i < 9; i++) {
          const p = rim(.84 + i / 9 * .32);
          const r = 7 + 3 * Math.sin(i * 1.7) + 1.5 * noise2(t * 1.5, i);
          const x = layer.inset + p.x + p.nx * 3, y = layer.inset + p.y + p.ny * 3 + Math.sin(t * 1.2 + i) * .8;
          const g = ctx.createRadialGradient(x - r * .3, y - r * .3, 0, x, y, r);
          g.addColorStop(0, 'rgba(255,252,240,.98)'); g.addColorStop(.7, 'rgba(255,244,214,.9)'); g.addColorStop(1, 'rgba(255,236,200,0)');
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
        }
      });
      if (Math.random() < dt * 1.2) { const p = rim(rand(.84, 1.16)); layer.spawn({ x: p.x + p.nx * 4, y: p.y + p.ny * 4, vx: rand(-4, 4), vy: rand(-22, -12), turb: 16, life: rand(.9, 1.5), size: rand(2, 3.5), size1: rand(2.5, 4), shape: 'bubble', blend: 'source-over', color: 'rgba(255,240,200,.9)', alpha: .9, fadeIn: .1, fadeOut: .3 }); }
    });
  },
};

/** Attach a procedural aura to a hero portrait (or the shop preview of one). */
export function mountAura(host: HTMLElement, id: string, still = false): () => void {
  const aura = AURAS[id];
  if (!aura) return () => {};
  const layer = new VfxLayer(host, { inset: 96, zIndex: 5, className: 'ab-aura-layer' });
  aura(layer, host.offsetWidth, host.offsetHeight);
  if (still) layer.freeze(3); else layer.warm(3);
  return () => layer.destroy();
}

/* ---------------------------------------------------------------------------------------------------------
   Rim geometry. The hero frame is an arch: border-radius 38% 38% 8% 8% (horizontal radii in % of width, vertical
   in % of height). `rimPath` samples that outline, pushed outward by `pad`, and returns a point + outward normal
   for any t ∈ [0,1) by arc length, so flames, arcs and beads sit on the actual frame instead of on a circle.
   --------------------------------------------------------------------------------------------------------- */
type RimPoint = { x: number; y: number; nx: number; ny: number };
function rimPath(w: number, h: number, pad: number): (t: number) => RimPoint {
  const rxT = w * .38 + pad, ryT = h * .38 + pad, rxB = w * .08 + pad, ryB = h * .08 + pad;
  const pts: RimPoint[] = [];
  const arc = (cx: number, cy: number, rx: number, ry: number, a0: number, a1: number) => { for (let i = 0; i <= 12; i++) { const a = a0 + (a1 - a0) * i / 12; pts.push({ x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry, nx: Math.cos(a), ny: Math.sin(a) }); } };
  const line = (x0: number, y0: number, x1: number, y1: number, nx: number, ny: number) => { for (let i = 0; i <= 8; i++) { const u = i / 8; pts.push({ x: x0 + (x1 - x0) * u, y: y0 + (y1 - y0) * u, nx, ny }); } };
  // Clockwise from the top-left corner's end: top edge, top-right arc, right edge, bottom-right, bottom, bottom-left, left, top-left.
  line(rxT - pad, -pad, w - rxT + pad, -pad, 0, -1);
  arc(w - rxT + pad, ryT - pad, rxT, ryT, -Math.PI / 2, 0);
  line(w + pad, ryT - pad, w + pad, h - ryB + pad, 1, 0);
  arc(w - rxB + pad, h - ryB + pad, rxB, ryB, 0, Math.PI / 2);
  line(w - rxB + pad, h + pad, rxB - pad, h + pad, 0, 1);
  arc(rxB - pad, h - ryB + pad, rxB, ryB, Math.PI / 2, Math.PI);
  line(-pad, h - ryB + pad, -pad, ryT - pad, -1, 0);
  arc(rxT - pad, ryT - pad, rxT, ryT, Math.PI, Math.PI * 1.5);
  const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1]! + Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y));
  const total = cum[cum.length - 1]!;
  return t => {
    const d = ((t % 1) + 1) % 1 * total;
    let i = 1; while (i < cum.length - 1 && cum[i]! < d) i++;
    const a = pts[i - 1]!, b = pts[i]!, u = (d - cum[i - 1]!) / Math.max(1e-6, cum[i]! - cum[i - 1]!);
    return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, nx: a.nx + (b.nx - a.nx) * u, ny: a.ny + (b.ny - a.ny) * u };
  };
}

/** The heat-haze filter the fire frame's canvas runs through: turbulence displaces the flames a few px, breathing. */
let heatFilter: SVGSVGElement | undefined;
function ensureHeatFilter() {
  if (heatFilter || typeof document === 'undefined') return;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '0'); svg.setAttribute('height', '0'); svg.setAttribute('aria-hidden', 'true');
  svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
  svg.innerHTML = `<filter id="kartishki-heat" x="-10%" y="-10%" width="120%" height="120%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="0.018 0.05" numOctaves="2" seed="3" result="n"><animate attributeName="baseFrequency" values="0.018 0.05;0.024 0.062;0.016 0.046;0.018 0.05" dur="4.5s" repeatCount="indefinite"/></feTurbulence><feDisplacementMap in="SourceGraphic" in2="n" scale="7" xChannelSelector="R" yChannelSelector="G"/></filter>`;
  document.body.appendChild(svg);
  heatFilter = svg;
}

/**
 * Flame frame. Real fire is not a row of shapes, it is a crowd of soft hot blobs rising, cooling and thinning: this
 * emitter spawns ~150 of them a second along the rim (right side → arch → left side), every blob born as a white-yellow
 * core inside an orange body inside a red skirt, all additive, all steered by noise so the licks split and rejoin.
 * Height and density breathe on a slow gust per side; the bottom edge only smoulders. Embers and soot let go of the
 * tips, a bed of coals glows along the rim, and the canvas wobbles through the heat-haze filter (see #kartishki-heat).
 */
function flameFrame(layer: VfxLayer, w: number, h: number) {
  ensureHeatFilter();
  layer.canvas.dataset.fx = 'skin-fire';
  layer.max = 330;
  const rim = rimPath(w, h, 4);
  const k = Math.max(.6, Math.min(1.5, w / 160));
  // Coals: fixed samples all round the rim, brightest on top; only a dull glow along the bottom edge.
  const bed = Array.from({ length: 56 }, (_, i) => { const p = rim(i / 56); return { p, heat: p.ny < 0 ? 1 : p.ny > .6 ? .3 : .7, seed: rand(0, 50) }; });
  let acc = 0, soot = 0;
  layer.emitter((dt, t) => {
    const gustL = .8 + .35 * noise2(t * .7, 3), gustR = .8 + .35 * noise2(t * .7 + 7, 3);
    acc += dt * (REDUCED() ? 40 : 170);
    while (acc >= 1) {
      acc -= 1;
      // Where along the rim: right side up over the arch to the left side (t .6 → 1.4), denser at the top corners.
      const u = .6 + rand(0, .8) ** 1 * 1;
      const p = rim(u);
      const gust = p.nx < 0 ? gustL : gustR;
      const tall = (.5 + .5 * (noise2(t * 2.2 + u * 9, 5) * .5 + .5)) * gust;
      const life = rand(.45, .8) * (.6 + tall);
      const rise = rand(48, 84) * k * (.7 + tall * .7);
      const x = p.x + p.nx * rand(0, 6) * k, y = p.y + p.ny * 2;
      const vx = p.nx * rand(6, 22) * k, vy = -rise;
      // Skirt (red, big, thin), body (orange), core (white-yellow, small, brief): three lives from one birth.
      const sway = noise2(t * 1.6 + u * 14, 11) * 26 * k;
      layer.spawn({ x, y, vx: vx + sway, vy: vy * .85, ay: -30, turb: 45, drag: .5, life: life * 1.1, size: rand(16, 24) * k, size1: 5 * k, color: '#ff3a12', alpha: .3, fadeIn: .08, fadeOut: .6 });
      layer.spawn({ x, y, vx: vx + sway, vy, ay: -40, turb: 55, drag: .5, life, size: rand(11, 16) * k, size1: 3 * k, color: '#ff8a1f', alpha: .7, fadeIn: .05, fadeOut: .55 });
      if (Math.random() < .6) layer.spawn({ x, y, vx: vx * .8 + sway, vy: vy * 1.05, ay: -50, turb: 40, drag: .5, life: life * .55, size: rand(6, 9) * k, size1: 1.5 * k, color: '#fff3b0', alpha: .95, fadeIn: .03, fadeOut: .5 });
      // The tallest licks shed an ember from the tip.
      if (tall > .85 && Math.random() < .12) layer.spawn({ x, y: y - 20 * k, vx: p.nx * rand(8, 20) + rand(-10, 10), vy: rand(-70, -40), ay: -20, turb: 130, drag: .5, life: rand(.6, 1.2), size: rand(1.8, 3) * k, size1: .7, color: pick(['#fff1a8', '#ffb347', '#ff7a1a']), alpha: 1, fadeIn: .05, fadeOut: .6 });
    }
    // Soot behind the fire, so it reads against a bright wall.
    soot += dt * (REDUCED() ? 1 : 4);
    while (soot >= 1) { soot -= 1; const p = rim(rand(.68, 1.32)); layer.spawn({ x: p.x + p.nx * 10, y: p.y - 18 * k, vx: p.nx * rand(4, 12), vy: rand(-30, -16), ay: -8, turb: 60, drag: .3, life: rand(1.2, 2), size: rand(9, 15) * k, size1: rand(24, 34) * k, shape: 'wisp', blend: 'source-over', color: rgba(40, 24, 18, .28), alpha: 1, fadeIn: .25, fadeOut: .5 }); }
    layer.paint((ctx) => {
      ctx.globalCompositeOperation = 'lighter';
      for (const b of bed) {
        const f = (.55 + .45 * noise2(t * 5, b.seed)) * b.heat;
        const x = layer.inset + b.p.x, y = layer.inset + b.p.y, r = (8 + 5 * f) * k;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, `rgba(255,170,60,${.6 * f})`); g.addColorStop(.5, `rgba(255,80,20,${.25 * f})`); g.addColorStop(1, 'rgba(255,60,20,0)');
        ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
      }
    });
  });
}

/** Jagged lightning that clings to the rim (never across the face), drawn for a few frames each, over a humming charged halo. */
function electricFrame(layer: VfxLayer, w: number, h: number) {
  const rim = rimPath(w, h, 4);
  let next = 0;
  layer.emitter((_dt, t) => {
    layer.paint((ctx) => {
      ctx.globalCompositeOperation = 'lighter';
      const hum = .5 + .3 * noise2(t * 6, 11);
      ctx.strokeStyle = `rgba(98,216,255,${.18 * hum})`; ctx.lineWidth = 10; ctx.lineCap = 'round'; ctx.beginPath();
      for (let i = 0; i <= 48; i++) { const p = rim(i / 48); if (i) ctx.lineTo(layer.inset + p.x, layer.inset + p.y); else ctx.moveTo(layer.inset + p.x, layer.inset + p.y); }
      ctx.closePath(); ctx.stroke();
    });
    if (t < next) return;
    next = t + rand(.08, .35) * (REDUCED() ? 3 : 1);
    // An arc: a jagged polyline riding the rim between two points, offset in and out along the normal, plus sparks at its ends.
    const t0 = rand(0, 1), span = rand(.08, .3), n = 6 + Math.floor(rand(0, 6));
    const pts = Array.from({ length: n }, (_, i) => { const p = rim(t0 + span * i / (n - 1)); const off = i === 0 || i === n - 1 ? 0 : rand(-7, 9); return [p.x + p.nx * off, p.y + p.ny * off] as const; });
    const born = t, life = rand(.1, .22);
    const draw = (ctx: CanvasRenderingContext2D) => { ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; for (const [wd, col] of [[7, 'rgba(98,216,255,.4)'], [3, '#bff3ff'], [1.4, '#ffffff']] as const) { ctx.strokeStyle = col; ctx.lineWidth = wd; ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x + layer.inset, y + layer.inset) : ctx.moveTo(x + layer.inset, y + layer.inset)); ctx.stroke(); } };
    const off = layer.emitter((_dt2, t2) => { if (t2 - born < life) layer.paint(draw); else off(); });
    for (const [x, y] of [pts[0]!, pts[n - 1]!]) for (let i = 0; i < 3; i++) { const d = rand(0, 6.3), sp = rand(40, 130); layer.spawn({ x, y, vx: Math.cos(d) * sp, vy: Math.sin(d) * sp, ay: 220, drag: 1, life: rand(.2, .4), size: rand(1.4, 2.4), size1: .6, shape: 'spark', color: pick(['#ffffff', '#9ef0ff']), alpha: 1, fadeIn: .02, fadeOut: .5 }); }
  });
}

/** Molten gold: a bright tide runs round the rim, beads of it ride the crest, and it drips off the bottom edge. */
function liquidGoldFrame(layer: VfxLayer, w: number, h: number) {
  const rim = rimPath(w, h, 2);
  layer.emitter((dt, t) => {
    layer.paint((ctx) => {
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      // Tide: brightness along the rim is a travelling bump (two, on opposite sides), so the metal looks like it flows.
      // Each crest is one continuous polyline stroked three times (wide/faint → narrow/bright), so it reads as a
      // sheet of light and not as a string of beads.
      const trace = (u0: number, span: number) => { ctx.beginPath(); for (let i = 0; i <= 24; i++) { const p = rim(u0 - span / 2 + span * i / 24); if (i) ctx.lineTo(layer.inset + p.x, layer.inset + p.y); else ctx.moveTo(layer.inset + p.x, layer.inset + p.y); } ctx.stroke(); };
      ctx.strokeStyle = 'rgba(255,230,140,.1)'; ctx.lineWidth = 6; trace(0, 1.04);
      for (let k = 0; k < 2; k++) {
        const u0 = t * .12 + k * .5;
        for (const [wd, a, span] of [[10, .14, .26], [6, .3, .18], [3, .6, .1]] as const) { ctx.strokeStyle = `rgba(255,236,160,${a})`; ctx.lineWidth = wd; trace(u0, span); }
      }
      for (let k = 0; k < 2; k++) {
        const p = rim(t * .12 + k * .5), x = layer.inset + p.x, y = layer.inset + p.y;
        const g = ctx.createRadialGradient(x - 3, y - 3, 0, x, y, 16); g.addColorStop(0, 'rgba(255,252,230,.95)'); g.addColorStop(.35, 'rgba(255,214,107,.55)'); g.addColorStop(1, 'rgba(255,180,60,0)');
        ctx.fillStyle = g; ctx.fillRect(x - 16, y - 16, 32, 32);
      }
    });
    // Drips let go from the bottom edge and stretch as they fall; a sharp glint flashes where the crest passes.
    if (Math.random() < dt * 1.6) { const p = rim(rand(.28, .42)); layer.spawn({ x: p.x, y: p.y, vy: rand(6, 14), ay: 70, life: rand(.7, 1.1), size: rand(2.4, 4), size1: 1.6, shape: 'drop', blend: 'source-over', color: '#f2cf6a', alpha: .95, fadeIn: .1, fadeOut: .35 }); }
    if (Math.random() < dt * 1.2) { const p = rim(t * .12 + (Math.random() < .5 ? 0 : .5) + rand(-.03, .03)); layer.spawn({ x: p.x, y: p.y, life: .45, size: 1, size1: 7, shape: 'star', color: '#fff8e6', alpha: 1, fadeIn: .2, fadeOut: .5, rot: rand(0, 1), spin: 1.5 }); }
  });
}

/** Gold: still metal, but light catches it — small four-point glints wander the rim, one at a time. */
function goldFrame(layer: VfxLayer, w: number, h: number) {
  const rim = rimPath(w, h, 3);
  let next = rand(.4, 1.2);
  layer.emitter((_dt, t) => {
    if (t < next) return;
    next = t + rand(.9, 2.4) * (REDUCED() ? 3 : 1);
    const p = rim(rand(0, 1));
    layer.spawn({ x: p.x, y: p.y, life: .8, size: 1, size1: 9, shape: 'star', color: '#fff8e6', alpha: .95, fadeIn: .25, fadeOut: .55, rot: rand(0, 1), spin: .8 });
    layer.spawn({ x: p.x, y: p.y, life: .8, size: 6, size1: 14, color: '#ffe9a8', alpha: .6, fadeIn: .2, fadeOut: .6 });
  });
}

/** Frost: a snow cap sits on the arch, icicles hang off the bottom edge and drip; frost sparkles wander the rim; cold breath curls up. */
function iceFrame(layer: VfxLayer, w: number, h: number) {
  const rim = rimPath(w, h, 3);
  // Bottom edge runs t ≈ .42–.58 (rimPath goes clockwise from the top edge); the arch is t ≈ .86–1.14.
  const icicles = Array.from({ length: 9 }, (_, i) => { const p = rim(.42 + (i + rand(.2, .8)) / 9 * .16); return { p, len: rand(8, 24), width: rand(3, 6), tip: rand(-.3, .3), phase: rand(0, 6.3) }; });
  const cap = Array.from({ length: 41 }, (_, i) => { const u = .86 + i / 40 * .28; const p = rim(u); return { p, bump: 3 + 5 * (noise2(i * .7, 4) * .5 + .5) * Math.sin(i / 40 * Math.PI) }; });
  let next = 0;
  layer.emitter((dt, t) => {
    layer.paint((ctx) => {
      ctx.globalCompositeOperation = 'source-over';
      // Snow cap: the outline of the arch pushed outward by a bumpy few px, filled white with a blue underside.
      ctx.beginPath();
      cap.forEach(({ p, bump }, i) => { const x = layer.inset + p.x + p.nx * bump, y = layer.inset + p.y + p.ny * bump; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
      for (let i = cap.length - 1; i >= 0; i--) { const { p } = cap[i]!; ctx.lineTo(layer.inset + p.x - p.nx * 2, layer.inset + p.y - p.ny * 2); }
      ctx.closePath();
      const cg = ctx.createLinearGradient(0, layer.inset - 12, 0, layer.inset + 10); cg.addColorStop(0, 'rgba(255,255,255,.98)'); cg.addColorStop(1, 'rgba(190,230,250,.85)');
      ctx.fillStyle = cg; ctx.fill();
      for (const ic of icicles) {
        const grow = .8 + .2 * Math.sin(t * .4 + ic.phase);
        const x = layer.inset + ic.p.x, y = layer.inset + ic.p.y, L = ic.len * grow, W = ic.width;
        const g = ctx.createLinearGradient(x, y, x, y + L); g.addColorStop(0, 'rgba(230,248,255,.95)'); g.addColorStop(.6, 'rgba(190,235,255,.75)'); g.addColorStop(1, 'rgba(160,220,255,.2)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x - W, y); ctx.quadraticCurveTo(x - W * .3, y + L * .6, x + ic.tip, y + L); ctx.quadraticCurveTo(x + W * .3, y + L * .6, x + W, y); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x - W * .45, y + 1); ctx.lineTo(x - W * .1, y + L * .7); ctx.stroke();
      }
    });
    if (Math.random() < dt * .7) { const ic = pick(icicles); layer.spawn({ x: ic.p.x, y: ic.p.y + ic.len, vy: rand(20, 40), ay: 120, life: rand(.5, .8), size: 1.6, size1: 1.2, shape: 'drop', blend: 'source-over', color: '#dff4ff', alpha: .9, fadeIn: .1, fadeOut: .3 }); }
    if (t >= next) { next = t + rand(.4, 1.3) * (REDUCED() ? 3 : 1); const p = rim(rand(0, 1)); layer.spawn({ x: p.x, y: p.y, life: .7, size: 1, size1: 7, shape: 'star', color: '#ffffff', alpha: .95, fadeIn: .25, fadeOut: .5, rot: rand(0, 1), spin: -.6 }); }
    if (Math.random() < dt * 1.5) { const p = rim(rand(.6, 1.4)); layer.spawn({ x: p.x + p.nx * 6, y: p.y, vx: p.nx * rand(2, 8), vy: rand(-16, -8), turb: 30, life: rand(1.4, 2.2), size: 10, size1: 26, shape: 'wisp', blend: 'source-over', color: rgba(220, 244, 255, .18), alpha: 1, fadeIn: .3, fadeOut: .5 }); }
  });
}

/* Frames with their own motion: flames licking the rim, arcs jumping along it, molten gold running round it, ice hanging off it. */
const FRAME_FX: Record<string, Aura> = {
  'skin-fire': flameFrame,
  'skin-electric': electricFrame,
  'skin-liquid-gold': liquidGoldFrame,
  'skin-gold': goldFrame,
  'skin-ice': iceFrame,
  /* Occult: violet candle-smoke curls up both sides of the black rim and a chalk-white spark wanders the tick marks. */
  'skin-occult': (layer, w, h) => {
    const rim = rimPath(w, h, 8);
    let acc = 0, walk = rand(0, 1);
    layer.emitter((dt, t) => {
      acc += dt * (REDUCED() ? 1 : 3.5);
      while (acc >= 1) { acc -= 1; const side = Math.random() < .5 ? -1 : 1; layer.spawn({ x: w / 2 + side * (w * .5 + 6), y: rand(h * .6, h + 6), vx: side * rand(2, 8), vy: rand(-24, -12), ay: -6, turb: 70, drag: .3, life: rand(1.8, 3), size: rand(8, 14), size1: rand(22, 34), rot: rand(0, 6), spin: rand(-.5, .5), shape: 'wisp', blend: 'source-over', color: rgba(110, 60, 170, .22), alpha: 1, fadeIn: .25, fadeOut: .5 }); }
      walk = (walk + dt * .06) % 1;
      const p = rim(walk);
      layer.paint((ctx) => { ctx.globalCompositeOperation = 'lighter'; const x = layer.inset + p.x, y = layer.inset + p.y; const pulse = .6 + .4 * Math.sin(t * 6); const g = ctx.createRadialGradient(x, y, 0, x, y, 9); g.addColorStop(0, `rgba(243,220,255,${.9 * pulse})`); g.addColorStop(.4, `rgba(199,125,255,${.5 * pulse})`); g.addColorStop(1, 'rgba(199,125,255,0)'); ctx.fillStyle = g; ctx.fillRect(x - 9, y - 9, 18, 18); });
      if (Math.random() < dt * 2) layer.spawn({ x: p.x, y: p.y, vx: rand(-8, 8), vy: rand(-8, 8), drag: 2, life: rand(.4, .8), size: rand(1.2, 2), size1: .5, color: '#e6c3ff', alpha: .9, fadeIn: .05, fadeOut: .6 });
    });
  },
};
export function mountFrameFx(host: HTMLElement, id: string, still = false): () => void {
  const fx = FRAME_FX[id];
  if (!fx) return () => {};
  const layer = new VfxLayer(host, { inset: 40, zIndex: 4, className: 'ab-frame-layer' });
  layer.max = 160;
  layer.canvas.dataset.fx = id;
  fx(layer, host.offsetWidth, host.offsetHeight);
  if (still) layer.freeze(1.5); else layer.warm(1.5);
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
  /* Forge: heat shimmer rising off the flagstones at the rim, sparks spitting from the corners when the bellows go, a coal-red glow that breathes under the far edge. */
  forge: (layer, w, h) => {
    let acc = 0, next = 0;
    layer.emitter((dt, t) => {
      acc += dt * (REDUCED() ? 3 : 10);
      while (acc >= 1) { acc -= 1; layer.spawn({ ...rim(w, h, .2), vx: rand(-6, 6), vy: rand(-22, -10), ay: -14, turb: 50, drag: .3, life: rand(1.6, 3), size: rand(1.6, 3), size1: .6, color: pick(['#ffd66b', '#ff9a1f', '#ff5a1a']), alpha: rand(.5, .95), fadeIn: .15, fadeOut: .5 }); }
      if (t >= next) { next = t + rand(1.2, 3.2) * (REDUCED() ? 3 : 1); const corner = { x: Math.random() < .5 ? rand(0, w * .1) : rand(w * .9, w), y: rand(h * .75, h) }; const n = 6 + Math.floor(rand(0, 8)); for (let i = 0; i < n; i++) { const a = rand(-Math.PI * .95, -Math.PI * .05), sp = rand(120, 260); layer.spawn({ ...corner, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, ay: 420, drag: .6, life: rand(.5, 1), size: rand(1.6, 2.8), size1: .8, shape: 'spark', color: pick(['#fff6d6', '#ffcf6a', '#ff7a1a']), alpha: 1, fadeIn: .03, fadeOut: .45 }); } layer.spawn({ ...corner, life: .35, size: 20, size1: 40, color: '#ff9a1f', alpha: .9, fadeIn: .05, fadeOut: .8 }); }
      layer.paint((ctx, W, H) => { ctx.globalCompositeOperation = 'lighter'; const breathe = .6 + .4 * noise2(t * 1.4, 21); const g = ctx.createLinearGradient(0, 0, 0, H * .3); g.addColorStop(0, `rgba(255,90,20,${.22 * breathe})`); g.addColorStop(1, 'rgba(255,90,20,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H * .3); const b = ctx.createLinearGradient(0, H, 0, H * .78); b.addColorStop(0, `rgba(255,120,30,${.16 * breathe})`); b.addColorStop(1, 'rgba(255,120,30,0)'); ctx.fillStyle = b; ctx.fillRect(0, H * .78, W, H * .22); });
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
