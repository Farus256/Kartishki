import test from 'node:test';
import assert from 'node:assert/strict';
import { AutoBattlerPlayerState, starterAutoBattlerCatalog as catalog, AUTO_BATTLER } from '@kartishki/shared';
import { SharedMinionPool } from '../src/autoBattler/pool';
import { createRng } from '../src/autoBattler/rng';
import { createMinionState, createDiscoverSpell } from '../src/autoBattler/instantiate';
import { createDefaultRegistry } from '../src/autoBattler/keywords';
import { beginRecruitTurn, tryBuy, tryPlayCard, trySell, tryDiscoverPick, returnOwnedMinionsToPool, tryMoveBoard } from '../src/autoBattler/recruit';
import { resolveTriples } from '../src/autoBattler/triples';
import { resolveCombat, snapshotBoard } from '../src/autoBattler/combat';
import { planPairing } from '../src/autoBattler/pairing';
import { TriggerQueue } from '../src/autoBattler/TriggerQueue';
import type { CombatMinion } from '../src/autoBattler/combatTypes';

function setup() {
 const player = new AutoBattlerPlayerState(); player.sessionId = 'a';
 const pool = new SharedMinionPool(catalog); let serial=0;
 const d = {player,pool,rng:createRng(18),nextId:()=>`r${++serial}`,registry:createDefaultRegistry(catalog.minions),defFor:(id:string)=>catalog.minions.find(m=>m.id===id)};
 const own = (id:string) => { assert.ok(pool.take(id)); const m=createMinionState(d.defFor(id)!,d.nextId(),'a');m.poolCopies=1;return m; };
 return { ...d, d, own };
}
test('purchase is not play: full board still allows buying and Battlecry waits for play',()=>{
 const {player:p,d,own}=setup(); p.gold=10;
 p.board.push(...Array.from({length:7},()=>{ const m=own('ab-ward');m.golden=true;return m; }));
 const m=own('ab-broker');p.tavern.offers.push(m);
 assert.ok(tryBuy(d,m.id).ok); assert.equal(p.gold,7); assert.equal(p.hand[0]?.id,m.id);
 assert.equal(tryPlayCard(d,m.id).ok,false);p.board.pop();
 assert.ok(tryPlayCard(d,m.id).ok);assert.equal(p.gold,8);
});
test('Merchant receives both sale dollars even at the normal turn cap',()=>{
 const {player:p,d,own}=setup();
 p.hero.power.id='ab-power-sell-gold';p.hero.power.isPassive=true;p.gold=9;
 const minion=own('ab-whelp');p.board.push(minion);
 assert.ok(trySell(d,minion.id).ok);
 assert.equal(p.gold,11);
});
for(const boardCount of [0,1,2,3]) test(`Triple ${boardCount} board / ${3-boardCount} hand conserves copies and rewards only on play`,()=>{
 const {player:p,d,own,pool}=setup();const initial=pool.count('ab-whelp');
 const copies=Array.from({length:3},()=>own('ab-whelp')); copies[0]!.attack+=2;copies[0]!.maxHealth+=3;copies[0]!.health+=3;
 p.board.push(...copies.slice(0,boardCount));p.hand.push(...copies.slice(boardCount));
 assert.ok(resolveTriples(p,d.nextId,d.defFor));assert.equal(p.hand.length,1);
 const g=p.hand[0]!; assert.equal(g.poolCopies,3);assert.equal(g.attack,16);assert.equal(g.health,15);
 assert.ok(tryPlayCard(d,g.id).ok);assert.equal(p.hand[0]?.cardId,AUTO_BATTLER.DISCOVER_SPELL_ID);
 assert.ok(trySell(d,g.id).ok);assert.equal(pool.count('ab-whelp'),initial);
});
test('full hand defers board triple without deleting cards or rewards',()=>{
 const {player:p,d,own}=setup();p.board.push(own('ab-whelp'),own('ab-whelp'),own('ab-whelp'));
 p.hand.push(...Array.from({length:10},()=>own('ab-ward')));
 // Other ready triples may resolve; isolate this identity with generated spell cards.
 while(p.hand.length)p.hand.pop();p.hand.push(...Array.from({length:10},()=>createDiscoverSpell(d.nextId(),'a')));
 assert.equal(resolveTriples(p,d.nextId,d.defFor),false);assert.equal(p.board.length,3);assert.equal(p.hand.length,10);
 p.hand.pop();assert.ok(resolveTriples(p,d.nextId,d.defFor));assert.equal(p.hand.length,10);
});
test('Discover reserves unique choices, survives next recruit and releases unpicked copies',()=>{
 const {player:p,d,pool}=setup();const initial=pool.stocks().reduce((s,m)=>s+m.remaining,0);
 const reward=createDiscoverSpell(d.nextId(),'a');reward.tavernTier=2;p.hand.push(reward);
 assert.ok(tryPlayCard(d,reward.id).ok);assert.equal(p.pendingDiscover.length,3);
 assert.equal(pool.stocks().reduce((s,m)=>s+m.remaining,0),initial-3);
 const ids=[...p.pendingDiscover].map(m=>m.id);beginRecruitTurn(d,2);assert.deepEqual([...p.pendingDiscover].map(m=>m.id),ids);
 assert.ok(tryDiscoverPick(d,ids[0]!).ok);assert.equal(p.hand.length,1);
 returnOwnedMinionsToPool(p,pool);assert.equal(pool.stocks().reduce((s,m)=>s+m.remaining,0),initial);
});
test('generated copies do not inflate pool; over-return is diagnosed',()=>{
 const {player:p,d,pool}=setup();const before=pool.count('ab-whelp');p.board.push(createMinionState(d.defFor('ab-whelp')!,d.nextId(),'a'));
 assert.ok(trySell(d,p.board[0]!.id).ok);assert.equal(pool.count('ab-whelp'),before);assert.throws(()=>pool.returnCopy('ab-whelp'),/over-return/);
});
test('frozen offers persist and vacant slots refill',()=>{
 const {player:p,d}=setup();beginRecruitTurn(d,1);const keep=p.tavern.offers[1]!.id;
 tryBuy(d,p.tavern.offers[0]!.id);p.tavern.frozen=true;beginRecruitTurn(d,2);
 assert.equal(p.tavern.offers.length,3);assert.ok([...p.tavern.offers].some(m=>m.id===keep));assert.equal(p.tavern.frozen,false);
});
test('combat snapshots remain unchanged, simultaneous lethal retaliation resolves',()=>{
 const {player:p,d,own}=setup();const a=own('ab-whelp');p.board.push(a);const before=p.toJSON();
 const sa=snapshotBoard(p);const sb=structuredClone(sa);sb.playerId='b';sb.board[0]!.owner='b';sb.board[0]!.id='b1';
 const result=resolveCombat(sa,sb,18,d.registry,d.defFor);assert.ok(result.tie);assert.deepEqual(p.toJSON(),before);
 assert.equal(result.events.filter(e=>e.kind==='DEATH').length,2);
});
for(const count of [2,3,4,8]) test(`${count}-player pairing covers each living player once and never self-pairs`,()=>{
 const ids=Array.from({length:count},(_,i)=>`p${i}`);const pairs=planPairing(ids,new Map(),createRng(9),['dead']);
 const assigned=pairs.flatMap(p=>p.ghost?[p.playerA]:[p.playerA,p.playerB]);assert.deepEqual(assigned.sort(),ids);
 assert.ok(pairs.every(p=>p.playerA!==p.playerB));if(count%2)assert.equal(pairs.find(p=>p.ghost)?.playerB,'dead');
});
test('invalid reorder indices do not mutate board',()=>{
 const {player:p,own}=setup();p.board.push(own('ab-whelp'));for(const n of [NaN,Infinity,-1,0.5,8])assert.equal(tryMoveBoard(p,p.board[0]!.id,n).ok,false);
});
test('trigger queue is FIFO, reentrant-safe and bounded',()=>{
 const q=new TriggerQueue(8);const order:number[]=[];q.push(()=>{order.push(1);q.push(()=>order.push(3));q.drain();});q.push(()=>order.push(2));q.drain();assert.deepEqual(order,[1,2,3]);
 const loop=()=>q.push(loop);q.push(loop);q.drain();assert.ok(q.exhausted);
});

test('adjacent simultaneous Deathrattles keep their summon order and free all slots first',()=>{
 const {d}=setup();
 const m=(id:string,owner:string,attack:number,health:number,keywords:string[]=[]):CombatMinion=>({id,cardId:id,baseId:id,owner,attack,health,keywords,tavernTier:1,tribes:[],golden:false,auraAttack:0});
 for(const id of ['left','middle','right'])d.registry.registerEffect({id:`deathrattle:${id}`,deathrattle(ctx,dead,index){ctx.summon(1,index,m(`${dead.id}-child`,'b',1,100));}});
 const board=[m('left','b',0,1,['deathrattle']),m('middle','b',0,1,['taunt','deathrattle']),m('right','b',0,1,['deathrattle'])];
 const result=resolveCombat({playerId:'a',tavernTier:1,board:[m('cleaver','a',10,1,['cleave']),...Array.from({length:3},(_,i)=>m(`wall${i}`,'a',0,1))]},{playerId:'b',tavernTier:1,board},7,d.registry,d.defFor);
 const summons=result.events.filter(e=>e.kind==='SUMMON');assert.deepEqual(summons.slice(0,3).map(e=>[e.minionId,e.index]),[['left-child',0],['middle-child',1],['right-child',2]]);
 const firstSummon=result.events.findIndex(e=>e.kind==='SUMMON');assert.equal(result.events.slice(0,firstSummon).filter(e=>e.kind==='DEATH').length,3);
 assert.equal(result.events.filter(e=>e.kind==='ATTACK')[1]!.sourceId,'left-child');
});

test('a replacement at the next attack position attacks before its surviving neighbour',()=>{
 const {d}=setup();const m=(id:string,owner:string,attack:number,health:number,keywords:string[]=[]):CombatMinion=>({id,cardId:id,baseId:id,owner,attack,health,keywords,tavernTier:1,tribes:[],golden:false,auraAttack:0});
 d.registry.registerEffect({id:'deathrattle:egg',deathrattle(ctx,_dead,index){ctx.summon(1,index,m('child','b',1,1));}});
 const result=resolveCombat({playerId:'a',tavernTier:1,board:[m('striker','a',4,20),m('wall1','a',0,2),m('wall2','a',0,2)]},{playerId:'b',tavernTier:1,board:[m('egg','b',0,1,['taunt','deathrattle']),m('next','b',1,20)]},1,d.registry,d.defFor);
 assert.equal(result.events.filter(e=>e.kind==='ATTACK')[1]!.sourceId,'child');
});
