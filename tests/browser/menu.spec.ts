import { test, expect, type Page } from '@playwright/test';
const LADDER = [
  { username: 'Алиса', elo: 1200, xp: 80, remainingMl: 0 },
  { username: 'Борис', elo: 1100, xp: 40, remainingMl: 500 },
  { username: 'Вера', elo: 1050, xp: 20, remainingMl: 1000 },
];
async function stubMenuApis(page: Page) {
  await page.route('**/api/catalog', route => route.fulfill({ json: { cards: [] } }));
  await page.route('**/api/players/ladder', route => route.fulfill({ json: LADDER }));
}
async function patchElo(page: Page, elo: number) {
  await page.evaluate(`import('/src/playerSession.ts').then(m => m.playerSession.patchProfile({ elo: ${elo}, currency: 0, gained: 0 }))`);
}
test('bottle rank calibrates, drains, caps, promotes and persists without double rewards', async ({ page }) => {
  let elo = 1000;
  await page.addInitScript(() => { localStorage.setItem('playerToken', 'menu-test'); localStorage.setItem('sound', 'off'); });
  await stubMenuApis(page);
  await page.route('**/api/players/me', route => route.fulfill({ json: { profile: { id: 'beer-player', username: 'Барсик', elo, currency: 0, xp: 0, dailyAvailable: true, lastDaily: null }, collection: [], decks: [] } }));
  await page.goto('/');
  const bottle = page.getByTestId('beer-bottle');
  await expect(bottle).toHaveAttribute('data-ml', '1500');
  await expect(page.getByText('Стол игрока')).toHaveCount(0);
  await expect(page.getByTestId('player-level')).toContainText('Барсик');
  await expect(page.getByRole('button', { name: 'Ежедневная награда', exact: true })).toBeEnabled();
  await expect.poll(async () => page.getByTestId('beer-liquid').getAttribute('d')).toMatch(/^M65 244/);
  await page.screenshot({ path: 'artifacts/menu-beer-light.png', animations: 'disabled' });
  elo = 1016; await patchElo(page, elo); await expect(bottle).toHaveAttribute('data-ml', '1340');
  await patchElo(page, elo); await expect(bottle).toHaveAttribute('data-ml', '1340');
  elo = 900; await patchElo(page, elo); await expect(bottle).toHaveAttribute('data-ml', '2000');
  await expect(bottle).toHaveAttribute('data-league', 'light');
  elo = 1100; await patchElo(page, elo); await expect(bottle).toHaveAttribute('data-league', 'dark');
  await expect(bottle).toHaveAttribute('data-ml', '1500');
  await page.screenshot({ path: 'artifacts/menu-beer-dark.png', animations: 'disabled' });
  elo = 1000; await patchElo(page, elo); await expect(bottle).toHaveAttribute('data-ml', '2000');
  await expect(bottle).toHaveAttribute('data-league', 'dark');
  elo = 1200; await patchElo(page, elo); await expect(bottle).toHaveAttribute('data-ml', '0');
  await expect(page.getByTestId('beer-liquid')).toHaveAttribute('opacity', '0', { timeout: 8000 });
  await page.reload(); await expect(bottle).toHaveAttribute('data-ml', '0');
  await expect(bottle).toHaveAttribute('data-league', 'dark');
});
test('guest menu keeps bottle, daily reward and actions inside the 16:9 stage', async ({ page }) => {
  await stubMenuApis(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/'); await page.getByRole('button', { name: 'Играть как гость' }).click();
  await expect(page.getByTestId('beer-bottle')).toHaveAttribute('data-ml', '1500');
  await expect(page.getByTestId('player-level')).toContainText('Ур. 1');
  await expect(page.getByTestId('player-level')).toContainText('Новичок');
  await expect(page.getByTestId('player-level')).toContainText('0 / 40');
  await expect(page.getByTestId('beer-league')).toContainText('СВЕТЛОЕ');
  await expect(page.getByTestId('beer-volume')).toContainText('мл');
  await expect(page.getByText('Калибровочная отметка')).toHaveCount(0);
  await expect(page.getByText('ТВОЙ РАНГ')).toHaveCount(0);
  await expect(page.getByText('/ 2000 мл')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Ежедневная награда', exact: true })).toBeDisabled();
  const board = page.getByTestId('menu-ladder');
  await expect(board.locator('tbody tr').nth(0)).toContainText('Алиса');
  await expect(board.locator('tbody tr').nth(0).locator('.lvl')).toHaveText('2');
  await expect(board.locator('tbody tr').nth(0).locator('.ml')).toHaveText('0');
  await expect(board.locator('tbody tr')).toHaveCount(10);
  await expect(board.locator('.is-gold')).toContainText('Алиса');
  await expect(board.locator('.is-silver')).toContainText('Борис');
  await expect(board.locator('.is-bronze')).toContainText('Вера');
  for (const viewport of [{ width: 1600, height: 900 }, { width: 1280, height: 720 }, { width: 390, height: 844 }, { width: 2560, height: 1080 }]) {
    await page.setViewportSize(viewport);
    for (const selector of ['.beer-bottle', '.menu-daily', '.main-menu-actions', '.menu-ladder']) {
      await expect.poll(async () => { const b = await page.locator(selector).boundingBox(); return !!b && b.x >= 0 && b.y >= 0 && b.x + b.width <= viewport.width + 1 && b.y + b.height <= viewport.height + 1; }).toBe(true);
    }
    const daily = (await page.getByTestId('daily-reward').boundingBox())!;
    const bottle = (await page.getByTestId('beer-bottle').boundingBox())!;
    const ladder = (await board.boundingBox())!;
    expect(daily.x + daily.width).toBeLessThan(bottle.x);
    expect(bottle.x + bottle.width).toBeLessThan(ladder.x);
  }
});
