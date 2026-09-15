import { AUTO_BATTLER, printedStats, type AutoBattlerMinionDef, type AutoBattlerPlayerState, type CombatEvent } from '@kartishki/shared';
import { createRng } from './rng';
import { TriggerQueue } from './TriggerQueue';
import type { EffectRegistry } from './keywords';
import type { CombatContext, CombatMinion, CombatResult, CombatantSnapshot } from './combatTypes';
import { runCombatEffects } from './effects';

export type { CombatContext, CombatMinion, CombatResult, CombatantSnapshot } from './combatTypes';

export function snapshotBoard(player: AutoBattlerPlayerState): CombatantSnapshot {
  return {
    playerId: player.sessionId,
    tavernTier: player.tavernTier,
    board: [...player.board]
      .filter(m => m.kind !== 'spell')
      .map(m => ({
        id: m.id,
        cardId: m.cardId,
        baseId: m.baseId,
        attack: m.attack,
        health: m.health,
        tavernTier: m.tavernTier,
        keywords: [...m.keywords],
        tribes: [...m.tribes],
        golden: m.golden,
        owner: player.sessionId,
        auraAttack: 0,
      })),
  };
}

function cloneBoard(board: CombatMinion[]): CombatMinion[] {
  return board.map(m => ({
    ...m,
    keywords: [...m.keywords],
    tribes: [...(m.tribes ?? [])],
    auraAttack: m.auraAttack ?? 0,
  }));
}

function living(board: CombatMinion[]): CombatMinion[] {
  return board.filter(m => m.health > 0);
}

function atk(minion: CombatMinion): number {
  return minion.humiliated ? 1 : minion.attack + minion.auraAttack;
}

function pickDefender(board: CombatMinion[], rng: ReturnType<typeof createRng>): CombatMinion | undefined {
  const live = living(board);
  const taunts = live.filter(m => m.keywords.includes('taunt'));
  const pool = taunts.length ? taunts : live;
  if (!pool.length) return undefined;
  return rng.pick(pool);
}

function refreshAuras(ctx: CombatContext): void {
  const before = new Map(ctx.boards.flat().map(m => [m.id, atk(m)]));
  for (const board of ctx.boards) {
    for (const minion of board) minion.auraAttack = 0;
  }
  for (const aura of ctx.registry.auras) aura.recalculate?.(ctx.boards, ctx);
  for (const minion of ctx.boards.flat()) if (before.get(minion.id) !== atk(minion)) {
    ctx.emit({ kind: 'STATS', targetId: minion.id, attack: atk(minion), remainingHealth: minion.health });
  }
}

function applyDamage(
  ctx: CombatContext,
  target: CombatMinion,
  amount: number,
  source: CombatMinion,
  kind: 'DAMAGE' | 'CLEAVE_DAMAGE' = 'DAMAGE',
): void {
  if (amount <= 0 || target.health <= 0) return;
  if (target.keywords.includes('immune')) return;
  ctx.currentSourceId = source.id;
  let incoming = amount;
  if (target.keywords.includes('divineShield')) {
    const hook = ctx.registry.keywords.get('divineShield');
    incoming = hook?.onIncomingDamage?.(ctx, target, incoming, source) ?? 0;
    if (!hook?.onIncomingDamage) {
      target.keywords = target.keywords.filter(k => k !== 'divineShield');
      ctx.emit({ kind: 'DIVINE_SHIELD_POP', targetId: target.id, sourceId: source.id });
      incoming = 0;
    }
  }
  if (incoming <= 0) return;
  if (source.keywords.includes('poisonous')) target.health = 0;
  else target.health -= incoming;
  ctx.emit({
    kind,
    targetId: target.id,
    sourceId: source.id,
    amount: incoming,
    remainingHealth: Math.max(0, target.health),
  });
}

function resolveDeathQueue(ctx: CombatContext, preferred: CombatMinion[]): void {
  for (let safety = 0; safety < 32; safety++) {
    const dead: CombatMinion[] = [];
    const seen = new Set<string>();
    for (const minion of preferred) {
      if (minion.health <= 0 && !seen.has(minion.id)
        && ctx.boards.some(board => board.some(item => item.id === minion.id))) {
        seen.add(minion.id);
        dead.push(minion);
      }
    }
    for (const board of ctx.boards) {
      for (const minion of board) {
        if (minion.health <= 0 && !seen.has(minion.id)) {
          seen.add(minion.id);
          dead.push(minion);
        }
      }
    }
    if (!dead.length) return;
    // Remove the entire simultaneous death batch before any summon tests capacity.
    const removals = dead.map(minion => {
      const side = ctx.sideOf(minion.owner) as 0 | 1;
      const board = ctx.boards[side];
      const index = board.findIndex(item => item.id === minion.id);
      const right = board.slice(index + 1).filter(item => item.health > 0).map(item => item.id);
      ctx.emit({ kind: 'DEATH', targetId: minion.id, cardId: minion.cardId, index, owner: minion.owner });
      return { minion, side, right };
    });
    ctx.boards.forEach((board, side) => {
      for (let i = board.length - 1; i >= 0; i--) if (board[i]!.health <= 0) {
        board.splice(i, 1);
        if (i < ctx.attackPointers[side]!) ctx.attackPointers[side]!--;
      }
    });
    refreshAuras(ctx);
    for (const { minion, side, right } of removals) ctx.triggers.push(() => {
      const board = ctx.boards[side];
      // Insert before the next surviving original neighbour. Adjacent simultaneous
      // deaths consequently preserve the left-to-right order of their summons.
      const nextRight = right.map(id => board.findIndex(m => m.id === id)).find(i => i >= 0);
      resolveDeath(ctx, minion, nextRight ?? board.length);
    });
    ctx.triggers.drain();
    if (ctx.triggers.exhausted) { ctx.emit({ kind: 'LIMIT_REACHED' }); return; }
  }
}

function resolveDeath(ctx: CombatContext, minion: CombatMinion, index: number): void {
  const side = ctx.sideOf(minion.owner) as 0 | 1;
  if (side < 0) return;
  ctx.currentSourceId = minion.id;
  if (minion.keywords.includes('deathrattle')) {
    ctx.registry.keywords.get('deathrattle')?.onDeath?.(ctx, minion, index);
  }
  if (minion.keywords.includes('reborn')) {
    const def = ctx.definition(minion.baseId);
    const printed = def ? printedStats(def, minion.golden) : minion;
    ctx.emit({ kind: 'REBORN', sourceId: minion.id, minionId: minion.id, owner: minion.owner, index });
    ctx.summon(side, index, {
      id: ctx.nextId(),
      cardId: minion.cardId,
      baseId: minion.baseId,
      attack: printed.attack,
      health: 1,
      tavernTier: minion.tavernTier,
      keywords: printed.keywords.filter(k => k !== 'reborn'),
      tribes: [...minion.tribes],
      golden: minion.golden,
      owner: minion.owner,
      auraAttack: 0,
    });
  }
  refreshAuras(ctx);
}

function loserDamage(winnerTier: number, survivors: CombatMinion[]): number {
  return winnerTier + survivors.reduce((sum, minion) => sum + minion.tavernTier, 0);
}

function nextAttacker(board: CombatMinion[], start: number): { minion: CombatMinion; index: number } | undefined {
  if (!board.length) return undefined;
  for (let step = 0; step < board.length; step++) {
    const index = (start + step) % board.length;
    const candidate = board[index]!;
    if (candidate.health > 0 && (atk(candidate) > 0 || candidate.keywords.includes('humiliate') || candidate.keywords.includes('bait')) && !candidate.keywords.includes('cannotAttack')) {
      return { minion: candidate, index };
    }
  }
  return undefined;
}

/**
 * Instant while-loop combat on isolated snapshots. No timers.
 * Same seed + boards => same events.
 */
export function resolveCombat(
  playerA: CombatantSnapshot,
  playerB: CombatantSnapshot,
  seed: number,
  registry: EffectRegistry,
  definition: (id: string) => AutoBattlerMinionDef | undefined,
): CombatResult {
  const rng = createRng(seed);
  const events: CombatEvent[] = [];
  let eventId = 0;
  const boards: [CombatMinion[], CombatMinion[]] = [cloneBoard(playerA.board), cloneBoard(playerB.board)];
  const owners: [string, string] = [playerA.playerId, playerB.playerId];
  let serial = 0;
  const pointers: [number, number] = [0, 0];

  const ctx: CombatContext = {
    triggers: new TriggerQueue(),
    attackPointers: pointers,
    boards,
    owners,
    rng,
    registry,
    currentSourceId: '',
    emit: event => { events.push({ id: ++eventId, ...event }); },
    nextId: () => `c${++serial}`,
    definition,
    sideOf: owner => owners[0] === owner ? 0 : owners[1] === owner ? 1 : -1,
    summon(side, index, minion) {
      const board = boards[side];
      if (board.length >= AUTO_BATTLER.BOARD_LIMIT) return false;
      const at = Math.max(0, Math.min(index, board.length));
      if (at < pointers[side]) pointers[side]++;
      board.splice(at, 0, minion);
      ctx.emit({
        kind: 'SUMMON',
        sourceId: ctx.currentSourceId,
        minionId: minion.id,
        cardId: minion.cardId,
        index: at,
        owner: minion.owner,
        minion: { ...minion, keywords: [...minion.keywords] },
      });
      for (const keyword of minion.keywords) ctx.triggers.push(() => registry.keywords.get(keyword)?.onSummon?.(ctx, minion));
      refreshAuras(ctx);
      return true;
    },
  };

  ctx.emit({ kind: 'COMBAT_START', seed, playerA: owners[0], playerB: owners[1] });
  // Start-of-combat effects fire left to right, first board A then B; they last this fight only.
  for (const board of boards) for (const minion of [...board]) runCombatEffects(ctx, 'startCombat', minion);
  refreshAuras(ctx);

  const countA = living(boards[0]).length;
  const countB = living(boards[1]).length;
  let side: 0 | 1 = countA > countB ? 0 : countB > countA ? 1 : rng.int(2) as 0 | 1;
  let stalled = 0;
  let safety = 0;

  while (living(boards[0]).length && living(boards[1]).length && safety++ < AUTO_BATTLER.MAX_COMBAT_ACTIONS && !ctx.triggers.exhausted) {
    const found = nextAttacker(boards[side], pointers[side]);
    if (!found) {
      stalled++;
      side = side === 0 ? 1 : 0;
      if (stalled >= 2) break;
      continue;
    }
    stalled = 0;
    const attacker = found.minion;
    pointers[side] = found.index + 1;
    const swings = attacker.keywords.includes('windfury') ? 2 : 1;
    for (let swing = 0; swing < swings; swing++) {
      if (attacker.health <= 0 || !living(boards[side === 0 ? 1 : 0]).length) break;
      const enemy = boards[side === 0 ? 1 : 0];
      const defender = pickDefender(enemy, rng);
      if (!defender) break;

      ctx.currentSourceId = attacker.id;
      // Special actions replace contact damage, including retaliation and cleave.
      if (attacker.keywords.includes('humiliate') || attacker.keywords.includes('bait')) {
        if (attacker.keywords.includes('humiliate')) {
          defender.humiliated = true;
          defender.attack = 1;
          ctx.emit({ kind: 'HUMILIATE', sourceId: attacker.id, targetId: defender.id, attack: 1, remainingHealth: defender.health });
        }
        if (attacker.keywords.includes('bait')) {
          defender.health = 1;
          ctx.emit({ kind: 'BAIT', sourceId: attacker.id, targetId: defender.id, attack: atk(defender), remainingHealth: 1 });
        }
        continue;
      }
      ctx.emit({
        kind: 'ATTACK',
        sourceId: attacker.id,
        targetId: defender.id,
        sourceCardId: attacker.cardId,
        targetCardId: defender.cardId,
      });
      for (const keyword of attacker.keywords) registry.keywords.get(keyword)?.onAttack?.(ctx, attacker, defender);

      const strike = atk(attacker);
      const retaliation = atk(defender);
      applyDamage(ctx, defender, strike, attacker);
      applyDamage(ctx, attacker, retaliation, defender);

      if (attacker.keywords.includes('cleave')) {
        const di = enemy.findIndex(item => item.id === defender.id);
        if (di >= 0) {
          const left = enemy[di - 1];
          const right = enemy[di + 1];
          if (left && left.health > 0) applyDamage(ctx, left, strike, attacker, 'CLEAVE_DAMAGE');
          if (right && right.health > 0) applyDamage(ctx, right, strike, attacker, 'CLEAVE_DAMAGE');
        }
      }

      const other: 0 | 1 = side === 0 ? 1 : 0;
      resolveDeathQueue(ctx, [...boards[side], ...boards[other]]);
    }

    if (pointers[side] >= boards[side].length) pointers[side] = 0;
    side = side === 0 ? 1 : 0;
  }

  const survivorsA = living(boards[0]).map(m => ({ ...m, keywords: [...m.keywords], tribes: [...m.tribes] }));
  if (safety >= AUTO_BATTLER.MAX_COMBAT_ACTIONS) ctx.emit({ kind: 'LIMIT_REACHED' });
  const survivorsB = living(boards[1]).map(m => ({ ...m, keywords: [...m.keywords], tribes: [...m.tribes] }));
  let winnerId = '';
  let loserId = '';
  let damage = 0;
  let tie = false;
  if (!survivorsA.length && !survivorsB.length) {
    tie = true;
  } else if (!survivorsA.length) {
    winnerId = owners[1];
    loserId = owners[0];
    damage = loserDamage(playerB.tavernTier, survivorsB);
  } else if (!survivorsB.length) {
    winnerId = owners[0];
    loserId = owners[1];
    damage = loserDamage(playerA.tavernTier, survivorsA);
  } else {
    tie = true;
  }

  ctx.emit({ kind: 'COMBAT_END', winnerId, loserId, damage, tie });
  return { seed, events, winnerId, loserId, damage, tie, survivorsA, survivorsB };
}

export function replayCombat(
  snapshotA: CombatantSnapshot,
  snapshotB: CombatantSnapshot,
  seed: number,
  registry: EffectRegistry,
  definition: (id: string) => AutoBattlerMinionDef | undefined,
): CombatResult {
  return resolveCombat(snapshotA, snapshotB, seed, registry, definition);
}
