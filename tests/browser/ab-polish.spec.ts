import { test, expect } from '@playwright/test';
import { abFixture } from './abFixture';
import { openMockAb, pointerDrag, setFixture } from './abDnd';

/** Enemy hand fan (combat only), the wheel of fate, windfury pip, oval spell faces, no lingering drag ghost. */
test('the opponent\'s unplayed hand fans out by the portrait during combat only', async ({ page }) => {
  const state = abFixture();
  await openMockAb(page, state);
  // Recruit: no enemy hand anywhere on the table.
  await expect(page.getByTestId('ab-combat-hand')).toHaveCount(0);
  await expect(page.locator('.enemy-hand')).toHaveCount(0);
  const a = state.players[0]!.board[0]!;
  const b = { ...a, id: 'foe-1', owner: 'p1' };
  state.phase = 'COMBAT_PHASE';
  state.combatBoards = { playerA: 'p0', playerB: 'p1', a: [a], b: [b] };
  state.combat = { turn: 8, pairIndex: 0, seed: 1, playerA: 'p0', playerB: 'p1', ghost: false, durationMs: 9000, initialHealth: { p0: 27, p1: 19 }, handCounts: { p0: 3, p1: 4 }, boards: { a: [a], b: [b] },
    events: [{ id: 1, kind: 'ATTACK', sourceId: a.id, targetId: b.id }, { id: 2, kind: 'DAMAGE', targetId: b.id, amount: 1, remainingHealth: 1 }, { id: 3, kind: 'COMBAT_END', tie: true }],
    summary: { winnerId: '', loserId: '', damage: 0, tie: true } };
  await setFixture(page, state);
  const fan = page.getByTestId('ab-combat-hand');
  await expect(fan).toHaveAttribute('data-count', '4');
  await expect(fan.locator('.ab-combat-hand-card')).toHaveCount(4);
  // The fan sits left of the enemy portrait and its cards run past the top edge (clipped by the fan box).
  const foe = await page.getByTestId('ab-combat-foe').locator('.ab-hero-face').boundingBox();
  const box = await fan.boundingBox();
  expect(box!.x).toBeLessThan(foe!.x);
  expect(box!.y).toBeLessThanOrEqual(foe!.y + 2);
  const card = await fan.locator('.ab-combat-hand-card').first().boundingBox();
  expect(card!.y).toBeLessThan(box!.y);
  await page.screenshot({ path: 'artifacts/ab-combat-hand.png' });
  // A ghost opponent has no hand; zero cards draw nothing.
  state.combat = { ...state.combat, handCounts: { p0: 3, p1: 0 } };
  await setFixture(page, state);
  await expect(page.getByTestId('ab-combat-hand')).toHaveCount(0);
});

test('the wheel of fate spins to the wedge the server rolled and folds away', async ({ page }) => {
  const state = abFixture();
  state.anomalyId = 'ab-anomaly-wheel-of-fate';
  state.players[0]!.wheelBonus = 'gold';
  await openMockAb(page, state);
  const wheel = page.getByTestId('ab-wheel');
  await expect(wheel).toHaveAttribute('data-bonus', 'gold');
  await expect(wheel).toHaveClass(/is-landed/, { timeout: 4000 });
  await expect(wheel.locator('.ab-wheel-prize')).toHaveText('+2 доллара');
  await page.screenshot({ path: 'artifacts/ab-wheel.png' });
  await expect(wheel).toHaveCount(0, { timeout: 4000 });
  // A new turn with a new wedge spins again.
  state.turn++; state.players[0]!.wheelBonus = 'shield';
  await setFixture(page, state);
  await expect(page.getByTestId('ab-wheel')).toHaveAttribute('data-bonus', 'shield');
});

test('windfury pip, oval spell face with a bigger price, and no ghost left behind while dragging', async ({ page }) => {
  const state = abFixture();
  const me = state.players[0]!;
  me.board[1]!.keywords = ['windfury'];
  const spellDef = { id: 'ab-spell-blood-pact', cost: 1 };
  me.tavern.offers[5] = { id: 'offer-spell', cardId: spellDef.id, baseId: spellDef.id, kind: 'spell', attack: 0, health: 1, maxHealth: 1, tavernTier: 2, keywords: [], tribes: ['demon'], golden: false, owner: 'p0', cost: 1 };
  await openMockAb(page, state);
  const wind = page.getByTestId(`ab-minion-${me.board[1]!.id}`).locator('.ab-wind');
  await expect(wind).toBeVisible();
  const pip = await wind.evaluate(el => getComputedStyle(el, '::after').content);
  expect(pip).toContain('×2');
  const spell = page.getByTestId('ab-minion-offer-spell');
  await expect(spell.locator('.ab-reward-mark')).toHaveCSS('border-radius', '50%');
  await expect(spell.locator('.ab-minion-name')).toHaveCount(0);
  await expect(spell.locator('.ab-reward-mark small')).toHaveCount(0);
  const priceBadge = spell.getByTestId('ab-offer-price');
  await expect(priceBadge).toHaveText('$1');
  await expect(priceBadge).toHaveCSS('background-color', 'rgb(46, 139, 68)');
  const priceSize = await priceBadge.evaluate(el => parseFloat(getComputedStyle(el).fontSize));
  expect(priceSize).toBeGreaterThanOrEqual(16);
  await page.waitForTimeout(1300);
  await page.screenshot({ path: 'artifacts/ab-spell-oval.png', clip: { x: 300, y: 340, width: 900, height: 200 } });
  // Drag a hand card: the pickup is smooth (starts at the hovered position, no 78px snap down) and the source tile is hidden.
  const hand = page.getByTestId(`ab-minion-${me.hand[2]!.id}`);
  const from = (await hand.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 10, from.y + from.height / 2 - 15, { steps: 3 });
  const ghost = page.getByTestId('ab-drag-ghost');
  await expect(ghost).toBeVisible();
  const ghostStartBox = (await ghost.boundingBox())!;
  expect(ghostStartBox.y).toBeLessThan(from.y);
  expect(Math.abs(ghostStartBox.y - (from.y - 15))).toBeLessThan(30);
  await page.mouse.move(from.x + from.width / 2 + 30, from.y - 40, { steps: 6 });
  await page.mouse.move(from.x + from.width / 2 + 60, from.y - 120, { steps: 6 });
  const draggingId = await page.getByTestId('ab-screen').getAttribute('data-dragging-id');
  expect(draggingId).toBeTruthy();
  await expect(page.locator(`.ab-hand [data-ab-id="${draggingId}"]`)).toHaveCSS('visibility', 'hidden');
  await page.screenshot({ path: 'artifacts/ab-drag-no-ghost.png' });
  await page.mouse.up();
  void pointerDrag;
});
