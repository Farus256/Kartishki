import { test, expect, type Page } from '@playwright/test';

/** Live custom rooms on the local server: menu placement, browser filters, create/join, bots at the table, combat completes. */
async function toMenu(page: Page) {
  await page.goto(process.env.CLIENT_TEST_URL ?? 'http://127.0.0.1:5173');
  await page.getByRole('button', { name: 'Играть как гость' }).click();
  await page.getByTestId('menu-menuBattlegrounds').waitFor();
}

test('main menu: Battlefield first (ranked), Server Browser second (unranked), classic 1v1 kept below', async ({ page }) => {
  await toMenu(page);
  const labels = await page.locator('.menu-buttons .menu-action').evaluateAll(els => els.map(el => el.getAttribute('data-testid')));
  expect(labels.slice(0, 3)).toEqual(['menu-menuBattlegrounds', 'menu-menuBrowser', 'menu-menuPlay']);
  await expect(page.getByTestId('menu-menuBattlegrounds')).toContainText('РЕЙТИНГ');
  await expect(page.getByTestId('menu-menuBrowser')).toContainText('БЕЗ РЕЙТИНГА');
  await page.getByTestId('menu-menuBrowser').click();
  await expect(page.getByTestId('server-browser')).toBeVisible();
  await expect(page.getByTestId('browser-mode')).toHaveText('БЕЗ РЕЙТИНГА');
  await page.screenshot({ path: 'artifacts/server-browser-empty.png' });
  await page.getByTestId('browser-back').click();
  await expect(page.getByTestId('menu-menuBattlegrounds')).toBeVisible();
});

test('custom room: create with bots and settings, browse, filter, join, start, bots play and combat completes', async ({ browser }) => {
  test.setTimeout(240000);
  const host = await browser.newPage();
  const guest = await browser.newPage();
  await toMenu(host);
  await host.getByTestId('menu-menuBrowser').click();
  await host.getByTestId('browser-create').click();
  await host.getByTestId('room-name').fill('Проверочная');
  await host.getByTestId('room-max').selectOption('4');
  await host.getByTestId('room-bots').selectOption('1');
  await host.getByRole('button', { name: /Дополнительно/ }).click();
  await host.getByTestId('room-anomaly').selectOption('ab-anomaly-fence');
  await host.getByTestId('room-timer').selectOption('45');
  await host.getByTestId('room-create-submit').click();
  await expect(host.getByTestId('ab-lobby')).toBeVisible();
  await expect(host.getByTestId('ab-lobby-mode')).toHaveText('БЕЗ РЕЙТИНГА');
  await expect(host.getByTestId('ab-lobby-seats')).toContainText('1 игроков + 1 ботов из 4');
  await expect(host.getByTestId('ab-anomaly')).toHaveAttribute('data-anomaly', 'ab-anomaly-fence');

  await toMenu(guest);
  await guest.getByTestId('menu-menuBrowser').click();
  const row = guest.getByTestId('browser-row').filter({ hasText: 'Проверочная' });
  await expect(row).toBeVisible({ timeout: 10000 });
  await expect(row).toContainText('1/3');
  await expect(row).toContainText('45 с');
  await expect(row.locator('.anomaly-chip')).toHaveAttribute('data-anomaly', 'ab-anomaly-fence');
  // Filters: bots "none" hides it, bots "with" shows it; search by host name works.
  await guest.getByTestId('browser-bots').selectOption('none');
  await expect(row).toHaveCount(0);
  await guest.getByTestId('browser-bots').selectOption('with');
  await expect(row).toBeVisible();
  await guest.getByTestId('browser-search').fill('нет такой');
  await expect(guest.getByTestId('browser-empty')).toBeVisible();
  await guest.getByTestId('browser-search').fill('Проверочная');
  await guest.screenshot({ path: 'artifacts/server-browser-list.png' });
  await row.getByTestId('browser-join').click();
  await expect(guest.getByTestId('ab-lobby')).toBeVisible();
  // The guest sees read-only settings; the host sees the count update.
  await expect(guest.getByTestId('room-bots')).toBeDisabled();
  await expect(guest.getByTestId('ab-start')).toHaveCount(0);
  await expect(host.getByTestId('ab-lobby-seats')).toContainText('2 игроков + 1 ботов из 4');
  await host.getByTestId('room-bots').selectOption('2');
  await expect(guest.getByTestId('ab-lobby-seats')).toContainText('2 игроков + 2 ботов из 4');

  await host.getByTestId('ab-start').click();
  for (const p of [host, guest]) {
    await p.getByTestId('ab-hero-select').waitFor();
    await p.getByTestId('ab-hero-select').getByRole('button').first().click();
  }
  await expect(host.getByTestId('ab-tavern')).toBeVisible({ timeout: 30000 });
  await expect(host.getByTestId('ab-bot-tag')).toHaveCount(2);
  await expect(host.getByTestId('ab-mode')).toHaveText('БЕЗ РЕЙТИНГА');
  await host.screenshot({ path: 'artifacts/custom-room-turn1.png' });
  // Everyone readies up; bots finish their own turn and the fight plays out into turn 2 with updated health.
  const before = await host.getByTestId('ab-leaderboard').innerText();
  await host.getByTestId('ab-ready').click();
  await guest.getByTestId('ab-ready').click();
  await expect(host.locator('.ab-header')).toContainText('Ход 2', { timeout: 90000 });
  await expect.poll(async () => host.getByTestId('ab-leaderboard').innerText(), { timeout: 60000 }).not.toBe(before);
  await host.screenshot({ path: 'artifacts/custom-room-turn2.png' });
  for (const p of [host, guest]) await p.getByRole('button', { name: 'Выйти' }).click();
});
