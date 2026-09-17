import { levelFor, streakOf, totalXp } from '../../lib/gamification';
import { fmtDateLong, todayKey } from '../../lib/date';
import { routeOf, type Route } from '../../lib/router';
import { useApp } from '../../state/context';
import { Icons } from './Icons';
import { EnlightenedBadge } from '../Enlightenment';
import { NotificationBell } from '../Notifications';
import { isEnlightened } from '../../lib/awards';

interface HeaderProps {
  title: string;
  route: Route;
}

/**
 * The title block on the screens that are not modules.
 *
 * It is not a bar. It scrolls with the page, carries no ground of its own and
 * draws no rule under itself, so the page behind it stays visible and what sits
 * on the page reads as blocks laid on a background rather than content pinned
 * under a fixture. A module never renders this at all — its hero says the same
 * things in the module's own material.
 */
export function Header({ title, route }: HeaderProps) {
  const { state } = useApp();
  const xp = totalXp(state.xp);
  const { level, into, span } = levelFor(xp);
  const streak = streakOf(state.activeDays);

  return (
    <header className="app-header">
      <div className="container">
        <a className="backlink" href={routeOf('launcher')}>
          <span aria-hidden style={{ width: 15, height: 15, display: 'inline-flex' }}>{Icons.back()}</span>
          All modules
        </a>

        <div className="spread" style={{ alignItems: 'flex-start', marginTop: 4 }}>
          <div className="grow" style={{ minWidth: 0 }}>
            <h1>{title}</h1>
            <p className="t-sm t-sec">{fmtDateLong(todayKey())}</p>
          </div>

          <div className="row-2" style={{ flex: 'none' }}>
            {isEnlightened(state) && <EnlightenedBadge compact />}
            <NotificationBell />
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
          {/* The secondary ink, not the faintest: with no bar behind it this
              reads straight off the page, where on the darkest skin the muted
              ink lands under the contrast floor. */}
          <span className="t-xs t-sec t-num" style={{ flex: 'none' }}>{into}/{span}</span>
        </div>
      </div>
    </header>
  );
}
