import { MODULES, type ModuleId } from '../lib/schema';
import { dowLabel, lastDays, todayKey } from '../lib/date';
import { BADGES, earnedBadges, levelFor, streakOf, totalXp, xpInRange } from '../lib/gamification';
import { moduleSummaries } from '../state/selectors';
import { useApp } from '../state/context';
import { routeOf, type Route } from '../lib/router';
import { Ring } from '../components/charts/Ring';
import { BarChart, type Datum } from '../components/charts/BarChart';
import { StatTile } from '../components/charts/StatTile';
import { SectionHead } from '../components/ui/Field';
import { ModuleGlyph } from '../components/layout/Icons';
import { BadgeWall } from '../components/BadgeMedal';

export function Dashboard({ navigate }: { navigate: (r: Route) => void }) {
  const { state } = useApp();
  const summaries = moduleSummaries(state);
  const xp = totalXp(state.xp);
  const { level } = levelFor(xp);
  const streak = streakOf(state.activeDays);
  const badges = earnedBadges(state);

  const days = lastDays(7);
  const xpByDay: Datum[] = days.map((d) => ({
    key: d,
    label: dowLabel(d),
    value: xpInRange(state.xp, d, d),
  }));

  const nudges = MODULES
    .map((m) => ({ module: m, nudge: summaries[m.id].nudge }))
    .filter((n): n is { module: (typeof MODULES)[number]; nudge: string } => Boolean(n.nudge))
    .slice(0, 4);

  const isEmpty = state.xp.length === 0
    && state.work.projects.length === 0
    && state.planning.outreach.length === 0
    && state.fitness.activities.length === 0;

  return (
    <div className="stack">
      {isEmpty && (
        <section className="card">
          <SectionHead title="Nothing logged yet" sub="Two ways to start" />
          <p className="t-sm t-sec" style={{ marginBottom: 'var(--sp-3)' }}>
            Open any module below and log something — outreach, twenty minutes of Spanish, a training
            session. Or load a couple of weeks of example data first to see how it all fits together.
          </p>
          <a className="btn btn-primary" href={routeOf('settings')}>Load sample data</a>
        </section>
      )}

      <section className="card">
        <div className="grid grid-3 tight-mobile" style={{ gap: 'var(--sp-3)' }}>
          <StatTile label="Level" value={level} caption={`${xp.toLocaleString()} XP total`} small />
          <StatTile label="Streak" value={`${streak.current}d`} caption={`Longest ${streak.longest}d`} small />
          <StatTile label="Badges" value={badges.length} caption={`of ${12} earned`} small />
        </div>
        <div style={{ marginTop: 'var(--sp-4)' }}>
          <p className="viz-sub" style={{ marginBottom: 4 }}>XP earned each day, last 7 days</p>
          <BarChart data={xpByDay} height={104} highlightKey={todayKey()} ariaLabel="XP earned each day over the last seven days" />
        </div>
      </section>

      {nudges.length > 0 && (
        <section className="card">
          <SectionHead title="On deck" sub="What is asking for attention right now" />
          <div className="stack-2">
            {nudges.map(({ module, nudge }) => (
              <button
                key={module.id}
                className="rowitem"
                style={{ cursor: 'pointer', textAlign: 'left', width: '100%' }}
                onClick={() => navigate(module.id as Route)}
              >
                <span className="mod-badge" style={{ ['--mod' as string]: module.color, width: 28, height: 28 }}>
                  <ModuleGlyph id={module.id} size={16} />
                </span>
                <span className="grow">
                  <span className="t-sm t-bold" style={{ display: 'block' }}>{nudge}</span>
                  <span className="t-xs t-muted">{module.name}</span>
                </span>
                <span className="t-muted" aria-hidden>›</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section>
        <SectionHead title="Modules" sub="Tap a module to log today's progress" />
        <div className="grid grid-auto">
          {MODULES.map((m) => {
            const s = summaries[m.id as ModuleId];
            return (
              <a
                key={m.id}
                className="mod-card"
                href={routeOf(m.id as Route)}
                style={{ ['--mod' as string]: m.color, textDecoration: 'none', color: 'inherit' }}
              >
                <div className="row" style={{ alignItems: 'flex-start' }}>
                  <span className="mod-badge"><ModuleGlyph id={m.id} size={19} /></span>
                  <span className="grow">
                    <span className="mod-num" style={{ display: 'block' }}>MODULE {m.num}</span>
                    <span className="t-bold truncate" style={{ display: 'block' }}>{m.name}</span>
                  </span>
                </div>

                <div className="row" style={{ gap: 'var(--sp-4)' }}>
                  <Ring
                    value={s.progress}
                    color={m.color}
                    size={64}
                    label={s.headline}
                    caption={s.progress >= 1 ? 'done' : `${Math.round(Math.min(1, s.progress) * 100)}%`}
                  />
                  <span className="grow" style={{ minWidth: 0 }}>
                    <span className="t-sm t-sec" style={{ display: 'block' }}>{s.caption}</span>
                    {s.nudge && <span className="t-xs t-muted" style={{ display: 'block', marginTop: 2 }}>{s.nudge}</span>}
                  </span>
                </div>

                <p className="t-xs t-muted">{m.blurb}</p>
              </a>
            );
          })}
        </div>
      </section>

      {badges.length > 0 && (
        <section className="card">
          <SectionHead title="Badges" sub={`${badges.length} of ${BADGES.length} earned`} />
          <BadgeWall badges={badges} earned={new Set(badges.map((b) => b.id))} />
        </section>
      )}
    </div>
  );
}
