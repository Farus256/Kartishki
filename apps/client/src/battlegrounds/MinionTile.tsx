import { createContext, useContext, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { abCopyName, printedStats, type AutoBattlerCatalog } from '@kartishki/shared';
import type { AbMinion, AbPlayer } from '../autoBattlerSession';
import type { AbDragKind } from './pointerDnd';
import { isSpell, KEYWORD_MARK, minionDossierLines, minionName, minionTribeLabel } from './minionView';
import { useCardArt } from '../ui/cardArt';
import { PaperTooltip } from '../ui/PaperTooltip';
import { illustrationUrl } from './illustrations';
import { useAbDnd } from './abDndContext';
import { AnimatedNumber } from './AnimatedNumber';

export type BuffKind = 'power' | 'ability' | 'card';
const BuffFlashContext = createContext<ReadonlyMap<string, BuffKind>>(new Map());

function classifyBuffs(prev: AbPlayer | undefined, me: AbPlayer): Map<string, BuffKind> {
  const out = new Map<string, BuffKind>();
  if (!prev || prev.sessionId !== me.sessionId) return out;
  const power = !prev.power.isExhausted && me.power.isExhausted;
  const played = me.board.length > prev.board.length;
  const pack = (p: AbPlayer) => [...p.board, ...p.hand, ...p.tavern.offers];
  const before = new Map(pack(prev).map(m => [m.id, m]));
  for (const m of pack(me)) {
    const old = before.get(m.id);
    if (!old || (m.attack <= old.attack && m.health <= old.health)) continue;
    out.set(m.id, power ? 'power' : played ? 'card' : 'ability');
  }
  return out;
}

export function BuffFlashProvider({ me, children }: { me?: AbPlayer; children: ReactNode }) {
  const prev = useRef<AbPlayer | undefined>(undefined);
  const [flashes, setFlashes] = useState<ReadonlyMap<string, BuffKind>>(new Map());
  useEffect(() => {
    if (!me) { prev.current = undefined; return; }
    const next = classifyBuffs(prev.current, me);
    prev.current = me;
    if (!next.size) return;
    setFlashes(next);
    const timer = setTimeout(() => setFlashes(new Map()), 1100);
    return () => clearTimeout(timer);
  }, [me]);
  return <BuffFlashContext.Provider value={flashes}>{children}</BuffFlashContext.Provider>;
}

function SwordIcon() {
  return <svg className="ab-stat-icon is-sword" viewBox="0 0 64 72" aria-hidden>
    <path className="ab-attack-blade" d="M5 3 18 7 50 49 43 55 11 15Z" />
    <path className="ab-sword-edge" d="M10 9 44 49" />
    <path className="ab-attack-hilt" d="m38 48 17-11 4 6-17 12Zm7 5 6-4 9 15-6 4Z" />
    <circle className="ab-attack-rim" cx="29" cy="43" r="23" />
    <circle className="ab-attack-disc" cx="29" cy="43" r="18.5" />
    <path className="ab-attack-shine" d="M14 42a15 15 0 0 1 18-14" />
  </svg>;
}
export function HeartIcon() {
  return <svg className="ab-stat-icon is-heart" viewBox="0 0 56 64" aria-hidden>
    <path d="M28 60C14 48 4 36 4 22 4 11 12 5 20 6c5 1 7 5 8 10 1-5 3-9 8-10 8-1 16 5 16 16 0 14-14 26-24 38z" />
  </svg>;
}

function MinionDossier({ minion, catalog }: { minion: AbMinion; catalog: AutoBattlerCatalog }) {
  const { i18n, t } = useTranslation();
  const spell = isSpell(minion);
  const def = catalog.minions.find(m => m.id === minion.cardId);
  const printed = def ? printedStats(def, minion.golden) : undefined;
  const art = useCardArt(def?.art ?? { url: '', crop: { x: .5, y: .5, size: 1 }, threshold: .5, contrast: 1 });
  const name = minionName(minion.cardId, catalog, i18n.language);
  const tribes = minionTribeLabel(def, catalog, i18n.language, t);
  const lines = minionDossierLines(minion, catalog, i18n.language, t);
  const tone = (now: number, base?: number) => base === undefined || now === base ? '' : now > base ? ' is-buffed' : ' is-nerfed';
  return (
    <article className={`ab-dossier ${minion.golden ? 'is-golden' : ''} ${spell ? 'is-spell' : ''}`} data-testid="ab-dossier">
      <span className="ab-dossier-stars">{'★'.repeat(minion.tavernTier)}</span>
      <div className="ab-dossier-art">{spell ? <span className="ab-reward-mark">Ⅲ<br />★</span> : <img src={def?.art?.url && art ? art : illustrationUrl(minion.cardId)} alt="" />}</div>
      <h3 className="ab-dossier-name">{name}</h3>
      <div className="ab-dossier-text">
        {lines.map(line => <p key={line}>{line}</p>)}
      </div>
      <footer className="ab-dossier-foot">
        {!spell && <b className={tone(minion.attack, printed?.attack)}><SwordIcon />{minion.attack}</b>}
        <span className="ab-dossier-tribe">{tribes}</span>
        {!spell && <i className={tone(minion.health, printed?.health)}><HeartIcon />{minion.health}</i>}
      </footer>
    </article>
  );
}

type Props = {
  minion: AbMinion;
  catalog: AutoBattlerCatalog;
  actionLabel?: string;
  disabled?: boolean;
  selected?: boolean;
  dragKind?: AbDragKind;
  dragIndex?: number;
  targetDomain?: 'board' | 'tavern';
  ghost?: boolean;
  arrive?: boolean;
  arriveDelay?: number;
  fullCard?: boolean;
  fan?: number;
  onClick?: () => void;
};

export function MinionTile({ minion, catalog, actionLabel, disabled, selected, dragKind, dragIndex, targetDomain, ghost, arrive = true, arriveDelay = 0, fullCard = false, fan = 0, onClick }: Props) {
  const { i18n, t } = useTranslation();
  const dnd = useAbDnd();
  const flash = useContext(BuffFlashContext).get(minion.id);
  const spell = isSpell(minion);
  const def = catalog.minions.find(m => m.id === minion.cardId);
  const printed = def ? printedStats(def, minion.golden) : undefined;
  const art = useCardArt(def?.art ?? { url: '', crop: { x: .5, y: .5, size: 1 }, threshold: .5, contrast: 1 });
  const name = minionName(minion.cardId, catalog, i18n.language);
  const tone = (now: number, base?: number) => base === undefined || now === base ? '' : now > base ? ' is-buffed' : ' is-nerfed';
  const canDrag = !!dragKind && !ghost;
  const lifted = !ghost && dnd?.armed && dnd.draggingId === minion.id && dnd.kind !== 'shop';
  const shopLift = !ghost && dnd?.armed && dnd.draggingId === minion.id && dnd.kind === 'shop';
  const isTarget = !ghost && dnd?.kind === 'power' && dnd.targetId === minion.id;
  const dim = !ghost && dnd?.kind === 'power' && dnd.armed && !isTarget;
  return (
    <PaperTooltip className={`ab-minion-wrap ${!ghost && arrive ? 'is-arrive' : ''} ${flash ? `is-buff-${flash}` : ''}`} data-buff={flash} style={{ animationDelay: `${arriveDelay}ms`, '--fan-r': fan * 1.1, '--fan-y': Math.abs(fan) * 1.5 } as CSSProperties} placement="right" boxClassName="paper-tooltip is-dossier" delay={220} content={ghost || dnd?.armed ? null : <MinionDossier minion={minion} catalog={catalog} />}>
      <button type="button" aria-label={`${name}${actionLabel ? ' · ' + actionLabel : ''}`}
        className={`ab-minion ${fullCard ? 'is-full-card' : 'is-token'} ${minion.golden ? 'is-golden' : ''} ${spell ? 'is-spell' : ''} ${selected ? 'is-selected' : ''} ${canDrag ? 'is-draggable' : ''} ${lifted ? 'is-lifted' : ''} ${shopLift ? 'is-shop-lift' : ''} ${isTarget ? 'is-target' : ''} ${dim ? 'is-dim' : ''}`}
        aria-disabled={!!disabled}
        data-ab-id={minion.id}
        data-keywords={minion.keywords.join(' ')}
        data-ab-target={targetDomain}
        onDragStart={event => event.preventDefault()}
        onPointerDown={event => {
          if (!canDrag || !dragKind || !dnd) return;
          dnd.begin({ kind: dragKind, id: minion.id, index: dragIndex ?? 0 }, event);
        }}
        onClick={event => { if (!disabled && !dnd?.didDrag(event.currentTarget)) onClick?.(); }}
        data-testid={`ab-minion-${minion.id}`}>
        <span className="ab-minion-art">{spell ? <span className="ab-reward-mark">Ⅲ<br />★</span> : <img src={def?.art?.url && art ? art : illustrationUrl(minion.cardId)} alt="" draggable={false} />}</span>
        <span className="ab-minion-tier">{spell ? '★' : minion.tavernTier}</span>
        {minion.keywords.includes('divineShield') && <span className="ab-shield-bubble" aria-hidden="true" />}
        {minion.keywords.includes('windfury') && <span className="ab-wind" aria-hidden="true"><i /><i /><i /></span>}
        <span className="ab-minion-name">{name}</span>
        {!spell && (
          <span className="ab-minion-stats">
            <b className={tone(minion.attack, printed?.attack)} aria-label={`${t('attack')}: ${minion.attack}`}>
              <SwordIcon />
              <AnimatedNumber value={minion.attack} />
            </b>
            <i className={tone(minion.health, printed?.health)} aria-label={`${t('health')}: ${minion.health}`}>
              <HeartIcon />
              <AnimatedNumber value={minion.health} />
            </i>
          </span>
        )}
        <span className="ab-minion-keys">
          {[...minion.keywords].map(key => <em key={key} data-keyword={key} aria-label={abCopyName(catalog.copy, 'keywords', key, i18n.language, t(`abKeyword_${key}`))}>{KEYWORD_MARK[key] ?? key[0]}</em>)}
        </span>
        {actionLabel && <span className="ab-minion-act">{actionLabel}</span>}
      </button>
    </PaperTooltip>
  );
}
