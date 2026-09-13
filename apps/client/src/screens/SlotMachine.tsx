import { useEffect, useRef, useState } from 'react';
import { motion, useAnimationControls } from 'framer-motion';
import { useEconomy } from '../EconomyContext';
import { SLOT_PAIR, SLOT_TRIPLE, type SlotPay } from '../economy';
import { audioManager } from '../AudioManager';
import face0 from '../assets/slots/00.png';
import face1 from '../assets/slots/01.png';
import face2 from '../assets/slots/02.png';
import face3 from '../assets/slots/03.png';
import face4 from '../assets/slots/04.png';
import face5 from '../assets/slots/05.png';
import face6 from '../assets/slots/06.png';
import face7 from '../assets/slots/07.png';

export const SLOT_FACES = [face0, face1, face2, face3, face4, face5, face6, face7];
const CELL = 132;
function payLine(pay: SlotPay) {
  if (pay.packs) return `${pay.packs} ${pay.packs === 1 ? 'пак' : 'пака'}`;
  if (pay.cards) return `${pay.cards} ${pay.cards === 1 ? 'карта' : 'карт'}`;
  return `$ ${pay.dollars}`;
}

export function SlotMachine() {
  const economy = useEconomy();
  const opening = economy.opening?.kind === 'slots' ? economy.opening : undefined;
  const [result, setResult] = useState('Дёрни рычаг. Испытай удачу.');
  const [reels, setReels] = useState([0, 0, 0]);
  const [round, setRound] = useState(0);
  const lever = useAnimationControls();
  const locked = useRef(false);
  const dragged = useRef(false);
  const settled = useRef(false);
  const stopSpin = useRef<() => void>(() => {});
  const spinning = !!opening;
  useEffect(() => {
    if (!spinning) return;
    settled.current = false;
    stopSpin.current = audioManager.play('reels_spin', true);
    return () => stopSpin.current();
  }, [spinning]);
  async function spin() {
    if (locked.current || economy.opening || economy.dollars < 50) return;
    locked.current = true;
    if (!await economy.spin()) { locked.current = false; return; }
    setRound(n => n + 1);
    audioManager.play('lever_pull');
    void lever.start({ y: 80, transition: { duration: .16, ease: 'easeIn' } }).then(() =>
      lever.start({ y: 0, transition: { type: 'spring', stiffness: 320, damping: 14 } }));
  }
  function stopped(index: number) {
    if (!opening || settled.current) return;
    audioManager.play('reel_stop');
    if (index !== 2) return;
    settled.current = true;
    stopSpin.current();
    setResult([opening.label, ...opening.cards.map(c => c.name.ru)].join(' • '));
    setReels(opening.reels.slice(0, 3));
    void economy.settleSlot();
    locked.current = false;
  }
  return <div className="slot-layout">
    <div className="slot-machine">
      <div className="bulb-row">{Array.from({ length: 16 }, (_, i) => <span key={i} style={{ animationDelay: `${i * .13}s` }} />)}</div>
      <h2>СЧАСТЛИВЫЙ СЛУЧАЙ</h2><p className="slot-subtitle"></p>
      <div className="reels" aria-label="Три барабана" aria-busy={spinning}>{[0, 1, 2].map(i => <div className="reel-window" key={i}>
        <motion.div key={round} initial={{ y: -reels[i] * CELL }} animate={{ y: -(opening ? 24 + opening.reels[i] : reels[i]) * CELL }} transition={opening ? { duration: 1.7 + i * .35, ease: [.12, .75, .16, 1] } : { duration: 0 }} onAnimationComplete={() => stopped(i)}>
          {Array.from({ length: 40 }, (_, n) => <span className="reel-sym" key={n}><img src={SLOT_FACES[n % 8]} alt="" /></span>)}
        </motion.div>
      </div>)}</div>
      <motion.button className="slot-lever" aria-label="Потянуть рычаг ($50)" disabled={!!economy.opening || economy.dollars < 50} animate={lever}
        drag={spinning ? false : 'y'} dragConstraints={{ top: 0, bottom: 85 }} dragElastic={.1} dragSnapToOrigin
        onPointerDown={() => { dragged.current = false; }} onDragStart={() => { dragged.current = true; }}
        onDragEnd={(_, info) => { if (info.offset.y > 30) spin(); }} onClick={() => { if (!dragged.current) spin(); }}
        transition={{ type: 'spring', stiffness: 320, damping: 16 }}><span /></motion.button>
      <div className="slot-bottom"><span>50 USD<br />ЗА ПОПЫТКУ</span><strong>{spinning ? 'БАРАБАНЫ КРУТЯТСЯ…' : 'ПОТЯНИ РЫЧАГ →'}</strong><span><img src={SLOT_FACES[7]} alt="" /><br />GOOD LUCK</span></div>
      <div className="coin-slot" />
    </div>
    <aside className="shop-receipt slot-rules"><span className="eyebrow">ПРАВИЛА ПОДВАЛА</span><h2>Поймай совпадение</h2>
      <p>Два одинаковых — мелкий куш. Три — джекпот. Частые лица выпадают чаще.</p>
      <ul className="slot-pay">{SLOT_FACES.map((src, i) => <li key={i}><img src={src} alt="" /><span>2: {payLine(SLOT_PAIR[i])}</span><span>3: {payLine(SLOT_TRIPLE[i])}</span></li>)}</ul>
      <div role="status" className="slot-result">{spinning ? 'Барабаны вращаются…' : result}</div>
    </aside>
  </div>;
}
