import { randomInt } from 'node:crypto';
import { COIN_CARD_ID, DECK_SIZE, MATCH_RULES, MinionState, coinCard, type MatchState, type CardDefinition, type HandCard, type GameEvent, starterHeroes, type HeroDefinition } from '@kartishki/shared';
import { advancePhase } from './rules';

function shuffle<T>(list: T[]): T[] {
  for (let n = list.length - 1; n > 0; n--) { const j = randomInt(n + 1); [list[n], list[j]] = [list[j]!, list[n]!]; }
  return list;
}

/**
 * Hearthstone-standard duel rules: opening hands 3/4 with a mulligan, The Coin for the second player,
 * a mana crystal per turn, summoning sickness unless Charge, Taunt first, hero powers once per turn.
 * Hands and decks stay private here; the state only carries counts.
 */
export class Battle {
  readonly hands = new Map<string, HandCard[]>();
  private decks = new Map<string, string[]>();
  private fatigue = new Map<string, number>();
  private serial = 0;
  private eventId = 0;
  readonly cards: Map<string, CardDefinition>;
  constructor(readonly state: MatchState, definitions: CardDefinition[], private emit: (event: GameEvent) => void = () => {}, private heroes: HeroDefinition[] = starterHeroes) {
    this.cards = new Map(definitions.map(c => [c.id, c]));
    this.cards.set(COIN_CARD_ID, coinCard);
  }
  /** Shuffles the decks and deals the opening hands: three to the first player, four to the second. The mulligan follows. */
  start(selectedDecks = new Map<string, string[]>()) {
    const first = this.state.first || this.state.activePlayer;
    for (const id of this.state.players.keys()) {
      const ids = [...this.cards.keys()].filter(cardId => cardId !== COIN_CARD_ID).slice(-DECK_SIZE);
      const deck = selectedDecks.has(id) ? [...selectedDecks.get(id)!] : Array.from({ length: DECK_SIZE }, (_, n) => ids[n % ids.length]!);
      if (deck.length !== DECK_SIZE || deck.some(cardId => !this.cards.has(cardId) || cardId === COIN_CARD_ID)) throw new Error('Invalid match deck');
      this.decks.set(id, shuffle(deck)); this.hands.set(id, []);
      for (let n = 0; n < (id === first ? MATCH_RULES.FIRST_HAND : MATCH_RULES.SECOND_HAND); n++) this.draw(id);
    }
  }
  private hasProperty(cardId: string, property: string) { return this.cards.get(cardId)?.properties.includes(property) ?? false; }
  private mine(owner: string) { return [...this.state.minions.values()].filter(m => m.owner === owner); }
  private event(kind: GameEvent['kind'], cardId: string, source: string, target?: string, amount?: number) {
    this.emit({ id: ++this.eventId, kind, cardId, source, target, amount });
  }
  private draw(owner: string) {
    const player = this.state.players.get(owner)!; const deck = this.decks.get(owner)!; const hand = this.hands.get(owner)!;
    const cardId = deck.pop();
    if (!cardId) {
      const amount = (this.fatigue.get(owner) ?? 0) + 1; this.fatigue.set(owner, amount); player.health -= amount;
      this.event('fatigue', '', owner, undefined, amount);
    } else if (hand.length < MATCH_RULES.HAND_LIMIT) {
      hand.push({ instanceId: `h${++this.serial}`, cardId });
      // Draw events never include card IDs: only the owner receives hand contents.
      this.event('draw', '', owner);
    } else this.event('burn', cardId, owner);
    player.handCount = hand.length; player.deckCount = deck.length;
  }
  /**
   * Mulligan: the chosen cards go back into the deck after their replacements are drawn (so a replaced card
   * cannot be drawn straight back). Confirming with nothing to replace just keeps the hand.
   */
  mulligan(owner: string, input: unknown): boolean {
    const player = this.state.players.get(owner);
    if (this.state.status !== 'mulligan' || !player || player.mulliganDone) return false;
    const raw = input && typeof input === 'object' && 'replace' in input ? (input as { replace: unknown }).replace : [];
    const hand = this.hands.get(owner)!, deck = this.decks.get(owner)!;
    const replace = Array.isArray(raw) ? [...new Set(raw.filter((id): id is string => typeof id === 'string' && hand.some(card => card.instanceId === id)))] : [];
    const returned: string[] = [];
    for (const id of replace) {
      const index = hand.findIndex(card => card.instanceId === id);
      if (index < 0) continue;
      returned.push(hand[index]!.cardId);
      hand.splice(index, 1);
      const drawn = deck.pop();
      if (drawn) hand.push({ instanceId: `h${++this.serial}`, cardId: drawn });
    }
    deck.push(...returned); shuffle(deck);
    player.handCount = hand.length; player.deckCount = deck.length; player.mulliganDone = true;
    this.state.revision++;
    return true;
  }
  /** Both hands are set: the second player pockets The Coin and the first player's turn begins with its draw. */
  finishMulligan() {
    const first = this.state.first || this.state.activePlayer;
    for (const [id, player] of this.state.players) {
      player.mulliganDone = true;
      if (id === first) continue;
      const hand = this.hands.get(id)!;
      hand.push({ instanceId: `h${++this.serial}`, cardId: COIN_CARD_ID });
      player.handCount = hand.length;
    }
    this.state.status = 'active'; this.state.phase = 'main'; this.state.turn = 1; this.state.activePlayer = first;
    const player = this.state.players.get(first)!;
    player.maxMana = 1; player.mana = 1;
    this.beginTurn(first);
    this.state.revision++;
  }
  private beginTurn(owner: string) {
    for (const minion of this.state.minions.values()) if (minion.owner === owner) minion.ready = true;
    this.state.players.get(owner)!.powerUsed = false;
    this.event('turn', '', owner);
    this.draw(owner); this.settle();
  }
  private authorized(owner: string, input: unknown): input is Record<string, unknown> {
    return this.state.status === 'active' && this.state.activePlayer === owner && this.state.players.has(owner)
      && !!input && typeof input === 'object' && 'expectedRevision' in input && input.expectedRevision === this.state.revision;
  }
  advance(owner: string, input: unknown) {
    const before = this.state.activePlayer;
    if (!advancePhase(this.state, owner, input)) return false;
    if (before !== this.state.activePlayer) this.beginTurn(this.state.activePlayer);
    return true;
  }
  play(owner: string, input: unknown) {
    if (!this.authorized(owner, input) || typeof input.instanceId !== 'string') return false;
    const hand = this.hands.get(owner)!; const index = hand.findIndex(c => c.instanceId === input.instanceId);
    if (index < 0) return false;
    const card = this.cards.get(hand[index]!.cardId)!; const player = this.state.players.get(owner)!;
    if (card.id === COIN_CARD_ID) {
      hand.splice(index, 1); player.handCount = hand.length;
      player.mana = Math.min(MATCH_RULES.MAX_MANA, player.mana + 1);
      this.event('coin', card.id, owner);
      this.state.revision++; return true;
    }
    if (this.mine(owner).length >= MATCH_RULES.BOARD_LIMIT || player.mana < card.cost) return false;
    player.mana -= card.cost; hand.splice(index, 1); player.handCount = hand.length;
    const m = new MinionState(); m.id = `m${++this.serial}`; m.owner = owner; m.cardId = card.id;
    m.attack = card.attack; m.health = m.maxHealth = card.health;
    for (const property of card.properties) this.effect(m, property, 1);
    this.state.minions.set(m.id, m); this.event('spawn', card.id, m.id);
    this.trigger(m, 'battlecry'); this.settle(); this.state.revision++; return true;
  }
  /** Hearthstone targeting: a Taunt minion must be attacked first; otherwise any enemy minion or the enemy hero. */
  private legalAttackTarget(owner: string, targetId: string): boolean {
    const target = this.state.minions.get(targetId);
    const hero = this.state.players.get(targetId);
    if (target ? target.owner === owner : !hero || targetId === owner) return false;
    const enemy = target ? target.owner : targetId;
    const taunts = this.mine(enemy).filter(m => m.health > 0 && this.hasProperty(m.cardId, 'taunt'));
    return !taunts.length || (!!target && taunts.some(m => m.id === target.id));
  }
  attack(owner: string, input: unknown) {
    if (!this.authorized(owner, input) || typeof input.attackerId !== 'string' || typeof input.targetId !== 'string') return false;
    const attacker = this.state.minions.get(input.attackerId);
    if (!attacker || attacker.owner !== owner || !attacker.ready || attacker.attack <= 0) return false;
    if (!this.legalAttackTarget(owner, input.targetId)) return false;
    const target = this.state.minions.get(input.targetId);
    const hero = this.state.players.get(input.targetId);
    attacker.ready = false;
    this.event('attack', attacker.cardId, attacker.id, input.targetId, attacker.attack);
    if (target) {
      const retaliation = target.attack;
      this.effect(target, 'damage', attacker.attack); this.effect(attacker, 'damage', retaliation);
    } else hero!.health -= attacker.attack;
    this.settle(); this.state.revision++; return true;
  }
  /** Hero powers: damage hits any enemy character (Taunt does not shield from powers), heal is self, summon fills the board. */
  power(owner: string, input: unknown) {
    if (!this.authorized(owner, input)) return false;
    const player = this.state.players.get(owner)!;
    const hero = this.heroes.find(h => h.id === player.heroId), ability = hero?.ability;
    if (!ability || player.powerUsed || player.mana < ability.cost) return false;
    const target = typeof input.targetId === 'string' ? input.targetId : '';
    const minion = this.state.minions.get(target), targetHero = this.state.players.get(target);
    if (ability.effectId === 'damage' && (minion ? minion.owner === owner : !targetHero || target === owner)) return false;
    if (ability.effectId === 'summon' && (!this.cards.has(ability.cardId!) || this.mine(owner).length >= MATCH_RULES.BOARD_LIMIT)) return false;
    if (ability.effectId === 'heal' && player.health >= player.maxHealth) return false;
    player.mana -= ability.cost; player.powerUsed = true;
    this.event('power', '', owner, ability.effectId === 'heal' ? owner : target, ability.amount);
    if (ability.effectId === 'summon') this.summon(owner, ability.cardId!, ability.amount);
    else if (ability.effectId === 'heal') player.health = Math.min(player.maxHealth, player.health + ability.amount);
    else if (minion) this.effect(minion, 'damage', ability.amount);
    else targetHero!.health -= ability.amount;
    this.settle(); this.state.revision++; return true;
  }
  private summon(owner: string, cardId: string, count: number) {
    const card = this.cards.get(cardId); if (!card || card.id === COIN_CARD_ID) return;
    const space = MATCH_RULES.BOARD_LIMIT - this.mine(owner).length;
    for (let n = 0; n < Math.min(count, space); n++) {
      const m = new MinionState(); m.id = `m${++this.serial}`; m.owner = owner; m.cardId = card.id;
      m.attack = card.attack; m.health = m.maxHealth = card.health;
      for (const property of card.properties) this.effect(m, property, 1);
      this.state.minions.set(m.id, m); this.event('spawn', card.id, m.id);
      // Summoning never repeats battlecries, which require playing from hand.
    }
  }
  private effect(m: MinionState, effect: string, amount: number) {
    switch (effect) {
      case 'damage': if (amount > 0) { if (m.shield) m.shield = false; else m.health -= amount; } break;
      case 'heal': m.health = Math.min(m.maxHealth, m.health + amount); break;
      case 'attack': m.attack += amount; break;
      case 'contraceptive': m.shield = true; break;
      case 'offense': m.health = m.maxHealth = 1; break;
      case 'humiliation': m.attack = 1; m.enrageBonus = this.rageBonus(m); break;
      case 'charge': m.ready = true; break;
      // taunt is read from the card definition when a target is checked
    }
  }
  private trigger(source: MinionState, trigger: string) {
    for (const a of this.cards.get(source.cardId)!.abilities.filter(a => a.trigger === trigger)) {
      const amount = Number(a.params.amount);
      if (a.effectId === 'summon') { this.summon(source.owner, String(a.params.cardId), amount); continue; }
      if (a.params.target === 'enemyHero') {
        for (const [id, hero] of this.state.players) if (id !== source.owner) hero.health = a.effectId === 'heal' ? Math.min(hero.maxHealth, hero.health + amount) : hero.health - amount;
      } else {
        const targets = a.params.target === 'self' ? [source] : [...this.state.minions.values()].filter(m => m.owner !== source.owner && m.health > 0);
        for (const m of targets) this.effect(m, a.effectId, amount);
      }
    }
  }
  private rageBonus(m: MinionState) {
    return m.health < m.maxHealth ? this.cards.get(m.cardId)!.abilities.filter(a => a.trigger === 'enrage' && a.effectId === 'attack').reduce((sum, a) => sum + Number(a.params.amount), 0) : 0;
  }
  private settle() {
    // Free all dead slots before resolving deathrattles; summons respect the seven-slot cap.
    for (let wave = 0; wave < 15; wave++) {
      const dead = [...this.state.minions.values()].filter(m => m.health <= 0);
      if (!dead.length) break;
      for (const m of dead) { this.state.minions.delete(m.id); this.event('death', m.cardId, m.id); }
      for (const m of dead) this.trigger(m, 'deathrattle');
    }
    for (const m of [...this.state.minions.values()]) {
      const injured = m.health < m.maxHealth;
      if (injured && !m.enraged) for (const a of this.cards.get(m.cardId)!.abilities) if (a.trigger === 'enrage' && a.effectId === 'summon') this.summon(m.owner, String(a.params.cardId), Number(a.params.amount));
      m.enraged = injured;
      const bonus = this.rageBonus(m);
      m.attack = Math.max(0, m.attack + bonus - m.enrageBonus); m.enrageBonus = bonus;
    }
    const alive = [...this.state.players].filter(([, p]) => p.health > 0);
    if (alive.length < 2) { this.state.status = 'finished'; this.state.winner = alive.length === 1 ? alive[0]![0] : ''; }
  }
}
