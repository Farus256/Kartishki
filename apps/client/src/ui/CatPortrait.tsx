/** Ink portrait fallback for local mock cards; published art always takes priority. */
export function CatPortrait({ seed = '' }: { seed?: string }) {
  const n = [...seed].reduce((sum, c) => sum + c.charCodeAt(0), 0);
  return <svg viewBox="0 0 190 120" className="h-full w-full" aria-hidden>
    <rect width="190" height="120" fill={n % 2 ? '#b5ac99' : '#cbc2ae'} />
    {Array.from({ length: 17 }, (_, i) => <path key={i} d={`M${i * 15 - 30} 0 l-40 120`} stroke="#25231e" strokeWidth=".7" opacity=".17" />)}
    <path d="M35 120 Q36 84 58 79 L48 12 L83 37 Q102 26 123 36 L156 9 L148 80 Q168 90 165 120Z" fill={n % 3 ? '#33312b' : '#ded7c6'} stroke="#181713" strokeWidth="5" strokeLinejoin="round" />
    <path d="M58 28 L64 53 L78 43 M144 26 L128 46 L143 53" fill="#877a68" stroke="#171613" strokeWidth="3" />
    <ellipse cx="80" cy="65" rx="19" ry={n % 2 ? 13 : 18} fill="#e8dfc9" stroke="#151410" strokeWidth="3" />
    <ellipse cx="124" cy="63" rx="18" ry="16" fill="#e8dfc9" stroke="#151410" strokeWidth="3" />
    <path d={`M${80 + n % 5} 54 v24 M${120 + n % 7} 50 v27`} stroke="#191814" strokeWidth="5" />
    <path d="M92 83 L105 80 L101 90Z M101 90 l-9 7 m9-7 l10 7 M43 81 l30 6 M39 93 l31 0 M136 83 l32-9 M136 91 l37 4" fill="#161511" stroke="#161511" strokeWidth="2.5" />
    {n % 3 === 0 && <path d="M62 44 l77 44 m-73-7 l65-40" stroke="#181713" strokeWidth="2" opacity=".45" />}
    <path d="M54 111 l14-10 m-5 17 l14-11 m53 8 l10-10 m-3 16 l10-10" stroke="#978c78" strokeWidth="2" />
  </svg>;
}
