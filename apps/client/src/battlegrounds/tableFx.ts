import { STAGE_W, stageRoot } from '../ui/stageCoords';

/** Stage-pixel box (CSS zoom removed), so overlays inside the stage line up with the DOM. */
export type Box = { x: number; y: number; w: number; h: number };

function zoom(): number {
  const rect = stageRoot()?.getBoundingClientRect();
  return rect?.width ? rect.width / STAGE_W : 1;
}

export function stageBox(el: Element | null | undefined): Box | null {
  const root = stageRoot();
  if (!el || !root) return null;
  const z = zoom();
  const r = el.getBoundingClientRect();
  const base = root.getBoundingClientRect();
  return { x: (r.left - base.left) / z, y: (r.top - base.top) / z, w: r.width / z, h: r.height / z };
}

export function reducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** One shared overlay above the table (under the drag layer) for coins, flights and bursts. */
export function fxLayer(): HTMLElement | null {
  const root = stageRoot();
  if (!root) return null;
  let layer = root.querySelector<HTMLElement>('.ab-fx-layer');
  if (!layer) {
    layer = document.createElement('div');
    layer.className = 'ab-fx-layer';
    root.appendChild(layer);
  }
  return layer;
}

const center = (b: Box) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });

/** Coins hop from one box to another along small arcs. ≤ 10 nodes, removed when done. */
export function spawnCoins(from: Box, to: Box, count: number): void {
  const layer = fxLayer();
  if (!layer || reducedMotion()) return;
  const a = center(from), b = center(to);
  const n = Math.max(1, Math.min(10, count));
  for (let i = 0; i < n; i++) {
    const coin = document.createElement('i');
    coin.className = 'ab-fx-coin';
    coin.textContent = '$';
    layer.appendChild(coin);
    const sx = a.x + (Math.random() - .5) * 30, sy = a.y + (Math.random() - .5) * 20;
    const ex = b.x + (Math.random() - .5) * 24, ey = b.y + (Math.random() - .5) * 12;
    const lift = 40 + Math.random() * 50;
    const anim = coin.animate([
      { transform: `translate(${sx}px,${sy}px) scale(.6) rotate(0deg)`, opacity: 0 },
      { transform: `translate(${(sx + ex) / 2}px,${Math.min(sy, ey) - lift}px) scale(1.1) rotate(${180 + Math.random() * 180}deg)`, opacity: 1, offset: .5 },
      { transform: `translate(${ex}px,${ey}px) scale(.7) rotate(${360 + Math.random() * 180}deg)`, opacity: 0 },
    ], { duration: 520 + Math.random() * 160, delay: i * 45, easing: 'cubic-bezier(.3,.7,.4,1)', fill: 'both' });
    anim.onfinish = () => coin.remove();
  }
}

/** A short flash of sparks at a box (triple, shield pop, upgrade). */
export function spawnBurst(at: Box, color = '#ffd76a', count = 14, host?: HTMLElement | null): void {
  const layer = host ?? fxLayer();
  if (!layer || reducedMotion()) return;
  const c = center(at);
  const ring = document.createElement('i');
  ring.className = 'ab-fx-ring';
  ring.style.setProperty('--fx-color', color);
  ring.style.transform = `translate(${c.x - 40}px,${c.y - 40}px)`;
  layer.appendChild(ring);
  ring.animate([{ opacity: 1, scale: '.2' }, { opacity: 0, scale: '2.4' }], { duration: 480, easing: 'ease-out', fill: 'both' }).onfinish = () => ring.remove();
  for (let i = 0; i < count; i++) {
    const spark = document.createElement('i');
    spark.className = 'ab-fx-spark';
    spark.style.setProperty('--fx-color', color);
    layer.appendChild(spark);
    const angle = (i / count) * Math.PI * 2 + Math.random() * .4;
    const dist = 50 + Math.random() * 60;
    spark.animate([
      { transform: `translate(${c.x}px,${c.y}px) scale(1)`, opacity: 1 },
      { transform: `translate(${c.x + Math.cos(angle) * dist}px,${c.y + Math.sin(angle) * dist + 20}px) scale(.2)`, opacity: 0 },
    ], { duration: 420 + Math.random() * 220, easing: 'cubic-bezier(.2,.8,.5,1)', fill: 'both' }).onfinish = () => spark.remove();
  }
}

/** Clone a live tile and fly it to a box (sell by click, discarded cards). Removed when done. */
export function flyClone(el: HTMLElement, to: Box, opts: { shrink?: number; ms?: number; fade?: boolean } = {}): void {
  const layer = fxLayer();
  const from = stageBox(el);
  if (!layer || !from) return;
  const clone = el.cloneNode(true) as HTMLElement;
  clone.classList.add('ab-fx-clone');
  clone.style.cssText = `position:absolute;left:0;top:0;width:${from.w}px;height:${from.h}px;margin:0;transform-origin:0 0;pointer-events:none;`;
  layer.appendChild(clone);
  const shrink = opts.shrink ?? .35;
  const c = center(to);
  const end = { x: c.x - from.w * shrink / 2, y: c.y - from.h * shrink / 2 };
  if (reducedMotion()) { clone.remove(); return; }
  clone.animate([
    { transform: `translate(${from.x}px,${from.y}px) scale(1) rotate(0deg)`, opacity: 1 },
    { transform: `translate(${(from.x + end.x) / 2}px,${Math.min(from.y, end.y) - 60}px) scale(${(1 + shrink) / 2}) rotate(-8deg)`, opacity: 1, offset: .55 },
    { transform: `translate(${end.x}px,${end.y}px) scale(${shrink}) rotate(6deg)`, opacity: opts.fade === false ? 1 : 0 },
  ], { duration: opts.ms ?? 460, easing: 'cubic-bezier(.3,.7,.3,1)', fill: 'both' }).onfinish = () => clone.remove();
}
