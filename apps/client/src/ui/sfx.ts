import { audioManager } from '../AudioManager';
export function chime(kind: 'reveal' | 'victory' = 'reveal') { audioManager.play(kind === 'victory' ? 'case_win' : 'card_flip'); }
export function tick() { audioManager.play('case_tick'); }
