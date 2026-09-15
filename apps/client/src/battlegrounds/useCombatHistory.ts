import { useRef } from 'react';
import type { AbPlayer } from '../autoBattlerSession';

export type FightRecord = { turn: number; opponentId: string; result: string; damage: number };

/**
 * Client-side fight log per player, built from the last-combat fields the server
 * replicates each round. One record per player per turn; a turn counter reset (new game) clears it.
 */
export function useCombatHistory(players: AbPlayer[], turn: number): Map<string, FightRecord[]> {
  const log = useRef(new Map<string, FightRecord[]>());
  const lastTurn = useRef(0);
  if (turn < lastTurn.current) log.current = new Map();
  lastTurn.current = turn;
  for (const p of players) {
    if (!p.lastCombatOpponentId || !p.lastCombatResult || turn < 2) continue;
    const list = log.current.get(p.sessionId) ?? [];
    if (list[list.length - 1]?.turn === turn) continue;
    list.push({ turn, opponentId: p.lastCombatOpponentId, result: p.lastCombatResult, damage: p.lastCombatDamage });
    log.current.set(p.sessionId, list.slice(-8));
  }
  return log.current;
}
