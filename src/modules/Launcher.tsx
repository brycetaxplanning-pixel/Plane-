import { MODULES, type ModuleId } from '../lib/schema';
import { levelFor, streakOf, totalXp } from '../lib/gamification';
import { moduleSummaries } from '../state/selectors';
import { useApp } from '../state/context';
import { routeOf, type Route } from '../lib/router';
import { Icons, ModuleGlyph } from '../components/layout/Icons';
import { EnlightenedBadge } from '../components/Enlightenment';
import { isEnlightened } from '../lib/awards';
import { unreadByModule } from '../lib/notifications';
import { daysFromToday, timelineItems } from '../lib/timeline';
import { NotificationBell } from '../components/Notifications';
import { CatDeck } from '../components/CatDeck';
import { resolveSkin, skinById } from '../lib/themes';

/** The hub. Every module is one big button; nothing else competes with them. */
export function Launcher() {
  const { state } = useApp();
  const summaries = moduleSummaries(state);
  const xp = totalXp(state.xp);
  const { level, into, span } = levelFor(xp);
  const streak = streakOf(state.activeDays);
  const name = state.settings.displayName;

  const skin = skinById(resolveSkin(state.settings));

  const unread = unreadByModule(state);
  const dueSoon = timelineItems(state).filter((i) => {
    const away = daysFromToday(i.date);
    return away >= 0 && away < 7;
  }).length;

  const nudges = MODULES
    .map((m) => ({ module: m, nudge: summaries[m.id as ModuleId].nudge }))
    .filter((n): n is { module: (typeof MODULES)[number]; nudge: string } => Boolean(n.nudge))
    .slice(0, 4);

  return (
    <div className="launch">
      {/* The launcher has no header bar, so this is the page's only heading.
          Screen readers navigate by them. */}
      <h1 className="sr-only">Plane — all modules</h1>
      {skin.id === 'latenight' && <CatDeck />}

      <div className="launch-strip">
        <a className="launch-level" href={routeOf('home')} aria-label={`Level ${level}, open progress`}>
          <span className="launch-level-num">{level}</span>
          <span className="t-xs t-muted">LEVEL</span>
        </a>
        <a className="grow launch-greet" href={routeOf('home')} style={{ minWidth: 0 }}>
          <span className="spread" style={{ marginBottom: 5 }}>
            <span className="row-2" style={{ gap: 6, minWidth: 0 }}>
              <span className="t-sm t-bold truncate">{name ? `${greeting()}, ${name}` : greeting()}</span>
              {isEnlightened(state) && <EnlightenedBadge />}
            </span>
            <span className="t-xs t-muted t-num launch-xp-num">{into}/{span} XP</span>
          </span>
          <span className="xpbar"><i style={{ width: `${Math.round((into / span) * 100)}%` }} /></span>
        </a>
        <span className="launch-streak" title={`${streak.current}-day streak`}>
          <span style={{ width: 17, height: 17, display: 'inline-flex', color: 'var(--status-warning)' }}>{Icons.flame()}</span>
          <span className="t-num t-bold">{streak.current}</span>
        </span>
        <NotificationBell />
      </div>

      <div className="launch-grid">
        {MODULES.map((m, i) => {
          const s = summaries[m.id as ModuleId];
          const pct = Math.max(0, Math.min(1, s.progress));
          const flagged = unread[m.id];
          return (
            <a
              key={m.id}
              className={`mtile mtile-${rankOf(pct)}${m.id === 'notes' ? ' mtile-paper' : ''}`}
              href={routeOf(m.id as Route)}
              style={{
                ['--mod' as string]: m.color,
                animationDelay: `${i * 45}ms`,
                // Staggered so the eleven cards do not sweep in lockstep, which
                // reads as one animation rather than eleven cards.
                ['--foil-delay' as string]: `${i * -520}ms`,
              }}
            >
              <span className="mtile-foil" aria-hidden />

              {/* Top-left is the card number, unless something is unread —
                  then it is the count, because that is the thing worth
                  seeing. The number is a watermark either way: the module's
                  own header states it properly. */}
              {flagged ? (
                <span className="mtile-flag">
                  {Icons.bell()}
                  <span className="sr-only">unread:</span>{flagged}
                </span>
              ) : (
                <span className="mtile-id" aria-hidden>{String(m.num).padStart(2, '0')}</span>
              )}

              {pct >= 1 && (
                <span className="mtile-medal" title={`${m.name}: this week's target is met`}>
                  <span className="sr-only">Target met.</span>
                  {Icons.check()}
                </span>
              )}

              <ModuleGlyph id={m.id} size={30} />
              <span className="mtile-name">{m.name}</span>
              <span className="mtile-stat">
                <b>{s.headline}</b>
                <span className="mtile-cap">{s.caption}</span>
              </span>
              {s.nudge && <span className="mtile-nudge">{s.nudge}</span>}
              <span className="mtile-meter" aria-hidden>
                <i style={{ width: `${pct * 100}%` }} />
              </span>
            </a>
          );
        })}

        <a className="mtile mtile-alt" href={routeOf('tracker')} style={{ animationDelay: `${MODULES.length * 45}ms` }}>
          <span className="mtile-foil" aria-hidden />
          <span className="mtile-glyph" aria-hidden>{Icons.calendar()}</span>
          <span className="mtile-name">Tracker</span>
          <span className="mtile-stat">
            <b>{dueSoon}</b>
            <span className="mtile-cap">due this week</span>
          </span>
          <span className="mtile-nudge">Everything with a date, and your reminders</span>
        </a>

        <a className="mtile mtile-alt" href={routeOf('home')} style={{ animationDelay: `${(MODULES.length + 1) * 45}ms` }}>
          <span className="mtile-foil" aria-hidden />
          <span className="mtile-glyph" aria-hidden>{Icons.chart()}</span>
          <span className="mtile-name">Progress</span>
          <span className="mtile-stat">
            <b>{xp.toLocaleString()}</b>
            <span className="mtile-cap">XP · level {level}</span>
          </span>
          <span className="mtile-nudge">Streak, badges and what's on deck</span>
        </a>

        <a className="mtile mtile-alt" href={routeOf('settings')} style={{ animationDelay: `${(MODULES.length + 2) * 45}ms` }}>
          <span className="mtile-foil" aria-hidden />
          <span className="mtile-glyph" aria-hidden>{Icons.gear()}</span>
          <span className="mtile-name">Settings</span>
          <span className="mtile-stat">
            <b className="mtile-stat-sm">{skin.name}</b>
            <span className="mtile-cap">theme · key · your data</span>
          </span>
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
                  style={{ ['--mod' as string]: module.color, width: 28, height: 28 }}
                >
                  <ModuleGlyph id={module.id} size={16} />
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

/** A card's rank, read straight off this week's progress. */
function rankOf(pct: number): 'base' | 'rare' | 'gold' {
  if (pct >= 1) return 'gold';
  if (pct >= 0.5) return 'rare';
  return 'base';
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}
