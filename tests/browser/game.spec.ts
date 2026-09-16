import { test, expect, type Page } from '@playwright/test';
import type { Snapshot } from '../../apps/client/src/session';

const snapshot = (page: Page): Promise<Snapshot> => page.evaluate("import(performance.getEntriesByType('resource').find(e=>e.name.includes('/src/session.ts')).name).then(m=>m.session.getSnapshot())");
/** The mulligan keeps every card: both sides confirm and the first turn opens. */
async function keepHands(a: Page, b: Page) {
  await expect.poll(async () => (await snapshot(a)).status).toBe('mulligan');
  await a.getByTestId('mulligan-confirm').click(); await b.getByTestId('mulligan-confirm').click();
  await expect.poll(async () => (await snapshot(a)).status).toBe('active');
}
async function enterMatch(page: Page) {
  await page.goto((process.env.CLIENT_TEST_URL ?? 'http://127.0.0.1:5173'));
  await page.getByRole('button', { name: 'Играть как гость' }).click();
  await page.getByRole('button', { name: /1 vs 1/ }).click();
}
test('editor publishes filtered photo and audio; clients play and attack on the duel table', async ({ browser, request })=>{
  const editor=await browser.newPage({viewport:{width:1280,height:1100}});
  const a=await browser.newPage({viewport:{width:1280,height:1100}}), b=await browser.newPage({viewport:{width:1280,height:1100}});
  const errors: string[]=[]; for(const page of [editor,a,b]) page.on('pageerror',e=>errors.push(e.message));
  await editor.goto((process.env.EDITOR_TEST_URL ?? 'http://127.0.0.1:5174')); await editor.getByRole('button',{name:'Обычные карты',exact:true}).click(); await expect(editor.locator('.publish [role=status]')).toContainText('Каталог загружен');
  await editor.getByRole('button',{name:'Новая карта',exact:true}).click();
  await editor.getByLabel('ID карты').fill('browser-card'); await editor.getByLabel('Название (ru)').fill('Чернильный тест');
  const png=await editor.evaluate(()=>{const c=document.createElement('canvas');c.width=100;c.height=100;const ctx=c.getContext('2d')!;ctx.fillStyle='#fff';ctx.fillRect(0,0,100,100);ctx.fillStyle='#222';ctx.fillRect(10,10,40,80);return c.toDataURL().split(',')[1];});
  await editor.getByLabel('Фотография').setInputFiles({name:'photo.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
  await expect(editor.getByLabel('Цветовой пресет')).toHaveValue('printed');
  await editor.getByLabel(/Насыщенность/).fill('1.4');
  await editor.getByLabel('Контрацептив',{exact:true}).check();
  await editor.getByRole('button',{name:'+ Боевой клич',exact:true}).click();
  await editor.getByLabel('Типы существ (через запятую)').fill('человек,стратег');
  await expect(editor.locator('.card-detail .game-card-face img')).toBeVisible();
  const wav=Buffer.alloc(46); wav.write('RIFF');wav.writeUInt32LE(38,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(8000,24);wav.writeUInt32LE(16000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(2,40);
  await editor.getByLabel('Появление на столе',{exact:true}).setInputFiles({name:'spawn.wav',mimeType:'audio/wav',buffer:wav});
  await expect(editor.locator('audio')).toHaveCount(1);
  await editor.getByRole('button',{name:'Опубликовать',exact:true}).click(); await expect(editor.locator('.publish [role=status]')).toContainText('Карта опубликована');
  const catalog=await (await request.get(`${process.env.SERVER_TEST_URL ?? 'http://127.0.0.1:2567'}/api/catalog`)).json();
  const custom=catalog.cards.find((c:{id:string})=>c.id==='browser-card'); expect(custom.art.url).toMatch(/^data:image/); expect(custom.audio.spawn).toMatch(/^data:audio/);
  await editor.screenshot({path:'artifacts/editor.png',fullPage:true});
  await enterMatch(a); await enterMatch(b);
  await a.getByRole('button', { name: /^Выбрать героя / }).first().click();
  await b.getByRole('button', { name: /^Выбрать героя / }).first().click();
  await keepHands(a, b);
  await expect(a.getByTestId('duel-field')).toBeVisible({ timeout: 10_000 });
  await expect.poll(async()=> (await snapshot(b)).cards.length).toBe(catalog.cards.length);
  let summoned='', owner: Page | undefined;
  for(let step=0;step<45 && !summoned;step++) {
    const sa=await snapshot(a), active=sa.activePlayer===sa.sessionId?a:b, s=await snapshot(active);
    const mana=s.players.find(p=>p.id===s.sessionId)!.mana;
    const n=s.hand.findIndex(h=>{const c=s.cards.find(c=>c.id===h.cardId)!;return c.cost<=mana&&c.id!=='the-coin';});
    if(n>=0) {
      await active.getByTestId(`duel-hand-card-${s.hand[n]!.instanceId}`).click();
      await expect.poll(async()=> (await snapshot(active)).minions.length).toBe(1);
      summoned=(await snapshot(active)).minions[0].id; owner=active; break;
    }
    await active.getByRole('button',{name:'Конец хода'}).click(); await expect.poll(async()=> (await snapshot(active)).revision).toBeGreaterThan(s.revision);
  }
  expect(summoned).not.toBe(''); expect(owner).toBeTruthy();
  for(let step=0;step<45;step++) {
    const sa=await snapshot(a),active=sa.activePlayer===sa.sessionId?a:b,s=await snapshot(active),m=s.minions.find(m=>m.id===summoned)!;
    if(active===owner && m.ready) {
      const enemy=s.players.find(p=>p.id!==s.sessionId)!;
      await active.getByTestId(`duel-minion-${summoned}`).click();
      await active.getByTestId('duel-face-foe').click();
      await expect.poll(async()=> (await snapshot(active)).players.find(p=>p.id===enemy.id)!.health).toBe(enemy.health-m.attack);
      await expect.poll(async()=> (await snapshot(active)).minions.find(m=>m.id===summoned)!.ready).toBe(false);
      break;
    }
    await active.getByRole('button',{name:'Конец хода'}).click(); await expect.poll(async()=> (await snapshot(active)).revision).toBeGreaterThan(s.revision);
    if(step===44) throw new Error('Attack turn not reached');
  }
  await a.screenshot({path:'artifacts/battle.png',fullPage:true});
  // Reach a real minion death to exercise the tear masks and particle cleanup.
  let died = false;
  for (let step=0; step<90 && !died; step++) {
    const sa=await snapshot(a), active=sa.activePlayer===sa.sessionId?a:b, s=await snapshot(active);
    const mana=s.players.find(p=>p.id===s.sessionId)!.mana;
    const n=s.hand.findIndex(h=>{const c=s.cards.find(c=>c.id===h.cardId)!;return c.cost<=mana&&c.id!=='the-coin';});
    if(n>=0 && s.minions.filter(m=>m.owner===s.sessionId).length<7) {
      await active.getByTestId(`duel-hand-card-${s.hand[n]!.instanceId}`).click();
      await expect.poll(async()=> (await snapshot(active)).revision).toBeGreaterThan(s.revision);
      continue;
    }
    const own=s.minions.filter(m=>m.owner===s.sessionId), enemy=s.minions.filter(m=>m.owner!==s.sessionId);
    const ready=own.findIndex(m=>m.ready&&m.attack>0);
    // Taunt first: the table only accepts a legal target.
    const taunts=enemy.filter(m=>s.cards.find(c=>c.id===m.cardId)?.properties.includes('taunt'));
    const target=(taunts.length?taunts:enemy)[0]!;
    if(ready>=0 && enemy.length) {
      await active.getByTestId(`duel-minion-${own[ready]!.id}`).click();
      await active.getByTestId(`duel-minion-${target.id}`).click();
      await expect.poll(async()=> (await snapshot(active)).revision).toBeGreaterThan(s.revision);
      died=(await snapshot(active)).minions.length<s.minions.length;
      if(died) { await active.screenshot({path:'artifacts/impact.png',fullPage:true}); await active.waitForTimeout(750); }
      continue;
    }
    await active.getByRole('button',{name:'Конец хода'}).click();
    await expect.poll(async()=> (await snapshot(active)).revision).toBeGreaterThan(s.revision);
  }
  expect(died).toBe(true);
  await b.getByRole('button',{name:'Сдаться',exact:true}).click(); await expect(a.getByTestId('duel-result')).toHaveText('Победа');
  expect(errors).toEqual([]); await editor.close();await a.close();await b.close();
});

test('paper desk fits a narrow viewport and reduced motion keeps cards usable', async ({page}) => {
  await page.setViewportSize({width:390,height:844});
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto((process.env.CLIENT_TEST_URL ?? 'http://127.0.0.1:5173'));
  await expect(page.getByText('КАРТИШКИ')).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>document.fonts.check('16px Neucha','Картишки'))).toBe(true);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
  await page.getByRole('button', { name: 'Играть как гость' }).click();
  await page.getByRole('button', { name: 'НАСТРОЙКИ', exact: true }).click();
  await page.getByLabel('Язык').selectOption('en');
  await expect(page.getByRole('button', { name: 'Close' })).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();
  await page.setViewportSize({width:1280,height:1000});
  await page.getByRole('button', { name: 'SETTINGS' }).click();
  await page.getByLabel('Language').selectOption('ru');
  await page.screenshot({path:'artifacts/desk.png',fullPage:true});
});

test('account can register, claim daily ink and open a pack', async ({ page }) => {
  const username = `tester${Date.now()}`;
  await page.goto((process.env.CLIENT_TEST_URL ?? 'http://127.0.0.1:5173'));
  await page.getByLabel('Имя').fill(username);
  await page.getByLabel('Пароль').fill('password1');
  await page.getByRole('button', { name: 'Регистрация' }).click();
  await expect(page.getByText(username)).toBeVisible();
  await expect(page.getByRole('region', {name: 'Ранг игрока'})).toContainText('ELO 1000');
  await page.getByRole('button', { name: /Ежедневная награда/ }).click();
  await expect(page.getByRole('button', { name: /Ежедневная награда/ })).toBeDisabled();
  await expect(page.getByTestId('daily-reward')).toContainText('До следующей награды');
  await page.getByRole('button', { name: 'МАГАЗИН', exact:true }).click();
  await page.getByRole('button', { name: 'Паки', exact: true }).click();
  await page.getByRole('button', { name: /Купить пак/ }).click();
  await page.getByRole('button', { name: 'Порвать пак' }).click();
  await expect(page.getByRole('button', {name: /^Перевернуть карту/})).toHaveCount(5);
  await page.getByRole('button', { name: 'Перевернуть карту 1' }).click();
  await expect(page.getByRole('button', {name: /^Перевернуть карту/})).toHaveCount(4);
  await page.screenshot({ path: 'artifacts/account.png', fullPage: true });
});
