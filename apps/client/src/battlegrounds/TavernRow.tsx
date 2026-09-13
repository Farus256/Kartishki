import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { AB_LAYOUT, tavernGap } from './battlegroundsLayout';
import { AUTO_BATTLER, type AutoBattlerCatalog } from '@kartishki/shared';
import { InkButton } from '../ui/InkButton';
import { Bartender } from './Bartender';
import { PaperTooltip } from '../ui/PaperTooltip';
import type { AbPlayer } from '../autoBattlerSession';
import { MinionTile } from './MinionTile';
import { useTavernReaction } from './useTavernReaction';
import { useAbDnd } from './abDndContext';

type Props = {
  me: AbPlayer;
  catalog: AutoBattlerCatalog;
  recruit: boolean;
  aimingTavern: boolean;
  onBuy: (id: string) => void;
  onReroll: () => void;
  onFreeze: () => void;
  onTierUp: () => void;
  error?: string;
};

export function TavernRow({ me, catalog, recruit, aimingTavern, onBuy, onReroll, onFreeze, onTierUp, error }: Props) {
  const { t, i18n } = useTranslation();
  const dnd = useAbDnd();
  const reaction = useTavernReaction(me, error);
  const lines: Record<string, [string, string]> = { BUY: ['Хорошая покупка.', 'Good buy.'], SELL: ['Заберу за наличные.', 'Cash on the table.'], REROLL: ['Новая партия.', 'Fresh stock.'], FREEZE: ['Отложу до завтра.', 'Reserved for tomorrow.'], UPGRADE: ['Пускаю в подсобку.', 'The back room is open.'], TRIPLE: ['Три в один. Красиво!', 'Three into one. Nice!'], NO_GOLD: ['Сначала деньги.', 'Cash first.'], PLAYER_WIN: ['Стол твой.', 'Your table.'], PLAYER_LOSS: ['Ещё отыграешься.', 'There is another round.'] };
  const sellHot = dnd?.zone === 'sell';
  const canBuy = recruit && me.gold >= AUTO_BATTLER.BUY_COST && me.hand.length < AUTO_BATTLER.HAND_LIMIT;
  const canRoll = recruit && me.gold >= AUTO_BATTLER.REROLL_COST;
  const canUpgrade = recruit && me.tavernTier < AUTO_BATTLER.MAX_TIER && me.gold >= me.upgradeCost;

  return (
    <section className={`ab-tavern ${me.tavern.frozen ? 'is-frozen' : ''} reaction-${reaction.toLowerCase()}`} data-testid="ab-tavern" style={{ '--ab-card': `${AB_LAYOUT.TAVERN_W}px`, '--ab-tavern-gap': `${tavernGap(me.tavern.offers.length)}px` } as CSSProperties}>
      <div className="ab-tavern-head">
        <header className="ab-tier-sign" key={me.tavernTier}>
          <PaperTooltip content={t('abTierHint')}><strong>{t('abTier', { tier: me.tavernTier })} <small>{'★'.repeat(me.tavernTier)}</small></strong></PaperTooltip>
          <InkButton size="sm" tone="gold" disabled={!canUpgrade} onClick={onTierUp}>
            {me.tavernTier === 6 ? 'MAX' : `${t('abTierUp')} $${me.upgradeCost}`}
          </InkButton>
        </header>
        <div className={`ab-bartender ${dnd?.armed && (dnd.kind === 'board' || dnd.kind === 'hand') ? 'is-sell-ready' : ''} ${sellHot ? 'is-hot' : ''}`} data-testid="ab-sell-zone">
          <Bartender />
          <span>{t('abDealerName')}</span>
          <small role="status" key={reaction}>{reaction ? lines[reaction]?.[i18n.language.startsWith('ru') ? 0 : 1] : t('abSellHint')}</small>
        </div>
        <div className="ab-tavern-ops">
          <InkButton size="sm" disabled={!canRoll} onClick={onReroll}>{t('abReroll')}</InkButton>
          <InkButton size="sm" tone={me.tavern.frozen ? 'gold' : 'paper'} disabled={!recruit} onClick={onFreeze}>
            {me.tavern.frozen ? t('abFrozen') : t('abFreeze')}
          </InkButton>
        </div>
      </div>
      <div className="ab-tavern-row">
        {me.tavern.offers.map((minion, index) => (
          <MinionTile key={minion.id} minion={minion} catalog={catalog}
            actionLabel={aimingTavern ? t('abPowerTarget') : undefined}
            disabled={!recruit || (!aimingTavern && !canBuy)}
            selected={aimingTavern}
            targetDomain="tavern"
            dragKind={recruit && !aimingTavern ? 'shop' : undefined}
            dragIndex={index}
            arriveDelay={index * 55}
            onClick={() => onBuy(minion.id)} />
        ))}
      </div>
      {me.tavern.frozen && <span className="ab-frozen-stamp">{t('abFrozen')}</span>}
      {reaction==='UPGRADE'&&<span key={me.tavernTier} className="ab-tavern-flourish" aria-hidden>★ {'★'.repeat(me.tavernTier)} ★</span>}
    </section>
  );
}
