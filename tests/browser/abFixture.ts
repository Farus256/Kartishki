import { starterAutoBattlerCatalog } from '@kartishki/shared';
import type { AbSnapshot, AbMinion, AbPlayer } from '../../apps/client/src/autoBattlerSession';
/** Playable tavern minions only: tokens and spells never sit on a fixture board. */
const REAL_MINIONS=starterAutoBattlerCatalog.minions.filter(m=>!m.token&&!m.spell);
export function abFixture():AbSnapshot{
 const unit=(n:number,owner='p0'):AbMinion=>{const d=REAL_MINIONS[n%REAL_MINIONS.length]!;return{id:`${owner}-m${n}`,cardId:d.id,baseId:d.id,kind:'minion',attack:d.attack,health:d.health,maxHealth:d.health,tavernTier:d.tavernTier,keywords:[...d.keywords],golden:n===6,owner};};
 const players:AbPlayer[]=Array.from({length:8},(_,i)=>({sessionId:`p${i}`,displayName:['Барсик','Костя','Марина','Саша','Палыч','Лёха','Женя','Никита'][i]!,heroId:starterAutoBattlerCatalog.heroes[i%4]!.id,portraitKey:'',skin:'',health:40-i*4,maxHealth:40,power:{...starterAutoBattlerCatalog.heroes[i%4]!.power,isExhausted:false},gold:8,tavernTier:6,upgradeCost:0,board:i===0?Array.from({length:7},(_,n)=>unit(n)):[],hand:i===0?Array.from({length:10},(_,n)=>unit(n+8)):[],tavern:{offers:i===0?Array.from({length:6},(_,n)=>unit(n+25)):[],frozen:false,size:6},nextOpponentId:i===0?'p1':'p0',swords:true,eliminated:i===7,placement:i===7?8:0,recruitReady:false,lastCombatResult:'win',lastCombatDamage:4,lastCombatOpponentId:i===0?'p1':'p0',lastCombatSummary:'',discoverOpen:false,pendingDiscover:[],tripleSerial:0,lastActionId:0,buyCost:3,rerollCost:1,sellReward:1,freeRerolls:0}));
 return{status:'online',phase:'RECRUIT_PHASE',turn:8,revision:1,recruitSeconds:35,heroSeconds:0,phaseEndsAt:0,sessionId:'p0',error:'',winnerId:'',anomalyId:'',cancelled:false,setId:'',tribes:[],players,catalog:starterAutoBattlerCatalog,heroOffers:[],discover:null,combat:null,combatBoards:null,pairing:[]};
}
export function abOpenTable(): AbSnapshot {
  const fixture = abFixture();
  const me = fixture.players[0]!;
  me.board = [];
  me.hand = [me.hand[0]!];
  me.gold = 10;
  return fixture;
}
