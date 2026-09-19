import { test, expect } from '@playwright/test';
import type { Catalog } from '@kartishki/shared';

let original: Catalog;
test.beforeEach(async ({ request }) => {
  original = await (await request.get(`${process.env.SERVER_TEST_URL ?? 'http://127.0.0.1:2567'}/api/catalog`)).json();
});
test.afterEach(async ({ request }) => {
  const server = process.env.SERVER_TEST_URL ?? 'http://127.0.0.1:2567';
  let current: Catalog = await (await request.get(`${server}/api/catalog`)).json();
  const restore = async (path: string, field: string, value: unknown) => {
    const response = await request.put(`${server}/api/${path}`, { data: { version: current.version, [field]: value } });
    expect(response.ok()).toBeTruthy();
    current = await response.json();
  };
  const minion = original.autoBattlerMinions?.find(m => m.id === 'ab-whelp');
  const hero = original.autoBattlerHeroes?.find(h => h.id === 'ab-hero-captain');
  if (minion && JSON.stringify(minion) !== JSON.stringify(current.autoBattlerMinions?.find(m => m.id === minion.id))) await restore('auto-battler', 'minion', minion);
  if (hero && JSON.stringify(hero) !== JSON.stringify(current.autoBattlerHeroes?.find(h => h.id === hero.id))) await restore('auto-battler-heroes', 'hero', hero);
  if (JSON.stringify(original.autoBattlerCopy) !== JSON.stringify(current.autoBattlerCopy)) await restore('auto-battler-copy', 'copy', original.autoBattlerCopy ?? {});
});

test('editor publishes a Battlegrounds minion into the catalog', async ({ page, request }) => {
  const server = process.env.SERVER_TEST_URL ?? 'http://127.0.0.1:2567';
  await page.goto(process.env.EDITOR_TEST_URL ?? 'http://127.0.0.1:5174');
  await page.getByRole('button', { name: 'Поле сражений', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Редактор поля сражений' })).toBeVisible();
  await page.getByLabel('Каталог лавки').selectOption('ab-whelp');
  await page.getByLabel('Атака', { exact: true }).fill('7');
  await page.getByLabel('Здоровье', { exact: true }).fill('5');
  await page.getByRole('checkbox', { name: /^Унижение/ }).check();
  await page.getByRole('checkbox', { name: /^Байт/ }).check();
  await expect(page.locator('.ab-dossier-foot b').first()).toContainText('7');
  await expect(page.locator('.ab-dossier-foot i').first()).toContainText('5');
  await page.getByRole('button', { name: 'Опубликовать существо', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Существо опубликовано');
  const catalog: Catalog = await (await request.get(`${server}/api/catalog`)).json();
  const whelp = catalog.autoBattlerMinions?.find(m => m.id === 'ab-whelp');
  expect(whelp?.attack).toBe(7);
  expect(whelp?.health).toBe(5);
  expect(whelp?.keywords).toEqual(expect.arrayContaining(['humiliate', 'bait']));
  await page.screenshot({ path: 'artifacts/ab-editor.png', fullPage: true });
});

test('editor publishes a Battlegrounds hero into the catalog', async ({ page, request }) => {
  const server = process.env.SERVER_TEST_URL ?? 'http://127.0.0.1:2567';
  await page.goto(process.env.EDITOR_TEST_URL ?? 'http://127.0.0.1:5174');
  await page.getByRole('button', { name: 'Поле сражений', exact: true }).click();
  await page.getByRole('button', { name: 'Герои', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Герой поля сражений' })).toBeVisible();
  await page.getByLabel('Каталог героев').selectOption('ab-hero-captain');
  await page.getByLabel('Здоровье героя').fill('35');
  await expect(page.locator('.hero-health')).toContainText('35');
  await page.getByRole('button', { name: 'Опубликовать героя', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Герой опубликован');
  const catalog: Catalog = await (await request.get(`${server}/api/catalog`)).json();
  const captain = catalog.autoBattlerHeroes?.find(h => h.id === 'ab-hero-captain');
  expect(captain?.health).toBe(35);
  await page.screenshot({ path: 'artifacts/ab-hero-editor.png', fullPage: true });
});

test('editor publishes minion description and renamed tribe text', async ({ page, request }) => {
  const server = process.env.SERVER_TEST_URL ?? 'http://127.0.0.1:2567';
  await page.goto(process.env.EDITOR_TEST_URL ?? 'http://127.0.0.1:5174');
  await expect(page.getByRole('heading', { name: 'Редактор поля сражений' })).toBeVisible();
  await page.getByLabel('Каталог лавки').selectOption('ab-whelp');
  await page.getByLabel('Описание (ru)').fill('Маленький зверёк из редактора.');
  await page.getByRole('button', { name: 'Опубликовать существо', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Существо опубликовано');
  await page.getByRole('button', { name: 'Расы', exact: true }).click();
  await page.getByLabel('Зверь ru').fill('Зверьки');
  await page.getByLabel('Зверь описание').fill('Мохнатые союзники.');
  await page.getByRole('button', { name: 'Опубликовать тексты', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Названия и описания опубликованы');
  const catalog: Catalog = await (await request.get(`${server}/api/catalog`)).json();
  expect(catalog.autoBattlerMinions?.find(m => m.id === 'ab-whelp')?.description?.ru).toBe('Маленький зверёк из редактора.');
  expect(catalog.autoBattlerCopy?.tribes?.beast?.name.ru).toBe('Зверьки');
  await page.getByRole('button', { name: 'Обычные карты', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Новая карта', exact: true })).toBeVisible();
});
