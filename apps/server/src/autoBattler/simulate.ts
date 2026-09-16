import {
  AutoBattlerPlayerState,
  autoBattlerEffectTriggers,
  resolveAutoBattlerCatalog,
  validateAutoBattlerMinion,
  type AutoBattlerEffectTrigger,
  type AutoBattlerMinionDef,
  type Catalog,
} from '@kartishki/shared';
import { DEFAULT_RULES, runTavernEffects, type EffectTraceLine } from './effects';
import { createMinionState } from './instantiate';
import { createRng } from './rng';

export type SimulateRequest = {
  /** The draft card (validated like a publish). */
  minion: AutoBattlerMinionDef;
  /** Ids of the other minions on the sample board (up to 6), in order; the draft sits at `at` (default: last). */
  board?: string[];
  hand?: string[];
  at?: number;
  trigger: AutoBattlerEffectTrigger;
  /** For play/buy/sell/friendlyDeath/shieldPop/friendlyAttack: the minion the trigger is about (an id from `board`, or the draft itself). */
  subject?: string;
  golden?: boolean;
  seed?: number;
};

export type SimulateStep = {
  step: number;
  action: EffectTraceLine['action'];
  times: number;
  targets: string[];
  gold: number;
  bankedGold: number;
  board: { id: string; cardId: string; attack: number; health: number; keywords: string[] }[];
  hand: { id: string; cardId: string; attack: number; health: number; keywords: string[] }[];
};

export type SimulateResult = { steps: SimulateStep[]; fired: boolean };

const snapshot = (list: Iterable<{ id: string; cardId: string; attack: number; health: number; keywords: Iterable<string> }>) =>
  [...list].map(m => ({ id: m.id, cardId: m.cardId, attack: m.attack, health: m.health, keywords: [...m.keywords] }));

/**
 * Scenario step-through for the editor: builds a throwaway tavern player, runs the draft's trigger through the real
 * interpreter and records the board after every executed step. Combat-only triggers (start of combat, deathrattle,
 * friendly death…) are previewed on the tavern board — same targets, same scaling, no combat damage.
 */
export function simulateEffect(catalog: Catalog, input: unknown): SimulateResult {
  if (!input || typeof input !== 'object') throw new Error('invalidRequest');
  const req = input as SimulateRequest;
  if (!validateAutoBattlerMinion(req.minion) || !autoBattlerEffectTriggers.includes(req.trigger)) throw new Error('invalidCard');
  const ids = (list: unknown, max: number) => Array.isArray(list) ? list.filter((id): id is string => typeof id === 'string').slice(0, max) : [];
  const resolved = resolveAutoBattlerCatalog(catalog);
  const defs = new Map(resolved.minions.map(m => [m.id, m]));
  defs.set(req.minion.id, req.minion);
  const defFor = (id: string) => defs.get(id);
  let serial = 0;
  const nextId = () => `sim${++serial}`;
  const player = new AutoBattlerPlayerState();
  player.sessionId = 'sim';
  player.gold = 10;
  const bodies = ids(req.board, 6).flatMap(id => { const def = defFor(id); return def && !def.spell ? [createMinionState(def, nextId(), 'sim')] : []; });
  const owner = createMinionState(req.minion, nextId(), 'sim', req.golden === true);
  const at = Number.isInteger(req.at) ? Math.max(0, Math.min(bodies.length, req.at as number)) : bodies.length;
  bodies.splice(at, 0, owner);
  for (const body of bodies) player.board.push(body);
  for (const id of ids(req.hand, 3)) { const def = defFor(id); if (def) player.hand.push(createMinionState(def, nextId(), 'sim')); }
  const subject = req.subject === req.minion.id ? owner : [...player.board].find(m => m.cardId === req.subject) ?? undefined;
  const steps: SimulateStep[] = [];
  runTavernEffects({
    player, rng: createRng(Number.isFinite(req.seed) ? Number(req.seed) : 7), defFor, rules: DEFAULT_RULES, nextId,
    trace: line => steps.push({ step: line.step, action: line.action, times: line.times, targets: line.targets, gold: player.gold, bankedGold: player.bankedGold, board: snapshot(player.board), hand: snapshot(player.hand) }),
  }, req.trigger, owner, subject);
  return { steps, fired: steps.length > 0 };
}
