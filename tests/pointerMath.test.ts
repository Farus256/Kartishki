import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  canPlayToBoard,
  createIntentLock,
  moveToIndex,
  passedDragThreshold,
  playToIndex,
} from '../apps/client/src/battlegrounds/pointerMath';
import { insertionIndex } from '../apps/client/src/battlegrounds/pointerDnd';
import { clientToStage, STAGE_W } from '../apps/client/src/ui/stageCoords';

const centers = [200, 400, 600, 800, 1000];

test('threshold ignores jitter, accepts a real pull', () => {
  assert.equal(passedDragThreshold(3, 2), false);
  assert.equal(passedDragThreshold(5, 4), true);
});

test('insertion uses the live nearest-center formula', () => {
  assert.equal(insertionIndex(50, [], null, 8, 0), 0);
  assert.equal(insertionIndex(100, centers, null, 8, 5), 0);
  assert.equal(insertionIndex(400, centers, null, 8, 5), 1);
  assert.equal(insertionIndex(1200, centers, null, 8, 5), 4);
});

test('move dest matches server splice-then-insert (0→6, 6→0, 2→4)', () => {
  assert.equal(moveToIndex(6, 7), 6);
  assert.equal(moveToIndex(0, 7), 0);
  assert.equal(moveToIndex(4, 7), 4);
});

test('play index: start, middle, end; full board blocked', () => {
  assert.equal(playToIndex(0, 3), 0);
  assert.equal(playToIndex(2, 3), 2);
  assert.equal(playToIndex(3, 3), 3);
  assert.equal(canPlayToBoard(7), false);
  assert.equal(canPlayToBoard(6), true);
});

test('intent lock rejects a second release on the same entity', () => {
  const lock = createIntentLock();
  assert.equal(lock.tryBegin('buy:offer-1'), true);
  assert.equal(lock.tryBegin('buy:offer-1'), false);
  lock.end('buy:offer-1');
  assert.equal(lock.tryBegin('buy:offer-1'), true);
});

test('1366 and 2560 map the same design X to the same insertion', () => {
  const designX = 700;
  const letterbox = (viewW: number, viewH: number) => {
    const frameW = Math.min(viewW, viewH * 16 / 9);
    const frameH = frameW * 9 / 16;
    const left = (viewW - frameW) / 2;
    const top = (viewH - frameH) / 2;
    return { left, top, width: frameW, height: frameH };
  };
  const a = letterbox(1366, 768);
  const b = letterbox(2560, 1440);
  const clientA = a.left + designX * (a.width / STAGE_W);
  const clientB = b.left + designX * (b.width / STAGE_W);
  const xa = clientToStage(clientA, a.top + 100, a).x;
  const xb = clientToStage(clientB, b.top + 100, b).x;
  assert.ok(Math.abs(xa - designX) < 0.5);
  assert.ok(Math.abs(xb - designX) < 0.5);
  assert.equal(insertionIndex(xa, centers, null, 8, 5), insertionIndex(xb, centers, null, 8, 5));
});
