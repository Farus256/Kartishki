import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

const HIDE_TOOLTIPS = 'paper-tooltip-hide';
/** Close every open tooltip, e.g. when the anchors vanish under a still pointer (combat overlay, drag). */
export function hidePaperTooltips(): void { document.dispatchEvent(new Event(HIDE_TOOLTIPS)); }

/** One paper tooltip for mouse and keyboard; coordinates are browser pixels, outside Stage zoom. */
export function PaperTooltip({ children, content, className = '', style, placement = 'above', boxClassName = 'paper-tooltip', delay = 0, ...rest }: {
  children: ReactNode;
  content: ReactNode;
  className?: string;
  style?: CSSProperties;
  placement?: 'above' | 'right' | 'beside' | 'left';
  boxClassName?: string;
  delay?: number;
  'data-buff'?: string;
}) {
  const id = useId();
  const anchor = useRef<HTMLSpanElement>(null);
  const timer = useRef(0);
  const [point, setPoint] = useState<{ left: number; top: number } | null>(null);
  const hide = useCallback(() => { window.clearTimeout(timer.current); setPoint(null); }, []);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') hide(); };
    window.addEventListener('blur', hide);
    window.addEventListener('resize', hide);
    window.addEventListener('scroll', hide, true);
    document.addEventListener('pointerdown', hide, true);
    document.addEventListener('keydown', escape);
    document.addEventListener(HIDE_TOOLTIPS, hide);
    return () => {
      window.clearTimeout(timer.current);
      window.removeEventListener('blur', hide);
      window.removeEventListener('resize', hide);
      window.removeEventListener('scroll', hide, true);
      document.removeEventListener('pointerdown', hide, true);
      document.removeEventListener('keydown', escape);
      document.removeEventListener(HIDE_TOOLTIPS, hide);
    };
  }, [hide]);
  const show = () => {
    window.clearTimeout(timer.current);
    const place = () => {
      const r = anchor.current?.getBoundingClientRect();
      if (!r) return;
      if (placement === 'left') {
        // Paper tip to the left of a right-edge control (anomaly gem).
        const w = 270, h = 210, gap = 12, drop = 36;
        setPoint({ left: Math.max(8, r.left - w - gap), top: Math.max(8, Math.min(innerHeight - h - 8, r.top + r.height / 2 - h / 2 + drop)) });
        return;
      }
      if (placement === 'beside') {
        // Small box to the right of the anchor, top-aligned (standings rows).
        const w = 350, h = 520, gap = 10;
        const left = r.right + gap + w <= innerWidth - 8 ? r.right + gap : r.left - w - gap;
        setPoint({ left: Math.max(8, left), top: Math.max(8, Math.min(innerHeight - h - 8, r.top - 4)) });
        return;
      }
      if (placement === 'right') {
        const w = 248, h = 380, gap = 12;
        const right = r.right + gap;
        const left = right + w <= innerWidth - 8 ? right : r.left - w - gap;
        setPoint({
          left: Math.max(8, Math.min(innerWidth - w - 8, left)),
          top: Math.max(8, Math.min(innerHeight - h - 8, r.top + r.height / 2 - h / 2)),
        });
        return;
      }
      setPoint({ left: Math.max(8, Math.min(innerWidth - 278, r.left + r.width / 2 - 135)), top: Math.max(8, Math.min(innerHeight - 220, r.top > 230 ? r.top - 210 : r.bottom + 10)) });
    };
    if (delay) timer.current = window.setTimeout(place, delay);
    else place();
  };
  return <span ref={anchor} className={className} style={style} {...rest} onMouseEnter={show} onMouseLeave={hide} onFocus={event => { if (!(event.target instanceof Element) || event.target.matches(':focus-visible')) show(); }} onBlur={hide} onPointerDown={hide} onKeyDown={e => { if (e.key === 'Escape') hide(); }} aria-describedby={point ? id : undefined}>
    {children}{point && content ? createPortal(<div className={boxClassName} id={id} role="tooltip" style={point}>{content}</div>, document.body) : null}
  </span>;
}
