import { AUTO_BATTLER } from '@kartishki/shared';
import type { AbMinion, AbPlayer } from '../autoBattlerSession';
import { isSpell } from './minionView';

/**
 * Recruit intents applied locally before the server echoes them, so a drop lands
 * the same frame it is released. Pure and id-preserving: the server keeps minion
 * ids across buy/play/move, so the echo simply confirms what is already on screen.
 * Returns the player unchanged when the server would reject the action.
 */
export type OptimisticIntent =
  | { type: 'buy'; id: string }
  | { type: 'play'; id: string; index?: number }
  | { type: 'move'; id: string; index: number }
  | { type: 'sell'; id: string };

function without(list: AbMinion[], id: string): [AbMinion | undefined, AbMinion[]] {
  const found = list.find(item => item.id === id);
  return [found, found ? list.filter(item => item.id !== id) : list];
}

function insert(list: AbMinion[], index: number, item: AbMinion): AbMinion[] {
  const at = Math.max(0, Math.min(list.length, index));
  return [...list.slice(0, at), item, ...list.slice(at)];
}

export function applyOptimistic(me: AbPlayer, intent: OptimisticIntent): AbPlayer {
  switch (intent.type) {
    case 'buy': {
      const [offer, offers] = without(me.tavern.offers, intent.id);
      if (!offer || me.gold < me.buyCost || me.hand.length >= AUTO_BATTLER.HAND_LIMIT) return me;
      return { ...me, gold: me.gold - me.buyCost, tavern: { ...me.tavern, offers }, hand: [...me.hand, { ...offer, owner: me.sessionId }] };
    }
    case 'sell': {
      const [fromBoard, board] = without(me.board, intent.id);
      const [fromHand, hand] = without(me.hand, intent.id);
      const card = fromBoard ?? fromHand;
      if (!card || isSpell(card)) return me;
      return { ...me, gold: me.gold + AUTO_BATTLER.SELL_REWARD, board, hand };
    }
    case 'play': {
      const [card, hand] = without(me.hand, intent.id);
      // Spells open a discover; the server owns that flow.
      if (!card || isSpell(card) || me.board.length >= AUTO_BATTLER.BOARD_LIMIT) return me;
      return { ...me, hand, board: insert(me.board, intent.index ?? me.board.length, card) };
    }
    case 'move': {
      const [card, board] = without(me.board, intent.id);
      if (!card || intent.index < 0 || intent.index >= me.board.length) return me;
      return { ...me, board: insert(board, intent.index, card) };
    }
  }
}
