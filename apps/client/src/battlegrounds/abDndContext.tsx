import { createContext, useContext, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import type { AbDragPayload, DropZone } from './pointerDnd';

export type AbDndView = {
  kind: AbDragPayload['kind'] | null;
  draggingId: string | null;
  previewIndex: number | null;
  zone: DropZone;
  targetId: string | null;
  valid: boolean;
  /** Pointer is down and past the drag threshold: the ghost follows it and the board shows a hole. */
  armed: boolean;
  /** Released: the ghost is gliding onto the tile it stands for (or back home) and that tile stays concealed. */
  settling: boolean;
  /** Tile concealed behind the ghost while it lands; revealed in the same frame the ghost hides. */
  hidden: string | null;
};

export type AbDndApi = AbDndView & {
  begin: (payload: AbDragPayload, event: ReactPointerEvent<HTMLElement>) => void;
  cancel: () => void;
  didDrag: (target?: EventTarget | null) => boolean;
  tryLock: (id: string) => boolean;
};

export const AbDndContext = createContext<AbDndApi | null>(null);
export function useAbDnd(): AbDndApi | null { return useContext(AbDndContext); }

export function AbDndProvider({ value, children }: { value: AbDndApi; children: ReactNode }) {
  return <AbDndContext.Provider value={value}>{children}</AbDndContext.Provider>;
}
