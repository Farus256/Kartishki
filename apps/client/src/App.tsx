import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import i18n from '@kartishki/i18n';
import { playerSession } from './playerSession';
import { session } from './session';
import { Stage } from './ui/Stage';
import { LandingScreen } from './screens/LandingScreen';
import { MainMenuScreen } from './screens/MainMenuScreen';
import { MatchmakingModal } from './screens/MatchmakingModal';
import { DeckBuilderScreen } from './screens/DeckBuilderScreen';
import { ShopScreen } from './screens/ShopScreen';
import { MatchScreen } from './screens/MatchScreen';
import { BattlegroundsScreen } from './screens/BattlegroundsScreen';
import { SettingsModal } from './screens/SettingsModal';
import { audioManager } from './AudioManager';
import { menuTrackUrl, useMenuTracks } from './ui/useCatalog';

type Screen = 'landing' | 'menu' | 'deck' | 'shop' | 'match' | 'battlegrounds';

i18n.on('languageChanged', language => { document.documentElement.lang = language; });

export function App() {
  const player = useSyncExternalStore(playerSession.subscribe, playerSession.getSnapshot);
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const [screen, setScreen] = useState<Screen>(() => sessionStorage.getItem('kartishki-ab-reconnect') ? 'battlegrounds' : playerSession.getSnapshot().library ? 'menu' : 'landing');
  const [guest, setGuest] = useState(() => !!sessionStorage.getItem('kartishki-ab-reconnect'));
  const [queue, setQueue] = useState(false);
  const [settings, setSettings] = useState(false);
  const signedIn = !!player.library;
  const menuTracks = useMenuTracks();

  const firstPaint = useRef(true);
  useEffect(() => { firstPaint.current = false; }, []);
  useEffect(() => { if (signedIn && screen === 'landing') setScreen('menu'); }, [signedIn, screen]);
  useEffect(() => { if (!signedIn && !guest && screen !== 'landing') setScreen('landing'); }, [signedIn, guest, screen]);
  useEffect(() => { if (screen === 'match' && state.status === 'offline') setScreen('menu'); }, [screen, state.status]);
  useEffect(() => { if (state.status === 'offline') playerSession.clearMatchReward(); }, [state.status]);

  useEffect(() => { const open = () => setSettings(true); window.addEventListener('open-settings', open); return () => window.removeEventListener('open-settings', open); }, []);
  useEffect(() => { audioManager.setMenuTracks(menuTracks.map(track => menuTrackUrl(track.url))); }, [menuTracks]);
  useEffect(() => {
    if (screen === 'menu') audioManager.playMenu();
    else audioManager.stopMenu();
    return () => audioManager.stopMenu();
  }, [screen]);

  function toMenu() { setScreen('menu'); }
  function exit() {
    setGuest(false); setScreen('landing');
    if (signedIn) void playerSession.logout();
  }

  return (
    <Stage>
      <AnimatePresence mode="wait">
        <motion.div key={screen} className="absolute inset-0"
          initial={{ opacity: 0, scale: 0.99 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.01 }}
          transition={{ duration: 0.26, ease: 'easeOut' }}>
          {screen === 'landing' && <LandingScreen onGuest={() => { setGuest(true); setScreen('menu'); }} />}
          {screen === 'menu' && (
            <MainMenuScreen onPlay={() => setQueue(true)} onBattlegrounds={() => setScreen('battlegrounds')}
              onDeck={() => setScreen('deck')} onShop={() => setScreen('shop')}
              onSettings={() => setSettings(true)} onExit={exit} />
          )}
          {screen === 'deck' && <DeckBuilderScreen onBack={toMenu} onShop={() => setScreen('shop')} />}
          {screen === 'shop' && <ShopScreen onBack={toMenu} />}
          {screen === 'match' && <MatchScreen onLeave={toMenu} />}
          {screen === 'battlegrounds' && <BattlegroundsScreen onLeave={toMenu} />}
        </motion.div>
      </AnimatePresence>

      {firstPaint.current === false && (
        <AnimatePresence>
          <motion.div key={`wipe-${screen}`} className="pointer-events-none absolute inset-0 z-[60]"
            style={{ background: 'linear-gradient(90deg, transparent, #1a1a1a 18%, #1a1a1a 82%, transparent)' }}
            initial={{ x: '-115%' }} animate={{ x: '115%' }} exit={{ opacity: 0 }}
            transition={{ duration: 0.55, ease: 'easeInOut' }} />
        </AnimatePresence>
      )}

      <AnimatePresence>
        {queue && <MatchmakingModal onFound={() => { setQueue(false); setScreen('match'); }} onCancel={() => setQueue(false)} />}
        {settings && <SettingsModal onClose={() => setSettings(false)} />}
      </AnimatePresence>
    </Stage>
  );
}
