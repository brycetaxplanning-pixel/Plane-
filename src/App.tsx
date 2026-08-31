import { useEffect } from 'react';
import { useRoute } from './lib/router';
import { AppProvider } from './state/AppContext';
import { useApp } from './state/context';
import { MODULES } from './lib/schema';
import { Nav } from './components/layout/Nav';
import { Header } from './components/layout/Header';
import { Toasts } from './components/ui/Toasts';
import { Dashboard } from './modules/Dashboard';
import { Work } from './modules/Work';
import { Planning } from './modules/Planning';
import { Spanish } from './modules/Spanish';
import { Fitness } from './modules/Fitness';
import { Finance } from './modules/Finance';
import { Coach } from './modules/Coach';
import { Settings } from './modules/Settings';

import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/charts.css';

export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}

function Shell() {
  const { state, ready } = useApp();
  const [route, navigate] = useRoute();

  // The theme choice is stamped on the root so both the app and the charts
  // pick it up; "system" removes the stamp and lets the media query decide.
  useEffect(() => {
    const root = document.documentElement;
    if (state.settings.theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', state.settings.theme);
  }, [state.settings.theme]);

  if (!ready) {
    return (
      <div className="app-shell">
        <div className="container" style={{ paddingTop: 80, textAlign: 'center' }}>
          <p className="t-muted">Loading…</p>
        </div>
      </div>
    );
  }

  const module = MODULES.find((m) => m.id === route);
  const name = state.settings.displayName;
  const title = route === 'dashboard'
    ? (name ? `${greeting()}, ${name}` : greeting())
    : route === 'settings'
      ? 'Settings'
      : module?.name ?? 'Plane';
  const sub = module ? `Module ${module.num} · ${module.blurb}` : undefined;

  return (
    <div className="app-shell">
      <Nav route={route} />
      <Header title={title} sub={sub} />
      <main className="container" style={{ paddingBottom: 'var(--sp-7)' }}>
        {route === 'dashboard' && <Dashboard navigate={navigate} />}
        {route === 'work' && <Work />}
        {route === 'planning' && <Planning />}
        {route === 'spanish' && <Spanish />}
        {route === 'fitness' && <Fitness />}
        {route === 'finance' && <Finance />}
        {route === 'coach' && <Coach />}
        {route === 'settings' && <Settings />}
      </main>
      <Toasts />
    </div>
  );
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}
