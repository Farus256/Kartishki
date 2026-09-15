import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AB_LAYOUT, combatRowXs, handOverlap, lineCenter, lineGap, lineStarts } from '../apps/client/src/battlegrounds/battlegroundsLayout';
import { previewBoard as previewSlots } from '../apps/client/src/battlegrounds/pointerDnd';

const CENTER = 800;
const MAX = AB_LAYOUT.BOARD_MAX_W;

test('adding Hand cards does not shrink the group or invade Hero controls', () => {
  let previous = 0;
  for (let count = 1; count <= 10; count++) {
    const width = count * AB_LAYOUT.HAND_W - (count - 1) * handOverlap(count);
    assert.ok(width >= previous - .01);
    assert.ok(width <= 700.01);
    previous = width;
  }
});

test('board groups 1–7 stay on the battlefield center', () => {
  for (let n = 1; n <= 7; n++) {
    const xs = lineStarts(n, AB_LAYOUT.MINION_W, CENTER, MAX);
    assert.equal(xs.length, n);
    assert.ok(Math.abs(lineCenter(xs, AB_LAYOUT.MINION_W) - CENTER) < 0.5, `n=${n}`);
    assert.ok(xs[0]! >= CENTER - MAX / 2 - 0.5);
    assert.ok(xs[n - 1]! + AB_LAYOUT.MINION_W <= CENTER + MAX / 2 + 0.5);
  }
});

test('odd counts put the middle minion on the center axis', () => {
  for (const n of [1, 3, 5, 7]) {
    const xs = lineStarts(n, AB_LAYOUT.MINION_W, CENTER, MAX);
    const mid = xs[(n - 1) / 2]! + AB_LAYOUT.MINION_W / 2;
    assert.ok(Math.abs(mid - CENTER) < 0.5, `n=${n}`);
  }
});

test('even counts split evenly around center', () => {
  for (const n of [2, 4, 6]) {
    const xs = lineStarts(n, AB_LAYOUT.MINION_W, CENTER, MAX);
    const left = xs[n / 2 - 1]! + AB_LAYOUT.MINION_W;
    const right = xs[n / 2]!;
    assert.ok(Math.abs((left + right) / 2 - CENTER) < 0.5, `n=${n}`);
  }
});

test('spacing tightens with population but never overlaps', () => {
  assert.equal(lineGap(1), 42);
  assert.equal(lineGap(4), 30);
  assert.equal(lineGap(7), 18);
  const xs = lineStarts(7, AB_LAYOUT.MINION_W, CENTER, MAX);
  for (let i = 1; i < xs.length; i++) {
    assert.ok(xs[i]! - xs[i - 1]! >= AB_LAYOUT.MINION_W + 4);
  }
});

test('shop and combat rows use the same centering rule', () => {
  const shop = lineStarts(3, AB_LAYOUT.TAVERN_W, CENTER, MAX);
  assert.ok(Math.abs(lineCenter(shop, AB_LAYOUT.TAVERN_W) - CENTER) < 0.5);
  const combat = combatRowXs(7);
  assert.ok(Math.abs(lineCenter(combat, AB_LAYOUT.MINION_W) - AB_LAYOUT.COMBAT_W / 2) < 0.5);
});

test('preview line is compact and recenters around a gap, not seven empty slots', () => {
  const board = [0, 1, 2, 3].map(n => ({ id: `m${n}` }));
  const four = previewSlots(board, null, null);
  assert.deepEqual(four.map(item => item?.id), ['m0', 'm1', 'm2', 'm3']);
  const insert = previewSlots(board, null, 2);
  assert.deepEqual(insert.map(item => item?.id), ['m0', 'm1', undefined, 'm2', 'm3']);
  const reorder = previewSlots([0, 1, 2, 3, 4, 5, 6].map(n => ({ id: `m${n}` })), 'm0', 3);
  assert.deepEqual(reorder.map(item => item?.id), ['m1', 'm2', 'm3', undefined, 'm4', 'm5', 'm6']);
});
