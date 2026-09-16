import test from 'node:test';
import assert from 'node:assert/strict';
import { COIN_CARD_ID, MatchState, PlayerState, starterCards, type CardDefinition, type GameEvent } from '@kartishki/shared';
import { Battle } from '../src/Battle';

function fixture(cards: CardDefinition[] = [structuredClone(starterCards[0])]) {
  const state = new MatchState(); state.players.set('a',new PlayerState()); state.players.set('b',new PlayerState());
  // 'a' goes first: 3 cards plus the turn draw; 'b' holds 4 cards and The Coin. Tests top the mana up themselves.
  state.first='a'; state.status='mulligan';
  const events: GameEvent[] = []; const battle = new Battle(state,cards,event=>events.push(event)); battle.start(); battle.finishMulligan();
  state.players.get('a')!.mana=10;
  const action = () => ({ expectedRevision: state.revision });
  const play = (owner='a', cardId=cards[0].id) => { state.activePlayer=owner; state.phase='main'; state.players.get(owner)!.mana=10; battle.hands.set(owner,[{instanceId:'test',cardId}]); assert.equal(battle.play(owner,{...action(),instanceId:'test'}),true); return [...state.minions.values()].at(-1)!; };
  const attack = (attackerId: string,targetId: string) => battle.attack(state.activePlayer,{...action(),attackerId,targetId});
  return {state,battle,events,action,play,attack};
}

test('hands stay private and draw events reveal no identities',()=>{
  const {state,battle,events}=fixture(); assert.equal(battle.hands.get('a')!.length,4); assert.equal(battle.hands.get('b')!.length,5);
  assert.equal(state.players.get('a')!.deckCount,26); assert.equal(state.players.get('b')!.deckCount,26); assert.equal(state.players.get('b')!.handCount,5);
  for (const [id,player] of state.players) assert.equal(player.deckCount + player.handCount, id==='b' ? 31 : 30);
  assert.equal(JSON.stringify(state.toJSON()).includes('instanceId'),false);
  assert.ok(events.filter(e=>e.kind==='draw').every(e=>e.cardId===''));
  assert.deepEqual(events.filter(e=>e.kind==='turn').map(e=>e.source),['a']);
});
test('the coin goes to the second player and buys one mana this turn',()=>{
  const {state,battle,action,events}=fixture();
  assert.equal(battle.hands.get('a')!.some(c=>c.cardId===COIN_CARD_ID),false);
  const coin=battle.hands.get('b')!.find(c=>c.cardId===COIN_CARD_ID)!; assert.ok(coin);
  assert.equal(battle.play('b',{...action(),instanceId:coin.instanceId}),false);
  state.activePlayer='b'; const b=state.players.get('b')!; b.maxMana=b.mana=1;
  assert.equal(battle.play('b',{...action(),instanceId:coin.instanceId}),true);
  assert.equal(b.mana,2); assert.equal(b.maxMana,1); assert.equal(b.handCount,4); assert.equal(state.minions.size,0);
  assert.equal(events.at(-1)!.kind,'coin');
  b.mana=10; assert.equal(battle.play('b',{...action(),instanceId:coin.instanceId}),false);
});
test('mulligan swaps the chosen cards once and keeps the deck whole',()=>{
  const cards=[structuredClone(starterCards[0]),structuredClone(starterCards[1])];
  const state=new MatchState(); state.players.set('a',new PlayerState()); state.players.set('b',new PlayerState());
  state.first='a'; state.status='mulligan'; const battle=new Battle(state,cards); battle.start();
  assert.equal(battle.hands.get('a')!.length,3); assert.equal(battle.hands.get('b')!.length,4);
  const before=battle.hands.get('a')!.map(c=>c.instanceId); const revision=state.revision;
  assert.equal(battle.mulligan('a',{replace:[...before,'forged',before[0]]}),true);
  const after=battle.hands.get('a')!; assert.equal(after.length,3); assert.ok(after.every(c=>!before.includes(c.instanceId)));
  assert.equal(state.players.get('a')!.deckCount,27); assert.equal(state.players.get('a')!.mulliganDone,true); assert.equal(state.revision,revision+1);
  assert.equal(battle.mulligan('a',{replace:[]}),false);
  assert.equal(battle.mulligan('b',{replace:[]}),true); assert.equal(battle.hands.get('b')!.length,4);
  battle.finishMulligan(); assert.equal(state.status,'active'); assert.equal(state.activePlayer,'a'); assert.equal(state.turn,1);
  assert.equal(state.players.get('a')!.mana,1); assert.equal(state.players.get('a')!.maxMana,1); assert.equal(battle.hands.get('a')!.length,4);
  assert.equal(battle.hands.get('b')!.at(-1)!.cardId,COIN_CARD_ID);
  assert.equal(battle.mulligan('a',{replace:[]}),false);
});
test('charge attacks the turn it is played',()=>{
  const runner={...structuredClone(starterCards[0]),id:'runner',properties:['charge' as const]};
  const {state,play,attack}=fixture([structuredClone(starterCards[0]),runner]); const m=play('a','runner');
  assert.equal(m.ready,true); assert.equal(attack(m.id,'b'),true); assert.equal(state.players.get('b')!.health,30-runner.attack);
});
test('play rejects forged hands, wrong turn and insufficient mana without mutation',()=>{
  const {state,battle,action}=fixture(); const id=battle.hands.get('a')![0].instanceId;
  const before=state.toJSON(); assert.equal(battle.play('a',{...action(),instanceId:'forged'}),false); assert.deepEqual(state.toJSON(),before);
  state.players.get('a')!.mana=0; assert.equal(battle.play('a',{...action(),instanceId:id}),false);
  state.players.get('a')!.mana=10; assert.equal(battle.play('b',{...action(),instanceId:id}),false);
  const revision=state.revision; assert.equal(battle.play('a',{...action(),instanceId:id}),true); assert.equal(state.players.get('a')!.mana,9);
  assert.equal(battle.play('a',{expectedRevision:revision,instanceId:id}),false);
});
test('summoning sickness, one attack per turn, enemy targets and reciprocal damage',()=>{
  const {state,play,attack}=fixture(); const a=play(), b=play('b'); state.activePlayer='a';
  assert.equal(attack(a.id,b.id),false); a.ready=true;
  assert.equal(attack(a.id,'a'),false); assert.equal(attack(a.id,a.id),false); assert.equal(attack(a.id,'missing'),false);
  assert.equal(attack(a.id,b.id),true); assert.equal(state.minions.size,0);
  const c=play(); c.ready=true; assert.equal(attack(c.id,'b'),true); assert.equal(state.players.get('b')!.health,28);
  assert.equal(attack(c.id,'b'),false);
});
test('shield absorbs one positive hit, zero damage leaves it intact',()=>{
  const card=structuredClone(starterCards[0]); card.properties=['contraceptive']; card.health=5;
  const zero={...structuredClone(card),id:'zero',attack:0};
  const {state,play,attack}=fixture([card,zero]); const a=play(), b=play('b','zero'); state.activePlayer='a'; a.ready=true;
  assert.equal(attack(a.id,b.id),true); assert.equal(b.health,5); assert.equal(b.shield,false); assert.equal(a.shield,true);
  a.ready=true; assert.equal(attack(a.id,b.id),true); assert.equal(b.health,3);
});
test('offense sets current and max HP to 1, humiliation sets attack to 1 without consuming shield',()=>{
  const card=structuredClone(starterCards[0]); card.properties=['contraceptive','offense','humiliation'];
  const {play}=fixture([card]); const m=play(); assert.equal(m.health,1); assert.equal(m.maxHealth,1); assert.equal(m.attack,1); assert.equal(m.shield,true);
});
test('battlecry and deathrattle resolve once; simultaneous lethal heroes draw',()=>{
  const card=structuredClone(starterCards[0]); card.abilities=[{trigger:'battlecry',effectId:'damage',params:{target:'enemyHero',amount:2}},{trigger:'deathrattle',effectId:'damage',params:{target:'enemyHero',amount:1}}];
  const {state,play,attack,events}=fixture([card]); const a=play(),b=play('b'); assert.equal(state.players.get('a')!.health,28); assert.equal(state.players.get('b')!.health,28);
  state.players.get('a')!.health=state.players.get('b')!.health=1; state.activePlayer='a'; a.ready=true;
  assert.equal(attack(a.id,b.id),true); assert.equal(state.status,'finished'); assert.equal(state.winner,''); assert.equal(events.filter(e=>e.kind==='death').length,2);
  assert.equal(attack(a.id,'b'),false);
});
test('enrage is active while wounded and does not stack on later actions',()=>{
  const card=structuredClone(starterCards[5]); const healer=structuredClone(starterCards[0]); healer.id='healer'; healer.abilities=[{trigger:'battlecry',effectId:'heal',params:{target:'allEnemies',amount:20}}];
  const {state,play,attack,battle,action}=fixture([card,healer]); const a=play(),b=play('b'); state.activePlayer='a'; a.ready=true;
  assert.equal(attack(a.id,b.id),true); assert.equal(a.attack,4); assert.equal(b.attack,4);
  assert.equal(battle.advance('a',action()),true); assert.equal(a.attack,4);
  play('b','healer'); assert.equal(a.health,a.maxHealth); assert.equal(a.attack,2);
});
test('status abilities bypass shield and offense cannot be healed above one',()=>{
  const card=structuredClone(starterCards[1]); const caster=structuredClone(starterCards[0]); caster.id='caster';
  caster.abilities=['offense','humiliation','heal'].map(effectId=>({trigger:'battlecry',effectId,params:{target:'allEnemies',amount:20}}));
  const {play}=fixture([card,caster]); const victim=play(); play('b','caster');
  assert.equal(victim.health,1); assert.equal(victim.maxHealth,1); assert.equal(victim.attack,1); assert.equal(victim.shield,true);
});
test('humiliation establishes one attack even when enrage changes in the same resolution',()=>{
  const rager=structuredClone(starterCards[5]), caster=structuredClone(starterCards[0]); caster.id='caster';
  caster.abilities=[{trigger:'battlecry',effectId:'damage',params:{target:'allEnemies',amount:1}},{trigger:'battlecry',effectId:'humiliation',params:{target:'allEnemies',amount:1}}];
  const {play}=fixture([rager,caster]); const victim=play(); play('b','caster'); assert.equal(victim.health,3); assert.equal(victim.attack,1);
});
test('full board rejects plays and a new turn refreshes readiness',()=>{
  const {state,play,battle,action}=fixture(); for(let i=0;i<7;i++) play();
  const before=state.revision; battle.hands.set('a',[{instanceId:'eighth',cardId:starterCards[0].id}]);
  assert.equal(battle.play('a',{...action(),instanceId:'eighth'}),false); assert.equal(state.revision,before);
  state.activePlayer='b'; assert.equal(battle.advance('b',action()),true); assert.ok([...state.minions.values()].every(m=>m.ready));
});
test('each player exhausts exactly thirty cards before fatigue starts',()=>{
  const {state,battle,action,events}=fixture();
  const drawFor = (owner: string) => {
    state.activePlayer=owner==='a'?'b':'a';
    assert.equal(battle.advance(state.activePlayer,action()),true);
  };
  for (const owner of ['a','b']) {
    for(let n=0;n<26;n++) drawFor(owner);
    assert.equal(state.players.get(owner)!.deckCount,0);
    assert.equal(state.players.get(owner)!.health,30);
    assert.equal(battle.hands.get(owner)!.length,10);
    drawFor(owner);
    assert.equal(state.players.get(owner)!.health,29);
  }
  // Burned cards are public, fatigue carries its growing amount.
  assert.ok(events.some(e=>e.kind==='burn' && e.cardId===starterCards[0].id));
  assert.deepEqual(events.filter(e=>e.kind==='fatigue').map(e=>e.amount),[1,1]);
});
test('fatigue eventually ends a match and hands cap at ten',()=>{
  const {state,battle,action}=fixture();
  for(let i=0;i<100 && state.status==='active';i++){ assert.equal(battle.advance(state.activePlayer,action()),true); }
  assert.equal(state.status,'finished'); assert.ok([...battle.hands.values()].every(hand=>hand.length<=10));
});
test('selected decks must be 30 known cards',()=>{
  const cards=[structuredClone(starterCards[0]),structuredClone(starterCards[1])];
  const state=new MatchState(); state.players.set('a',new PlayerState()); state.players.set('b',new PlayerState());
  state.activePlayer='a'; state.status='active';
  const battle=new Battle(state,cards);
  const deck=Array.from({length:30},(_,n)=>cards[n%2]!.id);
  battle.start(new Map([['a',deck],['b',deck]]));
  assert.equal(battle.hands.get('a')!.length,3); assert.equal(battle.hands.get('b')!.length,4);
  assert.ok(battle.hands.get('a')!.every(card=>cards.some(item=>item.id===card.cardId)));
  assert.throws(()=>new Battle(state,cards).start(new Map([['a',['missing']],['b',deck]])));
});


test('summon triggers reserve board slots, deathrattles free slots, summoned cards skip battlecry', () => {
  const token = { ...structuredClone(starterCards[0]), id:'token', abilities:[{trigger:'battlecry',effectId:'damage',params:{target:'enemyHero',amount:20}}] };
  const source = { ...structuredClone(starterCards[0]), id:'summoner', abilities:[{name:'Подмога',trigger:'battlecry',effectId:'summon',params:{cardId:'token',amount:2}},{trigger:'deathrattle',effectId:'summon',params:{cardId:'token',amount:7}}] };
  const f = fixture([source,token]); f.play('a',source.id);
  assert.equal(f.state.minions.size,3); assert.equal(f.state.players.get('b')!.health,30);
  const original = [...f.state.minions.values()].find(m => m.cardId === source.id)!;
  const enemy = f.play('b',token.id); enemy.ready = true; assert.equal(f.attack(enemy.id,original.id),true);
  assert.equal([...f.state.minions.values()].filter(m => m.owner === 'a').length,7);
  assert.ok([...f.state.minions.values()].every(m => m.cardId === 'token'));
  assert.equal(f.state.players.get('b')!.health,30);
});
test('rage summons once per transition into wounded state', () => {
  const source = { ...structuredClone(starterCards[0]), id:'rage-summoner', health:8, attack:0, abilities:[{trigger:'enrage',effectId:'summon',params:{cardId:'paper-imp',amount:1}}] };
  const f = fixture([source,structuredClone(starterCards[0])]); const m=f.play('a',source.id), enemy=f.play('b');
  enemy.attack=1; enemy.health=20; enemy.ready=true; assert.equal(f.attack(enemy.id,m.id),true);
  assert.equal([...f.state.minions.values()].filter(x=>x.owner==='a').length,2);
  enemy.ready=true; assert.equal(f.attack(enemy.id,m.id),true);
  assert.equal([...f.state.minions.values()].filter(x=>x.owner==='a').length,2);
});
test('taunt must be attacked first; hero powers ignore taunt; an open board exposes the hero', () => {
  const wall={...structuredClone(starterCards[0]),id:'wall',properties:['taunt' as const]};
  const f=fixture([structuredClone(starterCards[0]),wall]); const attacker=f.play('a'), plain=f.play('b'), taunt=f.play('b','wall'); f.state.activePlayer='a'; attacker.ready=true;
  const a=f.state.players.get('a')!; a.heroId='captain'; a.mana=10;
  assert.equal(f.attack(attacker.id,'b'),false); assert.equal(f.attack(attacker.id,plain.id),false); assert.equal(attacker.ready,true);
  assert.equal(f.battle.power('a',{...f.action(),targetId:'b'}),true); assert.equal(f.state.players.get('b')!.health,28); assert.equal(a.mana,8); assert.equal(a.powerUsed,true);
  assert.equal(f.battle.power('a',{...f.action(),targetId:plain.id}),false);
  assert.equal(f.attack(attacker.id,taunt.id),true); assert.equal(f.state.minions.has(taunt.id),false);
  const next=f.play('a'); next.ready=true; f.state.activePlayer='a';
  assert.equal(f.attack(next.id,'b'),true); assert.equal(f.state.players.get('b')!.health,26);
});
test('healing and summoning powers are bounded and refresh only on the next own turn', () => {
  const f=fixture(); const a=f.state.players.get('a')!; a.heroId='medic'; a.maxHealth=32; a.health=31;
  assert.equal(f.battle.power('a',f.action()),true); assert.equal(a.health,32); assert.equal(a.mana,8);
  assert.equal(f.battle.advance('a',f.action()),true);
  assert.equal(a.powerUsed,true); assert.equal(f.battle.advance('b',f.action()),true); assert.equal(a.powerUsed,false);
  a.heroId='recruiter'; a.mana=10;
  assert.equal(f.battle.power('a',f.action()),true); assert.equal(f.state.minions.size,1); assert.equal(a.mana,7);
  assert.equal([...f.state.minions.values()][0].ready,false);
});
