import { useTranslation } from 'react-i18next';
import { InkButton } from './InkButton';
import { audioManager } from '../AudioManager';

type Props = {
  onClick: () => void;
  label?: string;
  tone?: 'ink' | 'paper' | 'blood' | 'gold' | 'toxic' | 'rose';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  'data-testid'?: string;
};

/**
 * Unified Back button for all game screens and modal windows.
 * Consistent tactile ink-edge styling, return arrow icon, click audio, and localization.
 */
export function BackButton({
  onClick,
  label,
  tone = 'ink',
  size = 'sm',
  className = '',
  'data-testid': testId = 'back-button',
}: Props) {
  const { t } = useTranslation();
  const text = label ?? t('backToMenu');

  function handleClick() {
    audioManager.play('ui_click');
    onClick();
  }

  return (
    <InkButton
      tone={tone}
      size={size}
      onClick={handleClick}
      className={`back-button inline-flex items-center gap-2 font-hand tracking-wide shadow-[3px_4px_0_#1a1a1a] ${className}`}
      data-testid={testId}
      aria-label={text}
    >
      <span className="back-arrow text-[14px] leading-none select-none opacity-80" aria-hidden="true">↩</span>
      <span>{text}</span>
    </InkButton>
  );
}
