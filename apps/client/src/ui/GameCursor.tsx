import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { audioManager } from '../AudioManager';
import './gameCursor.css';

function specks(x: number, y: number) {
  const root = document.createElement('div');
  root.className = 'game-tap-burst';
  root.style.left = `${x}px`;
  root.style.top = `${y}px`;
  for (let i = 0; i < 8; i++) {
    const bit = document.createElement('i');
    bit.style.setProperty('--dx', `${Math.cos(i * 0.9) * (18 + i * 6)}px`);
    bit.style.setProperty('--dy', `${Math.sin(i * 0.9) * (16 + i * 5) + 8}px`);
    bit.style.setProperty('--rot', `${i * 28}deg`);
    root.append(bit);
  }
  document.body.append(root);
  window.setTimeout(() => root.remove(), 420);
}

export function GameCursor() {
  const [pos, setPos] = useState({ x: -80, y: -80 });
  const [tap, setTap] = useState(0);
  useEffect(() => {
    document.body.classList.add('has-game-cursor');
    const move = (event: PointerEvent) => setPos({ x: event.clientX, y: event.clientY });
    const down = (event: PointerEvent) => {
      if (event.button !== 0) return;
      const target = event.target as Element | null;
      if (!target?.closest?.('.ab-stage,.ab-board,.ab-combat,.ab-combat-wrap,.battle-screen canvas,canvas')) return;
      if (target.closest('button,input,select,textarea,a,[role=button],.ab-minion,.ab-power,.ab-combat-speed,.ab-hero-face')) return;
      setTap(n => n + 1);
      audioManager.play('ui_click');
      if (!matchMedia('(prefers-reduced-motion: reduce)').matches) specks(event.clientX, event.clientY);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerdown', down);
    return () => {
      document.body.classList.remove('has-game-cursor');
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerdown', down);
    };
  }, []);
  return createPortal(
    <div className={`game-cursor ${tap ? 'is-tap' : ''}`} style={{ left: pos.x, top: pos.y }} aria-hidden key={tap || 'idle'}>
      <svg viewBox="0 0 64 72" width="22" height="25">
        <path d="M18 44V16c0-5 4-8 8-8s7 3 7 8v14M33 22v-4c0-4 3-7 7-7s6 3 6 7v12M46 26v-2c0-3 3-6 6-6 4 0 6 3 6 7v22c0 14-10 25-26 25-12 0-22-7-24-18L6 38c-2-5 2-9 7-8l5 2" fill="#efe6d2" stroke="#1a1a1a" strokeWidth="3" strokeLinejoin="round" />
        <path d="M20 16c1-6 5-9 9-8" fill="none" stroke="#1a1a1a" strokeWidth="2" />
      </svg>
    </div>,
    document.body,
  );
}
