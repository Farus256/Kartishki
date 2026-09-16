import { MATCH_RULES, type MatchState } from '@kartishki/shared';

/** End of turn: the other player becomes active with one more mana crystal (capped) and a full refill. */
export function advancePhase(state: MatchState, sessionId: string, input: unknown): boolean {
  if (state.status !== 'active' || state.activePlayer !== sessionId || !state.players.has(sessionId)) return false;
  if (!input || typeof input !== 'object' || !('expectedRevision' in input) || input.expectedRevision !== state.revision) return false;
  const next = [...state.players.keys()].find(id => id !== sessionId);
  if (!next) return false;
  state.activePlayer = next;
  state.turn++;
  state.phase = 'main';
  const player = state.players.get(next)!;
  player.maxMana = Math.min(MATCH_RULES.MAX_MANA, Math.max(player.maxMana + 1, Math.ceil(state.turn / 2)));
  player.mana = player.maxMana;
  state.revision++;
  return true;
}
