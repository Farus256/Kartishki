import { useEffect, useRef, useState } from 'react';
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

type Props = { combat: CombatEventsMessage; boards: AbCombatBoards; meId: string; catalog: AutoBattlerCatalog; players: AbPlayer[]; pairing?: { playerA: string; playerB: string }[]; initialHeroes?: AbPlayer[]; waiting?: boolean; recruitAfter?: boolean; phaseReady?: boolean; onDone: () => void; /** Fires when a hero hit lands on screen, so standings drop in sync with the stamp. */ onHeroHealth?: (sessionId: string, health: number) => void };
type Piece = { minion: AbMinion; side: 0 | 1 };
const W=AB_LAYOUT.COMBAT_W,H=AB_LAYOUT.COMBAT_H,CW=AB_LAYOUT.MINION_W,CH=AB_LAYOUT.MINION_H;
const weight=(e:CombatEvent)=>['ATTACK','HUMILIATE','BAIT'].includes(e.kind)?1900:e.kind==='DEATH'?440:e.kind==='SUMMON'?520:['DEATHRATTLE','REBORN'].includes(e.kind)?600:e.kind==='PLAYER_DAMAGE'?2400:e.kind==='STATS'?420:180;

/** HTML cards match the tavern tile. Pixi is not used for combat minions. */
export function CombatPlayback({combat,boards,meId,catalog,players,pairing=[],initialHeroes,waiting=false,recruitAfter=true,phaseReady=true,onDone,onHeroHealth}:Props){
 const otherFights=pairing.length>1;
 const done=useRef(onDone);done.current=onDone;
 const heroHealth=useRef(onHeroHealth);heroHealth.current=onHeroHealth;
 const transition=useRef({phaseReady,recruitAfter,otherFights});transition.current={phaseReady,recruitAfter,otherFights};
 const [tally,setTally]=useState<{id:string;amount:number}|null>(null);
 const [settled,setSettled]=useState(false);
 const rate=useRef(1);const field=useRef<HTMLDivElement>(null);const tiles=useRef(new Map<string, HTMLDivElement>());
 const piecesRef=useRef<Piece[]>([]);
 const [heroVitals,setHeroVitals]=useState(() => Object.fromEntries((initialHeroes ?? players).map(p=>[p.sessionId,{health:p.health,damage:0}])));
 const [speed,setSpeed]=useState(1);const [failed,setFailed]=useState(false);
 const [pieces,setPieces]=useState<Piece[]>([]);const [facedown,setFacedown]=useState<Set<string>>(new Set());
 const [banner,setBanner]=useState('VS');const [result,setResult]=useState<'win'|'loss'|'draw'|null>(null);const [recruit,setRecruit]=useState(false);const [leaving,setLeaving]=useState(false);
 const {t,i18n}=useTranslation();
 const mineA=combat.playerA===meId;const topOwner=mineA?combat.playerB:combat.playerA;
 const foe=players.find(p=>p.sessionId===topOwner);const mine=players.find(p=>p.sessionId===meId);

 useEffect(()=>{
  let cancelled=false;
  const effects=new Set<Animation>();
  const animate=(el:HTMLElement,frames:Keyframe[],duration:number)=>{
   const animation=el.animate(frames,{duration:duration/rate.current,easing:'ease-out'});
   effects.add(animation);animation.finished.then(()=>effects.delete(animation)).catch(()=>{});
   return animation;
  };
  setSettled(false);setTally(null);setBanner('VS');setResult(null);setRecruit(false);setLeaving(false);setFailed(false);
  setHeroVitals(Object.fromEntries((initialHeroes?.length ? initialHeroes : players).map(p=>[p.sessionId,{health:combat.initialHealth?.[p.sessionId] ?? p.health,damage:0}])));
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  // A background tab gets no animation frames and throttled timers, so nobody watches and the
  // server moves on: skip the presentation there instead of leaving a stale combat on screen.
  const tick=(fn:()=>void)=>{if(document.hidden){rate.current=100;queueMicrotask(fn);}else requestAnimationFrame(fn);};
  const pause=(ms:number,step?:(u:number)=>void)=>new Promise<void>(resolve=>{
   if(rate.current>=100){step?.(1);resolve();return;}
   let elapsed=0,last=performance.now();const frame=()=>{if(cancelled){resolve();return;}const now=performance.now();elapsed+=(now-last)*rate.current;last=now;const u=Math.min(1,elapsed/Math.max(1,ms));step?.(u);if(u<1)tick(frame);else resolve();};frame();
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
  const burst=(el:HTMLElement,damage:number,from?:{x:number;y:number},at?:{x:number;y:number})=>{
   if(reduced||cancelled||rate.current>=100||!field.current)return;
   const impact=combatImpact(damage);if(!impact.tier)return;
   field.current.dataset.impactTier=String(impact.tier);
   el.classList.remove('is-hit');void el.offsetWidth;el.classList.add('is-hit');
   // Recoil away from the striker (or straight back when there is none), then settle.
   const dirX=from&&at?Math.sign(at.x-from.x)||0:0,dirY=from&&at?Math.sign(at.y-from.y)||1:1;
   const flip=el.querySelector<HTMLElement>('.ab-combat-flip')??el;
   animate(flip,[{translate:'0 0',rotate:'0deg'},{translate:`${dirX*impact.recoil}px ${dirY*impact.recoil*.6}px`,rotate:`${dirX*-6||4}deg`,offset:.3},{translate:`${dirX*impact.recoil*.35}px ${dirY*impact.recoil*.2}px`,rotate:`${dirX*2}deg`,offset:.7},{translate:'0 0',rotate:'0deg'}],impact.duration+160);
   if(at)blood(at,impact.particles,dirX,dirY);
   if(impact.shake){
    animate(field.current,[{translate:'0 0'},{translate:`${-impact.shake}px ${impact.shake*.55}px`},{translate:`${impact.shake}px ${-impact.shake*.45}px`},{translate:`${-impact.shake*.6}px ${impact.shake*.25}px`},{translate:'0 0'}],impact.duration);
    if(impact.tier>=3){const veil=document.createElement('i');veil.className='ab-combat-veil';field.current.appendChild(veil);window.setTimeout(()=>veil.remove(),420);}
   }
  };
  // Dark-red droplets thrown from the impact point. Removed on finish, ≤ 14 nodes.
  const blood=(at:{x:number;y:number},count:number,dirX:number,dirY:number)=>{
   const host=field.current;if(!host||!count)return;
   const splat=document.createElement('i');splat.className='ab-combat-splat';
   splat.style.left=`${(at.x/W)*100}%`;splat.style.top=`${(at.y/H)*100}%`;host.appendChild(splat);
   animate(splat,[{transform:'translate(-50%,-50%) scale(.3) rotate(0deg)',opacity:.9},{transform:`translate(-50%,-50%) scale(1.3) rotate(${Math.random()*60-30}deg)`,opacity:0}],520).onfinish=()=>splat.remove();
   for(let i=0;i<count;i++){
    const drop=document.createElement('i');drop.className='ab-combat-drop';
    drop.style.left=`${(at.x/W)*100}%`;drop.style.top=`${(at.y/H)*100}%`;host.appendChild(drop);
    const ang=Math.atan2(dirY,dirX||(Math.random()-.5))+(Math.random()-.5)*2.2,dist=30+Math.random()*70;
    animate(drop,[{transform:'translate(0,0) scale(1)',opacity:1},{transform:`translate(${Math.cos(ang)*dist}px,${Math.sin(ang)*dist+40}px) scale(.3)`,opacity:0}],380+Math.random()*220).onfinish=()=>drop.remove();
   }
  };
  const pop=(id:string,amount:number)=>{
   const el=tiles.current.get(id);
   const at=el?{x:parseFloat(el.style.left)*W/100,y:parseFloat(el.style.top)*H/100}:home(piecesRef.current,id);
   const node=document.createElement('b');node.className='ab-combat-pop';node.textContent=`${amount}`;
   node.style.left=`${((at.x+CW/2)/W)*100}%`;node.style.top=`${((at.y+CH*0.38)/H)*100}%`;
   field.current?.appendChild(node);window.setTimeout(()=>node.remove(),900);
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
   piece.minion={...piece.minion,health:event.remainingHealth};
   const tile=tiles.current.get(event.targetId);
   const src=event.sourceId?tileCenter(event.sourceId):undefined,dst=tileCenter(event.targetId);
   if(tile)burst(tile,event.amount??0,src,dst);
   if(tile&&poison&&lethal&&dst)mist(tile,dst);
   if(!reduced&&rate.current<100)audioManager.play((event.amount??0)>=5?'ab_hit_heavy':'ab_hit_light');
   if(event.amount)pop(event.targetId,event.amount);
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
   const shard=(cut:string)=>{const piece=document.createElement('div');piece.className='ab-combat-shard';piece.style.clipPath=cut;piece.innerHTML=face.innerHTML;el.append(piece);return piece;};
   const puff=(ms:number)=>{const dust=document.createElement('i');dust.className='ab-combat-dust';el.append(dust);animate(dust,[{transform:'translate(-50%,0) scale(.4)',opacity:.8},{transform:'translate(-50%,-20px) scale(1.8)',opacity:0}],ms);};
   el.classList.add('is-rip');
   const style=eventId%13===0?'snap':(['crumble','vertical','horizontal'] as const)[eventId%3]!;
   el.dataset.deathStyle=style;
   if(style==='snap'){
    // Thanos: the face dissolves into a 4×4 grid of flakes that drift up and away.
    const n=4;
    for(let y=0;y<n;y++)for(let x=0;x<n;x++){
     const piece=shard(`inset(${y*100/n}% ${100-(x+1)*100/n}% ${100-(y+1)*100/n}% ${x*100/n}%)`);
     const delay=(x+y)*45+Math.random()*60,drift=40+Math.random()*90;
     animate(piece,[{transform:'translate(0,0) rotate(0)',opacity:1,filter:'none'},{transform:`translate(${drift*.4}px,${-drift*.3}px) rotate(${(Math.random()-.5)*30}deg)`,opacity:.9,filter:'brightness(1.6)',offset:.35},{transform:`translate(${drift+40}px,${-drift-30}px) rotate(${(Math.random()-.5)*90}deg) scale(.4)`,opacity:0,filter:'brightness(2) blur(2px)'}],700+delay);
     piece.style.animationDelay=`${delay}ms`;
    }
    audioManager.play('ab_windfury');
    await pause(900);
    return;
   }
   if(style==='vertical'||style==='horizontal'){
    const v=style==='vertical';
    const a=shard(v?'polygon(0 0,52% 0,46% 30%,54% 55%,47% 100%,0 100%)':'polygon(0 0,100% 0,100% 48%,70% 53%,40% 46%,0 52%)');
    const b=shard(v?'polygon(52% 0,100% 0,100% 100%,47% 100%,54% 55%,46% 30%)':'polygon(0 52%,40% 46%,70% 53%,100% 48%,100% 100%,0 100%)');
    const flash=document.createElement('i');flash.className='ab-combat-slash'+(v?' is-vertical':' is-horizontal');el.append(flash);
    animate(flash,[{opacity:1,transform:v?'scaleY(.2)':'scaleX(.2)'},{opacity:0,transform:'scale(1.1)'}],320).onfinish=()=>flash.remove();
    animate(a,[{transform:'translate(0,0) rotate(0)',opacity:1},{transform:v?'translate(-70px,90px) rotate(-38deg)':'translate(-40px,-40px) rotate(-14deg)',opacity:0}],620);
    animate(b,[{transform:'translate(0,0) rotate(0)',opacity:1},{transform:v?'translate(70px,100px) rotate(34deg)':'translate(40px,120px) rotate(16deg)',opacity:0}],640);
    puff(600);
    await pause(560);
    return;
   }
   const cuts=[
    'polygon(0 0,50% 0,42% 30%,0 40%)','polygon(50% 0,100% 0,100% 35%,42% 30%)','polygon(0 40%,42% 30%,55% 60%,0 70%)',
    'polygon(42% 30%,100% 35%,100% 65%,55% 60%)','polygon(0 70%,55% 60%,45% 100%,0 100%)','polygon(55% 60%,100% 65%,100% 100%,45% 100%)',
   ];
   cuts.forEach((cut,i)=>{
    const piece=shard(cut);
    const dx=(i%2?1:-1)*(20+Math.random()*60),rot=(Math.random()-.5)*70;
    animate(piece,[{transform:'translate(0,0) rotate(0)',opacity:1},{transform:`translate(${dx*.4}px,${-10-Math.random()*20}px) rotate(${rot*.3}deg)`,opacity:1,offset:.25},{transform:`translate(${dx}px,${110+Math.random()*60}px) rotate(${rot}deg)`,opacity:0}],560+i*40);
   });
   puff(620);
   await pause(560);
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
    await pause(reduced?8:520);
    if(cancelled)return;
    setFacedown(new Set());
    await pause(reduced?8:860);
    setBanner('');
    let attacker:string|null=null;
    let struck=false;
    let rebornOwner='';
    const returnAttacker=async()=>{
     if(!attacker)return;
     const id=attacker,el=tiles.current.get(id),at=home(piecesRef.current,id);
     if(el && (piecesRef.current.find(p=>p.minion.id===id)?.minion.health??0)>0){const x=parseFloat(el.style.left)*W/100,y=parseFloat(el.style.top)*H/100;
      await pause(reduced?1:300*budget,u=>{const ease=1-(1-u)**3;place(id,x+(at.x-x)*ease,y+(at.y-y)*ease);});
      el.classList.remove('is-attacking');place(id,at.x,at.y);
     }
     tiles.current.get(id)?.classList.remove('is-attacking');
     field.current?.classList.remove('is-duel');tiles.current.forEach(t=>t.classList.remove('is-defending'));
     attacker=null;
    };
    for(let i=0;i<combat.events.length;i++){
     const event=combat.events[i]!;
     if(field.current)field.current.dataset.eventId=String(event.id);
     if(cancelled)return;
     if(!['DAMAGE','CLEAVE_DAMAGE','STATS','DIVINE_SHIELD_POP'].includes(event.kind))await returnAttacker();
     const ms=reduced?8:weight(event)*budget;
     const list=piecesRef.current;
     const src=event.sourceId?home(list,event.sourceId):null;const dst=event.targetId?home(list,event.targetId):null;
     if(event.kind==='ATTACK'&&event.sourceId&&event.targetId&&src&&dst){
      if(struck)await pause(reduced?8:820);
      struck=true;
      attacker=event.sourceId;
      const el=tiles.current.get(attacker);el?.classList.add('is-attacking');
      field.current?.classList.add('is-duel');tiles.current.get(event.targetId)?.classList.add('is-defending');
      const dx=dst.x-src.x,dy=dst.y-src.y,distance=Math.max(1,Math.hypot(dx,dy));
      const impact={x:src.x+dx*.78,y:src.y+dy*.78};
      const variant=event.id%3;
      if(el)el.dataset.attackStyle=['thrust','hook','slam'][variant];
      el?.classList.add('is-thinking');
      await pause(reduced?8:70*budget);
      el?.classList.remove('is-thinking');
      tiles.current.get(event.targetId)?.classList.add('is-targeted');
      await pause(reduced?8:40*budget);
      tiles.current.get(event.targetId)?.classList.remove('is-targeted');
      audioManager.play('ab_whoosh');if(rate.current<100)playMinionVoice(list.find(p=>p.minion.id===event.sourceId)?.minion.cardId??'','attack');
      await pause(reduced?1:70*budget,u=>{const coil=1-(1-u)**3;if(!reduced)place(event.sourceId!,src.x-dx/distance*32*coil,src.y-dy/distance*32*coil,variant===1?-.18*coil:variant===2?.06*coil:0,1+.1*coil);});
      await pause(reduced?1:140*budget,u=>{
       const ease=u**4,arc=Math.sin(Math.PI*u)*(variant===1?52:variant===2?-28:0);
       if(!reduced)place(event.sourceId!,src.x-dx/distance*32*(1-ease)+(impact.x-src.x)*ease-dy/distance*arc,src.y-dy/distance*32*(1-ease)+(impact.y-src.y)*ease+dx/distance*arc,variant===1?Math.sin(Math.PI*u)*.22:variant===2?-.12*u:.04*u,1+(variant===2?.18:.04)*Math.sin(Math.PI*u));
      });
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
       tile?.classList.remove('is-buff-card','is-buff-ability','is-buff-power');
       const previous=list.find(p=>p.minion.id===event.targetId)?.minion;
       const decreased=previous&&((event.attack??previous.attack)<previous.attack||(event.remainingHealth??previous.health)<previous.health);
       tile?.classList.remove('is-debuff');
       if(tile){void tile.offsetWidth;tile.classList.add(decreased?'is-debuff':event.sourceId?'is-buff-card':'is-buff-ability');}
       await commit(list.map(p=>p.minion.id===event.targetId?{...p,minion:{...p.minion,attack:event.attack??p.minion.attack,health:event.remainingHealth??p.minion.health}}:p));
      }
      await pause(ms);
     }else if(event.kind==='DIVINE_SHIELD_POP'){
      paintHit(event);await commit([...piecesRef.current]);
      await pause(ms);
     }else if(event.kind==='DEATH'){
      if(event.targetId){
       const el=tiles.current.get(event.targetId);
       audioManager.play('ab_death');
       if(rate.current<100)playMinionVoice(list.find(p=>p.minion.id===event.targetId)?.minion.cardId??'','death');
       if(el)await rip(el,event.id);
       const next=list.filter(p=>p.minion.id!==event.targetId);
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
      if(bornEl&&!reduced&&rate.current<100&&rebornOwner===born.owner){
       // Reborn: the pieces of the fallen minion fly back together and fuse with a cold flash.
       rebornOwner='';
       const face=bornEl.querySelector<HTMLElement>('.ab-combat-face');
       if(face){
        face.style.visibility='hidden';
        const cuts=['polygon(0 0,50% 0,42% 30%,0 40%)','polygon(50% 0,100% 0,100% 35%,42% 30%)','polygon(0 40%,42% 30%,55% 60%,0 70%)','polygon(42% 30%,100% 35%,100% 65%,55% 60%)','polygon(0 70%,55% 60%,45% 100%,0 100%)','polygon(55% 60%,100% 65%,100% 100%,45% 100%)'];
        const pieces=cuts.map((cut,i)=>{const piece=document.createElement('div');piece.className='ab-combat-shard is-reborn';piece.style.clipPath=cut;piece.innerHTML=face.innerHTML;bornEl.append(piece);
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
       animate(bornEl.querySelector<HTMLElement>('.ab-combat-flip')??bornEl,[{transform:'translateY(70px) scale(.6)',clipPath:'inset(70% 0 0 0)',filter:'brightness(.4)'},{transform:'translateY(-12px) scale(1.05)',clipPath:'inset(0 0 0 0)',filter:'brightness(1.6)',offset:.7},{transform:'none',clipPath:'inset(0 0 0 0)',filter:'none'}],460);
       const dust=document.createElement('i');dust.className='ab-combat-dust';bornEl.append(dust);animate(dust,[{transform:'translate(-50%,0) scale(.5)',opacity:.9},{transform:'translate(-50%,-14px) scale(1.9)',opacity:0}],520).onfinish=()=>dust.remove();
      }
      await pause(ms);
     }else if(event.kind==='PLAYER_DAMAGE'){
      if(event.targetId){
       const id=event.targetId;
       const winnerId=combat.summary.winnerId;
       const striker=field.current?.querySelector<HTMLElement>(winnerId===meId?'.ab-combat-me':'.ab-combat-foe');
       const victim=field.current?.querySelector<HTMLElement>(id===meId?'.ab-combat-me':'.ab-combat-foe');
       const amount=event.amount??0;
       if(winnerId&&amount>0){
         await pause(reduced?8:480*budget);
        setTally({id:winnerId,amount:0});
         await pause(reduced?8:1500*budget,u=>setTally({id:winnerId,amount:Math.round(amount*u)}));
         await pause(reduced?8:500*budget);
        if(striker&&victim&&!reduced){
         const a=striker.getBoundingClientRect(),b=victim.getBoundingClientRect();
         const scale=field.current!.getBoundingClientRect().height/field.current!.offsetHeight;
         const dy=(b.y+b.height/2-a.y-a.height/2)/scale;
         striker.style.zIndex='20';
          await pause(360*budget,u=>{striker.style.translate=`0 ${dy*u*u}px`;});
        }
       }
       if(cancelled)return;
       setHeroVitals(prev=>({...prev,[id]:{health:event.remainingHealth??prev[id]?.health??0,damage:event.amount??0}}));
       if(event.remainingHealth!==undefined)heroHealth.current?.(id,event.remainingHealth);
       const heroEl=field.current?.querySelector<HTMLElement>(id===meId?'.ab-combat-me':'.ab-combat-foe');
       if(heroEl&&!reduced&&rate.current<100){
        const k=Math.min(1,amount/12);
        animate(heroEl,[{translate:'0 0',rotate:'0deg'},{translate:`${-6-10*k}px ${8+10*k}px`,rotate:`${-3-3*k}deg`,offset:.2},{translate:`${6+10*k}px ${-4*k}px`,rotate:`${3+2*k}deg`,offset:.45},{translate:`${-3-4*k}px ${3*k}px`,rotate:'-1deg',offset:.7},{translate:'0 0',rotate:'0deg'}],320+200*k);
       }
       audioManager.play('ab_hit_hero');if(heroEl)burst(heroEl,amount);await pause(reduced?8:combatImpact(amount).duration*budget);
       if(striker){
        const y=parseFloat(striker.style.translate.split(' ')[1]??'0')||0;
         await pause(reduced?8:320*budget,u=>{striker.style.translate=`0 ${y*(1-u)}px`;});
        striker.style.translate='';striker.style.zIndex='';
       }
       // Lethal: the portrait breaks apart like a minion.
       if(heroEl&&(event.remainingHealth??1)<=0&&!reduced&&rate.current<100){
        const img=heroEl.querySelector<HTMLElement>('.ab-combat-hero-image');
        if(img){
         const cuts=['polygon(0 0,55% 0,45% 35%,0 45%)','polygon(55% 0,100% 0,100% 40%,45% 35%)','polygon(0 45%,45% 35%,58% 65%,0 72%)','polygon(45% 35%,100% 40%,100% 70%,58% 65%)','polygon(0 72%,58% 65%,50% 100%,0 100%)','polygon(58% 65%,100% 70%,100% 100%,50% 100%)'];
         const box=img.getBoundingClientRect(),base=heroEl.getBoundingClientRect(),z=base.width/heroEl.offsetWidth||1;
         cuts.forEach((cut,i)=>{const piece=img.cloneNode(true) as HTMLElement;piece.className='ab-combat-hero-shard';piece.style.cssText=`position:absolute;left:${(box.left-base.left)/z}px;top:${(box.top-base.top)/z}px;width:${box.width/z}px;height:${box.height/z}px;clip-path:${cut};margin:0;pointer-events:none;z-index:8`;heroEl.appendChild(piece);
          const dx=(i%2?1:-1)*(30+Math.random()*70),rot=(Math.random()-.5)*80;
          animate(piece,[{transform:'translate(0,0) rotate(0)',opacity:1},{transform:`translate(${dx*.4}px,${-12-Math.random()*24}px) rotate(${rot*.3}deg)`,opacity:1,offset:.25},{transform:`translate(${dx}px,${140+Math.random()*80}px) rotate(${rot}deg)`,opacity:0}],700+i*50).onfinish=()=>piece.remove();});
         img.style.visibility='hidden';
         audioManager.play('ab_death');
         await pause(600*budget);
        }
       }
        setTally(null);await pause(reduced?8:300*budget);
      }
     }else if(event.kind==='DEATHRATTLE'||event.kind==='REBORN'){
      if(event.kind==='DEATHRATTLE')audioManager.play('ab_deathrattle');
      if(event.kind==='REBORN')rebornOwner=event.owner??'';
      setBanner(event.kind==='DEATHRATTLE'?t('abDeathrattle'):t('abReborn',{defaultValue:i18n.language.startsWith('ru')?'Возрождение':'Reborn'}));await pause(ms);setBanner('');
     }
    }
    await returnAttacker();
    if(cancelled)return;
    const outcome=combat.summary.tie?'draw':combat.summary.winnerId===meId?'win':'loss';
    audioManager.play(outcome==='win'?'coins_win':'card_place');
    setResult(outcome);
    // The result must remain readable even after Skip or with reduced motion.
    await new Promise<void>(resolve=>setTimeout(resolve,AUTO_BATTLER.RESULT_STAMP_MS));
    setSettled(true);
    // Only park on the result if another pair is still presenting.
    if(transition.current.otherFights){
     while(!cancelled&&!transition.current.phaseReady)await new Promise<void>(resolve=>setTimeout(resolve,100));
     if(cancelled)return;
    }
    rate.current=1;
    if(transition.current.recruitAfter){
     setResult(null);setSettled(false);
     setRecruit(true);await pause(reduced?100:1300);
     if(!cancelled)setLeaving(true);
     await pause(reduced?20:450);
    }
    // Flush the final presentation once, including when Skip consumes the queue
    // synchronously. No simulation or network state is changed here.
    await new Promise<void>(resolve=>tick(()=>tick(()=>resolve())));
    if(!cancelled)done.current();
   }catch(error){if(!cancelled){console.error('Combat presentation failed',error);setFailed(true);}}
  })();
  return()=>{
   cancelled=true;
   effects.forEach(animation=>animation.cancel());
   field.current?.querySelectorAll('.ab-combat-pop,.ab-combat-shard,.ab-combat-dust,.ab-combat-drop,.ab-combat-splat,.ab-combat-mist,.ab-combat-shine,.ab-combat-veil,.ab-combat-slash,.ab-combat-hero-shard').forEach(el=>el.remove());
   field.current?.querySelectorAll<HTMLElement>('.ab-combat-hero-image,.ab-combat-face').forEach(el=>{el.style.visibility='';});
   field.current?.classList.remove('is-duel');
   tiles.current.forEach(el=>{el.classList.remove('is-rip','is-hit','is-attacking','is-defending','is-poisoned','is-thinking','is-targeted','is-buff-card','is-buff-ability','is-buff-power','is-shouting','is-baiting','is-startled','is-debuff','is-shield-breaking');el.style.transform='';el.style.opacity='';});
   field.current?.querySelectorAll<HTMLElement>('.ab-combat-me,.ab-combat-foe').forEach(el=>{el.style.translate='';el.style.zIndex='';});
   if(field.current)field.current.style.transform='';
  };
 },[combat,boards,meId,catalog,mineA,topOwner,foe?.displayName,t]);

 return <div className={`ab-combat-wrap ${waiting ? 'is-settled' : ''}`} data-testid="ab-combat">
  <div className="ab-combat-speed">
   {[1,2].map(n=><button key={n} aria-pressed={speed===n} onClick={()=>{rate.current=n;setSpeed(n);}}>{n}×</button>)}
   <button onClick={()=>{rate.current=100;setSpeed(100);}}>{t('abSkip')}</button>
  </div>
  {failed?<div className="ab-combat-fallback"><h2>{t('abCombat')}</h2><p>{combat.summary.tie?t('draw'):combat.summary.winnerId===meId?t('win'):t('loss')}</p><button onClick={onDone}>{t('done')}</button></div>:
  <div ref={field} className="ab-combat">
   {[{player:foe,cls:'ab-combat-foe'},{player:mine,cls:'ab-combat-me'}].map(({player,cls})=>player&&<div key={player.sessionId} className={cls+(heroVitals[player.sessionId]?.health<=0?' is-lethal':'')} data-testid={cls}>
    <div className="ab-combat-portrait">
    <AbHeroFace className="ab-combat-hero-image" id={player.heroId} art={catalog.heroes.find(h => h.id === player.heroId)?.art} />
    <span className="ab-combat-hero-vitals ab-hero-health" aria-label={`${t('health')}: ${heroVitals[player.sessionId]?.health}`}><HeartIcon /><span>{heroVitals[player.sessionId]?.health}</span></span>
    </div>
    <strong>{combat.ghost&&player===foe?t('abGhost')+' ':''}{player.displayName}</strong>
    <HeroPowerTooltip power={player.power} catalog={catalog} combat className="ab-combat-power-anchor">
    <div className="ab-power" tabIndex={0} aria-label={t('abPower')}>
      <b>{abCopyName(catalog.copy,'powers',player.power.id,i18n.language,t(`abPower_${player.power.id}`,{defaultValue:t('abPower')}))}</b>
      <span>{player.power.isPassive?t('abPassive'):`${player.power.goldCost}`}</span>
    </div>
    </HeroPowerTooltip>
    {!!heroVitals[player.sessionId]?.damage&&<b className="ab-combat-hero-damage">-{heroVitals[player.sessionId]?.damage}</b>}
   </div>)}
   {tally&&<b className={`ab-hero-tally ${tally.id===meId?'is-mine':'is-foe'}`} data-testid="ab-hero-tally">⚔ {tally.amount}</b>}
   {banner&&<p className="ab-combat-banner">{banner}</p>}
   {pieces.map(piece=>{
    const p=homeOf(pieces,piece.minion.id);
    return <div key={piece.minion.id} className={`ab-combat-card ${facedown.has(piece.minion.id)?'is-down':''}`}
      ref={el=>{if(el)tiles.current.set(piece.minion.id,el);else tiles.current.delete(piece.minion.id);}}
      style={{left:`${(p.x/W)*100}%`,top:`${(p.y/H)*100}%`}}>
     <div className="ab-combat-flip">
      <div className="ab-combat-face"><MinionTile minion={piece.minion} catalog={catalog} disabled arrive={false} /></div>
      <div className="ab-combat-back" aria-hidden />
     </div>
    </div>;
   })}
  </div>}
  {settled&&!phaseReady&&otherFights&&<p className="ab-combat-wait" role="status">{t('abCombatWaiting')}</p>}
  {result&&<div className={`ab-result-stamp is-${result}${leaving?' is-leave':''}`} data-testid="ab-result-stamp" role="status"><b>{result==='win'?t('win'):result==='loss'?t('loss'):t('draw')}</b></div>}
  {recruit&&recruitAfter&&<div className={`ab-recruit-stamp${leaving?' is-leave':''}`} data-testid="ab-recruit-stamp" role="status"><b>{t('abRecruitStamp')}</b></div>}
 </div>;
}

function homeOf(list: Piece[], id: string) {
 const piece=list.find(p=>p.minion.id===id);if(!piece)return {x:0,y:0};
 const row=list.filter(p=>p.side===piece.side);
 const i=row.findIndex(p=>p.minion.id===id);
 return {x:combatRowXs(row.length,W)[i]??0,y:piece.side===0?AB_LAYOUT.COMBAT_ENEMY_Y:AB_LAYOUT.COMBAT_PLAYER_Y};
}
