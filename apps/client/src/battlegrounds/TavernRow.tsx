import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { AB_LAYOUT, tavernGap } from './battlegroundsLayout';
import { AUTO_BATTLER, type AutoBattlerCatalog } from '@kartishki/shared';
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

function RefreshIcon() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden>
      <path fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" d="M14 30a18 18 0 1 1 4 14" />
      <path fill="currentColor" d="m10 20 10 14-16 2z" />
    </svg>
  );
}

function FrostIcon() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden>
      <path fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" d="M32 6v52M10 19l44 26M10 45l44-26" />
      <path fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" d="m32 14 6-6M32 14l-6-6M32 50l6 6M32 50l-6 6M16 22l-8 1M16 22l2-8M48 42l8-1M48 42l-2 8M16 42l-8-1M16 42l2 8M48 22l8 1M48 22l-2-8" />
    </svg>
  );
}

function UpgradeIcon() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden>
      <path fill="currentColor" d="M32 8 54 34h-12v22H22V34H10z" />
    </svg>
  );
}

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
        <header className="ab-tier-sign">
          <PaperTooltip content={t('abTierHint')}><strong>{t('abTier', { tier: me.tavernTier })} <small>{'★'.repeat(me.tavernTier)}</small></strong></PaperTooltip>
          <PaperTooltip content={t('abTierHint')}>
            <button type="button" className={`ab-tavern-btn is-upgrade ${canUpgrade ? 'is-ready' : ''}`}
              disabled={!canUpgrade} onClick={onTierUp} data-testid="ab-tier-up"
              aria-label={me.tavernTier === 6 ? 'MAX' : `${t('abTierUp')} $${me.upgradeCost}`}>
              <UpgradeIcon />
              {me.tavernTier < 6 && <span>{me.upgradeCost}</span>}
            </button>
          </PaperTooltip>
        </header>
        <div className={`ab-bartender ${dnd?.armed && (dnd.kind === 'board' || dnd.kind === 'hand') ? 'is-sell-ready' : ''} ${sellHot ? 'is-hot' : ''}`} data-testid="ab-sell-zone">
          <Bartender />
          <span>{t('abDealerName')}</span>
          <small role="status" key={reaction}>{reaction ? lines[reaction]?.[i18n.language.startsWith('ru') ? 0 : 1] : t('abSellHint')}</small>
        </div>
        <div className="ab-tavern-ops">
          <button type="button" className={`ab-tavern-btn is-reroll ${canRoll ? 'is-ready' : ''}`}
            disabled={!canRoll} onClick={onReroll} data-testid="ab-reroll" aria-label={t('abReroll')}>
            <RefreshIcon />
            <span>{AUTO_BATTLER.REROLL_COST}</span>
          </button>
          <button type="button" className={`ab-tavern-btn is-freeze ${me.tavern.frozen ? 'is-on' : ''} ${recruit ? 'is-ready' : ''}`}
            disabled={!recruit} onClick={onFreeze} data-testid="ab-freeze"
            aria-pressed={me.tavern.frozen} aria-label={me.tavern.frozen ? t('abFrozen') : t('abFreeze')}>
            <FrostIcon />
          </button>
        </div>
      </div>
      <div className="ab-tavern-row">
        {me.tavern.offers.map((minion, index) => (
          <MinionTile key={minion.id} minion={minion} catalog={catalog}
            actionLabel={aimingTavern ? t('abPowerTarget') : undefined}
            disabled={!recruit || (!aimingTavern && !canBuy)}
            selected={aimingTavern}
            targetDomain="tavern"
            dragKind={recruit && !aimingTavern && canBuy ? 'shop' : undefined}
            dragIndex={index}
            arriveDelay={index * 55}
            onClick={() => onBuy(minion.id)} />
        ))}
      </div>
      {me.tavern.frozen && <span className="ab-frozen-stamp">{t('abFrozen')}</span>}
      {reaction === 'UPGRADE' && <span className="ab-tavern-flourish" data-testid="ab-tavern-flourish" data-stars={me.tavernTier} aria-hidden>{'★'.repeat(me.tavernTier)}</span>}
    </section>
  );
}
