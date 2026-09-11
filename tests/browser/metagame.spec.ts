import { test, expect, type Page } from '@playwright/test';
const state = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('kartishki-demo-economy-v1')!));
async function enter(page: Page, screen: 'deck' | 'shop') {
  await page.goto('/');
  await page.getByRole('button', { name: 'Играть как гость' }).click();
  await page.getByRole('button', { name: screen === 'deck' ? /МОЯ КОЛОДА/i : /^.*МАГАЗИН.*$/i }).last().click();
  await expect(screen === 'shop' ? page.getByRole('navigation', { name: 'Режим магазина' }) : page.locator('section input')).toBeVisible();
}
test.beforeEach(async ({ page }) => {
  await page.route('**/api/catalog', route => route.fulfill({ json: { cards: [] } }));
  await page.addInitScript(() => localStorage.setItem('sound', 'off'));
});
test('deck editing, limits, search, crafting and persistence', async ({ page }) => {
  await enter(page, 'deck');
  await expect(page.getByTestId('balance')).toHaveText('$ 1,500');
  await expect(page.locator('section .grid-cols-4 > div')).toHaveCount(8);
  await page.getByRole('button', { name: 'Убрать Кот из подвала', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Сохранить колоду' })).toBeDisabled();
  await page.getByRole('button', { name: 'Кот из подвала', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Сохранить колоду' })).toBeEnabled();
  await page.getByRole('button', { name: 'Кот из подвала', exact: true }).first().click();
  await expect(page.getByRole('status')).toContainText('Максимум');
  await page.locator('aside > input').fill('Ночная смена');
  await page.getByRole('button', { name: 'Сохранить колоду' }).click();
  expect((await state(page)).decks[0].name).toBe('Ночная смена');
  await page.locator('section input').fill('Выживает');
  await expect(page.locator('section [role="button"]')).toHaveCount(8);
  await page.locator('section input').fill('Грязный фокусник');
  await expect(page.locator('section [role="button"]')).toHaveCount(1);
  await page.locator('section [role="button"]').click();
  await expect(page.getByTestId('balance')).toHaveText('$ 1,460');
  expect((await state(page)).owned['demo-cat-20']).toBe(1);
  await page.locator('section input').fill('нет-такой-карты');
  await expect(page.locator('section [role="button"]')).toHaveCount(0);
  await page.locator('section input').fill('');
  await expect(page.locator('section [role="button"]')).toHaveCount(8);
  await page.locator('section input').blur();
  await page.screenshot({ path: 'artifacts/metagame-deck.png', animations: 'disabled' });
  await page.reload(); await page.getByRole('button', { name: 'Играть как гость' }).click();
  await expect(page.locator('header')).toContainText('Ночная смена');
});
test('pack purchase is charged once, resumes, flips five cards', async ({ page }) => {
  await enter(page, 'shop');
  await page.getByRole('button', { name: 'Паки карт', exact: true }).click();
  await page.screenshot({ path: 'artifacts/metagame-packs.png' });
  const before = await state(page);
  await page.getByRole('button', { name: 'Купить пак ($100)', exact: true }).click();
  await expect(page.getByTestId('balance')).toHaveText('$ 1,400');
  await page.reload(); await page.getByRole('button', { name: 'Играть как гость' }).click();
  await page.getByRole('button', { name: /МАГАЗИН/i }).last().click();
  await page.getByRole('button', { name: 'Порвать пак' }).click();
  for (let i = 1; i <= 5; i++) await page.getByRole('button', { name: `Перевернуть карту ${i}` }).click();
  await page.getByRole('button', { name: 'Ура, в коллекцию!' }).click();
  const after = await state(page);
  expect(after.dollars).toBe(1400);
  expect(Object.values(after.owned).reduce((a: number, b) => a + Number(b), 0)).toBe(Object.values(before.owned).reduce((a: number, b) => a + Number(b), 0) + 5);
  expect(after.opening).toBeUndefined();
});
test('case lands on awarded card and stays within 16:9', async ({ page }) => {
  await enter(page, 'shop');
  await page.getByRole('button', { name: 'Кейсы', exact: true }).click();
  await page.screenshot({ path: 'artifacts/metagame-cases.png' });
  await page.getByRole('button', { name: 'ОТКРЫТЬ КЕЙС ($150)', exact: true }).click();
  const purchase = await state(page);
  expect(purchase.dollars).toBe(1350);
  expect(purchase.opening.reel[purchase.opening.landing].id).toBe(purchase.opening.prize.id);
  await expect(page.getByRole('dialog', { name: 'Выигранная карта' })).toBeVisible({ timeout: 10000 });
  const x = await page.locator('.roulette-ribbon').evaluate(el => new DOMMatrix(getComputedStyle(el).transform).m41);
  expect(x).toBeCloseTo(-(40 * 168 + 84 - 590), 0);
  await page.getByRole('button', { name: 'Ура, в коллекцию!' }).click();
  for (const viewport of [{ width: 1280, height: 720 }, { width: 390, height: 844 }, { width: 2560, height: 1080 }]) {
    await page.setViewportSize(viewport);
    const bounds = await page.locator('header').boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0); expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width + 1);
    const button = await page.getByRole('button', { name: 'ОТКРЫТЬ КЕЙС ($150)', exact: true }).boundingBox();
    expect(button!.y + button!.height).toBeLessThanOrEqual(viewport.height + 1);
  }
});
test('slot bonus pack is redeemable and no second charge while spinning', async ({ page }) => {
  await page.addInitScript(() => { Math.random = () => .8; });
  await enter(page, 'shop');
  await page.screenshot({ path: 'artifacts/metagame-slots.png' });
  await page.getByRole('button', { name: 'Потянуть рычаг ($50)', exact: true }).click();
  await expect(page.locator('.slot-lever')).toBeDisabled();
  await expect(page.locator('.reel-window')).toHaveCount(3);
  await expect(page.locator('.slot-lever')).toBeEnabled({ timeout: 10000 });
  expect((await state(page)).inventory.basement).toBe(1);
  await expect(page.getByTestId('balance')).toHaveText('$ 1,450');
  await page.getByRole('button', { name: 'Паки карт', exact: true }).click();
  await page.getByRole('button', { name: 'Открыть бонусный пак' }).click();
  expect((await state(page)).inventory.basement).toBe(0);
  await expect(page.getByTestId('balance')).toHaveText('$ 1,450');
});

test('insufficient balance disables purchases without modifying ownership', async ({ page }) => {
  await enter(page, 'shop');
  await page.evaluate(() => { const key = 'kartishki-demo-economy-v1'; const s = JSON.parse(localStorage.getItem(key)!); s.dollars = 49; localStorage.setItem(key, JSON.stringify(s)); });
  await enter(page, 'shop');
  const before = await state(page);
  await expect(page.getByRole('button', { name: 'Потянуть рычаг ($50)', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Паки карт', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Купить пак ($100)', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Кейсы', exact: true }).click();
  await expect(page.getByRole('button', { name: 'ОТКРЫТЬ КЕЙС ($150)', exact: true })).toBeDisabled();
  expect(await state(page)).toEqual(before);
});

test('lever drag charges once and a resumed cash reward settles once', async ({ page }) => {
  await page.addInitScript(() => { Math.random = () => .01; });
  await enter(page, 'shop');
  const lever = page.locator('.slot-lever');
  const box = (await lever.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + 20);
  await page.mouse.down(); await page.mouse.move(box.x + box.width / 2, box.y + 85, { steps: 8 }); await page.mouse.up();
  await expect(page.getByTestId('balance')).toHaveText('$ 1,450');
  await expect(page.locator('.currency-badge.spend')).toHaveText('-$50');
  await expect(lever).toBeDisabled();
  await page.reload(); await page.getByRole('button', { name: 'Играть как гость' }).click();
  await page.getByRole('button', { name: /МАГАЗИН/i }).last().click();
  await expect(page.getByTestId('balance')).toHaveText('$ 1,550', { timeout: 10000 });
  await expect(page.locator('.currency-badge.gain')).toHaveText('+$100');
  expect((await state(page)).opening).toBeUndefined();
  await page.reload(); await page.getByRole('button', { name: 'Играть как гость' }).click();
  await expect(page.getByTestId('balance')).toHaveText('$ 1,550');
});
