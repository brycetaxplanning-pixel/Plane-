import { MODULES, type ModuleId } from '../lib/schema';
import { levelFor, streakOf, totalXp } from '../lib/gamification';
import { moduleSummaries } from '../state/selectors';
import { useApp } from '../state/context';
import { routeOf, type Route } from '../lib/router';
import { Icons } from '../components/layout/Icons';

/** The hub. Every module is one big button; nothing else competes with them. */
export function Launcher() {
  const { state } = useApp();
  const summaries = moduleSummaries(state);
  const xp = totalXp(state.xp);
  const { level, into, span } = levelFor(xp);
  const streak = streakOf(state.activeDays);
  const name = state.settings.displayName;

  const nudges = MODULES
    .map((m) => ({ module: m, nudge: summaries[m.id as ModuleId].nudge }))
    .filter((n): n is { module: (typeof MODULES)[number]; nudge: string } => Boolean(n.nudge))
    .slice(0, 4);

  return (
    <div className="launch">
      <a className="launch-strip" href={routeOf('home')}>
        <span className="launch-level">
          <span className="launch-level-num">{level}</span>
          <span className="t-xs t-muted">LEVEL</span>
        </span>
        <span className="grow" style={{ minWidth: 0 }}>
          <span className="spread" style={{ marginBottom: 5 }}>
            <span className="t-sm t-bold truncate">{name ? `${greeting()}, ${name}` : greeting()}</span>
            <span className="t-xs t-muted t-num launch-xp-num">{into}/{span} XP</span>
          </span>
          <span className="xpbar"><i style={{ width: `${Math.round((into / span) * 100)}%` }} /></span>
        </span>
        <span className="launch-streak" title={`${streak.current}-day streak`}>
          <span style={{ width: 17, height: 17, display: 'inline-flex', color: 'var(--status-warning)' }}>{Icons.flame()}</span>
          <span className="t-num t-bold">{streak.current}</span>
        </span>
      </a>

      <div className="launch-grid">
        {MODULES.map((m, i) => {
          const s = summaries[m.id as ModuleId];
          const pct = Math.max(0, Math.min(1, s.progress));
          return (
            <a
              key={m.id}
              className="mtile"
              href={routeOf(m.id as Route)}
              style={{ ['--mod' as string]: m.color, animationDelay: `${i * 45}ms` }}
            >
              <span className="mtile-sheen" aria-hidden />
              <span className="mtile-num">{m.num}</span>
              <span className="mtile-glyph" aria-hidden>{m.icon}</span>
              <span className="mtile-name">{m.name}</span>
              <span className="mtile-stat">
                <b>{s.headline}</b> {s.caption}
              </span>
              <span className="mtile-meter" aria-hidden>
                <i style={{ width: `${pct * 100}%` }} />
              </span>
              {s.nudge && <span className="mtile-nudge">{s.nudge}</span>}
            </a>
          );
        })}

        <a className="mtile mtile-alt" href={routeOf('home')} style={{ animationDelay: `${MODULES.length * 45}ms` }}>
          <span className="mtile-sheen" aria-hidden />
          <span className="mtile-glyph" aria-hidden>📊</span>
          <span className="mtile-name">Progress</span>
          <span className="mtile-stat"><b>{xp.toLocaleString()}</b> XP · level {level}</span>
          <span className="mtile-nudge">Streak, badges and what's on deck</span>
        </a>

        <a className="mtile mtile-alt" href={routeOf('settings')} style={{ animationDelay: `${(MODULES.length + 1) * 45}ms` }}>
          <span className="mtile-sheen" aria-hidden />
          <span className="mtile-glyph" aria-hidden>🎛️</span>
          <span className="mtile-name">Settings</span>
          <span className="mtile-stat">Themes, key, your data</span>
        </a>
      </div>

      {nudges.length > 0 && (
        <section className="card">
          <div className="card-head">
            <div>
              <h2 className="viz-title" style={{ fontSize: 15 }}>On deck</h2>
              <p className="viz-sub">What is asking for attention right now</p>
            </div>
          </div>
          <div className="stack-2">
            {nudges.map(({ module, nudge }) => (
              <a key={module.id} className="rowitem" href={routeOf(module.id as Route)} style={{ color: 'inherit', textDecoration: 'none' }}>
                <span
                  className="mod-badge"
                  style={{ ['--mod' as string]: module.color, width: 28, height: 28, fontSize: 14 }}
                >
                  {module.icon}
                </span>
                <span className="grow" style={{ minWidth: 0 }}>
                  <span className="t-sm t-bold" style={{ display: 'block' }}>{nudge}</span>
                  <span className="t-xs t-muted">{module.name}</span>
                </span>
                <span className="t-muted" aria-hidden>›</span>
              </a>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}
