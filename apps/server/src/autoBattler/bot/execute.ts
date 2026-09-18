import { ok, type ActionResult } from '../errors';
import { tryBuy, tryDiscoverPick, tryFreeze, tryHeroPower, tryMoveBoard, tryPlayCard, tryReroll, trySell, tryTierUp, type RecruitDeps } from '../recruit';
import type { BotAction } from './BattlegroundsBot';

/** A bot action goes through exactly the same rule functions a client message does. */
export function executeBotAction(deps: RecruitDeps, action: BotAction): ActionResult {
  switch (action.kind) {
    case 'discoverPick': return tryDiscoverPick(deps, action.optionId);
    case 'play': return tryPlayCard(deps, action.cardId, action.boardIndex);
    case 'sell': return trySell(deps, action.minionId);
    case 'buy': return tryBuy(deps, action.offerId);
    case 'tierUp': return tryTierUp(deps.player);
    case 'heroPower': return tryHeroPower(deps, action.targetId);
    case 'reroll': return tryReroll(deps);
    case 'freeze': return tryFreeze(deps.player);
    case 'move': return tryMoveBoard(deps.player, action.minionId, action.toIndex);
    case 'end': return ok();
  }
}
