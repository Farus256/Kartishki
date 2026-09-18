import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { PlayerName } from '../cosmetics/PlayerName';
import { Aura } from '../cosmetics/Aura';
import { CardBackFace } from '../cosmetics/CardBackFace';
import { HIT_EFFECTS, playHitEffect } from '../cosmetics/hitEffects';
import { playProjectile } from '../cosmetics/projectiles';
import { STRIKES } from '../cosmetics/strikeMotion';
import { playBuffFx } from '../cosmetics/buffFx';
import { playSlamSound, playSlamWindup } from '../cosmetics/vfxAudio';
import { VfxLayer, pick, rand } from '../cosmetics/vfx';
import { useTranslation } from 'react-i18next';
import { AUTO_BATTLER, abCopyName, type AutoBattlerCatalog, type CombatEvent, type CombatEventsMessage } from '@kartishki/shared';
import type { AbCombatBoards, AbMinion, AbPlayer } from '../autoBattlerSession';
import { audioManager } from '../AudioManager';
import { AB_LAYOUT, combatRowXs } from './battlegroundsLayout';
import { AbHeroFace } from './AbHeroFace';
import { HeartIcon, MinionTile } from './MinionTile';
import { combatImpact } from './combatImpact';
import { HeroPowerTooltip } from './HeroPowerTooltip';
import { playMinionVoice } from './voiceLines';
import { idlePhase } from './cardBadges';

type Props = { combat: CombatEventsMessage; boards: AbCombatBoards; meId: string; catalog: AutoBattlerCatalog; players: AbPlayer[]; pairing?: { playerA: string; playerB: string }[]; initialHeroes?: AbPlayer[]; waiting?: boolean; recruitAfter?: boolean; phaseReady?: boolean; onDone: () => void; /** Fires when a hero hit lands on screen, so standings drop in sync with the stamp. */ onHeroHealth?: (sessionId: string, health: number) => void };
type Piece = { minion: AbMinion; side: 0 | 1 };
const W=AB_LAYOUT.COMBAT_W,H=AB_LAYOUT.COMBAT_H,CW=AB_LAYOUT.MINION_W,CH=AB_LAYOUT.MINION_H;
const weight=(e:CombatEvent)=>['ATTACK','HUMILIATE','BAIT'].includes(e.kind)?3200:e.kind==='DEATH'?500:e.kind==='SUMMON'?580:e.kind==='DEATHRATTLE'?280:e.kind==='REBORN'?660:e.kind==='PLAYER_DAMAGE'?4000:e.kind==='STATS'?460:200;

/** HTML cards match the tavern tile. Pixi is not used for combat minions. */
export function CombatPlayback({combat,boards,meId,catalog,players,pairing:_pairing=[],initialHeroes,waiting=false,recruitAfter=true,phaseReady=true,onDone,onHeroHealth}:Props){
 const done=useRef(onDone);done.current=onDone;
 const heroHealth=useRef(onHeroHealth);heroHealth.current=onHeroHealth;
 /** The hit effect in flight, cancelled with the rest of the playback. */
 const slamRef=useRef<ReturnType<typeof playHitEffect>>(undefined);
 const shotRef=useRef<ReturnType<typeof playProjectile>>(undefined);
 /** One canvas over the field for the attackers' speed lines; made on the first dash of a fight, dropped with it. */
 const trailRef=useRef<VfxLayer>(undefined);
 const trail=()=>{ if(!trailRef.current&&field.current){ trailRef.current=new VfxLayer(field.current,{inset:0,zIndex:8,className:'ab-combat-trail'}); trailRef.current.max=160; } return trailRef.current; };
 const transition=useRef({phaseReady,recruitAfter});transition.current={phaseReady,recruitAfter};
 const [tally,setTally]=useState<{id:string;amount:number}|null>(null);
 const [settled,setSettled]=useState(false);
 const rate=useRef(1);const field=useRef<HTMLDivElement>(null);const tiles=useRef(new Map<string, HTMLDivElement>());
 const piecesRef=useRef<Piece[]>([]);
 const [heroVitals,setHeroVitals]=useState(() => Object.fromEntries((initialHeroes ?? players).map(p=>[p.sessionId,{health:p.health,damage:0}])));
 const [failed,setFailed]=useState(false);
 const [pieces,setPieces]=useState<Piece[]>([]);const [facedown,setFacedown]=useState<Set<string>>(new Set());
 /** Enemy tokens mid-reveal: the flip runs as a staggered CSS animation, then the class comes off so hit animations own the element again. */
 const [revealing,setRevealing]=useState(false);
 const [banner,setBanner]=useState('VS');const [result,setResult]=useState<'win'|'loss'|'draw'|null>(null);const [recruit,setRecruit]=useState(false);const [leaving,setLeaving]=useState(false);
 const {t,i18n}=useTranslation();
 const mineA=combat.playerA===meId;const topOwner=mineA?combat.playerB:combat.playerA;
 const foe=players.find(p=>p.sessionId===topOwner);const mine=players.find(p=>p.sessionId===meId);
 /** Cards the opponent still held when the bell rang: drawn face down by the portrait, never identified. A ghost holds nothing. */
 const foeHand=combat.ghost?0:Math.max(0,Math.min(10,combat.handCounts?.[topOwner]??foe?.handCount??0));

 useEffect(()=>{
  let cancelled=false;
  const effects=new Set<Animation>();
  const animate=(el:HTMLElement,frames:Keyframe[],duration:number,options:Omit<KeyframeAnimationOptions,'duration'>={})=>{
   const animation=el.animate(frames,{easing:'ease-out',...options,duration:duration/rate.current,delay:(Number(options.delay)||0)/rate.current});
   effects.add(animation);animation.finished.then(()=>effects.delete(animation)).catch(()=>{});
   return animation;
  };
  setSettled(false);setTally(null);setBanner('VS');setResult(null);setRecruit(false);setLeaving(false);setFailed(false);
  setHeroVitals(Object.fromEntries((initialHeroes?.length ? initialHeroes : players).map(p=>[p.sessionId,{health:combat.initialHealth?.[p.sessionId] ?? p.health,damage:0}])));
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  // A background tab gets no animation frames and throttled timers: the fight waits there (a frame
  // never advances the clock by more than 100ms) and resumes where it stood once the tab is back.
  // If the server has already opened the next recruit by then, the rest plays at 2.5x to catch up.
  const tick=(fn:()=>void)=>{if(document.hidden)window.setTimeout(fn,250);else requestAnimationFrame(fn);};
  const onVisible=()=>{if(!document.hidden&&transition.current.phaseReady&&rate.current<100)rate.current=Math.max(rate.current,2.5);};
  document.addEventListener('visibilitychange',onVisible);
  // ponytail: no speed/skip UI any more; the browser specs still fast-forward through this event (detail = rate, 100 = skip).
  const onRate=(event:Event)=>{const n=Number((event as CustomEvent).detail);if(Number.isFinite(n)&&n>0)rate.current=n;};
  window.addEventListener('ab-combat-rate',onRate);
  const pause=(ms:number,step?:(u:number)=>void)=>new Promise<void>(resolve=>{
   if(rate.current>=100){step?.(1);resolve();return;}
   let elapsed=0,last=performance.now();const frame=()=>{if(cancelled){resolve();return;}const now=performance.now();elapsed+=Math.min(100,now-last)*rate.current;last=now;const u=Math.min(1,elapsed/Math.max(1,ms));step?.(u);if(u<1)tick(frame);else resolve();};frame();
  });
  // Even Skip yields one frame per authoritative state commit. Without it,
  // React can batch the whole event queue and onDone may read the old board.
  const paint=()=>new Promise<void>(resolve=>tick(()=>rate.current>=100?resolve():tick(()=>resolve())));
  const commit=(next:Piece[])=>{piecesRef.current=next;setPieces(next);return paint();};
  const home=(list:Piece[],id:string)=>{
   const piece=list.find(p=>p.minion.id===id);if(!piece)return {x:0,y:0};
   const row=list.filter(p=>p.side===piece.side);
   const i=row.findIndex(p=>p.minion.id===id);
   return {x:combatRowXs(row.length,W)[i]??0,y:piece.side===0?AB_LAYOUT.COMBAT_ENEMY_Y:AB_LAYOUT.COMBAT_PLAYER_Y};
  };
  const place=(id:string,x:number,y:number,r=0,s=1)=>{
   const el=tiles.current.get(id);if(!el)return;
   el.style.left=`${(x/W)*100}%`;el.style.top=`${(y/H)*100}%`;
   el.style.transform=`translate(0,0) rotate(${r}rad) scale(${s})`;
  };
  const restack=(list:Piece[])=>{
   for(const piece of list){const p=home(list,piece.minion.id);place(piece.minion.id,p.x,p.y);}
  };
  // The red veil over the table is reserved for a blow to the hero; minion hits only shake and bleed.
  const burst=(el:HTMLElement,damage:number,from?:{x:number;y:number},at?:{x:number;y:number},hero=false,bleed=true)=>{
   if(reduced||cancelled||rate.current>=100||!field.current)return;
   const impact=combatImpact(damage);if(!impact.tier)return;
   field.current.dataset.impactTier=String(impact.tier);
   el.classList.remove('is-hit');void el.offsetWidth;el.classList.add('is-hit');
   // Hit direction: the unit vector the striker travelled along (straight down the field when unknown).
   const dx=from&&at?at.x-from.x:0,dy=from&&at?at.y-from.y:1,len=Math.hypot(dx,dy)||1,ux=dx/len,uy=dy/len;
   // Recoil along that direction, then settle.
   const flip=el.querySelector<HTMLElement>('.ab-combat-flip')??el;
   animate(flip,[{translate:'0 0',rotate:'0deg'},{translate:`${ux*impact.recoil}px ${uy*impact.recoil*.6}px`,rotate:`${-ux*6||4}deg`,offset:.3},{translate:`${ux*impact.recoil*.35}px ${uy*impact.recoil*.2}px`,rotate:`${ux*2}deg`,offset:.7},{translate:'0 0',rotate:'0deg'}],impact.duration+160);
   // Only the card that was struck bleeds: the attacker's retaliation damage rocks it but throws nothing.
   if(at&&bleed)blood(at,impact.particles,damage,ux,uy);
   shake(impact.shake,impact.duration+120);
   if(hero&&impact.tier>=3&&impact.shake){const veil=document.createElement('i');veil.className='ab-combat-veil';field.current.appendChild(veil);window.setTimeout(()=>veil.remove(),420);}
  };
  // Camera shake: a decaying oscillation along a random axis, amplitude in px. Overlapping hits add up.
  const shake=(amp:number,ms:number)=>{
   const host=field.current;if(!host||!amp||reduced||rate.current>=100)return;
   const axis=Math.random()*Math.PI*2,steps=7,frames:Keyframe[]=[{translate:'0 0',rotate:'0deg'}];
   for(let i=1;i<=steps;i++){const k=amp*(1-i/(steps+1))**1.5*(i%2?1:-1);frames.push({translate:`${Math.cos(axis)*k}px ${Math.sin(axis)*k}px`,rotate:`${k*.03}deg`});}
   frames.push({translate:'0 0',rotate:'0deg'});
   animate(host,frames,ms,{easing:'linear',composite:'add'});
  };
  // Blood, paper chips and sparks thrown backwards from the impact: they leave the struck card along the striker's
  // direction (ux,uy) in a cone, faster and more numerous with damage, with a smear stretched the same way.
  const blood=(at:{x:number;y:number},count:number,damage:number,ux:number,uy:number)=>{
   const host=field.current;if(!host||!count)return;
   const heading=Math.atan2(uy,ux);
   // Origin sits on the side of the card the blow landed on; the debris crosses the card and flies out behind it.
   const origin={x:at.x-ux*CW*.25,y:at.y-uy*CH*.2};
   const splat=document.createElement('i');splat.className='ab-combat-splat';
   splat.style.left=`${(at.x/W)*100}%`;splat.style.top=`${(at.y/H)*100}%`;host.appendChild(splat);
   animate(splat,[{transform:`translate(-50%,-50%) rotate(${heading}rad) scale(.3,.6)`,opacity:.95},{transform:`translate(calc(-50% + ${ux*40}px),calc(-50% + ${uy*40}px)) rotate(${heading}rad) scale(1.7,.9)`,opacity:.85,offset:.45},{transform:`translate(calc(-50% + ${ux*46}px),calc(-50% + ${uy*46}px)) rotate(${heading}rad) scale(1.8,.95)`,opacity:0}],1150,{fill:'forwards'}).onfinish=()=>splat.remove();
   dust(at,3+Math.min(4,Math.round(damage/3)),ux,uy);
   const speed=110+Math.min(220,damage*14);
   for(let i=0;i<count;i++){
    const kind=i%4===3?'ab-combat-chip':i%5===4?'ab-combat-spark':'ab-combat-drop';
    const drop=document.createElement('i');drop.className=kind;
    drop.style.left=`${((origin.x+(Math.random()-.5)*CW*.35)/W)*100}%`;drop.style.top=`${((origin.y+(Math.random()-.5)*CH*.3)/H)*100}%`;host.appendChild(drop);
    const ang=heading+(Math.random()-.5)*.9,dist=speed*(.5+Math.random()),spin=(Math.random()-.5)*640,stretch=kind==='ab-combat-drop'?1+dist/160:1;
    const ex=Math.cos(ang)*dist,ey=Math.sin(ang)*dist+28;
    animate(drop,[{transform:`translate(0,0) rotate(${ang}rad) scale(.6,.6)`,opacity:0},{transform:`translate(${ex*.3}px,${ey*.25}px) rotate(${ang}rad) scale(${stretch},1)`,opacity:1,offset:.12},{transform:`translate(${ex}px,${ey}px) rotate(${ang+spin*Math.PI/180*.4}rad) scale(${stretch*.5},.5)`,opacity:1,offset:.5},{transform:`translate(${ex*1.15}px,${ey*1.15+30}px) rotate(${ang+spin*Math.PI/180*.7}rad) scale(${stretch*.35},.4)`,opacity:.9,offset:.78},{transform:`translate(${ex*1.2}px,${ey*1.2+40}px) rotate(${ang+spin*Math.PI/180}rad) scale(.2)`,opacity:0}],900+Math.random()*500,{delay:Math.random()*70,easing:'cubic-bezier(.2,.7,.4,1)',fill:'both'}).onfinish=()=>drop.remove();
   }
  };
  // A little dust at every impact and landing: slow puffs that spread, hang, then thin out.
  // Puffs drift on along the strike vector (ux,uy) and fan out a little to either side of it.
  const dust=(at:{x:number;y:number},count:number,ux=0,uy=1)=>{
   const host=field.current;if(!host||reduced||cancelled||rate.current>=100)return;
   for(let i=0;i<count;i++){
    const puff=document.createElement('i');puff.className='ab-combat-dust-puff';
    const side=(i%2?1:-1),spread=18+Math.random()*34,push=22+Math.random()*30;
    puff.style.left=`${((at.x+ux*14+(Math.random()-.5)*CW*.3)/W)*100}%`;puff.style.top=`${((at.y+uy*14+CH*.2+(Math.random()-.5)*8)/H)*100}%`;host.appendChild(puff);
    const rise=14+Math.random()*22,grow=1.6+Math.random()*1.1;
    // Sideways spread runs perpendicular to the strike: (-uy,ux).
    const fx=(k:number)=>ux*push*k+side*spread*k*-uy,fy=(k:number)=>uy*push*k+side*spread*k*ux-rise*k;
    animate(puff,[{transform:'translate(-50%,-50%) scale(.35)',opacity:0},{transform:`translate(calc(-50% + ${fx(.5)}px),calc(-50% + ${fy(.5)}px)) scale(${grow*.7})`,opacity:.55,offset:.22},{transform:`translate(calc(-50% + ${fx(1)}px),calc(-50% + ${fy(1)}px)) scale(${grow})`,opacity:.32,offset:.6},{transform:`translate(calc(-50% + ${fx(1.25)}px),calc(-50% + ${fy(1.3)}px)) scale(${grow*1.25})`,opacity:0}],1100+Math.random()*600,{delay:Math.random()*90,easing:'cubic-bezier(.15,.6,.3,1)',fill:'both'}).onfinish=()=>puff.remove();
   }
  };
  // Damage clouds stay on the tile (walking home with a struck attacker) until the hit settles, then fade.
  const pops:HTMLElement[]=[];
  const pop=(id:string,amount:number,lethal=false)=>{
   const el=tiles.current.get(id)??field.current;if(!el)return;
   const node=document.createElement('b');node.className=lethal?'ab-combat-pop is-lethal':'ab-combat-pop';node.textContent=`${amount}`;
   node.style.left='50%';node.style.top='38%';
   el.appendChild(node);pops.push(node);
  };
  const clearPops=()=>{
   for(const node of pops.splice(0)){
    if(reduced||rate.current>=100){node.remove();continue;}
    node.classList.add('is-leave');window.setTimeout(()=>node.remove(),300/rate.current);
   }
  };
  const paintHit=(event:CombatEvent)=>{
   if(!event.targetId)return;
   const piece=piecesRef.current.find(p=>p.minion.id===event.targetId);
   if(!piece)return;
   if(event.kind==='DIVINE_SHIELD_POP'){
    piece.minion={...piece.minion,keywords:piece.minion.keywords.filter(k=>k!=='divineShield')};
    tiles.current.get(event.targetId)?.classList.add('is-shield-breaking');
    if(!reduced&&rate.current<100){
     audioManager.play('ab_shield_pop');
     tiles.current.get(event.targetId)?.animate([{filter:'brightness(2.4) drop-shadow(0 0 28px #ffdf80)'},{filter:'none'}],{duration:450/rate.current});
     const at=tileCenter(event.targetId);
     if(at&&field.current)for(let i=0;i<10;i++){const shard=document.createElement('i');shard.className='ab-combat-shine';shard.style.left=`${(at.x/W)*100}%`;shard.style.top=`${(at.y/H)*100}%`;field.current.appendChild(shard);const a=(i/10)*Math.PI*2;animate(shard,[{transform:'translate(0,0) scale(1)',opacity:1},{transform:`translate(${Math.cos(a)*90}px,${Math.sin(a)*90}px) scale(.2)`,opacity:0}],420).onfinish=()=>shard.remove();}
    }
    return;
   }
   if(event.remainingHealth===undefined)return;
   const lethal=event.remainingHealth<=0,poison=!!event.sourceId&&!!piecesRef.current.find(p=>p.minion.id===event.sourceId)?.minion.keywords.includes('poisonous');
   // The blow lands now and the health number drops with it; only the death waits for the duel to settle (settleHits).
   piece.minion={...piece.minion,health:event.remainingHealth};
   hitTiles.add(event.targetId);
   const tile=tiles.current.get(event.targetId);
   if(tile){tile.classList.remove('is-hp-drop');void tile.offsetWidth;tile.classList.add('is-hp-drop');}
   const src=event.sourceId?tileCenter(event.sourceId):undefined,dst=tileCenter(event.targetId);
   if(tile)burst(tile,event.amount??0,src,dst,false,event.targetId!==strikerId);
   if(tile&&poison&&lethal&&dst)mist(tile,dst);
   // Strike and retaliation land in the same frame: one thud per exchange, not two.
   if(!reduced&&rate.current<100&&performance.now()-lastHitSound>300){lastHitSound=performance.now();audioManager.play((event.amount??0)>=5?'ab_hit_heavy':'ab_hit_light');}
   if(event.amount)pop(event.targetId,-event.amount,lethal);
  };
  /** Tiles hit since the last settle: their damage clouds hang until both duelists stand home. */
  const hitTiles=new Set<string>();
  /** The minion mid-lunge: its own retaliation damage draws no blood. */
  let strikerId:string|null=null;
  let lastHitSound=0;
  // Where a dead minion stood, for the deathrattle burst that follows its removal.
  const graves=new Map<string,{x:number;y:number}>();
  const SKULL='<svg viewBox="0 0 64 64" aria-hidden><g stroke="#1a1a1a" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"><path d="M8 46l48-24M8 22l48 24" stroke="#e9dfc4" stroke-width="7"/><path d="M8 46l48-24M8 22l48 24" stroke="#1a1a1a" stroke-width="2"/><path d="M32 8c-12 0-20 8-20 19 0 6 3 10 7 13v8h26v-8c4-3 7-7 7-13 0-11-8-19-20-19z" fill="#f4ecd6"/><circle cx="24" cy="29" r="5" fill="#1a1a1a"/><circle cx="40" cy="29" r="5" fill="#1a1a1a"/><path d="M32 34l-3 6h6z" fill="#1a1a1a"/><path d="M25 48v-6M32 48v-6M39 48v-6"/></g></svg>';
  const rattled=new Set<string>();
  /** Skull+bones burst; resolves once the skull has peaked so the next summon/buff can follow immediately. */
  const deathrattleBurst=async(at:{x:number;y:number})=>{
   const host=field.current;if(!host||reduced||rate.current>=100)return;
   const skull=document.createElement('i');skull.className='ab-combat-skull';skull.innerHTML=SKULL;
   skull.style.left=`${(at.x/W)*100}%`;skull.style.top=`${(at.y/H)*100}%`;host.appendChild(skull);
   const skullAnim=animate(skull,[{transform:'translate(-50%,-50%) scale(.2) rotate(-20deg)',opacity:0},{transform:'translate(-50%,-90%) scale(1.25) rotate(8deg)',opacity:1,offset:.35},{transform:'translate(-50%,-130%) scale(1) rotate(-5deg)',opacity:1,offset:.75},{transform:'translate(-50%,-190%) scale(.8) rotate(4deg)',opacity:0}],620,{easing:'cubic-bezier(.2,.8,.3,1)'});
   skullAnim.onfinish=()=>skull.remove();
   for(let i=0;i<6;i++){
    const bone=document.createElement('i');bone.className='ab-combat-bone';bone.style.left=`${(at.x/W)*100}%`;bone.style.top=`${(at.y/H)*100}%`;host.appendChild(bone);
    const a=-Math.PI/2+(i-2.5)*.55+(Math.random()-.5)*.3,d=70+Math.random()*70;
    animate(bone,[{transform:'translate(-50%,-50%) rotate(0deg) scale(.5)',opacity:0},{transform:`translate(calc(-50% + ${Math.cos(a)*d*.5}px),calc(-50% + ${Math.sin(a)*d*.5}px)) rotate(${(i%2?1:-1)*140}deg) scale(1)`,opacity:1,offset:.35},{transform:`translate(calc(-50% + ${Math.cos(a)*d}px),calc(-50% + ${Math.sin(a)*d+60}px)) rotate(${(i%2?1:-1)*320}deg) scale(.6)`,opacity:0}],520+i*30,{delay:40}).onfinish=()=>bone.remove();
   }
   // Peak ~35% of 620ms; after that the follow-up action can land while bones still scatter.
   await pause(reduced?1:240);
  };
  // A survivor's tier flies from its tile into the damage tally.
  const flyTier=async(id:string,tier:number,ms:number)=>{
   const host=field.current,at=tileCenter(id),tallyEl=host?.querySelector<HTMLElement>('[data-testid=ab-hero-tally]');
   if(!host||!at||!tallyEl||reduced||cancelled||rate.current>=100)return;
   const box=host.getBoundingClientRect(),z=box.width/host.offsetWidth||1,tb=tallyEl.getBoundingClientRect();
   const dx=(tb.left+tb.width/2-box.left)/z-at.x,dy=(tb.top+tb.height/2-box.top)/z-at.y;
   const node=document.createElement('b');node.className='ab-tier-fly';node.textContent=`+${tier}`;
   node.style.left=`${(at.x/W)*100}%`;node.style.top=`${(at.y/H)*100}%`;host.appendChild(node);
   tiles.current.get(id)?.animate([{filter:'brightness(1)'},{filter:'brightness(1.8) drop-shadow(0 0 14px #ffd76a)'},{filter:'brightness(1)'}],{duration:ms/rate.current});
   await animate(node,[{transform:'translate(-50%,-50%) scale(.5)',opacity:0},{transform:'translate(-50%,-50%) scale(1.3)',opacity:1,offset:.25},{transform:`translate(calc(-50% + ${dx}px),calc(-50% + ${dy}px)) scale(.8)`,opacity:1}],ms,{easing:'cubic-bezier(.5,0,.7,1)'}).finished.catch(()=>{});
   node.remove();
   tallyEl.animate([{scale:'1'},{scale:'1.25'},{scale:'1'}],{duration:220/rate.current});
  };
  const tileCenter=(id:string)=>{const el=tiles.current.get(id);if(!el)return undefined;return {x:parseFloat(el.style.left)*W/100+CW/2,y:parseFloat(el.style.top)*H/100+CH*.45};};
  // Green mist rising from a poisoned victim.
  const mist=(tile:HTMLElement,at:{x:number;y:number})=>{
   if(reduced||cancelled||rate.current>=100||!field.current)return;
   audioManager.play('ab_poison');tile.classList.add('is-poisoned');
   for(let i=0;i<3;i++){const blob=document.createElement('i');blob.className='ab-combat-mist';blob.style.left=`${(at.x/W)*100}%`;blob.style.top=`${(at.y/H)*100}%`;field.current.appendChild(blob);
    animate(blob,[{transform:`translate(${(i-1)*26-30}px,0) scale(.4)`,opacity:0},{opacity:.85,offset:.25},{transform:`translate(${(i-1)*40-30}px,-90px) scale(1.6)`,opacity:0}],700+i*120).onfinish=()=>blob.remove();}
  };
  // Death: crumble, a vertical or horizontal split, or (rarely) a snap into drifting dust.
  async function rip(el:HTMLDivElement,eventId=0){
   if(reduced||rate.current>=100){el.style.opacity='0';return;}
   const face=el.querySelector('.ab-combat-face');
   if(!face){el.style.opacity='0';return;}
   const shard=(cut:string)=>{const piece=document.createElement('div');piece.className='ab-combat-shard';piece.style.clipPath=cut;piece.append(...[...face.childNodes].map(node=>node.cloneNode(true)));el.append(piece);return piece;};
   // Every shard keeps its faded end state (fill:forwards): a finished animation would otherwise snap the piece back to
   // full opacity for the frames between the end of the rip and the tile leaving the DOM — the card would flash back after dying.
   const puff=(ms:number)=>{const dust=document.createElement('i');dust.className='ab-combat-dust';el.append(dust);animate(dust,[{transform:'translate(-50%,0) scale(.4)',opacity:.8},{transform:'translate(-50%,-20px) scale(1.8)',opacity:0}],ms,{fill:'forwards'});};
   el.classList.add('is-rip');
   const style=eventId%13===0?'snap':(['crumble','vertical','horizontal'] as const)[eventId%3]!;
   el.dataset.deathStyle=style;
   if(style==='snap'){
    // Thanos: the face flashes, then dissolves into a 5×5 grid of flakes. The wave runs left to right, each flake
    // holding its place (fill:both) until its turn, then drifting up-right and blurring away. The tile is only
    // removed after the last flake is gone.
    const n=5,flakes:HTMLElement[]=[];
    for(let y=0;y<n;y++)for(let x=0;x<n;x++){
     const piece=shard(`inset(${y*100/n}% ${100-(x+1)*100/n}% ${100-(y+1)*100/n}% ${x*100/n}%)`);
     piece.style.filter='brightness(1.7)';flakes.push(piece);
    }
    animate(el,[{filter:'brightness(1)'},{filter:'brightness(2.2) drop-shadow(0 0 16px #ffe9a8)'},{filter:'brightness(1)'}],220);
    let last=0;
    flakes.forEach((piece,i)=>{
     const x=i%n,y=Math.floor(i/n);
     const delay=120+x*70+y*22+Math.random()*50,drift=60+Math.random()*90,ms=620+Math.random()*180;
     last=Math.max(last,delay+ms);
     animate(piece,[{transform:'translate(0,0) rotate(0) scale(1)',opacity:1,filter:'brightness(1.7)'},{transform:`translate(${drift*.35}px,${-drift*.2}px) rotate(${(Math.random()-.5)*24}deg) scale(1.04)`,opacity:.95,filter:'brightness(1.9)',offset:.3},{transform:`translate(${drift+50}px,${-drift-40}px) rotate(${(Math.random()-.5)*110}deg) scale(.3)`,opacity:0,filter:'brightness(2.4) blur(3px)'}],ms,{delay,easing:'cubic-bezier(.3,0,.6,1)',fill:'both'});
    });
    audioManager.play('ab_windfury');
    await pause(last+40);
    el.style.opacity='0';
    return;
   }
   if(style==='vertical'||style==='horizontal'){
    const v=style==='vertical';
    const a=shard(v?'polygon(0 0,52% 0,46% 30%,54% 55%,47% 100%,0 100%)':'polygon(0 0,100% 0,100% 48%,70% 53%,40% 46%,0 52%)');
    const b=shard(v?'polygon(52% 0,100% 0,100% 100%,47% 100%,54% 55%,46% 30%)':'polygon(0 52%,40% 46%,70% 53%,100% 48%,100% 100%,0 100%)');
    const flash=document.createElement('i');flash.className='ab-combat-slash'+(v?' is-vertical':' is-horizontal');el.append(flash);
    animate(flash,[{opacity:1,transform:v?'scaleY(.2)':'scaleX(.2)'},{opacity:0,transform:'scale(1.1)'}],320).onfinish=()=>flash.remove();
    animate(a,[{transform:'translate(0,0) rotate(0)',opacity:1},{transform:v?'translate(-70px,90px) rotate(-38deg)':'translate(-40px,-40px) rotate(-14deg)',opacity:0}],620,{fill:'forwards'});
    animate(b,[{transform:'translate(0,0) rotate(0)',opacity:1},{transform:v?'translate(70px,100px) rotate(34deg)':'translate(40px,120px) rotate(16deg)',opacity:0}],640,{fill:'forwards'});
    puff(600);
    await pause(560);
    el.style.opacity='0';
    return;
   }
   const cuts=[
    'polygon(0 0,50% 0,42% 30%,0 40%)','polygon(50% 0,100% 0,100% 35%,42% 30%)','polygon(0 40%,42% 30%,55% 60%,0 70%)',
    'polygon(42% 30%,100% 35%,100% 65%,55% 60%)','polygon(0 70%,55% 60%,45% 100%,0 100%)','polygon(55% 60%,100% 65%,100% 100%,45% 100%)',
   ];
   cuts.forEach((cut,i)=>{
    const piece=shard(cut);
    const dx=(i%2?1:-1)*(20+Math.random()*60),rot=(Math.random()-.5)*70;
    animate(piece,[{transform:'translate(0,0) rotate(0)',opacity:1},{transform:`translate(${dx*.4}px,${-10-Math.random()*20}px) rotate(${rot*.3}deg)`,opacity:1,offset:.25},{transform:`translate(${dx}px,${110+Math.random()*60}px) rotate(${rot}deg)`,opacity:0}],560+i*40,{fill:'forwards'});
   });
   puff(620);
   await pause(560);
   el.style.opacity='0';
  }

  void(async()=>{
   try{
    const enemy=(mineA?boards.b:boards.a).map(minion=>({minion:{...minion},side:0 as const}));
    const ours=(mineA?boards.a:boards.b).map(minion=>({minion:{...minion},side:1 as const}));
    const start=[...enemy,...ours];
    piecesRef.current=start;setPieces(start);setFacedown(new Set(enemy.map(p=>p.minion.id)));
     const budget=Math.max(.25,Math.min(1,(combat.durationMs-4200)/Math.max(1,combat.events.reduce((n,e)=>n+weight(e),0))));
    await paint();
    if(cancelled)return;
    restack(start);
    // Card backs are a bought look: hold them long enough to read, then turn them over one after another.
    await pause(reduced?8:800);
    if(cancelled)return;
    setFacedown(new Set());setRevealing(true);
    await pause(reduced?8:900+Math.min(6,enemy.length-1)*70);
    setRevealing(false);
    await pause(reduced?8:520);
    setBanner('');
    let attacker:string|null=null;
    let struck=false;
    let rebornOwner='';
    const returnAttacker=async()=>{
     if(!attacker)return;
     const id=attacker,el=tiles.current.get(id),at=home(piecesRef.current,id);
     // Always walk back, even when dead: deaths play out only once both cards stand in place.
   if(el){const x=parseFloat(el.style.left)*W/100,y=parseFloat(el.style.top)*H/100;
      await pause(reduced?1:340*budget,u=>{const ease=1-(1-u)**3;place(id,x+(at.x-x)*ease,y+(at.y-y)*ease);});
      el.classList.remove('is-attacking');place(id,at.x,at.y);
      dust({x:at.x+CW/2,y:at.y+CH*.55},2);
     }
     tiles.current.get(id)?.classList.remove('is-attacking');
     field.current?.classList.remove('is-duel');tiles.current.forEach(t=>t.classList.remove('is-defending'));
     attacker=null;strikerId=null;
    };
    // Both duelists stand home, the damage clouds hang for a beat and fade — and only then do deaths play.
    const settleHits=async()=>{
     const duel=!!attacker;
     await returnAttacker();
     if(!hitTiles.size)return;
     await pause(reduced?8:(duel?450:350)*budget);
     if(cancelled)return;
     hitTiles.clear();clearPops();
    };
    for(let i=0;i<combat.events.length;i++){
     const event=combat.events[i]!;
     if(field.current)field.current.dataset.eventId=String(event.id);
     if(cancelled)return;
     if(!['DAMAGE','CLEAVE_DAMAGE','STATS','DIVINE_SHIELD_POP'].includes(event.kind))await settleHits();
     const ms=reduced?8:weight(event)*budget;
     const list=piecesRef.current;
     const src=event.sourceId?home(list,event.sourceId):null;const dst=event.targetId?home(list,event.targetId):null;
     if(event.kind==='ATTACK'&&event.sourceId&&event.targetId&&src&&dst){
      // Beat between attacks (the attacker "picks" its target here): 750ms reads clearly and keeps fights moving.
      if(struck)await pause(reduced?8:750);
      struck=true;
      attacker=event.sourceId;strikerId=attacker;
      const el=tiles.current.get(attacker);el?.classList.add('is-attacking');
      field.current?.classList.add('is-duel');tiles.current.get(event.targetId)?.classList.add('is-defending');
      // Camera: the field leans toward the pair (a CSS scale from their midpoint; the shake composes on top).
      if(field.current)field.current.style.transformOrigin=`${((src.x+dst.x)/2+CW/2)/W*100}% ${((src.y+dst.y)/2+CH/2)/H*100}%`;
      const dx=dst.x-src.x,dy=dst.y-src.y,distance=Math.max(1,Math.hypot(dx,dy));
      const impact={x:src.x+dx*.78,y:src.y+dy*.78};
      const variant=event.id%3;
      if(el)el.dataset.attackStyle=['thrust','hook','slam'][variant];
      el?.classList.add('is-thinking');
      await pause(reduced?8:45*budget);
      el?.classList.remove('is-thinking');
      tiles.current.get(event.targetId)?.classList.add('is-targeted');
      await pause(reduced?8:30*budget);
      tiles.current.get(event.targetId)?.classList.remove('is-targeted');
      audioManager.play('ab_whoosh');if(rate.current<100)playMinionVoice(list.find(p=>p.minion.id===event.sourceId)?.minion.cardId??'','attack');
      await pause(reduced?1:70*budget,u=>{const coil=1-(1-u)**3;if(!reduced)place(event.sourceId!,src.x-dx/distance*32*coil,src.y-dy/distance*32*coil,variant===1?-.18*coil:variant===2?.06*coil:0,1+.1*coil);});
      el?.classList.add('is-dashing');
      const fx=!reduced&&rate.current<100?trail():undefined;if(fx)fx.rate=rate.current;
      await pause(reduced?1:170*budget,u=>{
       const ease=u**5,arc=Math.sin(Math.PI*u)*(variant===1?52:variant===2?-28:0);
       const px=src.x-dx/distance*32*(1-ease)+(impact.x-src.x)*ease-dy/distance*arc,py=src.y-dy/distance*32*(1-ease)+(impact.y-src.y)*ease+dx/distance*arc;
       if(!reduced)place(event.sourceId!,px,py,variant===1?Math.sin(Math.PI*u)*.22:variant===2?-.12*u:.04*u,1+(variant===2?.18:.04)*Math.sin(Math.PI*u));
       // Speed lines peel off the attacker's back edge once it is really moving; they streak opposite to the dash and die fast.
       if(fx&&u>.3)for(let i=0;i<2;i++){const side=rand(-CH*.4,CH*.4);fx.spawn({x:px+CW/2-dx/distance*CW*.3-dy/distance*side,y:py+CH/2-dy/distance*CH*.3+dx/distance*side,vx:-dx/distance*rand(260,520),vy:-dy/distance*rand(260,520),drag:6,life:rand(.14,.24),size:rand(2,3.2),size1:.6,shape:'spark',color:pick(['#fff3d0','#ffe1a8','#ffffff']),alpha:.75,fadeIn:.05,fadeOut:.5});}
      });
      el?.classList.remove('is-dashing');
      // Presentation-only hit-stop; authoritative damage events follow in order.
      await pause(reduced?1:50);
     }else if(event.kind==='HUMILIATE'||event.kind==='BAIT'){
      const source=event.sourceId?tiles.current.get(event.sourceId):null;
      const target=event.targetId?tiles.current.get(event.targetId):null;
      const effect=event.kind==='BAIT'?'is-baiting':'is-shouting';
      source?.classList.add(effect);
      target?.classList.add('is-startled');
      await pause(reduced?8:ms*.6);
      if(cancelled)return;
      await commit(list.map(p=>p.minion.id===event.targetId?{...p,minion:{...p.minion,attack:event.attack??p.minion.attack,health:event.remainingHealth??p.minion.health}}:p));
      target?.classList.remove('is-debuff');
      if(target){void target.offsetWidth;target.classList.add('is-debuff');}
      await pause(reduced?8:ms*.4);
      source?.classList.remove(effect);
      target?.classList.remove('is-startled');
     }else if(event.kind==='DAMAGE'||event.kind==='CLEAVE_DAMAGE'){
      if(event.targetId&&event.remainingHealth!==undefined){
       paintHit(event);await commit([...piecesRef.current]);
      }
      await pause(ms);
     }else if(event.kind==='STATS'){
      if(event.targetId){
       const tile=tiles.current.get(event.targetId);
       const previous=list.find(p=>p.minion.id===event.targetId)?.minion;
       const decreased=previous&&((event.attack??previous.attack)<previous.attack||(event.remainingHealth??previous.health)<previous.health);
       if(tile&&!reduced&&rate.current<100)playBuffFx(tile,decreased?'debuff':event.sourceId?'card':'ability',{rate:rate.current});
       await commit(list.map(p=>p.minion.id===event.targetId?{...p,minion:{...p.minion,attack:event.attack??p.minion.attack,health:event.remainingHealth??p.minion.health,keywords:event.keywords??p.minion.keywords}}:p));
      }
      await pause(ms);
     }else if(event.kind==='DIVINE_SHIELD_POP'){
      paintHit(event);await commit([...piecesRef.current]);
      await pause(ms);
     }else if(event.kind==='DEATH'){
      // A death batch (both duelists, a cleave) falls together, only once every card stands home.
      const batch=[event];
      while(combat.events[i+1]?.kind==='DEATH')batch.push(combat.events[++i]!);
      const ids=batch.map(e=>e.targetId).filter((id):id is string=>!!id);
      if(ids.length){
       audioManager.play('ab_death');
       if(rate.current<100)playMinionVoice(list.find(p=>p.minion.id===ids[0])?.minion.cardId??'','death');
       for(const id of ids){const at=home(list,id);graves.set(id,{x:at.x+CW/2,y:at.y+CH*.45});dust({x:at.x+CW/2,y:at.y+CH*.55},4);}
       for(const side of new Set(ids.map(id=>list.find(p=>p.minion.id===id)?.side))){
        const heroEl=field.current?.querySelector<HTMLElement>(side===0?'.ab-combat-foe .ab-hero-face':'.ab-combat-me .ab-hero-face');
        if(heroEl&&!reduced&&rate.current<100)animate(heroEl,[{translate:'0 0',rotate:'0deg'},{translate:'-4px 2px',rotate:'-2deg',offset:.3},{translate:'3px 0',rotate:'1.5deg',offset:.65},{translate:'0 0',rotate:'0deg'}],300);
       }
       await Promise.all(batch.map(e=>{const el=e.targetId?tiles.current.get(e.targetId):undefined;return el?rip(el,e.id):Promise.resolve();}));
       const next=list.filter(p=>!ids.includes(p.minion.id));
       await commit(next);restack(next);await pause(reduced?0:80*budget);
      }
     }else if(event.kind==='SUMMON'&&event.minion){
      const born:AbMinion={...event.minion,kind:'minion',maxHealth:event.minion.health};
      const side=born.owner===topOwner?0:1;
      const next=[...list];
      const rowIdx=next.findIndex(p=>p.side===side);
      const same=next.filter(p=>p.side===side);
      const at=Math.max(0,Math.min(same.length,event.index??same.length));
      let seen=0,insert=next.length;
      for(let i=0;i<next.length;i++){if(next[i]!.side!==side)continue;if(seen===at){insert=i;break;}seen++;}
      if(rowIdx<0)next.push({minion:born,side});else next.splice(insert,0,{minion:born,side});
      audioManager.play('ab_summon');await commit(next);restack(next);
      const bornEl=tiles.current.get(born.id);
      const fromReborn=rebornOwner===born.owner;
      if(fromReborn)rebornOwner='';
      if(bornEl&&!reduced&&rate.current<100&&fromReborn){
       // Reborn: the pieces of the fallen minion fly back together and fuse with a cold flash.
       const face=bornEl.querySelector<HTMLElement>('.ab-combat-face');
       if(face){
        face.style.visibility='hidden';
        const cuts=['polygon(0 0,50% 0,42% 30%,0 40%)','polygon(50% 0,100% 0,100% 35%,42% 30%)','polygon(0 40%,42% 30%,55% 60%,0 70%)','polygon(42% 30%,100% 35%,100% 65%,55% 60%)','polygon(0 70%,55% 60%,45% 100%,0 100%)','polygon(55% 60%,100% 65%,100% 100%,45% 100%)'];
        const pieces=cuts.map((cut,i)=>{const piece=document.createElement('div');piece.className='ab-combat-shard is-reborn';piece.style.clipPath=cut;piece.append(...[...face.childNodes].map(node=>node.cloneNode(true)));bornEl.append(piece);
         const dx=(i%2?1:-1)*(40+Math.random()*70),dy=60+Math.random()*80,rot=(Math.random()-.5)*90;
         return animate(piece,[{transform:`translate(${dx}px,${dy}px) rotate(${rot}deg)`,opacity:0,filter:'brightness(1.8) drop-shadow(0 0 10px #62d8ff)'},{opacity:1,offset:.3},{transform:'translate(0,0) rotate(0)',opacity:1,filter:'brightness(1.2) drop-shadow(0 0 6px #62d8ff)'}],620+i*40);});
        await Promise.all(pieces.map(a=>a.finished)).catch(()=>{});
        pieces.forEach(a=>{const el=(a.effect as KeyframeEffect|null)?.target as HTMLElement|null;el?.remove();});
        bornEl.querySelectorAll('.ab-combat-shard.is-reborn').forEach(el=>el.remove());
        face.style.visibility='';
        animate(bornEl,[{filter:'brightness(2.4) drop-shadow(0 0 28px #9ef0ff)'},{filter:'none'}],520);
        audioManager.play('ab_reborn');
       }
      }else if(bornEl&&!reduced&&rate.current<100){
       animate(bornEl.querySelector<HTMLElement>('.ab-combat-flip')??bornEl,[{transform:'translateY(70px) scale(.6)',clipPath:'inset(70% -24px -24px -24px)',filter:'brightness(.4)'},{transform:'translateY(-12px) scale(1.05)',clipPath:'inset(-24px)',filter:'brightness(1.6)',offset:.7},{transform:'none',clipPath:'inset(-24px)',filter:'none'}],460);
       const dust=document.createElement('i');dust.className='ab-combat-dust';bornEl.append(dust);animate(dust,[{transform:'translate(-50%,0) scale(.5)',opacity:.9},{transform:'translate(-50%,-14px) scale(1.9)',opacity:0}],520).onfinish=()=>dust.remove();
      }
      await pause(fromReborn?ms*.45:ms);
     }else if(event.kind==='PLAYER_DAMAGE'){
      if(event.targetId){
       const id=event.targetId;
       const winnerId=combat.summary.winnerId;
       const striker=field.current?.querySelector<HTMLElement>(winnerId===meId?'.ab-combat-me .ab-hero-face':'.ab-combat-foe .ab-hero-face');
       const victim=field.current?.querySelector<HTMLElement>(id===meId?'.ab-combat-me .ab-hero-face':'.ab-combat-foe .ab-hero-face');
       const amount=event.amount??0;
       // Free punch shares the same wind→hit→recoil beats as a bought slam (see HitEffectPreview).
       const slam=(winnerId&&amount>0?players.find(p=>p.sessionId===winnerId)?.slam:'')??'';
       const strike=HIT_EFFECTS[slam]?STRIKES[HIT_EFFECTS[slam]!.motion]:STRIKES.punch;
       if(winnerId&&amount>0){
         await pause(reduced?8:560*budget);
        // Hearthstone maths on screen: the tally opens at the winner's tavern tier, then each survivor's tier flies in.
        const tier=players.find(p=>p.sessionId===winnerId)?.tavernTier??1;
        const survivors=piecesRef.current.filter(p=>p.side===(winnerId===topOwner?0:1));
        let total=Math.min(amount,tier);
        setTally({id:winnerId,amount:total});
        await pause(reduced?8:520*budget);
        const flyMs=Math.min(720,2600/Math.max(1,survivors.length));
        for(const s of survivors){
         if(cancelled)return;
         await flyTier(s.minion.id,s.minion.tavernTier,flyMs*budget);
         total=Math.min(amount,total+s.minion.tavernTier);
         setTally({id:winnerId,amount:total});
         await pause(reduced?8:220*budget);
        }
        setTally({id:winnerId,amount});
         await pause(reduced?8:780*budget);
        if(striker&&victim&&!reduced){
         const a=striker.getBoundingClientRect(),b=victim.getBoundingClientRect();
         const scale=field.current!.getBoundingClientRect().height/field.current!.offsetHeight;
         const dy=(b.y+b.height/2-a.y-a.height/2)/scale;
         const sign=combat.turn%2?1:-1;
         if(slam){striker.dataset.slamLive=slam;playSlamWindup(slam);}
         striker.style.zIndex='20';
         // Portraits face each other vertically here, so a hop's height becomes a sideways arc — damp it.
         const sideK=HIT_EFFECTS[slam]&&['crush','bounce'].includes(HIT_EFFECTS[slam]!.motion)?.45:1;
         // Wind-up + strike (contact on the last frame).
         await pause(strike.approachMs*budget,u=>{const q=strike.pose(u,sign);striker.style.translate=`${q.side*sideK}px ${dy*q.ax}px`;striker.style.rotate=`${q.r}deg`;striker.style.scale=String(q.s);striker.style.opacity=q.alpha==null?'':String(q.alpha);});
         // Ranged styles: the shot crosses the field and the impact waits for it to land.
         const range=HIT_EFFECTS[slam]?.range;
         if(range&&field.current&&rate.current<100&&!cancelled){const shot=playProjectile(field.current,striker,victim,range,{rate:rate.current});shotRef.current=shot;await shot;shotRef.current=undefined;}
        }
       }
       if(cancelled)return;
       // Hit: stamp + HP drop as contact lands — before recoil — so the number is already up in the recoil phase.
       setHeroVitals(prev=>({...prev,[id]:{health:event.remainingHealth??prev[id]?.health??0,damage:event.amount??0}}));
       if(event.remainingHealth!==undefined)heroHealth.current?.(id,event.remainingHealth);
       await paint();
       const heroEl=field.current?.querySelector<HTMLElement>(id===meId?'.ab-combat-me':'.ab-combat-foe');
       const slamFx=slam&&victim&&!reduced&&rate.current<100?playHitEffect(victim,slam,{rate:rate.current,dir:{x:(combat.turn%2?1:-1)*.35,y:winnerId===meId?-1:1}}):undefined;
       slamRef.current=slamFx;if(slamFx)playSlamSound(slam);
       if(heroEl&&!reduced&&rate.current<100&&!slamFx){
        const k=Math.min(1,amount/12);
        animate(victim??heroEl,[{translate:'0 0',rotate:'0deg'},{translate:`${-6-10*k}px ${8+10*k}px`,rotate:`${-3-3*k}deg`,offset:.2},{translate:`${6+10*k}px ${-4*k}px`,rotate:`${3+2*k}deg`,offset:.45},{translate:`${-3-4*k}px ${3*k}px`,rotate:'-1deg',offset:.7},{translate:'0 0',rotate:'0deg'}],320+200*k);
       }
       audioManager.play('ab_hit_hero');if(heroEl)burst(heroEl,amount,undefined,undefined,true);
       // Same beat as HitEffectPreview: impact reads, then recoil retreats home.
       await pause(reduced?8:120*budget);
       if(striker){
        const [x=0,y=0]=striker.style.translate.split(' ').map(v=>parseFloat(v)||0);
        let r=(parseFloat(striker.style.rotate)||0)%360;if(r>180)r-=360;
        const s=(parseFloat(striker.style.scale)||1)-1;
        await pause(reduced?8:strike.retreatMs*budget,u=>{const e=1-(1-u)**3;striker.style.translate=`${x*(1-e)}px ${y*(1-e)}px`;striker.style.rotate=`${r*(1-e)}deg`;striker.style.scale=String(1+s*(1-e));});
        striker.style.translate='';striker.style.rotate='';striker.style.scale='';striker.style.zIndex='';striker.style.opacity='';delete striker.dataset.slamLive;
       }
       // Stance: hold the stamp readable; lethal shatter only then.
       await pause(reduced?8:720*budget);
       if(heroEl&&(event.remainingHealth??1)<=0&&!reduced&&rate.current<100){
        const img=heroEl.querySelector<HTMLElement>('.ab-combat-hero-image');
        if(img){
         const cuts=['polygon(0 0,55% 0,45% 35%,0 45%)','polygon(55% 0,100% 0,100% 40%,45% 35%)','polygon(0 45%,45% 35%,58% 65%,0 72%)','polygon(45% 35%,100% 40%,100% 70%,58% 65%)','polygon(0 72%,58% 65%,50% 100%,0 100%)','polygon(58% 65%,100% 70%,100% 100%,50% 100%)'];
         const box=img.getBoundingClientRect(),base=heroEl.getBoundingClientRect(),z=base.width/heroEl.offsetWidth||1;
         const shardMs=700+cuts.length*50;
         cuts.forEach((cut,i)=>{const piece=img.cloneNode(true) as HTMLElement;piece.className='ab-combat-hero-shard';piece.style.cssText=`position:absolute;left:${(box.left-base.left)/z}px;top:${(box.top-base.top)/z}px;width:${box.width/z}px;height:${box.height/z}px;clip-path:${cut};margin:0;pointer-events:none;z-index:8`;heroEl.appendChild(piece);
          const dx=(i%2?1:-1)*(30+Math.random()*70),rot=(Math.random()-.5)*80;
          animate(piece,[{transform:'translate(0,0) rotate(0)',opacity:1},{transform:`translate(${dx*.4}px,${-12-Math.random()*24}px) rotate(${rot*.3}deg)`,opacity:1,offset:.25},{transform:`translate(${dx}px,${140+Math.random()*80}px) rotate(${rot}deg)`,opacity:0}],700+i*50,{fill:'forwards'}).onfinish=()=>piece.remove();});
         img.style.visibility='hidden';
         audioManager.play('ab_death');
         await pause(shardMs*budget);
        }
       }
        setTally(null);await pause(reduced?8:380*budget);
      }
     }else if(event.kind==='DEATHRATTLE'||event.kind==='REBORN'){
      if(event.kind==='REBORN')rebornOwner=event.owner??'';
      if(event.kind==='DEATHRATTLE'){
       if(!(event.sourceId&&rattled.has(event.sourceId))){
        if(event.sourceId)rattled.add(event.sourceId);
        audioManager.play('ab_deathrattle');
        await deathrattleBurst((event.sourceId&&graves.get(event.sourceId))||{x:W/2,y:H/2});
       }
      }
      else{setBanner(t('abReborn',{defaultValue:i18n.language.startsWith('ru')?'Возрождение':'Reborn'}));await pause(ms);setBanner('');}
     }
    }
    await settleHits();
    if(cancelled)return;
    const outcome=combat.summary.tie?'draw':combat.summary.winnerId===meId?'win':'loss';
    audioManager.play(outcome==='win'?'coins_win':'card_place');
    setResult(outcome);
    // The result must remain readable even after Skip or with reduced motion.
    await new Promise<void>(resolve=>setTimeout(resolve,AUTO_BATTLER.RESULT_STAMP_MS));
    setSettled(true);
    // Always wait for the server to leave COMBAT — otherwise a short fight skips the recruit stamp.
    while(!cancelled&&!transition.current.phaseReady)await new Promise<void>(resolve=>setTimeout(resolve,100));
    if(cancelled)return;
    rate.current=1;
    if(transition.current.recruitAfter){
     setResult(null);setSettled(false);
     setRecruit(true);await pause(reduced?100:700);
     if(!cancelled)setLeaving(true);
     await pause(reduced?20:320);
    }
    // Flush the final presentation once, including when Skip consumes the queue
    // synchronously. No simulation or network state is changed here.
    await new Promise<void>(resolve=>tick(()=>tick(()=>resolve())));
    if(!cancelled)done.current();
   }catch(error){if(!cancelled){console.error('Combat presentation failed',error);setFailed(true);}}
  })();
  return()=>{
   cancelled=true;
   document.removeEventListener('visibilitychange',onVisible);
   window.removeEventListener('ab-combat-rate',onRate);
   effects.forEach(animation=>animation.cancel());
   field.current?.querySelectorAll('.ab-combat-pop,.ab-tier-fly,.ab-combat-shard,.ab-combat-dust,.ab-combat-dust-puff,.ab-combat-drop,.ab-combat-chip,.ab-combat-spark,.ab-combat-splat,.ab-combat-mist,.ab-combat-shine,.ab-combat-veil,.ab-combat-slash,.ab-combat-hero-shard,.ab-combat-skull,.ab-combat-bone,.hfx').forEach(el=>el.remove());slamRef.current?.cancel();shotRef.current?.cancel();trailRef.current?.destroy();trailRef.current=undefined;
   field.current?.querySelectorAll<HTMLElement>('.ab-combat-hero-image,.ab-combat-face').forEach(el=>{el.style.visibility='';});
   field.current?.classList.remove('is-duel');
   tiles.current.forEach(el=>{el.classList.remove('is-rip','is-hit','is-hp-drop','is-attacking','is-dashing','is-defending','is-poisoned','is-thinking','is-targeted','is-buff-card','is-buff-ability','is-buff-power','is-shouting','is-baiting','is-startled','is-debuff','is-shield-breaking');el.style.transform='';el.style.opacity='';});
   field.current?.querySelectorAll<HTMLElement>('.ab-combat-me,.ab-combat-foe,.ab-combat-me .ab-hero-face,.ab-combat-foe .ab-hero-face').forEach(el=>{el.style.translate='';el.style.rotate='';el.style.scale='';el.style.zIndex='';});
   if(field.current){field.current.style.transform='';field.current.style.transformOrigin='';}
  };
 },[combat,boards,meId,catalog,mineA,topOwner,foe?.displayName,t]);

 return <div className={`ab-combat-wrap ${waiting ? 'is-settled' : ''}`} data-testid="ab-combat">
  {failed?<div className="ab-combat-fallback"><h2>{t('abCombat')}</h2><p>{combat.summary.tie?t('draw'):combat.summary.winnerId===meId?t('win'):t('loss')}</p><button onClick={onDone}>{t('done')}</button></div>:
  <div ref={field} className="ab-combat">
   {[{player:foe,cls:'ab-combat-foe'},{player:mine,cls:'ab-combat-me'}].map(({player,cls})=>player&&<div key={player.sessionId} className={cls+(heroVitals[player.sessionId]?.health<=0?' is-lethal':'')} data-testid={cls}>
    <div className="ab-hero-face" data-skin={player.skin} data-aura={player.aura||undefined}>
    <AbHeroFace className="ab-combat-hero-image" id={player.heroId} art={catalog.heroes.find(h => h.id === player.heroId)?.art} /><Aura id={player.aura} skin={player.skin} />
    <span className="ab-combat-hero-vitals ab-hero-health" aria-label={`${t('health')}: ${heroVitals[player.sessionId]?.health}`}><HeartIcon /><span>{heroVitals[player.sessionId]?.health}</span></span>
    </div>
    <div className="ab-hero-vitals"><strong>{combat.ghost&&player===foe?t('abGhost')+' ':''}<PlayerName fx={player.nameFx} name={player.displayName} /></strong></div>
    <HeroPowerTooltip power={player.power} catalog={catalog} combat className="ab-hero-power-anchor ab-combat-power-anchor">
    <div className="ab-power" tabIndex={0} aria-label={t('abPower')}>
      <b>{abCopyName(catalog.copy,'powers',player.power.id,i18n.language,t(`abPower_${player.power.id}`,{defaultValue:t('abPower')}))}</b>
      <span>{player.power.isPassive?t('abPassive'):`${player.power.goldCost}`}</span>
    </div>
    </HeroPowerTooltip>
    {!!heroVitals[player.sessionId]?.damage&&<b className="ab-combat-hero-damage">-{heroVitals[player.sessionId]?.damage}</b>}
    {player===foe&&foeHand>0&&<div className="ab-combat-hand" data-testid="ab-combat-hand" data-count={foeHand} aria-label={`${t('handLabel')} ${foeHand}`}>{Array.from({length:foeHand},(_,i)=><i key={i} className="ab-combat-hand-card" style={{'--i':i,'--k':i-(foeHand-1)/2,zIndex:i} as CSSProperties}><CardBackFace id={foe?.cardBack} shape="card" live={false} /></i>)}</div>}
   </div>)}
   {tally&&<b className={`ab-hero-tally ${tally.id===meId?'is-mine':'is-foe'}`} data-testid="ab-hero-tally">⚔ {tally.amount}</b>}
   {banner&&<p className="ab-combat-banner">{banner}</p>}
   {pieces.map(piece=>{
    const p=homeOf(pieces,piece.minion.id);
    const enemyIndex=piece.side===0?pieces.filter(q=>q.side===0).findIndex(q=>q.minion.id===piece.minion.id):-1;
    return <div key={piece.minion.id} className={`ab-combat-card ${facedown.has(piece.minion.id)?'is-down':''} ${revealing&&piece.side===0?'is-reveal':''}`}
      ref={el=>{if(el)tiles.current.set(piece.minion.id,el);else tiles.current.delete(piece.minion.id);}}
      style={{left:`${(p.x/W)*100}%`,top:`${(p.y/H)*100}%`,'--idle-phase':`${(-idlePhase(piece.minion.id)*3.4).toFixed(2)}s`,'--reveal-delay':`${Math.max(0,enemyIndex)*70}ms`} as CSSProperties}>
     <div className="ab-combat-flip">
      <div className="ab-combat-face"><MinionTile minion={piece.minion} catalog={catalog} disabled arrive={false} /></div>
      <div className="ab-combat-back" aria-hidden>{piece.side===0&&<CardBackFace id={foe?.cardBack} shape="oval" live={facedown.has(piece.minion.id)||(revealing&&piece.side===0)} />}</div>
     </div>
    </div>;
   })}
  </div>}
  {settled&&!phaseReady&&<p className="ab-combat-wait" role="status">{t('abCombatWaiting')}</p>}
  {result&&<div className={`ab-result-stamp is-${result}${leaving?' is-leave':''}`} data-testid="ab-result-stamp" role="status"><b>{result==='win'?t('win'):result==='loss'?t('loss'):t('draw')}</b></div>}
  {recruit&&<div className={`ab-recruit-stamp${leaving?' is-leave':''}`} data-testid="ab-recruit-stamp" role="status"><b>{t('abRecruitStamp')}</b></div>}
 </div>;
}

function homeOf(list: Piece[], id: string) {
 const piece=list.find(p=>p.minion.id===id);if(!piece)return {x:0,y:0};
 const row=list.filter(p=>p.side===piece.side);
 const i=row.findIndex(p=>p.minion.id===id);
 return {x:combatRowXs(row.length,W)[i]??0,y:piece.side===0?AB_LAYOUT.COMBAT_ENEMY_Y:AB_LAYOUT.COMBAT_PLAYER_Y};
}
