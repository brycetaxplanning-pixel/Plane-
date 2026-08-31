import { useState } from 'react';
import { MODULES, type ChatMessage } from '../lib/schema';
import { XP, streakOf } from '../lib/gamification';
import { fmtDate, todayKey } from '../lib/date';
import { uid } from '../lib/id';
import { fmtMoney } from '../lib/finance';
import { useApp } from '../state/context';
import { coachStats, financeStats, fitnessStats, habitStats, planningStats, spanishStats, workStats } from '../state/selectors';
import { routeOf } from '../lib/router';
import { Modal } from '../components/ui/Modal';
import { Field, SectionHead } from '../components/ui/Field';
import { Sparkline } from '../components/charts/Sparkline';
import { StatTile } from '../components/charts/StatTile';
import { Chat } from '../components/Chat';

const ACCENT = 'var(--mod-coach)';
const SCALE = [1, 2, 3, 4, 5];

export function Coach() {
  const { state, update, reward } = useApp();
  const stats = coachStats(state);
  const [checkingIn, setCheckingIn] = useState(false);

  return (
    <div className="stack">
      <section className="card" style={{ ['--mod' as string]: ACCENT }}>
        <SectionHead title="Daily check-in" sub={stats.checkedInToday ? 'Done for today' : 'Two questions, thirty seconds'} />
        <div className="grid grid-3 tight-mobile" style={{ gap: 'var(--sp-3)' }}>
          <StatTile label="This week" value={`${stats.weekCheckIns.length}/7`} caption="check-ins" small />
          <StatTile label="Open goals" value={stats.openGoals.length} caption={`${stats.doneGoals} done`} small />
          <StatTile label="Streak" value={`${streakOf(state.activeDays).current}d`} caption="active days" small />
        </div>

        {stats.checkedInToday ? (
          <div className="spread" style={{ marginTop: 'var(--sp-4)' }}>
            <span className="status status-good">✓ Checked in today</span>
            <button className="btn btn-sm" onClick={() => setCheckingIn(true)}>Update it</button>
          </div>
        ) : (
          <button
            className="btn btn-accent btn-lg btn-block"
            style={{ ['--mod' as string]: ACCENT, marginTop: 'var(--sp-4)' }}
            onClick={() => setCheckingIn(true)}
          >
            Check in
          </button>
        )}
      </section>

      {stats.moodTrend.length > 1 && (
        <section className="card">
          <SectionHead title="Mood" sub="Last 14 check-ins, 1 to 5" />
          <Sparkline
            data={stats.moodTrend.map((d) => ({ key: d.key, value: d.value, label: fmtDate(d.key) }))}
            color={ACCENT}
            height={54}
            ariaLabel="Self-reported mood over the last fourteen check-ins"
          />
          <p className="t-xs t-muted" style={{ marginTop: 4 }}>
            Latest {stats.moodTrend[stats.moodTrend.length - 1]?.value}/5 · energy{' '}
            {stats.energyTrend[stats.energyTrend.length - 1]?.value}/5
          </p>
        </section>
      )}

      <section className="card">
        <SectionHead title="Talk it through" sub="Sees every module's numbers" />
        <Chat
          accent={ACCENT}
          messages={state.coach.chat}
          onChange={(next) => update((s) => ({ ...s, coach: { ...s.coach, chat: next } }))}
          buildSystem={() => buildLifeCoachSystem(state)}
          offlineReply={(input) => offlineCoachReply(input, state)}
          placeholder="What's on your mind…"
          emptyHint="I can see every module — work, outreach, Spanish, training, spending, habits and goals. Ask me what to prioritise, where you're slipping, or how to plan the week."
          suggestions={['What should I focus on this week?', 'Where am I slipping?', 'Plan my week around 3 MMA classes']}
        />
        {state.coach.chat.length > 0 && (
          <button
            className="link-btn"
            style={{ marginTop: 'var(--sp-3)' }}
            onClick={() => update((s) => ({ ...s, coach: { ...s.coach, chat: [] as ChatMessage[] } }))}
          >
            Clear conversation
          </button>
        )}
      </section>

      <section className="card card-sunken">
        <p className="t-sm t-sec">
          Goals moved to their own module. <a href={routeOf('goals')}>Open Goals →</a>
        </p>
      </section>

      {checkingIn && (
        <CheckInForm
          onClose={() => setCheckingIn(false)}
          onSave={(mood, energy, wins, blockers, focus) => {
            reward('coach', XP.checkIn, 'Checked in', (s) => ({
              ...s,
              coach: {
                ...s.coach,
                checkIns: [
                  ...s.coach.checkIns.filter((c) => c.date !== todayKey()),
                  { id: uid('ci'), date: todayKey(), mood, energy, wins, blockers, focus },
                ],
              },
            }));
            setCheckingIn(false);
          }}
        />
      )}
    </div>
  );
}

function CheckInForm({
  onClose, onSave,
}: {
  onClose: () => void;
  onSave: (mood: number, energy: number, wins: string, blockers: string, focus: string) => void;
}) {
  const [mood, setMood] = useState(3);
  const [energy, setEnergy] = useState(3);
  const [wins, setWins] = useState('');
  const [blockers, setBlockers] = useState('');
  const [focus, setFocus] = useState('');

  return (
    <Modal
      title="Check in"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-accent" style={{ ['--mod' as string]: ACCENT }} onClick={() => onSave(mood, energy, wins, blockers, focus)}>
            Save
          </button>
        </>
      }
    >
      <div className="stack-3">
        <Field label="Mood">
          <div className="row-2">
            {SCALE.map((n) => (
              <button key={n} type="button" className="chip" aria-pressed={mood === n} onClick={() => setMood(n)}>{n}</button>
            ))}
          </div>
        </Field>
        <Field label="Energy">
          <div className="row-2">
            {SCALE.map((n) => (
              <button key={n} type="button" className="chip" aria-pressed={energy === n} onClick={() => setEnergy(n)}>{n}</button>
            ))}
          </div>
        </Field>
        <Field label="Wins">
          <textarea className="textarea" value={wins} onChange={(e) => setWins(e.target.value)} placeholder="Closed two S-corp conversations" />
        </Field>
        <Field label="Blockers">
          <textarea className="textarea" value={blockers} onChange={(e) => setBlockers(e.target.value)} placeholder="Waiting on three sets of K-1s" />
        </Field>
        <Field label="Tomorrow's one thing">
          <input className="input" value={focus} onChange={(e) => setFocus(e.target.value)} placeholder="Ten outreach calls before noon" />
        </Field>
      </div>
    </Modal>
  );
}

/* ---------------- prompting ---------------- */

/** One snapshot of every module, so the coach can weigh trade-offs across
 *  them rather than optimising one in isolation. */
export function buildSnapshot(state: ReturnType<typeof useApp>['state']): string {
  const w = workStats(state);
  const p = planningStats(state);
  const e = spanishStats(state);
  const f = fitnessStats(state);
  const m = financeStats(state);
  const h = habitStats(state);
  const c = coachStats(state);
  const cur = state.settings.currency;

  return `MODULE 1 — Abitos Tax Prep (day job)
${w.openCount} open projects, ${w.overdue.length} past due, ${w.dueThisWeek.length} due this week, ${w.waiting.length} waiting on the client. ${w.filedCount} filed all time.
${w.open.slice(0, 8).map((x) => `- ${x.client} (${x.service}) — ${x.stage}${x.due ? `, due ${x.due}` : ''}`).join('\n') || '- none'}

MODULE 2 — Bryce Tax Planning (S-corp outreach)
${p.count} of ${p.target} outreach this week; ${p.remaining} left, needs ${p.perDayNeeded}/day over ${p.daysLeft} remaining days. ${p.meetings} meetings booked this week. Pipeline: ${p.openDeals.length} open deals worth ${fmtMoney(p.pipelineValue, cur)}.

MODULE 3 — Spanish
${e.todayMinutes} min today (goal ${e.dailyGoal}), ${e.weekMinutes} min this week (goal ${e.weeklyGoal}), ${e.hours.toFixed(1)} hours all time, studied ${e.daysStudiedThisWeek}/7 days this week.

MODULE 4 — Fitness
${f.total}/${f.targets.total} sessions this week. MMA ${f.mma}/${f.targets.mma}, strength ${f.strength}/${f.targets.strength}, flexible ${f.flexDone}/${f.flexTarget}. ${f.runKmThisWeek.toFixed(1)} km run this week; longest run ever ${f.longestRun.toFixed(1)} km. Race: ${state.fitness.race.name}${state.fitness.race.date ? ` on ${state.fitness.race.date}` : ' (no date set)'}.

MODULE 5 — Finances
${fmtMoney(m.spent, cur)} spent this month${m.budgetTotal ? ` against a ${fmtMoney(m.budgetTotal, cur)} budget` : ' (no budget set)'}. ${m.reviewCount} transactions still need a category. Invested: ${fmtMoney(m.invested, cur)} across ${state.finance.accounts.length} accounts.

MODULE 6 — Habits
${h.rows.map((r) => `- ${r.habit.title} (${r.habit.cadence}): ${r.statusLabel}${r.daysSince === null ? ', never done' : `, ${r.daysSince} day(s) since`}`).join('\n') || '- none set up'}

MODULE 7 — Goals
${state.goals.items.filter((g) => !g.done).map((g) => `- ${g.title} (${g.kind})${g.cost ? `, ${fmtMoney(g.cost, cur)}` : ''}${g.monthly ? `, ${fmtMoney(g.monthly, cur)}/mo` : ''}${g.plan ? ` — plan: ${g.plan}` : ''}`).join('\n') || '- none set'}

MODULE 8 — Check-ins
${c.checkedInToday ? 'Checked in today.' : 'No check-in today.'} Last mood ${c.moodTrend.at(-1)?.value ?? '—'}/5, energy ${c.energyTrend.at(-1)?.value ?? '—'}/5.
Active-day streak: ${streakOf(state.activeDays).current} days.`;
}

const TONE_LINE: Record<string, string> = {
  gentle: 'Be warm and encouraging. Name what slipped without making them feel bad about it.',
  direct: 'Be direct and unsentimental. Say plainly what slipped and what to do about it. No pep talk.',
  drill: 'Be blunt and demanding, like a coach who expects better. Call out what slipped in short, hard sentences and tell them to go fix it now. Never insult them personally and never swear.',
};

function buildLifeCoachSystem(state: ReturnType<typeof useApp>['state']): string {
  return `You are the user's life coach inside their personal tracking app. You can see every module's live numbers below. Today is ${todayKey()}.

${TONE_LINE[state.habits.tone] ?? TONE_LINE.direct}

Name the trade-off rather than telling them to do everything: they have a demanding tax job, a side practice they are trying to grow, a language habit, twelve training sessions a week, a household budget and a set of daily habits. When something is slipping, say which one and what it costs to fix. Prefer one concrete next action over a list. Keep replies under about 200 words unless they ask for a full plan.

Do not invent numbers. If you need something that isn't below, ask for it.

${buildSnapshot(state)}`;
}

function offlineCoachReply(input: string, state: ReturnType<typeof useApp>['state']): string {
  const p = planningStats(state);
  const f = fitnessStats(state);
  const w = workStats(state);
  const e = spanishStats(state);
  const m = financeStats(state);
  const h = habitStats(state);
  const q = input.toLowerCase();

  const slipping: string[] = [];
  if (w.overdue.length) slipping.push(`${w.overdue.length} tax project${w.overdue.length === 1 ? '' : 's'} past due`);
  if (p.remaining > 0) slipping.push(`${p.remaining} outreach short of ${p.target}`);
  if (f.total < f.targets.total) slipping.push(`${f.targets.total - f.total} fitness sessions short`);
  if (e.todayMinutes < e.dailyGoal) slipping.push(`${e.dailyGoal - e.todayMinutes} min of Spanish left today`);
  if (m.reviewCount) slipping.push(`${m.reviewCount} transactions uncategorised`);
  for (const r of h.rows) {
    if (r.status === 'red') slipping.push(`${r.habit.title} — ${r.statusLabel.toLowerCase()}`);
  }

  const head = q.includes('slip') || q.includes('behind')
    ? 'Where you are behind right now:'
    : 'Here is the week as it stands:';

  return [
    head,
    ...(slipping.length ? slipping.map((s) => `• ${s}`) : ['• Nothing is behind. Everything is on or ahead of target.']),
    '',
    w.overdue.length
      ? 'Past-due client work is the one with an external cost — clear that first.'
      : p.remaining > p.perDayNeeded * 2
        ? 'Outreach is the constraint on the practice growing. It is also the easiest to front-load early in the week.'
        : 'Nothing is urgent. Pick the one you least want to do and start there.',
  ].join('\n');
}

export { MODULES };
