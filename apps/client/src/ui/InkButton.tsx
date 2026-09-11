import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

export const spring = { type: 'spring', stiffness: 300, damping: 20 } as const;

const tones = {
  ink: 'bg-ink text-paper border-ink',
  paper: 'bg-paper text-ink border-ink',
  gold: 'bg-legendary text-ink border-ink',
  blood: 'bg-blood text-paper border-ink',
} as const;

const sizes = {
  sm: 'px-4 py-2 text-[13px]',
  md: 'px-6 py-3 text-[16px]',
  lg: 'px-10 py-5 text-[26px]',
} as const;

type Props = {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  tone?: keyof typeof tones;
  size?: keyof typeof sizes;
  pulse?: boolean;
  title?: string;
  className?: string;
};

/** Hand-inked banner button: tilts and lifts on hover, presses into the paper on click. */
export function InkButton({ children, onClick, disabled, tone = 'paper', size = 'md', pulse, title, className = '' }: Props) {
  return (
    <motion.button
      type="button" title={title} disabled={disabled} onClick={onClick}
      className={`ink-edge group relative select-none border-[3px] font-hand tracking-wide shadow-[5px_6px_0_#1a1a1a] disabled:opacity-40 disabled:shadow-none ${tones[tone]} ${sizes[size]} ${className}`}
      initial={false}
      whileHover={disabled ? undefined : { scale: 1.05, rotate: -2, y: -3, boxShadow: '8px 10px 0 #1a1a1a' }}
      whileTap={disabled ? undefined : { scale: 0.96, rotate: 1, y: 3, boxShadow: '0px 0px 0 #1a1a1a' }}
      animate={pulse && !disabled ? { scale: [1, 1.035, 1] } : { scale: 1 }}
      transition={pulse && !disabled ? { duration: 1.6, repeat: Infinity, ease: 'easeInOut' } : spring}
    >
      <span className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
        style={{ backgroundImage: 'repeating-linear-gradient(-35deg,rgba(26,26,26,.14) 0 1px,transparent 1px 5px)' }} />
      {children}
    </motion.button>
  );
}
