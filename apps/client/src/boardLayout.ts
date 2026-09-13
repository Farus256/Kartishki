import { CARD_RATIO } from './ui/cardLayout';
/** Logical battle desk. Pixi draws in these pixels, then letterboxes into the canvas. */
export const BOARD_W = 1600;
export const BOARD_H = 900;
export const CARD_W = 180;
export const CARD_H = Math.round(CARD_W * CARD_RATIO);
export const HAND_STEP = 118;
export const MINION_STEP = 194;

export function centeredRow(count: number, index: number, step: number, width: number) {
  const span = Math.max(0, count - 1) * step;
  return (BOARD_W - span) / 2 - width / 2 + index * step;
}

export function handPos(count: number, index: number) {
  return { x: centeredRow(count, index, HAND_STEP, CARD_W), y: BOARD_H - CARD_H - 18, rotation: 0 };
}

export function minionPos(count: number, index: number, own: boolean) {
  return { x: centeredRow(count, index, MINION_STEP, CARD_W), y: own ? 340 : 78 };
}

export function heroPos(own: boolean) {
  return own ? { x: 54, y: 658, w: 224, h: 172 } : { x: (BOARD_W - 420) / 2, y: 5, w: 420, h: 68 };
}

export function handClick(count: number, index: number) {
  const p = handPos(count, index);
  return { x: p.x + CARD_W / 2, y: p.y + CARD_H / 2 };
}

export function minionClick(count: number, index: number, own: boolean) {
  const p = minionPos(count, index, own);
  return { x: p.x + CARD_W / 2, y: p.y + CARD_H / 2 };
}

export function heroClick(own: boolean) {
  const p = heroPos(own);
  return { x: p.x + p.w / 2, y: p.y + p.h / 2 };
}

export function inPlayZone(x: number, y: number) {
  const row = minionPos(1, 0, true);
  return y > row.y - 30 && y < row.y + CARD_H + 40 && x > 48 && x < BOARD_W - 48;
}

export function hitHero(x: number, y: number, own: boolean) {
  const h = heroPos(own);
  return x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h;
}

export function hitMinionIndex(x: number, y: number, count: number, own: boolean) {
  for (let i = 0; i < count; i++) {
    const p = minionPos(count, i, own);
    if (x >= p.x && x <= p.x + CARD_W && y >= p.y && y <= p.y + CARD_H) return i;
  }
  return -1;
}
