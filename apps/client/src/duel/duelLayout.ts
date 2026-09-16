import { lineStarts } from '../battlegrounds/battlegroundsLayout';

/**
 * 1v1 table in 1600×900 stage pixels under the 38px header (table-local y):
 *   foe hero 4–150 · foe row 176–346 · fuse 384 · my row 404–574 · my hero dock 600–780 · hand 640–862 · right rail: end turn, hourglass, deck.
 */
export const DUEL = {
  HEADER_H: 38,
  TABLE_W: 1600,
  TABLE_H: 862,
  MINION_W: 150,
  MINION_H: 170,
  FOE_ROW_Y: 176,
  MY_ROW_Y: 404,
  ROW_MAX_W: 1180,
  HAND_Y: 640,
  HAND_LEFT: 440,
  HAND_W: 720,
  /** GameCard (216×300) zoomed to this in the hand. */
  HAND_SCALE: .6,
  RAIL_X: 1190,
} as const;

/** Left edges of a centred minion row (same spacing rule as the Battlegrounds board). */
export function rowXs(count: number): number[] {
  return lineStarts(count, DUEL.MINION_W, DUEL.TABLE_W / 2, DUEL.ROW_MAX_W);
}

/** Overlap between hand cards so ten still fit the hand band. */
export function handOverlap(count: number): number {
  const cardW = 216 * DUEL.HAND_SCALE + 10;
  if (count <= 1) return 0;
  return Math.max(0, (count * cardW - DUEL.HAND_W) / (count - 1));
}
