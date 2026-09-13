import { AUTO_BATTLER, minionTribes, type AutoBattlerMinionDef } from '@kartishki/shared';
import type { AutoBattlerPlayerState } from '@kartishki/shared';
import type { CombatContext, CombatMinion } from './combatTypes';
import { hasTribe } from '@kartishki/shared';

export type RecruitContext = {
  player: AutoBattlerPlayerState;
  nextId: () => string;
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
  recalculate?(boards: [CombatMinion[], CombatMinion[]]): void;
};

export type HeroPowerHooks = {
  id: string;
  activate?(ctx: RecruitContext, targetId?: string): void;
  onSell?(ctx: RecruitContext): void;
  onRecruitStart?(ctx: RecruitContext): void;
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
      if (!effect?.deathrattle) return;
      ctx.emit({ kind: 'DEATHRATTLE', sourceId: minion.id, cardId: minion.cardId });
      effect.deathrattle(ctx, minion, index);
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

  registry.registerAura({
    id: 'ab-aura-beasts',
    recalculate(boards) {
      for (const board of boards) {
        const sources = board.filter(m => m.health > 0 && m.cardId === 'ab-alpha');
        if (!sources.length) continue;
        for (const minion of board) {
          if (minion.health <= 0) continue;
          if (hasTribe(minion.tribes ?? [], 'beast')) minion.auraAttack += sources.filter(m => m.id !== minion.id).reduce((n, m) => n + (m.golden ? 4 : 2), 0);
        }
      }
    },
  });

  registry.registerHeroPower({
    id: 'ab-power-heal',
    activate(ctx) {
      ctx.player.hero.health = Math.min(ctx.player.hero.maxHealth, ctx.player.hero.health + 1);
    },
  });

  registry.registerHeroPower({
    id: 'ab-power-buff-tavern',
    activate(ctx, targetId) {
      const offer = [...ctx.player.tavern.offers].find(m => m.id === targetId);
      if (!offer) return;
      offer.attack += 2;
      offer.health += 1;
      offer.maxHealth += 1;
      offer.bonusAttack += 2;
      offer.bonusHealth += 1;
    },
  });

  registry.registerHeroPower({
    id: 'ab-power-buff-board',
    activate(ctx, targetId) {
      const minion = [...ctx.player.board].find(m => m.id === targetId);
      if (!minion) return;
      minion.attack += 2;
      minion.bonusAttack += 2;
    },
  });

  registry.registerHeroPower({
    id: 'ab-power-sell-gold',
    onSell(ctx) {
      ctx.player.gold = Math.min(AUTO_BATTLER.GOLD_CAP, ctx.player.gold + 1);
    },
  });

  return registry;
}
