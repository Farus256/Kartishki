import { useEffect, useRef, useState, type ReactNode } from 'react';

export const STAGE_W = 1600;
export const STAGE_H = 900;

/**
 * Strict 16:9 play field. Everything inside is laid out in fixed 1600x900 design pixels and
 * scaled to the frame, so card sizes stay identical on every monitor. Leftover space is black.
 */
export function Stage({ children }: { children: ReactNode }) {
  const frame = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const node = frame.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => setScale(entry.contentRect.width / STAGE_W));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return (
    <div className="fixed inset-0 grid place-items-center overflow-hidden bg-black">
      <div ref={frame} className="relative overflow-hidden bg-paper shadow-[0_0_80px_rgba(0,0,0,.9)]"
        style={{ width: 'min(100vw, calc(100vh * 16 / 9))', aspectRatio: '16 / 9' }}>
        <div className="absolute top-0 left-0 origin-top-left" style={{ width: STAGE_W, height: STAGE_H, transform: `scale(${scale})` }}>
          {children}
        </div>
      </div>
    </div>
  );
}
