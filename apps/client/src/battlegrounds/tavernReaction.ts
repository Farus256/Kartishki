export type TavernSnap = {
  sessionId: string;
  gold: number;
  tavernTier: number;
  tripleSerial: number;
  lastCombatResult: string;
  frozen: boolean;
  offerCount: number;
  offer0?: string;
  pieces: number;
  board: number;
};

export function detectTavernReaction(p: TavernSnap | undefined, me: TavernSnap, error?: string) {
  if (error === 'NOT_ENOUGH_GOLD' || error === 'HERO_POWER_UNAFFORDABLE') return 'NO_GOLD';
  if (!p || p.sessionId !== me.sessionId) return '';
  if (me.tripleSerial > p.tripleSerial) return 'TRIPLE';
  if (me.tavernTier > p.tavernTier) return 'UPGRADE';
  if (me.lastCombatResult !== p.lastCombatResult) return me.lastCombatResult === 'win' ? 'PLAYER_WIN' : me.lastCombatResult === 'loss' ? 'PLAYER_LOSS' : '';
  if (me.frozen !== p.frozen && me.frozen) return 'FREEZE';
  if (me.offerCount < p.offerCount && me.gold < p.gold) return 'BUY';
  if (me.pieces < p.pieces && me.gold > p.gold) return 'SELL';
  if (me.offer0 !== p.offer0 && me.gold < p.gold) return 'REROLL';
  if (me.board > p.board) return 'PLACE';
  return '';
}
