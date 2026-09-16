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
  await page.getByRole('button', { name: 'Паки', exact: true }).click();
  await page.screenshot({ path: 'artifacts/metagame-packs.png' });
  const before = await state(page);
  await page.getByRole('button', { name: 'Купить пак ($100)', exact: true }).click();
  const mid = await state(page);
  const rewards = mid.opening.result.rewards as { kind: string; amount?: number }[];
  const fresh = rewards.filter(reward => reward.kind === 'card').length;
  const dust = rewards.filter(reward => reward.kind === 'duplicate').reduce((sum, reward) => sum + Number(reward.amount), 0);
  expect(fresh + rewards.filter(reward => reward.kind === 'duplicate').length).toBe(5);
  expect(mid.dollars).toBe(1400);
  await expect(page.getByTestId('player-level')).toContainText('25 / 40');
  await expect(page.getByTestId('player-level')).toContainText('осталось 15');
  await page.reload(); await page.getByRole('button', { name: 'Играть как гость' }).click();
  await page.getByRole('button', { name: /МАГАЗИН/i }).last().click();
  await page.getByRole('button', { name: 'Порвать пак' }).click();
  for (let i = 1; i <= 5; i++) await page.getByRole('button', { name: `Перевернуть карту ${i}` }).click();
  if (dust) await expect(page.getByText(/Уже в альбоме:/)).toBeVisible();
  await page.getByRole('button', { name: 'Ура, в коллекцию!' }).click();
  const after = await state(page);
  expect(after.dollars).toBe(1400 + dust);
  expect(Object.values(after.owned).reduce((a: number, b) => a + Number(b), 0)).toBe(Object.values(before.owned).reduce((a: number, b) => a + Number(b), 0) + fresh);
  expect(after.opening).toBeUndefined();
});
test('all-inclusive pack rips like the others and still converts album duplicates', async ({ page }) => {
  await enter(page, 'shop');
  await page.getByRole('button', { name: 'Паки', exact: true }).click();
  await page.getByRole('button', { name: 'Всё включено' }).click();
  const before = await state(page);
  await expect(page.locator('.product-choice.chosen .foil-brand')).toHaveText('Картишки Всё включено');
  await expect(page.locator('.product-choice.chosen .foil-emblem')).toHaveText('$');
  await page.screenshot({ path: 'artifacts/metagame-mixed-pack.png' });
  await page.getByRole('button', { name: 'Купить пак ($150)', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Порвать пак' })).toBeVisible();
  await expect(page.locator('.sealed-pack .foil-brand')).toHaveText('Картишки Всё включено');
  await expect(page.locator('.sealed-pack .foil-emblem')).toHaveText('$');
  const mid = await state(page);
  const rewards = mid.opening.result.rewards as { kind: string; amount?: number }[];
  const fresh = rewards.filter(reward => reward.kind === 'card').length;
  const dust = rewards.filter(reward => reward.kind === 'duplicate').reduce((sum, reward) => sum + Number(reward.amount), 0);
  const cash = rewards.filter(reward => reward.kind === 'currency').reduce((sum, reward) => sum + Number(reward.amount), 0);
  expect(mid.dollars).toBe(1350);
  await page.getByRole('button', { name: 'Порвать пак' }).click();
  for (let i = 0; i < rewards.length; i++) {
    const kind = rewards[i]!.kind;
    await page.getByRole('button', { name: kind === 'card' || kind === 'duplicate' ? `Перевернуть карту ${i + 1}` : `Перевернуть награду ${i + 1}` }).click();
  }
  if (dust) await expect(page.getByText(/Уже в альбоме:/)).toBeVisible();
  await page.getByRole('button', { name: 'Ура, в коллекцию!' }).click();
  const after = await state(page);
  expect(after.dollars).toBe(1350 + dust + cash);
  expect(Object.values(after.owned).reduce((a: number, b) => a + Number(b), 0)).toBe(Object.values(before.owned).reduce((a: number, b) => a + Number(b), 0) + fresh);
  expect(after.opening).toBeUndefined();
});
test('case lands on awarded card and stays within 16:9', async ({ page }) => {
  await enter(page, 'shop');
  await page.getByRole('button', { name: 'Сундуки', exact: true }).click();
  await page.screenshot({ path: 'artifacts/metagame-cases.png' });
  await page.getByRole('button', { name: 'ОТКРЫТЬ СУНДУК ($150)', exact: true }).click();
  const purchase = await state(page);
  const chestCash = (purchase.opening.result.rewards as { kind: string; amount?: number }[]).reduce((sum, reward) => sum + (reward.kind === 'duplicate' || reward.kind === 'currency' ? Number(reward.amount) : 0), 0);
  expect(purchase.dollars).toBe(1350);
  expect(purchase.opening.reel[purchase.opening.landing].card.id).toBe(purchase.opening.result.rewards[0].cardId);
  await expect(page.getByRole('dialog', { name: 'Выигранная карта' })).toBeVisible({ timeout: 10000 });
  if (chestCash) await expect(page.getByRole('dialog').getByText(/уже в альбоме/i).first()).toBeVisible();
  const x = await page.locator('.roulette-ribbon').evaluate(el => new DOMMatrix(getComputedStyle(el).transform).m41);
  expect(x).toBeCloseTo(-(40 * 168 + 84 - 590), 0);
  await page.getByRole('button', { name: /Ура, в коллекцию!|Забрать доллары/ }).click();
  expect((await state(page)).dollars).toBe(1350 + chestCash);
  for (const viewport of [{ width: 1280, height: 720 }, { width: 390, height: 844 }, { width: 2560, height: 1080 }]) {
    await page.setViewportSize(viewport);
    await expect.poll(async () => { const bounds = await page.locator('header').boundingBox(); return !!bounds && bounds.x >= 0 && bounds.x + bounds.width <= viewport.width + 1; }).toBe(true);
    const button = await page.locator('.shop-receipt').getByRole('button', { name: 'ОТКРЫТЬ СУНДУК ($150)', exact: true }).boundingBox();
    expect(button!.y + button!.height).toBeLessThanOrEqual(viewport.height + 1);
  }
});
test('slot payout settles once and does not charge twice while spinning', async ({ page }) => {
  await page.addInitScript(() => { Math.random = () => .01; });
  await enter(page, 'shop');
  await page.screenshot({ path: 'artifacts/metagame-slots.png' });
  const spin = page.getByRole('button', { name: /SPIN/ });
  await spin.click();
  await expect(spin).toBeDisabled();
  await expect(page.locator('.reel-window')).toHaveCount(3);
  await expect(spin).toBeEnabled({ timeout: 10000 });
  await expect(page.getByTestId('balance')).toHaveText('$ 1,600');
});

test('casino wheel reveals and settles a prize once', async ({ page }) => {
  await page.addInitScript(() => { Math.random = () => .01; });
  await enter(page, 'shop');
  await page.getByRole('button', { name: 'Казино', exact: true }).click();
  await page.getByRole('button', { name: /Колесо фортуны/ }).click();
  await expect(page.getByRole('button', { name: /Машина Юзи/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Крутить за $75' })).toBeVisible();
  await expect(page.getByText(/вручную за \$400/)).toBeVisible();
  await expect(page.locator('.casino-rules')).toHaveCount(0);
  await page.screenshot({ path: 'artifacts/metagame-casino.png' });

  await page.getByRole('button', { name: 'Крутить за $75' }).click();
  await expect(page.getByTestId('balance')).toHaveText('$ 1,425');
  await expect(page.getByTestId('balance')).toHaveText('$ 1,450', { timeout: 8000 });
  const settled = await state(page);
  expect(settled.opening).toBeUndefined();
  expect(settled.dollars).toBe(1450);
});

test('insufficient balance disables purchases without modifying ownership', async ({ page }) => {
  await enter(page, 'shop');
  await page.evaluate(() => { const key = 'kartishki-demo-economy-v1'; const s = JSON.parse(localStorage.getItem(key)!); s.dollars = 49; localStorage.setItem(key, JSON.stringify(s)); });
  await enter(page, 'shop');
  const before = await state(page);
  await expect(page.getByRole('button', { name: /SPIN/ })).toBeDisabled();
  await page.getByRole('button', { name: 'Паки', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Купить пак ($100)', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Сундуки', exact: true }).click();
  await expect(page.getByRole('button', { name: 'ОТКРЫТЬ СУНДУК ($150)', exact: true })).toBeDisabled();
  expect(await state(page)).toEqual(before);
});

test('slot spin charges once and a resumed cash reward settles once', async ({ page }) => {
  await page.addInitScript(() => { Math.random = () => .01; });
  await enter(page, 'shop');
  const spin = page.getByRole('button', { name: /SPIN/ });
  await spin.click();
  await expect(page.getByTestId('balance')).toHaveText('$ 1,450');
  await expect(page.locator('.currency-badge.spend')).toHaveText('-$50');
  await expect(spin).toBeDisabled();
  await page.reload(); await page.getByRole('button', { name: 'Играть как гость' }).click();
  await page.getByRole('button', { name: /МАГАЗИН/i }).last().click();
  await expect(page.getByTestId('balance')).toHaveText('$ 1,600', { timeout: 10000 });
  await expect(page.locator('.currency-badge.gain')).toHaveText('+$150');
  expect((await state(page)).opening).toBeUndefined();
  await page.reload(); await page.getByRole('button', { name: 'Играть как гость' }).click();
  await expect(page.getByTestId('balance')).toHaveText('$ 1,600');
});
