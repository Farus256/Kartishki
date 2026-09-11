import { phases, type MatchState } from '@kartishki/shared';

export function advancePhase(state: MatchState, sessionId: string, input: unknown): boolean {
  if (state.status !== 'active' || state.activePlayer !== sessionId || !state.players.has(sessionId)) return false;
  if (!input || typeof input !== 'object' || !('expectedRevision' in input) || input.expectedRevision !== state.revision) return false;
  const index = phases.indexOf(state.phase as typeof phases[number]);
  if (index < 0) return false;
  if (state.phase === 'end') {
    const next = [...state.players.keys()].find(id => id !== sessionId);
    if (!next) return false;
    state.activePlayer = next;
    state.turn++;
    state.phase = 'start';
    state.players.get(next)!.mana = Math.min(10, Math.ceil(state.turn / 2));
  } else state.phase = phases[index + 1];
  state.revision++;
  return true;
}
