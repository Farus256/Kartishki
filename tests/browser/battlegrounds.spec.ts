import { test, expect } from '@playwright/test';
import { abFixture } from './abFixture';
import { actionsOf, openMockAb, pointerDrag, setFixture } from './abDnd';
import type { AbSnapshot } from '../../apps/client/src/autoBattlerSession';
const snapshot=(p:import('@playwright/test').Page):Promise<AbSnapshot>=>p.evaluate("import(performance.getEntriesByType('resource').find(e=>e.name.includes('/src/autoBattlerSession.ts')).name).then(m=>m.autoBattlerSession.getSnapshot())");

test('server recruit transition preserves combat deaths, result and round health', async ({ page }) => {
  const state = abFixture();
  await openMockAb(page, state);
  const a = state.players[0]!.board[0]!;
  const b = { ...a, id: 'last-enemy', owner: 'p1' };
  state.phase = 'COMBAT_PHASE';
  state.players[1]!.health = 13;
  state.combatBoards = { playerA: 'p0', playerB: 'p1', a: [a], b: [b] };
  state.combat = { turn: 8, pairIndex: 0, seed: 1, playerA: 'p0', playerB: 'p1', ghost: false,
    durationMs: 8000, initialHealth: { p0: 27, p1: 19 }, boards: { a: [a], b: [b] },
    events: [{ id: 1, kind: 'ATTACK', sourceId: a.id, targetId: b.id },
      { id: 2, kind: 'DAMAGE', targetId: b.id, amount: b.health, remainingHealth: 0 },
      { id: 3, kind: 'DEATH', targetId: b.id },
      { id: 4, kind: 'PLAYER_DAMAGE', targetId: 'p1', amount: 6, remainingHealth: 13 }],
    summary: { winnerId: 'p0', loserId: 'p1', damage: 6, tie: false } };
  await setFixture(page, state);
  await expect(page.getByTestId('ab-combat-foe').locator('.ab-combat-hero-vitals')).toHaveText('19');
  await expect(page.getByTestId('ab-combat-me').locator('.ab-combat-hero-vitals')).toHaveText('27');
  state.phase = 'RECRUIT_PHASE'; state.turn++;
  await setFixture(page, state);
  await expect(page.getByTestId('ab-combat')).toBeVisible();
  await expect(page.getByTestId('ab-leaderboard')).toContainText('19');
  await page.locator('.ab-combat-speed button').last().click();
  await expect(page.getByTestId('ab-result-stamp')).toBeVisible();
  await expect(page.getByTestId('ab-minion-last-enemy')).toHaveCount(0);
  await expect(page.getByTestId('ab-combat-foe').locator('.ab-combat-hero-vitals')).toHaveText('13');
  await page.screenshot({ path: 'artifacts/ab-complete-result.png' });
  await expect(page.getByTestId('ab-combat')).toHaveCount(0, { timeout: 10000 });
  await expect(page.getByTestId('ab-leaderboard')).toContainText('13');
});

test('hero power tooltips and roster clear the frame without blinking or overlap', async ({ page }) => {
  const state = abFixture();
  state.players[0]!.power = { id: 'ab-power-heal', goldCost: 1, targeted: false, targetDomain: 'none', isPassive: false, isExhausted: false };
  await openMockAb(page, state);
  const power = page.getByTestId('ab-hero-power');
  await expect(power).toHaveCSS('animation-name', 'none');
  await expect(power).toHaveCSS('outline-color', 'rgb(98, 223, 133)');
  await power.hover();
  await expect(page.getByRole('tooltip')).toContainText('восстановите 1 здоровья');
  state.players[0]!.power.isExhausted = true;
  await setFixture(page, state);
  await page.mouse.move(2, 2);
  await power.hover();
  await expect(page.getByRole('tooltip')).toContainText('Уже использована');
  await expect(power).toHaveCSS('opacity', '1');
  await expect(power).toBeDisabled();
  await power.evaluate((el: HTMLButtonElement) => el.click());
  expect(await actionsOf(page)).toEqual([]);
  await power.focus();
  await expect(page.getByRole('tooltip')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('tooltip')).toHaveCount(0);
  await page.mouse.move(2, 2);
  await power.hover();
  await expect(page.getByRole('tooltip')).toBeVisible();
  await page.mouse.click(2, 2);
  await expect(page.getByRole('tooltip')).toHaveCount(0);
  for (const width of [1366, 1920, 2560]) {
    await page.setViewportSize({ width, height: Math.round(width * 9 / 16) });
    const boxes = await page.evaluate(() => {
      const rect = (s: string) => document.querySelector(s)!.getBoundingClientRect();
      const stage = rect('.ab-stage'), roster = rect('.ab-leaderboard'), vitals = rect('.ab-hero-vitals'), hand = rect('.ab-hand');
      const scale = rect('.ab-screen').width / 1600;
      const before = getComputedStyle(document.querySelector('.ab-stage')!, '::before');
      return { frameLeft: stage.left + (parseFloat(before.left) - 14) * scale, rosterRight: roster.right, vitalsLeft: vitals.left, handRight: hand.right };
    });
    expect(boxes.frameLeft).toBeGreaterThan(boxes.rosterRight);
    expect(boxes.handRight).toBeLessThan(boxes.vitalsLeft);
  }
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.screenshot({ path: 'artifacts/ab-layout-fixed.png' });
});

test('combat hides future leaderboard health and settings open over the table', async ({ page }) => {
  const recruit = abFixture();
  await openMockAb(page, recruit);
  const settings = page.getByRole('button', { name: 'Настройки', exact: true });
  await settings.click();
  await expect(page.getByRole('dialog', { name: 'Настройки' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Настройки' })).toHaveCount(0);

  const combat = abFixture();
  combat.phase = 'COMBAT_PHASE';
  combat.players[1]!.health = 1;
  combat.players[1]!.eliminated = true;
  combat.players[1]!.placement = 2;
  combat.combatBoards = { playerA: 'p0', playerB: 'p1', a: [], b: [] };
  combat.combat = { turn: 8, pairIndex: 0, seed: 1, playerA: 'p0', playerB: 'p1', ghost: false,
    durationMs: 20000, boards: { a: [], b: [] }, events: [], summary: { winnerId: 'p0', loserId: 'p1', damage: 35, tie: false } };
  await setFixture(page, combat);
  const opponent = page.getByTestId('ab-leaderboard').locator('li').filter({ hasText: 'Костя' });
  await expect(opponent).toContainText('♥ 36');
  await expect(opponent).not.toContainText('#2');
});

test('keyword visuals, final ten-second fuse and real card clicks', async ({ page }) => {
  const state = abFixture();
  state.recruitSeconds = 10;
  state.players[0]!.board[0]!.keywords = ['divineShield', 'windfury', 'deathrattle', 'battlecry', 'humiliate', 'bait'];
  await openMockAb(page, state);
  const card = page.getByTestId('ab-minion-p0-m0');
  await expect(card.locator('.ab-shield-bubble')).toBeVisible();
  await expect(card.locator('.ab-wind')).toBeVisible();
  await expect(card.locator('[data-keyword=deathrattle]')).toBeVisible();
  await expect(card.locator('[data-keyword=battlecry]')).toBeVisible();
  await expect(page.getByTestId('ab-minion-p0-m27').locator('[data-keyword=taunt]')).toBeVisible();
  await expect(page.getByTestId('ab-minion-p0-m8').locator('[data-keyword=taunt]')).toBeVisible();
  await expect(page.getByTestId('ab-gold').locator('.ab-coins i')).toHaveCount(8);
  const reroll = await page.getByTestId('ab-reroll').boundingBox();
  const freeze = await page.getByTestId('ab-freeze').boundingBox();
  const tierUp = await page.getByTestId('ab-tier-up').boundingBox();
  expect(Math.abs(reroll!.width - reroll!.height)).toBeLessThan(3);
  expect(Math.abs(freeze!.width - freeze!.height)).toBeLessThan(3);
  expect(Math.abs(tierUp!.width - tierUp!.height)).toBeLessThan(3);
  await expect(page.getByTestId('ab-rope')).toBeVisible();
  await card.click();
  await expect(page.locator('.ab-selection-tools')).toBeVisible();
  const hero = await page.locator('.ab-hero-face').boundingBox();
  const power = await page.getByTestId('ab-hero-power').boundingBox();
  expect(power!.x).toBeGreaterThan(hero!.x + hero!.width);
  expect(Math.abs(power!.width - power!.height)).toBeLessThan(2);
  await page.mouse.move(2, 2);
  await page.screenshot({ path: 'artifacts/ab-keywords-rope.png' });
  state.recruitSeconds = 11;
  await setFixture(page, state);
  await expect(page.getByTestId('ab-rope')).toHaveCount(0);
});

test('tavern upgrade flourish matches the new tier', async ({ page }) => {
  const state = abFixture();
  state.players[0]!.tavernTier = 2;
  await openMockAb(page, state);
  state.players[0]!.tavernTier = 3;
  state.players[0]!.gold = 4;
  await setFixture(page, state);
  const flourish = page.getByTestId('ab-tavern-flourish');
  await expect(flourish).toHaveAttribute('data-stars', '3');
  await expect(flourish).toHaveText('★★★');
});

test('special combat actions animate without lunging and update target stats', async ({ page }) => {
  const state = abFixture();
  const a = state.players[0]!.board.slice(0, 1);
  const b = [{ ...a[0]!, id: 'special-target', owner: 'p1', attack: 12, health: 20 }];
  state.phase = 'COMBAT_PHASE';
  state.combatBoards = { playerA: 'p0', playerB: 'p1', a, b };
  state.combat = { turn: 8, pairIndex: 0, seed: 1, playerA: 'p0', playerB: 'p1', ghost: false,
    durationMs: 20000, boards: { a, b }, events: [
      { id: 1, kind: 'HUMILIATE', sourceId: a[0]!.id, targetId: b[0]!.id, attack: 1, remainingHealth: 20 },
      { id: 2, kind: 'BAIT', sourceId: a[0]!.id, targetId: b[0]!.id, attack: 1, remainingHealth: 1 },
    ], summary: { winnerId: '', loserId: '', damage: 0, tie: true } };
  await openMockAb(page, state);
  await expect(page.locator('.is-shouting')).toBeVisible();
  await expect(page.locator('.is-startled')).toBeVisible();
  await expect(page.locator('.is-attacking')).toHaveCount(0);
  await page.locator('.ab-combat-power-anchor .ab-power').first().hover();
  await expect(page.getByRole('tooltip')).toContainText('Доступна во время найма');
  await expect(page.locator('.is-baiting')).toBeVisible();
  const target = page.getByTestId('ab-minion-special-target');
  await expect(target.locator('.ab-minion-stats b .ab-number')).toHaveText('1');
  await expect(target.locator('.ab-minion-stats i .ab-number')).toHaveText('1');
});

test('tavern mode opens the 16:9 table and joins autoBattler', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => sessionStorage.setItem('kartishki-ab-table', `pw-solo-${Math.random()}`));
  await page.goto(process.env.CLIENT_TEST_URL ?? 'http://127.0.0.1:5173');
  await page.getByRole('button', { name: 'Играть как гость' }).click();
  await page.getByRole('button', { name: 'ПОЛЕ СРАЖЕНИЙ' }).click();
  await expect(page.getByTestId('ab-screen')).toBeVisible();
  await expect(page.getByTestId('ab-leaderboard')).toBeVisible();
  await expect(page.getByTestId('ab-zone-tavern')).toBeAttached();
  await expect(page.getByTestId('ab-zone-player')).toBeAttached();
  await expect(page.getByTestId('ab-timer')).toBeVisible();
  await expect(page.getByTestId('ab-lobby')).toBeVisible();
  await expect.poll(async () => (await snapshot(page)).status).toBe('online');
  await expect.poll(async () => (await snapshot(page)).players.length).toBe(1);
  await expect(page.getByRole('button', { name: 'Начать игру' })).toBeDisabled();
  await expect(page.getByTestId('ab-screen')).toHaveCSS('position', 'absolute');
  expect(errors).toEqual([]);
});

test('scaled drag targets submit one reorder, sale or Hero Power intent',async({page})=>{
 const fixture=abFixture();fixture.players[0]!.power={id:'ab-power-buff-board',goldCost:1,targeted:true,targetDomain:'board',isPassive:false,isExhausted:false};
 await page.route(/\/src\/autoBattlerSession\.ts(\?.*)?$/,route=>route.fulfill({contentType:'text/javascript',body:`const state=${JSON.stringify(fixture)};export const actions=[];export const autoBattlerSession={getSnapshot:()=>state,subscribe:()=>()=>{},connect:async()=>{},moveBoard:(...a)=>actions.push(['move',...a]),sell:(...a)=>actions.push(['sell',...a]),heroPower:(...a)=>actions.push(['power',...a]),leave:()=>{}};`}));
 await page.setViewportSize({width:1366,height:768});await page.goto('http://127.0.0.1:5173');await page.getByRole('button',{name:'Играть как гость'}).click();await page.getByRole('button',{name:'ПОЛЕ СРАЖЕНИЙ'}).click();
 const power=page.getByTestId('ab-hero-power');await pointerDrag(page,power,page.getByTestId('ab-minion-p0-m0'));
 await pointerDrag(page,page.getByTestId('ab-minion-p0-m0'),page.getByTestId('ab-board-slot-3'));
 await pointerDrag(page,page.getByTestId('ab-minion-p0-m1'),page.getByTestId('ab-sell-zone'));
 const actions=await page.evaluate(()=>import(performance.getEntriesByType('resource').find(e=>e.name.includes('/src/autoBattlerSession.ts'))!.name).then((m:any)=>m.actions));
 expect(actions).toEqual([['power','p0-m0'],['move','p0-m0',3],['sell','p0-m1']]);
 await page.getByTestId('ab-hero-power').evaluate((el: HTMLButtonElement) => el.click());
 await expect(page.locator('.ab-board .is-selected')).toHaveCount(7);await page.keyboard.press('Escape');await expect(page.locator('.ab-board .is-selected')).toHaveCount(0);
});

test('full board, full hand, eight players, freeze and Discover fit four 16:9 viewports',async({page})=>{
 const fixture=abFixture();
 await page.route(/\/src\/autoBattlerSession\.ts(\?.*)?$/,route=>route.fulfill({contentType:'text/javascript',body:`let state=${JSON.stringify(fixture)};const listeners=new Set();export const setFixture=s=>{state=s;listeners.forEach(f=>f());};export const autoBattlerSession={getSnapshot:()=>state,subscribe:f=>{listeners.add(f);return()=>listeners.delete(f)},connect:async()=>{},leave:()=>{},buy:()=>{},playCard:()=>{},heroPower:()=>{},endRecruit:()=>{},clearCombat:()=>{}};`}));
 await page.goto('http://127.0.0.1:5173');await page.getByRole('button',{name:'Играть как гость'}).click();await page.getByRole('button',{name:'ПОЛЕ СРАЖЕНИЙ'}).click();
 await expect(page.locator('.ab-board .ab-minion')).toHaveCount(7);await expect(page.locator('.ab-hand .ab-minion')).toHaveCount(10);
 for(const viewport of [{width:1920,height:1080},{width:1600,height:900},{width:1366,height:768},{width:2560,height:1440}]){
  await page.setViewportSize(viewport);
  await expect.poll(async()=>Math.abs((await page.getByTestId('ab-screen').boundingBox())!.width-Math.min(viewport.width,viewport.height*16/9))).toBeLessThan(1);
  for(const selector of ['.ab-leaderboard','.ab-tavern','.ab-hero-dock','.ab-board','.ab-hand']){
   const b=(await page.locator(selector).boundingBox())!;expect(b.x,selector).toBeGreaterThanOrEqual(0);expect(b.y,selector).toBeGreaterThanOrEqual(0);expect(b.x+b.width,selector).toBeLessThanOrEqual(viewport.width+1);expect(b.y+b.height,selector).toBeLessThanOrEqual(viewport.height+1);
  }
  const scroll=await page.evaluate(()=>({x:document.documentElement.scrollWidth>innerWidth,y:document.documentElement.scrollHeight>innerHeight}));expect(scroll).toEqual({x:false,y:false});
  await page.screenshot({path:`artifacts/ab-recruit-${viewport.width}.png`});
 }
 const boardCard=page.locator('.ab-board .ab-minion').first();
 await boardCard.hover();
 const dossier=page.getByTestId('ab-dossier');
 await expect(dossier).toBeVisible();
 const [cardBox,tipBox]=await Promise.all([boardCard.boundingBox(),dossier.boundingBox()]);
 expect(tipBox!.x).toBeGreaterThan(cardBox!.x+cardBox!.width-24);
 await page.screenshot({path:'artifacts/ab-tooltip.png'});
 fixture.players[0]!.tavern.frozen=true;fixture.players[0]!.pendingDiscover=fixture.players[0]!.hand.slice(0,3);fixture.players[0]!.discoverOpen=true;
 await page.evaluate(s=>import(performance.getEntriesByType('resource').find(e=>e.name.includes('/src/autoBattlerSession.ts'))!.name).then((m:any)=>m.setFixture(s)),fixture);
 await expect(page.getByTestId('ab-discover')).toBeVisible();await page.screenshot({path:'artifacts/ab-discover.png'});
 const choices=page.locator('.ab-discover-row button');await expect(choices.first()).toBeFocused();
 await page.keyboard.press('Shift+Tab');await expect(choices.last()).toBeFocused();await page.keyboard.press('Tab');await expect(choices.first()).toBeFocused();
 fixture.players[0]!.pendingDiscover=[];fixture.players[0]!.discoverOpen=false;fixture.phase='COMBAT_PHASE';
 const army=fixture.players[0]!.board;const enemy=army.map(m=>({...m,id:`enemy-${m.id}`,owner:'p1'}));
 fixture.combatBoards={playerA:'p0',playerB:'p1',a:army,b:enemy};
 fixture.combat={turn:8,pairIndex:0,seed:1,playerA:'p0',playerB:'p1',ghost:false,durationMs:25000,boards:{a:army,b:enemy},events:Array.from({length:40},(_,i)=>({id:i+1,kind:'ATTACK' as const,sourceId:army[i%7]!.id,targetId:enemy[i%7]!.id})),summary:{winnerId:'p0',loserId:'p1',damage:8,tie:false}};
 await page.evaluate(s=>import(performance.getEntriesByType('resource').find(e=>e.name.includes('/src/autoBattlerSession.ts'))!.name).then((m:any)=>m.setFixture(s)),fixture);
 await expect(page.getByTestId('ab-combat')).toBeVisible();
 await expect(page.locator('.ab-zone-tavern')).toHaveCSS('visibility','hidden');
 await expect(page.locator('.ab-combat-card')).toHaveCount(14);
 await expect(page.locator('.ab-combat-card.is-down')).toHaveCount(0,{timeout:8000});
 await expect(page.locator('.ab-combat-face .ab-minion').first()).toBeVisible();
 await page.waitForTimeout(400);
 await page.locator('.ab-combat-face .ab-minion').first().hover();
 await expect(page.getByTestId('ab-dossier')).toBeVisible();
 for(const viewport of [{width:1920,height:1080},{width:1600,height:900},{width:1366,height:768},{width:2560,height:1440}]){
  await page.setViewportSize(viewport);await expect.poll(async()=>Math.abs((await page.getByTestId('ab-screen').boundingBox())!.width-Math.min(viewport.width,viewport.height*16/9))).toBeLessThan(1);
  await page.screenshot({path:`artifacts/ab-combat-${viewport.width}.png`});
 }
});

test('two browsers recruit by dragging, reconnect, play combat and finish a match',async({browser})=>{
 // Skip shortens presentation only; the server still runs its full phase timers.
 test.setTimeout(360000);
 const table=`pw-live-${Date.now()}`;
 const a=await browser.newPage({viewport:{width:1920,height:1080}}),b=await browser.newPage({viewport:{width:1366,height:768}});const errors:string[]=[];
 for(const p of [a,b]){p.on('pageerror',e=>errors.push(e.message));await p.addInitScript(code=>sessionStorage.setItem('kartishki-ab-table',code),table);await p.goto('http://127.0.0.1:5173');await p.getByRole('button',{name:'Играть как гость'}).click();await p.getByRole('button',{name:'ПОЛЕ СРАЖЕНИЙ'}).click();}
 await expect.poll(async()=>{const sa=await snapshot(a),sb=await snapshot(b);return sa.status==='online'&&sb.status==='online'&&sa.phase==='LOBBY'&&sa.players.some(p=>p.sessionId===sb.sessionId);},{timeout:15000}).toBeTruthy();
 await a.getByRole('button',{name:'Начать игру'}).click();
 await expect(a.getByTestId('ab-hero-select')).toBeVisible();
 await expect(b.getByTestId('ab-hero-select')).toBeVisible();
 for(const p of[a,b])await p.locator('.hero-offers > button').first().click();
 await expect.poll(async()=>(await snapshot(a)).phase).toBe('RECRUIT_PHASE');
 await pointerDrag(a,a.locator('.ab-tavern-row .ab-minion').first(),a.getByTestId('ab-hero'));
 await expect(a.locator('.ab-hand .ab-minion')).toHaveCount(1);
 const id=(await snapshot(a)).sessionId;await a.reload();await expect(a.getByTestId('ab-screen')).toBeVisible();await expect(a.locator('.ab-hand .ab-minion')).toHaveCount(1);expect((await snapshot(a)).sessionId).toBe(id);
 await pointerDrag(a,a.locator('.ab-hand .ab-minion').first(),a.getByTestId('ab-board-slot-0'));await expect(a.locator('.ab-board .ab-minion')).toHaveCount(1);
 let captured=false;
 for(let n=0;n<35;n++){
  const s=await snapshot(a);if(s.phase==='GAME_OVER')break;
  await expect.poll(async()=>(await snapshot(a)).phase,{timeout:35000}).toBe('RECRUIT_PHASE');
  const me=(await snapshot(a)).players.find(p=>p.sessionId===id)!;
  if(me.gold>=3&&me.board.length<4){
   await pointerDrag(a,a.locator('.ab-tavern-row .ab-minion').first(),a.getByTestId('ab-hero'));
   await expect.poll(async()=>(await snapshot(a)).players.find(p=>p.sessionId===id)!.hand.length).toBeGreaterThan(0);
   for(let k=0;k<5;k++){
    const now=(await snapshot(a)).players.find(p=>p.sessionId===id)!;
    if(!now.hand.length||now.board.length>=7)break;
    await pointerDrag(a,a.locator('.ab-hand .ab-minion').first(),a.getByTestId('ab-board-slot-0'));
    await a.waitForTimeout(120);
    if(await a.getByTestId('ab-discover').isVisible())await a.locator('.ab-discover-row .ab-minion').first().evaluate((el: HTMLElement)=>el.click());
   }
  }
  await a.getByRole('button',{name:'В бой',exact:true}).click();await b.getByRole('button',{name:'В бой',exact:true}).click();
  await expect(a.getByTestId('ab-combat')).toBeVisible();
  if(!captured){await a.waitForTimeout(350);await a.screenshot({path:'artifacts/ab-live-combat.png'});captured=true;}
  await a.getByRole('button',{name:'Пропуск'}).click();
  await expect.poll(async()=>{const next=await snapshot(a);return next.phase==='GAME_OVER'||next.turn>s.turn;},{timeout:60000}).toBeTruthy();
 }
 await expect.poll(async()=>(await snapshot(a)).phase).toBe('GAME_OVER');await expect(a.getByTestId('ab-gameover')).toBeVisible({timeout:10000});await a.screenshot({path:'artifacts/ab-gameover.png'});
 expect(errors).toEqual([]);await a.close();await b.close();
});

test('combat result stays centered until recruit arrives, then returns to tavern', async ({ page }) => {
 const fixture=abFixture();fixture.phase='COMBAT_PHASE';
 fixture.players=fixture.players.slice(0,2);
 fixture.combatBoards={playerA:'p0',playerB:'p1',a:[],b:[]};
 fixture.combat={turn:8,pairIndex:0,seed:1,playerA:'p0',playerB:'p1',ghost:false,durationMs:11000,boards:{a:[],b:[]},events:[{id:1,kind:'PLAYER_DAMAGE',targetId:'p1',amount:6,remainingHealth:30}],summary:{winnerId:'p0',loserId:'p1',damage:6,tie:false}};
 await page.route(/\/src\/autoBattlerSession\.ts(\?.*)?$/,route=>route.fulfill({contentType:'text/javascript',body:`let state=${JSON.stringify(fixture)};const listeners=new Set();export const setFixture=s=>{state=s;listeners.forEach(f=>f());};export const autoBattlerSession={getSnapshot:()=>state,subscribe:f=>{listeners.add(f);return()=>listeners.delete(f)},connect:async()=>{},leave:()=>{},clearCombat:()=>setFixture({...state,combat:null,combatBoards:null})};`}));
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5173');await page.getByRole('button',{name:'Играть как гость'}).click();await page.getByRole('button',{name:'ПОЛЕ СРАЖЕНИЙ'}).click();
 await expect(page.getByTestId('ab-hero-tally')).toBeVisible();
 await expect.poll(async()=>page.getByTestId('ab-combat-me').evaluate(el=>getComputedStyle(el).translate),{intervals:[25],timeout:5000}).not.toBe('none');
 await expect(page.getByTestId('ab-result-stamp')).toBeVisible({timeout:10000});
 await page.waitForTimeout(750);
 const box=(await page.getByTestId('ab-combat').boundingBox())!,stamp=(await page.getByTestId('ab-result-stamp').boundingBox())!;
 expect(Math.abs(stamp.y+stamp.height/2-box.y-box.height/2)).toBeLessThan(5);
 await expect(page.locator('.ab-combat-wait')).toHaveCount(0);
 await page.getByRole('button',{name:'Пропуск'}).click();
 await expect(page.getByTestId('ab-recruit-stamp')).toHaveCount(0);
 fixture.phase='RECRUIT_PHASE';fixture.turn++;fixture.combat=null;fixture.combatBoards=null;
 await page.evaluate(s=>import(performance.getEntriesByType('resource').find(e=>e.name.includes('/src/autoBattlerSession.ts'))!.name).then((m:any)=>m.setFixture(s)),fixture);
 await expect(page.getByTestId('ab-combat')).toHaveCount(0,{timeout:5000});
 await expect(page.getByTestId('ab-tavern')).toBeVisible();
 expect(errors).toEqual([]);
});

test('waiting copy only appears when another pair is still fighting', async ({ page }) => {
 const one=abFixture();one.phase='COMBAT_PHASE';one.pairing=[{playerA:'p0',playerB:'p1',ghost:false}];
 one.combatBoards={playerA:'p0',playerB:'p1',a:[],b:[]};
 one.combat={turn:8,pairIndex:0,seed:1,playerA:'p0',playerB:'p1',ghost:false,durationMs:8000,boards:{a:[],b:[]},events:[{id:1,kind:'COMBAT_END'}],summary:{winnerId:'p0',loserId:'p1',damage:0,tie:false}};
 await openMockAb(page,one);
 await page.locator('.ab-combat-speed button').last().click();
 await expect(page.locator('.ab-combat-wait')).toHaveCount(0);
 await expect(page.getByTestId('ab-combat')).toBeHidden();
 const many={...one,pairing:[{playerA:'p0',playerB:'p1',ghost:false},{playerA:'p2',playerB:'p3',ghost:false}]};
 await page.evaluate(()=>import(performance.getEntriesByType('resource').find(e=>e.name.includes('/src/autoBattlerSession.ts'))!.name).then((m:{setHoldCombat:(b:boolean)=>void})=>m.setHoldCombat(true)));
 await setFixture(page,many);
 await expect(page.getByTestId('ab-combat')).toBeVisible();
 await page.locator('.ab-combat-speed button').last().click();
 await expect(page.locator('.ab-combat-wait')).toBeVisible();
});

test('confirmed minion and gold changes animate gains and losses', async ({ page }) => {
 const fixture=abFixture();
 await page.route(/\/src\/autoBattlerSession\.ts(\?.*)?$/,route=>route.fulfill({contentType:'text/javascript',body:`let state=${JSON.stringify(fixture)};const listeners=new Set();export const setFixture=s=>{state=s;listeners.forEach(f=>f());};export const autoBattlerSession={getSnapshot:()=>state,subscribe:f=>{listeners.add(f);return()=>listeners.delete(f)},connect:async()=>{},leave:()=>{}};`}));
 await page.goto('http://127.0.0.1:5173');await page.getByRole('button',{name:'Играть как гость'}).click();await page.getByRole('button',{name:'ПОЛЕ СРАЖЕНИЙ'}).click();
 await expect(page.getByTestId('ab-tavern')).toBeVisible();
 fixture.players[0]!.gold-=3;fixture.players[0]!.board[0]!.attack+=2;fixture.players[0]!.board[0]!.health-=1;
 await page.evaluate(s=>import(performance.getEntriesByType('resource').find(e=>e.name.includes('/src/autoBattlerSession.ts'))!.name).then((m:any)=>m.setFixture(s)),fixture);
 await expect(page.getByTestId('ab-gold').locator('.ab-number-delta')).toHaveText('−3');
 await expect(page.getByTestId('ab-minion-p0-m0').locator('.ab-number-delta.is-gain')).toHaveText('+2');
 await expect(page.getByTestId('ab-minion-p0-m0').locator('.ab-number-delta.is-loss')).toHaveText('−1');
 await expect(page.getByTestId('ab-minion-p0-m0').locator('.ab-minion-stats b')).toHaveClass(/is-buffed/);
 await expect(page.getByTestId('ab-minion-p0-m0').locator('.ab-minion-stats i')).toHaveClass(/is-nerfed/);
 await expect(page.locator('.ab-minion-wrap[data-buff=ability]').filter({ has: page.getByTestId('ab-minion-p0-m0') })).toBeVisible();
});

test('custom cursor taps empty table felt', async ({ page }) => {
 await openMockAb(page, abFixture());
 await expect(page.locator('.game-cursor')).toBeAttached();
 const point = await page.evaluate(() => {
  const stage = document.querySelector('.ab-stage')!.getBoundingClientRect();
  const blocked = [...document.querySelectorAll('button,.ab-minion,.ab-power')].map(el => el.getBoundingClientRect());
  for (let y = stage.top + 16; y < stage.bottom - 16; y += 20) {
   for (let x = stage.left + 16; x < stage.right - 16; x += 20) {
    if (!blocked.some(r => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom)) return { x, y };
   }
  }
  return null;
 });
 expect(point).toBeTruthy();
 await page.mouse.click(point!.x, point!.y);
 await expect(page.locator('.game-tap-burst i').first()).toBeVisible();
});

for(const reduced of [false,true])test(`varied attacks, damage cloud and stat silhouettes; reduced=${reduced}`, async ({page})=>{
 const fixture=abFixture();fixture.phase='COMBAT_PHASE';
 const a={...fixture.players[0]!.board[0]!,health:50},b={...a,id:'foe',owner:'p1'};
 fixture.combatBoards={playerA:'p0',playerB:'p1',a:[a],b:[b]};
 fixture.combat={turn:8,pairIndex:0,seed:1,playerA:'p0',playerB:'p1',ghost:false,durationMs:25000,boards:{a:[a],b:[b]},events:[
 {id:1,kind:'ATTACK',sourceId:a.id,targetId:b.id},{id:2,kind:'DAMAGE',targetId:b.id,amount:2,remainingHealth:48},
 {id:3,kind:'ATTACK',sourceId:a.id,targetId:b.id},{id:4,kind:'DAMAGE',targetId:b.id,amount:6,remainingHealth:42},
 {id:5,kind:'ATTACK',sourceId:a.id,targetId:b.id},{id:6,kind:'DAMAGE',targetId:b.id,amount:18,remainingHealth:24}],summary:{winnerId:'p0',loserId:'p1',damage:0,tie:false}};
 await page.route(/\/src\/autoBattlerSession\.ts(\?.*)?$/,route=>route.fulfill({contentType:'text/javascript',body:`let state=${JSON.stringify(fixture)};const listeners=new Set();export const setFixture=s=>{state=s;listeners.forEach(f=>f());};export const autoBattlerSession={getSnapshot:()=>state,subscribe:f=>{listeners.add(f);return()=>listeners.delete(f)},connect:async()=>{},leave:()=>{},clearCombat:()=>setFixture({...state,combat:null,combatBoards:null})};`}));
 await page.emulateMedia({reducedMotion:reduced?'reduce':'no-preference'});
 await page.setViewportSize({width:1600,height:900});
 await page.goto('http://127.0.0.1:5173');await page.getByRole('button',{name:'Играть как гость'}).click();await page.getByRole('button',{name:'ПОЛЕ СРАЖЕНИЙ'}).click();
 const card=page.locator('.ab-combat-card').filter({has:page.getByTestId(`ab-minion-${a.id}`)});
 await expect(card.locator('.is-sword')).toBeVisible();await expect(card.locator('.is-heart')).toBeVisible();
 await expect(card.locator('.ab-minion-stats b')).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
 if(!reduced){
  for(const [style,tier] of [['hook','1'],['thrust','2'],['slam','4']]){
   await expect(card).toHaveAttribute('data-attack-style',style!);
   await expect(page.locator('.ab-combat')).toHaveAttribute('data-impact-tier',tier!);
  }
  await expect(page.locator('.ab-swing-trail')).toHaveCount(0);
  await expect(page.locator('.ab-combat-pop')).not.toHaveCount(0);
  await page.screenshot({path:'artifacts/ab-impact-heavy.png'});
 }else{
  await expect(page.getByTestId('ab-result-stamp')).toBeVisible();
  await expect(page.locator('.ab-swing-trail')).toHaveCount(0);
  expect(await page.locator('.ab-combat').evaluate(el=>el.getAnimations().length)).toBe(0);
 }
});
