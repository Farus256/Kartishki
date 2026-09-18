import { test, expect } from '@playwright/test';

/** Main menu badge, name effect not clipped in the top bar, three-row slot reels, chest shelf. */
const guest = async (page: import('@playwright/test').Page) => {
  await page.goto(process.env.CLIENT_TEST_URL ?? 'http://127.0.0.1:5173');
  await page.getByRole('button', { name: 'Играть как гость' }).click();
  await expect(page.getByTestId('player-level')).toBeVisible();
};

test('«Моя колода» carries the in-development badge like the editor', async ({ page }) => {
  await guest(page);
  await expect(page.getByTestId('menu-deck-notice')).toHaveText('В РАЗРАБОТКЕ');
  await expect(page.getByTestId('menu-notice')).toHaveText('В РАЗРАБОТКЕ');
  const deck = page.getByTestId('menu-menuDeck');
  await expect(deck.locator('.menu-soon')).toBeVisible();
  await page.screenshot({ path: 'artifacts/menu-deck-badge.png', clip: { x: 0, y: 100, width: 700, height: 700 } });
});

test('a glowing name effect in the top bar is not cut at the name box', async ({ page }) => {
  await guest(page);
  // Force an effect on the guest name and read how much of the glow survives the ellipsis clip.
  const clip = await page.evaluate(() => {
    const name = document.querySelector('.level-bar-name .name-fx') as HTMLElement;
    name.dataset.nameFx = 'name-fire';
    const box = name.getBoundingClientRect();
    const host = name.closest('.level-bar-name') as HTMLElement;
    const hostBox = host.getBoundingClientRect();
    const cs = getComputedStyle(host);
    return { overflow: cs.overflow, padTop: parseFloat(cs.paddingTop), padLeft: parseFloat(cs.paddingLeft), room: { top: box.top - hostBox.top, left: box.left - hostBox.left, bottom: hostBox.bottom - box.bottom } };
  });
  expect(clip.overflow).toBe('hidden');
  expect(clip.padTop).toBeGreaterThanOrEqual(12);
  expect(clip.room.top).toBeGreaterThanOrEqual(10);
  expect(clip.room.left).toBeGreaterThanOrEqual(12);
  expect(clip.room.bottom).toBeGreaterThanOrEqual(10);
  await page.screenshot({ path: 'artifacts/menu-name-fx.png', clip: { x: 0, y: 0, width: 900, height: 110 } });
});

test('the slot machine shows three rows per reel with the pay line in the middle', async ({ page }) => {
  await guest(page);
  await page.getByRole('button', { name: /МАГАЗИН/i }).last().click();
  await page.getByRole('button', { name: 'Казино', exact: true }).click();
  const windows = page.locator('.slot-machine .reel-window');
  await expect(windows).toHaveCount(3);
  const box = (await windows.first().boundingBox())!;
  const sym = (await windows.first().locator('.reel-sym').first().boundingBox())!;
  expect(Math.round(box.height / sym.height)).toBe(3);
  await page.screenshot({ path: 'artifacts/slots-three-rows.png' });
  await page.getByRole('button', { name: /^SPIN/ }).click();
  await expect(page.locator('.slot-status')).toHaveText('БАРАБАНЫ КРУТЯТСЯ…');
  await expect(page.locator('.slot-status')).not.toHaveText('БАРАБАНЫ КРУТЯТСЯ…', { timeout: 8000 });
  // After the spin the strip rests with the server's symbol on the middle row: the strip offset is -(index-1)*cell.
  const rest = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.slot-machine .reel-strip')].map(el => {
    const y = new DOMMatrixReadOnly(getComputedStyle(el).transform).m42;
    const cell = (el.querySelector('.reel-sym') as HTMLElement).getBoundingClientRect().height;
    return Math.round(-y / cell);
  }));
  const shown = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.slot-machine .reel-window')].map(w => {
    const win = w.getBoundingClientRect();
    const mid = [...w.querySelectorAll<HTMLElement>('.reel-sym')].find(s => { const b = s.getBoundingClientRect(); return b.top < win.top + win.height / 2 && b.bottom > win.top + win.height / 2; })!;
    return (mid.querySelector('img') as HTMLImageElement).src;
  }));
  const status = await page.locator('.slot-status').textContent();
  expect(rest.every(n => n >= 7)).toBe(true);
  // The pay line reads the middle symbols: a pair/triple status must match repeated faces on that row.
  const counts = new Map<string, number>();
  for (const s of shown) counts.set(s, (counts.get(s) ?? 0) + 1);
  const best = Math.max(...counts.values());
  if (status?.startsWith('Тройка')) expect(best).toBe(3);
  else if (status?.startsWith('Пара')) expect(best).toBe(2);
  else expect(best).toBe(1);
  await page.screenshot({ path: 'artifacts/slots-landed.png' });
});

test('chests on the shelf and an opening', async ({ page }) => {
  await guest(page);
  await page.getByRole('button', { name: /МАГАЗИН/i }).last().click();
  await page.getByRole('button', { name: 'Сундуки', exact: true }).click();
  await expect(page.locator('.case-obj')).toHaveCount(4);
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'artifacts/chests-shelf.png' });
  await page.getByRole('button', { name: /ОТКРЫТЬ СУНДУК/ }).click();
  await expect(page.locator('.case-obj.is-open')).toBeVisible({ timeout: 5000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'artifacts/chest-open.png' });
});
