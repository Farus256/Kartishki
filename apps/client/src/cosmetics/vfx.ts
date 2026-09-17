/**
 * Tiny procedural VFX layer: one <canvas> over a host element, a pooled particle list, emitters that
 * spawn into it, and cached sprite textures. Canvas 2D on purpose — a few hundred blended sprites is
 * nothing for it, no dependency, no GPU context per portrait, and it degrades to "no aura" on a lost
 * canvas instead of breaking the table. Everything here is transform-free for the DOM: the canvas is
 * absolutely positioned once and only its pixels change.
 */
export type Shape = 'glow' | 'wisp' | 'spark' | 'shard' | 'drop' | 'pixel' | 'star' | 'ring' | 'flake' | 'rune' | 'leaf' | 'bubble';
export type Particle = {
  x: number; y: number; vx: number; vy: number;
  /** Constant acceleration (gravity / lift). */
  ax: number; ay: number;
  /** Velocity damping per second (0 = none). */
  drag: number;
  /** Noise-driven turbulence strength (px/s²) and this particle's noise seed. */
  turb: number; seed: number;
  life: number; age: number;
  size: number; /** Size at end of life (grows smoke, shrinks embers). */ size1: number;
  rot: number; spin: number;
  color: string; alpha: number;
  /** Alpha envelope: attack fraction of life, release fraction. */
  fadeIn: number; fadeOut: number;
  shape: Shape; blend: 'lighter' | 'source-over';
  /** Optional per-particle alpha multiplier from the emitter (e.g. keep smoke thin over a face). */
  weight?: (p: Particle, layer: VfxLayer) => number;
};

const RAND = (n: number) => Math.random() * n;
export const rand = (a: number, b: number) => a + Math.random() * (b - a);
export const pick = <T,>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)]!;

/** Cheap value noise on a hashed lattice — enough for smoke drift and ember wobble. */
const lattice = new Float32Array(256 * 256);
for (let i = 0; i < lattice.length; i++) lattice[i] = Math.random() * 2 - 1;
export function noise2(x: number, y: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const at = (i: number, j: number) => lattice[((i & 255) << 8) | (j & 255)]!;
  const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
  return (a + (b - a) * sx) + ((c + (d - c) * sx) - (a + (b - a) * sx)) * sy;
}

/** Six small rune glyphs as unit-square strokes; a particle picks one by its seed. */
export const RUNE_STROKES: readonly (readonly [number, number, number, number])[][] = [
  [[-.5, -1, -.5, 1], [-.5, -1, .6, -.3], [-.5, .2, .6, .9]],
  [[0, -1, 0, 1], [-.7, -.5, .7, .5], [-.7, .5, .7, -.5]],
  [[-.6, 1, 0, -1], [0, -1, .6, 1], [-.35, .2, .35, .2]],
  [[-.5, -1, -.5, 1], [-.5, -1, .5, 0], [.5, 0, -.5, 1]],
  [[-.6, -.6, .6, -.6], [0, -.6, 0, 1], [-.5, .5, .5, .5]],
  [[-.6, -1, .6, 1], [.6, -1, -.6, 1], [0, -1, 0, 1]],
];
const sprites = new Map<string, HTMLCanvasElement>();
/** Soft radial sprite in one colour, drawn once per colour+kind and reused by every particle. */
function sprite(kind: 'glow' | 'wisp', color: string): HTMLCanvasElement {
  const key = `${kind}:${color}`;
  let c = sprites.get(key);
  if (c) return c;
  // Bounded: a colour string that never repeats would otherwise grow this into a canvas per particle.
  if (sprites.size >= 128) sprites.clear();
  c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  if (kind === 'glow') { grad.addColorStop(0, '#ffffff'); grad.addColorStop(.25, color); grad.addColorStop(1, 'rgba(0,0,0,0)'); }
  else { const base = Number(/([\d.]+)\)$/.exec(color)?.[1] ?? 1); const at = (a: number) => color.replace(/[\d.]+\)$/, `${a})`); grad.addColorStop(0, color); grad.addColorStop(.3, at(base * .75)); grad.addColorStop(.65, at(base * .28)); grad.addColorStop(1, 'rgba(0,0,0,0)'); }
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  sprites.set(key, c);
  return c;
}
/** "rgba(r,g,b,a)" so wisp sprites can fade their own edge. */
export const rgba = (r: number, g: number, b: number, a = 1) => `rgba(${r},${g},${b},${a})`;

export type Emitter = (dt: number, t: number, layer: VfxLayer) => void;

export class VfxLayer {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private particles: Particle[] = [];
  private emitters = new Set<Emitter>();
  private raf = 0;
  private last = 0;
  private t = 0;
  private dead = false;
  private hidden = false;
  private frozen = false;
  private observer?: ResizeObserver;
  private io?: IntersectionObserver;
  w = 0; h = 0;
  readonly inset: number;
  /** Cap on live particles; spawns past it recycle the oldest. */
  max = 240;
  /** Playback speed multiplier for fast-forwarded combat. */
  rate = 1;

  constructor(host: HTMLElement, opts: { inset?: number; zIndex?: number; className?: string } = {}) {
    this.inset = opts.inset ?? 0;
    this.canvas = document.createElement('canvas');
    this.canvas.className = `vfx-layer ${opts.className ?? ''}`;
    this.canvas.style.cssText = `position:absolute;left:${-this.inset}px;top:${-this.inset}px;pointer-events:none;z-index:${opts.zIndex ?? 4};border-radius:0`;
    this.ctx = this.canvas.getContext('2d')!;
    host.appendChild(this.canvas);
    this.resize(host);
    if (typeof ResizeObserver !== 'undefined') { this.observer = new ResizeObserver(() => this.resize(host)); this.observer.observe(host); }
    if (typeof IntersectionObserver !== 'undefined') { this.io = new IntersectionObserver(entries => { this.hidden = !entries.some(e => e.isIntersecting); if (!this.hidden) this.kick(); }); this.io.observe(this.canvas); }
    window.addEventListener('vfx-resume', this.resume);
  }
  private resize(host: HTMLElement) {
    const w = host.offsetWidth + this.inset * 2, h = host.offsetHeight + this.inset * 2;
    if (w === this.w && h === this.h) return;
    this.w = w; this.h = h;
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    this.canvas.width = Math.max(1, Math.round(w * dpr)); this.canvas.height = Math.max(1, Math.round(h * dpr));
    this.canvas.style.width = `${w}px`; this.canvas.style.height = `${h}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (this.frozen) this.still();
  }
  /** Host-relative coordinates (0,0 = host's top-left; the inset margin is negative space). */
  spawn(p: Partial<Particle> & Pick<Particle, 'x' | 'y'>): Particle {
    const full: Particle = { vx: 0, vy: 0, ax: 0, ay: 0, drag: 0, turb: 0, seed: RAND(1000), life: 1, age: 0, size: 4, size1: 4, rot: 0, spin: 0, color: '#ffffff', alpha: 1, fadeIn: .1, fadeOut: .4, shape: 'glow', blend: 'lighter', ...p };
    if (this.particles.length >= this.max) this.particles.shift();
    this.particles.push(full);
    this.kick();
    return full;
  }
  /** Advance the simulation without drawing so an aura is already alive the moment it appears. */
  warm(seconds: number) { const dt = 1 / 30; for (let s = 0; s < seconds; s += dt) { this.t += dt; for (const e of this.emitters) e(dt, this.t, this); this.step(dt); } this.paints.length = 0; }
  /** One still frame: simulate a couple of seconds, draw once, then stop for good (gallery tiles, reel tiles). */
  freeze(seconds = 2) {
    this.warm(seconds);
    this.frozen = true;
    this.still();
  }
  /** One emitter tick and one draw with the loop stopped; a frozen layer repeats this when its host resizes. */
  private still() {
    const dt = 1 / 30; this.t += dt;
    for (const e of this.emitters) e(dt, this.t, this);
    this.step(dt); this.draw();
    if (this.raf) { cancelAnimationFrame(this.raf); this.raf = 0; }
  }
  emitter(fn: Emitter): () => void { this.emitters.add(fn); this.kick(); return () => this.emitters.delete(fn); }
  get busy() { return this.particles.length > 0 || this.emitters.size > 0; }
  private readonly resume = () => this.kick();
  private kick() { if (!this.raf && !this.dead && !this.frozen && !this.hidden && !document.hidden) { this.last = performance.now(); this.raf = requestAnimationFrame(this.frame); } }
  private frame = (now: number) => {
    if (this.dead) { this.raf = 0; return; }
    // raf stays set while the frame runs: a spawn inside an emitter must not kick a second loop (that doubled the
    // work of every layer and fed the next frame a negative dt).
    const dt = Math.max(0, Math.min(.05, (now - this.last) / 1000)) * this.rate;
    this.last = now;
    this.t += dt;
    for (const e of this.emitters) e(dt, this.t, this);
    this.step(dt);
    this.draw();
    this.raf = this.busy && !this.hidden && !document.hidden ? requestAnimationFrame(this.frame) : 0;
  };
  private step(dt: number) {
    const keep: Particle[] = [];
    for (const p of this.particles) {
      p.age += dt;
      if (p.age >= p.life) continue;
      if (p.turb) {
        const n = this.t * .6 + p.seed;
        p.vx += noise2(p.x * .02 + p.seed, n) * p.turb * dt;
        p.vy += noise2(n, p.y * .02 + p.seed * 1.7) * p.turb * dt;
      }
      p.vx += p.ax * dt; p.vy += p.ay * dt;
      if (p.drag) { const k = Math.max(0, 1 - p.drag * dt); p.vx *= k; p.vy *= k; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.spin * dt;
      keep.push(p);
    }
    this.particles = keep;
  }
  private draw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.w, this.h);
    for (const fn of this.paints) { ctx.save(); fn(ctx, this.w, this.h); ctx.restore(); }
    this.paints.length = 0;
    for (const p of this.particles) {
      const u = p.age / p.life;
      let a = p.alpha * (u < p.fadeIn ? u / p.fadeIn : u > 1 - p.fadeOut ? (1 - u) / p.fadeOut : 1);
      if (p.weight) a *= p.weight(p, this);
      const size = p.size + (p.size1 - p.size) * u;
      // Soft canvas border: nothing ever ends on a straight edge.
      const px = p.x + this.inset, py = p.y + this.inset, m = Math.max(18, size);
      a *= Math.max(0, Math.min(1, Math.min(px, py, this.w - px, this.h - py) / m));
      if (a <= .003) continue;
      ctx.globalAlpha = Math.min(1, a);
      ctx.globalCompositeOperation = p.blend;
      const x = px, y = py;
      switch (p.shape) {
        case 'glow': case 'wisp': ctx.drawImage(sprite(p.shape, p.color), x - size, y - size, size * 2, size * 2); break;
        case 'spark': {
          const len = Math.max(size * 2, Math.hypot(p.vx, p.vy) * .04);
          const ang = Math.atan2(p.vy, p.vx);
          ctx.strokeStyle = p.color; ctx.lineWidth = size * .6; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(x - Math.cos(ang) * len, y - Math.sin(ang) * len); ctx.lineTo(x, y); ctx.stroke();
          break;
        }
        case 'pixel': ctx.fillStyle = p.color; ctx.fillRect(x - size, y - size * .35, size * 2, size * .7); break;
        case 'drop': ctx.fillStyle = p.color; ctx.beginPath(); ctx.ellipse(x, y, size, size * 1.25, p.rot, 0, Math.PI * 2); ctx.fill(); break;
        case 'shard': case 'star': case 'ring': case 'flake': case 'rune': case 'leaf': case 'bubble': {
          ctx.save(); ctx.translate(x, y); ctx.rotate(p.rot);
          ctx.fillStyle = p.color; ctx.strokeStyle = p.color; ctx.lineWidth = Math.max(1, size * .25);
          ctx.beginPath();
          if (p.shape === 'shard') { ctx.moveTo(0, -size * 1.3); ctx.lineTo(size * .8, -size * .2); ctx.lineTo(size * .3, size * 1.1); ctx.lineTo(-size * .6, size * .7); ctx.lineTo(-size * .9, -size * .3); ctx.closePath(); ctx.fill(); }
          else if (p.shape === 'star') { for (let i = 0; i < 10; i++) { const r = i % 2 ? size * .45 : size; const t = i / 10 * Math.PI * 2 - Math.PI / 2; ctx.lineTo(Math.cos(t) * r, Math.sin(t) * r); } ctx.closePath(); ctx.fill(); }
          else if (p.shape === 'ring') { ctx.arc(0, 0, size, 0, Math.PI * 2); ctx.stroke(); }
          else if (p.shape === 'rune') { ctx.lineWidth = Math.max(1.2, size * .28); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; for (const [x0, y0, x1, y1] of RUNE_STROKES[Math.floor(p.seed) % RUNE_STROKES.length]!) { ctx.moveTo(x0 * size, y0 * size); ctx.lineTo(x1 * size, y1 * size); } ctx.stroke(); }
          else if (p.shape === 'leaf') { ctx.moveTo(0, -size); ctx.quadraticCurveTo(size * .9, -size * .2, 0, size); ctx.quadraticCurveTo(-size * .9, -size * .2, 0, -size); ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.moveTo(0, -size * .8); ctx.lineTo(0, size * .8); ctx.stroke(); }
          else if (p.shape === 'bubble') { ctx.lineWidth = Math.max(1, size * .18); ctx.arc(0, 0, size, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.arc(-size * .35, -size * .35, size * .22, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.fill(); }
          else { for (let i = 0; i < 6; i++) { const t = i / 6 * Math.PI * 2; ctx.moveTo(0, 0); ctx.lineTo(Math.cos(t) * size, Math.sin(t) * size); } ctx.stroke(); }
          ctx.restore();
          break;
        }
      }
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }
  private paints: ((ctx: CanvasRenderingContext2D, w: number, h: number) => void)[] = [];
  /** Draw a one-off shape under this frame's particles (emitters use it for flicker lights and fog). */
  paint(fn: (ctx: CanvasRenderingContext2D, w: number, h: number) => void) { this.paints.push(fn); }
  clear() { this.particles = []; }
  destroy() {
    this.dead = true;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.observer?.disconnect(); this.io?.disconnect();
    window.removeEventListener('vfx-resume', this.resume);
    this.emitters.clear(); this.particles = [];
    this.canvas.remove();
  }
}

/** Alpha weight that thins particles over the middle of the host (keeps a face readable under smoke). */
export function edgeWeight(layer: VfxLayer, floor = .35): (p: Particle) => number {
  const cx = (layer.w - layer.inset * 2) / 2, cy = (layer.h - layer.inset * 2) / 2;
  return p => { const dx = (p.x - cx) / cx, dy = (p.y - cy) / cy; const d = Math.min(1, Math.hypot(dx, dy)); return floor + (1 - floor) * d * d; };
}

/** Pause every layer while the tab is hidden; layers resume on their own next spawn/emitter tick. */
if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => { if (!document.hidden) window.dispatchEvent(new Event('vfx-resume')); });
