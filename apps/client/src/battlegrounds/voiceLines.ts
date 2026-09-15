import type { CardDefinition } from '@kartishki/shared';
import { audioManager } from '../AudioManager';

/** Meme voice lines recorded by the crew (audio_cards/*.MP3), keyed by table moment. */
const clips = import.meta.glob('../../../../audio_cards/*.{mp3,MP3}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

export type VoiceMoment = 'win' | 'loss' | 'triple' | 'sold' | 'broke' | 'death';
const MOMENTS: Record<VoiceMoment, string[]> = {
  win: ['Адьос амигос', 'ooo aaa'],
  loss: ['ай ай ай как жалко', 'уааа помогите', 'кемпер опять умер'],
  triple: ['какие они звуки делают', 'снайпера вижу'],
  sold: ['куда я мужики'],
  broke: ['писятку хочешь'],
  death: ['кемпер опять умер', 'уааа помогите'],
};

function pick(moment: VoiceMoment): string | undefined {
  const urls = Object.entries(clips).filter(([path]) => MOMENTS[moment].some(key => path.toLowerCase().includes(key.toLowerCase()))).map(([, url]) => url);
  return urls[Math.floor(Math.random() * urls.length)];
}

let quietUntil = 0;
let current: HTMLAudioElement | undefined;

function enabled(): boolean { try { return localStorage.getItem('sound') !== 'off'; } catch { return true; } }

/** Plays a data/asset URL through the sfx volume with a global cooldown; lines never overlap. */
export function playVoiceUrl(url: string | undefined, cooldownMs = 0): void {
  if (!url || !enabled()) return;
  const now = performance.now();
  if (now < quietUntil) return;
  quietUntil = now + cooldownMs;
  try {
    current?.pause();
    const audio = new Audio(url);
    audio.volume = Math.min(1, .6 * audioManager.sfxVolume);
    current = audio;
    void audio.play().catch(() => {});
  } catch { /* audio must never interrupt play */ }
}

/** Bartender/hero reaction line; probabilistic so it never becomes a loop. */
export function playVoice(moment: VoiceMoment, chance = .7): void {
  if (Math.random() > chance) return;
  playVoiceUrl(pick(moment), 6000);
}

/** 1v1 cards linked to a Battlegrounds minion carry spawn/attack/death voices. */
let linked: readonly CardDefinition[] = [];
export function setLinkedCards(cards: readonly CardDefinition[]): void { linked = cards; }
export function playMinionVoice(cardId: string, event: 'spawn' | 'attack' | 'death'): void {
  playVoiceUrl(linked.find(card => card.autoBattlerId === cardId)?.audio?.[event] || undefined, 900);
}
