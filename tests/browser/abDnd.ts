import type { Locator, Page } from '@playwright/test';
import type { AbSnapshot } from '../../apps/client/src/autoBattlerSession';

async function dispatchPointer(page: Page, type: 'pointermove' | 'pointerup', x: number, y: number) {
  await page.evaluate(({ type, x, y }) => {
    window.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, clientX: x, clientY: y, pointerType: 'mouse', view: window }));
  }, { type, x, y });
}

export async function pointerDrag(page: Page, source: Locator, target: Locator, from: 'left' | 'center' | 'right' = 'center', steps = 14) {
  const start = await source.evaluate((el, from) => {
    const rect = el.getBoundingClientRect();
    const x = from === 'left' ? rect.left + 12 : from === 'right' ? rect.left + rect.width - 12 : rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, pointerId: 1, clientX: x, clientY: y, pointerType: 'mouse', view: window }));
    return { x, y };
  }, from);
  const end = await target.evaluate(el => {
    const rect = el.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  });
  for (let i = 1; i <= steps; i++) {
    await dispatchPointer(page, 'pointermove', start.x + (end.x - start.x) * i / steps, start.y + (end.y - start.y) * i / steps);
  }
  await dispatchPointer(page, 'pointerup', end.x, end.y);
}

export async function pointerHold(page: Page, source: Locator, target: Locator, from: 'left' | 'center' | 'right' = 'center') {
  const start = await source.evaluate((el, from) => {
    const rect = el.getBoundingClientRect();
    const x = from === 'left' ? rect.left + 12 : from === 'right' ? rect.left + rect.width - 12 : rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, pointerId: 1, clientX: x, clientY: y, pointerType: 'mouse', view: window }));
    return { x, y };
  }, from);
  const end = await target.evaluate(el => {
    const rect = el.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  });
  for (let i = 1; i <= 14; i++) {
    await dispatchPointer(page, 'pointermove', start.x + (end.x - start.x) * i / 14, start.y + (end.y - start.y) * i / 14);
  }
}

export async function pointerRelease(page: Page) {
  await dispatchPointer(page, 'pointerup', 0, 0);
}

export function mockSession(state: AbSnapshot): string {
  return `let state=${JSON.stringify(state)};
const listeners=new Set();
export const actions=[];
export const combatResults=[];
let holdCombat=false;export const setHoldCombat=b=>holdCombat=b;
export const setFixture=s=>{state=s;listeners.forEach(f=>f());};
export const autoBattlerSession={
  getSnapshot:()=>state,
  subscribe:f=>{listeners.add(f);return()=>listeners.delete(f)},
  connect:async()=>{},
  leave:()=>{},
  buy:(...a)=>actions.push(['buy',...a]),
  playCard:(...a)=>actions.push(['play',...a]),
  moveBoard:(...a)=>actions.push(['move',...a]),
  sell:(...a)=>actions.push(['sell',...a]),
  heroPower:(...a)=>actions.push(['power',...a]),
  reroll:()=>actions.push(['reroll']),
  freeze:()=>actions.push(['freeze']),
  tierUp:()=>actions.push(['tier']),
  endRecruit:()=>actions.push(['end']),
  discoverPick:(...a)=>actions.push(['discover',...a]),
  clearCombat:()=>{combatResults.push({
    event:document.querySelector('.ab-combat')?.dataset.eventId,
    units:[...document.querySelectorAll('.ab-combat-face .ab-minion')].map(el=>({id:el.dataset.abId,attack:el.querySelector('.ab-minion-stats b .ab-number')?.getAttribute('data-value'),health:el.querySelector('.ab-minion-stats i .ab-number')?.getAttribute('data-value')})),
    heroes:[...document.querySelectorAll('.ab-combat-hero-vitals')].map(el=>el.textContent),
    lethal:document.querySelectorAll('.ab-combat .is-lethal').length,
  });if(!holdCombat){state={...state,phase:'RECRUIT_PHASE',combat:null,combatBoards:null};listeners.forEach(f=>f());}},
};`;
}

export async function openMockAb(page: Page, state: AbSnapshot) {
  await page.route(/\/health\/?$/, route => route.fulfill({ contentType: 'application/json', body: '{"status":"ok"}' }));
  await page.route(/\/src\/autoBattlerSession\.ts(\?.*)?$/, route => route.fulfill({ contentType: 'text/javascript', body: mockSession(state) }));
  await page.goto(process.env.CLIENT_TEST_URL ?? 'http://127.0.0.1:5173');
  await page.getByRole('button', { name: 'Играть как гость' }).click();
  await page.getByRole('button', { name: 'ПОЛЕ СРАЖЕНИЙ' }).click();
  await page.getByTestId('ab-screen').waitFor();
}

export function actionsOf(page: Page) {
  return page.evaluate(() => import(performance.getEntriesByType('resource').find(e => e.name.includes('/src/autoBattlerSession.ts'))!.name).then((m: { actions: unknown[] }) => m.actions));
}

export function setFixture(page: Page, state: AbSnapshot) {
  return page.evaluate(s => import(performance.getEntriesByType('resource').find(e => e.name.includes('/src/autoBattlerSession.ts'))!.name).then((m: { setFixture: (s: AbSnapshot) => void }) => m.setFixture(s)), state);
}
