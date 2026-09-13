import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { AUTO_BATTLER, type AutoBattlerCatalog } from '@kartishki/shared';
import type { AbMinion, AbPlayer } from '../autoBattlerSession';
import { AB_LAYOUT, handOverlap } from './battlegroundsLayout';
import { isSpell } from './minionView';
import { MinionTile } from './MinionTile';

type Props = {
  me: AbPlayer;
  catalog: AutoBattlerCatalog;
  recruit: boolean;
  onPlay: (id: string) => void;
};

export function HandRow({ me, catalog, recruit, onPlay }: Props) {
  const { t } = useTranslation();
  const full = me.board.length >= AUTO_BATTLER.BOARD_LIMIT;
  return (
    <section className="ab-hand" data-testid="ab-hand" style={{ '--ab-card': `${AB_LAYOUT.HAND_W}px`, '--ab-hand-overlap': `${handOverlap(me.hand.length)}px` } as CSSProperties}>
      {me.hand.map((card: AbMinion, index) => {
        const spell = isSpell(card);
        return (
          <MinionTile key={card.id} minion={card} catalog={catalog} fullCard arrive={false} fan={index - (me.hand.length - 1) / 2}
            actionLabel={spell ? t('abDiscover') : undefined}
            disabled={!recruit || (!spell && full)}
            dragKind={recruit ? 'hand' : undefined}
            dragIndex={index}
            arriveDelay={index * 40}
            onClick={() => onPlay(card.id)} />
        );
      })}
    </section>
  );
}
