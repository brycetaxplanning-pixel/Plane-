import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { warmScreens } from './lib/warm';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Offline shell. Registered only in a production build so the dev server is
// never served from a stale cache.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch((err) => {
      console.warn('[pwa] service worker registration failed', err);
    });
  });
}

// The other screens are code-split; fetch them in the background so they are
// on the device before the signal goes.
if (import.meta.env.PROD) warmScreens();
