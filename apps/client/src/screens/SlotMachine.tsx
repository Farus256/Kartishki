import { useTranslation } from 'react-i18next';
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';

import { motion } from 'framer-motion';

import {
  SLOT_BETS,
  scaleSlot,
  slotPaylines,
  slotStake,
  type SlotPayline,
} from '@kartishki/shared';

import { useEconomy } from '../EconomyContext';
import { audioManager } from '../AudioManager';

import face0 from '../assets/slots/00.png';
import face1 from '../assets/slots/01.png';
import face2 from '../assets/slots/02.png';
import face3 from '../assets/slots/03.png';
import face4 from '../assets/slots/04.png';
import face5 from '../assets/slots/05.png';
import face6 from '../assets/slots/06.png';
import face7 from '../assets/slots/07.png';

export const SLOT_FACES = [
  face0,
  face1,
  face2,
  face3,
  face4,
  face5,
  face6,
  face7,
];

/** One symbol row. Three rows show per reel; the pay line is the middle one. */
const CELL = 104;
const ROWS = 3;
/** Strip offset that puts symbol `r` on the middle row (the rows above and below are its real strip neighbours). */
const rowY = (r: number) => -(r - 1) * CELL;

/**
 * Winning paylines drawn over the reels: the middle row is the only line, so each win is a stroke through the centres
 * of its reels (a split pair crosses the middle reel) with a ring around every paying symbol. The overlay measures the
 * reels grid (3 columns, 10px gaps) so rings stay round and the line meets the real column centres at any width.
 */
function PaylineOverlay({ lines }: { lines: SlotPayline[] }) {
  const ref = useRef<SVGSVGElement>(null);
  const [box, setBox] = useState({ w: 300, h: CELL * ROWS });
  useEffect(() => {
    const el = ref.current?.parentElement;
    if (!el) return;
    const read = () => setBox({ w: el.clientWidth || 300, h: el.clientHeight || CELL * ROWS });
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const gap = 10, col = (box.w - gap * 2) / 3;
  const cx = (reel: number) => col * (reel + 0.5) + gap * reel;
  const cy = CELL * 1.5;
  return (
    <svg ref={ref} className="slot-paylines" viewBox={`0 0 ${box.w} ${box.h}`} aria-hidden data-testid="slot-paylines">
      {lines.map(line => {
        const reels = [...line.reels].sort((a, b) => a - b);
        const d = reels.map((r, i) => `${i ? 'L' : 'M'}${cx(r)} ${cy}`).join(' ');
        return <g key={line.symbol} data-reels={reels.join(',')}>
          <path className="slot-payline-ink" d={d} />
          <path className="slot-payline" d={d} />
          {reels.map(r => <circle key={r} className="slot-payline-ring" cx={cx(r)} cy={cy} r={CELL * 0.46} />)}
        </g>;
      })}
    </svg>
  );
}

type Bill = {
  id: string;
  dx: string;
  dy: string;
  rot: string;
  delay: string;
  scale: string;
};

function typing(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tag = target.tagName;

  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    target.isContentEditable
  );
}

const slotStyles = `
.slot-layout,
.slot-layout * {
  box-sizing: border-box;
}

.slot-layout {
  width: min(1340px, 100%) !important;
  max-width: 100% !important;

  margin: 0 auto !important;

  padding: 8px 8px 28px !important;

  display: grid !important;
  grid-template-columns:
    minmax(0, 1.2fr)
    minmax(300px, 380px) !important;

  align-items: start !important;

  gap: 28px !important;

  overflow: visible !important;
}

.slot-machine {
  position: relative !important;

  width: 100% !important;
  max-width: 100% !important;
  min-width: 0 !important;

  /*
   * Критично для вылетающих денег.
   */
  overflow: visible !important;

  z-index: 5;
}

.slot-machine .bulb-row {
  max-width: 100%;
  overflow: visible;
}

.slot-machine .bulb-row span {
  width: 15px !important;
  height: 15px !important;
  border-radius: 50% !important;
  transform: none !important;
  background: #f6d56a !important;
  border: 2px solid #49422e !important;
  box-shadow: 0 0 10px #ffcf43, 0 0 18px #f5a62388 !important;
  animation: slot-bulb-glow 2.2s ease-in-out infinite !important;
}

.slot-machine .bulb-row span:nth-child(odd) {
  animation-delay: .45s !important;
}

.slot-machine.is-jackpot .bulb-row span {
  background: #fff1a0 !important;
  border-color: #a85a12 !important;
  animation: slot-bulb-jackpot .28s ease-in-out infinite !important;
}

.slot-machine.is-jackpot .bulb-row span:nth-child(odd) {
  animation-delay: .14s !important;
}

.slot-machine.is-jackpot .bulb-row span:nth-child(3n) {
  animation-delay: .07s !important;
}

@keyframes slot-bulb-glow {
  0%, 100% {
    background: #f3d877;
    box-shadow: 0 0 8px #ffcf43, 0 0 16px #f5a62388;
  }
  50% {
    background: #ffe9a8;
    box-shadow: 0 0 16px #ffe27a, 0 0 28px #f5a623cc;
  }
}

@keyframes slot-bulb-jackpot {
  0%, 100% {
    background: #ffd24a;
    box-shadow: 0 0 6px #ffcf43, 0 0 14px #f5a62388;
    filter: brightness(.85);
  }
  50% {
    background: #fff7c8;
    box-shadow: 0 0 22px #ffe27a, 0 0 40px #ff8a1acc, 0 0 8px #fff;
    filter: brightness(1.35);
  }
}

.slot-machine h2 {
  max-width: 100%;
  text-align: center;
  font-size: 52px !important;
  letter-spacing: 3px !important;
  margin: 4px 0 14px !important;
}

.slot-machine .reels {
  position: relative;

  width: 100% !important;
  max-width: 100% !important;
  min-width: 0 !important;

  display: grid !important;
  grid-template-columns: repeat(3, minmax(0, 1fr)) !important;

  gap: 10px !important;

  overflow: hidden !important;
}

.slot-machine .reels { position: relative !important; }
/* Paylines: gold ink over the glass, drawn in after the drums settle; cleared by the next spin. */
.slot-machine .slot-paylines { position: absolute; inset: 0; z-index: 4; width: 100%; height: 100%; pointer-events: none; overflow: visible; }
.slot-machine .slot-payline, .slot-machine .slot-payline-ink { fill: none; stroke-linecap: round; stroke-linejoin: round; stroke-dasharray: 900; stroke-dashoffset: 900; animation: slot-payline-draw .7s ease-out forwards; }
.slot-machine .slot-payline-ink { stroke: #1a1a1a; stroke-width: 9px; opacity: .55; }
.slot-machine .slot-payline { stroke: #f5a623; stroke-width: 5px; filter: drop-shadow(0 0 6px #f5a623aa); }
.slot-machine .slot-payline-ring { fill: none; stroke: #f5a623; stroke-width: 4px; opacity: 0; transform-box: fill-box; transform-origin: center; animation: slot-payline-ring .45s ease-out .5s forwards; }
@keyframes slot-payline-draw { to { stroke-dashoffset: 0; } }
@keyframes slot-payline-ring { from { opacity: 0; transform: scale(.7); } to { opacity: .85; transform: scale(1); } }
@media (prefers-reduced-motion: reduce) { .slot-machine .slot-payline, .slot-machine .slot-payline-ink { animation: none; stroke-dashoffset: 0; } .slot-machine .slot-payline-ring { animation: none; opacity: .85; } }

.slot-machine .reel-window {
  position: relative;

  width: 100% !important;
  min-width: 0 !important;

  height: ${CELL * ROWS}px !important;

  overflow: hidden !important;
  /* Glass: the pay line sits in the middle band, the rows above and below fade like a real drum. */
  background: linear-gradient(#8f8977, #c9c3b4 18%, #f1ebdd 34% 66%, #c9c3b4 82%, #8f8977) !important;
}

.slot-machine .reel-window::before,
.slot-machine .reel-window::after {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  height: 3px;
  z-index: 3;
  background: #b3150e;
  box-shadow: 0 0 6px #ff6a55aa;
  opacity: .85;
  pointer-events: none;
}

.slot-machine .reel-window::before { top: ${CELL}px; }
.slot-machine .reel-window::after { top: ${CELL * 2 - 3}px; }


/* The landed symbol on the pay line pulses once the reels stop. */
.slot-machine .reels.is-settled .reel-window.is-win .reel-strip {
  animation: slot-win-pulse .55s ease-in-out 3;
}

@keyframes slot-win-pulse {
  50% { filter: brightness(1.35); }
}

.slot-machine .reel-sym {
  width: 100% !important;
  height: ${CELL}px !important;

  display: flex !important;
  align-items: center !important;
  justify-content: center !important;

  overflow: hidden !important;
}

.slot-machine .reel-sym img {
  display: block;

  width: auto !important;
  height: auto !important;

  max-width: 92% !important;
  max-height: 92% !important;

  object-fit: contain;
}

/* ------------------------- */
/* Нижняя панель автомата    */
/* ------------------------- */

.slot-machine .slot-bottom {
  width: 100% !important;
  max-width: 100% !important;
  min-width: 0 !important;

  display: grid !important;

  grid-template-columns:
    minmax(160px, auto)
    minmax(0, 1fr)
    148px !important;

  align-items: center !important;

  gap: 12px !important;
  padding: 8px 6px 10px 0 !important;

  overflow: visible !important;
}

.slot-bet {
  min-width: 0;

  display: flex;
  align-items: center;
  justify-content: flex-start;

  gap: 8px;
}

.slot-bet button {
  flex: 0 0 auto;
}

.slot-bet strong {
  min-width: 60px;
  text-align: center;
}

.slot-status {
  min-width: 0 !important;

  margin: 0 !important;

  text-align: center;

  overflow-wrap: anywhere;
}

/* ------------------------- */
/* КРУГЛАЯ КНОПКА SPIN       */
/* ------------------------- */

.slot-spin {
  justify-self: end !important;

  width: 132px !important;
  height: 132px !important;

  min-width: 132px !important;
  min-height: 132px !important;

  max-width: 132px !important;
  max-height: 132px !important;

  padding: 0 !important;
  margin: 0 !important;

  border: 4px solid var(--ink) !important;
  border-radius: 50% !important;

  background: var(--blood) !important;
  color: var(--paper) !important;

  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;

  white-space: nowrap;

  font: 28px/1 var(--font-stencil) !important;
  letter-spacing: 0.06em;

  box-shadow:
    5px 7px 0 var(--ink),
    0 10px 18px rgba(0, 0, 0, 0.28) !important;

  transform: translateY(0);
  overflow: visible !important;

  transition:
    transform 100ms ease,
    box-shadow 100ms ease !important;
}

.slot-spin:not(:disabled):hover {
  transform: translateY(-2px);
}

.slot-spin:disabled {
  opacity: .5;
  cursor: not-allowed;
}

.slot-spin:not(:disabled):active {
  transform: translateY(5px);

  box-shadow:
    0 3px 0 rgba(77, 10, 10, 0.95),
    0 6px 12px rgba(0, 0, 0, 0.3) !important;
}

/* ------------------------- */
/* ПРАВАЯ ПОДСКАЗКА          */
/* ------------------------- */

.slot-rules {
  position: relative !important;

  width: 100% !important;
  max-width: 100% !important;
  min-width: 0 !important;

  max-height: none !important;

  overflow: visible !important;

  padding: 10px 8px !important;

  font-size: 14px !important;
  line-height: 1.15 !important;

  z-index: 2;
}

.slot-pay {
  width: 100% !important;
  max-width: 100% !important;
  min-width: 0 !important;

  margin: 0 !important;
  padding: 0 !important;

  list-style: none !important;

  display: grid !important;
  grid-template-columns: 1fr 1fr !important;

  gap: 4px 10px !important;

  max-height: none !important;
  overflow: visible !important;
}

.slot-pay li {
  width: 100% !important;
  min-width: 0 !important;
  min-height: 0 !important;

  margin: 0 !important;
  padding: 2px 0 !important;

  display: grid !important;

  grid-template-columns:
    36px
    minmax(0, 1fr) !important;

  grid-template-areas:
    "icon pair"
    "icon triple";

  align-items: center !important;

  column-gap: 6px !important;
  row-gap: 0 !important;
}

.slot-pay li img {
  grid-area: icon;

  display: block !important;

  width: 34px !important;
  height: 34px !important;

  max-width: 34px !important;
  max-height: 34px !important;

  object-fit: contain !important;
}

.slot-pay li span {
  min-width: 0 !important;

  font: 15px/1.1 var(--font-hand) !important;

  white-space: nowrap !important;
}

.slot-pay li span:first-of-type {
  grid-area: pair;
}

.slot-pay li span:last-of-type {
  grid-area: triple;
}

.slot-pay li b {
  font: 16px/1 var(--font-stencil) !important;
}

/* ------------------------- */
/* ВЫЛЕТАЮЩИЕ ДЕНЬГИ         */
/* ------------------------- */

.coin-slot {
  position: relative !important;

  left: auto !important;
  bottom: auto !important;

  width: 220px !important;
  height: 18px !important;

  margin: 10px auto 0 !important;

  transform: none !important;

  overflow: visible !important;

  pointer-events: none !important;

  z-index: 20 !important;
}

.slot-bill {
  position: absolute !important;

  left: 50% !important;
  top: 50% !important;

  width: 68px !important;
  height: 31px !important;

  margin-left: -34px !important;
  margin-top: -15px !important;

  display: flex !important;
  align-items: center !important;
  justify-content: center !important;

  overflow: hidden;

  border:
    2px solid
    #17451f !important;

  border-radius: 4px !important;

  background:
    linear-gradient(
      135deg,
      #76b86b 0%,
      #b6dc91 35%,
      #91c47d 58%,
      #69a960 100%
    ) !important;

  color: #17451f !important;

  box-shadow:
    0 3px 7px rgba(0, 0, 0, 0.38) !important;

  font-family:
    Georgia,
    "Times New Roman",
    serif !important;

  font-size: 19px !important;
  font-style: normal !important;
  font-weight: 900 !important;

  pointer-events: none !important;

  opacity: 0;

  z-index: 1001 !important;

  transform-origin: center;

  animation:
    slot-money-fly
    1.45s
    cubic-bezier(.14, .72, .2, 1)
    var(--delay)
    forwards !important;
}

/* Детали банкноты */

.slot-bill::before {
  content: "";

  position: absolute;

  inset: 3px;

  border:
    1px solid
    rgba(23, 69, 31, 0.55);

  border-radius: 2px;

  pointer-events: none;
}

.slot-bill::after {
  content: "";

  position: absolute;

  left: 7px;
  right: 7px;
  top: 50%;

  height: 16px;

  transform: translateY(-50%);

  border-left:
    2px solid
    rgba(23, 69, 31, 0.45);

  border-right:
    2px solid
    rgba(23, 69, 31, 0.45);

  pointer-events: none;
}

.slot-bill span {
  position: relative;

  z-index: 3;

  width: 23px;
  height: 23px;

  display: flex;
  align-items: center;
  justify-content: center;

  border:
    1px solid
    rgba(23, 69, 31, 0.55);

  border-radius: 50%;

  background:
    rgba(255, 255, 225, 0.17);

  line-height: 1;
}

@keyframes slot-money-fly {
  0% {
    opacity: 0;

    transform:
      translate(0, 0)
      rotate(0deg)
      scale(.45);
  }

  10% {
    opacity: 1;
  }

  100% {
    opacity: 0;

    transform:
      translate(
        var(--dx),
        var(--dy)
      )
      rotate(var(--rot))
      scale(var(--bill-scale));
  }
}

/* ------------------------- */
/* RESPONSIVE                */
/* ------------------------- */

@media (max-width: 950px) {
  .slot-layout {
    grid-template-columns: 1fr !important;

    width: min(720px, 100%) !important;
  }

  .slot-rules {
    position: static !important;
  }

  .slot-pay {
    grid-template-columns: 1fr 1fr !important;
  }

  .slot-pay li {
    grid-template-columns: 36px minmax(0, 1fr) !important;
  }
}

@media (max-width: 650px) {
  .slot-layout {
    padding:
      24px
      8px
      14px !important;
  }

  .slot-machine .reels {
    gap: 4px !important;
  }

  .slot-machine .slot-bottom {
    grid-template-columns:
      1fr
      140px !important;
  }

  .slot-status {
    grid-column: 1 / -1;

    grid-row: 2;

    width: 100%;

    text-align: center;
  }

  .slot-spin {
    width: 120px !important;
    height: 120px !important;

    min-width: 120px !important;
    min-height: 120px !important;

    max-width: 120px !important;
    max-height: 120px !important;

    font-size: 22px !important;
  }

  .slot-pay {
    grid-template-columns: 1fr 1fr !important;
  }
}
`;

export function SlotMachine() {
  const { t } = useTranslation();
  const economy = useEconomy();

  const product =
    economy.shop.products.find(
      product =>
        product.kind === 'slots',
    );

  const base =
    product?.cost ?? 50;

  const [bet, setBet] =
    useState(50);

  const [result, setResult] =
    useState('');

  const [reels, setReels] =
    useState([0, 0, 0]);

  const [round, setRound] =
    useState(0);

  const [bills, setBills] =
    useState<Bill[]>([]);

  const [jackpot, setJackpot] =
    useState(false);

  /** Reels whose pay-line symbol is part of the paying pair/triple (lit once the drums stop). */
  const [win, setWin] = useState<number[]>([]);
  /** Paylines of the settled spin (from the server result), drawn over the reels until the next spin. */
  const [lines, setLines] = useState<SlotPayline[]>([]);

  const opening =
    economy.opening?.kind ===
    'slots'
      ? economy.opening
      : undefined;

  const locked =
    useRef(false);

  const holding =
    useRef(false);

  const settled =
    useRef(false);

  /** Blocks late onAnimationComplete from a finished spin after autospin starts. */
  const spinLive =
    useRef(0);

  const stopSpin =
    useRef<() => void>(
      () => {},
    );

  const billTimer =
    useRef(0);

  const jackpotTimer =
    useRef(0);

  const spinRef =
    useRef<
      () => Promise<void>
    >(async () => {});

  const spinning =
    !!opening;

  const stake =
    slotStake(bet);

  const canSpin =
    !spinning &&
    economy.dollars >= stake;

  const pay = (
    table: number[],
    index: number,
  ) =>
    scaleSlot(
      table[index] ?? 0,
      stake,
      base,
    );

  const betIndex =
    SLOT_BETS.indexOf(
      stake as typeof SLOT_BETS[number],
    );

  function nudge(
    direction: number,
  ) {
    setBet(current => {
      const currentStake =
        slotStake(
          current,
        ) as typeof SLOT_BETS[number];

      const currentIndex =
        SLOT_BETS.indexOf(
          currentStake,
        );

      const nextIndex =
        Math.max(
          0,
          Math.min(
            SLOT_BETS.length - 1,
            currentIndex +
              direction,
          ),
        );

      return SLOT_BETS[
        nextIndex
      ]!;
    });
  }

  async function spin() {
    if (
      locked.current ||
      opening ||
      economy.dollars < stake
    ) {
      if (
        economy.dollars <
        stake
      ) {
        holding.current =
          false;
      }

      return;
    }

    locked.current = true;

    const started =
      await economy.spin(stake);

    if (!started) {
      locked.current = false;
      holding.current = false;

      return;
    }

    setWin([]);
    setLines([]);
    setRound(
      current =>
        current + 1,
    );
  }

  spinRef.current = spin;

  /*
   * Звук вращения + токен текущего спина.
   */

  useEffect(() => {
    if (!opening) {
      spinLive.current = 0;
      return;
    }

    spinLive.current += 1;
    settled.current = false;

    stopSpin.current =
      audioManager.play(
        'reels_spin',
        true,
      );

    return () => {
      stopSpin.current();
    };
  }, [opening]);

  /*
   * Автоспин после полного settle —
   * небольшая пауза, чтобы framer не
   * добил прошлый onAnimationComplete
   * уже на новый opening.
   */

  useEffect(() => {
    if (opening) {
      return;
    }

    locked.current = false;

    if (!holding.current) {
      return;
    }

    const timer = window.setTimeout(() => {
      if (holding.current) {
        void spinRef.current();
      }
    }, 280);

    return () => window.clearTimeout(timer);
  }, [opening]);

  /*
   * Управление пробелом.
   */

  useEffect(() => {
    function down(
      event: KeyboardEvent,
    ) {
      if (
        event.code !==
          'Space' &&
        event.key !== ' '
      ) {
        return;
      }

      if (
        typing(
          event.target,
        ) ||
        event.repeat
      ) {
        return;
      }

      event.preventDefault();

      holding.current =
        true;

      void spinRef.current();
    }

    function up(
      event: KeyboardEvent,
    ) {
      if (
        event.code !==
          'Space' &&
        event.key !== ' '
      ) {
        return;
      }

      holding.current =
        false;
    }

    function blur() {
      holding.current =
        false;
    }

    window.addEventListener(
      'keydown',
      down,
    );

    window.addEventListener(
      'keyup',
      up,
    );

    window.addEventListener(
      'blur',
      blur,
    );

    return () => {
      holding.current =
        false;

      window.clearTimeout(
        billTimer.current,
      );
      window.clearTimeout(
        jackpotTimer.current,
      );

      window.removeEventListener(
        'keydown',
        down,
      );

      window.removeEventListener(
        'keyup',
        up,
      );

      window.removeEventListener(
        'blur',
        blur,
      );
    };
  }, []);

  /*
   * Купюры: 1 шт. на каждые $25,
   * чтобы $25 заметно меньше $50.
   */

  function payout(
    amount: number,
  ) {
    window.clearTimeout(
      billTimer.current,
    );
    window.clearTimeout(
      jackpotTimer.current,
    );

    if (amount <= 0) {
      setBills([]);
      setJackpot(false);
      return;
    }

    const billCount =
      Math.max(
        1,
        Math.min(
          40,
          Math.round(amount / 25),
        ),
      );

    if (amount >= 900) {
      setJackpot(true);
      audioManager.play('slots_big');
      jackpotTimer.current =
        window.setTimeout(
          () => setJackpot(false),
          4200,
        );
    } else {
      setJackpot(false);
    }

    const nextBills =
      Array.from(
        {
          length:
            billCount,
        },
        (_, index) => {
          const horizontal =
            Math.round(
              Math.random() *
                360 -
                180,
            );

          const vertical =
            Math.round(
              70 +
                Math.random() *
                  150,
            );

          const rotation =
            Math.round(
              Math.random() *
                120 -
                60,
            );

          const delay =
            (
              Math.random() *
              Math.min(0.55, billCount * 0.012)
            ).toFixed(2);

          const billScale =
            (
              0.82 +
              Math.random() *
                0.36
            ).toFixed(2);

          return {
            id:
              `${round}-${index}-` +
              `${Math.random()}`,

            dx:
              `${horizontal}px`,

            dy:
              `${vertical}px`,

            rot:
              `${rotation}deg`,

            delay:
              `${delay}s`,

            scale:
              billScale,
          };
        },
      );

    setBills(
      nextBills,
    );

    billTimer.current =
      window.setTimeout(
        () =>
          setBills([]),
        1900 + billCount * 18,
      );
  }

  function stopped(
    index: number,
  ) {
    if (
      !opening ||
      settled.current ||
      !spinLive.current
    ) {
      return;
    }

    audioManager.play(
      'reel_land',
    );

    if (index !== 2) {
      return;
    }

    settled.current = true;
    spinLive.current = 0;

    stopSpin.current();

    setResult(
      opening.label,
    );

    setReels(
      opening.reels.slice(
        0,
        3,
      ),
    );

    const reward =
      opening.result
        .rewards[0];

    const money =
      reward?.kind ===
      'currency'
        ? reward.amount
        : 0;

    const landed = opening.reels.slice(0, 3);
    setWin(money > 0 ? landed.flatMap((r, i) => r === opening.result.prizeIndex ? [i] : []) : []);
    setLines(slotPaylines({ ...opening.result, reels: landed }));
    payout(money);

    void economy.settleSlot();
  }

  return (
    <>
      <style>
        {slotStyles}
      </style>

      <div className="slot-layout">
        <div className={`slot-machine${jackpot ? ' is-jackpot' : ''}`}>
          <div className="bulb-row">
            {Array.from(
              {
                length: 16,
              },
              (_, index) => (
                <span
                  key={
                    index
                  }
                />
              ),
            )}
          </div>

          <h2>
            {product?.name ?? t('slotsDefaultName')}
          </h2>

          <div
            className={`reels${!spinning && win.length ? ' is-settled' : ''}`}
            aria-label={t('threeReels')}
            aria-busy={
              spinning
            }
          >
            {[0, 1, 2].map(
              reelIndex => (
                <div
                  className={`reel-window${win.includes(reelIndex) ? ' is-win' : ''}`}
                  key={reelIndex}
                >
                  <motion.div
                    key={
                      round
                    }
                    className="reel-strip"
                    initial={{ y: rowY(8 + (reels[reelIndex] ?? 0)) }}
                    animate={{ y: rowY(opening ? 24 + (opening.reels[reelIndex] ?? 0) : 8 + (reels[reelIndex] ?? 0)) }}
                    transition={
                      opening
                        ? {
                            duration:
                              1.7 +
                              reelIndex *
                                0.35,

                            ease: [
                              0.12,
                              0.75,
                              0.16,
                              1,
                            ],
                          }
                        : {
                            duration:
                              0,
                          }
                    }
                    onAnimationComplete={() =>
                      stopped(
                        reelIndex,
                      )
                    }
                  >
                    {Array.from(
                      {
                        length:
                          40,
                      },
                      (
                        _,
                        symbolIndex,
                      ) => (
                        <span
                          className="reel-sym"
                          key={
                            symbolIndex
                          }
                        >
                          <img
                            src={
                              SLOT_FACES[
                                symbolIndex %
                                  SLOT_FACES.length
                              ]
                            }
                            alt=""
                          />
                        </span>
                      ),
                    )}
                  </motion.div>
                </div>
              ),
            )}
            {!spinning && lines.length > 0 && <PaylineOverlay lines={lines} />}
          </div>

          <div
            className="coin-slot"
            aria-hidden
          >
            {bills.map(
              bill => (
                <i
                  key={
                    bill.id
                  }
                  className="slot-bill"
                  style={
                    {
                      '--dx':
                        bill.dx,

                      '--dy':
                        bill.dy,

                      '--rot':
                        bill.rot,

                      '--delay':
                        bill.delay,

                      '--bill-scale':
                        bill.scale,
                    } as CSSProperties
                  }
                >
                  <span>
                    $
                  </span>
                </i>
              ),
            )}
          </div>

          <div className="slot-bottom">
            <div className="slot-bet">
              <button
                type="button"
                aria-label={t('betLess')}
                disabled={
                  spinning ||
                  betIndex <=
                    0
                }
                onClick={() =>
                  nudge(-1)
                }
              >
                −
              </button>

              <strong>
                ${stake}
              </strong>

              <button
                type="button"
                aria-label={t('betMore')}
                disabled={
                  spinning ||
                  betIndex >=
                    SLOT_BETS.length -
                      1
                }
                onClick={() =>
                  nudge(1)
                }
              >
                +
              </button>
            </div>

            <p className="slot-status" role="status">
              {spinning
                ? t('reelsSpinning')
                : result}
            </p>

            <button
              type="button"
              className="slot-spin"
              aria-label={`SPIN $${stake}`}
              disabled={
                !canSpin
              }
              onClick={() =>
                void spin()
              }
            >
              SPIN
            </button>
          </div>
        </div>

        <aside className="shop-receipt slot-rules">
          <ul className="slot-pay">
            {SLOT_FACES.map(
              (
                src,
                index,
              ) => (
                <li
                  key={
                    index
                  }
                >
                  <img
                    src={
                      src
                    }
                    alt=""
                  />

                  <span>
                    2×{' '}
                    <b>
                      $
                      {pay(
                        economy
                          .shop
                          .slots
                          .pair,
                        index,
                      )}
                    </b>
                  </span>

                  <span>
                    3×{' '}
                    <b>
                      $
                      {pay(
                        economy
                          .shop
                          .slots
                          .triple,
                        index,
                      )}
                    </b>
                  </span>
                </li>
              ),
            )}
          </ul>
        </aside>
      </div>
    </>
  );
}