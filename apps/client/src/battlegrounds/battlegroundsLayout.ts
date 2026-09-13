/** One 1600×900 source of truth for Battlegrounds spacing. CSS and Pixi both read this. */
export const AB_LAYOUT = {
  STAGE_W: 1600,
  STAGE_H: 900,
  HEADER_H: 38,
  LEADERBOARD_W: 154,
  MINION_W: 150,
  MINION_H: 170,
  TAVERN_W: 150,
  TAVERN_H: 170,
  HAND_W: 124,
  HAND_H: 178,
  DISCOVER_W: 230,
  HERO: 88,
  POWER_W: 156,
  BOARD_MAX_W: 1180,
  COMBAT_W: 1260,
  COMBAT_H: 842,
  COMBAT_ENEMY_Y: 204,
  COMBAT_PLAYER_Y: 426,
  SLIDE_MS: 130,
  FLY_MS: 320,
} as const;

export function lineGap(count: number): number {
  if (count <= 3) return 20;
  if (count <= 5) return 12;
  return 6;
}

export function tavernGap(count: number): number {
  if (count <= 3) return 16;
  if (count <= 5) return 12;
  return 8;
}

export function handOverlap(count: number): number {
  if (count <= 1) return 0;
  return Math.min(90, Math.max(18, (count * AB_LAYOUT.HAND_W - 460) / (count - 1)));
}

/** Left edges of a centered group. */
export function lineStarts(
  count: number,
  unit: number,
  centerX: number,
  maxWidth: number,
  gap = lineGap(count),
): number[] {
  if (count <= 0) return [];
  let g = gap;
  let width = unit * count + g * Math.max(0, count - 1);
  if (count > 1 && width > maxWidth) {
    g = Math.max(4, (maxWidth - unit * count) / (count - 1));
    width = unit * count + g * (count - 1);
  }
  const start = centerX - width / 2;
  return Array.from({ length: count }, (_, i) => start + i * (unit + g));
}

export function lineCenter(starts: number[], unit: number): number {
  if (!starts.length) return 0;
  return (starts[0]! + starts[starts.length - 1]! + unit) / 2;
}

export function combatRowXs(count: number, canvasW = AB_LAYOUT.COMBAT_W): number[] {
  return lineStarts(count, AB_LAYOUT.MINION_W, canvasW / 2, canvasW - 80);
}
