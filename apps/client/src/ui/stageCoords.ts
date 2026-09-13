export const STAGE_W = 1600;
export const STAGE_H = 900;

/** Visual CSS-zoom rect of the 1600×900 stage (getBoundingClientRect). */
export function stageScaleFromRect(rect: Pick<DOMRect, 'width' | 'height'>): { sx: number; sy: number } {
  return { sx: rect.width / STAGE_W, sy: rect.height / STAGE_H };
}

/** Viewport clientX/Y → design pixels. CSS `zoom` makes clientX !== gameX. */
export function clientToStage(
  clientX: number,
  clientY: number,
  rect: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>,
): { x: number; y: number } {
  const { sx, sy } = stageScaleFromRect(rect);
  return {
    x: sx === 0 ? 0 : (clientX - rect.left) / sx,
    y: sy === 0 ? 0 : (clientY - rect.top) / sy,
  };
}

export function stageToClient(
  x: number,
  y: number,
  rect: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>,
): { clientX: number; clientY: number } {
  const { sx, sy } = stageScaleFromRect(rect);
  return { clientX: rect.left + x * sx, clientY: rect.top + y * sy };
}

export function stageRoot(): HTMLElement | null {
  return document.querySelector('[data-stage]');
}
