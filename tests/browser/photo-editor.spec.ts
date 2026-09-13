import {test,expect} from '@playwright/test';
import {resolve} from 'node:path';
import {readFileSync} from 'node:fs';

test('real portrait presets preserve original bytes, export settings and share the card preview',async({page,request})=>{
 await page.goto(process.env.EDITOR_TEST_URL??'http://127.0.0.1:5174');
 await page.getByRole('button',{name:'Обычные карты',exact:true}).click();
 const original=resolve('Foto/image-removebg-preview.png');
 await page.getByLabel('Фотография',{exact:true}).setInputFiles(original);
 const selector=page.getByLabel('Цветовой пресет');await expect(selector).toHaveValue('printed');
 const preview=page.locator('.photo-preview img');await expect(preview).toBeVisible();
 let previous=await preview.getAttribute('src');
 for(const preset of ['dirty','noir','faded','sepia','harsh','cyan','bleach','toon','none','printed']){await selector.selectOption(preset);await expect.poll(()=>preview.getAttribute('src')).not.toBe(previous);previous=await preview.getAttribute('src');}
 await page.locator('.portrait-advanced summary').click();
 await page.getByLabel('Зерно',{exact:false}).fill('0.2');await page.getByLabel('Теплота').fill('0.18');
 await page.getByLabel('Портрет в лавке').selectOption('ab-whelp');
 await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('kartishki-editor-draft-v1')??'{}').art?.grain)).toBe(.2);
 const draft=await page.evaluate(()=>JSON.parse(localStorage.getItem('kartishki-editor-draft-v1')!));
 const stored=await request.get(draft.art.originalUrl);expect(stored.ok()).toBeTruthy();expect(await stored.body()).toEqual(readFileSync(original));
 const download=page.waitForEvent('download');await page.locator('.publish > button').first().click();
 const stream=await(await download).createReadStream();const chunks:Buffer[]=[];for await(const c of stream!)chunks.push(Buffer.from(c));
 const card=JSON.parse(Buffer.concat(chunks).toString());expect(card.art.preset).toBe('printed');expect(card.art.grain).toBe(.2);expect(card.art.originalUrl).toBe(draft.art.originalUrl);expect(card.autoBattlerId).toBe('ab-whelp');
 await page.screenshot({path:'artifacts/photo-editor.png',fullPage:true});
});

test('several supplied real faces render through every restrained preset',async({page})=>{
 await page.goto(process.env.EDITOR_TEST_URL??'http://127.0.0.1:5174');
 await page.getByRole('button',{name:'Обычные карты',exact:true}).click();
 for(const [i,file] of ['Foto/image-removebg-preview.png','Foto/image-removebg-preview (1).png','Foto/photo_2026-09-11_17-52-52-removebg-preview.png'].entries()){
  await page.getByLabel('Фотография',{exact:true}).setInputFiles(resolve(file));await expect(page.getByLabel('Цветовой пресет')).toHaveValue('printed');
  await expect.poll(()=>page.locator('.photo-preview img').getAttribute('src')).toMatch(/^data:image/);
  for(const preset of ['none','printed','dirty','noir']){
   await page.getByLabel('Цветовой пресет').selectOption(preset);await page.waitForTimeout(180);
   await page.locator('.photo-pipeline').screenshot({path:`artifacts/portrait-${i}-${preset}.png`});
  }
 }
});
