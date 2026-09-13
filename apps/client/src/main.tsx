import { audioManager } from './AudioManager';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { probeServerHealth } from './serverReady';
import { WakeScreen } from './screens/WakeScreen';
import { serverOrigin } from './serverUrl';
import './style.css';

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

async function boot() {
  if (await probeServerHealth(serverOrigin())) {
    await mountApp();
    return;
  }
  root.render(<React.StrictMode><WakeScreen onReady={() => { void mountApp(); }} /></React.StrictMode>);
}

void boot();
