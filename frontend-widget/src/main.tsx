import React from 'react';
import ReactDOM from 'react-dom/client';
import { ChatWidget } from './ChatWidget.tsx';
import type { WidgetConfig } from './types';
import './index.css';

// ──────────────────────────────────────────────
//  DÉCLARATION GLOBALE
// ──────────────────────────────────────────────

declare global {
  interface Window {
    Chat4Lead: {
      init: (config: WidgetConfig) => void;
      open: () => void;
      close: () => void;
    };
  }
}

// ──────────────────────────────────────────────
//  FONCTION D'INITIALISATION
// ──────────────────────────────────────────────

function init(config: WidgetConfig) {
  // Validation config
  if (!config.apiKey) {
    console.error('[Chat4Lead] API key is required');
    return;
  }

  // Créer container si n'existe pas
  let container = document.getElementById('chat4lead-root');
  if (!container) {
    container = document.createElement('div');
    container.id = 'chat4lead-root';
    document.body.appendChild(container);
  }

  // Render React
  const root = ReactDOM.createRoot(container);
  root.render(
    <React.StrictMode>
      <ChatWidget config={config} />
    </React.StrictMode>
  );

  console.log('✅ Chat4Lead initialized');
}

// ──────────────────────────────────────────────
//  API GLOBALE — window.Chat4Lead
// ──────────────────────────────────────────────

window.Chat4Lead = {
  init,
  open: () => {
    // TODO: Implémenter contrôle externe
    console.log('[Chat4Lead] open() — not yet implemented');
  },
  close: () => {
    // TODO: Implémenter contrôle externe
    console.log('[Chat4Lead] close() — not yet implemented');
  },
};

// ──────────────────────────────────────────────
//  AUTO-INIT depuis data attributes du <script>
// ──────────────────────────────────────────────

// Pour les modules ES (Vite dev), document.currentScript est null
// On cherche le script par ses data attributes ou src
const script = (document.currentScript as HTMLScriptElement) ||
  document.querySelector('script[data-key]');

if (script) {
  const apiKey = script.getAttribute('data-key');
  if (apiKey) {
    const config: WidgetConfig = {
      apiKey,
      apiUrl: script.getAttribute('data-api-url') || undefined,
      botName: script.getAttribute('data-bot-name') || undefined,
      primaryColor: script.getAttribute('data-color') || undefined,
      position:
        (script.getAttribute('data-position') as WidgetConfig['position']) ||
        'bottom-right',
      autoOpen: script.getAttribute('data-auto-open') === 'true',
      logoUrl: script.getAttribute('data-logo-url') || undefined, // Parse logo URL
    };

    // Init après DOM ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => init(config));
    } else {
      init(config);
    }
  }
}
