/** Dedicated keyword signals: taunt frame, poison drop, reborn sash. Letter badges stay for the rest. */
export const SIGNAL_KEYWORDS = new Set(['taunt', 'reborn', 'divineShield', 'windfury']);

export function TauntFrame() {
  return <svg className="ab-taunt-frame" viewBox="0 0 100 112" aria-hidden>
    <path d="M50 3 L90 16 V54 C90 80 72 100 50 109 C28 100 10 80 10 54 V16 Z" />
    <path className="ab-taunt-inner" d="M50 11 L83 22 V54 C83 75 68 92 50 100 C32 92 17 75 17 54 V22 Z" />
  </svg>;
}

export function PoisonDrop() {
  return <svg className="ab-poison-drop" viewBox="0 0 40 52" aria-hidden>
    <path d="M20 3 C28 16 36 25 36 34 A16 16 0 0 1 4 34 C4 25 12 16 20 3 Z" />
    <path className="ab-poison-shine" d="M11 32 C11 26 14 22 17 19" />
    <circle className="ab-poison-eye" cx="14" cy="36" r="2.4" /><circle className="ab-poison-eye" cx="26" cy="36" r="2.4" />
  </svg>;
}

export function RebornSash() {
  return <span className="ab-reborn-sash" aria-hidden><i>↻</i></span>;
}

/** Stable 0..1 phase from an id, so idle breathing is not in lockstep across the row. */
export function idlePhase(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return (h % 1000) / 1000;
}

/** Bottom-center keyword icons (battlecry, deathrattle, cleave…); undefined = fall back to the text mark. */
export function KeywordIcon({ keyword }: { keyword: string }) {
  const g = { stroke: '#1a1210', strokeWidth: 3, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const };
  switch (keyword) {
    case 'poisonous': return <svg viewBox="0 0 40 40" aria-hidden><g {...g}><path d="M20 3c7 11 13 18 13 25a13 13 0 0 1-26 0c0-7 6-14 13-25Z" fill="#5fc94a" /><circle cx="15" cy="28" r="2.4" fill="#1c3d18" stroke="none" /><circle cx="25" cy="28" r="2.4" fill="#1c3d18" stroke="none" /><path d="M11 24c0-5 3-8 5-10" fill="none" stroke="#d6ffc9" strokeWidth="2.5" /></g></svg>;
    case 'battlecry': return <svg viewBox="0 0 40 40" aria-hidden><path {...g} d="M23 4 9 23h9l-3 13 16-20h-9Z" fill="#ffd761" /></svg>;
    case 'deathrattle': return <svg viewBox="0 0 40 40" aria-hidden><g {...g}><path d="M20 4c9 0 15 6 15 14 0 5-3 8-6 10v6H11v-6c-3-2-6-5-6-10 0-8 6-14 15-14Z" fill="#f2ede0" /><circle cx="14" cy="18" r="3.5" fill="#1a1210" stroke="none" /><circle cx="26" cy="18" r="3.5" fill="#1a1210" stroke="none" /><path d="M17 34v4M23 34v4M20 24l-2 4h4Z" /></g></svg>;
    case 'cleave': return <svg viewBox="0 0 40 40" aria-hidden><g {...g}><path d="M8 32 28 12" /><path d="M24 6c8-2 12 4 10 12l-8 3-5-6Z" fill="#d4dce0" /></g></svg>;
    case 'immune': return <svg viewBox="0 0 40 40" aria-hidden><g {...g}><path d="M20 4 34 9v11c0 8-6 13-14 16-8-3-14-8-14-16V9Z" fill="#9fd0d6" /><path d="M13 19h14M20 12v14" stroke="#fff" /></g></svg>;
    case 'cannotAttack': return <svg viewBox="0 0 40 40" aria-hidden><g {...g}><circle cx="20" cy="20" r="14" fill="#8a8678" /><path d="M10 10l20 20" stroke="#b32e23" strokeWidth="4" /></g></svg>;
    case 'humiliate': return <svg viewBox="0 0 40 40" aria-hidden><g {...g}><path d="M6 8h24l0 16H16l-8 8v-8H6Z" fill="#fce5a7" /><path d="M12 16h12" /></g></svg>;
    case 'bait': return <svg viewBox="0 0 40 40" aria-hidden><g {...g}><path d="M20 4 36 34H4Z" fill="#ffe270" /><path d="M20 14v10M20 28v2" /></g></svg>;
    default: return null;
  }
}
