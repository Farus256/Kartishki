import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import { flushSync } from 'react-dom';
import { AUTO_BATTLER, type AutoBattlerCatalog } from '@kartishki/shared';
import type { AbMinion, AbPlayer } from '../autoBattlerSession';
import { clientToStage, STAGE_H, STAGE_W } from '../ui/stageCoords';
import { canPlayToBoard, passedDragThreshold } from './pointerMath';
import { type AbDndApi, type AbDndView } from './abDndContext';
import { MinionTile } from './MinionTile';
import { isSpell } from './minionView';
import { offerCost } from './abOptimistic';
import { audioManager } from '../AudioManager';
import {
  AB_DND,
  aimCurve,
  clampTilt,
  commitIntent,
  createDragSession,
  createPendingLock,
  grabOffset,
  hitZone,
  inflate,
  insertionIndex,
  rectToLocal,
  resolveDrop,
  union,
  type AbDragKind,
  type AbDragPayload,
  type AbIntent,
  type DropZone,
  type LocalRect,
  type Rect,
} from './pointerDnd';

function settleBoardAnimations(screen: HTMLElement): void {
  screen.querySelectorAll('.ab-board .ab-minion').forEach(el => el.getAnimations().forEach(animation => animation.finish()));
}

function stageBox(screen: HTMLElement): DOMRect {
  return (document.querySelector('[data-stage]') ?? screen).getBoundingClientRect();
}

const idle: AbDndView = { kind: null, draggingId: null, previewIndex: null, zone: 'none', targetId: null, valid: false, armed: false, settling: false, hidden: null };

/** Viewport pixels: CSS zoom makes stage-space X miss the hole the user sees. */
const INSERT_HYSTERESIS_CLIENT_PX = 14;
/** Ghost glide from the release point onto the tile it stands for. */
const LAND_MS = 190;

type Run = {
  pointerId: number;
  payload: AbDragPayload;
  grab: { x: number; y: number };
  origin: LocalRect;
  startClient: { x: number; y: number };
  lastClient: { x: number; y: number };
  pointer: { x: number; y: number };
  lastIndex: number | null;
  armed: boolean;
  minion: AbMinion | null;
  source: HTMLElement;
  host: HTMLElement;
  session: ReturnType<typeof createDragSession>;
  powerOrigin: { x: number; y: number };
  /** How much bigger the card was drawn than its resting box when grabbed (a hovered hand card is zoomed): the ghost eases down from it. */
  pickScale: number;
};

type Park = { run: Run; mode: 'land' | 'sell' | 'return'; aimed: boolean };

type Opts = {
  enabled: boolean;
  me: AbPlayer | undefined;
  catalog: AutoBattlerCatalog;
  screenRef: RefObject<HTMLElement | null>;
  onIntent: (intent: AbIntent) => void;
};

function localOf(el: Element | null, root: Rect, localW: number, localH: number): LocalRect | undefined {
  if (!el) return undefined;
  return rectToLocal(el.getBoundingClientRect(), root, localW, localH);
}

function findMinion(me: AbPlayer | undefined, payload: AbDragPayload): AbMinion | null {
  if (!me || payload.kind === 'power') return null;
  const list = payload.kind === 'shop' ? me.tavern.offers : payload.kind === 'hand' ? me.hand : me.board;
  return list.find(item => item.id === payload.id) ?? null;
}

/** The real tile for an id: tavern, hand or board, never the ghost. */
function liveTile(screen: HTMLElement, id: string): HTMLElement | null {
  const escaped = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(id) : id.replace(/["\\]/g, '\\$&');
  return screen.querySelector<HTMLElement>(`.ab-board [data-ab-id="${escaped}"], .ab-hand [data-ab-id="${escaped}"], .ab-tavern-row [data-ab-id="${escaped}"]`);
}

function targetFromPoint(clientX: number, clientY: number, domain: string): string | null {
  const stack = document.elementsFromPoint(clientX, clientY);
  for (const node of stack) {
    const hit = node instanceof Element ? node.closest('[data-ab-target]') : null;
    if (!(hit instanceof HTMLElement)) continue;
    if (hit.dataset.abTarget === domain) return hit.dataset.abId ?? null;
  }
  return null;
}

/**
 * Centers of the slots currently on screen, gap included. Once the gap is
 * rendered the row is stable, so the hole always opens under the pointer.
 * Without a gap (first frame of a hand drag) one extra center stands for "after the last".
 */
function liveSlotCenters(screen: HTMLElement): number[] {
  const slots = [...screen.querySelectorAll<HTMLElement>('[data-ab-slot]')]
    .filter(slot => !slot.classList.contains('is-well') && !slot.closest('.ab-drag-hold'))
    .sort((a, b) => Number(a.dataset.abSlot ?? 0) - Number(b.dataset.abSlot ?? 0));
  const centers = slots.map(slot => {
    const box = slot.getBoundingClientRect();
    return box.left + box.width / 2;
  });
  if (centers.length && !slots.some(slot => slot.classList.contains('is-gap'))) {
    const stride = centers.length > 1 ? Math.max(40, centers[1]! - centers[0]!) : 120;
    centers.push(centers[centers.length - 1]! + stride);
  }
  return centers;
}

function zoneAt(kind: AbDragKind, clientX: number, clientY: number, point: { x: number; y: number }, areas: { buy?: LocalRect; sell?: LocalRect; board?: LocalRect }): DropZone {
  const stack = document.elementsFromPoint(clientX, clientY);
  const over = (selector: string) => stack.some(node => node instanceof Element && node.closest(selector));
  if (kind !== 'shop' && over('[data-testid="ab-sell-zone"]')) return 'sell';
  if (kind === 'shop' && over('[data-testid="ab-hero"],[data-testid="ab-hand"],.ab-buy-zone')) return 'buy';
  if (kind !== 'shop' && over('[data-testid="ab-board"]')) return 'board';
  return hitZone(kind, point, areas);
}

export function useAbPointerDnd({ enabled, me, catalog, screenRef, onIntent }: Opts) {
  const [view, setView] = useState<AbDndView>(idle);
  const viewRef = useRef(view);
  viewRef.current = view;
  const runRef = useRef<Run | null>(null);
  const parkRef = useRef<Park | null>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const headRef = useRef<SVGPolygonElement>(null);
  const rafRef = useRef(0);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const meRef = useRef(me);
  meRef.current = me;
  const intentRef = useRef(onIntent);
  intentRef.current = onIntent;
  const lockRef = useRef(createPendingLock());
  const suppressRef = useRef<EventTarget | null>(null);
  const detachRef = useRef<() => void>(() => {});
  const [ghost, setGhost] = useState<{ minion: AbMinion; full: boolean } | null>(null);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const applyGhost = useCallback((run: Run, tilt: number) => {
    const ghostEl = ghostRef.current;
    if (!ghostEl) return;
    ghostEl.style.transformOrigin = `${run.grab.x}px ${run.grab.y}px`;
    // Movement lives in `translate`, not inside `transform`: the pickup keyframe animates `scale`, which composes
    // after `transform`, so a translate3d there would be scaled too and the ghost would lurch off the pointer.
    ghostEl.style.translate = `${run.pointer.x - run.grab.x}px ${run.pointer.y - run.grab.y}px`;
    ghostEl.style.transform = `scale(${AB_DND.PICKUP_SCALE}) rotate(${tilt}deg)`;
  }, []);

  const applyArrow = useCallback((run: Run) => {
    const curve = aimCurve(run.powerOrigin.x, run.powerOrigin.y, run.pointer.x, run.pointer.y);
    if (pathRef.current) pathRef.current.setAttribute('d', curve.d);
    if (headRef.current) headRef.current.setAttribute('points', curve.head);
  }, []);

  const measure = useCallback(() => {
    const screen = screenRef.current;
    if (!screen) return null;
    const root = stageBox(screen);
    const buy = union(
      union(localOf(screen.querySelector('[data-testid="ab-hero"]'), root, STAGE_W, STAGE_H), localOf(screen.querySelector('[data-testid="ab-hand"]'), root, STAGE_W, STAGE_H)),
      localOf(screen.querySelector('.ab-buy-zone'), root, STAGE_W, STAGE_H),
    );
    const sell = localOf(screen.querySelector('[data-testid="ab-sell-zone"]'), root, STAGE_W, STAGE_H);
    const board = localOf(screen.querySelector('[data-testid="ab-board"]'), root, STAGE_W, STAGE_H);
    return {
      root,
      buy: buy ? inflate(buy, AB_DND.BUY_PAD) : undefined,
      sell: sell ? inflate(sell, AB_DND.SELL_PAD) : undefined,
      board: board ? inflate(board, AB_DND.BOARD_PAD) : undefined,
    };
  }, [screenRef]);

  /** Zone + insertion preview for one pointer position. Shared by move and drop so both agree. */
  const sample = useCallback((run: Run, clientX: number, clientY: number, layout: NonNullable<ReturnType<typeof measure>>) => {
    const player = meRef.current;
    const zone = zoneAt(run.payload.kind, clientX, clientY, run.pointer, layout);
    let preview: number | null = null;
    if (zone === 'board' && run.payload.kind !== 'shop') {
      const centers = liveSlotCenters(run.host);
      // A reorder can only land among the remaining minions; a play may also land after the last.
      const maxIndex = run.payload.kind === 'board'
        ? Math.max(0, (player?.board.length ?? 1) - 1)
        : Math.min(AB_DND.MAX_BOARD, Math.max(0, centers.length - 1));
      preview = insertionIndex(clientX, centers, run.lastIndex, INSERT_HYSTERESIS_CLIENT_PX, maxIndex);
      run.lastIndex = preview;
    }
    const intent = resolveDrop({
      kind: run.payload.kind,
      id: run.payload.id,
      fromIndex: run.payload.index,
      zone,
      previewIndex: preview,
      targetId: null,
      boardLength: player?.board.length ?? 0,
      canBuy: !!player && player.gold >= offerCost(player, run.payload.kind === 'shop' ? player.tavern.offers.find(o => o.id === run.payload.id) : undefined) && player.hand.length < AUTO_BATTLER.HAND_LIMIT,
      canPlay: !!player && (canPlayToBoard(player.board.length) || (!!run.minion && isSpell(run.minion))),
      validTarget: false,
    });
    return { zone, preview, intent };
  }, []);

  const hideGhost = useCallback(() => {
    const ghostEl = ghostRef.current;
    if (ghostEl) {
      ghostEl.style.transition = '';
      ghostEl.style.opacity = '';
      ghostEl.style.visibility = 'hidden';
      ghostEl.classList.remove('is-picking');
    }
    setGhost(null);
  }, []);

  /** The ghost has landed: show the real tile in the same frame the ghost disappears. */
  const reveal = useCallback(() => {
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = null;
    parkRef.current = null;
    setView(idle);
    hideGhost();
  }, [hideGhost]);

  const finish = useCallback((intent: AbIntent | null, run: Run) => {
    const ghostEl = ghostRef.current;
    suppressRef.current = run.source;
    window.setTimeout(() => { if (suppressRef.current === run.source) suppressRef.current = null; }, 40);
    // Local state takes the move now; the server echo only confirms it.
    if (intent) intentRef.current(intent);
    if (run.payload.kind === 'power' || !run.armed || !ghostEl) { reveal(); return; }
    // Keep the hole-free layout static: any tile still sliding jumps to its slot before the ghost aims at it.
    settleBoardAnimations(run.host);
    parkRef.current = { run, mode: intent ? (intent.type === 'sell' ? 'sell' : 'land') : 'return', aimed: false };
    setView({ kind: run.payload.kind, draggingId: run.payload.id, previewIndex: null, zone: 'none', targetId: null, valid: false, armed: false, settling: true, hidden: run.payload.id });
  }, [reveal]);

  // Runs after the board committed its new order: glide the ghost onto its tile, then swap them.
  // Re-aims if the tile moves again while the ghost is still in the air (late echo).
  const stateKey = me ? [me.tavern.offers, me.hand, me.board].map(list => list.map(card => card.id).join(',')).join('|') : '';
  useLayoutEffect(() => {
    const park = parkRef.current;
    if (!view.settling || !park) return;
    const screen = screenRef.current;
    const ghostEl = ghostRef.current;
    if (!screen || !ghostEl) { reveal(); return; }
    const root = stageBox(screen);
    const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    let target: LocalRect | undefined;
    let fade = false;
    if (park.mode === 'sell') {
      const zone = localOf(screen.querySelector('[data-testid="ab-sell-zone"]'), root, STAGE_W, STAGE_H);
      if (zone) {
        const w = park.run.origin.w * 0.4, h = park.run.origin.h * 0.4;
        target = { x: zone.x + zone.w / 2 - w / 2, y: zone.y + zone.h / 2 - h / 2, w, h };
        fade = true;
      }
    } else {
      const tile = liveTile(screen, park.run.payload.id);
      target = localOf(tile, root, STAGE_W, STAGE_H);
      if (tile) setGhost(current => current ? { ...current, full: !!tile.closest('.ab-hand') } : current);
    }
    target ??= park.run.origin;
    const ms = reduced ? 0 : park.mode === 'return' ? AB_DND.RETURN_MS : LAND_MS;
    ghostEl.style.transition = ms ? `translate ${ms}ms cubic-bezier(.2,.75,.2,1), transform ${ms}ms cubic-bezier(.2,.75,.2,1), width ${ms}ms ease, height ${ms}ms ease, opacity ${ms}ms ease` : '';
    ghostEl.style.width = `${target.w}px`;
    ghostEl.style.height = `${target.h}px`;
    ghostEl.style.translate = `${target.x}px ${target.y}px`;
    ghostEl.style.transform = 'scale(1) rotate(0deg)';
    if (fade) ghostEl.style.opacity = '0';
    if (!park.aimed) {
      park.aimed = true;
      settleTimer.current = setTimeout(reveal, ms);
    }
  }, [view.settling, stateKey, reveal, screenRef]);

  const cancel = useCallback(() => {
    detachRef.current();
    detachRef.current = () => {};
    const run = runRef.current;
    runRef.current = null;
    if (!run) {
      if (viewRef.current.settling) reveal();
      else {
        setView(current => current.armed ? idle : current);
        setGhost(null);
      }
      return;
    }
    try { run.host.releasePointerCapture(run.pointerId); } catch { /* already released */ }
    finish(null, run);
  }, [finish, reveal]);

  const drop = useCallback(() => {
    const run = runRef.current;
    if (!run) return;
    runRef.current = null;
    if (!enabledRef.current) { finish(null, run); return; }
    try { run.host.releasePointerCapture(run.pointerId); } catch { /* already released */ }
    if (!run.armed) return;
    const player = meRef.current;
    let intent: AbIntent | null = null;
    if (run.payload.kind === 'power') {
      const targetId = targetFromPoint(run.lastClient.x, run.lastClient.y, player?.power.targetDomain ?? '');
      intent = resolveDrop({
        kind: 'power', id: run.payload.id, fromIndex: 0, zone: targetId ? 'target' : 'none', previewIndex: null,
        targetId, boardLength: 0, canBuy: false, canPlay: false, validTarget: !!targetId,
      });
    } else {
      const layout = measure();
      intent = layout ? sample(run, run.lastClient.x, run.lastClient.y, layout).intent : null;
    }
    finish(commitIntent(run.session, lockRef.current, intent), run);
  }, [finish, measure, sample]);

  const onMove = useCallback((event: PointerEvent) => {
    const run = runRef.current;
    if (!run || event.pointerId !== run.pointerId) return;
    // Real mouse events expose a lost button even when pointerup happened
    // outside the window. Synthetic accessibility/test pointers may omit it.
    if (event.isTrusted && event.pointerType === 'mouse' && event.buttons === 0) { cancel(); return; }
    if (!enabledRef.current) { cancel(); return; }
    const dx = event.clientX - run.startClient.x;
    const dy = event.clientY - run.startClient.y;
    if (!run.armed && !passedDragThreshold(dx, dy)) return;
    event.preventDefault();
    if (!run.armed && run.payload.kind === 'power') {
      const powerEl = screenRef.current?.querySelector('[data-testid="ab-hero-power"]');
      const under = document.elementFromPoint(event.clientX, event.clientY);
      if (powerEl && under && powerEl.contains(under)) return;
    }
    const layout = measure();
    if (!layout) return;
    const pointer = clientToStage(event.clientX, event.clientY, layout.root);
    const vx = event.clientX - run.lastClient.x;
    run.lastClient = { x: event.clientX, y: event.clientY };
    run.pointer = pointer;
    if (!run.armed) {
      run.armed = true;
      try { run.host.setPointerCapture(run.pointerId); } catch { /* synthetic pointers */ }
      suppressRef.current = run.source;
      run.source.style.visibility = 'hidden';
      flushSync(() => {
        if (run.minion) { setGhost({ minion: run.minion, full: run.payload.kind === 'hand' }); audioManager.play('ab_pickup'); }
        setView({
          kind: run.payload.kind,
          draggingId: run.payload.id,
          previewIndex: run.payload.kind === 'board' ? run.payload.index : null,
          zone: 'none',
          targetId: null,
          valid: false,
          armed: true,
          settling: false,
          hidden: null,
        });
      });
      run.source.classList.add('is-grabbed');
    }
    const tilt = clampTilt(vx);
    if (!rafRef.current) {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = 0;
        const live = runRef.current;
        if (!live?.armed) return;
        if (live.payload.kind === 'power') applyArrow(live);
        else applyGhost(live, tilt);
      });
    }
    const prev = viewRef.current;
    if (run.payload.kind === 'power') {
      const targetId = targetFromPoint(event.clientX, event.clientY, meRef.current?.power.targetDomain ?? '');
      const next: AbDndView = { ...idle, kind: 'power', draggingId: run.payload.id, zone: targetId ? 'target' : 'none', targetId, valid: !!targetId, armed: true };
      if (prev.targetId !== next.targetId || prev.zone !== next.zone) setView(next);
      return;
    }
    const { zone, preview, intent } = sample(run, event.clientX, event.clientY, layout);
    const next: AbDndView = { ...idle, kind: run.payload.kind, draggingId: run.payload.id, previewIndex: preview, zone, valid: !!intent, armed: true };
    if (prev.zone !== next.zone || prev.previewIndex !== next.previewIndex || prev.valid !== next.valid) setView(next);
  }, [applyArrow, applyGhost, cancel, measure, sample, screenRef]);

  const onLost = useCallback((event: Event) => {
    const run = runRef.current;
    if (!run || (event instanceof PointerEvent && event.pointerId !== run.pointerId)) return;
    if (run.host.isConnected && run.host.hasPointerCapture(run.pointerId)) return;
    cancel();
  }, [cancel]);

  const begin = useCallback((payload: AbDragPayload, event: ReactPointerEvent<HTMLElement>) => {
    if (!enabledRef.current || event.button !== 0 || runRef.current) return;
    const screen = screenRef.current;
    if (!screen) return;
    const root = stageBox(screen);
    const el = event.currentTarget;
    const shown = rectToLocal(el.getBoundingClientRect(), root, STAGE_W, STAGE_H);
    const wrap = payload.kind === 'hand' ? (el.closest('.ab-minion-wrap') as HTMLElement | null) : null;
    const wrapRect = wrap ? rectToLocal(wrap.getBoundingClientRect(), root, STAGE_W, STAGE_H) : null;
    const grabbed = wrapRect && wrapRect.h > 80 ? wrapRect : shown;
    // A pickup while the previous ghost is still landing ends that landing now, so
    // every tile under this gesture is where it looks.
    if (viewRef.current.settling) flushSync(reveal);
    if (settleTimer.current) clearTimeout(settleTimer.current);
    hideGhost();
    // Finish the previous reorder before measuring this gesture's targets.
    settleBoardAnimations(screen);
    const pointer = clientToStage(event.clientX, event.clientY, root);
    const power = localOf(screen.querySelector('[data-testid="ab-hero-power"]'), root, STAGE_W, STAGE_H);
    const run: Run = {
      pointerId: event.pointerId,
      payload,
      grab: (() => {
        const g = grabOffset(pointer, { x: shown.x, y: shown.y });
        const fx = shown.w ? g.x / shown.w : .5, fy = shown.h ? g.y / shown.h : .5;
        return {
          x: Math.max(0, Math.min(grabbed.w, fx * grabbed.w)),
          y: Math.max(0, Math.min(grabbed.h, fy * grabbed.h)),
        };
      })(),
      origin: grabbed,
      startClient: { x: event.clientX, y: event.clientY },
      lastClient: { x: event.clientX, y: event.clientY },
      pointer,
      lastIndex: payload.kind === 'board' ? payload.index : null,
      armed: false,
      minion: findMinion(meRef.current, payload),
      source: event.currentTarget,
      host: screen,
      session: createDragSession(),
      powerOrigin: power ? { x: power.x + power.w / 2, y: power.y + power.h / 2 } : pointer,
      pickScale: grabbed.w ? Math.max(1, shown.w / grabbed.w) : 1,
    };
    runRef.current = run;
    // Capture after pickup: capturing on pointerdown retargets ordinary clicks
    // to the screen and prevents card selection and hero-power activation.
    const move = (ev: PointerEvent) => onMove(ev);
    const up = (ev: PointerEvent) => {
      if (runRef.current?.pointerId !== ev.pointerId) return;
      cleanup();
      drop();
    };
    const fail = () => { cleanup(); cancel(); };
    const key = (ev: KeyboardEvent) => { if (ev.key === 'Escape') { cleanup(); cancel(); } };
    const cleanup = () => {
      run.source.style.visibility = '';
      run.source.classList.remove('is-grabbed');
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', fail);
      window.removeEventListener('blur', fail);
      window.removeEventListener('keydown', key);
      run.host.removeEventListener('lostpointercapture', onLost);
    };
    detachRef.current = cleanup;
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', fail);
    window.addEventListener('blur', fail);
    window.addEventListener('keydown', key);
    run.host.addEventListener('lostpointercapture', onLost);
  }, [cancel, drop, hideGhost, onLost, onMove, reveal, screenRef]);

  useEffect(() => () => { detachRef.current(); if (rafRef.current) cancelAnimationFrame(rafRef.current); if (settleTimer.current) clearTimeout(settleTimer.current); }, []);
  useEffect(() => { if (!enabled) cancel(); }, [enabled, cancel]);

  useLayoutEffect(() => {
    const ghostEl = ghostRef.current;
    const run = runRef.current;
    if (ghostEl && ghost && run?.armed) {
      ghostEl.style.transition = '';
      ghostEl.style.opacity = '';
      ghostEl.style.visibility = 'visible';
      ghostEl.style.width = `${run.origin.w}px`;
      ghostEl.style.height = `${run.origin.h}px`;
      // Start at the size the player saw, settle into the carry scale: no pop at pickup. The tilt follows the first move.
      ghostEl.style.setProperty('--ab-pick-from', (run.pickScale / AB_DND.PICKUP_SCALE).toFixed(3));
      ghostEl.classList.remove('is-picking');
      void ghostEl.offsetWidth;
      ghostEl.classList.add('is-picking');
      applyGhost(run, 0);
    }
  }, [ghost?.minion.id, applyGhost]);

  const api = useMemo<AbDndApi>(() => ({
    ...view,
    begin,
    cancel,
    didDrag: (target?: EventTarget | null) => !!suppressRef.current && (!target || suppressRef.current === target),
    tryLock: (id: string) => lockRef.current.try(id),
  }), [begin, cancel, view]);

  const overlay = (
    <div className="ab-dnd-layer" data-testid="ab-dnd-layer" aria-hidden>
      <div ref={ghostRef} className={`ab-drag-ghost ${ghost?.full ? 'is-hand' : 'is-token'}`} data-testid="ab-drag-ghost" style={{ visibility: ghost ? 'visible' : 'hidden' }}>
        {ghost && <MinionTile minion={ghost.minion} catalog={catalog} ghost fullCard={ghost.full} />}
      </div>
      <svg className={`ab-aim-arrow ${view.kind === 'power' && view.armed ? 'is-live' : ''}`} data-testid="ab-aim-arrow" viewBox={`0 0 ${STAGE_W} ${STAGE_H}`}>
        <path ref={pathRef} className="ab-aim-line" fill="none" />
        <polygon ref={headRef} className="ab-aim-head" />
      </svg>
    </div>
  );

  return { api, overlay, ghostRef };
}
