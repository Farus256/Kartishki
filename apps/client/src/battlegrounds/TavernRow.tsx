import { TribesBadge } from './TribesBadge';
import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { AB_LAYOUT, tavernGap } from './battlegroundsLayout';
import { AUTO_BATTLER, type AutoBattlerCatalog } from '@kartishki/shared';
import { Bartender, type BartenderMood } from './Bartender';
import { PaperTooltip } from '../ui/PaperTooltip';
import type { AbMinion, AbPlayer } from '../autoBattlerSession';
import { offerCost } from './abOptimistic';
import { MinionTile } from './MinionTile';
import { useTavernReaction } from './useTavernReaction';
import { useAbDnd } from './abDndContext';

type Props = {
  me: AbPlayer;
  catalog: AutoBattlerCatalog;
  /** Tribes in play at this table (neutral always plays). */
  tribes?: string[];
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

export function TavernRow({ me, catalog, tribes = [], recruit, aimingTavern, onBuy, onReroll, onFreeze, onTierUp, error }: Props) {
  const { t, i18n } = useTranslation();
  const dnd = useAbDnd();
  const reaction = useTavernReaction(me, error);
  const lines: Record<string, [string, string]> = { BUY: ['Хорошая покупка.', 'Good buy.'], SELL: ['Заберу за наличные.', 'Cash on the table.'], REROLL: ['Новая партия.', 'Fresh stock.'], FREEZE: ['Отложу до завтра.', 'Reserved for tomorrow.'], UPGRADE: ['Пускаю в подсобку.', 'The back room is open.'], TRIPLE: ['Три в один. Красиво!', 'Three into one. Nice!'], NO_GOLD: ['Сначала деньги.', 'Cash first.'], PLAYER_WIN: ['Стол твой.', 'Your table.'], PLAYER_LOSS: ['Ещё отыграешься.', 'There is another round.'] };
  const sellHot = dnd?.zone === 'sell';
  const mood: BartenderMood = me.tavern.frozen ? 'frozen'
    : sellHot || reaction === 'BUY' || reaction === 'SELL' || reaction === 'REROLL' ? 'greedy'
    : reaction === 'TRIPLE' || reaction === 'UPGRADE' || reaction === 'PLAYER_WIN' ? 'pleased'
    : reaction === 'NO_GOLD' || reaction === 'PLAYER_LOSS' ? 'sad' : 'neutral';
  const affordable = (offer: AbMinion) => recruit && me.gold >= offerCost(me, offer) && me.hand.length < AUTO_BATTLER.HAND_LIMIT;
  const canRoll = recruit && me.gold >= me.rerollCost;
  const canUpgrade = recruit && me.tavernTier < AUTO_BATTLER.MAX_TIER && me.gold >= me.upgradeCost;

  return (
    <section className={`ab-tavern ${me.tavern.frozen ? 'is-frozen' : ''} reaction-${reaction.toLowerCase()}`} data-testid="ab-tavern" style={{ '--ab-card': `${AB_LAYOUT.TAVERN_W}px`, '--ab-tavern-gap': `${tavernGap(me.tavern.offers.length)}px` } as CSSProperties}>
      <div className="ab-tavern-head">
        <header className="ab-tier-sign">
          <TribesBadge tribes={tribes} copy={catalog.copy} />
          <PaperTooltip content={<><strong>{t('abTier', { tier: me.tavernTier })}</strong><p>{t('abTierHint')}</p></>}>
            <strong className="ab-tier-shield" role="img" aria-label={t('abTier', { tier: me.tavernTier })} data-testid="ab-tier-sign" data-tier={me.tavernTier}>
              <svg viewBox="0 0 100 112" aria-hidden><path d="M50 3 90 16v38c0 26-18 46-40 55C28 100 10 80 10 54V16Z" /><path className="ab-tier-shield-inner" d="M50 11 83 22v32c0 21-15 38-33 46-18-8-33-25-33-46V22Z" /></svg>
              {/* Stars: one row up to three, then two rows (2+2, 3+2, 3+3). The last star is the one the upgrade just lit. */}
              <span className="ab-tier-stars">
                {(me.tavernTier <= 3 ? [me.tavernTier] : [Math.ceil(me.tavernTier / 2), Math.floor(me.tavernTier / 2)]).map((n, row) => (
                  <span key={row}>{Array.from({ length: n }, (_, i) => <i key={i}>★</i>)}</span>
                ))}
              </span>
            </strong>
          </PaperTooltip>
          <PaperTooltip content={t('abTierHint')}>
            <button type="button" className={`ab-tavern-btn is-upgrade ${canUpgrade ? 'is-ready' : ''}`}
              disabled={!canUpgrade} onClick={onTierUp} data-testid="ab-tier-up"
              aria-label={me.tavernTier === 6 ? 'MAX' : `${t('abTierUp')} $${me.upgradeCost}`}>
              <UpgradeIcon />
              <span>{me.tavernTier < AUTO_BATTLER.MAX_TIER ? me.upgradeCost : 'MAX'}</span>
            </button>
          </PaperTooltip>
        </header>
        <div className={`ab-bartender ${dnd?.armed && (dnd.kind === 'board' || dnd.kind === 'hand') ? 'is-sell-ready' : ''} ${sellHot ? 'is-hot' : ''}`} data-testid="ab-sell-zone">
          <Bartender mood={mood} />
          {sellHot && <b className="ab-sell-tag" aria-hidden>+{me.sellReward}$</b>}
          <span>{t('abDealerName')}</span>
          <small role="status" key={reaction}>{reaction ? lines[reaction]?.[i18n.language.startsWith('ru') ? 0 : 1] : t('abSellHint')}</small>
        </div>
        <div className="ab-tavern-ops">
          <button type="button" className={`ab-tavern-btn is-reroll ${canRoll ? 'is-ready' : ''}`}
            disabled={!canRoll} onClick={onReroll} data-testid="ab-reroll" aria-label={t('abReroll')}>
            <RefreshIcon />
            <span>{me.rerollCost}</span>
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
            actionLabel={aimingTavern && minion.kind !== 'spell' ? t('abPowerTarget') : undefined}
            disabled={!recruit || (!aimingTavern && !affordable(minion))}
            selected={aimingTavern && minion.kind !== 'spell'}
            targetDomain="tavern"
            price={minion.kind === 'spell' ? offerCost(me, minion) : undefined}
            dragKind={recruit && !aimingTavern && affordable(minion) ? 'shop' : undefined}
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
