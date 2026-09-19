import { useMemo, useState, useSyncExternalStore } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { starterAutoBattlerCatalog, type AutoBattlerMinionDef } from '@kartishki/shared';
import type { AbMinion } from '../autoBattlerSession';
import { playerSession } from '../playerSession';
import { audioManager } from '../AudioManager';
import { Backdrop } from '../ui/Backdrop';
import { InkButton, spring } from '../ui/InkButton';
import { MinionTile } from '../battlegrounds/MinionTile';
import { minionTribeLabel } from '../battlegrounds/minionView';
import '../battlegrounds/battlegrounds.css';
import '../battlegrounds/fx-cards.css';
import '../battlegrounds/fx-polish.css';
import './landing.css';

const SHOWCASE_IDS = ['ab-scrap-bot', 'ab-annoyer', 'ab-boar'] as const;

function buildShowcaseMinions(): { minion: AbMinion; def: AutoBattlerMinionDef }[] {
  return SHOWCASE_IDS.map((id, idx) => {
    const def = starterAutoBattlerCatalog.minions.find(m => m.id === id);
    if (!def) return null;
    const isGolden = idx === 1;
    const minion: AbMinion = {
      id: `landing-showcase-${def.id}`,
      cardId: def.id,
      baseId: def.id,
      kind: 'minion',
      attack: isGolden ? def.attack * 2 : def.attack,
      health: isGolden ? def.health * 2 : def.health,
      maxHealth: isGolden ? def.health * 2 : def.health,
      tavernTier: def.tavernTier,
      keywords: [...def.keywords],
      tribes: def.tribes ? [...def.tribes] : [],
      golden: isGolden,
      owner: 'landing',
    };
    return { minion, def };
  }).filter((entry): entry is { minion: AbMinion; def: AutoBattlerMinionDef } => entry !== null);
}

export function LandingScreen({ onGuest }: { onGuest: () => void }) {
  const { t, i18n } = useTranslation();
  const player = useSyncExternalStore(playerSession.subscribe, playerSession.getSnapshot);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const showcaseMinions = useMemo(() => buildShowcaseMinions(), []);

  const isUserValid = username.trim().length >= 3 && username.trim().length <= 24;
  const isPassValid = password.length >= 8;

  function handleTabChange(nextMode: 'login' | 'register') {
    if (nextMode === mode) return;
    audioManager.play('ui_select');
    setMode(nextMode);
  }

  function handleLogin() {
    void playerSession.authenticate('login', username.trim(), password);
  }

  function handleRegister() {
    void playerSession.authenticate('register', username.trim(), password);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (mode === 'login') handleLogin();
    else handleRegister();
  }

  return (
    <div className="landing-scene text-paper">
      <Backdrop tone="noir" />
      <div className="landing-ambient" />
      <div className="landing-noise" />

      {/* Left side: Game Title + Dossier Casefile Form */}
      <motion.div
        className="absolute top-[48px] left-[84px] w-[640px] z-10"
        initial={{ opacity: 0, x: -40 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ ...spring, delay: 0.05 }}
      >
        {/* Game Title & Header */}
        <div className="mb-5">
          <div className="flex items-center justify-between">
            <div className="inline-flex items-center gap-3 border border-paper/30 bg-black/40 px-3 py-1 font-mono text-[11px] tracking-[5px] text-paper/70 uppercase">
              <span className="text-blood">●</span>
              {t('caseFile')}
            </div>
            <button
              type="button"
              onClick={() => {
                audioManager.play('ui_click');
                const nextLang = i18n.language.startsWith('en') ? 'ru' : 'en';
                void i18n.changeLanguage(nextLang);
              }}
              className="landing-lang-btn"
              title={i18n.language.startsWith('en') ? 'Переключить на русский' : 'Switch to English'}
            >
              <span className="text-blood text-[10px]">🌐</span>
              <span className={i18n.language.startsWith('ru') ? 'font-bold text-blood' : 'opacity-60'}>RU</span>
              <span className="opacity-40">/</span>
              <span className={i18n.language.startsWith('en') ? 'font-bold text-blood' : 'opacity-60'}>EN</span>
            </button>
          </div>
          <h1 className="mt-1 font-hand text-[92px] leading-none tracking-[3px] text-paper drop-shadow-[4px_4px_0_rgba(0,0,0,0.85)]">
            {t('title')}
            <motion.span
              className="ml-3 inline-block text-blood"
              animate={{ rotate: [12, 18, 12] }}
              transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
            >
              ✳
            </motion.span>
          </h1>
        </div>

        {/* Dossier Folder */}
        <div className="landing-folder relative p-2 pt-0 -rotate-[0.6deg]">
          {/* Metal paperclip pinned at top */}
          <div className="landing-paperclip" aria-hidden />

          {/* Dossier File Tabs */}
          <div className="landing-tabs -mb-[2px] pt-2 px-3" role="tablist" aria-label={t('account')}>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'login'}
              className={`landing-tab ${mode === 'login' ? 'is-active' : ''}`}
              onClick={() => handleTabChange('login')}
            >
              ✦ {t('authLoginTab')}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'register'}
              className={`landing-tab ${mode === 'register' ? 'is-active' : ''}`}
              onClick={() => handleTabChange('register')}
            >
              ✎ {t('authRegisterTab')}
            </button>
            <div className="ml-auto self-center pr-12">
              <span className="landing-stamp-red">
                {mode === 'login' ? t('authStampLogin') : t('authStampRegister')}
              </span>
            </div>
          </div>

          {/* Aged Parchment Document Sheet */}
          <div className="landing-sheet landing-sheet-rule p-6 pl-10 pr-6">
            {/* Sheet Header */}
            <div className="flex items-start justify-between border-b-2 border-ink/20 pb-3 mb-4">
              <div>
                <span className="font-stencil text-[13px] tracking-[2px] uppercase text-ink/80">
                  {t('authDossier')} · {mode === 'login' ? t('login') : t('register')}
                </span>
                <p className="font-hand text-[17px] text-ink/75 leading-tight mt-0.5">
                  {mode === 'login' ? t('authSubtitleLogin') : t('authSubtitleRegister')}
                </p>
              </div>
              <span className="landing-stamp-gray shrink-0 mt-0.5">
                {t('authArchiveTitle')}
              </span>
            </div>

            {/* Input Form */}
            <form onSubmit={handleSubmit} className="space-y-3.5">
              {/* Username Input */}
              <div>
                <label
                  htmlFor="auth-username"
                  className="flex items-center justify-between font-mono text-[11px] font-bold tracking-wider text-ink/80 uppercase mb-1.5"
                >
                  <span className="flex items-center gap-1.5">
                    <span className="text-blood text-[13px]">👤</span>
                    {t('username')}
                  </span>
                  <span className={`text-[10px] lowercase font-mono ${isUserValid ? 'text-toxic font-bold' : 'text-ink/50'}`}>
                    {username.length > 0 ? `${username.length}/24 ${t('chars')}` : t('usernameRequirement')}
                  </span>
                </label>
                <input
                  id="auth-username"
                  name="username"
                  value={username}
                  maxLength={24}
                  autoComplete="username"
                  placeholder={mode === 'register' ? t('authPlaceholderUsernameRegister') : t('authPlaceholderUsernameLogin')}
                  onChange={e => setUsername(e.target.value)}
                  className="landing-input"
                />
              </div>

              {/* Password Input */}
              <div>
                <label
                  htmlFor="auth-password"
                  className="flex items-center justify-between font-mono text-[11px] font-bold tracking-wider text-ink/80 uppercase mb-1.5"
                >
                  <span className="flex items-center gap-1.5">
                    <span className="text-blood text-[13px]">🔑</span>
                    {t('password')}
                  </span>
                  <span className={`text-[10px] lowercase font-mono ${isPassValid ? 'text-toxic font-bold' : 'text-ink/50'}`}>
                    {password.length > 0 ? (isPassValid ? t('passwordSecure') : `${password.length}/8 ${t('chars')}`) : t('passwordRequirement')}
                  </span>
                </label>
                <div className="relative">
                  <input
                    id="auth-password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    maxLength={128}
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    placeholder="••••••••••••"
                    onChange={e => setPassword(e.target.value)}
                    className="landing-input pr-10"
                  />
                  <button
                    type="button"
                    title={showPassword ? t('hidePassword') : t('showPassword')}
                    onClick={() => {
                      audioManager.play('ui_click');
                      setShowPassword(v => !v);
                    }}
                    className="landing-pw-toggle"
                  >
                    {showPassword ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                        <line x1="1" y1="1" x2="23" y2="23" />
                      </svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex items-center gap-3">
                <InkButton
                  tone={mode === 'login' ? 'blood' : 'paper'}
                  size="md"
                  disabled={player.loading}
                  onClick={handleLogin}
                  className={`flex-1 ${mode === 'login' ? 'font-bold shadow-[6px_7px_0_#1a1a1a]' : 'opacity-90'}`}
                >
                  {player.loading && mode === 'login' ? (
                    <span className="inline-flex items-center gap-2">
                      <span className="inline-block animate-spin" aria-hidden="true">✦</span>
                      <span>{t('authenticating')}</span>
                    </span>
                  ) : t('login')}
                </InkButton>

                <InkButton
                  tone={mode === 'register' ? 'blood' : 'paper'}
                  size="md"
                  disabled={player.loading}
                  onClick={handleRegister}
                  className={`flex-1 ${mode === 'register' ? 'font-bold shadow-[6px_7px_0_#1a1a1a]' : 'opacity-90'}`}
                >
                  {player.loading && mode === 'register' ? (
                    <span className="inline-flex items-center gap-2">
                      <span className="inline-block animate-spin" aria-hidden="true">✦</span>
                      <span>{t('authenticating')}</span>
                    </span>
                  ) : t('register')}
                </InkButton>
              </div>

              {/* Error Alert */}
              <AnimatePresence>
                {player.error && (
                  <motion.div
                    role="alert"
                    initial={{ opacity: 0, y: -6, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -4 }}
                    className="landing-error-banner"
                  >
                    <span className="font-bold text-[14px]">⚠</span>
                    <span className="font-bold">{t(player.error)}</span>
                  </motion.div>
                )}
              </AnimatePresence>
            </form>

            {/* Guest Pass Section */}
            <div className="landing-guest-section mt-4 flex items-center justify-between gap-4">
              <div className="flex-1 pr-2">
                <div className="flex items-center gap-2 mb-1">
                  <span className="landing-stamp-red text-[9px] py-0.5 px-2 tracking-widest">
                    {t('guestPass')}
                  </span>
                  <span className="font-mono text-[10px] text-ink/60 uppercase">
                    {t('guestMode')}
                  </span>
                </div>
                <p className="font-mono text-[11px] text-ink/70 leading-snug">
                  {t('guestHint')}
                </p>
              </div>
              <InkButton
                tone="ink"
                size="sm"
                onClick={() => {
                  audioManager.play('ui_click');
                  onGuest();
                }}
                className="shrink-0 border-paper/70 font-mono text-[12px] tracking-wide"
              >
                {t('playAsGuest')}<span aria-hidden="true"> →</span>
              </InkButton>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Right side: Evidence Gallery Showcase Cards (Battlegrounds Minions) */}
      <div className="absolute top-[80px] right-[60px] z-10">
        <div className="flex items-center justify-end gap-3 mb-4 pr-3">
          <div className="h-[2px] w-24 bg-paper/20" />
          <span className="font-mono text-[12px] tracking-[4px] text-paper/60 uppercase">
            {t('showcaseAbTitle')}
          </span>
          <span className="text-blood">✳</span>
        </div>

        <div className="ab-discover-row landing-ab-row">
          {showcaseMinions.map(({ minion, def }, index) => {
            const rot = (index - 1) * 4;
            const tagTone = minion.golden
              ? 'showcase-tag-legendary'
              : minion.tavernTier >= 4
              ? 'showcase-tag-ultimate'
              : 'showcase-tag-common';

            const tagLabel = minion.golden
              ? `★ ${minion.tavernTier} · ${t('abTriple')}`
              : `★ ${minion.tavernTier} · ${minionTribeLabel(def, starterAutoBattlerCatalog, i18n.language, t)}`;

            return (
              <motion.div
                key={minion.id}
                className="flex flex-col items-center"
                initial={{ opacity: 0, y: 40, rotate: 0 }}
                animate={{
                  opacity: 1,
                  y: [0, -10, 0],
                  rotate: rot,
                }}
                whileHover={{
                  scale: 1.05,
                  rotate: 0,
                  y: -16,
                  zIndex: 30,
                  transition: { duration: 0.2 },
                }}
                onHoverStart={() => audioManager.play('card_hover')}
                transition={{
                  opacity: { duration: 0.45, delay: 0.1 * index },
                  rotate: spring,
                  y: {
                    duration: 4.2 + index * 0.8,
                    repeat: Infinity,
                    ease: 'easeInOut',
                    delay: index * 0.35,
                  },
                }}
              >
                <div className="landing-ab-card-wrap">
                  <MinionTile
                    minion={minion}
                    catalog={starterAutoBattlerCatalog}
                    fullCard
                    dossier
                    arrive={false}
                    onClick={() => audioManager.play('card_flip')}
                  />
                </div>
                <div className="mt-2">
                  <span className={`showcase-tag ${tagTone}`}>
                    {tagLabel}
                  </span>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Bottom bar */}
      <footer className="absolute bottom-[24px] left-0 right-0 flex items-center justify-between px-16 pointer-events-none z-10">
        <span className="font-mono text-[10px] tracking-[3px] text-paper/40 uppercase">
          {t('landingNote')}
        </span>
        <span className="font-mono text-[10px] tracking-[2px] text-paper/30">
          {t('inkAndPaper')}
        </span>
      </footer>
    </div>
  );
}
