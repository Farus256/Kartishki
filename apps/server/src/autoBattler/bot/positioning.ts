import type { AutoBattlerMinionDef } from '@kartishki/shared';
import { isMinion, type BotMinion } from './evaluate';

/**
 * Attack order runs left to right. Higher score = further left:
 * - disruptors (bait / humiliate) and cleave / windfury hitters go first, while the enemy board is still full;
 * - poison and shielded attackers early too — they trade up;
 * - token deathrattles early, so the summons have time to fight (and feed friendlyDeath / friendlySummon engines);
 * - scaling / support bodies (combat triggers, auras, echoes, taunt walls, cannot-attack eggs) go right so they survive.
 */
export function attackPriority(m: BotMinion, defFor: (baseId: string) => AutoBattlerMinionDef | undefined): number {
  const def = defFor(m.baseId);
  const effects = def?.effects ?? [];
  let score = m.attack * 0.4;
  if (m.keywords.includes('bait') || m.keywords.includes('humiliate')) score += 40;
  if (m.keywords.includes('cleave')) score += 12;
  if (m.keywords.includes('windfury')) score += 8;
  if (m.keywords.includes('poisonous')) score += 10;
  if (m.keywords.includes('divineShield')) score += 6;
  if (m.keywords.includes('deathrattle') && (def?.deathrattle || effects.some(e => e.trigger === 'deathrattle' && e.action.kind === 'summon'))) score += 9;
  if (m.keywords.includes('reborn')) score += 3;
  if (m.keywords.includes('cannotAttack')) score += def?.deathrattle ? 5 : -30;
  if (m.keywords.includes('taunt')) score -= 4;
  for (const e of effects) {
    if (e.trigger === 'aura') score -= 25;
    if (['friendlyDeath', 'friendlySummon', 'shieldPop', 'friendlyAttack'].includes(e.trigger)) score -= 15;
    if (e.trigger === 'deathrattle' && e.action.kind === 'buff') score -= 6;
    if (e.trigger === 'startCombat') score -= 5;
    if (['endTurn', 'buy', 'play', 'sell', 'reroll', 'spell'].includes(e.trigger)) score -= 8;
  }
  return score;
}

/** Board order the bot wants: ids left to right. */
export function desiredOrder(board: readonly BotMinion[], defFor: (baseId: string) => AutoBattlerMinionDef | undefined): string[] {
  return board.filter(isMinion).map((m, index) => ({ id: m.id, index, score: attackPriority(m, defFor) }))
    .sort((a, b) => b.score - a.score || a.index - b.index).map(x => x.id);
}

/** First move that brings the current order closer to the desired one (selection sort, one step): undefined when in place. */
export function nextMove(current: readonly string[], desired: readonly string[]): { minionId: string; toIndex: number } | undefined {
  for (let i = 0; i < desired.length; i++) {
    if (current[i] === desired[i]) continue;
    return { minionId: desired[i]!, toIndex: i };
  }
  return undefined;
}
