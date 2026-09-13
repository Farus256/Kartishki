import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import { AUTO_BATTLER, type AutoBattlerCatalog } from '@kartishki/shared';
import type { AbMinion, AbPlayer } from '../autoBattlerSession';
import { clientToStage, STAGE_H, STAGE_W } from '../ui/stageCoords';
import { canPlayToBoard, passedDragThreshold, playToIndex } from './pointerMath';
import { type AbDndApi, type AbDndView } from './abDndContext';
import { MinionTile } from './MinionTile';
import { isSpell } from './minionView';
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

function stageBox(screen: HTMLElement): DOMRect {
  return (document.querySelector('[data-stage]') ?? screen).getBoundingClientRect();
}

const idle: AbDndView = { kind: null, draggingId: null, previewIndex: null, zone: 'none', targetId: null, valid: false, armed: false };

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
  insertionCenters: number[] | null;
};

type Opts = {
  enabled: boolean;
  me: AbPlayer | undefined;
  catalog: AutoBattlerCatalog;
  screenRef: RefObject<HTMLElement | null>;
  onIntent: (intent: AbIntent) => void;
  flightFrom?: RefObject<Map<string, DOMRect>>;
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

function targetFromPoint(clientX: number, clientY: number, domain: string): string | null {
  const stack = document.elementsFromPoint(clientX, clientY);
  for (const node of stack) {
    const hit = node instanceof Element ? node.closest('[data-ab-target]') : null;
    if (!(hit instanceof HTMLElement)) continue;
    if (hit.dataset.abTarget === domain) return hit.dataset.abId ?? null;
  }
  return null;
}

function over(clientX: number, clientY: number, selector: string): boolean {
  return document.elementsFromPoint(clientX, clientY).some(node => node instanceof Element && node.closest(selector));
}

/** Viewport-pixel slot centers. CSS zoom makes stage-space X miss the hole the user sees. */
function clientBoardCenters(screen: HTMLElement): number[] {
  const centers = [...screen.querySelectorAll<HTMLElement>('[data-ab-slot]')]
    .filter(slot => !slot.classList.contains('is-well') && !slot.closest('.ab-drag-hold'))
    .sort((a, b) => Number(a.dataset.abSlot ?? 0) - Number(b.dataset.abSlot ?? 0))
    .map(slot => {
      const box = slot.getBoundingClientRect();
      return box.left + box.width / 2;
    });
  if (centers.length) {
    const stride = centers.length > 1 ? Math.max(40, centers[1]! - centers[0]!) : 120;
    centers.push(centers[centers.length - 1]! + stride);
  }
  return centers;
}

function boardInsertIndex(run: Run, clientX: number, _clientY: number, maxIndex: number): number {
  if (!run.insertionCenters) run.insertionCenters = clientBoardCenters(run.host);
  return insertionIndex(clientX, run.insertionCenters, run.lastIndex, 12, maxIndex);
}

function zoneAt(kind: AbDragKind, clientX: number, clientY: number, point: { x: number; y: number }, areas: { buy?: LocalRect; sell?: LocalRect; board?: LocalRect }): DropZone {
  if ((kind === 'board' || kind === 'hand') && over(clientX, clientY, '[data-testid="ab-sell-zone"]')) return 'sell';
  if (kind === 'shop' && (over(clientX, clientY, '[data-testid="ab-hero"]') || over(clientX, clientY, '[data-testid="ab-hand"]') || over(clientX, clientY, '.ab-buy-zone') || over(clientX, clientY, '[data-testid="ab-board"]'))) return 'buy';
  if ((kind === 'board' || kind === 'hand') && over(clientX, clientY, '[data-testid="ab-board"]')) return 'board';
  return hitZone(kind, point, areas);
}

export function useAbPointerDnd({ enabled, me, catalog, screenRef, onIntent, flightFrom }: Opts) {
  const [view, setView] = useState<AbDndView>(idle);
  const viewRef = useRef(view);
  viewRef.current = view;
  const runRef = useRef<Run | null>(null);
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
  const [ghost, setGhost] = useState<AbMinion | null>(null);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const applyGhost = useCallback((run: Run, tilt: number) => {
    const ghostEl = ghostRef.current;
    if (!ghostEl) return;
    ghostEl.style.transformOrigin = `${run.grab.x}px ${run.grab.y}px`;
    ghostEl.style.transform = `translate3d(${run.pointer.x - run.grab.x}px,${run.pointer.y - run.grab.y}px,0) scale(${AB_DND.PICKUP_SCALE}) rotate(${tilt}deg)`;
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
    const centers = [...screen.querySelectorAll<HTMLElement>('[data-testid^="ab-board-slot-"]')]
      .filter(slot => !slot.classList.contains('is-well'))
      .sort((a, b) => Number(a.dataset.abSlot ?? 0) - Number(b.dataset.abSlot ?? 0))
      .map(slot => {
        const box = rectToLocal(slot.getBoundingClientRect(), root, STAGE_W, STAGE_H);
        return box.x + box.w / 2;
      });
    if (centers.length) {
      const stride = centers.length > 1 ? Math.max(48, centers[1]! - centers[0]!) : 160;
      centers.push(centers[centers.length - 1]! + stride);
    }
    // A new placeholder recenters the row. Keep pointer boundaries stable while
    // it moves, so that the preview cannot push itself into the next index.
    const run = runRef.current;
    if (run?.payload.kind === 'hand' && !run.insertionCenters) run.insertionCenters = centers;
    return {
      root,
      buy: buy ? inflate(buy, AB_DND.BUY_PAD) : undefined,
      sell: sell ? inflate(sell, AB_DND.SELL_PAD) : undefined,
      board: board ? inflate(board, AB_DND.BOARD_PAD) : undefined,
      centers: run?.insertionCenters ?? centers,
    };
  }, [screenRef]);

  const finish = useCallback((intent: AbIntent | null, snapBack: boolean) => {
    const run = runRef.current;
    runRef.current = null;
    const ghostEl = ghostRef.current;
    const source = run?.source;
    if (source) {
      suppressRef.current = source;
      window.setTimeout(() => { if (suppressRef.current === source) suppressRef.current = null; }, 40);
    }
    const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const ms = reduced || intent ? 0 : snapBack ? AB_DND.RETURN_MS : AB_DND.SNAP_MS;
    if (intent && run?.source) {
      const box = run.source.getBoundingClientRect();
      if (box.width > 2) flightFrom?.current.set(run.payload.id, box);
    }
    if (intent) intentRef.current(intent);
    setView(idle);
    const done = () => {
      if (ghostEl) {
        ghostEl.style.transition = '';
        ghostEl.style.visibility = 'hidden';
      }
      setGhost(null);
    };
    if (ghostEl && run && ms) {
      ghostEl.style.transition = `transform ${ms}ms ease`;
      if (snapBack) {
        ghostEl.style.transform = `translate3d(${run.origin.x}px,${run.origin.y}px,0) scale(1)`;
      } else {
        ghostEl.style.transform += ' scale(0.96)';
      }
      settleTimer.current = setTimeout(done, ms);
    } else done();
  }, [flightFrom]);

  const cancel = useCallback(() => {
    detachRef.current();
    detachRef.current = () => {};
    const run = runRef.current;
    if (!run) {
      setView(current => current.armed ? idle : current);
      setGhost(null);
      return;
    }
    try { run.host.releasePointerCapture(run.pointerId); } catch { /* already released */ }
    finish(null, run.armed);
  }, [finish]);

  const drop = useCallback(() => {
    const run = runRef.current;
    if (!run) return;
    if (!enabledRef.current) { finish(null, false); return; }
    try { run.host.releasePointerCapture(run.pointerId); } catch { /* already released */ }
    if (!run.armed) { runRef.current = null; return; }
    const player = meRef.current;
    const layout = measure();
    const domain = player?.power.targetDomain ?? '';
    const targetId = run.payload.kind === 'power' ? targetFromPoint(run.lastClient.x, run.lastClient.y, domain) : null;
    const zone = run.payload.kind === 'power'
      ? (targetId ? 'target' : 'none')
      : layout ? zoneAt(run.payload.kind, run.lastClient.x, run.lastClient.y, run.pointer, layout) : viewRef.current.zone;
    const maxIndex = run.payload.kind === 'board'
      ? Math.max(0, (player?.board.length ?? 1) - 1)
      : Math.min(AB_DND.MAX_BOARD, player?.board.length ?? 0);
    const preview = zone === 'board'
      ? (run.payload.kind === 'hand' && layout
        ? playToIndex(insertionIndex(run.pointer.x, layout.centers, run.lastIndex, AB_DND.HYSTERESIS, maxIndex), player?.board.length ?? 0)
        : run.payload.kind === 'board'
          ? boardInsertIndex(run, run.lastClient.x, run.lastClient.y, maxIndex)
          : viewRef.current.previewIndex)
      : viewRef.current.previewIndex;
    const intent = resolveDrop({
      kind: run.payload.kind,
      id: run.payload.id,
      fromIndex: run.payload.index,
      zone,
      previewIndex: preview,
      targetId,
      boardLength: player?.board.length ?? 0,
      canBuy: !!player && player.gold >= AUTO_BATTLER.BUY_COST && player.hand.length < AUTO_BATTLER.HAND_LIMIT,
      canPlay: !!player && (canPlayToBoard(player.board.length) || (!!run.minion && isSpell(run.minion))),
      validTarget: !!targetId,
    });
    const committed = commitIntent(run.session, lockRef.current, intent);
    finish(committed, !committed);
  }, [finish, measure]);

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
      setGhost(run.minion);
      setView({
        kind: run.payload.kind,
        draggingId: run.payload.id,
        previewIndex: run.payload.kind === 'board' || run.payload.kind === 'hand' ? run.payload.index : null,
        zone: 'none',
        targetId: null,
        valid: false,
        armed: true,
      });
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
    const player = meRef.current;
    if (run.payload.kind === 'power') {
      const domain = player?.power.targetDomain ?? '';
      const targetId = targetFromPoint(event.clientX, event.clientY, domain);
      const next = { kind: run.payload.kind, draggingId: run.payload.id, previewIndex: null as number | null, zone: (targetId ? 'target' : 'none') as DropZone, targetId, valid: !!targetId, armed: true };
      const prev = viewRef.current;
      if (prev.targetId !== next.targetId || prev.valid !== next.valid || prev.zone !== next.zone) setView(next);
      return;
    }
    const zone = zoneAt(run.payload.kind, event.clientX, event.clientY, pointer, layout);
    const maxIndex = run.payload.kind === 'board'
      ? Math.max(0, (player?.board.length ?? 1) - 1)
      : Math.min(AB_DND.MAX_BOARD, player?.board.length ?? 0);
    const preview = zone === 'board'
      ? (run.payload.kind === 'hand'
        ? playToIndex(insertionIndex(pointer.x, layout.centers, run.lastIndex, AB_DND.HYSTERESIS, maxIndex), player?.board.length ?? 0)
        : boardInsertIndex(run, event.clientX, event.clientY, maxIndex))
      : null;
    if (preview !== null) run.lastIndex = preview;
    const sample = resolveDrop({
      kind: run.payload.kind,
      id: run.payload.id,
      fromIndex: run.payload.index,
      zone,
      previewIndex: preview,
      targetId: null,
      boardLength: player?.board.length ?? 0,
      canBuy: !!player && player.gold >= AUTO_BATTLER.BUY_COST && player.hand.length < AUTO_BATTLER.HAND_LIMIT,
      canPlay: !!player && (canPlayToBoard(player.board.length) || (!!run.minion && isSpell(run.minion))),
      validTarget: false,
    });
    const next: AbDndView = { kind: run.payload.kind, draggingId: run.payload.id, previewIndex: preview, zone, targetId: null, valid: !!sample, armed: true };
    const prev = viewRef.current;
    if (prev.zone !== next.zone || prev.previewIndex !== next.previewIndex || prev.valid !== next.valid) setView(next);
  }, [applyArrow, applyGhost, cancel, measure]);

  const onLost = useCallback((event: Event) => {
    const run = runRef.current;
    if (!run || (event instanceof PointerEvent && event.pointerId !== run.pointerId)) return;
    if (run.host.isConnected && run.host.hasPointerCapture(run.pointerId)) return;
    cancel();
  }, [cancel]);

  const begin = useCallback((payload: AbDragPayload, event: ReactPointerEvent<HTMLElement>) => {
    if (!enabledRef.current || event.button !== 0 || runRef.current) return;
    if (settleTimer.current) clearTimeout(settleTimer.current);
    setGhost(null);
    if (ghostRef.current) ghostRef.current.style.transition = '';
    const screen = screenRef.current;
    if (!screen) return;
    // Finish the previous reorder before measuring this gesture's targets.
    screen.querySelectorAll('.ab-board .ab-minion').forEach(el => el.getAnimations().forEach(animation => animation.finish()));
    const root = stageBox(screen);
    const src = event.currentTarget.getBoundingClientRect();
    const pointer = clientToStage(event.clientX, event.clientY, root);
    const card = rectToLocal(src, root, STAGE_W, STAGE_H);
    const power = localOf(screen.querySelector('[data-testid="ab-hero-power"]'), root, STAGE_W, STAGE_H);
    const run: Run = {
      pointerId: event.pointerId,
      payload,
      grab: grabOffset(pointer, { x: card.x, y: card.y }),
      origin: card,
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
      insertionCenters: payload.kind === 'board' ? clientBoardCenters(screen) : null,
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
  }, [cancel, drop, onLost, onMove, screenRef]);

  useEffect(() => () => { detachRef.current(); if (rafRef.current) cancelAnimationFrame(rafRef.current); if (settleTimer.current) clearTimeout(settleTimer.current); }, []);
  useEffect(() => { if (!enabled) cancel(); }, [enabled, cancel]);

  useEffect(() => {
    const ghostEl = ghostRef.current;
    const run = runRef.current;
    if (ghostEl && run?.armed && run.minion) {
      ghostEl.style.visibility = 'visible';
      ghostEl.style.width = `${run.origin.w}px`;
      ghostEl.style.height = `${run.origin.h}px`;
      applyGhost(run, 2);
    }
  }, [ghost, applyGhost]);

  const api = useMemo<AbDndApi>(() => ({
    ...view,
    begin,
    cancel,
    didDrag: (target?: EventTarget | null) => !!suppressRef.current && (!target || suppressRef.current === target),
    tryLock: (id: string) => lockRef.current.try(id),
  }), [begin, cancel, view]);

  const overlay = (
    <div className="ab-dnd-layer" data-testid="ab-dnd-layer" aria-hidden>
      <div ref={ghostRef} className="ab-drag-ghost" data-testid="ab-drag-ghost" style={{ visibility: ghost ? 'visible' : 'hidden' }}>
        {ghost && <MinionTile minion={ghost} catalog={catalog} ghost fullCard={runRef.current?.payload.kind === 'hand'} />}
      </div>
      <svg className="ab-aim-arrow" data-testid="ab-aim-arrow" style={{ display: view.kind === 'power' && view.armed ? 'block' : 'none' }}>
        <path ref={pathRef} fill="none" stroke="#1a1a1a" strokeWidth="3" />
        <polygon ref={headRef} fill="#1a1a1a" />
      </svg>
    </div>
  );

  return { api, overlay, ghostRef };
}
