import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  clientToLocal,
  commitIntent,
  createDragSession,
  createPendingLock,
  grabOffset,
  hitZone,
  insertionIndex,
  previewBoard,
  resolveDrop,
} from '../apps/client/src/battlegrounds/pointerDnd';

test('clientToLocal keeps the same stage point across 16:9 viewports', () => {
  const stage = (vw: number, vh: number) => {
    const width = Math.min(vw, vh * 16 / 9);
    const height = width * 9 / 16;
    return { left: (vw - width) / 2, top: (vh - height) / 2, width, height };
  };
  for (const [vw, vh] of [[1366, 768], [1920, 1080], [1600, 900], [2560, 1440]] as const) {
    const root = stage(vw, vh);
    const local = clientToLocal(root.left + root.width * 0.5, root.top + root.height * 0.4, root, 1600, 900);
    assert.ok(Math.abs(local.x - 800) < 0.5, `${vw}x${vh} x`);
    assert.ok(Math.abs(local.y - 360) < 0.5, `${vw}x${vh} y`);
  }
});

test('grab offset keeps the grabbed corner under the pointer', () => {
  const grab = grabOffset({ x: 120, y: 80 }, { x: 100, y: 40 });
  assert.deepEqual(grab, { x: 20, y: 40 });
  assert.notEqual(grab.x, 75, 'must not teleport to card center');
});

test('insertion index uses nearest center and hysteresis', () => {
  const centers = [100, 250, 400, 550, 700, 850, 1000];
  assert.equal(insertionIndex(400, centers, null, 18, 6), 2);
  assert.equal(insertionIndex(410, centers, 2, 18, 6), 2);
  assert.equal(insertionIndex(430, centers, 2, 18, 6), 2);
  assert.equal(insertionIndex(580, centers, 2, 18, 6), 3);
  assert.equal(insertionIndex(90, centers, null, 18, 6), 0);
  assert.equal(insertionIndex(1100, centers, null, 18, 6), 6);
  assert.equal(insertionIndex(900, centers, null, 18, 3), 3);
});

test('preview board leaves a live gap without padding empty inventory slots', () => {
  const four = [0, 1, 2, 3].map(n => ({ id: `m${n}` }));
  assert.deepEqual(previewBoard(four, null, null).map(item => item?.id), ['m0', 'm1', 'm2', 'm3']);
  assert.deepEqual(previewBoard(four, null, 2).map(item => item?.id), ['m0', 'm1', undefined, 'm2', 'm3']);
  const board = [0, 1, 2, 3, 4, 5, 6].map(n => ({ id: `m${n}` }));
  const slots = previewBoard(board, 'm0', 3);
  assert.equal(slots.length, 7);
  assert.equal(slots[3], undefined);
  assert.deepEqual(slots.map(item => item?.id), ['m1', 'm2', 'm3', undefined, 'm4', 'm5', 'm6']);
});

test('hit zones prefer sell then board; shop buys on hero or board; miss cancels', () => {
  const buy = { x: 200, y: 500, w: 400, h: 200 };
  const sell = { x: 400, y: 40, w: 80, h: 80 };
  const board = { x: 200, y: 280, w: 800, h: 160 };
  assert.equal(hitZone('shop', { x: 300, y: 560 }, { buy, sell, board }), 'buy');
  assert.equal(hitZone('shop', { x: 500, y: 320 }, { buy, sell, board }), 'none', 'board alone never buys');
  assert.equal(hitZone('shop', { x: 420, y: 60 }, { buy, sell, board }), 'none');
  assert.equal(hitZone('board', { x: 420, y: 60 }, { buy, sell, board }), 'sell');
  assert.equal(hitZone('board', { x: 10, y: 10 }, { buy, sell, board }), 'none');
  assert.equal(hitZone('hand', { x: 500, y: 320 }, { buy, sell, board }), 'board');
  assert.equal(hitZone('hand', { x: 10, y: 10 }, { buy, sell, board }), 'none');
});

test('resolveDrop emits one intent and rejects invalid plays', () => {
  assert.deepEqual(resolveDrop({ kind: 'shop', id: 's1', fromIndex: 0, zone: 'buy', previewIndex: null, targetId: null, boardLength: 2, canBuy: true, canPlay: true, validTarget: false }), { type: 'buy', id: 's1' });
  assert.equal(resolveDrop({ kind: 'shop', id: 's1', fromIndex: 0, zone: 'buy', previewIndex: null, targetId: null, boardLength: 2, canBuy: false, canPlay: true, validTarget: false }), null);
  assert.deepEqual(resolveDrop({ kind: 'hand', id: 'h1', fromIndex: 0, zone: 'board', previewIndex: 0, targetId: null, boardLength: 0, canBuy: true, canPlay: true, validTarget: false }), { type: 'play', id: 'h1', index: 0 });
  assert.deepEqual(resolveDrop({ kind: 'hand', id: 'h1', fromIndex: 0, zone: 'board', previewIndex: 2, targetId: null, boardLength: 4, canBuy: true, canPlay: true, validTarget: false }), { type: 'play', id: 'h1', index: 2 });
  assert.deepEqual(resolveDrop({ kind: 'hand', id: 'h1', fromIndex: 0, zone: 'board', previewIndex: 4, targetId: null, boardLength: 4, canBuy: true, canPlay: true, validTarget: false }), { type: 'play', id: 'h1', index: 4 });
  assert.equal(resolveDrop({ kind: 'hand', id: 'h1', fromIndex: 0, zone: 'board', previewIndex: 0, targetId: null, boardLength: 7, canBuy: true, canPlay: false, validTarget: false }), null);
  assert.deepEqual(resolveDrop({ kind: 'board', id: 'b1', fromIndex: 0, zone: 'board', previewIndex: 6, targetId: null, boardLength: 7, canBuy: true, canPlay: true, validTarget: false }), { type: 'move', id: 'b1', index: 6 });
  assert.equal(resolveDrop({ kind: 'board', id: 'b1', fromIndex: 2, zone: 'board', previewIndex: 2, targetId: null, boardLength: 7, canBuy: true, canPlay: true, validTarget: false }), null);
  assert.deepEqual(resolveDrop({ kind: 'board', id: 'b1', fromIndex: 0, zone: 'sell', previewIndex: null, targetId: null, boardLength: 7, canBuy: true, canPlay: true, validTarget: false }), { type: 'sell', id: 'b1' });
  assert.deepEqual(resolveDrop({ kind: 'power', id: 'pwr', fromIndex: 0, zone: 'target', previewIndex: null, targetId: 'm1', boardLength: 7, canBuy: true, canPlay: true, validTarget: true }), { type: 'power', id: 'm1' });
  assert.equal(resolveDrop({ kind: 'power', id: 'pwr', fromIndex: 0, zone: 'none', previewIndex: null, targetId: null, boardLength: 7, canBuy: true, canPlay: true, validTarget: false }), null);
});

test('duplicate release and pending lock drop the second intent', () => {
  const session = createDragSession();
  const lock = createPendingLock(1000);
  const intent = { type: 'buy' as const, id: 's1' };
  assert.deepEqual(commitIntent(session, lock, intent), intent);
  assert.equal(commitIntent(session, lock, intent), null);
  const extra = createDragSession();
  assert.equal(commitIntent(extra, lock, intent), null);
  assert.equal(lock.blocked('s1'), true);
  assert.equal(lock.try('s1'), false);
});
