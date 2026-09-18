import { AUTO_BATTLER, minionTribes, type AutoBattlerMinionDef } from '@kartishki/shared';
import type { AutoBattlerMinionState, AutoBattlerPlayerState } from '@kartishki/shared';
import type { CombatContext, CombatMinion } from './combatTypes';
import { hasTribe } from '@kartishki/shared';
import { auraBonus, buffTavernMinion, runCombatEffects } from './effects';
import { createMinionState } from './instantiate';
import type { SeededRng } from './rng';

export type RecruitContext = {
  player: AutoBattlerPlayerState;
  nextId: () => string;
  rng: SeededRng;
  defFor: (baseId: string) => AutoBattlerMinionDef | undefined;
  /** Opens a discover of the player's tier (hero powers, spells). */
  discover: (tier: number) => boolean;
};

export type KeywordHooks = {
  id: string;
  onIncomingDamage?(ctx: CombatContext, target: CombatMinion, amount: number, source: CombatMinion): number;
  onAttack?(ctx: CombatContext, attacker: CombatMinion, defender: CombatMinion): void;
  onDeath?(ctx: CombatContext, minion: CombatMinion, index: number): void;
  onSummon?(ctx: CombatContext, minion: CombatMinion): void;
};

export type PlayEffect = {
  id: string;
  battlecry?(ctx: RecruitContext, minion: { id: string; cardId: string; golden: boolean }): void;
  deathrattle?(ctx: CombatContext, minion: CombatMinion, index: number): void;
};

export type AuraHooks = {
  id: string;
  cardId?: string;
  recalculate?(boards: [CombatMinion[], CombatMinion[]], ctx: CombatContext): void;
};

export type HeroPowerHooks = {
  id: string;
  activate?(ctx: RecruitContext, targetId?: string): void;
  onSell?(ctx: RecruitContext): void;
  onRecruitStart?(ctx: RecruitContext): void;
  onBuy?(ctx: RecruitContext, minion: AutoBattlerMinionState): void;
  onTriple?(ctx: RecruitContext, golden: AutoBattlerMinionState): void;
  onTurnEnd?(ctx: RecruitContext): void;
  /** After this player's fight resolved (`won` is false on a loss or a tie). */
  onCombatEnd?(player: AutoBattlerPlayerState, won: boolean): void;
};

/**
 * Register Battlecries / Deathrattles / auras / hero powers here
 * without rewriting the combat loop.
 */
export class EffectRegistry {
  readonly keywords = new Map<string, KeywordHooks>();
  readonly effects = new Map<string, PlayEffect>();
  readonly auras: AuraHooks[] = [];
  readonly heroPowers = new Map<string, HeroPowerHooks>();

  registerKeyword(hooks: KeywordHooks): this {
    this.keywords.set(hooks.id, hooks);
    return this;
  }

  registerEffect(effect: PlayEffect): this {
    this.effects.set(effect.id, effect);
    return this;
  }

  registerAura(aura: AuraHooks): this {
    this.auras.push(aura);
    return this;
  }

  registerHeroPower(hooks: HeroPowerHooks): this {
    this.heroPowers.set(hooks.id, hooks);
    return this;
  }
}

export function createDefaultRegistry(defs: AutoBattlerMinionDef[]): EffectRegistry {
  const registry = new EffectRegistry();

  registry.registerKeyword({
    id: 'divineShield',
    onIncomingDamage(ctx, target, amount) {
      if (amount <= 0 || !target.keywords.includes('divineShield')) return amount;
      target.keywords = target.keywords.filter(k => k !== 'divineShield');
      ctx.emit({ kind: 'DIVINE_SHIELD_POP', targetId: target.id, sourceId: ctx.currentSourceId });
      return 0;
    },
  });

  for (const id of ['poisonous', 'taunt', 'battlecry', 'windfury', 'cleave', 'reborn', 'immune', 'cannotAttack']) {
    registry.registerKeyword({ id });
  }

  registry.registerKeyword({
    id: 'deathrattle',
    onDeath(ctx, minion, index) {
      const effect = registry.effects.get(`deathrattle:${minion.cardId}`);
      const def = ctx.definition(minion.baseId);
      const buffs = def?.effects?.some(e => e.trigger === 'deathrattle');
      if (!effect?.deathrattle && !buffs) return;
      ctx.emit({ kind: 'DEATHRATTLE', sourceId: minion.id, cardId: minion.cardId });
      effect?.deathrattle?.(ctx, minion, index);
      if (buffs) runCombatEffects(ctx, 'deathrattle', minion);
    },
  });

  for (const def of defs) {
    if (!def.deathrattle) continue;
    const summon = def.deathrattle;
    registry.registerEffect({
      id: `deathrattle:${def.id}`,
      deathrattle(ctx, minion, index) {
        const token = ctx.definition(summon.summonId);
        if (!token) return;
        const side = ctx.sideOf(minion.owner);
        if (side < 0) return;
        for (let n = 0; n < summon.count; n++) {
          ctx.summon(side as 0 | 1, index + n, {
            id: ctx.nextId(),
            cardId: token.id,
            baseId: token.id,
            attack: token.attack * (minion.golden ? 2 : 1),
            health: token.health * (minion.golden ? 2 : 1),
            tavernTier: token.tavernTier,
            keywords: [...token.keywords],
            tribes: [...minionTribes(token)],
            golden: minion.golden,
            owner: minion.owner,
            auraAttack: 0,
          });
        }
      },
    });
  }

  registry.registerEffect({
    id: 'ab-bc-gold',
    battlecry(ctx, minion) {
      ctx.player.gold = Math.min(AUTO_BATTLER.GOLD_CAP, ctx.player.gold + (minion.golden ? 2 : 1));
    },
  });

  // Every aura is a data effect on its source ('aura' trigger); one hook sums them per board.
  registry.registerAura({
    id: 'ab-aura-effects',
    recalculate(boards, ctx) {
      for (const board of boards) {
        for (const minion of board) {
          if (minion.health <= 0) continue;
          minion.auraAttack += auraBonus(ctx, board, minion);
        }
      }
    },
  });

  // Captain: free, once a turn — +2 Health; at full health the rest is a coin for next turn, so it is never a dead click.
  registry.registerHeroPower({
    id: 'ab-power-heal',
    activate(ctx) {
      const hero = ctx.player.hero;
      if (hero.health >= hero.maxHealth) { ctx.player.bankedGold += 1; return; }
      hero.health = Math.min(hero.maxHealth, hero.health + 2);
    },
  });

  registry.registerHeroPower({
    id: 'ab-power-buff-tavern',
    activate(ctx, targetId) {
      const offer = [...ctx.player.tavern.offers].find(m => m.id === targetId);
      if (!offer || offer.kind === 'spell') return;
      buffTavernMinion(offer, 2, 2);
    },
  });

  registry.registerHeroPower({
    id: 'ab-power-buff-board',
    activate(ctx, targetId) {
      const minion = [...ctx.player.board].find(m => m.id === targetId);
      if (!minion) return;
      buffTavernMinion(minion, 3, 0);
    },
  });

  registry.registerHeroPower({
    id: 'ab-power-sell-gold',
    onSell(ctx) {
      ctx.player.gold += 1;
    },
  });

  // Innkeeper: the first refresh each turn is free.
  registry.registerHeroPower({ id: 'ab-power-free-roll', onRecruitStart(ctx) { ctx.player.freeRerolls = Math.max(ctx.player.freeRerolls, 1); } });
  // Gambler: pay 2 to discover a minion of your tier.
  registry.registerHeroPower({ id: 'ab-power-discover', activate(ctx) { ctx.discover(ctx.player.tavernTier); } });
  // Beastmaster: bought beasts arrive with +1/+1.
  registry.registerHeroPower({ id: 'ab-power-beast-buy', onBuy(_ctx, minion) { if (hasTribe(minion.tribes, 'beast')) buffTavernMinion(minion, 2, 1); } });
  // Tinker: give a friendly minion Divine Shield.
  registry.registerHeroPower({ id: 'ab-power-shield', activate(ctx, targetId) {
    const minion = [...ctx.player.board].find(m => m.id === targetId);
    if (minion && !minion.keywords.includes('divineShield')) minion.keywords.push('divineShield');
  } });
  // Necromancer: at the end of your turn a random friendly undead gets +1/+1.
  registry.registerHeroPower({ id: 'ab-power-undead-end', onTurnEnd(ctx) {
    const undead = [...ctx.player.board].filter(m => hasTribe(m.tribes, 'undead'));
    if (undead.length) buffTavernMinion(ctx.rng.pick(undead), 2, 2);
  } });
  // Tycoon: one extra gold every turn (35 health).
  registry.registerHeroPower({ id: 'ab-power-rich', onRecruitStart(ctx) { ctx.player.gold += 1; } });
  // Collector: golden minions from triples get +2/+2.
  registry.registerHeroPower({ id: 'ab-power-triple-buff', onTriple(ctx, golden) { buffTavernMinion(golden, 3, 3); ctx.player.gold += 1; } });
  // Mystic: tavern spells cost $1 less (see syncPrices) — the spell-synergy hero.
  registry.registerHeroPower({ id: 'ab-power-spell-thrift' });
  // Foreman: a 1/1 Factory Petrovich in hand at the start of every turn — sell it for a coin, or feed it to hand buffs.
  registry.registerHeroPower({ id: 'ab-power-hand-token', onRecruitStart(ctx) {
    const token = ctx.defFor('ab-token-1-1');
    if (token && ctx.player.hand.length < AUTO_BATTLER.HAND_LIMIT) ctx.player.hand.push(createMinionState(token, ctx.nextId(), ctx.player.sessionId));
  } });
  // Bounty Hunter: every won fight pays $2 next turn (36 Health) — the tempo hero.
  registry.registerHeroPower({ id: 'ab-power-bounty', onCombatEnd(player, won) { if (won) player.bankedGold += 2; } });
  // Alchemist: swap a friendly minion's attack and health (free, once a turn).
  registry.registerHeroPower({ id: 'ab-power-swap', activate(ctx, targetId) {
    const minion = [...ctx.player.board].find(m => m.id === targetId);
    if (!minion) return;
    const attack = minion.attack;
    minion.attack = minion.health;
    minion.health = minion.maxHealth = Math.max(1, attack);
  } });

  return registry;
}
