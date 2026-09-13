import { useEffect, useRef, useState } from 'react';
import type { AbPlayer } from '../autoBattlerSession';
import { audioManager } from '../AudioManager';

/** Reactions follow confirmed state changes, so rejected purchases never celebrate. */
export function useTavernReaction(me: AbPlayer, error?: string) {
  const previous=useRef<AbPlayer | undefined>(undefined);
  const timer=useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [reaction,setReaction]=useState('');
  useEffect(()=>()=>clearTimeout(timer.current),[]);
  useEffect(()=>{
    const p=previous.current;previous.current=me;
    let next='';
    if(error==='NOT_ENOUGH_GOLD'||error==='HERO_POWER_UNAFFORDABLE')next='NO_GOLD';
    else if(p && p.sessionId===me.sessionId) {
      if(me.tripleSerial>p.tripleSerial)next='TRIPLE';
      else if(me.tavernTier>p.tavernTier)next='UPGRADE';
      else if(me.lastCombatResult!==p.lastCombatResult)next=me.lastCombatResult==='win'?'PLAYER_WIN':me.lastCombatResult==='loss'?'PLAYER_LOSS':'';
      else if(me.tavern.frozen!==p.tavern.frozen && me.tavern.frozen)next='FREEZE';
      else if(me.tavern.offers.length<p.tavern.offers.length && me.gold<p.gold)next='BUY';
      else if(me.board.length+me.hand.length<p.board.length+p.hand.length && me.gold>p.gold)next='SELL';
      else if(me.tavern.offers[0]?.id!==p.tavern.offers[0]?.id && me.gold<p.gold)next='REROLL';
      else if(me.board.length>p.board.length)audioManager.play('card_place');
    }
    if(!next)return;
    setReaction(next);clearTimeout(timer.current);timer.current=setTimeout(()=>setReaction(''),2400);
    if(next==='BUY'||next==='UPGRADE'||next==='REROLL')audioManager.play('coins_spend');
    if(next==='SELL'||next==='TRIPLE')audioManager.play('coins_win');
  },[me,error]);
  return reaction;
}
