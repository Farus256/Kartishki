import { audioManager } from '../AudioManager';
import { combatImpact } from '../battlegrounds/combatImpact';
import { STAGE_W, stageRoot } from '../ui/stageCoords';

/**
 * Impact, blood, dust, death and afterimage effects for the duel table. Same CSS classes as the Battlegrounds
 * combat (fx-combat.css), driven by DOM boxes instead of a scripted event queue. Every node self-removes.
 */
export type Point = { x: number; y: number };

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const zoom = () => { const rect = stageRoot()?.getBoundingClientRect(); return rect?.width ? rect.width / STAGE_W : 1; };

/** Centre of an element in field-local stage pixels. */
export function centerOf(field: HTMLElement, el: Element | null | undefined): Point | undefined {
  if (!el) return undefined;
  const z = zoom(), f = field.getBoundingClientRect(), r = el.getBoundingClientRect();
  return { x: (r.left - f.left + r.width / 2) / z, y: (r.top - f.top + r.height / 2) / z };
}

function place(node: HTMLElement, field: HTMLElement, at: Point) {
  const w = field.offsetWidth || 1, h = field.offsetHeight || 1;
  node.style.left = `${(at.x / w) * 100}%`; node.style.top = `${(at.y / h) * 100}%`;
}

export function shake(field: HTMLElement, amp: number, ms: number) {
  if (!amp || reduced()) return;
  const axis = Math.random() * Math.PI * 2, steps = 7, frames: Keyframe[] = [{ translate: '0 0', rotate: '0deg' }];
  for (let i = 1; i <= steps; i++) { const k = amp * (1 - i / (steps + 1)) ** 1.5 * (i % 2 ? 1 : -1); frames.push({ translate: `${Math.cos(axis) * k}px ${Math.sin(axis) * k}px`, rotate: `${k * .03}deg` }); }
  frames.push({ translate: '0 0', rotate: '0deg' });
  field.animate(frames, { duration: ms, easing: 'linear', composite: 'add' });
}

export function dust(field: HTMLElement, at: Point, count: number, ux = 0, uy = 1) {
  if (reduced()) return;
  for (let i = 0; i < count; i++) {
    const puff = document.createElement('i'); puff.className = 'ab-combat-dust-puff';
    const side = i % 2 ? 1 : -1, spread = 18 + Math.random() * 34, rise = 14 + Math.random() * 22, grow = 1.6 + Math.random() * 1.1;
    place(puff, field, { x: at.x + ux * 10 + (Math.random() - .5) * 60, y: at.y + 54 + (Math.random() - .5) * 8 }); field.appendChild(puff);
    puff.animate([{ transform: 'translate(-50%,-50%) scale(.35)', opacity: 0 }, { transform: `translate(calc(-50% + ${side * spread * .5 + uy * 4}px),calc(-50% - ${rise * .5}px)) scale(${grow * .7})`, opacity: .55, offset: .22 }, { transform: `translate(calc(-50% + ${side * spread}px),calc(-50% - ${rise}px)) scale(${grow})`, opacity: .32, offset: .6 }, { transform: `translate(calc(-50% + ${side * spread * 1.25}px),calc(-50% - ${rise * 1.3}px)) scale(${grow * 1.25})`, opacity: 0 }], { duration: 1100 + Math.random() * 600, delay: Math.random() * 90, easing: 'cubic-bezier(.15,.6,.3,1)', fill: 'both' }).onfinish = () => puff.remove();
  }
}

function blood(field: HTMLElement, at: Point, count: number, damage: number, ux: number, uy: number) {
  const heading = Math.atan2(uy, ux);
  const origin = { x: at.x - ux * 36, y: at.y - uy * 34 };
  const splat = document.createElement('i'); splat.className = 'ab-combat-splat'; place(splat, field, at); field.appendChild(splat);
  splat.animate([{ transform: `translate(-50%,-50%) rotate(${heading}rad) scale(.3,.6)`, opacity: .95 }, { transform: `translate(calc(-50% + ${ux * 40}px),calc(-50% + ${uy * 40}px)) rotate(${heading}rad) scale(1.7,.9)`, opacity: .85, offset: .45 }, { transform: `translate(calc(-50% + ${ux * 46}px),calc(-50% + ${uy * 46}px)) rotate(${heading}rad) scale(1.8,.95)`, opacity: 0 }], { duration: 1150, easing: 'ease-out', fill: 'forwards' }).onfinish = () => splat.remove();
  const speed = 110 + Math.min(220, damage * 14);
  for (let i = 0; i < count; i++) {
    const kind = i % 4 === 3 ? 'ab-combat-chip' : i % 5 === 4 ? 'ab-combat-spark' : 'ab-combat-drop';
    const drop = document.createElement('i'); drop.className = kind;
    place(drop, field, { x: origin.x + (Math.random() - .5) * 52, y: origin.y + (Math.random() - .5) * 50 }); field.appendChild(drop);
    const ang = heading + (Math.random() - .5) * .9, dist = speed * (.5 + Math.random()), spin = (Math.random() - .5) * 640, stretch = kind === 'ab-combat-drop' ? 1 + dist / 160 : 1;
    const ex = Math.cos(ang) * dist, ey = Math.sin(ang) * dist + 28;
    drop.animate([{ transform: `translate(0,0) rotate(${ang}rad) scale(.6,.6)`, opacity: 0 }, { transform: `translate(${ex * .3}px,${ey * .25}px) rotate(${ang}rad) scale(${stretch},1)`, opacity: 1, offset: .12 }, { transform: `translate(${ex}px,${ey}px) rotate(${ang + spin * Math.PI / 180 * .4}rad) scale(${stretch * .5},.5)`, opacity: 1, offset: .5 }, { transform: `translate(${ex * 1.15}px,${ey * 1.15 + 30}px) rotate(${ang + spin * Math.PI / 180 * .7}rad) scale(${stretch * .35},.4)`, opacity: .9, offset: .78 }, { transform: `translate(${ex * 1.2}px,${ey * 1.2 + 40}px) rotate(${ang + spin * Math.PI / 180}rad) scale(.2)`, opacity: 0 }], { duration: 900 + Math.random() * 500, delay: Math.random() * 70, easing: 'cubic-bezier(.2,.7,.4,1)', fill: 'both' }).onfinish = () => drop.remove();
  }
}

/** A damage cloud on a tile (lethal ones are bigger and redder); fades on its own. */
export function pop(el: HTMLElement, amount: number, lethal = false, lifeMs = 1000) {
  const node = document.createElement('b'); node.className = lethal ? 'ab-combat-pop is-lethal' : 'ab-combat-pop';
  node.textContent = `${amount > 0 ? '+' : ''}${amount}`; node.style.left = '50%'; node.style.top = '38%';
  if (amount > 0) node.classList.add('is-heal');
  el.appendChild(node);
  window.setTimeout(() => { if (reduced()) { node.remove(); return; } node.classList.add('is-leave'); window.setTimeout(() => node.remove(), 300); }, lifeMs);
}

/** A blow lands on `el`: red flash, recoil along the strike, debris, dust, camera shake; the hero adds the red veil. */
export function impact(field: HTMLElement, el: HTMLElement, damage: number, from?: Point, at?: Point, hero = false) {
  if (reduced()) return;
  const info = combatImpact(damage); if (!info.tier) return;
  const body = el.querySelector<HTMLElement>('.duel-tile-body, .duel-hero-face') ?? el;
  body.classList.remove('is-hit'); void body.offsetWidth; body.classList.add('is-hit');
  window.setTimeout(() => body.classList.remove('is-hit'), 500);
  const dx = from && at ? at.x - from.x : 0, dy = from && at ? at.y - from.y : 1, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len;
  body.animate([{ translate: '0 0', rotate: '0deg' }, { translate: `${ux * info.recoil}px ${uy * info.recoil * .6}px`, rotate: `${-ux * 6 || 4}deg`, offset: .3 }, { translate: `${ux * info.recoil * .35}px ${uy * info.recoil * .2}px`, rotate: `${ux * 2}deg`, offset: .7 }, { translate: '0 0', rotate: '0deg' }], { duration: info.duration + 160, easing: 'ease-out', composite: 'add' });
  if (at) { blood(field, at, info.particles, damage, ux, uy); dust(field, at, 3 + Math.min(4, Math.round(damage / 3)), ux, uy); }
  shake(field, info.shake, info.duration + 120);
  if (hero && info.tier >= 3 && info.shake) { const veil = document.createElement('i'); veil.className = 'ab-combat-veil'; field.appendChild(veil); window.setTimeout(() => veil.remove(), 420); }
  audioManager.play(hero ? 'ab_hit_hero' : damage >= 5 ? 'ab_hit_heavy' : 'ab_hit_light');
}

/** Divine shield popping: shards fly, the tile flashes. */
export function shieldPop(field: HTMLElement, el: HTMLElement) {
  if (reduced()) return;
  audioManager.play('ab_shield_pop');
  el.animate([{ filter: 'brightness(2.4) drop-shadow(0 0 28px #ffdf80)' }, { filter: 'none' }], { duration: 450 });
  const at = centerOf(field, el); if (!at) return;
  for (let i = 0; i < 10; i++) {
    const shard = document.createElement('i'); shard.className = 'ab-combat-shine'; place(shard, field, at); field.appendChild(shard);
    const a = (i / 10) * Math.PI * 2;
    shard.animate([{ transform: 'translate(0,0) scale(1)', opacity: 1 }, { transform: `translate(${Math.cos(a) * 90}px,${Math.sin(a) * 90}px) scale(.2)`, opacity: 0 }], { duration: 420, easing: 'ease-out' }).onfinish = () => shard.remove();
  }
}

/** Death: the tile crumbles into six shards and a puff of dust. Resolves when the shards have fallen. */
export function rip(field: HTMLElement, el: HTMLElement): Promise<void> {
  const face = el.querySelector<HTMLElement>('.duel-tile-body');
  if (reduced() || !face) { el.style.opacity = '0'; return Promise.resolve(); }
  el.classList.add('is-rip');
  const cuts = ['polygon(0 0,50% 0,42% 30%,0 40%)', 'polygon(50% 0,100% 0,100% 35%,42% 30%)', 'polygon(0 40%,42% 30%,55% 60%,0 70%)', 'polygon(42% 30%,100% 35%,100% 65%,55% 60%)', 'polygon(0 70%,55% 60%,45% 100%,0 100%)', 'polygon(55% 60%,100% 65%,100% 100%,45% 100%)'];
  const done: Promise<unknown>[] = [];
  cuts.forEach((cut, i) => {
    const piece = document.createElement('div'); piece.className = 'ab-combat-shard'; piece.style.clipPath = cut;
    piece.append(...[...face.childNodes].map(node => node.cloneNode(true))); el.append(piece);
    const dx = (i % 2 ? 1 : -1) * (20 + Math.random() * 60), rot = (Math.random() - .5) * 70;
    done.push(piece.animate([{ transform: 'translate(0,0) rotate(0)', opacity: 1 }, { transform: `translate(${dx * .4}px,${-10 - Math.random() * 20}px) rotate(${rot * .3}deg)`, opacity: 1, offset: .25 }, { transform: `translate(${dx}px,${110 + Math.random() * 60}px) rotate(${rot}deg)`, opacity: 0 }], { duration: 560 + i * 40, easing: 'ease-out', fill: 'forwards' }).finished.catch(() => {}));
  });
  const at = centerOf(field, el); if (at) dust(field, at, 4);
  audioManager.play('ab_death');
  return Promise.all(done).then(() => { el.style.opacity = '0'; });
}

/** A fading copy of the tile left on the dash path. */
export function afterimage(field: HTMLElement, el: HTMLElement) {
  if (reduced()) return;
  const body = el.querySelector<HTMLElement>('.duel-tile-body'); if (!body) return;
  const ghost = document.createElement('div'); ghost.className = 'ab-combat-after duel-after';
  const z = zoom(), f = field.getBoundingClientRect(), r = el.getBoundingClientRect();
  ghost.style.left = `${(r.left - f.left) / z}px`; ghost.style.top = `${(r.top - f.top) / z}px`; ghost.style.width = `${r.width / z}px`; ghost.style.height = `${r.height / z}px`;
  ghost.append(...[...body.childNodes].map(node => node.cloneNode(true))); field.appendChild(ghost);
  ghost.animate([{ opacity: .5, filter: 'brightness(1.4) blur(0)' }, { opacity: 0, filter: 'brightness(1.8) blur(3px)' }], { duration: 320, easing: 'ease-out', fill: 'forwards' }).onfinish = () => ghost.remove();
}

/** The attacker dashes at its target (with afterimages), the field leans in; resolves at the moment of impact. */
export function lunge(field: HTMLElement, el: HTMLElement, from: Point, to: Point): Promise<void> {
  if (reduced()) return Promise.resolve();
  const dx = to.x - from.x, dy = to.y - from.y, len = Math.hypot(dx, dy) || 1;
  el.classList.add('is-attacking', 'is-dashing');
  field.style.transformOrigin = `${(from.x + to.x) / 2}px ${(from.y + to.y) / 2}px`;
  field.classList.add('is-duel');
  audioManager.play('ab_whoosh');
  const body = el.querySelector<HTMLElement>('.duel-tile-body') ?? el;
  const coil = { x: -dx / len * 32, y: -dy / len * 32 }, hit = { x: dx * .78, y: dy * .78 };
  const dash = body.animate([
    { translate: '0 0', scale: '1', offset: 0 },
    { translate: `${coil.x}px ${coil.y}px`, scale: '1.08', offset: .28 },
    { translate: `${hit.x}px ${hit.y}px`, scale: '1.04', offset: .72 },
    { translate: `${hit.x}px ${hit.y}px`, scale: '1', offset: 1 },
  ], { duration: 340, easing: 'cubic-bezier(.4,0,.9,.5)', fill: 'forwards' });
  window.setTimeout(() => afterimage(field, el), 150); window.setTimeout(() => afterimage(field, el), 200); window.setTimeout(() => afterimage(field, el), 245);
  return dash.finished.then(() => { el.classList.remove('is-dashing'); }).catch(() => {});
}

/** After the blow: the attacker walks home. */
export function walkHome(field: HTMLElement, el: HTMLElement): Promise<void> {
  if (reduced()) { el.classList.remove('is-attacking', 'is-dashing'); field.classList.remove('is-duel'); return Promise.resolve(); }
  const body = el.querySelector<HTMLElement>('.duel-tile-body') ?? el;
  const back = body.animate([{ translate: getComputedStyle(body).translate, scale: '1' }, { translate: '0 0', scale: '1' }], { duration: 340, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'forwards' });
  return back.finished.then(() => {
    body.getAnimations().forEach(a => a.cancel());
    el.classList.remove('is-attacking', 'is-dashing'); field.classList.remove('is-duel');
    const at = centerOf(field, el); if (at) dust(field, at, 2);
  }).catch(() => { el.classList.remove('is-attacking', 'is-dashing'); field.classList.remove('is-duel'); });
}
