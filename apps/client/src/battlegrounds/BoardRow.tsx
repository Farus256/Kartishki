import { useLayoutEffect, useRef, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import type { AutoBattlerCatalog } from '@kartishki/shared';
import type { AbPlayer } from '../autoBattlerSession';
import { AB_LAYOUT, lineGap } from './battlegroundsLayout';
import { previewBoard } from './pointerDnd';
import { MinionTile } from './MinionTile';
import { useAbDnd } from './abDndContext';

type Props = {
  me: AbPlayer;
  catalog: AutoBattlerCatalog;
  recruit: boolean;
  aimingBoard: boolean;
  onActivate: (id: string) => void;
};

export function BoardRow({ me, catalog, recruit, aimingBoard, onActivate }: Props) {
  const { t } = useTranslation();
  const dnd = useAbDnd();
  const boardDrag = !!(dnd?.armed && dnd.kind === 'board' && dnd.zone === 'board');
  const handPreview = !!(dnd?.armed && dnd.kind === 'hand' && dnd.zone === 'board' && me.board.length < 7);
  const previewing = boardDrag || handPreview;
  const remaining = boardDrag && dnd.draggingId
    ? me.board.filter(minion => minion.id !== dnd.draggingId)
    : me.board;
  const gapAt = previewing && dnd.previewIndex !== null
    ? Math.max(0, Math.min(remaining.length, dnd.previewIndex))
    : null;
  const handSlots = handPreview ? previewBoard(me.board, null, dnd.previewIndex) : null;
  const count = handSlots?.length ?? (gapAt === null ? Math.max(1, me.board.length) : remaining.length + 1);
  const root = useRef<HTMLElement>(null);
  const prev = useRef(new Map<string, number>());
  const orderKey = handSlots
    ? handSlots.map(minion => minion?.id ?? '').join(',')
    : `${remaining.map(minion => minion.id).join(',')}|${gapAt ?? ''}`;
  useLayoutEffect(() => {
    const node = root.current;
    if (!node) return;
    const next = new Map<string, number>();
    node.querySelectorAll<HTMLElement>('[data-ab-id]').forEach(el => {
      if (el.closest('.ab-drag-hold')) return;
      const id = el.dataset.abId;
      if (!id) return;
      const slot = el.closest('.ab-slot');
      if (!slot) return;
      const x = slot.getBoundingClientRect().left;
      next.set(id, x);
      const prior = prev.current.get(id);
      if (prior !== undefined) {
        const scale = node.getBoundingClientRect().width / node.offsetWidth;
        const dx = (prior - x) / scale;
        if (Math.abs(dx) > 2 && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
          el.getAnimations().forEach(animation => animation.cancel());
          el.animate([{ transform: `translateX(${dx}px)` }, { transform: 'none' }], { duration: AB_LAYOUT.SLIDE_MS, easing: 'ease-out' });
        }
      }
    });
    prev.current = next;
  }, [orderKey]);

  const tile = (minion: AbPlayer['board'][number]) => (
    <MinionTile minion={minion} catalog={catalog}
      actionLabel={aimingBoard ? t('abPowerTarget') : undefined}
      selected={aimingBoard}
      targetDomain="board"
      disabled={!recruit}
      arrive={false}
      dragKind={recruit && !aimingBoard ? 'board' : undefined}
      dragIndex={me.board.findIndex(item => item.id === minion.id)}
      onClick={() => onActivate(minion.id)} />
  );

  return (
    <section
      ref={root}
      className="ab-board"
      title={t('abOrderHint')}
      data-testid="ab-board"
      data-preview-index={previewing ? String(dnd.previewIndex ?? '') : ''}
      data-board-count={String(me.board.length)}
      style={{ '--ab-card': `${AB_LAYOUT.MINION_W}px`, '--ab-line-gap': `${lineGap(count)}px` } as CSSProperties}
    >
      {handSlots ? handSlots.map((minion, index) => (
        <div key={minion?.id ?? `gap-${index}`}
          className={`ab-slot ${!minion ? 'is-gap' : ''}`}
          data-testid={`ab-board-slot-${index}`}
          data-ab-slot={index}>
          {minion ? tile(minion) : null}
        </div>
      )) : (
        <>
          {me.board.map(minion => {
            const hold = boardDrag && minion.id === dnd.draggingId;
            const remainIndex = remaining.findIndex(item => item.id === minion.id);
            const order = hold || gapAt === null ? remainIndex : remainIndex >= gapAt ? remainIndex + 1 : remainIndex;
            return (
              <div key={minion.id}
                className={hold ? 'ab-drag-hold' : 'ab-slot'}
                style={hold ? undefined : { order }}
                data-testid={hold ? undefined : `ab-board-slot-${order}`}
                data-ab-slot={hold ? undefined : order}>
                {tile(minion)}
              </div>
            );
          })}
          {gapAt !== null && (
            <div key="gap" className="ab-slot is-gap" style={{ order: gapAt }}
              data-testid={`ab-board-slot-${gapAt}`} data-ab-slot={gapAt} />
          )}
          {!me.board.length && (
            <div className="ab-slot is-well" data-testid="ab-board-slot-0" data-ab-slot={0} />
          )}
        </>
      )}
      <div className="ab-board-end" data-testid="ab-board-end" />
    </section>
  );
}
