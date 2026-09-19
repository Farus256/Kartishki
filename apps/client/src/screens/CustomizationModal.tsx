import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { CosmeticBrowser } from '../cosmetics/CosmeticBrowser';
import { InkButton, spring } from '../ui/InkButton';
import { BackButton } from '../ui/BackButton';

/** Wardrobe: the same browser as the shop, filtered to what the player owns; a click wears it. */
export function CustomizationModal({ onClose, onShop }: { onClose: () => void; onShop: () => void }) {
  const { t } = useTranslation();
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [onClose]);
  return (
    <motion.div className="absolute inset-0 z-50 grid place-items-center bg-black/70" data-testid="customize-modal"
      role="presentation" onPointerDown={event => { if (event.target === event.currentTarget) onClose(); }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div role="dialog" aria-modal="true" aria-labelledby="customize-title" className="ink-edge customize-dialog border-[4px] border-ink bg-paper shadow-[10px_12px_0_rgba(0,0,0,.6)]"
        initial={{ scale: 0.85, rotate: -3 }} animate={{ scale: 1, rotate: 0 }} exit={{ scale: 0.9, opacity: 0 }} transition={spring}>
        <header className="customize-head">
          <h2 id="customize-title" className="font-hand text-[40px] text-ink">{t('customizeTitle')}</h2>
          <div className="customize-buttons">
            <InkButton tone="gold" size="sm" onClick={() => { onClose(); onShop(); }}>{t('customizeShop')}</InkButton>
            <BackButton onClick={onClose} label={t('close')} />
          </div>
        </header>
        <div className="customize-body"><CosmeticBrowser mode="owned" onShop={() => { onClose(); onShop(); }} /></div>
      </motion.div>
    </motion.div>
  );
}
