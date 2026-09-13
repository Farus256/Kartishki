import { audioManager } from '../AudioManager';
import { useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import i18n from '@kartishki/i18n';
import { InkButton, spring } from '../ui/InkButton';

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const [sound, setSound] = useState(() => localStorage.getItem('sound') !== 'off');
  const [sfx, setSfx] = useState(() => Math.round(audioManager.sfxVolume * 100));
  const [music, setMusic] = useState(() => Math.round(audioManager.musicVolume * 100));
  return (
    <motion.div className="absolute inset-0 z-50 grid place-items-center bg-black/70"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div className="ink-edge w-[560px] border-[4px] border-ink bg-paper p-8 shadow-[10px_12px_0_rgba(0,0,0,.6)]"
        initial={{ scale: 0.85, rotate: -3 }} animate={{ scale: 1, rotate: 0 }} exit={{ scale: 0.9, opacity: 0 }} transition={spring}>
        <h2 className="font-hand text-[40px] text-ink">{t('settings')}</h2>

        <label className="mt-6 block font-mono text-[13px] text-ink/70">
          {t('language')}
          <select aria-label={t('language')} value={i18n.language} onChange={e => void i18n.changeLanguage(e.target.value)}
            className="mt-2 w-full border-[3px] border-ink bg-paper px-3 py-2 font-mono text-[14px] text-ink">
            <option value="ru">Русский</option>
            <option value="en">English</option>
          </select>
        </label>

        <div className="mt-6 flex items-center justify-between border-[3px] border-ink px-4 py-3">
          <span className="font-mono text-[13px]">{t('sound')}</span>
          <InkButton size="sm" tone={sound ? 'ink' : 'paper'}
            onClick={() => { audioManager.setEnabled(!sound); setSound(!sound); }}>
            {t(sound ? 'on' : 'off')}
          </InkButton>
        </div>

        <label className="mt-5 block font-mono text-[13px] text-ink/70">
          {t('sfxVolume')} · {sfx}%
          <input type="range" min={0} max={100} value={sfx} aria-label={t('sfxVolume')}
            className="mt-2 w-full accent-[#1a1a1a]"
            onChange={e => { const n = Number(e.target.value); audioManager.setSfxVolume(n / 100); setSfx(n); }} />
        </label>
        <label className="mt-4 block font-mono text-[13px] text-ink/70">
          {t('musicVolume')} · {music}%
          <input type="range" min={0} max={100} value={music} aria-label={t('musicVolume')}
            className="mt-2 w-full accent-[#1a1a1a]"
            onChange={e => { const n = Number(e.target.value); audioManager.setMusicVolume(n / 100); setMusic(n); }} />
        </label>

        <div className="mt-8 flex justify-end">
          <InkButton tone="blood" onClick={onClose}>{t('close')}</InkButton>
        </div>
      </motion.div>
    </motion.div>
  );
}
