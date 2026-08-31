import { useState } from 'react';
import { MODULES, type ChatMessage } from '../lib/schema';
import { XP, streakOf } from '../lib/gamification';
import { fmtDate, todayKey } from '../lib/date';
import { uid } from '../lib/id';
import { fmtMoney } from '../lib/finance';
import { capacity, goalRows } from '../lib/budgetGoals';
import { healthSummary } from '../lib/health';
import { useApp } from '../state/context';
import { budgetHeadroom, coachStats, financeStats, fitnessStats, habitStats, planningStats, spanishStats, workStats } from '../state/selectors';
import { routeOf, useTabParam } from '../lib/router';
import { Modal } from '../components/ui/Modal';
import { Field, SectionHead } from '../components/ui/Field';
import { Sparkline } from '../components/charts/Sparkline';
import { StatTile } from '../components/charts/StatTile';
import { Chat } from '../components/Chat';
import { Analysis } from './coach/Analysis';
import { realityCheck } from '../lib/insights';
import type { CoachMode } from '../lib/schema';
import { Tabs, panelProps } from '../components/ui/Tabs';

const ACCENT = 'var(--mod-coach)';
const SCALE = [1, 2, 3, 4, 5];

const MODES: { id: CoachMode; label: string; blurb: string }[] = [
  { id: 'coach',     label: 'Coach',          blurb: 'Tells you what to do next.' },
  { id: 'therapist', label: 'Sounding board', blurb: 'Asks more than it tells. Not a therapist, and not a substitute for one.' },
  { id: 'straight',  label: 'Straight talk',  blurb: 'The unfiltered read, including the part you would rather not hear.' },
];

const MODE_SUGGESTIONS: Record<CoachMode, string[]> = {
  coach: ['What should I focus on this week?', 'Where am I slipping?', "I'm thinking about getting a massage"],
  therapist: ['I keep putting off the outreach', "I've been feeling flat this week", 'Why do I avoid the client work?'],
  straight: ['Can I actually do all of this?', 'What should I drop?', 'Be honest about my week'],
};

export function Coach() {
  const { state, update, reward } = useApp();
  const stats = coachStats(state);
  const [checkingIn, setCheckingIn] = useState(false);
  const [tab, setTab] = useTabParam(['checkin', 'analysis', 'talk'] as const, 'checkin');
  const mode = state.coach.mode;

  return (
    <div className="stack">
      <Tabs
        idBase="coach"
        label="Life Coach sections"
        active={tab}
        onChange={setTab}
        tabs={[
          { id: 'checkin', label: 'Check in' },
          { id: 'analysis', label: 'Analysis' },
          { id: 'talk', label: 'Talk' },
        ]}
      />

      <div className="stack" {...panelProps('coach', tab)}>
      {tab === 'analysis' && <Analysis />}

      {tab === 'checkin' && (
      <>
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

      <section className="card card-sunken">
        <p className="t-sm t-sec">
          Goals moved to their own module. <a href={routeOf('goals')}>Open Goals →</a>
        </p>
      </section>
      </>
      )}

      {tab === 'talk' && (
      <section className="card">
        <SectionHead title="Talk it through" sub="Sees every module's numbers" />

        <div className="row-2 wrap" style={{ marginBottom: 'var(--sp-3)' }}>
          {MODES.map((m) => (
            <button
              key={m.id}
              className="chip"
              aria-pressed={mode === m.id}
              onClick={() => update((s) => ({ ...s, coach: { ...s.coach, mode: m.id } }))}
            >
              {m.label}
            </button>
          ))}
        </div>
        <p className="t-xs t-muted" style={{ marginBottom: 'var(--sp-3)' }}>
          {MODES.find((m) => m.id === mode)?.blurb}
        </p>

        <Chat
          key={mode}
          accent={ACCENT}
          messages={state.coach.chat}
          onChange={(next) => update((s) => ({ ...s, coach: { ...s.coach, chat: next } }))}
          buildSystem={() => buildLifeCoachSystem(state)}
          offlineReply={(input) => offlineCoachReply(input, state)}
          placeholder="What's on your mind…"
          emptyHint={
            mode === 'therapist'
              ? "Say what's actually going on. I'll ask before I suggest anything."
              : mode === 'straight'
                ? 'Ask me something you might not like the answer to.'
                : 'I can see every module — work, outreach, Spanish, training, spending, habits and goals.'
          }
          suggestions={MODE_SUGGESTIONS[mode]}
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
      )}

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
  const cap = capacity(state);
  const savingRows = goalRows(state);
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
Headroom left this month: ${m.budgetTotal ? fmtMoney(m.remaining, cur) : 'unknown — no budget set'}.
Category headroom: ${budgetHeadroom(state).slice(0, 8).map((h) => `${h.category} ${fmtMoney(h.left, cur)} of ${fmtMoney(h.budget, cur)}`).join('; ') || 'no budgets set'}.
Take-home: ${cap.income > 0 ? `${fmtMoney(cap.income, cur)}/mo` : 'not given'}; average month of spending ${fmtMoney(cap.avgSpend, cur)}; ${cap.free === null ? 'free cash unknown' : `${fmtMoney(cap.free, cur)}/mo free after saving goals`}.
Saving goals: ${savingRows.map((r) => `${r.goal.name} ${fmtMoney(r.balance, cur)} of ${fmtMoney(r.goal.target, cur)}, putting in ${fmtMoney(r.goal.monthly, cur)}/mo${r.requiredMonthly !== null ? ` (the date needs ${fmtMoney(r.requiredMonthly, cur)}/mo)` : ''} — ${r.status}${(r.goal.answers ?? []).length ? `; they decided: ${(r.goal.answers ?? []).map((a) => a.answer).join(' / ')}` : ''}`).join('\n') || 'none set'}
Money spent on anything else comes out of those goals first — say which one slips and by how long.

MODULE 10 — Health
${(() => {
  const h = healthSummary(state);
  const unit = state.health.weightUnit;
  return [
    h.weight ? `Weight ${h.weight.value}${unit}${h.weightDelta !== null ? ` (${h.weightDelta > 0 ? '+' : ''}${h.weightDelta.toFixed(1)} over the last month)` : ''}` : 'Weight not recorded',
    h.proteinTarget ? `${Math.round(h.today.protein)}g of ${h.proteinTarget}g protein today` : `${Math.round(h.today.protein)}g protein logged today`,
    h.sleepLast !== null ? `${h.sleepLast}h sleep last recorded` : 'sleep not recorded',
    h.flaggedCount ? `${h.flaggedCount} blood marker(s) outside the entered range on the last panel` : 'nothing flagged on the last panel',
    h.monthsSincePanel !== null ? `${h.monthsSincePanel} months since bloodwork` : 'no bloodwork logged',
  ].join('. ');
})()}
Do not interpret a lab result or give medical advice; point them at their doctor for anything clinical.

MODULE 6 — Habits
${h.rows.map((r) => `- ${r.habit.title} (${r.habit.cadence}): ${r.statusLabel}${r.daysSince === null ? ', never done' : `, ${r.daysSince} day(s) since`}`).join('\n') || '- none set up'}

MODULE 7 — Goals (what money competes with)
${state.goals.items.filter((g) => !g.done).map((g) => `- ${g.title} (${g.kind})${g.cost ? `, ${fmtMoney(g.cost, cur)}` : ''}${g.monthly ? `, ${fmtMoney(g.monthly, cur)}/mo` : ''}${g.target ? `, ${g.current ?? 0} of ${g.target} ${g.unit ?? ''}` : ''}${g.plan ? ` — plan: ${g.plan}` : ''}`).join('\n') || '- none set'}

MODULE 8 — Notes and journal (recent, for context on what is on their mind)
${state.notes.items.slice(0, 5).map((n) => `- ${n.title}${n.body ? `: ${n.body.slice(0, 140)}` : ''}`).join('\n') || '- nothing written'}

MODULE 9 — Check-ins
${c.checkedInToday ? 'Checked in today.' : 'No check-in today.'} Last mood ${c.moodTrend.at(-1)?.value ?? '—'}/5, energy ${c.energyTrend.at(-1)?.value ?? '—'}/5.
Active-day streak: ${streakOf(state.activeDays).current} days.`;
}

const MODE_BRIEF: Record<CoachMode, string> = {
  coach: `You are their coach. Answer with what to do next. Be direct and unsentimental, prefer one concrete action over a list, and keep it under about 200 words unless they ask for a full plan.`,

  therapist: `You are a sounding board, not a coach and not a therapist. Say so if they treat you as one.
Ask before you advise. Your first reply to anything they raise should usually be a question that gets at what is underneath it — what they are avoiding, what they are afraid the answer is, what changed. Reflect back what you actually heard in their words. Do not rush to a fix, do not produce a list of tips, and do not moralise.
Only bring in the numbers below when they help them see something about themselves, not to score them.
If they describe anything that sounds like a crisis or thoughts of harming themselves, drop the format, say plainly that this is beyond what an app should handle, and point them to a real professional or a crisis line in their country.`,

  straight: `You are giving the unfiltered read, the one they would not ask for. No encouragement, no softening, no compliment sandwich.
Start with the thing they are least likely to want to hear, and make it specific to the numbers below rather than a general lecture. If the week does not fit in the hours available, say which commitment has to go and why that one. If a goal has not moved in a month, say the goal is not real yet. If they are doing well at something, say that too — plainly, once, without dressing it up.
Be hard on the situation, never on them as a person. No insults and no profanity. Under about 200 words.`,
};

const TONE_LINE: Record<string, string> = {
  gentle: 'Be warm and encouraging. Name what slipped without making them feel bad about it.',
  direct: 'Be direct and unsentimental. Say plainly what slipped and what to do about it. No pep talk.',
  drill: 'Be blunt and demanding, like a coach who expects better. Call out what slipped in short, hard sentences and tell them to go fix it now. Never insult them personally and never swear.',
};

function buildLifeCoachSystem(state: ReturnType<typeof useApp>['state']): string {
  const r = realityCheck(state);
  const timeLine = r.overBy > 0
    ? `Their weekly commitments add up to ${r.committed.toFixed(1)} hours against ${r.available.toFixed(0)} available after sleep and work — ${r.overBy.toFixed(1)} hours more than exists. Treat that as a fact when they ask whether they can add something.`
    : `Their weekly commitments add up to ${r.committed.toFixed(1)} hours against ${r.available.toFixed(0)} available after sleep and work, so there is ${Math.abs(r.overBy).toFixed(1)} hours of slack on paper.`;

  return `You are inside the user's personal tracking app and can see every module's live numbers below. Today is ${todayKey()}.

${MODE_BRIEF[state.coach.mode] ?? MODE_BRIEF.coach}

${TONE_LINE[state.habits.tone] ?? TONE_LINE.direct}

TIME BUDGET
${timeLine}

Name the trade-off rather than telling them to do everything: they have a demanding tax job, a side practice they are trying to grow, a language habit, twelve training sessions a week, a household budget and a set of daily habits. When something is slipping, say which one and what it costs to fix. Prefer one concrete next action over a list. Keep replies under about 200 words unless they ask for a full plan.

CROSS-REFERENCE BEFORE YOU AGREE
When they raise spending money on something, price it against the budget headroom and the goals below before answering, and say the number. If it does not fit, say so and offer the cheapest thing that solves the same underlying problem. If it does fit, say that too — do not manufacture an objection.
When they describe a symptom, look for the cause in the data rather than treating the symptom: poor sleep in the habit log, a missed strength week, a training block with no easy days. Say what the data shows before you suggest anything.
If you push back and they tell you the reasoning was wrong, drop it and take their correction — do not argue the point twice.

Do not invent numbers. If you need something that isn't below, ask for it. You are not a doctor, a financial adviser or a lawyer; when something needs one, say so plainly in a sentence and move on.

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
  for (const r of goalRows(state)) {
    if (r.status === 'behind') slipping.push(`${r.goal.name} is ${fmtMoney(r.shortfall, state.settings.currency)}/mo short of its date`);
    if (r.status === 'stalled') slipping.push(`${r.goal.name} has nothing going into it`);
  }
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
