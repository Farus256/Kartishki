import { useEffect, useRef, useState } from 'react';

/** Animate only confirmed value changes, including consecutive changes during a pulse. */
export function AnimatedNumber({ value }: { value: number }) {
  const previous = useRef(value);
  const [change, setChange] = useState({ delta: 0, serial: 0 });
  useEffect(() => {
    const delta = value - previous.current;
    previous.current = value;
    if (!delta) return;
    setChange(old => ({ delta, serial: old.serial + 1 }));
    const timer = setTimeout(() => setChange(old => ({ ...old, delta: 0 })), 1000);
    return () => clearTimeout(timer);
  }, [value]);
  return <span className="ab-number" data-value={value}>
    <span className={change.delta ? `ab-number-pulse ${change.delta > 0 ? 'is-gain' : 'is-loss'}` : ''}>{value}</span>
    {!!change.delta && <small key={`delta-${change.serial}`} aria-hidden className={`ab-number-delta ${change.delta > 0 ? 'is-gain' : 'is-loss'}`}>{change.delta > 0 ? '+' : '−'}{Math.abs(change.delta)}</small>}
  </span>;
}
