import { BOARD_PRESETS, boardOwned, boardPreset, type BoardPreset } from '@kartishki/shared';
import { playerSession } from './playerSession';

const BOARD_KEY = 'kartishki-ab-board';

/** The table preset to paint: the account's equipped one, or the guest's local pick among the free presets. */
export function equippedBoard(): BoardPreset {
  const snapshot = playerSession.getSnapshot();
  if (snapshot.library) return boardPreset(boardOwned(snapshot.library.profile.settings.board, snapshot.library.unlocks ?? []) ? snapshot.library.profile.settings.board : '');
  let local = '';
  try { local = localStorage.getItem(BOARD_KEY) ?? ''; } catch { /* default oak */ }
  return boardPreset(boardOwned(local, []) ? local : '');
}

/** Equip a preset: accounts persist it in settings (the server checks ownership), guests keep a free one locally. */
export async function equipBoard(id: string): Promise<boolean> {
  if (!BOARD_PRESETS.some(p => p.id === id)) return false;
  if (playerSession.getSnapshot().library) return playerSession.saveSettings({ board: id });
  if (!boardOwned(id, [])) return false;
  try { localStorage.setItem(BOARD_KEY, id); } catch { /* memory only */ }
  boardListeners.forEach(fn => fn());
  return true;
}

const boardListeners = new Set<() => void>();
/** Guest picks do not flow through playerSession; screens subscribe here as well. */
export function onBoardChange(fn: () => void) { boardListeners.add(fn); return () => { boardListeners.delete(fn); }; }
