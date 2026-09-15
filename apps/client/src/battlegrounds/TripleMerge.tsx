import { useLayoutEffect, useRef } from 'react';
import type { AutoBattlerCatalog } from '@kartishki/shared';
import type { AbMinion } from '../autoBattlerSession';
import { audioManager } from '../AudioManager';
import { MinionTile } from './MinionTile';
import { reducedMotion, spawnBurst, type Box } from './tableFx';

export type TriplePiece = { minion: AbMinion; from: Box; full: boolean };

/** The three consumed copies fly into the new golden card, which flashes as it is born. */
export function TripleMerge({ pieces, to, goldenId, catalog, onDone }: { pieces: TriplePiece[]; to: Box; goldenId: string; catalog: AutoBattlerCatalog; onDone: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  const done = useRef(onDone);
  done.current = onDone;
  useLayoutEffect(() => {
    const node = root.current;
    if (!node || reducedMotion()) { done.current(); return; }
    const golden = document.querySelector<HTMLElement>(`.ab-hand [data-ab-id="${CSS.escape(goldenId)}"], .ab-board [data-ab-id="${CSS.escape(goldenId)}"]`);
    golden?.classList.add('is-unborn');
    const anims = [...node.querySelectorAll<HTMLElement>('.ab-triple-piece')].map((el, i) => {
      const from = pieces[i]!.from;
      const dx = to.x + to.w / 2 - (from.x + from.w / 2), dy = to.y + to.h / 2 - (from.y + from.h / 2);
      return el.animate([
        { transform: 'translate(0,0) scale(1) rotate(0deg)', opacity: 1 },
        { transform: `translate(${dx * .5}px,${dy * .5 - 70}px) scale(.95) rotate(${(i - 1) * 14}deg)`, opacity: 1, offset: .55 },
        { transform: `translate(${dx}px,${dy}px) scale(${to.w / from.w * .9}) rotate(0deg)`, opacity: .2 },
      ], { duration: 460, delay: i * 70, easing: 'cubic-bezier(.35,.6,.25,1)', fill: 'both' });
    });
    let alive = true;
    Promise.all(anims.map(a => a.finished)).then(() => {
      if (!alive) return;
      golden?.classList.remove('is-unborn');
      spawnBurst(to, '#ffd76a', 18);
      audioManager.play('ab_triple');
      golden?.animate([{ transform: 'scale(.6)', filter: 'brightness(2.2)' }, { transform: 'scale(1.12)', filter: 'brightness(1.4)', offset: .6 }, { transform: 'none', filter: 'none' }], { duration: 420, easing: 'cubic-bezier(.2,.9,.3,1.3)' });
      window.setTimeout(() => { if (alive) done.current(); }, 120);
    }).catch(() => {});
    return () => { alive = false; anims.forEach(a => a.cancel()); golden?.classList.remove('is-unborn'); };
  }, []);
  return (
    <div ref={root} className="ab-triple-layer" aria-hidden>
      {pieces.map(piece => (
        <div key={piece.minion.id} className="ab-triple-piece" style={{ left: piece.from.x, top: piece.from.y, width: piece.from.w, height: piece.from.h }}>
          <MinionTile minion={piece.minion} catalog={catalog} ghost fullCard={piece.full} arrive={false} />
        </div>
      ))}
    </div>
  );
}
