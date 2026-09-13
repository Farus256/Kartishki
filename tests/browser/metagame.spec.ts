import { test, expect, type Page } from '@playwright/test';
const state = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('kartishki-demo-economy-v1')!));

test('custom music takes priority and skips an unavailable track', async ({ page }) => {
  const first = `/api/music/${'a'.repeat(64)}.wav`;
  const second = `/api/music/${'b'.repeat(64)}.wav`;
  const wav = Buffer.alloc(44 + 16000);
  wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(16000, 40);
  await page.route('**/api/catalog', route => route.fulfill({ json: { cards: [], menuMusic: { tracks: [
    { id: 'first', name: 'Unavailable', url: first }, { id: 'second', name: 'Custom', url: second },
  ] } } }));
  await page.route(`**${first}`, route => route.fulfill({ status: 404 }));
  await page.route(`**${second}`, route => route.fulfill({ contentType: 'audio/wav', body: wav }));
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.setItem('sound', 'on');
    const original = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      (window as unknown as { musicNode: HTMLMediaElement }).musicNode = this;
      return original.call(this);
    };
  });
  await page.getByRole('button', { name: 'Играть как гость' }).click();
  await expect.poll(() => page.evaluate(() => {
    const node = (window as unknown as { musicNode?: HTMLMediaElement }).musicNode;
    return node && !node.paused && node.readyState >= 2 ? new URL(node.src).pathname : '';
  })).toBe(second);
});
async function enter(page: Page, screen: 'deck' | 'shop') {
  await page.goto('/');
  await page.getByRole('button', { name: 'Играть как гость' }).click();
  await page.getByRole('button', { name: screen === 'deck' ? /МОЯ КОЛОДА/i : /^.*МАГАЗИН.*$/i }).last().click();
  await expect(screen === 'shop' ? page.getByRole('navigation', { name: 'Режим магазина' }) : page.locator('section input')).toBeVisible();
}
test.beforeEach(async ({ page }) => {
  await page.route('**/health', route => route.fulfill({ json: { status: 'ok' } }));
  await page.route('**/api/catalog', route => route.fulfill({ json: { cards: [] } }));
  await page.addInitScript(() => localStorage.setItem('sound', 'off'));
});
test('deck editing, limits, search and persistence', async ({ page }) => {
  await enter(page, 'deck');
  await expect(page.getByTestId('balance')).toHaveText('$ 1,500');
  await expect(page.locator('section .grid-cols-4 > div')).toHaveCount(8);
  await page.getByRole('button', { name: 'Убрать Завсегдатай', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Сохранить колоду' })).toBeDisabled();
  await page.getByRole('button', { name: 'Завсегдатай', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Карта: Завсегдатай' })).toBeVisible();
  await expect(page.locator('.full-card-text')).toContainText('За этим столом');
  await page.screenshot({ path: 'artifacts/card-detail.png' });
  await page.getByRole('button', { name: 'Добавить в колоду', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Добавить в колоду', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Закрыть ×', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Сохранить колоду' })).toBeEnabled();
  await page.locator('aside > input').fill('Ночная смена');
  await page.getByRole('button', { name: 'Сохранить колоду' }).click();
  expect((await state(page)).decks[0].name).toBe('Ночная смена');
  await page.locator('section input').fill('Выживает');
  await expect(page.locator('section [role="button"]')).toHaveCount(8);
  await page.locator('section input').fill('Грязный фокусник');
  await expect(page.getByText('Грязный фокусник')).toBeVisible();
  // Unowned cards remain inspectable, but cannot be added to a deck.
  await page.locator('section [role="button"]').click();
  await expect(page.getByRole('button', { name: 'Добавить в колоду', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Закрыть ×', exact: true }).click();
  await expect(page.getByTestId('balance')).toHaveText('$ 1,500');
  expect((await state(page)).owned['demo-cat-20']).toBeUndefined();
  await page.locator('section input').fill('нет-такой-карты');
  await expect(page.locator('section [role="button"]')).toHaveCount(0);
  await page.locator('section input').fill('');
  await expect(page.locator('section [role="button"]')).toHaveCount(8);
  await page.locator('section input').blur();
  await page.screenshot({ path: 'artifacts/metagame-deck.png', animations: 'disabled' });
  await page.reload(); await page.getByRole('button', { name: 'Играть как гость' }).click();
  await expect(page.getByTestId('player-level')).toBeVisible();
  await expect(page.locator('header')).not.toContainText('Ночная смена');
  await page.getByRole('button', { name: /МОЯ КОЛОДА/i }).last().click();
  await expect(page.locator('aside > input')).toHaveValue('Ночная смена');
});
test('pack purchase is charged once, resumes, flips five cards', async ({ page }) => {
  await enter(page, 'shop');
  await page.getByRole('button', { name: 'Паки карт', exact: true }).click();
  await page.screenshot({ path: 'artifacts/metagame-packs.png' });
  const before = await state(page);
  await page.getByRole('button', { name: 'Купить пак ($100)', exact: true }).click();
  await expect(page.getByTestId('balance')).toHaveText('$ 1,400');
  await expect(page.getByTestId('player-level')).toContainText('25 / 40');
  await expect(page.getByTestId('player-level')).toContainText('осталось 15');
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
    await expect.poll(async () => { const bounds = await page.locator('header').boundingBox(); return !!bounds && bounds.x >= 0 && bounds.x + bounds.width <= viewport.width + 1; }).toBe(true);
    const button = await page.getByRole('button', { name: 'ОТКРЫТЬ КЕЙС ($150)', exact: true }).boundingBox();
    expect(button!.y + button!.height).toBeLessThanOrEqual(viewport.height + 1);
  }
});
test('slot bonus pack is redeemable and no second charge while spinning', async ({ page }) => {
  await page.addInitScript(() => { Math.random = () => .9; });
  await enter(page, 'shop');
  await page.screenshot({ path: 'artifacts/metagame-slots.png' });
  await page.getByRole('button', { name: 'Потянуть рычаг ($50)', exact: true }).click();
  await expect(page.locator('.slot-lever')).toBeDisabled();
  await expect(page.locator('.reel-window')).toHaveCount(3);
  await expect(page.locator('.slot-lever')).toBeEnabled({ timeout: 10000 });
  expect((await state(page)).inventory.basement).toBe(3);
  await expect(page.getByTestId('balance')).toHaveText('$ 1,450');
  await page.getByRole('button', { name: 'Паки карт', exact: true }).click();
  await page.getByRole('button', { name: 'Открыть бонусный пак' }).click();
  expect((await state(page)).inventory.basement).toBe(2);
  await expect(page.getByTestId('balance')).toHaveText('$ 1,450');
});

test('casino wheel, money case and money pack reveal and settle prizes once', async ({ page }) => {
  await page.addInitScript(() => { Math.random = () => .01; });
  await enter(page, 'shop');
  await page.getByRole('button', { name: 'Колесо и деньги', exact: true }).click();
  await expect(page.getByRole('button', { name: /Колесо фортуны/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Денежный кейс/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Пак с наличными/ })).toBeVisible();
  await expect(page.locator('.casino-rules')).toContainText('ДЕНЬГИ · ОПЫТ · КАРТЫ');
  await page.screenshot({ path: 'artifacts/metagame-casino.png' });

  await page.getByRole('button', { name: 'Играть за $75', exact: true }).click();
  await expect(page.getByTestId('balance')).toHaveText('$ 1,425');
  await expect(page.getByText('$25', { exact: true })).toBeVisible({ timeout: 5000 });
  await page.getByRole('button', { name: 'Забрать награду', exact: true }).click();
  await expect(page.getByTestId('balance')).toHaveText('$ 1,450');
  const settled = await state(page);
  expect(settled.opening).toBeUndefined();
  expect(settled.dollars).toBe(1450);
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
  await expect(page.getByTestId('balance')).toHaveText('$ 1,700', { timeout: 10000 });
  await expect(page.locator('.currency-badge.gain')).toHaveText('+$250');
  expect((await state(page)).opening).toBeUndefined();
  await page.reload(); await page.getByRole('button', { name: 'Играть как гость' }).click();
  await expect(page.getByTestId('balance')).toHaveText('$ 1,700');
});
