import { test, expect } from '@playwright/test';

test('uploaded photo previews all presets and exports processing settings', async ({ page }) => {
  await page.goto('http://127.0.0.1:5174');
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    const gradient = ctx.createLinearGradient(0, 0, 128, 128);
    gradient.addColorStop(0, '#222'); gradient.addColorStop(1, '#fff');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = '#111'; ctx.fillRect(30, 20, 20, 60);
    return canvas.toDataURL().split(',')[1];
  });
  await page.locator('input[accept="image/png,image/jpeg,image/webp"]').setInputFiles({ name: 'portrait.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  const preview = page.locator('.inspect-art canvas');
  const pixels = () => preview.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
  const before = await pixels();
  await expect.poll(pixels).not.toBe(before);
  const xerox = await pixels();
  await page.getByLabel('Художественный фильтр').selectOption('comic');
  await expect.poll(pixels).not.toBe(xerox);
  const comic = await pixels();
  await expect(page.getByLabel('Толщина контура')).toBeEnabled();
  await expect(page.getByLabel('Интенсивность растра')).toBeDisabled();
  await page.getByLabel('Художественный фильтр').selectOption('stencil');
  await expect.poll(pixels).not.toBe(comic);
  await page.getByLabel('Порог контраста').fill('0.7');
  await page.screenshot({ path: 'artifacts/photo-editor.png', fullPage: true });
  const download = page.waitForEvent('download');
  await page.locator('.publish > button').first().click();
  const stream = await (await download).createReadStream();
  const chunks: Buffer[] = []; for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const card = JSON.parse(Buffer.concat(chunks).toString());
  expect(card.art.preset).toBe('stencil'); expect(card.art.threshold).toBe(.7);
  expect(card.art.url).toMatch(/^data:image/);
});
