/** Shared grungy paper / noir wash used behind every screen. */
export function Backdrop({ tone = 'paper' }: { tone?: 'paper' | 'noir' }) {
  const noir = tone === 'noir';
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <div className="absolute inset-0" style={{ background: noir ? '#141414' : '#EFECE4' }} />
      <div className="absolute inset-0 opacity-[.55]" style={{
        background: noir
          ? 'radial-gradient(ellipse at 25% 15%, #3a3a3a 0, transparent 55%), radial-gradient(ellipse at 85% 90%, #2a2a2a 0, transparent 50%)'
          : 'radial-gradient(ellipse at 12% 8%, rgba(26,26,26,.18) 0, transparent 45%), radial-gradient(ellipse at 92% 88%, rgba(26,26,26,.14) 0, transparent 45%)',
      }} />
      <div className="absolute inset-0" style={{
        opacity: noir ? 0.16 : 0.1,
        backgroundImage: 'repeating-linear-gradient(96deg, transparent 0 4px, rgba(26,26,26,.5) 5px 6px), repeating-linear-gradient(6deg, transparent 0 7px, rgba(26,26,26,.35) 8px 9px)',
      }} />
      <div className="absolute inset-0 mix-blend-multiply" style={{
        opacity: noir ? 0.5 : 0.28,
        backgroundImage: 'radial-gradient(circle at 18% 72%, rgba(26,26,26,.5) 0 2px, transparent 3px), radial-gradient(circle at 63% 28%, rgba(26,26,26,.4) 0 3px, transparent 4px), radial-gradient(circle at 88% 55%, rgba(26,26,26,.35) 0 2px, transparent 3px)',
        backgroundSize: '180px 140px',
      }} />
      {noir && <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 50% 50%, transparent 35%, rgba(0,0,0,.82) 100%)' }} />}
    </div>
  );
}
