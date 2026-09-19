import { audioManager } from '../AudioManager';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import i18n from '@kartishki/i18n';
import type { PlayerSettings } from '@kartishki/shared';
import { playerSession } from '../playerSession';
import { InkButton, spring } from '../ui/InkButton';
import { BackButton } from '../ui/BackButton';
import './settings.css';

/**
 * Settings as a sheet of paper pinned over the game: a hand-lettered title, three ruled sections (language, sound,
 * volumes), a stamped ON/OFF switch, two language stamps and ink sliders with a bottle-cap knob. Every control
 * saves to the account after a short debounce; guests keep the local values.
 */
export function SettingsModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const player = useSyncExternalStore(playerSession.subscribe, playerSession.getSnapshot);
  const [sound, setSound] = useState(() => localStorage.getItem('sound') !== 'off');
  const [sfx, setSfx] = useState(() => Math.round(audioManager.sfxVolume * 100));
  const [music, setMusic] = useState(() => Math.round(audioManager.musicVolume * 100));
  const language = i18n.language.startsWith('en') ? 'en' : 'ru';
  const pending = useRef<Partial<PlayerSettings>>({});
  const persist = useRef<ReturnType<typeof setTimeout>>(undefined);
  function flush() {
    clearTimeout(persist.current);
    persist.current = undefined;
    const patch = pending.current;
    pending.current = {};
    if (playerSession.getSnapshot().library && Object.keys(patch).length) void playerSession.saveSettings(patch);
  }
  function save(patch: Partial<PlayerSettings>) {
    if (!player.library) return;
    Object.assign(pending.current, patch);
    clearTimeout(persist.current);
    persist.current = setTimeout(flush, 350);
  }
  const close = () => { flush(); onClose(); };
  useEffect(() => () => flush(), []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  const setLanguage = (next: 'ru' | 'en') => { if (next === language) return; void i18n.changeLanguage(next); save({ language: next }); };
  return (
    <motion.div className="settings-veil" role="presentation" onPointerDown={event => { if (event.target === event.currentTarget) close(); }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div role="dialog" aria-modal="true" aria-labelledby="settings-title" className="settings-sheet" data-testid="settings-sheet"
        initial={{ scale: .92, rotate: -2.5, y: 18 }} animate={{ scale: 1, rotate: -.6, y: 0 }} exit={{ scale: .96, opacity: 0, y: 10 }} transition={spring}>
        <i className="settings-pin" aria-hidden />
        <header className="settings-head">
          <h2 id="settings-title">{t('settings')}</h2>
          <span className="settings-stamp" aria-hidden>{player.library ? player.library.profile.username : t('guest')}</span>
        </header>

        <section className="settings-row">
          <div className="settings-label"><b>{t('language')}</b></div>
          <div className="settings-stamps" role="radiogroup" aria-label={t('language')}>
            {(['ru', 'en'] as const).map(code => <motion.button key={code} type="button" role="radio" aria-checked={language === code} className={`settings-lang ${language === code ? 'is-on' : ''}`} onClick={() => setLanguage(code)}
              whileHover={{ y: -2, rotate: code === 'ru' ? -2 : 2 }} whileTap={{ scale: .94, y: 1 }} transition={{ type: 'spring', stiffness: 500, damping: 24 }}>
              <span>{code === 'ru' ? 'Русский' : 'English'}</span><small>{code.toUpperCase()}</small>
            </motion.button>)}
          </div>
        </section>

        <section className="settings-row">
          <div className="settings-label"><b>{t('sound')}</b><small>{t(sound ? 'on' : 'off')}</small></div>
          <button type="button" role="switch" aria-checked={sound} aria-label={t('sound')} className={`settings-switch ${sound ? 'is-on' : ''}`}
            onClick={() => { audioManager.setEnabled(!sound); setSound(!sound); save({ sound: !sound }); }}>
            <span className="settings-switch-track"><i className="settings-switch-knob" /></span>
            <b>{t(sound ? 'on' : 'off')}</b>
          </button>
        </section>

        <Slider label={t('sfxVolume')} value={sfx} disabled={!sound} onChange={n => { audioManager.setSfxVolume(n / 100); setSfx(n); save({ sfxVolume: n / 100 }); }} />
        <Slider label={t('musicVolume')} value={music} disabled={!sound} onChange={n => { audioManager.setMusicVolume(n / 100); setMusic(n); save({ musicVolume: n / 100 }); }} />

        <footer className="settings-foot">
          <small>{player.library ? t('settingsSavedToAccount') : t('settingsGuestNote')}</small>
          <BackButton onClick={close} label={t('close')} />
        </footer>
      </motion.div>
    </motion.div>
  );
}

/** Ink slider: a hand-drawn rule with a filled portion and a bottle-cap knob; the native range input stays for input and a11y. */
function Slider({ label, value, disabled, onChange }: { label: string; value: number; disabled?: boolean; onChange: (n: number) => void }) {
  return <section className={`settings-row is-slider ${disabled ? 'is-muted' : ''}`}>
    <div className="settings-label"><b>{label}</b><small>{value}%</small></div>
    <label className="settings-slider" style={{ '--v': `${value}%` } as React.CSSProperties}>
      <i className="settings-slider-rule" aria-hidden /><i className="settings-slider-fill" aria-hidden /><i className="settings-slider-knob" aria-hidden />
      <input type="range" min={0} max={100} value={value} aria-label={label} disabled={disabled} onChange={e => onChange(Number(e.target.value))} />
    </label>
  </section>;
}
