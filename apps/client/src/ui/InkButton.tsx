import { motion, type HTMLMotionProps } from 'framer-motion';
import type { ReactNode } from 'react';

export const spring = { type: 'spring', stiffness: 300, damping: 20 } as const;

const tones = {
  ink: 'bg-ink text-paper border-ink',
  paper: 'bg-paper text-ink border-ink',
  gold: 'bg-legendary text-ink border-ink',
  blood: 'bg-blood text-paper border-ink',
  toxic: 'bg-toxic text-paper border-ink',
  rose: 'bg-rose-700 text-paper border-ink',
} as const;

const sizes = {
  sm: 'px-4 py-2 text-[13px]',
  md: 'px-6 py-3 text-[16px]',
  lg: 'px-10 py-5 text-[26px]',
  xl: 'px-12 py-6 text-[32px]',
} as const;

type Props = Omit<HTMLMotionProps<'button'>, 'children' | 'onClick'> & {
  children: ReactNode;
  onClick?: () => void;
  tone?: keyof typeof tones;
  size?: keyof typeof sizes;
  pulse?: boolean;
  glow?: boolean;
};

/** Hand-inked banner button: tilts and lifts on hover, presses into the paper on click. */
export function InkButton({ children, onClick, disabled, tone = 'paper', size = 'md', pulse, glow, className = '', ...buttonProps }: Props) {
  const lift = glow ? '8px 10px 0 #1a1a1a, 0 0 22px 4px rgba(217,37,37,.7)' : '8px 10px 0 #1a1a1a';
  return (
    <motion.button
      {...buttonProps}
      type="button" disabled={disabled} onClick={onClick}
      className={`ink-edge group relative select-none border-[3px] font-hand tracking-wide shadow-[5px_6px_0_#1a1a1a] disabled:opacity-50 disabled:shadow-none ${tones[tone]} ${sizes[size]} ${pulse && !disabled ? 'ink-pulse' : ''} ${className}`}
      initial={false}
      whileHover={disabled ? undefined : { scale: 1.05, rotate: -2, y: -3, boxShadow: lift }}
      whileTap={disabled ? undefined : { scale: 0.96, rotate: 1, y: 3, boxShadow: '0px 0px 0 #1a1a1a' }}
      transition={spring}
    >
      <span className="pointer-events-none absolute inset-0 opacity-[.18] transition-opacity duration-200 group-hover:opacity-40"
        style={{ backgroundImage: 'repeating-linear-gradient(-35deg,rgba(26,26,26,.14) 0 1px,transparent 1px 5px)' }} />
      {children}
    </motion.button>
  );
}
