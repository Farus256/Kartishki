import { audioManager } from './AudioManager';
import React from 'react';
import '@kartishki/i18n';
import { createRoot } from 'react-dom/client';
import { WakeScreen } from './screens/WakeScreen';
import './style.css';
import './cosmetics.css';

audioManager.install();
const root = createRoot(document.getElementById('root')!);
let mounted = false;

async function mountApp() {
  if (mounted) return;
  mounted = true;
  const { App } = await import('./App');
  const { EconomyProvider } = await import('./EconomyContext');
  root.render(<React.StrictMode><EconomyProvider><App /></EconomyProvider></React.StrictMode>);
}

root.render(<React.StrictMode><WakeScreen onReady={() => { void mountApp(); }} /></React.StrictMode>);
