/** Design-pixel insertion + drag threshold. Preview only — does not mutate the board. */

export const DRAG_THRESHOLD_PX = 6;
export const INSERT_HYSTERESIS_PX = 8;

export function passedDragThreshold(dx: number, dy: number, threshold = DRAG_THRESHOLD_PX): boolean {
  return dx * dx + dy * dy >= threshold * threshold;
}

/** Insertion 0..centers.length from pointer X vs remaining-minion centers. */
export function insertionIndex(
  pointerX: number,
  centers: number[],
  prev = -1,
  deadzone = INSERT_HYSTERESIS_PX,
): number {
  if (centers.length === 0) return 0;
  let next = 0;
  for (let i = 0; i < centers.length; i++) {
    if (pointerX >= centers[i]!) next = i + 1;
  }
  if (prev < 0 || prev === next) return next;
  if (next > prev) {
    const gate = centers[prev]! + deadzone;
    if (pointerX < gate) return prev;
  } else {
    const gate = centers[next]! - deadzone;
    if (pointerX > gate) return prev;
  }
  return next;
}

/**
 * tryMoveBoard splices `from` then insertAt(toIndex).
 * `preview` is the gap among remaining minions (0..len-1).
 */
export function moveToIndex(previewAmongRemaining: number, boardLength: number): number {
  if (boardLength <= 0) return 0;
  return Math.max(0, Math.min(previewAmongRemaining, boardLength - 1));
}

export function playToIndex(preview: number, boardLength: number): number {
  return Math.max(0, Math.min(preview, boardLength));
}

export function canPlayToBoard(boardLength: number, limit = 7): boolean {
  return boardLength < limit;
}

export function createIntentLock(): {
  tryBegin: (key: string) => boolean;
  end: (key: string) => void;
  clear: () => void;
  has: (key: string) => boolean;
} {
  const pending = new Set<string>();
  return {
    tryBegin(key: string) {
      if (pending.has(key)) return false;
      pending.add(key);
      return true;
    },
    end(key: string) { pending.delete(key); },
    clear() { pending.clear(); },
    has(key: string) { return pending.has(key); },
  };
}
