import { useEffect, useRef } from 'react';
import { VfxLayer, noise2, pick, rand, rgba } from './vfx';

/**
 * The back of a card in one of two shapes: the full rectangular card ('card') and the oval minion token
 * that stands on the Battlegrounds table ('oval'). Every set is drawn for both shapes (see .card-back in
 * cosmetics.css), premium ones add a canvas emitter here so their motion is procedural, not a looping strip.
 */
export function CardBackFace({ id, shape, className = '', live = true }: { id?: string; shape: 'card' | 'oval'; className?: string; /** Run the procedural layer only while the back is actually on screen (a flipped token hides it). */ live?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = ref.current;
    const fx = id ? BACK_FX[id] : undefined;
    if (!host || !fx || !live || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const layer = new VfxLayer(host, { inset: 0, zIndex: 3, className: 'card-back-fx' });
    layer.max = 90;
    fx(layer, host.offsetWidth, host.offsetHeight, shape);
    layer.warm(2);
    return () => layer.destroy();
  }, [id, shape, live]);
  return <div ref={ref} className={`card-back is-${shape} ${className}`} data-back={id || 'back-paper'} aria-hidden>
    <i className="card-back-rim" /><i className="card-back-field" /><b className="card-back-emblem" /><i className="card-back-sheen" />
  </div>;
}

type BackFx = (layer: VfxLayer, w: number, h: number, shape: 'card' | 'oval') => void;
const BACK_FX: Record<string, BackFx> = {
  /* Flame: embers climb from the bottom edge, the field glows warmer in slow waves. */
  'back-fire': (layer, w, h) => {
    let acc = 0;
    layer.emitter((dt, t) => {
      acc += dt * 6;
      while (acc >= 1) { acc -= 1; layer.spawn({ x: rand(w * .15, w * .85), y: rand(h * .7, h * .95), vx: rand(-6, 6), vy: rand(-22, -12), ay: -14, turb: 60, drag: .3, life: rand(1.2, 2.2), size: rand(1.6, 3.4), size1: .5, color: pick(['#ffd66b', '#ff9a1f', '#ff5a1a']), alpha: rand(.6, 1), fadeIn: .15, fadeOut: .5 }); }
      layer.paint((ctx, W, H) => { ctx.globalCompositeOperation = 'lighter'; const g = ctx.createRadialGradient(W / 2, H * .9, 2, W / 2, H * .9, W * .7); const p = .6 + .3 * noise2(t * 2, 3); g.addColorStop(0, `rgba(255,120,30,${.28 * p})`); g.addColorStop(1, 'rgba(255,60,20,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); });
    });
  },
  /* Runes: motes orbit the emblem and pulse rings open now and then. */
  'back-arcane': (layer, w, h) => {
    let next = 0;
    layer.emitter((dt, t) => {
      if (Math.random() < dt * 5) { const a = rand(0, 6.3), r = Math.min(w, h) * .32; layer.spawn({ x: w / 2 + Math.cos(a) * r, y: h / 2 + Math.sin(a) * r, vx: -Math.sin(a) * 18, vy: Math.cos(a) * 18, turb: 8, life: rand(1.5, 3), size: rand(1.2, 2.4), size1: .6, color: pick(['#9bd7ff', '#e6c3ff']), alpha: rand(.5, .9), fadeIn: .3, fadeOut: .4 }); }
      if (t >= next) { next = t + rand(1.2, 2.6); layer.spawn({ x: w / 2, y: h / 2, life: 1.3, size: Math.min(w, h) * .12, size1: Math.min(w, h) * .46, shape: 'ring', color: '#c77dff', alpha: .7, fadeIn: .05, fadeOut: .7, spin: .4 }); }
    });
  },
  /* Neon: a haze of magenta and cyan drifts, the sign flickers. */
  'back-neon': (layer, w, h) => {
    let acc = 0;
    layer.emitter((dt, t) => {
      acc += dt * 1.4;
      while (acc >= 1) { acc -= 1; layer.spawn({ x: rand(0, w), y: rand(0, h), vx: rand(-8, 8), vy: rand(-6, 6), turb: 16, life: rand(3, 5), size: rand(14, 24), size1: rand(30, 44), shape: 'wisp', blend: 'source-over', color: Math.random() < .5 ? rgba(255, 125, 233, .12) : rgba(98, 216, 255, .12), alpha: 1, fadeIn: .3, fadeOut: .4 }); }
      layer.paint((ctx, W, H) => { ctx.globalCompositeOperation = 'lighter'; const flick = Math.random() < .04 ? .3 : .8 + .2 * noise2(t * 7, 1); const g = ctx.createRadialGradient(W / 2, H / 2, 2, W / 2, H / 2, W * .55); g.addColorStop(0, `rgba(255,125,233,${.18 * flick})`); g.addColorStop(1, 'rgba(98,216,255,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); });
    });
  },
  /* Liquid gold: slow molten swirls under the emblem and a bright bead running the rim. */
  'back-gold': (layer, w, h, shape) => {
    let acc = 0;
    layer.emitter((dt, t) => {
      acc += dt * 2.2;
      while (acc >= 1) { acc -= 1; layer.spawn({ x: rand(w * .1, w * .9), y: rand(h * .1, h * .9), vx: rand(-6, 6), vy: rand(-8, 4), turb: 30, drag: .2, life: rand(2.5, 4.5), size: rand(10, 18), size1: rand(22, 34), shape: 'wisp', blend: 'source-over', color: rgba(255, 214, 107, .16), alpha: 1, fadeIn: .35, fadeOut: .4 }); }
      layer.paint((ctx, W, H) => {
        ctx.globalCompositeOperation = 'lighter';
        const u = (t * .25) % 1, a = u * Math.PI * 2;
        const x = shape === 'oval' ? W / 2 + Math.cos(a) * W * .42 : (u < .5 ? W * .06 + (u * 2) * W * .88 : W * .94 - ((u - .5) * 2) * W * .88);
        const y = shape === 'oval' ? H / 2 + Math.sin(a) * H * .42 : (u < .5 ? H * .05 : H * .95);
        const g = ctx.createRadialGradient(x, y, 0, x, y, 22); g.addColorStop(0, 'rgba(255,248,214,.9)'); g.addColorStop(.4, 'rgba(255,214,107,.45)'); g.addColorStop(1, 'rgba(255,214,107,0)'); ctx.fillStyle = g; ctx.fillRect(x - 22, y - 22, 44, 44);
      });
    });
  },
  /* Frost: crystals drift down inside the field and settle. */
  'back-frost': (layer, w, h) => {
    let acc = 0;
    layer.emitter(dt => { acc += dt * 3; while (acc >= 1) { acc -= 1; layer.spawn({ x: rand(w * .1, w * .9), y: rand(-4, h * .3), vx: rand(-5, 5), vy: rand(8, 16), turb: 14, life: rand(2.5, 4), size: rand(2, 4), size1: rand(2, 4), rot: rand(0, 6), spin: rand(-1, 1), shape: Math.random() < .5 ? 'flake' : 'glow', color: '#eaffff', alpha: rand(.5, .9), fadeIn: .3, fadeOut: .35 }); } });
  },
  /* Occult: a violet ember or two and the sigil breathing. */
  'back-occult': (layer, w, h) => {
    layer.emitter((dt, t) => {
      if (Math.random() < dt * 2.5) layer.spawn({ x: rand(w * .15, w * .85), y: rand(h * .5, h * .9), vx: rand(-5, 5), vy: rand(-16, -8), turb: 40, life: rand(1.5, 3), size: rand(1.4, 2.6), size1: .6, color: pick(['#d9b3ff', '#b98cff']), alpha: rand(.6, 1), fadeIn: .2, fadeOut: .5 });
      layer.paint((ctx, W, H) => { ctx.globalCompositeOperation = 'lighter'; const p = .5 + .5 * Math.sin(t * 1.1); const g = ctx.createRadialGradient(W / 2, H / 2, 4, W / 2, H / 2, Math.min(W, H) * .4); g.addColorStop(0, `rgba(190,130,255,${.06 + .14 * p})`); g.addColorStop(1, 'rgba(190,130,255,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); });
    });
  },
};
