import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { CASINO_GAMES } from '../economy';
import { useEconomy } from '../EconomyContext';
import { audioManager } from '../AudioManager';
import { GameCard } from '../ui/GameCard';
import { InkButton, spring } from '../ui/InkButton';

export function CasinoGames() {
  const economy = useEconomy();
  const [gameId, setGameId] = useState(CASINO_GAMES[0].id);
  const [revealed, setRevealed] = useState(false);
  const game = CASINO_GAMES.find(item => item.id === gameId)!;
  const opening = economy.opening?.kind === 'casino' ? economy.opening : undefined;

  useEffect(() => {
    if (!opening) { setRevealed(false); return; }
    const timer = window.setTimeout(() => { setRevealed(true); audioManager.play('case_win'); }, opening.gameId === 'money-wheel' ? 1700 : 950);
    return () => window.clearTimeout(timer);
  }, [opening?.gameId, opening?.label]);

  if (opening) {
    const active = CASINO_GAMES.find(item => item.id === opening.gameId)!;
    return <div className={`casino-opening is-${active.kind}`}>
      <motion.div className="casino-reveal" initial={{ scale: .7, rotate: -8 }} animate={{ scale: 1, rotate: active.kind === 'wheel' && !revealed ? 720 : 0 }} transition={active.kind === 'wheel' ? { duration: 1.7, ease: [0.12, .72, .18, 1] } : spring}>
        <span>{active.kind === 'wheel' ? '◉' : active.kind === 'case' ? '▣' : '▤'}</span>
        <strong>{active.name}</strong>
      </motion.div>
      {revealed && <motion.section className="casino-prize" initial={{ opacity: 0, y: 28 }} animate={{ opacity: 1, y: 0 }}>
        <small>ВЫПАЛО</small><h2>{opening.label}</h2>
        {!!opening.cards.length && <div className="casino-prize-cards">{opening.cards.map((card, index) => <GameCard key={`${card.id}-${index}`} card={card} scale={.72} hoverable={false} />)}</div>}
        <InkButton tone="gold" onClick={() => void economy.settleCasino()}>Забрать награду</InkButton>
      </motion.section>}
    </div>;
  }

  return <div className="casino-layout">
    <div className="casino-games">
      {CASINO_GAMES.map(item => <button key={item.id} className={item.id === gameId ? 'is-selected' : ''} aria-pressed={item.id === gameId} onClick={() => setGameId(item.id)}>
        <span>{item.kind === 'wheel' ? '◉' : item.kind === 'case' ? '▣' : '▤'}</span>
        <strong>{item.name}</strong><small>${item.cost} за попытку</small>
      </button>)}
    </div>
    <aside className="shop-receipt casino-rules">
      <span className="eyebrow">ДЕНЬГИ · ОПЫТ · КАРТЫ</span>
      <h2>{game.name}</h2>
      <p>Каждая попытка сразу выбирает одну награду. Шансы указаны честно.</p>
      <ul>{game.prizes.map(prize => <li key={prize.label}><span>{prize.label}</span><b>{prize.weight}%</b></li>)}</ul>
      <InkButton tone="gold" size="lg" disabled={economy.dollars < game.cost} onClick={() => void economy.playCasino(game.id)}>
        Играть за ${game.cost}
      </InkButton>
    </aside>
  </div>;
}
