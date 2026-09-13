import { createContext, useContext, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import type { AbDragPayload, DropZone } from './pointerDnd';

export type AbDndView = {
  kind: AbDragPayload['kind'] | null;
  draggingId: string | null;
  previewIndex: number | null;
  zone: DropZone;
  targetId: string | null;
  valid: boolean;
  armed: boolean;
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
