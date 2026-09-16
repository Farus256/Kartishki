import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';
import type { Catalog } from '@kartishki/shared';
import type { Snapshot } from '../../apps/client/src/session';
const snapshot = (page: import('@playwright/test').Page): Promise<Snapshot> => page.evaluate("import(performance.getEntriesByType('resource').find(e=>e.name.includes('/src/session.ts')).name).then(m=>m.session.getSnapshot())");
test('editor publishes hero and renamed summon triggers; players choose heroes and use a power', async ({ browser, request }) => {
  const editor=await browser.newPage({viewport:{width:1600,height:1000}});
  const server=process.env.SERVER_TEST_URL ?? 'http://127.0.0.1:2567';
  await editor.goto(process.env.EDITOR_TEST_URL ?? 'http://127.0.0.1:5174');
  await editor.getByRole('button',{name:'Обычные карты',exact:true}).click();
  await editor.getByRole('button',{name:'Новая карта',exact:true}).click();
  await editor.getByLabel('ID карты').fill('summon-browser');
  for (const trigger of ['Боевой клич','Предсмертный хрип','Боевой раж']) await editor.getByRole('button',{name:`+ ${trigger}`,exact:true}).click();
  for (let n=0;n<3;n++) {
    const ability=editor.locator('.ability-editor').nth(n);
    await ability.getByLabel('Название способности').fill(`Подмога ${n+1}`);
    await ability.getByRole('combobox',{name:'Эффект',exact:true}).selectOption('summon');
    await ability.getByLabel('Карта для призыва').selectOption('paper-imp');
    await ability.getByLabel('Количество существ').fill('2');
  }
  await editor.getByRole('button',{name:'Опубликовать',exact:true}).click();
  await expect(editor.locator('.publish [role=status]')).toContainText('Карта опубликована');
  let catalog: Catalog=await (await request.get(`${server}/api/catalog`)).json();
  expect(catalog.cards.find(c=>c.id==='summon-browser')!.abilities.map(a=>a.name)).toEqual(['Подмога 1','Подмога 2','Подмога 3']);
  await editor.getByRole('button',{name:'Редактор героев',exact:true}).click();
  await editor.getByRole('button',{name:'Новый герой',exact:true}).click();
  await editor.getByLabel('ID героя').fill('browser-hero'); await editor.getByLabel('Имя героя').fill('Герой проверки');
  await editor.getByLabel('Здоровье героя').fill('37'); await editor.getByLabel('Название силы').fill('Прицельный удар');
  await editor.getByLabel('Стоимость силы').fill('0'); await editor.getByLabel('Фотография героя').setInputFiles(resolve('Foto/image-removebg-preview.png'));
  await expect(editor.locator('.hero-photo img')).toBeVisible();
  await editor.getByRole('button',{name:'Опубликовать героя',exact:true}).click();
  await expect(editor.locator('.publish [role=status]')).toContainText('Герой опубликован');
  await editor.screenshot({path:'artifacts/hero-editor.png',fullPage:true});
  catalog=await (await request.get(`${server}/api/catalog`)).json(); const custom=catalog.heroes!.find(h=>h.id==='browser-hero')!;
  expect(custom.health).toBe(37); expect(custom.art.url).toMatch(/^data:image/);
  // All offered heroes have the same targetable power in this isolated test catalog.
  for (const h of catalog.heroes!) { const response=await request.put(`${server}/api/heroes`,{data:{version:catalog.version,hero:{...h,art:custom.art,ability:{name:'Проверочный удар',cost:0,effectId:'damage',amount:1}}}}); expect(response.ok()).toBe(true); catalog=await response.json(); }
  const a=await browser.newPage({viewport:{width:1600,height:900}}), b=await browser.newPage({viewport:{width:1600,height:900}}); const errors:string[]=[];
  for (const p of [a,b]) { p.on('pageerror',e=>errors.push(e.message)); await p.goto(process.env.CLIENT_TEST_URL ?? 'http://127.0.0.1:5173'); await p.getByRole('button',{name:'Играть как гость'}).click(); await p.getByRole('button',{name:/1 vs 1/}).click(); }
  await expect(a.getByRole('button',{name:/^Выбрать героя /})).toHaveCount(2);
  await a.screenshot({path:'artifacts/hero-choice.png'});
  await a.getByRole('button',{name:/^Выбрать героя /}).first().click();
  await expect(a.getByText('Ждём выбор соперника',{exact:true})).toBeVisible();
  await b.getByRole('button',{name:/^Выбрать героя /}).first().click();
  await expect.poll(async()=> (await snapshot(a)).status).toBe('mulligan');
  await a.getByTestId('mulligan-confirm').click(); await b.getByTestId('mulligan-confirm').click();
  await expect.poll(async()=> (await snapshot(a)).status).toBe('active');
  const initial=await snapshot(a), active=initial.activePlayer===initial.sessionId?a:b;
  await expect(active.getByTestId('duel-power')).toHaveAttribute('aria-disabled','false');
  const before=await snapshot(active), enemy=before.players.find(p=>p.id!==before.sessionId)!;
  // The power aims like an attack: arm it, then pick the enemy hero (no Taunt on an empty board).
  await active.getByTestId('duel-power').click();
  await active.getByTestId('duel-face-foe').click();
  await expect.poll(async()=> (await snapshot(active)).players.find(p=>p.id===enemy.id)!.health).toBe(enemy.health-1);
  await expect(active.getByTestId('duel-power')).toHaveAttribute('aria-disabled','true');
  await active.mouse.move(20,100); await active.waitForTimeout(1900); await active.screenshot({path:'artifacts/heroes-battle.png'});
  expect(errors).toEqual([]); await a.close();await b.close();await editor.close();
});
