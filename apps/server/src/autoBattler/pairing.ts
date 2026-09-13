import type { SeededRng } from './rng';
import { shuffleInPlace } from './rng';

export type CombatPairPlan = { playerA: string; playerB: string; ghost: boolean };

/**
 * 2 players always fight each other.
 * 3+ tries to avoid an immediate rematch, then uses a ghost for an odd leftover.
 */
export function planPairing(
  aliveIds: string[],
  lastOpponent: Map<string, string>,
  rng: SeededRng,
  ghostIds: string[] = [],
): CombatPairPlan[] {
  if (aliveIds.length < 2) return [];
  if (aliveIds.length === 2) {
    return [{ playerA: aliveIds[0]!, playerB: aliveIds[1]!, ghost: false }];
  }

  let best = pairOnce(shuffleInPlace([...aliveIds], rng), lastOpponent);
  for (let attempt = 0; attempt < 8; attempt++) {
    const candidate = pairOnce(shuffleInPlace([...aliveIds], rng), lastOpponent);
    if (rematchCount(candidate, lastOpponent) < rematchCount(best, lastOpponent)) best = candidate;
    if (rematchCount(best, lastOpponent) === 0) break;
  }
  for (const pair of best) if (pair.ghost && ghostIds.length) {
    pair.playerB = rng.pick(ghostIds.filter(id => id !== lastOpponent.get(pair.playerA)).length
      ? ghostIds.filter(id => id !== lastOpponent.get(pair.playerA)) : ghostIds);
  }
  return best;
}

function pairOnce(ids: string[], lastOpponent: Map<string, string>): CombatPairPlan[] {
  const pairs: CombatPairPlan[] = [];
  let i = 0;
  for (; i + 1 < ids.length; i += 2) {
    pairs.push({ playerA: ids[i]!, playerB: ids[i + 1]!, ghost: false });
  }
  if (i < ids.length) {
    const leftover = ids[i]!;
    const previous = lastOpponent.get(leftover);
    const ghostId = ids.find(id => id !== leftover && id !== previous) ?? ids.find(id => id !== leftover)!;
    pairs.push({ playerA: leftover, playerB: ghostId, ghost: ghostId !== leftover });
  }
  return pairs;
}

function rematchCount(pairs: CombatPairPlan[], lastOpponent: Map<string, string>): number {
  let count = 0;
  for (const pair of pairs) {
    if (pair.ghost) continue;
    if (lastOpponent.get(pair.playerA) === pair.playerB || lastOpponent.get(pair.playerB) === pair.playerA) count++;
  }
  return count;
}
