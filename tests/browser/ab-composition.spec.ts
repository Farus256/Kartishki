import { test, expect, type Page } from '@playwright/test';
import { abFixture } from './abFixture';
import { actionsOf, openMockAb, pointerDrag, pointerHold, setFixture } from './abDnd';
import type { AbSnapshot } from '../../apps/client/src/autoBattlerSession';

const sizes = [{width:1920,height:1080},{width:1600,height:900},{width:1366,height:768},{width:2560,height:1440}];
function combatFixture(count: number): AbSnapshot {
 const s=abFixture(),army=s.players[0]!.board.slice(0,count),enemy=army.map(m=>({...m,id:'enemy-'+m.id,owner:'p1'}));
 s.phase='COMBAT_PHASE';s.combatBoards={playerA:'p0',playerB:'p1',a:army,b:enemy};
 s.combat={turn:8,pairIndex:0,seed:1,playerA:'p0',playerB:'p1',ghost:false,durationMs:25000,boards:{a:army,b:enemy},events:Array.from({length:40},(_,i)=>({id:i+1,kind:'ATTACK',sourceId:army[i%count]!.id,targetId:enemy[i%count]!.id})),summary:{winnerId:'p0',loserId:'p1',damage:8,tie:false}};
 return s;
}
async function geometry(page:Page) {
 return page.evaluate(()=>{
  const box=(selector:string)=>{const r=document.querySelector(selector)!.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,cx:r.x+r.width/2,width:r.width,height:r.height};};
  return {stage:box('.ab-stage'),hero:box('.ab-hero-face'),power:box('.ab-power'),hand:box('.ab-hand'),shop:box('.ab-tavern-row'),board:box('.ab-board'),scroll:document.documentElement.scrollHeight>innerHeight||document.documentElement.scrollWidth>innerWidth};
 });
}
test('composition matrix: compact rows, independent Hero anchor, Hand region and dense participants',async({page})=>{
 test.setTimeout(90000);
 await openMockAb(page,abFixture());
 for(const size of sizes){
  await page.setViewportSize(size);await page.mouse.move(2,2);
  for(const n of [1,3,5,7]){
   const s=abFixture();s.players[0]!.board=s.players[0]!.board.slice(0,n);
   await setFixture(page,s);
   await expect(page.locator('.ab-board .ab-minion')).toHaveCount(n);
   await expect.poll(async()=>page.locator('.ab-board').evaluate(el=>{const b=el.getBoundingClientRect(),r=[...el.querySelectorAll('.ab-minion')].map(n=>n.getBoundingClientRect());return Math.abs((r[0]!.left+r.at(-1)!.right)/2-(b.x+b.width/2));})).toBeLessThan(2);
   await page.waitForTimeout(300);
   const g=await geometry(page);
   expect(Math.abs(g.hero.cx-g.stage.cx)).toBeLessThan(1);
   expect(g.hand.right).toBeLessThan(g.hero.x);
   expect(g.power.x).toBeGreaterThan(g.hero.right);
   expect(g.scroll).toBe(false);
   const tokens=page.locator('.ab-board .ab-minion');
   const first=(await tokens.first().boundingBox())!,last=(await tokens.last().boundingBox())!;
   expect(Math.abs((first.x+last.x+last.width)/2-g.stage.cx)).toBeLessThan(2);
   expect(first.height/first.width).toBeLessThan(1.15);
   expect(first.width/size.width).toBeCloseTo(150/1600,2);
   await page.screenshot({path:`artifacts/ui-after/recruit-${size.width}-${n}.png`});
  }
 }
 const small=abFixture();small.players=small.players.slice(0,3);await setFixture(page,small);
 await expect(page.locator('.ab-leaderboard li')).toHaveCount(3);
});

test('four-position reorder, five-position play, cancellation, rejection and unchanged drops',async({page})=>{
 const s=abFixture();s.players[0]!.board=s.players[0]!.board.slice(0,4);s.players[0]!.hand=s.players[0]!.hand.slice(0,2);
 await openMockAb(page,s);
 await pointerHold(page,page.getByTestId('ab-minion-p0-m0'),page.getByTestId('ab-board-slot-2'));
 await expect(page.locator('.ab-board .ab-slot')).toHaveCount(4);
 await expect(page.locator('.ab-board .is-gap')).toHaveCount(1);
 expect(await actionsOf(page)).toEqual([]);
 await page.evaluate(()=>window.dispatchEvent(new PointerEvent('pointercancel',{pointerId:1})));
 await expect(page.getByTestId('ab-drag-ghost')).toBeHidden();
 await pointerHold(page,page.getByTestId('ab-minion-p0-m8'),page.getByTestId('ab-board-slot-2'));
 await expect(page.locator('.ab-board .ab-slot')).toHaveCount(5);
 const center=await page.locator('.ab-board').evaluate(el=>{const r=el.getBoundingClientRect(),slots=[...el.querySelectorAll('.ab-slot')].map(s=>s.getBoundingClientRect());return Math.abs((slots[0]!.left+slots.at(-1)!.right)/2-(r.left+r.width/2));});
 expect(center).toBeLessThan(1);
 await page.keyboard.press('Escape');
 await pointerDrag(page,page.getByTestId('ab-minion-p0-m0'),page.getByTestId('ab-board-slot-0'));
 expect(await actionsOf(page)).toEqual([]);
 await pointerDrag(page,page.getByTestId('ab-minion-p0-m8'),page.getByTestId('ab-board-slot-2'));
 await setFixture(page,{...s,error:'TEST_SERVER_REJECTION'});
 await expect(page.getByRole('alert')).toContainText('TEST_SERVER_REJECTION');
 await expect(page.getByTestId('ab-drag-ghost')).toBeHidden();
 await expect(page.locator('.ab-board .is-gap')).toHaveCount(0);
 await expect(page.locator('.ab-hand .ab-minion')).toHaveCount(2);
 expect(await actionsOf(page)).toEqual([['play','p0-m8',2]]);
});

test('Combat 1v1 and 7v7 retain Heroes and shared center at all sizes',async({page})=>{
 await openMockAb(page,abFixture());
 for(const n of [1,7]){
  await setFixture(page,combatFixture(n));
  await expect(page.locator('.ab-combat-card.is-down')).toHaveCount(0);
  await expect(page.locator('.ab-combat-hero-image')).toHaveCount(2);
  for(const size of sizes){
   await page.setViewportSize(size);await page.mouse.move(2,2);await page.waitForTimeout(100);
   const layout=await page.locator('.ab-combat').evaluate(el=>{
    const b=el.getBoundingClientRect(),foe=el.querySelector('.ab-combat-foe')!.getBoundingClientRect(),me=el.querySelector('.ab-combat-me')!.getBoundingClientRect();
    return {foe:foe.bottom,me:me.top,top:b.top,bottom:b.bottom,cx:b.x+b.width/2,hx:me.x+me.width/2};
   });
   expect(Math.abs(layout.cx-layout.hx)).toBeLessThan(1);
   expect(layout.foe).toBeLessThan(layout.me);
   await page.screenshot({path:`artifacts/ui-after/combat-${size.width}-${n}.png`});
  }
  await page.locator('.ab-combat-speed button').last().click();
  await expect(page.getByTestId('ab-combat')).toBeHidden();
 }
});

for(const speed of [1,2,100])test(`authoritative damage, stats, death, summon and Hero health at speed ${speed}`,async({page})=>{
 const s=combatFixture(1),a=s.combatBoards!.a[0]!,b=s.combatBoards!.b[0]!;
 s.combat!.events=[
  {id:1,kind:'ATTACK',sourceId:a.id,targetId:b.id},
  {id:2,kind:'DAMAGE',targetId:b.id,amount:1,remainingHealth:0},
  {id:3,kind:'STATS',targetId:a.id,attack:9},
  {id:4,kind:'DAMAGE',targetId:a.id,amount:1,remainingHealth:3},
  {id:5,kind:'DEATH',targetId:b.id},
  {id:6,kind:'SUMMON',index:0,minion:{...b,id:'born',attack:4,health:5}},
  {id:7,kind:'PLAYER_DAMAGE',targetId:'p1',amount:36,remainingHealth:0},
  {id:8,kind:'COMBAT_END'},
 ];
 await openMockAb(page,abFixture());await setFixture(page,s);
 await expect(page.getByTestId('ab-combat')).toBeVisible();
 if(speed!==1)await page.locator('.ab-combat-speed button').nth(speed===2?1:2).click();
 await expect(page.getByTestId('ab-combat')).toBeHidden({timeout:15000});
 const results=await page.evaluate(()=>import(performance.getEntriesByType('resource').find(e=>e.name.includes('/src/autoBattlerSession.ts'))!.name).then(m=>m.combatResults));
 expect(results).toHaveLength(1);
 expect(results[0].event).toBe('8');
 expect(results[0].units.sort((x:{id:string},y:{id:string})=>x.id.localeCompare(y.id))).toEqual([{id:'born',attack:'4',health:'5'},{id:a.id,attack:'9',health:'3'}]);
 expect(results[0].heroes[0].trim()).toBe('0');expect(results[0].lethal).toBe(1);
 expect(await actionsOf(page)).toEqual([]);
});

test('Hand hover lifts a full card; reduced motion avoids large movement',async({page})=>{
 await page.setViewportSize({width:1600,height:900});await openMockAb(page,abFixture());
 await page.mouse.move(2,2);await page.waitForTimeout(400);
 const card=page.locator('.ab-hand .ab-minion').last(),before=(await card.boundingBox())!;
 await card.hover();
 await expect.poll(async()=>(await card.boundingBox())!.width).toBeGreaterThan(before.width*1.25);
 const after=(await card.boundingBox())!;expect(after.y).toBeLessThan(before.y-40);
 expect(after.x+after.width).toBeLessThan(1440);
 await page.emulateMedia({reducedMotion:'reduce'});
 await expect.poll(async()=>(await card.boundingBox())!.width).toBeLessThan(before.width*1.2);
 await setFixture(page,combatFixture(7));
 await expect(page.getByTestId('ab-combat')).toBeVisible();
 expect(await page.locator('.ab-combat').evaluate(el=>el.getAnimations().length)).toBe(0);
 await page.locator('.ab-combat-speed button').last().click();
 await expect(page.getByTestId('ab-combat')).toBeHidden();
});

test('Skip keeps the settled Combat table until the authoritative Recruit phase',async({page})=>{
 await openMockAb(page,abFixture());
 await page.evaluate(()=>import(performance.getEntriesByType('resource').find(e=>e.name.includes('/src/autoBattlerSession.ts'))!.name).then(m=>m.setHoldCombat(true)));
 await setFixture(page,combatFixture(7));
 await expect(page.getByTestId('ab-combat')).toBeVisible();
 await page.locator('.ab-combat-speed button').last().click();
 await expect(page.locator('.ab-combat-wrap')).toHaveClass(/is-settled/);
 await expect(page.locator('.ab-combat-hero-image')).toHaveCount(2);
 await expect(page.locator('.ab-zone-tavern')).toHaveCSS('visibility','hidden');
 await expect(page.locator('.ab-zone-player')).toHaveCSS('visibility','hidden');
 await expect(page.getByTestId('ab-recruit-stamp')).toHaveCount(0);
 const recruit=abFixture();recruit.turn++;
 await setFixture(page,recruit);
 await expect(page.getByTestId('ab-combat')).toBeHidden();
 await expect(page.locator('.ab-zone-tavern')).toHaveCSS('visibility','visible');
 await expect(page.locator('.ab-board .ab-minion')).toHaveCount(7);
 expect(await actionsOf(page)).toEqual([]);
});
