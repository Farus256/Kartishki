/**
 * One ink glyph per anomaly. Shared language: an 80×80 box, geometry inside 12…68, a single 5px ink stroke with round
 * joins, a paper fill and one lilac accent — so the set reads as one family at 24px in a table row and at 56px in the gem.
 * Purple stays the anomaly colour: the gem/chip behind the glyph carries it, the glyph itself is ink on paper.
 */
const INK = '#1d1226';
const PAPER = '#f3ecff';
const LILAC = '#c9a2ff';
const DEEP = '#7a4fc4';

function Shape({ id }: { id: string }) {
  switch (id) {
    // Deep pockets: a tied money bag.
    case 'ab-anomaly-deep-pockets':
      return <><path d="M30 24h20l-4 6c10 4 16 12 16 21 0 10-9 17-22 17S18 61 18 51c0-9 6-17 16-21z" fill={PAPER} /><path d="M32 20h16l2 5H30z" fill={LILAC} /><circle cx="40" cy="49" r="7" fill={LILAC} /></>;
    // Free batch: a circular refresh arrow.
    case 'ab-anomaly-free-refresh':
      return <><path d="M58 40a18 18 0 1 1-6-13.4" fill="none" /><path d="M58 18v14H44z" fill={LILAC} /></>;
    // Running start: a lightning bolt.
    case 'ab-anomaly-fast-start':
      return <path d="M46 12 22 44h14l-4 24 26-34H44z" fill={LILAC} />;
    // The fence: a price tag.
    case 'ab-anomaly-fence':
      return <><path d="M16 40 44 12h20v20L36 60z" fill={PAPER} /><circle cx="52" cy="24" r="5" fill={INK} /><path d="M30 44l10-10" stroke={DEEP} /></>;
    // Back room: a door ajar.
    case 'ab-anomaly-back-room':
      return <><path d="M22 14h36v52H22z" fill={PAPER} /><path d="M30 14v52l16-8V22z" fill={LILAC} /><circle cx="42" cy="42" r="3" fill={INK} /></>;
    // Bloodbath: a drop.
    case 'ab-anomaly-bloodbath':
      return <><path d="M40 12c-10 16-18 25-18 36a18 18 0 0 0 36 0c0-11-8-20-18-36z" fill={LILAC} /><path d="M31 48c0 5 3 9 8 10" fill="none" stroke={PAPER} /></>;
    // Plated: a shield.
    case 'ab-anomaly-plated':
      return <><path d="M40 12 62 20v18c0 14-10 22-22 30-12-8-22-16-22-30V20z" fill={PAPER} /><path d="M40 12v56M18 38h44" stroke={LILAC} strokeWidth="4" /></>;
    // Second wind: a heartbeat.
    case 'ab-anomaly-second-wind':
      return <><path d="M40 64 18 42c-6-6-6-16 1-21s14-3 21 4c7-7 15-9 21-4s7 15 1 21z" fill={PAPER} /><path d="M20 42h10l4-8 6 16 5-12 3 4h12" fill="none" stroke={DEEP} /></>;
    // Golden age: a star.
    case 'ab-anomaly-golden-age':
      return <path d="M40 12l8 18 20 2-15 13 5 20-18-11-18 11 5-20-15-13 20-2z" fill={LILAC} />;
    // Wide counter: a counter with five slots.
    case 'ab-anomaly-big-tavern':
      return <><path d="M14 32h52v28H14z" fill={PAPER} /><path d="M14 32l6-12h40l6 12" fill={LILAC} /><path d="M24 40v12M32 40v12M40 40v12M48 40v12M56 40v12" stroke={DEEP} /></>;
    // Hero's gift: a gift box.
    case 'ab-anomaly-cheap-powers':
      return <><path d="M16 32h48v10H16z" fill={LILAC} /><path d="M20 42h40v24H20z" fill={PAPER} /><path d="M40 32v34M40 32c-8 0-14-4-14-9s6-6 9-3 5 12 5 12c0 0 2-9 5-12s9-2 9 3-6 9-14 9" fill="none" /></>;
    // Curio market: a rolled scroll.
    case 'ab-anomaly-spell-market':
      return <><path d="M22 20h34v40H22z" fill={PAPER} /><path d="M18 20a6 6 0 0 1 12 0v40a6 6 0 0 1-12 0zM50 20a6 6 0 0 1 12 0v40a6 6 0 0 1-12 0z" fill={LILAC} /><path d="M34 32h12M34 42h12M34 52h8" stroke={DEEP} /></>;
    // Long night: a crescent moon.
    case 'ab-anomaly-long-night':
      return <><path d="M48 12a26 26 0 1 0 18 44 22 22 0 1 1-18-44z" fill={PAPER} /><circle cx="56" cy="24" r="3" fill={LILAC} stroke="none" /></>;
    // Overtime: an hourglass.
    case 'ab-anomaly-overtime':
      return <><path d="M22 12h36v8l-14 16v8l14 16v8H22v-8l14-16v-8L22 20z" fill={PAPER} /><path d="M30 20h20l-10 12zM31 62h18l-9-9z" fill={LILAC} stroke="none" /></>;
    // Double trouble: a bullhorn.
    case 'ab-anomaly-double-trouble':
      return <><path d="M14 32h12l30-16v48L26 48H14z" fill={PAPER} /><path d="M26 32v16" /><path d="M20 48v12h10v-9" fill={LILAC} /><path d="M62 30a10 10 0 0 1 0 20" fill="none" stroke={DEEP} /></>;
    // Wheel of fate: a spoked wheel.
    case 'ab-anomaly-wheel-of-fate':
      return <><circle cx="40" cy="40" r="26" fill={PAPER} /><path d="M40 14v52M14 40h52M22 22l36 36M58 22 22 58" /><circle cx="40" cy="40" r="7" fill={LILAC} /></>;
    default:
      return <path d="M40 12l7 21 21 7-21 7-7 21-7-21-21-7 21-7z" fill={LILAC} />;
  }
}

/** The glyph alone (no chip): drop it inside any purple element. */
export function AnomalyGlyph({ id, className }: { id: string; className?: string }) {
  return (
    <svg viewBox="0 0 80 80" className={className} aria-hidden focusable="false" stroke={INK} strokeWidth="5" strokeLinejoin="round" strokeLinecap="round">
      <Shape id={id} />
    </svg>
  );
}

/** Small purple chip with the glyph and (optionally) the name — table rows, room settings, hero-select header. */
export function AnomalyChip({ id, name, className = '' }: { id: string; name?: string; className?: string }) {
  return (
    <span className={`anomaly-chip ${className}`} data-anomaly={id || 'none'} title={name}>
      <AnomalyGlyph id={id} />
      {name && <span>{name}</span>}
    </span>
  );
}
