/**
 * Paid hit effects: one config per cosmetic, one renderer. Everything is DOM + Web Animations on
 * transform/opacity, so the same code plays in combat, in the shop preview and in the wardrobe.
 *
 * Sequence per hit: anticipation (target braces) → impact (flash, shockwave, punch, recoil) →
 * secondary (particles, streaks, debris, effect-specific extras) → decay (glow fades, target settles).
 */
import { VfxLayer, rand, type Shape } from './vfx';
import { victimFrames, type StrikeStyle } from './strikeMotion';

export type ParticleShape = 'ember' | 'spark' | 'shard' | 'drop' | 'pixel' | 'star' | 'rune' | 'line';
export type HitEffectConfig = {
  /** Palette: hot core, body, edge/glow. */
  core: string; mid: string; edge: string;
  /** Screen flash strength 0..1 (a sheet over the portrait). */
  flash: number;
  shock: 'ring' | 'rings' | 'hex' | 'burst' | 'square' | 'none';
  particle: { shape: ParticleShape; count: number; speed: number; gravity: number; size: [number, number]; spin?: boolean; life?: number };
  /** Radial light streaks from the impact point. */
  streaks: number;
  /** Extras that make each style read differently. */
  bolt?: boolean; ink?: boolean; text?: string; glitch?: boolean; frost?: boolean; comet?: boolean; runes?: boolean;
  recoil: number; punch: number;
  /** How the striker moves and how the target answers (see strikeMotion.ts). */
  motion: StrikeStyle;
  /** Total ms at rate 1; the target is settled and the layer removed by then. */
  duration: number;
};

export const HIT_EFFECTS: Record<string, HitEffectConfig> = {
  'slam-fire': { core: '#fff3b0', mid: '#ff8a1f', edge: '#ff3b1a', flash: .85, shock: 'burst', particle: { shape: 'ember', count: 24, speed: 170, gravity: -80, size: [6, 14], life: 900 }, streaks: 8, recoil: 26, punch: .16, motion: 'punch', duration: 1000 },
  'slam-lightning': { core: '#ffffff', mid: '#9ef0ff', edge: '#3fb8ff', flash: 1, shock: 'ring', particle: { shape: 'spark', count: 18, speed: 260, gravity: 140, size: [3, 7], life: 620 }, streaks: 12, bolt: true, recoil: 12, punch: .12, motion: 'snap', duration: 900 },
  'slam-ice': { core: '#ffffff', mid: '#bff3ff', edge: '#5cc6e8', flash: .7, shock: 'hex', particle: { shape: 'shard', count: 20, speed: 190, gravity: 280, size: [8, 18], spin: true, life: 900 }, streaks: 0, frost: true, recoil: 16, punch: .14, motion: 'crush', duration: 1050 },
  'slam-ink': { core: '#3a2f2a', mid: '#1a1a1a', edge: '#0b0b0b', flash: .35, shock: 'none', particle: { shape: 'drop', count: 24, speed: 210, gravity: 240, size: [7, 20], life: 820 }, streaks: 0, ink: true, recoil: 24, punch: .12, motion: 'slash', duration: 1000 },
  'slam-comic': { core: '#fff0a8', mid: '#ffd23f', edge: '#e6432d', flash: .8, shock: 'burst', particle: { shape: 'star', count: 12, speed: 180, gravity: 60, size: [10, 20], spin: true, life: 720 }, streaks: 14, text: 'БАМ!', recoil: 30, punch: .22, motion: 'bounce', duration: 1050 },
  'slam-arcane': { core: '#f7e6ff', mid: '#c77dff', edge: '#6a2bd9', flash: .7, shock: 'rings', particle: { shape: 'rune', count: 14, speed: 100, gravity: -50, size: [10, 16], spin: true, life: 1000 }, streaks: 10, runes: true, recoil: 14, punch: .1, motion: 'pulse', duration: 1100 },
  'slam-neon': { core: '#ffffff', mid: '#ff7de9', edge: '#62d8ff', flash: .55, shock: 'rings', particle: { shape: 'line', count: 16, speed: 240, gravity: 0, size: [3, 22], life: 640 }, streaks: 0, recoil: 22, punch: .08, motion: 'sweep', duration: 950 },
  'slam-glitch': { core: '#e8fff0', mid: '#00ffa3', edge: '#ff2a6d', flash: .45, shock: 'square', particle: { shape: 'pixel', count: 20, speed: 200, gravity: 0, size: [5, 11], life: 520 }, streaks: 0, glitch: true, recoil: 18, punch: .08, motion: 'blink', duration: 860 },
  'slam-shadow': { core: '#c9a8ff', mid: '#6a2bd9', edge: '#120820', flash: .4, shock: 'rings', particle: { shape: 'drop', count: 18, speed: 120, gravity: -70, size: [8, 20], life: 1000 }, streaks: 0, ink: true, recoil: 18, punch: .12, motion: 'blink', duration: 1100 },
  'slam-petal': { core: '#fff0f6', mid: '#ffb3d9', edge: '#ff5a9e', flash: .5, shock: 'ring', particle: { shape: 'star', count: 26, speed: 140, gravity: 40, size: [8, 14], spin: true, life: 1100 }, streaks: 6, recoil: 16, punch: .1, motion: 'sweep', duration: 1150 },
  'slam-comet': { core: '#fffbe6', mid: '#ffd66b', edge: '#ff7a1a', flash: .9, shock: 'burst', particle: { shape: 'ember', count: 26, speed: 220, gravity: 110, size: [5, 12], life: 900 }, streaks: 16, comet: true, recoil: 34, punch: .2, motion: 'knockback', duration: 1200 },
};

export type HitEffectOptions = {
  /** Playback speed multiplier (combat fast-forward). */
  rate?: number;
  reduced?: boolean;
  /** Unit vector the blow travels along (from striker to target). */
  dir?: { x: number; y: number };
  /** Skip the target punch/recoil (caller animates the portrait itself). */
  stillTarget?: boolean;
};

const EASE_OUT = 'cubic-bezier(.16,1,.3,1)';
const EASE_IN = 'cubic-bezier(.7,0,.84,0)';
const PUNCH = 'cubic-bezier(.34,1.56,.64,1)';

/** Active layers on screen; past this every new hit sheds half its particles so eight-player tables stay readable. */
let live = 0;
const MAX_LIVE = 5;

function el(tag: string, cls: string, style: string): HTMLElement {
  const node = document.createElement(tag);
  node.className = cls;
  node.style.cssText = style;
  return node;
}


/**
 * Plays one hit on `target` (position:relative/absolute host). Resolves when the layer is removed.
 * Returns a cancel function through the promise's `cancel` property.
 */
export function playHitEffect(target: HTMLElement, id: string, options: HitEffectOptions = {}): Promise<void> & { cancel: () => void } {
  const cfg = HIT_EFFECTS[id];
  const rate = Math.max(.05, options.rate ?? 1);
  const reduced = options.reduced ?? matchMedia('(prefers-reduced-motion: reduce)').matches;
  let cancelled = false;
  let done!: () => void;
  const promise = new Promise<void>(resolve => { done = resolve; }) as Promise<void> & { cancel: () => void };
  if (!cfg || rate >= 100) { queueMicrotask(done); promise.cancel = () => {}; return promise; }
  const dir = options.dir ?? { x: -1, y: .25 };
  const ms = (n: number) => n / rate;
  const layer = el('div', 'hfx', `position:absolute;inset:0;pointer-events:none;z-index:30;overflow:visible;--hfx-core:${cfg.core};--hfx-mid:${cfg.mid};--hfx-edge:${cfg.edge}`);
  layer.dataset.hfx = id;
  target.appendChild(layer);
  const fx = new VfxLayer(target, { inset: Math.round(70 * Math.max(.5, Math.min(1.6, (target.offsetWidth || 160) / 160))), zIndex: 31, className: 'hfx-canvas' });
  fx.rate = rate;
  // The punched portrait becomes a stacking context (transform); lift it so the burst paints over the striker.
  const prevZ = target.style.zIndex;
  target.style.zIndex = '31';
  live++;
  const timers: number[] = [];
  const anims: Animation[] = [];
  // Motion gets the curve; opacity always fades linearly, so an expo ease-out never makes a burst vanish in its first frames.
  const run = (node: Element, frames: Keyframe[], opts: KeyframeAnimationOptions) => {
    const base = { fill: 'forwards' as const, ...opts, duration: ms(Number(opts.duration) || 0), delay: ms(Number(opts.delay) || 0) };
    const split = opts.easing && opts.easing !== 'linear' && frames.every(f => f.opacity !== undefined) && frames.some(f => f.transform !== undefined);
    if (split) {
      anims.push(node.animate(frames.map(f => ({ opacity: f.opacity, ...(f.offset != null ? { offset: f.offset } : {}) })), { ...base, easing: 'linear' }));
      frames = frames.map(({ opacity: _o, ...rest }) => rest);
    }
    const a = node.animate(frames, base); anims.push(a); return a;
  };
  const finish = () => { if (cancelled) return; cancelled = true; anims.forEach(a => { try { a.cancel(); } catch { /* already finished */ } }); timers.forEach(clearTimeout); layer.remove(); fx.destroy(); target.style.zIndex = prevZ; live = Math.max(0, live - 1); done(); };
  promise.cancel = finish;
  const budget = live > MAX_LIVE ? .5 : 1;
  const W = target.offsetWidth || 160, H = target.offsetHeight || 172;
  const cx = W / 2, cy = H / 2;
  /** Everything is authored for the 160px combat portrait and scales with the host. */
  const k = Math.max(.5, Math.min(1.6, W / 160));
  const impactAt = cfg.bolt ? 180 : 60; // the bolt strikes from above before the blow lands

  // --- anticipation: the target braces (tiny squash against the blow) ---
  if (!options.stillTarget) {
    run(target, [{ transform: 'translate(0,0) scale(1)' }, { transform: `translate(${dir.x * -3}px,${dir.y * -2}px) scale(.985)` }], { duration: impactAt, easing: 'ease-in' });
  }
  if (cfg.bolt) {
    const bolt = el('div', 'hfx-bolt', `position:absolute;left:${cx - 34}px;top:-140px;width:68px;height:${cy + 150}px;`);
    bolt.innerHTML = `<svg viewBox="0 0 68 300" preserveAspectRatio="none" style="width:100%;height:100%;overflow:visible"><path d="M40 0 L22 96 L44 100 L14 200 L46 190 L24 300" fill="none" stroke="${cfg.core}" stroke-width="7" stroke-linejoin="round" stroke-linecap="round" pathLength="1" style="filter:drop-shadow(0 0 10px ${cfg.mid}) drop-shadow(0 0 22px ${cfg.edge})"/><path d="M40 0 L22 96 L44 100 L14 200 L46 190 L24 300" fill="none" stroke="${cfg.mid}" stroke-width="16" stroke-linejoin="round" opacity=".35" pathLength="1"/></svg>`;
    layer.appendChild(bolt);
    for (const path of bolt.querySelectorAll('path')) run(path, [{ strokeDasharray: '1 1', strokeDashoffset: 1, opacity: 1 }, { strokeDashoffset: 0, opacity: 1, offset: .5 }, { strokeDashoffset: 0, opacity: 1, offset: .7 }, { strokeDashoffset: 0, opacity: 0 }], { duration: 300, easing: 'linear' });
    run(bolt, [{ opacity: 1 }, { opacity: 1, offset: .55 }, { opacity: 0 }], { duration: 320, easing: 'linear' });
  }

  const at = (delay: number, fn: () => void) => { timers.push(window.setTimeout(() => { if (!cancelled) fn(); }, ms(delay))); };

  at(impactAt, () => {
    // --- impact ---
    if (cfg.flash > 0) {
      // Two sheets: a hard white pop inside the portrait, and a wide soft bloom that spills over the table.
      const flash = el('i', 'hfx-flash', `position:absolute;inset:-4px;border-radius:inherit;background:radial-gradient(circle at ${cx}px ${cy}px,#fff 0,${cfg.core} 20%,${cfg.mid}dd 45%,transparent 75%);mix-blend-mode:screen`);
      const bloom = el('i', 'hfx-bloom', `position:absolute;left:${cx - W}px;top:${cy - W}px;width:${W * 2}px;height:${W * 2}px;border-radius:50%;background:radial-gradient(circle,${cfg.core} 0,${cfg.mid}aa 25%,${cfg.edge}44 45%,transparent 70%);mix-blend-mode:screen;filter:blur(${4 * k}px)`);
      layer.append(bloom, flash);
      run(flash, [{ opacity: cfg.flash }, { opacity: cfg.flash, offset: .2 }, { opacity: 0 }], { duration: 300, easing: EASE_OUT });
      run(bloom, [{ opacity: 0, transform: 'scale(.4)' }, { opacity: cfg.flash, transform: 'scale(1)', offset: .18 }, { opacity: 0, transform: 'scale(1.25)' }], { duration: 520, easing: EASE_OUT });
    }
    if (cfg.shock !== 'none') {
      const rings = cfg.shock === 'rings' ? 3 : cfg.shock === 'burst' ? 2 : 1;
      for (let r = 0; r < rings; r++) {
        const size = Math.max(W, H) * 1.7;
        const radius = cfg.shock === 'square' ? '8%' : cfg.shock === 'hex' ? '0' : '50%';
        const clip = cfg.shock === 'hex' ? 'clip-path:polygon(50% 0,93% 25%,93% 75%,50% 100%,7% 75%,7% 25%);' : '';
        const border = cfg.shock === 'burst' ? `border:${10 * k}px solid ${cfg.mid};box-shadow:0 0 22px ${cfg.edge},inset 0 0 26px ${cfg.core};background:radial-gradient(circle,${cfg.core}55,transparent 60%)` : `border:${4 * k}px solid ${cfg.mid};box-shadow:0 0 16px ${cfg.edge}cc,inset 0 0 12px ${cfg.core}66`;
        const ring = el('i', 'hfx-shock', `position:absolute;left:${cx - size / 2}px;top:${cy - size / 2}px;width:${size}px;height:${size}px;border-radius:${radius};${border};${clip}mix-blend-mode:screen`);
        layer.appendChild(ring);
        run(ring, [{ transform: 'scale(.1)', opacity: 1 }, { transform: 'scale(.6)', opacity: 1, offset: .3 }, { transform: 'scale(.9)', opacity: .8, offset: .6 }, { transform: 'scale(1)', opacity: 0 }], { duration: cfg.shock === 'rings' ? 760 : 640, delay: r * 80, easing: EASE_OUT });
      }
    }
    if (!options.stillTarget) {
      const p = cfg.punch, rx = dir.x * cfg.recoil * 1.5 * k, ry = dir.y * cfg.recoil * 1.5 * k;
      // The style decides the reply: a shove, a jitter, a squash, a spin… (strikeMotion.ts); each ends home.
      run(target, victimFrames(cfg.motion, dir, rx, ry, p), { duration: cfg.duration - impactAt, easing: cfg.motion === 'punch' ? 'linear' : PUNCH });
    }
    // --- secondary: streaks, particles, extras ---
    for (let i = 0; i < cfg.streaks; i++) {
      const angle = (i / cfg.streaks) * 360 + (i % 2 ? 11 : -7);
      const streak = el('i', 'hfx-streak', `position:absolute;left:${cx}px;top:${cy}px;width:${Math.max(W, H) * 1.1}px;height:${6 * k}px;margin-top:${-3 * k}px;transform-origin:0 50%;background:linear-gradient(90deg,${cfg.core},${cfg.mid} 40%,transparent);border-radius:2px;mix-blend-mode:screen`);
      layer.appendChild(streak);
      run(streak, [{ transform: `rotate(${angle}deg) scaleX(0)`, opacity: 1 }, { transform: `rotate(${angle}deg) scaleX(1)`, opacity: .95, offset: .3 }, { transform: `rotate(${angle}deg) scaleX(1.2)`, opacity: 0 }], { duration: 480, easing: EASE_OUT });
    }
    // Debris lives on the canvas layer: one draw call per particle, no DOM nodes, per-hit randomised paths.
    const count = Math.round(cfg.particle.count * budget * (reduced ? .4 : 1));
    const bias = Math.atan2(dir.y, dir.x); // most debris flies on with the blow
    const shape: Record<ParticleShape, Shape> = { ember: 'glow', spark: 'spark', shard: 'shard', drop: 'drop', pixel: 'pixel', star: 'star', rune: 'ring', line: 'spark' };
    for (let i = 0; i < count; i++) {
      const spread = Math.PI * 2 * (i / count) + (Math.random() - .5) * .8;
      const angle = spread * .65 + bias * .35;
      const speed = cfg.particle.speed * k * (.55 + Math.random() * .75);
      const size = (cfg.particle.size[0] + Math.random() * (cfg.particle.size[1] - cfg.particle.size[0])) * k * .55;
      const life = (cfg.particle.life ?? 700) / 1000 * (.7 + Math.random() * .5);
      const tone = i % 3 === 0 ? cfg.core : i % 3 === 1 ? cfg.mid : cfg.edge;
      const soft = cfg.particle.shape === 'ember' || cfg.particle.shape === 'rune';
      fx.spawn({ x: cx, y: cy, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, ay: cfg.particle.gravity * k, drag: soft ? 1.2 : .6, turb: soft ? 120 : 0,
        life, size, size1: soft ? size * .3 : size * .7, rot: Math.random() * 6.3, spin: cfg.particle.spin ? (Math.random() - .5) * 12 : 0,
        shape: shape[cfg.particle.shape], blend: cfg.particle.shape === 'drop' ? 'source-over' : 'lighter', color: tone, alpha: 1, fadeIn: .08, fadeOut: .45 });
    }
    if (cfg.ink) {
      // Wet blots: heavy blobs that splat outward, sag under gravity and dry away; a few thin drips follow.
      for (let i = 0; i < 6; i++) {
        const a = Math.random() * Math.PI * 2, d = rand(10, 40) * k;
        fx.spawn({ x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d, vx: Math.cos(a) * rand(20, 70) * k, vy: Math.sin(a) * rand(20, 70) * k + 10, ay: 90, drag: 2.5, life: rand(.7, 1.1),
          size: rand(14, 30) * k * .6, size1: rand(20, 36) * k * .6, rot: rand(0, 6), spin: rand(-.5, .5), shape: 'drop', blend: 'source-over', color: i ? cfg.mid : cfg.core, alpha: .95, fadeIn: .05, fadeOut: .35 });
      }
      for (let i = 0; i < 8; i++) fx.spawn({ x: cx + rand(-30, 30) * k, y: cy + rand(-10, 20) * k, vx: rand(-6, 6), vy: rand(30, 90) * k, ay: 160, life: rand(.5, .9), size: rand(2, 4) * k, size1: 1, shape: 'drop', blend: 'source-over', color: cfg.mid, alpha: .9, fadeIn: .05, fadeOut: .5 });
    }
    if (cfg.frost) {
      const frost = el('i', 'hfx-frost', `position:absolute;inset:0;border-radius:inherit;background:conic-gradient(from 20deg at ${cx}px ${cy}px,transparent 0 4%,${cfg.core}cc 5% 7%,transparent 8% 30%,${cfg.mid}bb 31% 33%,transparent 34% 58%,${cfg.core}cc 59% 62%,transparent 63% 82%,${cfg.mid}bb 83% 85%,transparent 86%);mix-blend-mode:screen;filter:drop-shadow(0 0 6px ${cfg.mid})`);
      layer.appendChild(frost);
      run(frost, [{ transform: 'scale(.2) rotate(-20deg)', opacity: 0 }, { transform: 'scale(1) rotate(0deg)', opacity: 1, offset: .2 }, { transform: 'scale(1.02)', opacity: .9, offset: .6 }, { transform: 'scale(1.06)', opacity: 0 }], { duration: 800, easing: EASE_OUT });
    }
    if (cfg.text) {
      const word = el('b', 'hfx-word', `position:absolute;left:50%;top:${cy - 26}px;transform:translateX(-50%);padding:6px 16px;background:${cfg.mid};color:#1a1a1a;font:900 40px/1 var(--font-hand,'Neucha',cursive);letter-spacing:1px;border:4px solid #1a1a1a;clip-path:polygon(0 30%,12% 0,30% 18%,50% 0,68% 20%,88% 4%,100% 30%,90% 55%,100% 80%,80% 100%,60% 84%,42% 100%,22% 86%,4% 100%,10% 60%)`);
      word.textContent = cfg.text;
      layer.appendChild(word);
      run(word, [{ transform: 'translateX(-50%) scale(.2) rotate(-18deg)', opacity: 0 }, { transform: 'translateX(-50%) scale(1.25) rotate(6deg)', opacity: 1, offset: .22 }, { transform: 'translateX(-50%) scale(1) rotate(-2deg)', opacity: 1, offset: .45 }, { transform: 'translateX(-50%) scale(1.02) rotate(-2deg)', opacity: 1, offset: .75 }, { transform: 'translateX(-50%) scale(.7) rotate(4deg) translateY(-20px)', opacity: 0 }], { duration: 720, easing: PUNCH });
    }
    if (cfg.glitch) {
      const img = target.querySelector<HTMLElement>('img');
      for (let i = 0; i < 4; i++) {
        const y = 10 + Math.random() * 70, h = 6 + Math.random() * 18;
        const slice = el('i', 'hfx-slice', `position:absolute;left:0;right:0;top:${y}%;height:${h}%;background:${i % 2 ? cfg.mid : cfg.edge};mix-blend-mode:screen;opacity:.8`);
        layer.appendChild(slice);
        run(slice, [{ transform: 'translateX(0)', opacity: 0 }, { transform: `translateX(${(Math.random() - .5) * 40}px)`, opacity: .9, offset: .2 }, { transform: `translateX(${(Math.random() - .5) * 60}px)`, opacity: .7, offset: .6 }, { transform: 'translateX(0)', opacity: 0 }], { duration: 360, delay: i * 40, easing: 'steps(4,end)' });
      }
      if (img) run(img, [{ filter: 'none' }, { filter: `drop-shadow(-4px 0 0 ${cfg.edge}) drop-shadow(4px 0 0 ${cfg.mid})`, offset: .15 }, { filter: `drop-shadow(3px 0 0 ${cfg.edge}) drop-shadow(-3px 0 0 ${cfg.mid})`, offset: .45 }, { filter: 'none' }], { duration: 420, easing: 'steps(5,end)' });
    }
    if (cfg.runes) {
      const circle = el('i', 'hfx-circle', `position:absolute;left:${cx - W * .6}px;top:${cy - W * .6}px;width:${W * 1.2}px;height:${W * 1.2}px;border-radius:50%;border:2px dashed ${cfg.mid};box-shadow:0 0 14px ${cfg.edge},inset 0 0 20px ${cfg.mid}66;mix-blend-mode:screen`);
      layer.appendChild(circle);
      run(circle, [{ transform: 'scale(.5) rotate(0deg)', opacity: 0 }, { transform: 'scale(1) rotate(60deg)', opacity: 1, offset: .25 }, { transform: 'scale(1.05) rotate(150deg)', opacity: .8, offset: .7 }, { transform: 'scale(1.15) rotate(200deg)', opacity: 0 }], { duration: 900, easing: EASE_OUT });
    }
    if (cfg.comet) {
      const trail = el('i', 'hfx-comet', `position:absolute;left:${cx - 30}px;top:${cy - 30}px;width:60px;height:60px;border-radius:50%;background:radial-gradient(circle,${cfg.core},${cfg.mid} 35%,transparent 70%);box-shadow:0 0 40px ${cfg.mid},0 0 90px ${cfg.edge};mix-blend-mode:screen`);
      const tail = el('i', 'hfx-tail', `position:absolute;left:${cx}px;top:${cy}px;width:${W * 1.6}px;height:26px;margin-top:-13px;transform-origin:0 50%;background:linear-gradient(90deg,${cfg.core},${cfg.mid}aa 40%,transparent);border-radius:13px;mix-blend-mode:screen;filter:blur(2px)`);
      layer.append(tail, trail);
      const ang = Math.atan2(-dir.y, -dir.x) * 180 / Math.PI;
      run(tail, [{ transform: `rotate(${ang}deg) scaleX(1)`, opacity: 1 }, { transform: `rotate(${ang}deg) scaleX(.2)`, opacity: 0 }], { duration: 420, easing: EASE_IN });
      run(trail, [{ transform: 'scale(1.4)', opacity: 1 }, { transform: 'scale(.6)', opacity: 0 }], { duration: 520, easing: EASE_OUT });
    }
    // --- decay: a soft glow hangs on the portrait then lets go ---
    const glow = el('i', 'hfx-glow', `position:absolute;inset:-14px;border-radius:inherit;box-shadow:0 0 ${40 * k}px ${cfg.mid},0 0 ${90 * k}px ${cfg.edge}88,inset 0 0 ${40 * k}px ${cfg.edge}66;mix-blend-mode:screen`);
    layer.appendChild(glow);
    run(glow, [{ opacity: 0 }, { opacity: .9, offset: .12 }, { opacity: .5, offset: .5 }, { opacity: 0 }], { duration: cfg.duration - impactAt, easing: 'ease-out' });
  });
  at(cfg.duration + 40, finish);
  return promise;
}
