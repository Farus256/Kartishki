import { useTranslation } from 'react-i18next';
import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { motion } from 'framer-motion';
import { shopPrizeLabel, WHEEL_MANUAL_COST, type ShopPrize } from '@kartishki/shared';
import { useEconomy } from '../EconomyContext';
import { SlotMachine } from './SlotMachine';

const TINT = ['#e8dcc4', '#d7c07a', '#c5d0b0', '#d2b8a4', '#cbb98a', '#d4c8e0', '#c07a5a'];
const LABEL_ROOM: Record<number, number> = { 500: 8, 1000: 8, 5000: 6 };
type Slice = ReturnType<typeof wheelGradient>[number];

function wheelGradient(prizes: ShopPrize[]) {
  const total = prizes.reduce((sum, prize) => sum + prize.weight, 0) || 1;
  const natural = prizes.map(prize => prize.weight / total * 360);
  const floor = prizes.map((prize, i) => Math.max(natural[i]!, LABEL_ROOM[prize.amount] ?? 0));
  const extra = floor.reduce((sum, size) => sum + size, 0) - 360;
  const slack = floor.map((size, i) => size - (LABEL_ROOM[prizes[i]!.amount] ?? 0));
  const slackSum = slack.reduce((sum, size) => sum + size, 0) || 1;
  const sizes = extra > 0 ? floor.map((size, i) => size - extra * (slack[i]! / slackSum)) : floor;
  let angle = 0;
  return prizes.map((prize, i) => {
    const size = sizes[i]!;
    const start = angle;
    angle += size;
    return { prize, start, size, mid: start + size / 2, color: TINT[i % TINT.length]! };
  });
}
function prizeMark(prize: ShopPrize) {
  if (prize.kind === 'currency') return `$${prize.amount}`;
  if (prize.kind === 'xp') return 'XP';
  return '◆';
}
function labelStyle(slice: { size: number; mid: number }) {
  const turn = ((slice.mid % 360) + 360) % 360;
  const radial = slice.size < 30;
  return {
    className: `fortune-label${radial ? ' is-radial' : slice.size < 40 ? ' is-tight' : ''}`,
    style: { '--mid': `${slice.mid}deg`, '--tip': `${turn > 90 && turn < 270 ? -90 : 90}deg` } as CSSProperties,
  };
}
function norm360(deg: number) {
  return ((deg % 360) + 360) % 360;
}
function landingRotation(mid: number, from: number, turns = 6) {
  const want = norm360(360 - mid);
  const cur = norm360(from);
  let delta = want - cur;
  if (delta <= 40) delta += 360;
  return from + turns * 360 + delta;
}
function prizeUnderPointer(rotation: number, slices: Slice[]) {
  const a = norm360(360 - rotation);
  const hit = slices.findIndex(slice => a >= slice.start && a < slice.start + slice.size);
  return hit >= 0 ? hit : slices.length - 1;
}
/** Soft friction so the wheel eases to a stop instead of snapping. */
function coastStop(deg: number, velocity: number) {
  let v = Math.sign(velocity) * Math.max(Math.abs(velocity), 3.2);
  let cur = deg;
  while (Math.abs(v) > 0.04) {
    cur += v;
    v *= 0.994;
  }
  return cur;
}
function spinSeconds(from: number, to: number) {
  return Math.min(5.4, Math.max(2.8, Math.abs(to - from) / 380));
}
const WHEEL_EASE: [number, number, number, number] = [0.05, 0.92, 0.08, 1];

function pointerAngle(el: HTMLElement, clientX: number, clientY: number) {
  const box = el.getBoundingClientRect();
  return Math.atan2(clientY - (box.top + box.height / 2), clientX - (box.left + box.width / 2)) * 180 / Math.PI;
}

function FortuneWheel({
  slices, angle, spinTo, dragging, canDrag, onAngle, onDragEnd, onSpinEnd,
}: {
  slices: Slice[];
  angle: number;
  spinTo: number | null;
  dragging: boolean;
  canDrag: boolean;
  onAngle: (deg: number) => void;
  onDragEnd: (deg: number, velocity: number) => void;
  onSpinEnd: (deg: number) => void;
}) {
  const wheelRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ last: number; angle: number; at: number; vel: number } | null>(null);
  const paint = { background: `conic-gradient(${slices.map(slice => `${slice.color} ${slice.start}deg ${slice.start + slice.size}deg`).join(',')})` };
  const face = <>
    {slices.map((slice, i) => <i key={`spoke-${i}`} className="fortune-spoke" style={{ transform: `rotate(${slice.start}deg)` }} />)}
    {slices.map((slice, i) => {
      const label = labelStyle(slice);
      return <span key={i} className={label.className} style={label.style}>
        <b>{prizeMark(slice.prize)}</b>
        {slice.prize.kind !== 'currency' && slice.size >= 30 ? shopPrizeLabel(slice.prize) : null}
      </span>;
    })}
  </>;
  const busy = spinTo != null;

  function down(event: ReactPointerEvent<HTMLDivElement>) {
    if (!canDrag || busy || !wheelRef.current) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const a = pointerAngle(wheelRef.current, event.clientX, event.clientY);
    drag.current = { last: a, angle, at: performance.now(), vel: 0 };
  }
  function move(event: ReactPointerEvent<HTMLDivElement>) {
    if (!drag.current || !wheelRef.current) return;
    const a = pointerAngle(wheelRef.current, event.clientX, event.clientY);
    let delta = a - drag.current.last;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    const now = performance.now();
    const dt = Math.max(8, now - drag.current.at);
    drag.current.vel = delta / dt * 16;
    drag.current.last = a;
    drag.current.at = now;
    drag.current.angle += delta;
    onAngle(drag.current.angle);
  }
  function up() {
    if (!drag.current) return;
    const { angle: deg, vel } = drag.current;
    drag.current = null;
    onDragEnd(deg, vel);
  }

  return <div className={`fortune-stage${canDrag && !busy ? ' is-draggable' : ''}${dragging ? ' is-dragging' : ''}`}>
    <i className="fortune-pointer" aria-hidden />
    <motion.div
      ref={wheelRef}
      className="fortune-wheel"
      style={paint}
      animate={{ rotate: spinTo ?? angle }}
      transition={spinTo != null
        ? { duration: spinSeconds(angle, spinTo), ease: WHEEL_EASE }
        : { duration: 0 }}
      onAnimationComplete={() => { if (spinTo != null) onSpinEnd(spinTo); }}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
    >{face}</motion.div>
    <span className="fortune-hub" aria-hidden>◆</span>
  </div>;
}

export function CasinoGames() {
  const { t } = useTranslation();
  const economy = useEconomy();
  const slots = economy.shop.products.find(item => item.kind === 'slots');
  const wheel = economy.shop.products.find(item => item.kind === 'wheel');
  const [game, setGame] = useState<'slots' | 'wheel'>('slots');
  const [angle, setAngle] = useState(0);
  const [spinTo, setSpinTo] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const angleRef = useRef(0);
  const spun = useRef(false);
  const opening = economy.opening?.kind === 'casino' ? economy.opening : undefined;
  const mode = economy.opening?.kind === 'slots' ? 'slots' : opening || game === 'wheel' ? 'wheel' : game;
  const slices = useMemo(() => wheelGradient(wheel?.prizes ?? []), [wheel]);
  const busy = !!opening || spinTo != null || dragging;
  const canManual = !!wheel && !busy && economy.dollars >= WHEEL_MANUAL_COST;

  useEffect(() => { angleRef.current = angle; }, [angle]);

  function finishWin() {
    void economy.settleCasino();
  }

  useEffect(() => {
    if (!opening || spinTo != null || spun.current) return;
    if (opening.result.cost === WHEEL_MANUAL_COST) {
      spun.current = true;
      return;
    }
    spun.current = true;
    setSpinTo(landingRotation(slices[opening.result.prizeIndex]?.mid ?? 0, angleRef.current));
  }, [opening?.result.prizeIndex, opening?.result.cost, spinTo, slices]);

  useEffect(() => {
    if (!opening) spun.current = false;
  }, [opening]);

  async function playAuto() {
    if (!wheel || busy) return;
    await economy.playCasino(wheel.id);
  }

  function onSpinEnd(deg: number) {
    setAngle(deg);
    angleRef.current = deg;
    setSpinTo(null);
    finishWin();
  }

  function onDragEnd(deg: number, velocity: number) {
    if (!wheel || Math.abs(velocity) < 2.2 || economy.dollars < WHEEL_MANUAL_COST || opening) {
      setDragging(false);
      setAngle(deg);
      angleRef.current = deg;
      return;
    }
    const final = coastStop(deg, velocity);
    const land = prizeUnderPointer(final, slices);
    void economy.playCasino(wheel.id, land).then(ok => {
      if (!ok) {
        setDragging(false);
        setAngle(deg);
        angleRef.current = deg;
        return;
      }
      setDragging(false);
      setAngle(deg);
      angleRef.current = deg;
      setSpinTo(final);
    });
  }

  return <div className="casino-shell">
    <div className="casino-games">
      {slots && <button type="button" className={mode === 'slots' ? 'is-selected' : ''} aria-pressed={mode === 'slots'} disabled={!!economy.opening && mode !== 'slots'} onClick={() => setGame('slots')}>
        <span>▣</span><strong>{slots.name}</strong><small>{t('slotsBets')}</small>
      </button>}
      {wheel && <button type="button" className={mode === 'wheel' ? 'is-selected' : ''} aria-pressed={mode === 'wheel'} disabled={!!economy.opening && mode !== 'wheel'} onClick={() => setGame('wheel')}>
        <span>◉</span><strong>{wheel.name}</strong><small>{t('perTry', { cost: wheel.cost })}</small>
      </button>}
    </div>
    {mode === 'slots' ? <SlotMachine /> : !wheel ? null : <div className="casino-layout fortune-layout">
      <FortuneWheel
        slices={slices}
        angle={angle}
        spinTo={spinTo}
        dragging={dragging}
        canDrag={canManual}
        onAngle={deg => { setDragging(true); setAngle(deg); }}
        onDragEnd={onDragEnd}
        onSpinEnd={onSpinEnd}
      />
      <div className="fortune-controls">
        <button
          type="button"
          className="fortune-spin"
          aria-label={t('spinFor', { cost: wheel.cost })}
          disabled={busy || economy.dollars < wheel.cost}
          onClick={() => void playAuto()}
        >
          <span className="fortune-spin-icon" aria-hidden>↻</span>
          <strong>${wheel.cost}</strong>
        </button>
        <p className="fortune-manual-hint">{t('wheelManualHint', { cost: WHEEL_MANUAL_COST })}</p>
      </div>
    </div>}
  </div>;
}
