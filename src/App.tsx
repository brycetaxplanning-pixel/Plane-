import { Suspense, lazy, useEffect, useRef } from 'react';
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
import { SaveError } from './components/SaveError';
import { Launcher } from './modules/Launcher';

/**
 * Every screen but the launcher is fetched when it is first opened. The
 * launcher is what opens on a cold start, so it stays in the first chunk;
 * pulling ten modules down over cell service to show ten buttons is waste.
 */
const Dashboard = lazy(() => import('./modules/Dashboard').then((m) => ({ default: m.Dashboard })));
const Work = lazy(() => import('./modules/Work').then((m) => ({ default: m.Work })));
const Planning = lazy(() => import('./modules/Planning').then((m) => ({ default: m.Planning })));
const Spanish = lazy(() => import('./modules/Spanish').then((m) => ({ default: m.Spanish })));
const Fitness = lazy(() => import('./modules/Fitness').then((m) => ({ default: m.Fitness })));
const Finance = lazy(() => import('./modules/Finance').then((m) => ({ default: m.Finance })));
const Habits = lazy(() => import('./modules/Habits').then((m) => ({ default: m.Habits })));
const Goals = lazy(() => import('./modules/Goals').then((m) => ({ default: m.Goals })));
const Notes = lazy(() => import('./modules/Notes').then((m) => ({ default: m.Notes })));
const Tracker = lazy(() => import('./modules/Tracker').then((m) => ({ default: m.Tracker })));
const Reminders = lazy(() => import('./modules/Reminders').then((m) => ({ default: m.Reminders })));
const Coach = lazy(() => import('./modules/Coach').then((m) => ({ default: m.Coach })));
const Dating = lazy(() => import('./modules/Dating').then((m) => ({ default: m.Dating })));
const Health = lazy(() => import('./modules/Health').then((m) => ({ default: m.Health })));
const Settings = lazy(() => import('./modules/Settings').then((m) => ({ default: m.Settings })));
const NotificationsPage = lazy(() => import('./components/Notifications').then((m) => ({ default: m.NotificationsPage })));

import './styles/tokens.css';
import './styles/themes.css';
import './styles/base.css';
import './styles/components.css';
import './styles/charts.css';
import './styles/launcher.css';
import './styles/effects.css';
import { ModuleHero } from './components/layout/ModuleHero';
import { ModuleTodos } from './components/layout/ModuleTodos';
import { BackButton, SubLevelProvider } from './components/layout/SubLevel';

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

  // Every skin is dark and brings its own fixed palette; Holo is the one in
  // :root, so it is the absence of a data-skin attribute.
  useEffect(() => {
    const root = document.documentElement;
    const skin = resolveSkin(state.settings);
    if (skin === 'classic') root.removeAttribute('data-skin');
    else root.setAttribute('data-skin', skin);
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
  const title = route === 'home' ? 'Progress'
    : route === 'settings' ? 'Settings'
    : route === 'notifications' ? 'Notifications'
    : route === 'tracker' ? 'Tracker'
    : module?.name ?? 'Plane';

  return (
    <div className="app-shell">
      {/* First tab stop on every page. The nav is fourteen links; without this
          a keyboard user walks all of them before reaching the content.

          The default is prevented because the app routes on the hash: letting
          "#main" through would be read as an unknown route and bounce you to
          the launcher, which is the opposite of skipping to the content. */}
      <a
        className="skip-link"
        href="#main"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById('main')?.focus();
        }}
      >
        Skip to content
      </a>

      <Nav route={route} />

      {/* A module states its own name, number and progress in the hero below,
          in its own material. A bar above that repeating the date and the level
          was half a screen spent telling you where you already knew you were. */}
      {route !== 'launcher' && !module && <Header title={title} route={route} />}

      <main
        id="main"
        tabIndex={-1}
        className={`container view ${direction}${module || route === 'launcher' ? ' view-bare' : ''}`}
        key={route}
        style={{
          paddingBottom: 'var(--sp-7)',
          // Set once, here, so every panel, chart and control inside a module
          // inherits its hue instead of each screen having to pass its own.
          ...(module ? { ['--mod' as string]: module.color } : {}),
        }}
      >
        {route === 'launcher' && <Launcher />}
        <SubLevelProvider>
        {module && <ModuleHero id={module.id} />}
        {/* The strip under the card: the way out on the left, and on the right
            the two things you came to a module to do with its to-dos — put one
            down, or see what is outstanding. The corner used to be at the foot
            of the page, which is a scroll away from anywhere and was also
            where the module's own work ended.

            Back steps out one level: out of the business into the businesses,
            out of the module into the modules. */}
        {module && (
          <div className="modbar">
            <BackButton />
            {/* Every module carries its own slice of the one to-do list. The
                To Do module is excluded: it is already the whole list. */}
            {module.id !== 'reminders' && <ModuleTodos id={module.id} />}
          </div>
        )}
        {/* A module's chunk arrives in a few hundred milliseconds on a bad
            connection and instantly once cached, so the fallback is a quiet
            placeholder rather than a spinner that flashes. */}
        <Suspense fallback={<div className="view-loading" aria-live="polite">Loading…</div>}>
        {route === 'home' && <Dashboard navigate={navigate as (r: Route) => void} />}
        {route === 'work' && <Work />}
        {route === 'planning' && <Planning />}
        {route === 'spanish' && <Spanish />}
        {route === 'fitness' && <Fitness />}
        {route === 'finance' && <Finance />}
        {route === 'habits' && <Habits />}
        {route === 'goals' && <Goals />}
        {route === 'notes' && <Notes />}
        {route === 'reminders' && <Reminders />}
        {route === 'tracker' && <Tracker />}
        {route === 'notifications' && <NotificationsPage />}
        {route === 'coach' && <Coach />}
        {route === 'health' && <Health />}
        {route === 'dating' && <Dating />}
        {route === 'settings' && <Settings />}
        </Suspense>
        </SubLevelProvider>
      </main>

      <SaveError />
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
