import type { AutoBattlerMinionDef, CombatEvent } from '@kartishki/shared';
import type { SeededRng } from './rng';
import type { EffectRegistry } from './keywords';
import type { TriggerQueue } from './TriggerQueue';

export type CombatMinion = {
  id: string;
  cardId: string;
  baseId: string;
  attack: number;
  health: number;
  tavernTier: number;
  keywords: string[];
  tribes: string[];
  golden: boolean;
  owner: string;
  auraAttack: number;
};

export type CombatantSnapshot = {
  playerId: string;
  tavernTier: number;
  board: CombatMinion[];
};

export type CombatResult = {
  seed: number;
  events: CombatEvent[];
  winnerId: string;
  loserId: string;
  damage: number;
  tie: boolean;
  survivorsA: CombatMinion[];
  survivorsB: CombatMinion[];
};

export type CombatContext = {
  triggers: TriggerQueue;
  attackPointers: [number, number];
  boards: [CombatMinion[], CombatMinion[]];
  owners: [string, string];
  rng: SeededRng;
  registry: EffectRegistry;
  currentSourceId: string;
  emit: (event: Omit<CombatEvent, 'id'>) => void;
  nextId: () => string;
  definition: (id: string) => AutoBattlerMinionDef | undefined;
  sideOf: (owner: string) => number;
  summon: (side: 0 | 1, index: number, minion: CombatMinion) => boolean;
};
