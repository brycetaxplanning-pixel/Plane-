import { levelFor, streakOf, totalXp } from '../../lib/gamification';
import { fmtDateLong, todayKey } from '../../lib/date';
import { routeOf, type Route } from '../../lib/router';
import { useApp } from '../../state/context';
import { Icons } from './Icons';

interface HeaderProps {
  title: string;
  sub?: string;
  /** Modules get a way back to the launcher; the launcher itself does not. */
  showBack?: boolean;
  route: Route;
}

export function Header({ title, sub, showBack, route }: HeaderProps) {
  const { state } = useApp();
  const xp = totalXp(state.xp);
  const { level, into, span } = levelFor(xp);
  const streak = streakOf(state.activeDays);

  return (
    <header className="app-header">
      <div className="container">
        {showBack && (
          <a className="backlink" href={routeOf('launcher')}>
            <span style={{ width: 15, height: 15, display: 'inline-flex' }}>{Icons.back()}</span>
            All modules
          </a>
        )}

        <div className="spread" style={{ alignItems: 'flex-start', marginTop: showBack ? 4 : 0 }}>
          <div className="grow" style={{ minWidth: 0 }}>
            <h1>{title}</h1>
            <p className="t-sm t-sec">{sub ?? fmtDateLong(todayKey())}</p>
          </div>

          <div className="row-2" style={{ flex: 'none' }}>
            <span className="chip chip-static" title={`${streak.current}-day streak · longest ${streak.longest}`} style={{ gap: 4 }}>
              <span style={{ width: 15, height: 15, display: 'inline-flex', color: 'var(--status-warning)' }}>{Icons.flame()}</span>
              <span className="t-num">{streak.current}</span>
            </span>
            {route !== 'settings' && (
              <a className="btn btn-ghost btn-icon" href={routeOf('settings')} aria-label="Settings">
                <span style={{ width: 19, height: 19, display: 'inline-flex' }}>{Icons.gear()}</span>
              </a>
            )}
          </div>
        </div>

        <div className="row-2" style={{ marginTop: 10 }}>
          <span className="t-xs t-bold" style={{ flex: 'none' }}>Level {level}</span>
          <div className="xpbar grow"><i style={{ width: `${Math.round((into / span) * 100)}%` }} /></div>
          <span className="t-xs t-muted t-num" style={{ flex: 'none' }}>{into}/{span}</span>
        </div>
      </div>
    </header>
  );
}
