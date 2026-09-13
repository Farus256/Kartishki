import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AutoBattlerCatalog, CombatEvent, CombatEventsMessage } from '@kartishki/shared';
import type { AbCombatBoards, AbMinion, AbPlayer } from '../autoBattlerSession';
import { audioManager } from '../AudioManager';
import { AB_LAYOUT, combatRowXs } from './battlegroundsLayout';
import { AbHeroFace } from './AbHeroFace';
import { MinionTile } from './MinionTile';
import { combatImpact } from './combatImpact';

type Props = { combat: CombatEventsMessage; boards: AbCombatBoards; meId: string; catalog: AutoBattlerCatalog; players: AbPlayer[]; pairing?: { playerA: string; playerB: string }[]; initialHeroes?: AbPlayer[]; waiting?: boolean; recruitAfter?: boolean; phaseReady?: boolean; onDone: () => void };
type Piece = { minion: AbMinion; side: 0 | 1 };
const W=AB_LAYOUT.COMBAT_W,H=AB_LAYOUT.COMBAT_H,CW=AB_LAYOUT.MINION_W,CH=AB_LAYOUT.MINION_H;
const weight=(e:CombatEvent)=>e.kind==='ATTACK'?1600:e.kind==='DEATH'?360:e.kind==='SUMMON'?350:e.kind==='PLAYER_DAMAGE'?2400:e.kind==='STATS'?420:140;

/** HTML cards match the tavern tile. Pixi is not used for combat minions. */
export function CombatPlayback({combat,boards,meId,catalog,players,pairing=[],initialHeroes,waiting=false,recruitAfter=true,phaseReady=true,onDone}:Props){
 const otherFights=pairing.length>1;
 const done=useRef(onDone);done.current=onDone;
 const transition=useRef({phaseReady,recruitAfter,otherFights});transition.current={phaseReady,recruitAfter,otherFights};
 const [tally,setTally]=useState<{id:string;amount:number}|null>(null);
 const [settled,setSettled]=useState(false);
 const rate=useRef(1);const field=useRef<HTMLDivElement>(null);const tiles=useRef(new Map<string, HTMLDivElement>());
 const piecesRef=useRef<Piece[]>([]);
 const [heroVitals,setHeroVitals]=useState(() => Object.fromEntries((initialHeroes ?? players).map(p=>[p.sessionId,{health:p.health,damage:0}])));
 const [speed,setSpeed]=useState(1);const [failed,setFailed]=useState(false);
 const [pieces,setPieces]=useState<Piece[]>([]);const [facedown,setFacedown]=useState<Set<string>>(new Set());
 const [banner,setBanner]=useState('VS');const [result,setResult]=useState<'win'|'loss'|'draw'|null>(null);const [recruit,setRecruit]=useState(false);const [leaving,setLeaving]=useState(false);
 const {t}=useTranslation();
 const mineA=combat.playerA===meId;const topOwner=mineA?combat.playerB:combat.playerA;
 const foe=players.find(p=>p.sessionId===topOwner);const mine=players.find(p=>p.sessionId===meId);

 useEffect(()=>{
  let cancelled=false;
  const effects=new Set<Animation>();
  const animate=(el:HTMLElement,frames:Keyframe[],duration:number)=>{
   const animation=el.animate(frames,{duration:duration/rate.current,easing:'ease-out'});
   effects.add(animation);animation.onfinish=()=>effects.delete(animation);
  };
  setSettled(false);setTally(null);setBanner('VS');setResult(null);setRecruit(false);setLeaving(false);setFailed(false);
  setHeroVitals(Object.fromEntries((initialHeroes ?? players).map(p=>[p.sessionId,{health:p.health,damage:0}])));
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const pause=(ms:number,step?:(u:number)=>void)=>new Promise<void>(resolve=>{
   if(rate.current>=100){step?.(1);resolve();return;}
   let elapsed=0,last=performance.now();const frame=()=>{if(cancelled){resolve();return;}const now=performance.now();elapsed+=(now-last)*rate.current;last=now;const u=Math.min(1,elapsed/Math.max(1,ms));step?.(u);if(u<1)requestAnimationFrame(frame);else resolve();};frame();
  });
  const paint=()=>rate.current>=100?Promise.resolve():new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
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
  const burst=(el:HTMLElement,damage:number)=>{
   if(reduced||cancelled||rate.current>=100||!field.current)return;
   const impact=combatImpact(damage);if(!impact.tier)return;
   field.current.dataset.impactTier=String(impact.tier);
   el.classList.remove('is-hit');void el.offsetWidth;el.classList.add('is-hit');
   animate(field.current,[{translate:'0 0'},{translate:`${-impact.shake}px ${impact.shake*.55}px`},{translate:`${impact.shake}px ${-impact.shake*.45}px`},{translate:`${-impact.shake*.6}px ${impact.shake*.25}px`},{translate:'0 0'}],impact.duration);
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
    if(!reduced&&rate.current<100)tiles.current.get(event.targetId)?.animate([{filter:'brightness(2) drop-shadow(0 0 24px #ffdf80)'},{filter:'none'}],{duration:450/rate.current});
    return;
   }
   if(event.remainingHealth===undefined)return;
   piece.minion={...piece.minion,health:event.remainingHealth};
   const tile=tiles.current.get(event.targetId);
   if(tile)burst(tile,event.amount??0);
   if(event.amount)pop(event.targetId,event.amount);
  };
  async function rip(el:HTMLDivElement){
   if(reduced){el.style.opacity='0';return;}
   const face=el.querySelector('.ab-combat-face');
   if(!face){el.style.opacity='0';return;}
   const left=document.createElement('div');const right=document.createElement('div');
   left.className='ab-combat-shard is-left';right.className='ab-combat-shard is-right';
   left.innerHTML=face.innerHTML;right.innerHTML=face.innerHTML;
   el.classList.add('is-rip');el.append(left,right);
   await pause(reduced?8:560);
  }

  void(async()=>{
   try{
    const enemy=(mineA?boards.b:boards.a).map(minion=>({minion:{...minion},side:0 as const}));
    const ours=(mineA?boards.a:boards.b).map(minion=>({minion:{...minion},side:1 as const}));
    const start=[...enemy,...ours];
    piecesRef.current=start;setPieces(start);setFacedown(new Set(enemy.map(p=>p.minion.id)));
    const budget=Math.max(.65,Math.min(1,(combat.durationMs-5200)/Math.max(1,combat.events.reduce((n,e)=>n+weight(e),0))));
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
    const returnAttacker=async()=>{
     if(!attacker)return;
     const id=attacker,el=tiles.current.get(id),at=home(piecesRef.current,id);
     if(el && (piecesRef.current.find(p=>p.minion.id===id)?.minion.health??0)>0){const x=parseFloat(el.style.left)*W/100,y=parseFloat(el.style.top)*H/100;
      await pause(reduced?1:240*budget,u=>{const ease=1-(1-u)**3;place(id,x+(at.x-x)*ease,y+(at.y-y)*ease);});
      el.classList.remove('is-attacking');place(id,at.x,at.y);
     }attacker=null;
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
      if(struck)await pause(reduced?8:640);
      struck=true;
      attacker=event.sourceId;
      const el=tiles.current.get(attacker);el?.classList.add('is-attacking');
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
      audioManager.play('card_hover');
      await pause(reduced?1:70*budget,u=>{const coil=1-(1-u)**3;if(!reduced)place(event.sourceId!,src.x-dx/distance*32*coil,src.y-dy/distance*32*coil,variant===1?-.18*coil:variant===2?.06*coil:0,1+.1*coil);});
      await pause(reduced?1:95*budget,u=>{
       const ease=u**4,arc=Math.sin(Math.PI*u)*(variant===1?52:variant===2?-28:0);
       if(!reduced)place(event.sourceId!,src.x-dx/distance*32*(1-ease)+(impact.x-src.x)*ease-dy/distance*arc,src.y-dy/distance*32*(1-ease)+(impact.y-src.y)*ease+dx/distance*arc,variant===1?Math.sin(Math.PI*u)*.22:variant===2?-.12*u:.04*u,1+(variant===2?.18:.04)*Math.sin(Math.PI*u));
      });
      audioManager.play('reel_stop');
      // Presentation-only hit-stop; authoritative damage events follow in order.
      await pause(reduced?1:50);
     }else if(event.kind==='DAMAGE'||event.kind==='CLEAVE_DAMAGE'){
      if(event.targetId&&event.remainingHealth!==undefined){
       paintHit(event);await commit([...piecesRef.current]);
      }
      await pause(ms);
     }else if(event.kind==='STATS'){
      if(event.targetId){
       const tile=tiles.current.get(event.targetId);
       tile?.classList.remove('is-buff-card','is-buff-ability','is-buff-power');
       if(tile){void tile.offsetWidth;tile.classList.add(event.sourceId?'is-buff-card':'is-buff-ability');}
       await commit(list.map(p=>p.minion.id===event.targetId?{...p,minion:{...p.minion,attack:event.attack??p.minion.attack,health:event.remainingHealth??p.minion.health}}:p));
      }
      await pause(ms);
     }else if(event.kind==='DIVINE_SHIELD_POP'){
      paintHit(event);await commit([...piecesRef.current]);
      await pause(ms);
     }else if(event.kind==='DEATH'){
      if(event.targetId){
       const el=tiles.current.get(event.targetId);
       audioManager.play('card_remove');
       if(el)await rip(el);
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
      audioManager.play('card_place');await commit(next);restack(next);
      const bornEl=tiles.current.get(born.id);if(bornEl&&!reduced)bornEl.animate([{opacity:0,scale:'.7'},{opacity:1,scale:'1'}],{duration:180/rate.current});
      await pause(ms);
     }else if(event.kind==='PLAYER_DAMAGE'){
      if(event.targetId){
       const id=event.targetId;
       const winnerId=combat.summary.winnerId;
       const striker=field.current?.querySelector<HTMLElement>(winnerId===meId?'.ab-combat-me':'.ab-combat-foe');
       const victim=field.current?.querySelector<HTMLElement>(id===meId?'.ab-combat-me':'.ab-combat-foe');
       const amount=event.amount??0;
       if(winnerId&&amount>0){
        await pause(reduced?8:480);
        setTally({id:winnerId,amount:0});
        await pause(reduced?8:2100,u=>setTally({id:winnerId,amount:Math.round(amount*u)}));
        await pause(reduced?8:820);
        if(striker&&victim&&!reduced){
         const a=striker.getBoundingClientRect(),b=victim.getBoundingClientRect();
         const scale=field.current!.getBoundingClientRect().height/field.current!.offsetHeight;
         const dy=(b.y+b.height/2-a.y-a.height/2)/scale;
         striker.style.zIndex='20';
         await pause(360,u=>{striker.style.translate=`0 ${dy*u*u}px`;});
        }
       }
       if(cancelled)return;
       setHeroVitals(prev=>({...prev,[id]:{health:event.remainingHealth??prev[id]?.health??0,damage:event.amount??0}}));
       const heroEl=field.current?.querySelector<HTMLElement>(id===meId?'.ab-combat-me':'.ab-combat-foe');
       if(heroEl&&!reduced)heroEl.animate([{translate:'0 0'},{translate:'0 10px',rotate:'3deg'},{translate:'0 0'}],{duration:260/rate.current});
       audioManager.play('reel_stop');if(heroEl)burst(heroEl,amount);await pause(reduced?8:combatImpact(amount).duration);
       if(striker){
        const y=parseFloat(striker.style.translate.split(' ')[1]??'0')||0;
        await pause(reduced?8:320,u=>{striker.style.translate=`0 ${y*(1-u)}px`;});
        striker.style.translate='';striker.style.zIndex='';
       }
       setTally(null);await pause(reduced?8:550);
      }
     }else if(event.kind==='DEATHRATTLE'){setBanner(t('abDeathrattle'));await pause(ms);setBanner('');}
    }
    await returnAttacker();
    if(cancelled)return;
    const outcome=combat.summary.tie?'draw':combat.summary.winnerId===meId?'win':'loss';
    audioManager.play(outcome==='win'?'coins_win':'card_place');
    setResult(outcome);
    await pause(reduced?30:1400);
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
    await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
    if(!cancelled)done.current();
   }catch(error){if(!cancelled){console.error('Combat presentation failed',error);setFailed(true);}}
  })();
  return()=>{
   cancelled=true;
   effects.forEach(animation=>animation.cancel());
   field.current?.querySelectorAll('.ab-combat-pop,.ab-combat-shard').forEach(el=>el.remove());
   tiles.current.forEach(el=>{el.classList.remove('is-rip','is-hit','is-attacking','is-thinking','is-targeted','is-buff-card','is-buff-ability','is-buff-power');el.style.transform='';el.style.opacity='';});
   field.current?.querySelectorAll<HTMLElement>('.ab-combat-me,.ab-combat-foe').forEach(el=>{el.style.translate='';el.style.zIndex='';});
   if(field.current)field.current.style.transform='';
  };
 },[combat,boards,meId,catalog,mineA,topOwner,foe?.displayName,t,otherFights]);

 return <div className={`ab-combat-wrap ${waiting ? 'is-settled' : ''}`} data-testid="ab-combat">
  <div className="ab-combat-speed">
   {[1,2].map(n=><button key={n} aria-pressed={speed===n} onClick={()=>{rate.current=n;setSpeed(n);}}>{n}×</button>)}
   <button onClick={()=>{rate.current=100;setSpeed(100);}}>{t('abSkip')}</button>
  </div>
  {failed?<div className="ab-combat-fallback"><h2>{t('abCombat')}</h2><p>{combat.summary.tie?t('draw'):combat.summary.winnerId===meId?t('win'):t('loss')}</p><button onClick={onDone}>{t('done')}</button></div>:
  <div ref={field} className="ab-combat">
   {[{player:foe,cls:'ab-combat-foe'},{player:mine,cls:'ab-combat-me'}].map(({player,cls})=>player&&<div key={player.sessionId} className={cls+(heroVitals[player.sessionId]?.health<=0?' is-lethal':'')} data-testid={cls}>
    <AbHeroFace className="ab-combat-hero-image" id={player.heroId} art={catalog.heroes.find(h => h.id === player.heroId)?.art} />
    <strong>{combat.ghost&&player===foe?t('abGhost')+' ':''}{player.displayName}</strong>
    <span className="ab-combat-hero-vitals">{String.fromCodePoint(9829)} {heroVitals[player.sessionId]?.health}</span>
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
