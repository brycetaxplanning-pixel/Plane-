import { useEffect, useRef, useState } from 'react';
import type { AppNotification } from '../lib/schema';
import { MODULES } from '../lib/schema';
import { relativeTime, unreadCount } from '../lib/notifications';
import { asRoute, routeOf } from '../lib/router';
import { useApp } from '../state/context';
import { Icons } from './layout/Icons';

const KIND_ICON: Record<AppNotification['kind'], string> = {
  insight: '⚖️', habit: '🔁', due: '⏰', award: '🧘',
  finance: '💵', deal: '🎯', system: 'ℹ️',
};

export const linkFor = (n: AppNotification): string => {
  if (n.href) return n.href;
  const route = asRoute(n.to);
  if (!route) return routeOf('notifications');
  return routeOf(route, n.tab ? { tab: n.tab } : undefined);
};

/** Bell in the header. Opens on hover on a pointer device and on tap
 *  everywhere, since hover does not exist on a phone. */
export function NotificationBell() {
  const { state, update } = useApp();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const unread = unreadCount(state);
  const recent = state.notifications.items.slice(0, 10);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const markRead = (id: string) =>
    update((s) => ({
      ...s,
      notifications: {
        ...s.notifications,
        items: s.notifications.items.map((n) => (n.id === id ? { ...n, read: true } : n)),
      },
    }));

  const markAll = () =>
    update((s) => ({
      ...s,
      notifications: { ...s.notifications, items: s.notifications.items.map((n) => ({ ...n, read: true })) },
    }));

  return (
    <div
      className="bell-wrap"
      ref={wrapRef}
      onMouseEnter={() => {
        if (closeTimer.current) clearTimeout(closeTimer.current);
        if (window.matchMedia('(hover: hover)').matches) setOpen(true);
      }}
      onMouseLeave={() => {
        if (!window.matchMedia('(hover: hover)').matches) return;
        closeTimer.current = setTimeout(() => setOpen(false), 220);
      }}
    >
      <button
        className="btn btn-ghost btn-icon bell"
        aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span style={{ width: 19, height: 19, display: 'inline-flex' }}>{Icons.bell()}</span>
        {unread > 0 && <span className="bell-dot" aria-hidden>{unread > 9 ? '9+' : unread}</span>}
      </button>

      {open && (
        <div className="bell-pop" role="dialog" aria-label="Recent notifications">
          <div className="bell-head">
            <strong className="t-sm">Notifications</strong>
            {unread > 0 && <button className="link-btn" onClick={markAll}>Mark all read</button>}
          </div>

          <div className="bell-list">
            {recent.length === 0 ? (
              <p className="t-sm t-muted" style={{ padding: 'var(--sp-4)' }}>Nothing yet.</p>
            ) : (
              recent.map((n) => (
                <a
                  key={n.id}
                  className={`ntf${n.read ? '' : ' is-unread'}`}
                  href={linkFor(n)}
                  target={n.href ? '_blank' : undefined}
                  rel={n.href ? 'noopener noreferrer' : undefined}
                  onClick={() => { markRead(n.id); setOpen(false); }}
                >
                  <span className="ntf-icon" aria-hidden>{KIND_ICON[n.kind]}</span>
                  <span className="grow" style={{ minWidth: 0 }}>
                    <span className="ntf-title">{n.title}</span>
                    <span className="ntf-meta">
                      {n.module ? `${MODULES.find((m) => m.id === n.module)?.name} · ` : ''}
                      {relativeTime(n.createdAt)}
                    </span>
                  </span>
                </a>
              ))
            )}
          </div>

          <a className="bell-foot" href={routeOf('notifications')} onClick={() => setOpen(false)}>
            Open the full list
          </a>
        </div>
      )}
    </div>
  );
}

/** The whole log, on its own page. */
export function NotificationsPage() {
  const { state, update, toast } = useApp();
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  const items = state.notifications.items.filter((n) => filter === 'all' || !n.read);
  const unread = unreadCount(state);

  const markRead = (id: string) =>
    update((s) => ({
      ...s,
      notifications: {
        ...s.notifications,
        items: s.notifications.items.map((n) => (n.id === id ? { ...n, read: true } : n)),
      },
    }));

  return (
    <div className="stack">
      <section className="card">
        <div className="spread wrap" style={{ marginBottom: 'var(--sp-3)' }}>
          <div className="row-2">
            <button className="chip" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>
              All ({state.notifications.items.length})
            </button>
            <button className="chip" aria-pressed={filter === 'unread'} onClick={() => setFilter('unread')}>
              Unread ({unread})
            </button>
          </div>
          <div className="row-2">
            {unread > 0 && (
              <button
                className="btn btn-sm"
                onClick={() => update((s) => ({
                  ...s,
                  notifications: { ...s.notifications, items: s.notifications.items.map((n) => ({ ...n, read: true })) },
                }))}
              >
                Mark all read
              </button>
            )}
            {state.notifications.items.length > 0 && (
              <button
                className="btn btn-sm btn-danger"
                onClick={() => {
                  update((s) => ({ ...s, notifications: { ...s.notifications, items: [] } }));
                  toast('Log cleared');
                }}
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {items.length === 0 ? (
          <p className="t-sm t-muted" style={{ padding: 'var(--sp-4)', textAlign: 'center' }}>
            {filter === 'unread' ? 'Nothing unread.' : 'Nothing here yet. Things that need your attention will show up as they happen.'}
          </p>
        ) : (
          <div className="stack-2">
            {items.map((n) => (
              <a
                key={n.id}
                className={`ntf ntf-row${n.read ? '' : ' is-unread'}`}
                href={linkFor(n)}
                target={n.href ? '_blank' : undefined}
                rel={n.href ? 'noopener noreferrer' : undefined}
                onClick={() => markRead(n.id)}
              >
                <span className="ntf-icon" aria-hidden>{KIND_ICON[n.kind]}</span>
                <span className="grow" style={{ minWidth: 0 }}>
                  <span className="ntf-title">{n.title}</span>
                  {n.body && <span className="ntf-body">{n.body}</span>}
                  <span className="ntf-meta">
                    {n.module ? `${MODULES.find((m) => m.id === n.module)?.name} · ` : ''}
                    {relativeTime(n.createdAt)}
                  </span>
                </span>
              </a>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
