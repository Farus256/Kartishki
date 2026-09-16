import { useTranslation } from 'react-i18next';
﻿import { useEffect, useId, useRef } from 'react';
import { motion, useAnimationFrame, useReducedMotion, useSpring } from 'framer-motion';
import { BOTTLE_CAPACITY, type BeerLeague } from '../beerRank';
import lvivske from '../assets/lvivske-logo.png';

const TOP = 106, BOTTOM = 658, HEIGHT = BOTTOM - TOP;
const SHAPE = 'M170 80 L248 81 L250 135 C249 161 270 173 287 190 Q336 227 338 276 L350 606 Q352 652 326 672 Q312 687 288 674 Q266 695 244 680 Q220 697 199 681 Q175 695 152 680 Q122 690 100 670 Q76 651 80 612 L89 279 Q89 228 131 194 C153 176 169 158 168 132Z';
const liquidPath = (y: number, wave: number) => `M65 ${y} Q140 ${y - wave} 211 ${y} T365 ${y} L365 700 L65 700Z`;
const foamPath = (y: number, wave: number) => `M65 ${y - 12} Q140 ${y - wave - 12} 211 ${y - 12} T365 ${y - 12} L365 ${y + 8} Q285 ${y + wave + 8} 211 ${y + 8} T65 ${y + 8}Z`;

/** Procedural SVG bottle. Only SVG paths/particles update per frame; React does not re-render. */
export function BeerBottle({ remainingMl, league }: { remainingMl: number; league: BeerLeague }) {
  const id = useId().replace(/:/g, '');
  const { t } = useTranslation();
  const reduced = useReducedMotion();
  const ml = Math.max(0, Math.min(BOTTLE_CAPACITY, Number.isFinite(remainingMl) ? remainingMl : 0));
  const level = useSpring(ml, { stiffness: 65, damping: 18, mass: 1.2 });
  const liquid = useRef<SVGPathElement>(null), foam = useRef<SVGPathElement>(null);
  const bubbles = useRef<SVGGElement>(null), foamBubbles = useRef<SVGGElement>(null);
  const kick = useRef(0), elapsed = useRef(0);
  const dark = league === 'dark';
  useEffect(() => { kick.current = elapsed.current; if (reduced) level.jump(ml); else level.set(ml); }, [ml, level, reduced, league]);
  useAnimationFrame(time => {
    elapsed.current = time;
    const amount = Math.max(0, Math.min(BOTTLE_CAPACITY, level.get()));
    const y = BOTTOM - amount / BOTTLE_CAPACITY * HEIGHT;
    const age = (time - kick.current) / 1000;
    const amplitude = reduced ? 0 : Math.min(11 * Math.exp(-age * .65) + 1.3, (y - TOP) * .3, (BOTTOM - y) * .3);
    const wave = Math.sin(age * 5.2) * amplitude;
    liquid.current?.setAttribute('d', liquidPath(y, wave));
    foam.current?.setAttribute('d', foamPath(y, wave));
    // No foam or suspended bubbles in a drained bottle; only the drawn bottom drops remain.
    const visible = amount > .2 ? '1' : '0';
    liquid.current?.setAttribute('opacity', visible); foam.current?.setAttribute('opacity', visible);
    bubbles.current?.setAttribute('opacity', visible); foamBubbles.current?.setAttribute('opacity', visible);
    Array.from(bubbles.current?.children ?? []).forEach((node, i) => {
      const phase = reduced ? ((i * .137) % 1) : ((time / (2600 + i * 97) + i * .137) % 1);
      const cy = BOTTOM - phase * Math.max(0, BOTTOM - y - 9);
      node.setAttribute('cy', String(cy));
      node.setAttribute('cx', String(106 + (i * 37) % 215 + (reduced ? 0 : Math.sin(time / 900 + i) * 3)));
      node.setAttribute('opacity', String((1 - phase) * .6));
    });
    Array.from(foamBubbles.current?.children ?? []).forEach((node, i) => {
      node.setAttribute('cy', String(y - 6 + Math.sin(i * 2.3 + (reduced ? 0 : time / 620)) * 3 + wave * Math.sin(i / 3) * .35));
    });
  });
  const initialY = BOTTOM - ml / BOTTLE_CAPACITY * HEIGHT;
  return <motion.svg viewBox="0 0 430 730" className="beer-bottle" role="img" aria-label={t('bottleAria', { kind: t(dark ? 'beerDark' : 'beerLight'), ml })} data-testid="beer-bottle" data-ml={ml} data-league={league}
    initial={reduced ? false : { rotate: -3, y: 12 }} animate={{ rotate: 0, y: 0 }} transition={{ type: 'spring', stiffness: 70, damping: 12 }}>
    <defs>
      <clipPath id={`${id}-bottle`}><path d={SHAPE} /></clipPath>
      <linearGradient id={`${id}-plastic`} x1="0" x2="1"><stop stopColor="#d7d3b7" stopOpacity=".5" /><stop offset=".25" stopColor="#fcf5da" stopOpacity=".35" /><stop offset=".8" stopColor="#6c6e56" stopOpacity=".2" /><stop offset="1" stopColor="#24251d" stopOpacity=".4" /></linearGradient>
      <linearGradient id={`${id}-beer`} x1="0" x2="1"><stop stopColor={dark ? '#160f0d' : '#a05e16'} /><stop offset=".4" stopColor={dark ? '#423024' : '#e2a12e'} /><stop offset=".75" stopColor={dark ? '#211711' : '#c4861f'} /><stop offset="1" stopColor={dark ? '#100d0b' : '#794315'} /></linearGradient>
      <pattern id={`${id}-hatch`} width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(24)"><path d="M0 0V9" stroke="#29251e" strokeWidth="1" opacity=".16" /></pattern>
    </defs>
    <ellipse cx="218" cy="696" rx="155" ry="17" fill="#27241d" opacity=".2" />
    <path d={SHAPE} transform="translate(7 5)" fill="#29251e" opacity=".27" />
    <path d={SHAPE} fill={`url(#${id}-plastic)`} stroke="#25231e" strokeWidth="7" strokeLinejoin="round" />
    <g clipPath={`url(#${id}-bottle)`}>
      <path ref={liquid} data-testid="beer-liquid" d={liquidPath(initialY, 0)} fill={`url(#${id}-beer)`} opacity={ml ? 1 : 0} />
      <g ref={bubbles} opacity={ml ? 1 : 0}>{Array.from({ length: 24 }, (_, i) => <circle key={i} cx={106 + (i * 37) % 215} cy={BOTTOM - (i / 24) * (BOTTOM - initialY)} r={1.2 + i % 3 * .6} fill="none" stroke={dark ? '#cbab7e' : '#ffe5a7'} strokeWidth="1.2" />)}</g>
      <path ref={foam} d={foamPath(initialY, 0)} fill={dark ? '#c09a68' : '#f4edd7'} stroke={dark ? '#836442' : '#cdbd91'} strokeWidth="1.5" opacity={ml ? 1 : 0} />
      <g ref={foamBubbles} opacity={ml ? 1 : 0}>{Array.from({ length: 38 }, (_, i) => <circle key={i} cx={70 + i * 8} cy={initialY - 6} r={2 + (i * 7) % 4} fill={dark ? '#d3b286' : '#fff9e7'} stroke={dark ? '#9d784d' : '#ddcfad'} strokeWidth=".8" />)}</g>
      <path d="M70 114H360V700H70Z" fill={`url(#${id}-hatch)`} />
      {[274, 315, 566, 600, 634].map(y => <g key={y}><path d={`M86 ${y} Q213 ${y + 19} 342 ${y - 1}`} fill="none" stroke="#25231e" strokeWidth="4" opacity=".65" /><path d={`M90 ${y + 6} Q213 ${y + 25} 341 ${y + 5}`} fill="none" stroke="#fff2c9" strokeWidth="3" opacity=".27" /></g>)}
      <path d="M116 290 L107 603 Q107 646 129 650 M134 209 Q110 232 108 259 M182 112 L181 151" stroke="#fff9e5" strokeWidth="11" opacity=".38" fill="none" strokeLinecap="round" />
      <path d="M315 305 L323 548 M292 214 L309 242" stroke="#fff9e5" strokeWidth="4" opacity=".25" fill="none" strokeLinecap="round" />
      {ml === 0 && <g fill={dark ? '#382317' : '#b47a22'}><ellipse cx="168" cy="668" rx="15" ry="3" /><ellipse cx="261" cy="670" rx="9" ry="2" /></g>}
    </g>
    <path d={SHAPE} fill="none" stroke="#1f211a" strokeWidth="3" transform="translate(-2 1)" />
    <path d="M164 79 Q208 70 254 79 L253 102 Q210 110 164 101Z" fill="#938d67" stroke="#25231e" strokeWidth="5" />
    <path d="M166 53 Q208 44 252 52 L254 80 Q211 91 163 80Z" fill={dark ? '#4b4034' : '#a3965f'} stroke="#25231e" strokeWidth="5" />
    {Array.from({ length: 12 }, (_, i) => <path key={i} d={`M${170 + i * 7} 55v23`} stroke="#25231e" strokeWidth="2" />)}
    <g transform="rotate(-4 215 430)">
      <path d="M101 350 L322 344 L329 517 L303 532 L98 524 L102 484 L94 468Z" fill="#d6c7a1" stroke="#25231e" strokeWidth="4" />
      <path d="M108 357 L315 352 L320 516 L105 515Z" fill={`url(#${id}-hatch)`} stroke="#6f644b" strokeWidth="1" />
      <image href={lvivske} x="118" y="354" width="186" height="145" preserveAspectRatio="xMidYMid meet" />
      <text x="213" y="503" textAnchor="middle" fontFamily="var(--font-hand)" fontSize="21" fill="#302b22">{t(dark ? 'bottleLabelDark' : 'bottleLabelLight')}</text>
      <path d="M105 395l23-7-11 11 M307 477l-16 15 30-10 M123 514l14-5" fill="none" stroke="#f0e5c8" strokeWidth="5" />
    </g>
    <text x="219" y="627" textAnchor="middle" fontFamily="var(--font-stencil)" fontSize="18" fill="#f7e5b9" opacity=".7">{t('bottleVolume')}</text>
  </motion.svg>;
}
