import { MODULES } from '../../lib/schema';
import { routeOf, type Route } from '../../lib/router';
import { Icons } from './Icons';

interface NavEntry {
  route: Route;
  label: string;
  icon: () => React.ReactNode;
  color?: string;
  /** Shown in the phone's bottom bar. Everything else is reached from the
   *  launcher, which is the point of the launcher. */
  primary?: boolean;
}

const MODULE_ICONS: Record<string, () => React.ReactNode> = {
  work: Icons.folder, planning: Icons.target, spanish: Icons.chat,
  fitness: Icons.run, finance: Icons.wallet, habits: Icons.repeat,
  goals: Icons.flag, notes: Icons.note, coach: Icons.compass,
  health: Icons.pulse,
};

const ENTRIES: NavEntry[] = [
  { route: 'launcher', label: 'Modules', icon: Icons.grid, primary: true },
  { route: 'home', label: 'Progress', icon: Icons.home, primary: true },
  ...MODULES.map((m) => ({
    route: m.id as Route,
    label: m.name.replace('Abitos Tax Prep', 'Abitos'),
    icon: MODULE_ICONS[m.id],
    color: m.color,
  })),
  { route: 'tracker', label: 'Tracker', icon: Icons.calendar },
  { route: 'settings', label: 'Settings', icon: Icons.gear, primary: true },
];

export function Nav({ route }: { route: Route }) {
  return (
    <nav className="nav" aria-label="Modules">
      <a className="nav-brand" href={routeOf('launcher')}>
        <span aria-hidden style={{ fontSize: 19 }}>🛫</span>
        <strong style={{ fontSize: 15 }}>Plane</strong>
      </a>

      {ENTRIES.map((e) => (
        <a
          key={e.route}
          className={`nav-item${e.primary ? '' : ' nav-desktop'}`}
          href={routeOf(e.route)}
          aria-current={route === e.route ? 'page' : undefined}
          style={{ ['--mod' as string]: e.color ?? 'var(--skin-accent, var(--series-1))' }}
        >
          {e.icon()}
          <span className="nav-label">{e.label}</span>
        </a>
      ))}
    </nav>
  );
}
