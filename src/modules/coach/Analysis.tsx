import { findInsights, realityCheck, spendPace, weeklyRows, type Insight } from '../../lib/insights';
import { fmtMoney } from '../../lib/finance';
import { fmtDate } from '../../lib/date';
import { useApp } from '../../state/context';
import { EmptyState, SectionHead } from '../../components/ui/Field';
import { BarChart } from '../../components/charts/BarChart';
import { StatTile } from '../../components/charts/StatTile';

const ACCENT = 'var(--mod-coach)';

const KIND_ICON: Record<Insight['kind'], string> = {
  split: '⚖️', trend: '📈', neglect: '💤', streak: '🔥', balance: '🧩',
};

export function Analysis() {
  const { state, update } = useApp();
  const insights = findInsights(state).filter((i) => !state.insights.dismissed.includes(i.id));
  const rows = weeklyRows(state, 8);
  const reality = realityCheck(state);
  const pace = spendPace(state);

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
            icon="🔍"
            title="Not enough logged yet"
            hint="Findings need about six weeks of entries before they mean anything. Keep logging."
          />
        ) : (
          <div className="stack-3">
            {insights.slice(0, 6).map((i) => (
              <article key={i.id} className="insight">
                <span className="insight-icon" aria-hidden>{KIND_ICON[i.kind]}</span>
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
                  ✕
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
