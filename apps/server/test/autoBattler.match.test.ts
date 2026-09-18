import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {setTimeout as delay} from 'node:timers/promises';
import {Server,matchMaker} from '@colyseus/core';
import {WebSocketTransport} from '@colyseus/ws-transport';
import {Client, type Room} from '@colyseus/sdk';
import {AutoBattlerRoomState,AUTO_BATTLER_MESSAGES as MSG,AUTO_BATTLER_CLIENT_EVENTS as EV,type AutoBattlerHeroDef,type CombatEventsMessage,starterAutoBattlerCatalog} from '@kartishki/shared';
import {AutoBattlerRoom} from '../src/autoBattler/AutoBattlerRoom';
process.env.AB_TEST_MODE='1';process.env.AB_TEST_COMBAT_MS='60';
let serial=0;
async function until(check:()=>boolean,ms=6000){const end=Date.now()+ms;while(!check()){if(Date.now()>end)throw new Error('Synchronization timeout');await delay(15);}}
async function harness(count:number,options:Record<string,unknown>={}){
 const http=createServer();const server=new Server({transport:new WebSocketTransport({server:http}),greet:false});server.define('autoBattler',AutoBattlerRoom);await server.listen(0,'127.0.0.1');
 const address=http.address() as {port:number};const client=new Client(`http://127.0.0.1:${address.port}`);
 const rooms:Room<AutoBattlerRoomState>[]=[];const offers=new Map<string,AutoBattlerHeroDef[]>();const events=new Map<string,CombatEventsMessage>();const errors=new Map<string,string>();const combatCounts=new Map<string,number>();
 function attach(r:Room<AutoBattlerRoomState>){r.onMessage(EV.discoverOptions,()=>{});r.onMessage(EV.catalog,()=>{});r.onMessage(EV.heroOffers,o=>offers.set(r.sessionId,o));r.onMessage(EV.combatEvents,e=>{events.set(r.sessionId,e);const key=`${r.sessionId}:${e.turn}`;combatCounts.set(key,(combatCounts.get(key)??0)+1);});r.onMessage(EV.actionError,e=>errors.set(r.sessionId,e.code));r.send(MSG.ready);}
 for(let i=0;i<count;i++){const r=await client.joinOrCreate<AutoBattlerRoomState>('autoBattler',{displayName:`Player ${i}`,heroMs:2000,recruitMs:120000,anomaly:'',...options},AutoBattlerRoomState);rooms.push(r);attach(r);}
 await until(()=>rooms[0]!.state.players.size===count&&offers.size===count);
 if(count<8)rooms[0]!.send(MSG.startGame);
 await until(()=>rooms[0]!.state.phase==='HERO_SELECTION');
 for(const r of rooms){const mine=offers.get(r.sessionId)!;r.send(MSG.chooseHero,{heroId:(mine.find(h=>h.power.id!=='ab-power-rich')??mine[0]!).id});}
 await until(()=>rooms.every(r=>r.state.phase==='RECRUIT_PHASE'));
 const send=async(r:Room<AutoBattlerRoomState>,message:string,data:Record<string,unknown>={})=>{const revision=r.state.revision;errors.delete(r.sessionId);r.send(message,{...data,turn:r.state.turn,actionId:++serial});await until(()=>r.state.revision>revision||errors.has(r.sessionId));};
 return {server,client,rooms,events,errors,combatCounts,attach,send,host:matchMaker.getLocalRoomById(rooms[0]!.roomId) as AutoBattlerRoom};
}
for(const count of [2,3,4,8])test(`${count} players complete matches with conserved pool, ghost pairing and unique placements`,{timeout:40000},async()=>{
 const h=await harness(count);try{
  let ghostSeen=false;
  for(let round=0;round<100&&h.host.state.phase!=='GAME_OVER';round++){
   await until(()=>['RECRUIT_PHASE','GAME_OVER'].includes(h.host.state.phase));if(h.host.state.phase==='GAME_OVER')break;
   const hero=h.rooms[0]!;await until(()=>hero.state.phase==='RECRUIT_PHASE');
   const me=()=>hero.state.players.get(hero.sessionId)!;
   if(!me().eliminated){
    if(me().board.length>=3&&me().gold>=me().upgradeCost&&me().tavernTier<6)await h.send(hero,MSG.tierUp);
    for(let i=0;i<4&&me().gold>=3&&me().hand.length<10;i++){
     if(!me().tavern.offers.length)break;await h.send(hero,MSG.buy,{offerId:me().tavern.offers[0]!.id});
     for(const card of [...me().hand]){
      if(card.kind==='spell'||me().board.length<7)await h.send(hero,MSG.playCard,{cardId:card.id});
      if(me().discoverOpen)await h.send(hero,MSG.discoverPick,{optionId:me().pendingDiscover[0]!.id});
     }
    }
   }
   const turn=h.host.state.turn;
   for(const pair of h.host.state.pairing){assert.notEqual(pair.playerA,pair.playerB);ghostSeen ||= pair.ghost;}
   for(const r of h.rooms)if(!h.host.state.players.get(r.sessionId)!.eliminated){await until(()=>r.state.phase==='RECRUIT_PHASE'&&r.state.turn===turn);await h.send(r,MSG.endRecruit);}
   await until(()=>h.host.state.turn>turn||h.host.state.phase==='GAME_OVER');
   const remaining=(h.host as any).pool.stocks() as {baseId:string;remaining:number}[];
   for(const stock of remaining){const def=starterAutoBattlerCatalog.minions.find(m=>m.id===stock.baseId)!;const owned=[...h.host.state.players.values()].flatMap(p=>[...p.board,...p.hand,...p.tavern.offers,...p.pendingDiscover]).filter(m=>m.baseId===stock.baseId).reduce((n,m)=>n+m.poolCopies,0);assert.equal(stock.remaining+owned,def.poolCopies??[0,16,15,13,11,9,7][def.tavernTier]);}
  }
  assert.equal(h.host.state.phase,'GAME_OVER');assert.ok(h.host.state.winnerId);assert.deepEqual([...h.host.state.players.values()].map(p=>p.placement).sort((a,b)=>a-b),Array.from({length:count},(_,i)=>i+1));
  if(count===3)assert.ok(ghostSeen);
  assert.ok([...h.combatCounts.values()].every(n=>n===1),'A ghost must not overwrite its living source player’s own combat');
 }finally{await h.server.gracefullyShutdown(false);}
});
test('private zones, replay payload, duplicate actions, fake stats, stale turns and reconnect', {timeout:20000},async()=>{
 const h=await harness(2);try{
  const [a,b]=h.rooms as [Room<AutoBattlerRoomState>,Room<AutoBattlerRoomState>];
  const me=()=>a.state.players.get(a.sessionId)!;
  assert.equal(b.state.players.get(a.sessionId)!.hand,undefined);assert.equal(b.state.players.get(a.sessionId)!.tavern.offers,undefined);assert.equal(b.state.players.get(a.sessionId)!.board,undefined);
  assert.ok(me().tavern.offers.every(o=>o.tribes.length>0),"nested arrays reach the owner through the view filter");
  const enemy=h.host.state.players.get(b.sessionId)!;
  await h.send(a,MSG.buy,{offerId:enemy.tavern.offers[0]!.id});assert.equal(h.errors.get(a.sessionId),'SHOP_SLOT_NOT_FOUND');
  const offer=me().tavern.offers[0]!,hp=me().hero.health;await h.send(a,MSG.buy,{offerId:offer.id,health:999,gold:999,attack:999});assert.equal(me().hero.health,hp);assert.equal(me().gold,0);assert.equal(me().hand[0]!.attack,offer.attack);assert.deepEqual([...me().hand[0]!.tribes],[...h.host.state.players.get(a.sessionId)!.hand[0]!.tribes]);
  await h.send(a,MSG.playCard,{cardId:me().hand[0]!.id});
  const boardId=me().board[0]!.id;
  for(const [message,data] of [[MSG.sell,{minionId:boardId}],[MSG.moveBoard,{minionId:boardId,toIndex:0}],[MSG.playCard,{cardId:boardId}],[MSG.discoverPick,{optionId:boardId}]] as const){
   await h.send(b,message,data);assert.ok(h.errors.has(b.sessionId));assert.equal(me().board[0]!.id,boardId);
  }
  await h.send(a,MSG.buy,{offerId:me().tavern.offers[0]!.id});assert.equal(h.errors.get(a.sessionId),'NOT_ENOUGH_GOLD');
  await h.send(a,MSG.sell,{minionId:'missing'});assert.ok(h.errors.has(a.sessionId));
  await h.send(a,MSG.freeze);const frozen=me().tavern.frozen;
  a.send(MSG.freeze,{turn:a.state.turn,actionId:serial});await until(()=>h.errors.get(a.sessionId)==='REJECTED');assert.equal(me().tavern.frozen,frozen);
  const token=a.reconnectionToken,id=a.sessionId;await a.leave(false);
  const rejoined=await h.client.reconnect<AutoBattlerRoomState>(token,AutoBattlerRoomState);h.attach(rejoined);await until(()=>rejoined.state.players.get(id)?.board.length===1);
  assert.equal(rejoined.sessionId,id);assert.equal(rejoined.state.players.get(id)!.tavern.frozen,frozen);assert.equal(rejoined.state.players.get(id)!.gold,me().gold);
  await h.send(rejoined,MSG.endRecruit);await h.send(b,MSG.endRecruit);await until(()=>h.events.has(id));
  assert.equal(h.events.get(id)!.boards.a.length+h.events.get(id)!.boards.b.length,1);
  await until(()=>rejoined.state.turn===2);const cash=rejoined.state.players.get(id)!.gold;
  rejoined.send(MSG.reroll,{turn:1,actionId:++serial});await until(()=>h.errors.get(id)==='ACTION_TOO_LATE');assert.equal(rejoined.state.players.get(id)!.gold,cash);
 }finally{await h.server.gracefullyShutdown(false);}
});

test('a consented leave settles the phase the table was waiting on',{timeout:20000},async()=>{
 const h=await harness(3);try{
  const [a,b,c]=h.rooms as [Room<AutoBattlerRoomState>,Room<AutoBattlerRoomState>,Room<AutoBattlerRoomState>];
  await h.send(a,MSG.endRecruit);await h.send(b,MSG.endRecruit);
  assert.equal(h.host.state.phase,'RECRUIT_PHASE');
  await c.leave(true);
  await until(()=>h.host.state.phase!=='RECRUIT_PHASE');
  assert.ok(h.host.state.players.get(c.sessionId)!.eliminated);
  assert.equal(h.host.state.players.get(c.sessionId)!.placement,3);
 }finally{await h.server.gracefullyShutdown(false);}
});

test('more than half the table walking out cancels the match without rewards',{timeout:20000},async()=>{
 const h=await harness(4);try{
  const [a,b,c,d]=h.rooms as [Room<AutoBattlerRoomState>,Room<AutoBattlerRoomState>,Room<AutoBattlerRoomState>,Room<AutoBattlerRoomState>];
  const settled=(h.host as any).settledIds as Set<string>;
  await c.leave(true);
  await until(()=>h.host.state.players.get(c.sessionId)!.eliminated);
  await d.leave(true);
  await until(()=>h.host.state.players.get(d.sessionId)!.eliminated);
  // 2 of 4 is exactly half: the game goes on and nobody has been paid yet (walk-outs settle at the end).
  assert.equal(h.host.state.phase,'RECRUIT_PHASE');assert.equal(h.host.state.cancelled,false);assert.equal(settled.size,0);
  await b.leave(true);
  await until(()=>h.host.state.phase==='GAME_OVER');
  assert.equal(h.host.state.cancelled,true);assert.equal(h.host.state.winnerId,'');
  await until(()=>a.state.cancelled===true);
  assert.equal(settled.size,0,'a cancelled match pays no beer, cash or xp');
  assert.equal(h.host.state.players.get(a.sessionId)!.placement,0);
 }finally{await h.server.gracefullyShutdown(false);}
});
test('demon table under the wheel of fate: one spell per counter, a wedge every turn, demons on offer, hand counts in the fight payload', {timeout:30000},async()=>{
 const h=await harness(2,{anomaly:'ab-anomaly-wheel-of-fate',tribes:['demon','beast','mech','pirate','undead']});try{
  const hero=h.rooms[0]!;const me=()=>hero.state.players.get(hero.sessionId)!;
  let demonsSeen=0;
  for(let round=0;round<6;round++){
   await until(()=>h.rooms.every(r=>r.state.phase==='RECRUIT_PHASE'));
   const turn=h.host.state.turn;
   for(const p of h.host.state.players.values()){
    assert.equal([...p.tavern.offers].filter(m=>m.kind==='spell').length,1,`turn ${turn}: exactly one spell on the counter`);
    assert.ok(p.wheelBonus,`turn ${turn}: the wheel landed somewhere`);
    demonsSeen+=[...p.tavern.offers].filter(m=>m.tribes.includes('demon')).length;
   }
   // Buy and play whatever fits; a demon battlecry that devours removes offers, the counter must still have its one spell next turn.
   for(let i=0;i<3&&me().gold>=3&&me().hand.length<10&&me().tavern.offers.length;i++){await h.send(hero,MSG.buy,{offerId:me().tavern.offers[0]!.id});}
   for(const card of [...me().hand]){if(card.kind==='spell'||me().board.length<7)await h.send(hero,MSG.playCard,{cardId:card.id});if(me().discoverOpen)await h.send(hero,MSG.discoverPick,{optionId:me().pendingDiscover[0]!.id});}
   const held=me().hand.length;
   for(const r of h.rooms)await h.send(r,MSG.endRecruit);
   await until(()=>h.host.state.phase==='COMBAT_PHASE'||h.host.state.turn>turn||h.host.state.phase==='GAME_OVER');
   await until(()=>(h.events.get(hero.sessionId)?.turn??0)===turn);
   assert.equal(h.events.get(hero.sessionId)!.handCounts?.[hero.sessionId],held,'the fight payload carries the cards still in hand');
   if(h.host.state.phase==='GAME_OVER')break;
  }
  assert.ok(demonsSeen>0,'demons were offered at a demon table');
 }finally{await h.server.gracefullyShutdown(false);}
});
