import { useEffect, useRef, useState } from 'react';
import { motion, useAnimationControls } from 'framer-motion';
import { useEconomy } from '../EconomyContext';
import { SYMBOLS } from '../economy';
import { audioManager } from '../AudioManager';

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
  function spin() {
    if (locked.current || economy.opening || economy.dollars < 50) return;
    locked.current = true;
    if (!economy.spin()) { locked.current = false; return; }
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
    economy.settleSlot();
    locked.current = false;
  }
  return <div className="slot-layout">
    <div className="slot-machine">
      <div className="bulb-row">{Array.from({ length: 16 }, (_, i) => <span key={i} style={{ animationDelay: `${i * .13}s` }} />)}</div>
      <h2>КОТ В МЕШКЕ</h2><p className="slot-subtitle">ТРИ БАРАБАНА. ДЕВЯТЬ ЖИЗНЕЙ.</p>
      <div className="reels" aria-label="Три барабана" aria-busy={spinning}>{[0, 1, 2].map(i => <div className="reel-window" key={i}>
        <motion.div key={round} initial={{ y: -reels[i] * 108 }} animate={{ y: -(opening ? 24 + opening.reels[i] : reels[i]) * 108 }} transition={opening ? { duration: 1.7 + i * .35, ease: [.12, .75, .16, 1] } : { duration: 0 }} onAnimationComplete={() => stopped(i)}>
          {Array.from({ length: 40 }, (_, n) => <span key={n} style={{ color: ['#39714a', '#272522', '#2563eb', '#9333ea', '#a27a13', '#a27a13', '#0e7490', '#272522'][n % 8] }}>{SYMBOLS[n % 8]}</span>)}
        </motion.div>
      </div>)}</div>
      <motion.button className="slot-lever" aria-label="Потянуть рычаг ($50)" disabled={!!economy.opening || economy.dollars < 50} animate={lever}
        drag={spinning ? false : 'y'} dragConstraints={{ top: 0, bottom: 85 }} dragElastic={.1} dragSnapToOrigin
        onPointerDown={() => { dragged.current = false; }} onDragStart={() => { dragged.current = true; }}
        onDragEnd={(_, info) => { if (info.offset.y > 30) spin(); }} onClick={() => { if (!dragged.current) spin(); }}
        transition={{ type: 'spring', stiffness: 320, damping: 16 }}><span /></motion.button>
      <div className="slot-bottom"><span>50 USD<br />ЗА ПОПЫТКУ</span><strong>{spinning ? 'БАРАБАНЫ КРУТЯТСЯ…' : 'ПОТЯНИ РЫЧАГ →'}</strong><span>ฅ<br />GOOD LUCK</span></div>
      <div className="coin-slot" />
    </div>
    <aside className="shop-receipt slot-rules"><span className="eyebrow">ПРАВИЛА ПОДВАЛА</span><h2>Поймай совпадение</h2>
      <p>Три одинаковых символа:</p><ul><li>$ ☠ ♠ ◆ ★ ♛ → $100</li><li>ฅ → 1 случайная карта</li><li>✧ → 1 подвальный пак</li></ul>
      <p className="text-[12px]">Все 8 символов равновероятны. Награда зачисляется автоматически после остановки барабанов.</p>
      <div role="status" className="slot-result">{spinning ? 'Тише… кот думает.' : result}</div>
    </aside>
  </div>;
}
