import { test, expect } from '@playwright/test';
import type { Catalog } from '@kartishki/shared';

test('editor publishes a Battlegrounds minion into the catalog', async ({ page, request }) => {
  const server = process.env.SERVER_TEST_URL ?? 'http://127.0.0.1:2567';
  await page.goto(process.env.EDITOR_TEST_URL ?? 'http://127.0.0.1:5174');
  await page.getByRole('button', { name: 'Поле сражений', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Редактор поля сражений' })).toBeVisible();
  await page.getByLabel('Каталог лавки').selectOption('ab-whelp');
  await page.getByLabel('Атака', { exact: true }).fill('7');
  await page.getByLabel('Здоровье', { exact: true }).fill('5');
  await expect(page.locator('.ab-minion-stats b')).toContainText('7');
  await expect(page.locator('.ab-minion-stats i')).toContainText('5');
  await page.getByRole('button', { name: 'Опубликовать существо', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Существо опубликовано');
  const catalog: Catalog = await (await request.get(`${server}/api/catalog`)).json();
  const whelp = catalog.autoBattlerMinions?.find(m => m.id === 'ab-whelp');
  expect(whelp?.attack).toBe(7);
  expect(whelp?.health).toBe(5);
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
  await page.getByRole('button', { name: 'Названия и описания', exact: true }).click();
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
