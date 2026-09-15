import { useEffect, useRef, useState } from 'react';
import type { AbPlayer } from '../autoBattlerSession';
import { audioManager } from '../AudioManager';
import { detectTavernReaction, type TavernSnap } from './tavernReaction';
import { playVoice } from './voiceLines';

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
    if (next === 'PLACE') { audioManager.play('ab_drop_board'); return; }
    setReaction(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setReaction(''), 2400);
    // Coins themselves ring from the purse; here only the action's own voice.
    const voice = { BUY: 'ab_buy', SELL: 'ab_sell', REROLL: 'ab_reroll', FREEZE: 'ab_freeze', UPGRADE: 'ab_upgrade', TRIPLE: 'ab_triple', NO_GOLD: 'ab_error', PLAYER_WIN: 'case_win', PLAYER_LOSS: 'ab_stamp' } as const;
    const sound = voice[next as keyof typeof voice];
    if (sound) audioManager.play(sound);
    if (next === 'PLAYER_WIN') playVoice('win', .6);
    else if (next === 'PLAYER_LOSS') playVoice('loss', .8);
    else if (next === 'TRIPLE') playVoice('triple', .7);
    else if (next === 'SELL') playVoice('sold', .2);
    else if (next === 'NO_GOLD') playVoice('broke', .45);
  }, [me.sessionId, me.gold, me.tavernTier, me.tripleSerial, me.lastCombatResult, me.tavern.frozen, me.tavern.offers.length, me.tavern.offers[0]?.id, me.board.length, me.hand.length, error]);
  return reaction;
}
