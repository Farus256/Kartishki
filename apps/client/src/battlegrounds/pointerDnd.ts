export type AbDragKind = 'shop' | 'board' | 'hand' | 'power';
export type AbDragPayload = { kind: AbDragKind; id: string; index: number };
export type DropZone = 'none' | 'buy' | 'sell' | 'board' | 'target';
export type AbIntent =
  | { type: 'buy'; id: string }
  | { type: 'play'; id: string; index: number }
  | { type: 'move'; id: string; index: number }
  | { type: 'sell'; id: string }
  | { type: 'power'; id?: string };

export type Rect = { left: number; top: number; width: number; height: number };
export type LocalRect = { x: number; y: number; w: number; h: number };

export const AB_DND = {
  THRESHOLD_PX: 6,
  HYSTERESIS: 18,
  PICKUP_SCALE: 1.07,
  SNAP_MS: 140,
  RETURN_MS: 170,
  SLIDE_MS: 140,
  PENDING_MS: 280,
  BUY_PAD: 48,
  SELL_PAD: 40,
  BOARD_PAD: 20,
  MAX_BOARD: 7,
  Z_LAYER: 20,
} as const;

export function clientToLocal(clientX: number, clientY: number, root: Rect, localW: number, localH: number): { x: number; y: number } {
  if (!root.width || !root.height) return { x: clientX - root.left, y: clientY - root.top };
  return {
    x: (clientX - root.left) * (localW / root.width),
    y: (clientY - root.top) * (localH / root.height),
  };
}

export function rectToLocal(rect: Rect, root: Rect, localW: number, localH: number): LocalRect {
  const tl = clientToLocal(rect.left, rect.top, root, localW, localH);
  const br = clientToLocal(rect.left + rect.width, rect.top + rect.height, root, localW, localH);
  return { x: tl.x, y: tl.y, w: br.x - tl.x, h: br.y - tl.y };
}

export function grabOffset(pointer: { x: number; y: number }, card: { x: number; y: number }): { x: number; y: number } {
  return { x: pointer.x - card.x, y: pointer.y - card.y };
}

export function inflate(rect: LocalRect, pad: number): LocalRect {
  return { x: rect.x - pad, y: rect.y - pad, w: rect.w + pad * 2, h: rect.h + pad * 2 };
}

export function contains(rect: LocalRect, x: number, y: number): boolean {
  return x >= rect.x && y >= rect.y && x <= rect.x + rect.w && y <= rect.y + rect.h;
}

export function union(a?: LocalRect, b?: LocalRect): LocalRect | undefined {
  if (!a) return b;
  if (!b) return a;
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

export function insertionIndex(pointerX: number, centers: readonly number[], last: number | null, hysteresis: number, maxIndex: number): number {
  if (!centers.length) return 0;
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < centers.length; i++) {
    const distance = Math.abs(pointerX - centers[i]!);
    if (distance < bestDist) { bestDist = distance; best = i; }
  }
  if (last !== null && last >= 0 && last < centers.length && last !== best) {
    const stay = Math.abs(pointerX - centers[last]!);
    if (stay <= bestDist + hysteresis) best = last;
  }
  return Math.max(0, Math.min(maxIndex, best));
}

/** Compact line + optional gap. Never pads to seven empty inventory slots. */
export function previewBoard<T extends { id: string }>(board: readonly T[], draggedId: string | null, previewIndex: number | null): Array<T | undefined> {
  const remaining = draggedId ? board.filter(minion => minion.id !== draggedId) : [...board];
  if (previewIndex === null) return remaining;
  const gap = Math.max(0, Math.min(remaining.length, previewIndex));
  const slots: Array<T | undefined> = [...remaining];
  slots.splice(gap, 0, undefined);
  return slots;
}

export function hitZone(kind: AbDragKind, point: { x: number; y: number }, areas: { buy?: LocalRect; sell?: LocalRect; board?: LocalRect }): DropZone {
  if (kind === 'power') return 'none';
  if ((kind === 'board' || kind === 'hand') && areas.sell && contains(areas.sell, point.x, point.y)) return 'sell';
  // A purchase needs a deliberate pull: only the hero/hand band buys, hovering the board does not.
  if (kind === 'shop' && areas.buy && contains(areas.buy, point.x, point.y)) return 'buy';
  if ((kind === 'board' || kind === 'hand') && areas.board && contains(areas.board, point.x, point.y)) return 'board';
  return 'none';
}

export type ResolveInput = {
  kind: AbDragKind;
  id: string;
  fromIndex: number;
  zone: DropZone;
  previewIndex: number | null;
  targetId: string | null;
  boardLength: number;
  canBuy: boolean;
  canPlay: boolean;
  validTarget: boolean;
};

export function resolveDrop(input: ResolveInput): AbIntent | null {
  if (input.kind === 'shop') {
    if (input.zone === 'buy' && input.canBuy) return { type: 'buy', id: input.id };
    return null;
  }
  if ((input.kind === 'hand' || input.kind === 'board') && input.zone === 'sell') {
    return { type: 'sell', id: input.id };
  }
  if (input.kind === 'hand' && input.zone === 'board') {
    if (!input.canPlay) return null;
    const index = input.previewIndex ?? input.boardLength;
    return { type: 'play', id: input.id, index };
  }
  if (input.kind === 'board' && input.zone === 'board') {
    const index = input.previewIndex ?? input.fromIndex;
    if (index === input.fromIndex) return null;
    return { type: 'move', id: input.id, index };
  }
  if (input.kind === 'power' && input.validTarget && input.targetId) {
    return { type: 'power', id: input.targetId };
  }
  return null;
}

export function createPendingLock(ms: number = AB_DND.PENDING_MS) {
  const until = new Map<string, number>();
  return {
    try(id: string, now = Date.now()): boolean {
      if ((until.get(id) ?? 0) > now) return false;
      until.set(id, now + ms);
      return true;
    },
    blocked(id: string, now = Date.now()): boolean {
      return (until.get(id) ?? 0) > now;
    },
    reset(): void { until.clear(); },
  };
}

export function createDragSession() {
  let released = false;
  return {
    consumeRelease(): boolean {
      if (released) return false;
      released = true;
      return true;
    },
    released(): boolean { return released; },
  };
}

export function commitIntent(session: { consumeRelease(): boolean }, lock: { try(id: string): boolean }, intent: AbIntent | null): AbIntent | null {
  if (!intent || !session.consumeRelease()) return null;
  return lock.try(intentKey(intent)) ? intent : null;
}

export function intentKey(intent: AbIntent): string {
  if (intent.type === 'power') return `power:${intent.id ?? 'self'}`;
  return intent.id;
}

export function aimCurve(sx: number, sy: number, ex: number, ey: number): { d: string; head: string; angle: number } {
  const dx = ex - sx;
  const dist = Math.hypot(dx, ey - sy);
  const lift = Math.min(80, dist * 0.25 + 24);
  const c1x = sx + dx * 0.25;
  const c1y = sy - lift;
  const c2x = ex - dx * 0.15;
  const c2y = ey - lift * 0.4;
  // Tangent at the cubic's tip (P3 − P2).
  const angle = Math.atan2(ey - c2y, ex - c2x);
  // Head caps the arc: shaft stops at the base, tip sits on the pointer.
  const len = Math.min(22, Math.max(12, dist * 0.12));
  const half = len * 0.55;
  const bx = ex - len * Math.cos(angle);
  const by = ey - len * Math.sin(angle);
  const left = `${bx - half * Math.sin(angle)},${by + half * Math.cos(angle)}`;
  const right = `${bx + half * Math.sin(angle)},${by - half * Math.cos(angle)}`;
  return {
    d: `M ${sx} ${sy} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${bx} ${by}`,
    head: `${ex},${ey} ${left} ${right}`,
    angle,
  };
}

export function clampTilt(vx: number): number {
  return Math.max(-7, Math.min(7, vx * 0.18));
}
