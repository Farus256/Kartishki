import { useLayoutEffect, useRef, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import type { AutoBattlerCatalog } from '@kartishki/shared';
import type { AbPlayer } from '../autoBattlerSession';
import { AB_LAYOUT, tavernGap } from './battlegroundsLayout';
import { AB_DND } from './pointerDnd';
import { MinionTile } from './MinionTile';
import { useAbDnd } from './abDndContext';

type Props = {
  me: AbPlayer;
  catalog: AutoBattlerCatalog;
  recruit: boolean;
  aimingBoard: boolean;
  selectedId?: string | null;
  onActivate: (id: string) => void;
};

export function BoardRow({ me, catalog, recruit, aimingBoard, selectedId, onActivate }: Props) {
  const { t } = useTranslation();
  const dnd = useAbDnd();
  // While armed the dragged minion leaves the line (hidden hold) and a hole opens at the preview index.
  // On release the local board already holds the new order, so the hole simply becomes that tile's slot.
  const dragging = dnd?.armed ? dnd.draggingId : null;
  const remaining = dragging ? me.board.filter(minion => minion.id !== dragging) : me.board;
  const previewIndex = dragging && dnd && dnd.zone === 'board' && (dnd.kind === 'board' || dnd.kind === 'hand') && remaining.length < AB_DND.MAX_BOARD
    ? dnd.previewIndex : null;
  const previewing = previewIndex !== null;
  const gapAt = previewIndex !== null ? Math.max(0, Math.min(remaining.length, previewIndex)) : null;
  const count = gapAt === null ? Math.max(1, me.board.length) : remaining.length + 1;
  const root = useRef<HTMLElement>(null);
  const prev = useRef(new Map<string, number>());
  const orderKey = `${remaining.map(minion => minion.id).join(',')}|${gapAt ?? ''}`;
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

  return (
    <section
      ref={root}
      className="ab-board"
      data-testid="ab-board"
      data-preview-index={previewIndex !== null ? String(previewIndex) : ''}
      data-board-count={String(me.board.length)}
      style={{ '--ab-card': `${AB_LAYOUT.MINION_W}px`, '--ab-line-gap': `${tavernGap(count)}px` } as CSSProperties}
    >
      {me.board.map((minion, index) => {
        const hold = previewing && minion.id === dragging;
        const remainIndex = remaining.findIndex(item => item.id === minion.id);
        const order = hold || gapAt === null ? remainIndex : remainIndex >= gapAt ? remainIndex + 1 : remainIndex;
        return (
          <div key={minion.id}
            className={hold ? 'ab-drag-hold' : 'ab-slot'}
            style={hold ? undefined : { order }}
            data-testid={hold ? undefined : `ab-board-slot-${order}`}
            data-ab-slot={hold ? undefined : order}>
            <MinionTile minion={minion} catalog={catalog}
              actionLabel={aimingBoard ? t('abPowerTarget') : undefined}
              selected={aimingBoard || minion.id === selectedId}
              targetDomain="board"
              disabled={!recruit}
              arrive={false}
              dragKind={recruit && !aimingBoard ? 'board' : undefined}
              dragIndex={index}
              onClick={() => onActivate(minion.id)} />
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
      <div className="ab-board-end" data-testid="ab-board-end" />
    </section>
  );
}
