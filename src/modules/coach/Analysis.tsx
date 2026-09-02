import { findInsights, realityCheck, spendPace, timeSinks, weeklyRows, type Insight } from '../../lib/insights';
import { fmtMoney } from '../../lib/finance';
import { fmtDate } from '../../lib/date';
import { useApp } from '../../state/context';
import { EmptyState, SectionHead } from '../../components/ui/Field';
import { BarChart } from '../../components/charts/BarChart';
import { StatTile } from '../../components/charts/StatTile';
import { Icons } from '../../components/layout/Icons';

const ACCENT = 'var(--mod-coach)';

/** Turns spare hours into something the user already said they wanted, which
 *  lands harder than the raw number. */
function equivalents(hours: number, reality: ReturnType<typeof realityCheck>): string {
  const training = reality.demands.find((d) => d.name.startsWith('Training'));
  const spanish = reality.demands.find((d) => d.name === 'Spanish');
  if (spanish && spanish.hours > 0 && hours >= spanish.hours) {
    return `${(hours / spanish.hours).toFixed(1)}× the week of Spanish`;
  }
  if (training && training.hours > 0) {
    const sessions = Math.round((hours / training.hours) * 12);
    if (sessions >= 1) return `about ${sessions} training session${sessions === 1 ? '' : 's'}`;
  }
  return `${hours}h of the week`;
}

const KIND_ICON: Record<Insight['kind'], () => React.ReactNode> = {
  split: Icons.scales, trend: Icons.trend, neglect: Icons.moon, streak: Icons.flame, balance: Icons.puzzle,
};

export function Analysis() {
  const { state, update } = useApp();
  const insights = findInsights(state).filter((i) => !state.insights.dismissed.includes(i.id));
  const rows = weeklyRows(state, 8);
  const reality = realityCheck(state);
  const pace = spendPace(state);
  const sinks = timeSinks(state);

  const dismissed = state.insights.dismissed.length;

  return (
    <>
      <section className="card" style={{ ['--mod' as string]: ACCENT }}>
        <SectionHead
          title="What the log actually shows"
          sub="Patterns found in your own entries — not proof one thing causes another"
        />
        {insights.length === 0 ? (
          <EmptyState
            icon={Icons.search()}
            title="Not enough logged yet"
            hint="Findings need about six weeks of entries before they mean anything. Keep logging."
          />
        ) : (
          <div className="stack-3">
            {insights.slice(0, 6).map((i) => (
              <article key={i.id} className="insight">
                <span className="insight-icon" aria-hidden>{KIND_ICON[i.kind]()}</span>
                <div className="grow" style={{ minWidth: 0 }}>
                  <h3 className="insight-title">{i.title}</h3>
                  <p className="t-sm t-sec">{i.body}</p>
                  <p className="t-xs t-muted" style={{ marginTop: 4 }}>{i.evidence}</p>
                </div>
                <button
                  className="btn btn-ghost btn-icon"
                  aria-label="Dismiss this finding"
                  title="Don't show this again"
                  onClick={() => update((s) => ({ ...s, insights: { ...s.insights, dismissed: [...s.insights.dismissed, i.id] } }))}
                >
                  <span className="btn-glyph" aria-hidden>{Icons.close()}</span>
                </button>
              </article>
            ))}
          </div>
        )}
        {dismissed > 0 && (
          <button
            className="link-btn"
            style={{ marginTop: 'var(--sp-3)' }}
            onClick={() => update((s) => ({ ...s, insights: { ...s.insights, dismissed: [] } }))}
          >
            Bring back {dismissed} dismissed finding{dismissed === 1 ? '' : 's'}
          </button>
        )}
      </section>

      <section className="card">
        <SectionHead
          title="Does the week fit"
          sub="What you have committed to, against the hours that exist"
        />
        <div className="grid grid-3" style={{ gap: 'var(--sp-3)', marginBottom: 'var(--sp-4)' }}>
          <StatTile label="Committed" value={`${reality.committed.toFixed(1)}h`} caption="a week, outside work" />
          <StatTile label="Available" value={`${reality.available.toFixed(0)}h`} caption={`after ${reality.sleepHours}h sleep and ${reality.jobHours}h work`} />
          <StatTile
            label={reality.overBy > 0 ? 'Over by' : 'Slack'}
            value={`${Math.abs(reality.overBy).toFixed(1)}h`}
            caption={reality.overBy > 0 ? 'more than exists' : 'left for everything else'}
          />
        </div>

        <div className="table-scroll">
          <table className="table">
            <thead><tr><th>What</th><th className="num">Hours</th><th>Where the number comes from</th></tr></thead>
            <tbody>
              {reality.demands.map((d) => (
                <tr key={d.name}>
                  <td>{d.name}</td>
                  <td className="num">{d.hours.toFixed(1)}</td>
                  <td className="t-muted">
                    {d.measured ? <span className="status status-good">measured</span> : <span className="status status-neutral">assumed</span>}
                    {' '}{d.note}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="t-sm t-sec" style={{ marginTop: 'var(--sp-3)' }}>
          {reality.overBy > 0
            ? `On paper the week asks for ${reality.overBy.toFixed(1)} hours more than it has, before anything unplanned. Something gives every week — the question is whether you pick which, or it picks itself.`
            : `It fits, with ${Math.abs(reality.overBy).toFixed(1)} hours spare. That spare time is where everything unplanned lands, so it is not really spare.`}
        </p>
        <p className="t-xs t-muted" style={{ marginTop: 6 }}>
          Assumes {reality.jobHours}h of work and {reality.sleepHours}h of sleep a night. Travel, cooking,
          admin and other people are not in here.
        </p>
      </section>

      {sinks.length > 0 && (
        <section className="card">
          <SectionHead title="Where the hours went" sub="What you capped, against what you actually did" />
          {sinks.map((sink) => (
            <div key={sink.habit} className="stack-2" style={{ marginBottom: 'var(--sp-3)' }}>
              <div className="spread">
                <span className="t-sm t-bold">{sink.habit}</span>
                <span className={sink.overBy > 0 ? 't-sm t-crit t-num' : 't-sm t-good t-num'}>
                  {sink.hoursThisWeek}h across {sink.daysLogged} day{sink.daysLogged === 1 ? '' : 's'}
                </span>
              </div>
              <div className="xpbar">
                <i style={{
                  width: `${Math.min(100, (sink.hoursThisWeek / Math.max(0.1, sink.capForLoggedDays)) * 100)}%`,
                  background: sink.overBy > 0 ? 'var(--status-critical)' : 'var(--status-good)',
                }} />
              </div>
              <p className="t-xs t-sec">
                {sink.overBy > 0
                  ? `${sink.overBy}h over your own ${sink.capPerDay}h-a-day cap. That is ${equivalents(sink.overBy, reality)} you said you wanted.`
                  : `Inside your ${sink.capPerDay}h-a-day cap by ${Math.abs(sink.overBy)}h.`}
                {sink.daysLogged < 7 && ` At this rate the week lands around ${sink.projectedWeek}h.`}
              </p>
            </div>
          ))}
          <p className="t-xs t-muted">
            Typed in by hand. Apple has no public API for Screen Time, so nothing can read it for you —
            the weekly figure from your phone's own report is the number to put here.
          </p>
        </section>
      )}

      <section className="card">
        <SectionHead title="Eight weeks, side by side" sub="The columns the findings above are computed from" />
        <div className="stack-4">
          <div>
            <p className="viz-sub" style={{ marginBottom: 4 }}>Fitness sessions a week</p>
            <BarChart
              data={rows.map((r) => ({ key: r.week, value: r.fitness, label: fmtDate(r.week) }))}
              color="var(--mod-fitness)" height={96}
              ariaLabel="Fitness sessions per week over the last eight weeks"
            />
          </div>
          <div style={{ marginTop: 'var(--sp-4)' }}>
            <p className="viz-sub" style={{ marginBottom: 4 }}>Outreach a week</p>
            <BarChart
              data={rows.map((r) => ({ key: r.week, value: r.outreach, label: fmtDate(r.week) }))}
              color="var(--mod-planning)" height={96}
              ariaLabel="Outreach contacts per week over the last eight weeks"
            />
          </div>
          <div style={{ marginTop: 'var(--sp-4)' }}>
            <p className="viz-sub" style={{ marginBottom: 4 }}>Habit completion a week</p>
            <BarChart
              data={rows.map((r) => ({ key: r.week, value: r.habitPct, label: fmtDate(r.week) }))}
              color="var(--mod-habits)" height={96} formatValue={(n) => `${n}%`}
              ariaLabel="Habit completion percentage per week over the last eight weeks"
            />
          </div>
        </div>
      </section>

      {pace && (
        <section className="card">
          <SectionHead title="Spending pace" sub={`Day ${pace.dayOfMonth} of ${pace.daysInMonth}`} />
          <p className="t-sm t-sec">
            {fmtMoney(pace.spent, state.settings.currency)} of {fmtMoney(pace.budget, state.settings.currency)} spent,
            {' '}{Math.round((pace.dayOfMonth / pace.daysInMonth) * 100)}% of the way through the month.
            {' '}
            {pace.spent / pace.budget > pace.dayOfMonth / pace.daysInMonth
              ? 'Ahead of pace — at this rate the month closes over budget.'
              : 'Behind pace, which is the right side to be on.'}
          </p>
        </section>
      )}
    </>
  );
}
