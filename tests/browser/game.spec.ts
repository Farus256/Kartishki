import { test, expect, type Page } from '@playwright/test';
import type { Snapshot } from '../../apps/client/src/session';

const snapshot = (page: Page): Promise<Snapshot> => page.evaluate("import('/src/session.ts').then(m=>m.session.getSnapshot())");
async function canvasClick(page: Page,x: number,y: number) {
  const box=await page.locator('.board canvas').boundingBox(); if(!box) throw new Error('Canvas missing');
  const scale=Math.min(box.width/1000,box.height/720);
  await page.mouse.click(box.x+(box.width-1000*scale)/2+x*scale,box.y+(box.height-720*scale)/2+y*scale);
}
async function enterMatch(page: Page) {
  await page.goto('http://127.0.0.1:5173');
  await page.getByRole('button', { name: 'Играть как гость' }).click();
  await page.getByRole('button', { name: 'ИГРАТЬ' }).click();
}
test('editor publishes filtered photo and audio; clients play and attack through Pixi', async ({ browser, request })=>{
  const editor=await browser.newPage({viewport:{width:1280,height:1100}});
  const a=await browser.newPage({viewport:{width:1280,height:1100}}), b=await browser.newPage({viewport:{width:1280,height:1100}});
  const errors: string[]=[]; for(const page of [editor,a,b]) page.on('pageerror',e=>errors.push(e.message));
  await editor.goto('http://127.0.0.1:5174'); await expect(editor.getByRole('status')).toContainText('Каталог загружен');
  await editor.getByRole('button',{name:'Новая карта',exact:true}).click();
  await editor.getByLabel('ID карты').fill('browser-card'); await editor.getByLabel('Название (ru)').fill('Чернильный тест');
  const png=await editor.evaluate(()=>{const c=document.createElement('canvas');c.width=100;c.height=100;const ctx=c.getContext('2d')!;ctx.fillStyle='#fff';ctx.fillRect(0,0,100,100);ctx.fillStyle='#222';ctx.fillRect(10,10,40,80);return c.toDataURL().split(',')[1];});
  await editor.getByLabel('Фотография').setInputFiles({name:'photo.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
  await editor.getByLabel('Порог чернил').fill('0.7');
  await editor.getByLabel('Контрацептив',{exact:true}).check();
  await editor.getByRole('button',{name:'Добавить способность'}).click();
  await editor.getByLabel('Типы существ (через запятую)').fill('кот,бумага');
  await expect(editor.locator('.inspect-art canvas')).toBeVisible();
  const wav=Buffer.alloc(46); wav.write('RIFF');wav.writeUInt32LE(38,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(8000,24);wav.writeUInt32LE(16000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(2,40);
  await editor.getByLabel('Появление на столе',{exact:true}).setInputFiles({name:'spawn.wav',mimeType:'audio/wav',buffer:wav});
  await expect(editor.locator('audio')).toHaveCount(1);
  await editor.getByLabel('Ключ администратора').fill('local-browser-test-key');
  await editor.getByRole('button',{name:'Опубликовать',exact:true}).click(); await expect(editor.getByRole('status')).toContainText('Карта опубликована');
  const catalog=await (await request.get('http://127.0.0.1:2567/api/catalog')).json();
  const custom=catalog.cards.find((c:{id:string})=>c.id==='browser-card'); expect(custom.art.url).toMatch(/^data:image/); expect(custom.audio.spawn).toMatch(/^data:audio/);
  const denied=await request.put('http://127.0.0.1:2567/api/catalog',{data:{card:custom,version:catalog.version}}); expect(denied.status()).toBe(401);
  await editor.screenshot({path:'artifacts/editor.png',fullPage:true});
  await enterMatch(a); await enterMatch(b);
  await expect.poll(async()=> (await snapshot(a)).status).toBe('active');
  await expect(a.locator('.board canvas')).toBeVisible({ timeout: 10_000 });
  await expect.poll(async()=> (await snapshot(b)).cards.length).toBe(catalog.cards.length);
  let summoned='', owner: Page | undefined;
  for(let step=0;step<45 && !summoned;step++) {
    const sa=await snapshot(a), active=sa.activePlayer===sa.sessionId?a:b, s=await snapshot(active);
    if(s.phase==='main') {
      const mana=s.players.find(p=>p.id===s.sessionId)!.mana;
      const n=s.hand.findIndex(h=>s.cards.find(c=>c.id===h.cardId)!.cost<=mana);
      if(n>=0) {
        await canvasClick(active,(1000-(s.hand.length*96+20))/2+n*96+48,610);
        await expect.poll(async()=> (await snapshot(active)).minions.length).toBe(1);
        summoned=(await snapshot(active)).minions[0].id; owner=active; break;
      }
    }
    await active.getByRole('button',{name:'Следующая фаза'}).click(); await expect.poll(async()=> (await snapshot(active)).revision).toBeGreaterThan(s.revision);
  }
  expect(summoned).not.toBe(''); expect(owner).toBeTruthy();
  for(let step=0;step<45;step++) {
    const sa=await snapshot(a),active=sa.activePlayer===sa.sessionId?a:b,s=await snapshot(active),m=s.minions.find(m=>m.id===summoned)!;
    if(active===owner && s.phase==='combat' && m.ready) {
      const enemy=s.players.find(p=>p.id!==s.sessionId)!;
      await canvasClick(active,102,368); await canvasClick(active,500,45);
      await expect.poll(async()=> (await snapshot(active)).players.find(p=>p.id===enemy.id)!.health).toBe(enemy.health-m.attack);
      await expect.poll(async()=> (await snapshot(active)).minions.find(m=>m.id===summoned)!.ready).toBe(false);
      break;
    }
    await active.getByRole('button',{name:'Следующая фаза'}).click(); await expect.poll(async()=> (await snapshot(active)).revision).toBeGreaterThan(s.revision);
    if(step===44) throw new Error('Attack turn not reached');
  }
  await a.screenshot({path:'artifacts/battle.png',fullPage:true});
  // Reach a real minion death to exercise the tear masks and particle cleanup.
  let died = false;
  for (let step=0; step<90 && !died; step++) {
    const sa=await snapshot(a), active=sa.activePlayer===sa.sessionId?a:b, s=await snapshot(active);
    if (s.phase==='main') {
      const mana=s.players.find(p=>p.id===s.sessionId)!.mana;
      const n=s.hand.findIndex(h=>s.cards.find(c=>c.id===h.cardId)!.cost<=mana);
      if(n>=0 && s.minions.filter(m=>m.owner===s.sessionId).length<7) {
        await canvasClick(active,(1000-(s.hand.length*96+20))/2+n*96+48,610);
        await expect.poll(async()=> (await snapshot(active)).revision).toBeGreaterThan(s.revision);
        continue;
      }
    }
    if(s.phase==='combat') {
      const own=s.minions.filter(m=>m.owner===s.sessionId), enemy=s.minions.filter(m=>m.owner!==s.sessionId);
      const n=own.findIndex(m=>m.ready);
      if(n>=0 && enemy.length) {
        await canvasClick(active,102+n*130,368); await canvasClick(active,102,168);
        await expect.poll(async()=> (await snapshot(active)).revision).toBeGreaterThan(s.revision);
        died=(await snapshot(active)).minions.length<s.minions.length;
        if(died) { await active.screenshot({path:'artifacts/impact.png',fullPage:true}); await active.waitForTimeout(750); }
        continue;
      }
    }
    await active.getByRole('button',{name:'Следующая фаза'}).click();
    await expect.poll(async()=> (await snapshot(active)).revision).toBeGreaterThan(s.revision);
  }
  expect(died).toBe(true);
  await b.getByRole('button',{name:'Выйти',exact:true}).click(); await expect(a.locator('.result')).toHaveText('Победа');
  expect(errors).toEqual([]); await editor.close();await a.close();await b.close();
});

test('paper desk fits a narrow viewport and reduced motion keeps cards usable', async ({page}) => {
  await page.setViewportSize({width:390,height:844});
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto('http://127.0.0.1:5173');
  await expect(page.getByText('КАРТИШКИ')).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>document.fonts.check('16px Neucha','Картишки'))).toBe(true);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
  await page.getByRole('button', { name: 'Играть как гость' }).click();
  await page.getByRole('button', { name: 'НАСТРОЙКИ' }).click();
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
  await page.goto('http://127.0.0.1:5173');
  await page.getByLabel('Имя').fill(username);
  await page.getByLabel('Пароль').fill('password1');
  await page.getByRole('button', { name: 'Регистрация' }).click();
  await expect(page.getByText(username)).toBeVisible();
  await expect(page.getByText('Рейтинг')).toBeVisible();
  await expect(page.getByText('1000')).toBeVisible();
  await page.getByRole('button', { name: /Ежедневная награда/ }).click();
  await expect(page.getByText('100')).toBeVisible();
  await page.getByRole('button', { name: 'МАГАЗИН' }).click();
  await page.getByRole('button', { name: /Пачка 5 карт/ }).click();
  await page.getByRole('button', { name: 'Порвать пак' }).click();
  await expect(page.locator('.pack-card')).toHaveCount(5);
  await page.locator('.pack-card').first().click();
  await expect(page.locator('.pack-card').first()).not.toHaveClass(/closed/);
  await page.screenshot({ path: 'artifacts/account.png', fullPage: true });
});
