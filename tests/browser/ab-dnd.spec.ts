import { test, expect } from '@playwright/test';
import { abFixture, abOpenTable } from './abFixture';
import { actionsOf, openMockAb, pointerDrag, pointerHold, pointerRelease, setFixture } from './abDnd';

test('tavern buy, hand inserts, board reorder, sell and hero power', async ({ page }) => {
  const open = abOpenTable();
  await openMockAb(page, open);
  await pointerDrag(page, page.locator('.ab-tavern-row .ab-minion').first(), page.getByTestId('ab-hero'));
  await pointerDrag(page, page.getByTestId('ab-minion-p0-m8'), page.getByTestId('ab-board-slot-0'));
  const mid = abOpenTable();
  mid.players[0]!.board = abFixture().players[0]!.board.slice(0, 4);
  mid.players[0]!.hand = abFixture().players[0]!.hand.slice(2, 4);
  await setFixture(page, mid);
  await pointerDrag(page, page.getByTestId('ab-minion-p0-m10'), page.getByTestId('ab-board-slot-2'));
  await pointerDrag(page, page.getByTestId('ab-minion-p0-m11'), page.getByTestId('ab-board-end'));
  const packed = abFixture();
  packed.players[0]!.power = { id: 'ab-power-buff-board', goldCost: 1, targeted: true, targetDomain: 'board', isPassive: false, isExhausted: false };
  packed.players[0]!.hand = packed.players[0]!.hand.slice(0, 3);
  await setFixture(page, packed);
  await pointerDrag(page, page.getByTestId('ab-minion-p0-m0'), page.getByTestId('ab-board-slot-6'));
  await pointerDrag(page, page.getByTestId('ab-minion-p0-m6'), page.getByTestId('ab-board-slot-0'));
  await pointerDrag(page, page.getByTestId('ab-minion-p0-m1'), page.getByTestId('ab-sell-zone'));
  await pointerDrag(page, page.getByTestId('ab-hero-power'), page.getByTestId('ab-minion-p0-m2'));
  expect(await actionsOf(page)).toEqual([
    ['buy', 'p0-m25'],
    ['play', 'p0-m8', 0],
    ['play', 'p0-m10', 2],
    ['play', 'p0-m11', 4],
    ['move', 'p0-m0', 6],
    ['move', 'p0-m6', 0],
    ['sell', 'p0-m1'],
    ['power', 'p0-m2'],
  ]);
});

test('hero power tavern target, invalid drops, escape, full board and duplicate release', async ({ page }) => {
  const fixture = abFixture();
  fixture.players[0]!.power = { id: 'ab-power-buff-tavern', goldCost: 1, targeted: true, targetDomain: 'tavern', isPassive: false, isExhausted: false };
  await openMockAb(page, fixture);
  await pointerDrag(page, page.getByTestId('ab-hero-power'), page.locator('.ab-tavern-row .ab-minion').first());
  fixture.players[0]!.power = { id: 'ab-power-buff-board', goldCost: 1, targeted: true, targetDomain: 'board', isPassive: false, isExhausted: false };
  await setFixture(page, fixture);
  await pointerDrag(page, page.getByTestId('ab-hero-power'), page.locator('.ab-tavern-row .ab-minion').first());
  await pointerDrag(page, page.locator('.ab-tavern-row .ab-minion').first(), page.getByTestId('ab-leaderboard'));
  await pointerHold(page, page.getByTestId('ab-minion-p0-m0'), page.getByTestId('ab-board-slot-4'));
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect(page.getByTestId('ab-drag-ghost')).toBeHidden();
  await pointerDrag(page, page.getByTestId('ab-minion-p0-m8'), page.getByTestId('ab-board-slot-1'));
  await pointerHold(page, page.getByTestId('ab-minion-p0-m3'), page.getByTestId('ab-board-slot-5'));
  await page.mouse.up();
  await page.mouse.up();
  const actions = await actionsOf(page);
  expect(actions).toEqual([
    ['power', 'p0-m25'],
    ['move', 'p0-m3', 5],
  ]);
});

test('recruit end and reconnect cancel an in-flight drag', async ({ page }) => {
  const fixture = abFixture();
  await openMockAb(page, fixture);
  await pointerHold(page, page.getByTestId('ab-minion-p0-m0'), page.getByTestId('ab-board-slot-5'));
  await expect(page.getByTestId('ab-screen')).toHaveAttribute('data-dragging-id', 'p0-m0');
  const ended = { ...fixture, phase: 'COMBAT_PHASE' };
  await setFixture(page, ended);
  await page.mouse.up();
  expect(await actionsOf(page)).toEqual([]);
  await setFixture(page, fixture);
  await pointerHold(page, page.getByTestId('ab-minion-p0-m2'), page.getByTestId('ab-board-slot-4'));
  await setFixture(page, { ...fixture, status: 'offline' });
  await page.mouse.up();
  await expect(page.getByTestId('ab-drag-ghost')).toBeHidden();
  await setFixture(page, fixture);
  await expect(page.locator('.ab-board .ab-minion')).toHaveCount(7);
  expect(await actionsOf(page)).toEqual([]);
});

test('real mouse reorders a board minion to any slot', async ({ page }) => {
  await openMockAb(page, abFixture());
  const from = await page.getByTestId('ab-minion-p0-m0').boundingBox();
  const right = await page.getByTestId('ab-board-slot-6').boundingBox();
  const left = await page.getByTestId('ab-board-slot-1').boundingBox();
  if (!from || !right || !left) throw new Error('missing board boxes');
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(right.x + right.width / 2, right.y + right.height / 2, { steps: 16 });
  await page.mouse.up();
  const other = await page.getByTestId('ab-minion-p0-m6').boundingBox();
  const start = await page.getByTestId('ab-board-slot-0').boundingBox();
  if (!other || !start) throw new Error('missing reorder boxes');
  await page.mouse.move(other.x + other.width / 2, other.y + other.height / 2);
  await page.mouse.down();
  await page.mouse.move(start.x + 10, start.y + start.height / 2, { steps: 16 });
  await page.mouse.up();
  expect(await actionsOf(page)).toEqual([
    ['move', 'p0-m0', 6],
    ['move', 'p0-m6', 0],
  ]);
});

test('scaled viewports resolve the same insertion index', async ({ page }) => {
  const fixture = abFixture();
  await openMockAb(page, fixture);
  for (const viewport of [{ width: 1366, height: 768 }, { width: 1920, height: 1080 }, { width: 1600, height: 900 }, { width: 2560, height: 1440 }]) {
    await page.setViewportSize(viewport);
    await pointerDrag(page, page.getByTestId('ab-minion-p0-m0'), page.getByTestId('ab-board-slot-4'));
    await page.waitForTimeout(320);
  }
  const actions = await actionsOf(page) as Array<[string, string, number]>;
  expect(actions.filter(item => item[0] === 'move')).toEqual([
    ['move', 'p0-m0', 4],
    ['move', 'p0-m0', 4],
    ['move', 'p0-m0', 4],
    ['move', 'p0-m0', 4],
  ]);
});

test('seven-minion live preview and grab offset do not teleport', async ({ page }) => {
  const fixture = abFixture();
  await openMockAb(page, fixture);
  await pointerHold(page, page.getByTestId('ab-minion-p0-m2'), page.getByTestId('ab-board-slot-4'));
  await expect(page.getByTestId('ab-board')).toHaveAttribute('data-preview-index', '4');
  await page.mouse.up();
  await pointerDrag(page, page.getByTestId('ab-minion-p0-m0'), page.getByTestId('ab-board-slot-6'));
  await pointerDrag(page, page.getByTestId('ab-minion-p0-m6'), page.getByTestId('ab-board-slot-0'));
  const card = page.getByTestId('ab-minion-p0-m3');
  await card.hover();
  await page.waitForTimeout(180);
  const box = await card.evaluate(el => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
  await page.mouse.move(box.x + 12, box.y + 24);
  await page.mouse.down();
  await page.mouse.move(box.x + 110, box.y + 70, { steps: 10 });
  const ghost = await page.getByTestId('ab-drag-ghost').evaluate(el => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
  const cursorX = box.x + 110;
  // The pointer grabbed 12 browser pixels from the edge; small rotation and
  // pickup scale can move the bounding edge, but must not center the card.
  expect(Math.abs(ghost.x - (cursorX - 12))).toBeLessThan(16);
  expect(Math.abs((ghost.x + ghost.w / 2) - cursorX)).toBeGreaterThan(10);
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await pointerDrag(page, page.getByTestId('ab-minion-p0-m4'), page.getByTestId('ab-board-slot-2'), 'right');
  expect(await actionsOf(page)).toEqual([
    ['move', 'p0-m2', 4],
    ['move', 'p0-m0', 6],
    ['move', 'p0-m6', 0],
    ['move', 'p0-m4', 2],
  ]);
});

test('board tavern and hand stay centered for every population', async ({ page }) => {
  await openMockAb(page, abFixture());
  await page.setViewportSize({ width: 1920, height: 1080 });
  async function groupOffset(scope: string, item: string) {
    return page.locator(scope).locator(item).evaluateAll((els, stageSel) => {
      const table = document.querySelector(stageSel)!.getBoundingClientRect();
      const boxes = els.map(el => el.getBoundingClientRect());
      const left = Math.min(...boxes.map(box => box.x));
      const right = Math.max(...boxes.map(box => box.x + box.width));
      return { offset: Math.abs((left + right) / 2 - (table.x + table.width / 2)), left, right, tableLeft: table.x, tableRight: table.x + table.width };
    }, scope === '[data-testid="ab-hand"]' ? scope : '.ab-stage');
  }
  async function assertCentered(scope: string, item: string) {
    await expect.poll(async () => (await groupOffset(scope, item)).offset, { timeout: 2000 }).toBeLessThan(36);
    const now = await groupOffset(scope, item);
    expect(now.left).toBeGreaterThanOrEqual(now.tableLeft - 2);
    expect(now.right).toBeLessThanOrEqual(now.tableRight + 2);
  }
  for (const n of [1, 2, 3, 4, 5, 6, 7]) {
    const next = abFixture();
    next.players[0]!.board = abFixture().players[0]!.board.slice(0, n);
    await setFixture(page, next);
    await expect(page.getByTestId('ab-board').locator('.ab-minion')).toHaveCount(n);
    await assertCentered('[data-testid="ab-board"]', '.ab-minion');
    await page.screenshot({ path: `artifacts/ab-board-${n}.png` });
  }
  await assertCentered('.ab-tavern-row', '.ab-minion');
  await assertCentered('[data-testid="ab-hand"]', '.ab-minion');
  await page.setViewportSize({ width: 1366, height: 768 });
  await expect(page.getByTestId('ab-board').locator('.ab-minion')).toHaveCount(7);
  await assertCentered('[data-testid="ab-board"]', '.ab-minion');
});

test('discover cancels drag and keeps the focus trap; arrow ignores pointers', async ({ page }) => {
  const fixture = abFixture();
  fixture.players[0]!.power = { id: 'ab-power-buff-board', goldCost: 1, targeted: true, targetDomain: 'board', isPassive: false, isExhausted: false };
  await openMockAb(page, fixture);
  await pointerHold(page, page.getByTestId('ab-minion-p0-m0'), page.getByTestId('ab-board-slot-3'));
  fixture.players[0]!.pendingDiscover = fixture.players[0]!.hand.slice(0, 3);
  fixture.players[0]!.discoverOpen = true;
  await setFixture(page, fixture);
  await expect(page.getByTestId('ab-discover')).toBeVisible();
  await expect(page.getByTestId('ab-drag-ghost')).toBeHidden();
  expect(await actionsOf(page)).toEqual([]);
  const choices = page.locator('.ab-discover-row button');
  await expect(choices.first()).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(choices.last()).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(choices.first()).toBeFocused();
  fixture.players[0]!.pendingDiscover = [];
  fixture.players[0]!.discoverOpen = false;
  await setFixture(page, fixture);
  await pointerHold(page, page.getByTestId('ab-hero-power'), page.getByTestId('ab-minion-p0-m1'));
  await expect(page.getByTestId('ab-aim-arrow')).toBeVisible();
  expect(await page.getByTestId('ab-aim-arrow').evaluate(el => getComputedStyle(el).pointerEvents)).toBe('none');
  expect(await page.getByTestId('ab-dnd-layer').evaluate(el => getComputedStyle(el).pointerEvents)).toBe('none');
  await page.keyboard.press('Escape');
  await pointerRelease(page);
  await page.waitForTimeout(50);
  await page.getByTestId('ab-hero-power').evaluate((el: HTMLButtonElement) => el.click());
  await expect(page.locator('.ab-board .is-selected')).toHaveCount(7);
  await page.keyboard.press('Escape');
  await expect(page.locator('.ab-board .is-selected')).toHaveCount(0);
});
