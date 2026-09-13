import { useEffect, useRef, useState } from 'react';
import type { AbPlayer } from '../autoBattlerSession';
import { audioManager } from '../AudioManager';
import { detectTavernReaction, type TavernSnap } from './tavernReaction';

function snap(me: AbPlayer): TavernSnap {
  return {
    sessionId: me.sessionId,
    gold: me.gold,
    tavernTier: me.tavernTier,
    tripleSerial: me.tripleSerial,
    lastCombatResult: me.lastCombatResult,
    frozen: me.tavern.frozen,
    offerCount: me.tavern.offers.length,
    offer0: me.tavern.offers[0]?.id,
    pieces: me.board.length + me.hand.length,
    board: me.board.length,
  };
}

/** Reactions follow confirmed field changes, not every Colyseus object identity tick. */
export function useTavernReaction(me: AbPlayer, error?: string) {
  const previous = useRef<TavernSnap | undefined>(undefined);
  const shownUpgrade = useRef(me.tavernTier);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [reaction, setReaction] = useState('');
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    const current = snap(me);
    const next = detectTavernReaction(previous.current, current, error);
    previous.current = current;
    if (!next) return;
    if (next === 'UPGRADE') {
      if (current.tavernTier <= shownUpgrade.current) return;
      shownUpgrade.current = current.tavernTier;
    }
    if (next === 'PLACE') { audioManager.play('card_place'); return; }
    setReaction(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setReaction(''), 2400);
    if (next === 'BUY' || next === 'UPGRADE' || next === 'REROLL') audioManager.play('coins_spend');
    if (next === 'SELL' || next === 'TRIPLE') audioManager.play('coins_win');
  }, [me.sessionId, me.gold, me.tavernTier, me.tripleSerial, me.lastCombatResult, me.tavern.frozen, me.tavern.offers.length, me.tavern.offers[0]?.id, me.board.length, me.hand.length, error]);
  return reaction;
}
