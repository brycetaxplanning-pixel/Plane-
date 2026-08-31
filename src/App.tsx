import { useEffect, useRef } from 'react';
import { depthOf, useRoute, type Route } from './lib/router';
import { AppProvider } from './state/AppContext';
import { useApp } from './state/context';
import { MODULES } from './lib/schema';
import { todayKey } from './lib/date';
import { resolveSkin } from './lib/themes';
import { pendingAward } from './lib/awards';
import { popupInsight } from './lib/insights';
import { InsightPopup } from './components/InsightPopup';
import { EnlightenmentModal } from './components/Enlightenment';
import { Nav } from './components/layout/Nav';
import { Header } from './components/layout/Header';
import { Toasts } from './components/ui/Toasts';
import { Launcher } from './modules/Launcher';
import { Dashboard } from './modules/Dashboard';
import { Work } from './modules/Work';
import { Planning } from './modules/Planning';
import { Spanish } from './modules/Spanish';
import { Fitness } from './modules/Fitness';
import { Finance } from './modules/Finance';
import { Habits } from './modules/Habits';
import { Goals } from './modules/Goals';
import { Notes } from './modules/Notes';
import { Coach } from './modules/Coach';
import { Settings } from './modules/Settings';

import './styles/tokens.css';
import './styles/themes.css';
import './styles/base.css';
import './styles/components.css';
import './styles/charts.css';
import './styles/launcher.css';
import './styles/effects.css';

export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}

function Shell() {
  const { state, ready, update } = useApp();
  const [route, navigate] = useRoute();
  const prevDepth = useRef(depthOf(route));

  // Light/dark applies to Classic; a skin brings its own fixed scheme.
  useEffect(() => {
    const root = document.documentElement;
    const skin = resolveSkin(state.settings);
    if (skin === 'classic') root.removeAttribute('data-skin');
    else root.setAttribute('data-skin', skin);

    if (state.settings.theme === 'system' || skin !== 'classic') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', state.settings.theme);
  }, [state.settings]);

  const depth = depthOf(route);
  const direction = depth >= prevDepth.current ? 'view-in' : 'view-out';
  useEffect(() => { prevDepth.current = depth; }, [depth]);

  if (!ready) {
    return (
      <div className="app-shell">
        <div className="container" style={{ paddingTop: 80, textAlign: 'center' }}>
          <p className="t-muted">Loading…</p>
        </div>
      </div>
    );
  }

  const award = pendingAward(state);
  // Not raised over the award popup, and not on the screen that already lists
  // every finding in full.
  const insight = award || route === 'coach' ? null : popupInsight(state);
  const module = MODULES.find((m) => m.id === route);
  const title = route === 'home' ? 'Progress' : route === 'settings' ? 'Settings' : module?.name ?? 'Plane';
  const sub = module ? `Module ${module.num} · ${module.blurb}` : undefined;

  return (
    <div className="app-shell">
      <Nav route={route} />

      {route !== 'launcher' && <Header title={title} sub={sub} showBack route={route} />}

      <main
        className={`container view ${direction}`}
        key={route}
        style={{ paddingTop: route === 'launcher' ? 'var(--sp-4)' : 0, paddingBottom: 'var(--sp-7)' }}
      >
        {route === 'launcher' && <Launcher />}
        {route === 'home' && <Dashboard navigate={navigate as (r: Route) => void} />}
        {route === 'work' && <Work />}
        {route === 'planning' && <Planning />}
        {route === 'spanish' && <Spanish />}
        {route === 'fitness' && <Fitness />}
        {route === 'finance' && <Finance />}
        {route === 'habits' && <Habits />}
        {route === 'goals' && <Goals />}
        {route === 'notes' && <Notes />}
        {route === 'coach' && <Coach />}
        {route === 'settings' && <Settings />}
      </main>

      <Toasts />

      {insight && (
        <InsightPopup
          insight={insight}
          onSnooze={() => update((s) => ({ ...s, insights: { ...s.insights, lastPopup: todayKey() } }))}
          onDismiss={() => update((s) => ({
            ...s,
            insights: { ...s.insights, lastPopup: todayKey(), dismissed: [...s.insights.dismissed, insight.id] },
          }))}
        />
      )}

      {award && (
        <EnlightenmentModal
          week={award}
          onClose={() => update((s) => ({ ...s, awards: { ...s.awards, acknowledged: [...s.awards.acknowledged, award] } }))}
        />
      )}
    </div>
  );
}
