import { randomInt } from 'node:crypto';
import { DECK_SIZE, MinionState, type MatchState, type CardDefinition, type HandCard, type GameEvent } from '@kartishki/shared';
import { advancePhase } from './rules';

export class Battle {
  readonly hands = new Map<string, HandCard[]>();
  private decks = new Map<string, string[]>();
  private fatigue = new Map<string, number>();
  private serial = 0;
  private eventId = 0;
  readonly cards: Map<string, CardDefinition>;
  constructor(readonly state: MatchState, definitions: CardDefinition[], private emit: (event: GameEvent) => void = () => {}) {
    this.cards = new Map(definitions.map(c => [c.id, c]));
  }
  start(selectedDecks = new Map<string, string[]>()) {
    for (const id of this.state.players.keys()) {
      const ids = [...this.cards.keys()].slice(-DECK_SIZE);
      const deck = selectedDecks.has(id) ? [...selectedDecks.get(id)!] : Array.from({ length: DECK_SIZE }, (_, n) => ids[n % ids.length]);
      if (deck.length !== DECK_SIZE || deck.some(cardId => !this.cards.has(cardId))) throw new Error('Invalid match deck');
      for (let n = deck.length - 1; n > 0; n--) { const j = randomInt(n + 1); [deck[n], deck[j]] = [deck[j], deck[n]]; }
      this.decks.set(id, deck); this.hands.set(id, []);
      for (let n = 0; n < 3; n++) this.draw(id);
    }
    this.draw(this.state.activePlayer);
  }
  private event(kind: GameEvent['kind'], cardId: string, source: string, target?: string) {
    this.emit({ id: ++this.eventId, kind, cardId, source, target });
  }
  private draw(owner: string) {
    const player = this.state.players.get(owner)!; const deck = this.decks.get(owner)!; const hand = this.hands.get(owner)!;
    const cardId = deck.pop();
    if (!cardId) { const amount = (this.fatigue.get(owner) ?? 0) + 1; this.fatigue.set(owner, amount); player.health -= amount; }
    else if (hand.length < 10) { hand.push({ instanceId: `h${++this.serial}`, cardId }); }
    player.handCount = hand.length; player.deckCount = deck.length;
    // Draw events never include card IDs: only the owner receives hand contents.
    this.event('draw', '', owner);
  }
  private authorized(owner: string, input: unknown): input is Record<string, unknown> {
    return this.state.status === 'active' && this.state.activePlayer === owner && this.state.players.has(owner)
      && !!input && typeof input === 'object' && 'expectedRevision' in input && input.expectedRevision === this.state.revision;
  }
  advance(owner: string, input: unknown) {
    const before = this.state.activePlayer;
    if (!advancePhase(this.state, owner, input)) return false;
    if (before !== this.state.activePlayer) {
      for (const minion of this.state.minions.values()) if (minion.owner === this.state.activePlayer) minion.ready = true;
      this.draw(this.state.activePlayer); this.settle();
    }
    return true;
  }
  play(owner: string, input: unknown) {
    if (!this.authorized(owner, input) || this.state.phase !== 'main' || typeof input.instanceId !== 'string') return false;
    const hand = this.hands.get(owner)!; const index = hand.findIndex(c => c.instanceId === input.instanceId);
    if (index < 0 || [...this.state.minions.values()].filter(m => m.owner === owner).length >= 7) return false;
    const card = this.cards.get(hand[index].cardId)!; const player = this.state.players.get(owner)!;
    if (player.mana < card.cost) return false;
    player.mana -= card.cost; hand.splice(index, 1); player.handCount = hand.length;
    const m = new MinionState(); m.id = `m${++this.serial}`; m.owner = owner; m.cardId = card.id;
    m.attack = card.attack; m.health = m.maxHealth = card.health;
    for (const property of card.properties) this.effect(m, property, 1);
    this.state.minions.set(m.id, m); this.event('spawn', card.id, m.id);
    this.trigger(m, 'battlecry'); this.settle(); this.state.revision++; return true;
  }
  attack(owner: string, input: unknown) {
    if (!this.authorized(owner, input) || this.state.phase !== 'combat' || typeof input.attackerId !== 'string' || typeof input.targetId !== 'string') return false;
    const attacker = this.state.minions.get(input.attackerId);
    if (!attacker || attacker.owner !== owner || !attacker.ready || attacker.attack <= 0) return false;
    const target = this.state.minions.get(input.targetId);
    const hero = this.state.players.get(input.targetId);
    if (target ? target.owner === owner : !hero || input.targetId === owner) return false;
    attacker.ready = false;
    this.event('attack', attacker.cardId, attacker.id, input.targetId);
    if (target) {
      const retaliation = target.attack;
      this.effect(target, 'damage', attacker.attack); this.effect(attacker, 'damage', retaliation);
    } else hero!.health -= attacker.attack;
    this.settle(); this.state.revision++; return true;
  }
  private effect(m: MinionState, effect: string, amount: number) {
    switch (effect) {
      case 'damage': if (amount > 0) { if (m.shield) m.shield = false; else m.health -= amount; } break;
      case 'heal': m.health = Math.min(m.maxHealth, m.health + amount); break;
      case 'attack': m.attack += amount; break;
      case 'contraceptive': m.shield = true; break;
      case 'offense': m.health = m.maxHealth = 1; break;
      case 'humiliation': m.attack = 1; m.enrageBonus = this.rageBonus(m); break;
    }
  }
  private trigger(source: MinionState, trigger: string) {
    for (const a of this.cards.get(source.cardId)!.abilities.filter(a => a.trigger === trigger)) {
      const amount = Number(a.params.amount);
      if (a.params.target === 'enemyHero') {
        for (const [id, hero] of this.state.players) if (id !== source.owner) hero.health = a.effectId === 'heal' ? Math.min(30, hero.health + amount) : hero.health - amount;
      } else {
        const targets = a.params.target === 'self' ? [source] : [...this.state.minions.values()].filter(m => m.owner !== source.owner && m.health > 0);
        for (const m of targets) this.effect(m, a.effectId, amount);
      }
    }
  }
  private rageBonus(m: MinionState) {
    return m.health < m.maxHealth ? this.cards.get(m.cardId)!.abilities.filter(a => a.trigger === 'enrage').reduce((sum, a) => sum + Number(a.params.amount), 0) : 0;
  }
  private settle() {
    // Remove each simultaneous death group before its deathrattles. No resurrection/summon effects yet.
    for (let wave = 0; wave < 15; wave++) {
      const dead = [...this.state.minions.values()].filter(m => m.health <= 0);
      if (!dead.length) break;
      for (const m of dead) { this.state.minions.delete(m.id); this.event('death', m.cardId, m.id); }
      for (const m of dead) this.trigger(m, 'deathrattle');
    }
    for (const m of this.state.minions.values()) {
      const bonus = this.rageBonus(m);
      m.attack = Math.max(0, m.attack + bonus - m.enrageBonus); m.enrageBonus = bonus;
    }
    const alive = [...this.state.players].filter(([,p]) => p.health > 0);
    if (alive.length < 2) { this.state.status = 'finished'; this.state.winner = alive.length === 1 ? alive[0][0] : ''; }
  }
}
