import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import { aimCurve } from '../battlegrounds/pointerDnd';
import { audioManager } from '../AudioManager';
import { STAGE_W, stageRoot } from '../ui/stageCoords';
import { DUEL } from './duelLayout';

/** What is being aimed: a card from the hand (drops on the board), a minion or the hero power (drop on a target). */
export type DuelAimKind = 'hand' | 'minion' | 'power';
export type DuelAim = { kind: DuelAimKind; id: string };
export type DuelDragView = { aim: DuelAim | null; armed: boolean; overBoard: boolean; targetId: string | null; dragging: boolean };

type Opts = {
  /** The table element: every coordinate here is table-local, in stage pixels (CSS zoom removed). */
  screenRef: RefObject<HTMLElement | null>;
  /** Legal drop targets for the current aim (minion ids and the enemy hero id). */
  legalTargets: (aim: DuelAim) => Set<string>;
  onPlay: (id: string) => void;
  onAttack: (id: string, targetId: string) => void;
  onPower: (targetId: string) => void;
};

const DRAG_PX = 8;
const idle: DuelDragView = { aim: null, armed: false, overBoard: false, targetId: null, dragging: false };

function targetAt(clientX: number, clientY: number): string | null {
  for (const node of document.elementsFromPoint(clientX, clientY)) {
    const hit = node instanceof Element ? node.closest<HTMLElement>('[data-duel-target]') : null;
    if (hit) return hit.dataset.duelTarget ?? null;
  }
  return null;
}
function overBoardAt(clientX: number, clientY: number): boolean {
  return document.elementsFromPoint(clientX, clientY).some(node => node instanceof Element && !!node.closest('[data-duel-zone="board"]'));
}

/**
 * Pointer aiming for the duel. A press on a hand card lifts a ghost that drops onto the board; a press on a ready
 * minion or the hero power draws the aim arrow to the pointer and releases on a target. A press without movement
 * keeps the aim armed (click-to-select), so a second click on a target still lands; Escape cancels.
 */
export function useDuelDrag({ screenRef, legalTargets, onPlay, onAttack, onPower }: Opts) {
  const [view, setView] = useState<DuelDragView>(idle);
  const viewRef = useRef(view); viewRef.current = view;
  const run = useRef<{ aim: DuelAim; pointerId: number; start: { x: number; y: number }; origin: { x: number; y: number }; grab: { x: number; y: number }; moved: boolean; ghost: HTMLElement | null; source: HTMLElement } | null>(null);
  const ghostLayer = useRef<HTMLDivElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const headRef = useRef<SVGPolygonElement>(null);
  const pointer = useRef({ x: 0, y: 0 });
  const legal = useRef(legalTargets); legal.current = legalTargets;
  /** A release after a real drag is followed by a click on the source: that click must not play the card again. */
  const suppressed = useRef(false);
  /** When a press armed the aim, the click that follows the same press must not disarm it. */
  const armedAt = useRef(0);
  const play = useRef(onPlay); play.current = onPlay;
  const attack = useRef(onAttack); attack.current = onAttack;
  const power = useRef(onPower); power.current = onPower;

  const zoom = () => { const root = stageRoot()?.getBoundingClientRect(); return root?.width ? root.width / STAGE_W : 1; };
  const toLocal = (clientX: number, clientY: number) => {
    const box = screenRef.current?.getBoundingClientRect(); const z = zoom();
    return box ? { x: (clientX - box.left) / z, y: (clientY - box.top) / z } : { x: 0, y: 0 };
  };
  const drawArrow = useCallback((from: { x: number; y: number }, to: { x: number; y: number }) => {
    const curve = aimCurve(from.x, from.y, to.x, to.y);
    pathRef.current?.setAttribute('d', curve.d);
    headRef.current?.setAttribute('points', curve.head);
  }, []);
  const cancel = useCallback(() => {
    const r = run.current; run.current = null;
    r?.ghost?.remove();
    r?.source.classList.remove('is-lifted');
    setView(idle);
  }, []);

  /** Start aiming from a source element (a hand card, a minion tile or the power gem). */
  const begin = useCallback((aim: DuelAim, event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0 || run.current) return;
    const source = event.currentTarget;
    const box = source.getBoundingClientRect();
    const origin = toLocal(box.left + box.width / 2, box.top + box.height / 2);
    const at = toLocal(event.clientX, event.clientY);
    const corner = toLocal(box.left, box.top);
    run.current = { aim, pointerId: event.pointerId, start: { x: event.clientX, y: event.clientY }, origin, grab: { x: at.x - corner.x, y: at.y - corner.y }, moved: false, ghost: null, source };
    pointer.current = at;
    setView({ aim, armed: true, overBoard: false, targetId: null, dragging: false });
    if (aim.kind !== 'hand') drawArrow(origin, at);
  }, [drawArrow]);

  /** Click-to-select: arm an aim without a press (minion tile click, power gem click). */
  const select = useCallback((aim: DuelAim | null, from?: HTMLElement | null) => {
    if (!aim || !from) { cancel(); return; }
    const box = from.getBoundingClientRect();
    const origin = toLocal(box.left + box.width / 2, box.top + box.height / 2);
    run.current = { aim, pointerId: -1, start: { x: 0, y: 0 }, origin, grab: { x: 0, y: 0 }, moved: true, ghost: null, source: from };
    setView({ aim, armed: true, overBoard: false, targetId: null, dragging: false });
    drawArrow(origin, pointer.current);
  }, [cancel, drawArrow]);

  useEffect(() => {
    const move = (event: PointerEvent) => {
      const r = run.current; if (!r) return;
      const at = toLocal(event.clientX, event.clientY);
      pointer.current = at;
      if (!r.moved && r.pointerId === event.pointerId && Math.hypot(event.clientX - r.start.x, event.clientY - r.start.y) > DRAG_PX) {
        r.moved = true;
        if (r.aim.kind === 'hand') {
          // The ghost is the card itself, lifted out of the hand.
          const ghost = r.source.cloneNode(true) as HTMLElement;
          ghost.className = 'duel-ghost';
          ghost.style.width = `${r.source.offsetWidth}px`; ghost.style.height = `${r.source.offsetHeight}px`;
          ghostLayer.current?.appendChild(ghost); r.ghost = ghost; r.source.classList.add('is-lifted');
          audioManager.play('ab_pickup');
        }
      }
      if (r.aim.kind === 'hand') {
        if (r.ghost) r.ghost.style.transform = `translate(${at.x - r.grab.x}px,${at.y - r.grab.y}px) rotate(-3deg)`;
        const over = r.moved && overBoardAt(event.clientX, event.clientY);
        if (over !== viewRef.current.overBoard || r.moved !== viewRef.current.dragging) setView(v => ({ ...v, overBoard: over, dragging: r.moved }));
        return;
      }
      drawArrow(r.origin, at);
      const hit = targetAt(event.clientX, event.clientY);
      const targetId = hit && legal.current(r.aim).has(hit) ? hit : null;
      if (targetId !== viewRef.current.targetId || r.moved !== viewRef.current.dragging) setView(v => ({ ...v, targetId, dragging: r.moved }));
    };
    const up = (event: PointerEvent) => {
      const r = run.current; if (!r) return;
      if (!r.moved) {
        // A plain click: hand cards play at once (the tile's own click handles the rest); minions and the power stay armed.
        if (r.aim.kind === 'hand') { cancel(); return; }
        r.moved = true; r.pointerId = -1; armedAt.current = performance.now(); setView(v => ({ ...v, dragging: false }));
        return;
      }
      if (r.aim.kind === 'hand') {
        const over = overBoardAt(event.clientX, event.clientY);
        const { aim } = r; cancel();
        suppressed.current = true; window.setTimeout(() => { suppressed.current = false; }, 0);
        if (over) play.current(aim.id); else audioManager.play('ab_drop_hand');
        return;
      }
      const hit = targetAt(event.clientX, event.clientY);
      const legit = hit && legal.current(r.aim).has(hit) ? hit : null;
      if (!legit) { if (r.pointerId === -1) cancel(); else { r.pointerId = -1; setView(v => ({ ...v, dragging: false, targetId: null })); } return; }
      const { aim } = r; cancel();
      if (aim.kind === 'minion') attack.current(aim.id, legit); else power.current(legit);
    };
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') cancel(); };
    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('keydown', key);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', cancel); window.removeEventListener('keydown', key); };
  }, [cancel, drawArrow]);

  /** Click on a target while an aim is armed (click-to-select path). */
  const clickTarget = useCallback((targetId: string) => {
    const r = run.current; if (!r || r.aim.kind === 'hand') return false;
    if (!legal.current(r.aim).has(targetId)) return false;
    const { aim } = r; cancel();
    if (aim.kind === 'minion') attack.current(aim.id, targetId); else power.current(targetId);
    return true;
  }, [cancel]);

  const overlay = <>
    <div ref={ghostLayer} className="ab-dnd-layer duel-ghost-layer" aria-hidden />
    <svg className={`ab-aim-arrow ${view.armed && view.aim?.kind !== 'hand' ? 'is-live' : ''}`} viewBox={`0 0 ${DUEL.TABLE_W} ${DUEL.TABLE_H}`} aria-hidden><path ref={pathRef} className="ab-aim-line" fill="none" d="" /><polygon ref={headRef} className="ab-aim-head" points="" /></svg>
  </>;
  const didDrag = useCallback(() => suppressed.current, []);
  const justArmed = useCallback(() => performance.now() - armedAt.current < 300, []);
  return { view, begin, select, cancel, clickTarget, didDrag, justArmed, overlay };
}
