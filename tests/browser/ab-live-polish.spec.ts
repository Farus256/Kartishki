import { test, expect, type Page } from '@playwright/test';

/** A real two-seat table on the local server: the counter always holds exactly one spell, a hand card drags to the board, combat shows the enemy hand fan. */
async function seat(page: Page) {
  await page.goto(process.env.CLIENT_TEST_URL ?? 'http://127.0.0.1:5173');
  await page.getByRole('button', { name: 'Играть как гость' }).click();
  await page.getByRole('button', { name: 'ПОЛЕ СРАЖЕНИЙ' }).click();
  await page.getByTestId('ab-screen').waitFor();
}

test('live table: one spell per counter across refreshes and turns, combat with the enemy hand fan', async ({ browser }) => {
  test.setTimeout(180000);
  const a = await browser.newPage();
  const b = await browser.newPage();
  await seat(a);
  await seat(b);
  await expect(a.getByTestId('ab-lobby')).toContainText('2');
  await a.getByRole('button', { name: 'Начать' }).click();
  for (const p of [a, b]) {
    await p.getByTestId('ab-hero-select').waitFor();
    await p.getByTestId('ab-hero-select').getByRole('button').first().click();
  }
  await expect(a.getByTestId('ab-tavern')).toBeVisible({ timeout: 30000 });
  const spells = (p: Page) => p.locator('.ab-tavern-row .ab-minion.is-spell');
  const minions = (p: Page) => p.locator('.ab-tavern-row .ab-minion:not(.is-spell)');
  const ids = (p: Page) => p.locator('.ab-tavern-row .ab-minion').evaluateAll(els => els.map(el => el.getAttribute('data-ab-id')).join(','));
  // The curio-market anomaly is the one intentional exception: two extra spell-only slots on top of the one spell.
  const anomaly = await a.getByTestId('ab-anomaly').getAttribute('data-anomaly').catch(() => '');
  const want = anomaly === 'ab-anomaly-spell-market' ? 3 : 1;
  await expect(spells(a)).toHaveCount(want);
  await expect(minions(a)).toHaveCount(anomaly === 'ab-anomaly-big-tavern' ? 4 : 2);
  await expect(spells(b)).toHaveCount(want);
  await a.screenshot({ path: 'artifacts/live-turn1.png' });
  // Buy a minion and drag it from the hand onto the board (the turn-one clock is 60s: do this first).
  await minions(a).first().click();
  const card = a.locator('.ab-hand .ab-minion:not(.is-spell)').first();
  await expect(card).toBeVisible();
  await a.mouse.move(2, 2);
  // Let the bought card finish sliding into the hand before measuring where to grab it.
  await expect.poll(async () => { const b1 = (await card.boundingBox())!; await a.waitForTimeout(120); const b2 = (await card.boundingBox())!; return Math.abs(b1.x - b2.x) + Math.abs(b1.y - b2.y); }).toBeLessThan(1);
  const from = (await card.boundingBox())!;
  const board = (await a.getByTestId('ab-board').boundingBox())!;
  await a.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await a.mouse.down();
  await a.mouse.move(from.x + from.width / 2 + 10, from.y - 30, { steps: 5 });
  await a.mouse.move(board.x + board.width / 2, board.y + board.height / 2, { steps: 10 });
  await a.mouse.up();
  await expect(a.locator('.ab-board .ab-minion')).toHaveCount(1, { timeout: 5000 });
  await expect(a.locator('.ab-hand .ab-minion')).toHaveCount(0);
  // Buy the spell: the slot empties (no replacement spell appears mid-turn).
  await spells(a).first().click();
  await expect(spells(a)).toHaveCount(want - 1);
  await expect(a.locator('.ab-hand .ab-minion.is-spell')).toHaveCount(1);
  // Refresh: exactly one spell again, on the right of the minions.
  const before = await ids(a);
  await a.getByTestId('ab-reroll').click();
  await expect.poll(() => ids(a), { timeout: 5000 }).not.toBe(before);
  await expect(spells(a)).toHaveCount(want, { timeout: 5000 });
  const boxes = await a.locator('.ab-tavern-row .ab-minion').evaluateAll(els => els.map(el => ({ spell: el.classList.contains('is-spell'), x: el.getBoundingClientRect().x })));
  expect(boxes.filter(s => s.spell).every(s => boxes.filter(m => !m.spell).every(m => m.x < s.x))).toBe(true);
  for (const p of [a, b]) await p.getByTestId('ab-ready').click();
  // Combat: A still holds the spell, so B sees one card back by A's portrait; B holds nothing, so A sees no fan.
  await expect(b.getByTestId('ab-combat')).toBeVisible({ timeout: 30000 });
  await expect(b.getByTestId('ab-combat-hand')).toHaveAttribute('data-count', '1');
  await expect(a.getByTestId('ab-combat-hand')).toHaveCount(0);
  await b.screenshot({ path: 'artifacts/live-combat-b.png' });
  // Next recruit: one spell on the counter again for both seats.
  await expect(a.getByTestId('ab-combat')).toHaveCount(0, { timeout: 60000 });
  await expect(spells(a)).toHaveCount(want);
  await expect(spells(b)).toHaveCount(want);
  await a.screenshot({ path: 'artifacts/live-turn2.png' });
});
