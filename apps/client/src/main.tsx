import { audioManager } from './AudioManager';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { EconomyProvider } from './EconomyContext';
import { App } from './App';
import './style.css';

audioManager.install();
createRoot(document.getElementById('root')!).render(<React.StrictMode><EconomyProvider><App /></EconomyProvider></React.StrictMode>);
