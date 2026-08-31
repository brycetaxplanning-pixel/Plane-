import { useState } from 'react';
import { beyond, groupByDay, isToday, moduleColor, overdueItems, timelineItems, windowLength, windowStart, type TimelineItem } from '../../lib/timeline';
import { dowLabel, fmtDate, relativeDay } from '../../lib/date';
import { asRoute, routeOf } from '../../lib/router';
import { useApp } from '../../state/context';
import { EmptyState, SectionHead } from '../../components/ui/Field';

const KIND_ICON: Record<TimelineItem['kind'], string> = {
  project: '📁', deal: '🎯', goal: '🏁', race: '🏃', reminder: '⏰',
};

const linkFor = (item: TimelineItem): string => {
  const route = asRoute(item.to);
  return route ? routeOf(route, item.tab ? { tab: item.tab } : undefined) : '#/';
};

export function Timeline() {
  const { state } = useApp();
  const [view, setView] = useState<'week' | 'month'>('week');

  const items = timelineItems(state);
  const from = windowStart(view);
  const length = windowLength(view);
  const groups = groupByDay(items, from, length);
  const late = overdueItems(items);
  const later = beyond(items, from, length);

  if (items.length === 0) {
    return (
      <EmptyState
        icon="🗓"
        title="Nothing has a date on it yet"
        hint="Due dates on client projects, goals, deals and reminders all show up here."
      />
    );
  }

  return (
    <>
      {/* Not tabs: both choices show the same region over a different span, so
          these are toggle buttons and say so, rather than promising a tablist's
          keyboard contract they do not keep. */}
      <div className="tabs" role="group" aria-label="How far ahead to show" style={{ maxWidth: 280 }}>
        <button type="button" className="tab" aria-pressed={view === 'week'} onClick={() => setView('week')}>This week</button>
        <button type="button" className="tab" aria-pressed={view === 'month'} onClick={() => setView('month')}>Next 5 weeks</button>
      </div>

      {late.length > 0 && (
        <section className="card">
          <SectionHead title="Already past" sub={`${late.length} still open`} />
          <div className="stack-2">
            {late.map((item) => (
              <a key={item.id} className="rowitem" href={linkFor(item)} style={{ borderLeft: '3px solid var(--status-critical)', color: 'inherit', textDecoration: 'none' }}>
                <span aria-hidden>{KIND_ICON[item.kind]}</span>
                <span className="grow" style={{ minWidth: 0 }}>
                  <span className="t-sm t-bold truncate" style={{ display: 'block' }}>{item.title}</span>
                  <span className="t-xs t-crit">{fmtDate(item.date)} · {relativeDay(item.date)}</span>
                </span>
              </a>
            ))}
          </div>
        </section>
      )}

      <section className="card">
        <SectionHead
          title={view === 'week' ? 'This week' : 'The next five weeks'}
          sub="Everything with a date on it, from every module"
        />
        <div className="tl">
          {groups.map((g) => (
            <div key={g.date} className={`tl-day${isToday(g.date) ? ' is-today' : ''}${g.items.length === 0 ? ' is-empty' : ''}`}>
              <div className="tl-date">
                <span className="tl-dow">{dowLabel(g.date)}</span>
                <span className="tl-num">{Number(g.date.slice(-2))}</span>
              </div>
              <div className="tl-items">
                {g.items.length === 0 ? (
                  <span className="t-xs t-muted">—</span>
                ) : (
                  g.items.map((item) => (
                    <a
                      key={item.id}
                      className="tl-item"
                      href={linkFor(item)}
                      style={{ ['--mod' as string]: moduleColor(item.module) }}
                    >
                      <span aria-hidden>{KIND_ICON[item.kind]}</span>
                      <span className="grow" style={{ minWidth: 0 }}>
                        <span className="t-sm truncate" style={{ display: 'block', fontWeight: 600 }}>{item.title}</span>
                        {item.detail && <span className="t-xs t-muted truncate" style={{ display: 'block' }}>{item.detail}</span>}
                      </span>
                    </a>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {later.length > 0 && (
        <section className="card">
          <SectionHead title="Further out" sub={`${later.length} beyond the window`} />
          <div className="stack-2">
            {later.slice(0, 12).map((item) => (
              <a key={item.id} className="rowitem" href={linkFor(item)} style={{ color: 'inherit', textDecoration: 'none' }}>
                <span aria-hidden>{KIND_ICON[item.kind]}</span>
                <span className="grow" style={{ minWidth: 0 }}>
                  <span className="t-sm t-bold truncate" style={{ display: 'block' }}>{item.title}</span>
                  <span className="t-xs t-muted">{fmtDate(item.date)} · {relativeDay(item.date)}</span>
                </span>
              </a>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
