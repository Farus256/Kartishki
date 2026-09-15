import { AUTO_BATTLER, printedStats, type AutoBattlerMinionDef, type AutoBattlerPlayerState } from '@kartishki/shared';
import { createMinionState } from './instantiate';

function isTripleCopy(minion: { kind: string; golden: boolean; baseId: string }, baseId: string): boolean {
  return minion.kind !== 'spell' && !minion.golden && minion.baseId === baseId;
}

export function recountTriples(player: AutoBattlerPlayerState): void {
  const keys: string[] = [];
  player.tripleCounts.forEach((_count, baseId) => { keys.push(String(baseId)); });
  for (const key of keys) player.tripleCounts.delete(key);
  const bump = (baseId: string) => {
    player.tripleCounts.set(baseId, (player.tripleCounts.get(baseId) ?? 0) + 1);
  };
  for (const minion of player.board) {
    if (isTripleCopy(minion, minion.baseId)) bump(minion.baseId);
  }
  for (const card of player.hand) {
    if (isTripleCopy(card, card.baseId)) bump(card.baseId);
  }
}

/**
 * Three identical BASE (non-golden) copies on board+hand merge:
 * Remove 3, add 1 Golden with summed permanent extras and a reward-on-play flag.
 * Consumed copies stay out of the pool.
 */
export function resolveTriples(
  player: AutoBattlerPlayerState,
  nextId: () => string,
  defFor: (baseId: string) => AutoBattlerMinionDef | undefined,
  onTriple?: (golden: AutoBattlerPlayerState['hand'][number]) => void,
): boolean {
  let merged = false;
  for (let safety = 0; safety < 8; safety++) {
    recountTriples(player);
    let baseId: string | undefined;
    player.tripleCounts.forEach((count, id) => {
      if (baseId === undefined && count >= 3) baseId = String(id);
    });
    if (!baseId) break;
    const def = defFor(baseId);
    if (!def) break;

    const taken: AutoBattlerPlayerState['board'][number][] = [];
    const boardHits: number[] = [];
    player.board.forEach((minion, index) => {
      if (isTripleCopy(minion, baseId!)) boardHits.push(index);
    });
    const handHits: number[] = [];
    player.hand.forEach((card, index) => {
      if (isTripleCopy(card, baseId!)) handHits.push(index);
    });
    // A triple must never burn a Golden when all copies are on a full board/hand.
    // Resolve again after a play frees a hand slot; prefer hand copies when present.
    if (player.hand.length >= AUTO_BATTLER.HAND_LIMIT && !handHits.length) break;

    let need = 3;
    for (const index of [...handHits].reverse()) {
      if (need <= 0) break;
      const [card] = player.hand.splice(index, 1);
      if (card) taken.push(card);
      need--;
    }
    for (const index of [...boardHits].reverse()) {
      if (need <= 0) break;
      const [card] = player.board.splice(index, 1);
      if (card) taken.push(card);
      need--;
    }
    if (need > 0 || taken.length < 3) break;

    const printed = printedStats(def, false);
    let extraAtk = 0;
    let extraHp = 0;
    for (const copy of taken) {
      extraAtk += copy.attack - printed.attack;
      extraHp += copy.maxHealth - printed.health;
    }

    const golden = createMinionState(def, nextId(), player.sessionId, true);
    golden.bonusAttack = extraAtk;
    golden.bonusHealth = extraHp;
    golden.attack += extraAtk;
    golden.health += extraHp;
    golden.maxHealth += extraHp;
    golden.poolCopies = taken.reduce((n, copy) => n + copy.poolCopies, 0);
    golden.tripleReward = true;
    for (const keyword of new Set(taken.flatMap(copy => [...copy.keywords]))) {
      if (!golden.keywords.includes(keyword)) golden.keywords.push(keyword);
    }
    player.hand.push(golden);
    player.tripleSerial++;
    merged = true;
    onTriple?.(golden);
  }
  recountTriples(player);
  return merged;
}
