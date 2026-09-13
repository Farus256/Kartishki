import i18n from '@kartishki/i18n';
import { type PlayerSettings } from '@kartishki/shared';
import { audioManager } from './AudioManager';

let applied = '';

export function currentLocalSettings(): Pick<PlayerSettings, 'language' | 'sound' | 'sfxVolume' | 'musicVolume'> {
  let sound = true;
  try { sound = localStorage.getItem('sound') !== 'off'; } catch { /* keep default */ }
  return {
    language: i18n.language.startsWith('en') ? 'en' : 'ru',
    sound,
    sfxVolume: audioManager.sfxVolume,
    musicVolume: audioManager.musicVolume,
  };
}

export function applyPlayerSettings(settings: PlayerSettings) {
  const key = JSON.stringify(settings);
  if (key === applied) return;
  applied = key;
  void i18n.changeLanguage(settings.language);
  audioManager.setEnabled(settings.sound);
  audioManager.setSfxVolume(settings.sfxVolume);
  audioManager.setMusicVolume(settings.musicVolume);
}
