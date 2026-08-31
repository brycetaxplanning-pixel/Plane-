import { routeOf, type Route } from '../../lib/router';
import { Icons } from './Icons';

interface NavEntry {
  route: Route;
  label: string;
  icon: () => React.ReactNode;
  color?: string;
}

const ENTRIES: NavEntry[] = [
  { route: 'dashboard', label: 'Today',   icon: Icons.home },
  { route: 'work',      label: 'Abitos',  icon: Icons.folder,  color: 'var(--mod-work)' },
  { route: 'planning',  label: 'Planning', icon: Icons.target, color: 'var(--mod-planning)' },
  { route: 'spanish',   label: 'Spanish', icon: Icons.chat,    color: 'var(--mod-spanish)' },
  { route: 'fitness',   label: 'Fitness', icon: Icons.run,     color: 'var(--mod-fitness)' },
  { route: 'finance',   label: 'Money',   icon: Icons.wallet,  color: 'var(--mod-finance)' },
  { route: 'coach',     label: 'Coach',   icon: Icons.compass, color: 'var(--mod-coach)' },
];

export function Nav({ route }: { route: Route }) {
  return (
    <nav className="nav" aria-label="Modules">
      <div className="nav-brand">
        <span aria-hidden style={{ fontSize: 19 }}>🛫</span>
        <strong style={{ fontSize: 15 }}>Plane</strong>
      </div>

      {ENTRIES.map((e) => (
        <a
          key={e.route}
          className="nav-item"
          href={routeOf(e.route)}
          aria-current={route === e.route ? 'page' : undefined}
          style={{ ['--mod' as string]: e.color ?? 'var(--series-1)' }}
        >
          {e.icon()}
          <span className="nav-label">{e.label}</span>
        </a>
      ))}

      <a
        className="nav-item"
        href={routeOf('settings')}
        aria-current={route === 'settings' ? 'page' : undefined}
        style={{ marginTop: 'auto', display: 'none' }}
        data-desktop-only
      >
        {Icons.gear()}
        <span className="nav-label">Settings</span>
      </a>
    </nav>
  );
}
