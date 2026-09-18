import { useEffect, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { AB_WHEEL_BONUSES } from '@kartishki/shared';
import { audioManager } from '../AudioManager';
import { AnomalyBadge } from './AnomalyBadge';

const N = AB_WHEEL_BONUSES.length;
const WEDGE = 360 / N;
const COLORS = ['#e29a2c', '#84afb3', '#d94a4a', '#8fe38a', '#ffd66b', '#3f5a9c', '#c9a04a', '#d9b4ff', '#e8c27a', '#ff7de9'];
/** Short glyph per wedge (the full name is read out under the wheel once it lands). */
const MARK: Record<string, string> = { gold: '$2', bank: '$3›', tonic: '+2', hand: '✋', reroll: '↻', upgrade: '▲', shield: '◉', taunt: '⛨', token: '1/1', heal: '♥' };

/**
 * Wheel of fate: the server already rolled the wedge with the turn's income; this only spins a paper wheel to it.
 * Three turns and a bit, ~1.7s, pointer at the top, then the prize reads out and the whole thing folds away.
 */
export function WheelOfFate({ bonus, turn }: { bonus: string; turn: number }) {
  const { t } = useTranslation();
  const [shown, setShown] = useState<{ key: string; landed: boolean } | null>(null);
  const key = bonus ? `${turn}:${bonus}` : '';
  useEffect(() => {
    if (!key) { setShown(null); return; }
    setShown({ key, landed: false });
    audioManager.play('reels_spin');
    const land = window.setTimeout(() => { setShown(current => current?.key === key ? { key, landed: true } : current); audioManager.play('reel_land'); }, 1750);
    const hide = window.setTimeout(() => setShown(current => current?.key === key ? null : current), 3400);
    return () => { clearTimeout(land); clearTimeout(hide); };
  }, [key]);
  if (!shown) return null;
  const index = Math.max(0, (AB_WHEEL_BONUSES as readonly string[]).indexOf(bonus));
  // The pointer sits at 12 o'clock: turn the wheel so wedge `index` (centred at index*WEDGE + WEDGE/2 clockwise from the top) ends under it.
  const angle = 360 * 3 + 360 - (index * WEDGE + WEDGE / 2);
  return (
    <div className={`ab-wheel-veil ${shown.landed ? 'is-landed' : ''}`} data-testid="ab-wheel" data-bonus={bonus} role="status" aria-live="polite">
      <div className="ab-wheel-card">
        <h3>{t('abWheelTitle')}</h3>
        <div className="ab-wheel-stage">
          <i className="ab-wheel-pin" aria-hidden />
          <svg className="ab-wheel" viewBox="-100 -100 200 200" style={{ '--wheel-angle': `${angle}deg` } as CSSProperties} aria-hidden>
            <g className="ab-wheel-disc">
              {AB_WHEEL_BONUSES.map((id, i) => {
                const a0 = (i * WEDGE - 90) * Math.PI / 180, a1 = ((i + 1) * WEDGE - 90) * Math.PI / 180, am = (a0 + a1) / 2;
                const d = `M0 0 L${(Math.cos(a0) * 96).toFixed(1)} ${(Math.sin(a0) * 96).toFixed(1)} A96 96 0 0 1 ${(Math.cos(a1) * 96).toFixed(1)} ${(Math.sin(a1) * 96).toFixed(1)} Z`;
                return <g key={id} className={id === bonus && shown.landed ? 'is-hit' : ''}>
                  <path d={d} fill={COLORS[i % COLORS.length]} stroke="#1a1a1a" strokeWidth="3" strokeLinejoin="round" />
                  <text x={(Math.cos(am) * 66).toFixed(1)} y={(Math.sin(am) * 66).toFixed(1)} transform={`rotate(${(i * WEDGE + WEDGE / 2).toFixed(1)} ${(Math.cos(am) * 66).toFixed(1)} ${(Math.sin(am) * 66).toFixed(1)})`} textAnchor="middle" dominantBaseline="middle" fontSize="15" fontWeight="700" fill="#1a1a1a">{MARK[id] ?? '?'}</text>
                </g>;
              })}
              <circle r="14" fill="#f6efdc" stroke="#1a1a1a" strokeWidth="3" />
            </g>
          </svg>
        </div>
        <p className="ab-wheel-prize">{shown.landed ? t(`abWheel_${bonus}`, { defaultValue: bonus }) : '…'}</p>
      </div>
    </div>
  );
}

