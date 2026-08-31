import { useState } from 'react';
import { ACTIVITY_TYPES, bucketOf, type Activity, type ChatMessage } from '../lib/schema';
import { XP } from '../lib/gamification';
import { diffDays, dowLabel, fmtDate, fmtDuration, todayKey, weekStart } from '../lib/date';
import { uid } from '../lib/id';
import { useApp } from '../state/context';
import { fitnessStats } from '../state/selectors';
import { Modal } from '../components/ui/Modal';
import { EmptyState, Field, SectionHead } from '../components/ui/Field';
import { BarChart } from '../components/charts/BarChart';
import { Ring } from '../components/charts/Ring';
import { StatTile } from '../components/charts/StatTile';
import { Chat } from '../components/Chat';

const ACCENT = 'var(--mod-fitness)';

export function Fitness() {
  const { state, update, reward, toast } = useApp();
  const stats = fitnessStats(state);
  const [logging, setLogging] = useState(false);
  const [tab, setTab] = useState<'week' | 'race' | 'coach'>('week');

  const logActivity = (a: Omit<Activity, 'id'>) => {
    const longRun = (a.distanceKm ?? 0) >= 15;
    const completesWeek = stats.total + 1 === stats.targets.total;
    const xp = XP.fitnessSession + (longRun ? XP.fitnessLongRun : 0) + (completesWeek ? XP.weeklyTargetHit : 0);
    reward(
      'fitness',
      xp,
      completesWeek ? `Week complete — ${stats.targets.total} sessions` : `Logged ${a.type}`,
      (s) => ({ ...s, fitness: { ...s.fitness, activities: [...s.fitness.activities, { ...a, id: uid('act') }] } }),
    );
    setLogging(false);
  };

  const week = state.fitness.activities
    .filter((a) => weekStart(a.date) === weekStart())
    .sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="stack">
      <section className="card" style={{ ['--mod' as string]: ACCENT }}>
        <SectionHead title="This week" sub={`${fmtDuration(stats.weekMinutes)} of training logged`} />
        <div className="hero-split">
          <div className="hero-figure"><Ring
            value={stats.targets.total ? stats.total / stats.targets.total : 0}
            color={ACCENT}
            size={96}
            stroke={9}
            label={`${stats.total}`}
            caption={`of ${stats.targets.total}`}
          /></div>
          <div className="hero-body grid grid-3 tight-mobile" style={{ gap: 'var(--sp-3)' }}>
            <QuotaTile name="MMA" done={stats.mma} target={stats.targets.mma} />
            <QuotaTile name="Lifting" done={stats.strength} target={stats.targets.strength} />
            <QuotaTile name="Anything else" done={stats.flexDone} target={stats.flexTarget} />
          </div>
        </div>
        <button
          className="btn btn-accent btn-lg btn-block"
          style={{ ['--mod' as string]: ACCENT, marginTop: 'var(--sp-4)' }}
          onClick={() => setLogging(true)}
        >
          + Log a session
        </button>
      </section>

      <div className="tabs" role="tablist">
        <button className="tab" role="tab" aria-selected={tab === 'week'} onClick={() => setTab('week')}>The week</button>
        <button className="tab" role="tab" aria-selected={tab === 'race'} onClick={() => setTab('race')}>Half marathon</button>
        <button className="tab" role="tab" aria-selected={tab === 'coach'} onClick={() => setTab('coach')}>Coach</button>
      </div>

      {tab === 'week' && (
        <>
          <section className="card">
            <SectionHead title="Sessions by day" sub="Twelve a week, spread however it works" />
            <BarChart
              data={stats.byDay.map((d) => ({ key: d.key, value: d.value, label: dowLabel(d.key) }))}
              color={ACCENT}
              highlightKey={todayKey()}
              ariaLabel="Fitness sessions logged each day this week"
            />
          </section>

          <section className="card">
            <SectionHead title="Logged this week" sub={`${week.length} session${week.length === 1 ? '' : 's'}`} />
            {week.length === 0 ? (
              <EmptyState icon="🏃" title="Nothing logged this week" hint="Three MMA, four lifting, five of whatever else." />
            ) : (
              <div className="stack-2">
                {week.map((a) => (
                  <div key={a.id} className="rowitem">
                    <span className="chip chip-static" style={{ ['--dot' as string]: ACCENT }}>
                      <i className="chip-dot" style={{ background: bucketColor(a.type) }} />
                      {bucketLabel(a.type)}
                    </span>
                    <span className="grow" style={{ minWidth: 0 }}>
                      <span className="t-sm t-bold">{a.type}</span>
                      <span className="t-xs t-muted" style={{ display: 'block' }}>
                        {dowLabel(a.date)} · {fmtDuration(a.minutes)}
                        {a.distanceKm ? ` · ${a.distanceKm} km` : ''}
                        {a.rpe ? ` · RPE ${a.rpe}` : ''}
                      </span>
                    </span>
                    <button
                      className="link-btn"
                      onClick={() => {
                        update((s) => ({ ...s, fitness: { ...s.fitness, activities: s.fitness.activities.filter((x) => x.id !== a.id) } }));
                        toast('Session removed');
                      }}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="card">
            <SectionHead title="Weekly quotas" sub="Change these if the plan changes" />
            <div className="grid grid-3 tight-mobile" style={{ gap: 'var(--sp-3)' }}>
              {(['mma', 'strength', 'total'] as const).map((k) => (
                <Field key={k} label={k === 'mma' ? 'MMA' : k === 'strength' ? 'Strength' : 'Total'}>
                  <input
                    className="input" type="number" min={0}
                    value={state.fitness.targets[k]}
                    onChange={(e) => update((s) => ({
                      ...s,
                      fitness: { ...s.fitness, targets: { ...s.fitness.targets, [k]: Math.max(0, Number(e.target.value) || 0) } },
                    }))}
                  />
                </Field>
              ))}
            </div>
          </section>
        </>
      )}

      {tab === 'race' && <RacePanel />}

      {tab === 'coach' && (
        <section className="card">
          <SectionHead title="Workout coach" sub="Knows your quotas, your logged sessions and your race date" />
          <Chat
            accent={ACCENT}
            messages={state.fitness.chat}
            onChange={(next) => update((s) => ({ ...s, fitness: { ...s.fitness, chat: next } }))}
            buildSystem={() => buildCoachSystem(state)}
            offlineReply={(input) => offlineFitnessReply(input, state)}
            placeholder="Ask about your training…"
            emptyHint="I can see this week's sessions, your quotas and your half-marathon build. Ask me what to do today, how to fit the week together, or what your long run should be."
            suggestions={[
              'What should I do today?',
              'Am I on track for the half marathon?',
              'How do I fit 12 sessions around 3 MMA classes?',
            ]}
          />
          {state.fitness.chat.length > 0 && (
            <button
              className="link-btn"
              style={{ marginTop: 'var(--sp-3)' }}
              onClick={() => update((s) => ({ ...s, fitness: { ...s.fitness, chat: [] as ChatMessage[] } }))}
            >
              Clear conversation
            </button>
          )}
        </section>
      )}

      {logging && <ActivityForm onClose={() => setLogging(false)} onSave={logActivity} />}
    </div>
  );
}

function QuotaTile({ name, done, target }: { name: string; done: number; target: number }) {
  const met = target > 0 && done >= target;
  return (
    <div className="tile">
      <span className="tile-label">{name}</span>
      <span className="tile-value tile-value-sm">
        {done}<span className="t-muted" style={{ fontSize: 15 }}> / {target}</span>
      </span>
      <span className={met ? 'status status-good' : 'status status-neutral'} style={{ alignSelf: 'flex-start' }}>
        {met ? 'Met' : `${target - done} left`}
      </span>
    </div>
  );
}

const bucketColor = (type: string) =>
  bucketOf(type) === 'mma' ? 'var(--series-8)' : bucketOf(type) === 'strength' ? 'var(--series-7)' : 'var(--series-4)';

const bucketLabel = (type: string) =>
  bucketOf(type) === 'mma' ? 'MMA' : bucketOf(type) === 'strength' ? 'Strength' : 'Other';

function RacePanel() {
  const { state, update } = useApp();
  const stats = fitnessStats(state);
  const race = state.fitness.race;
  const daysOut = race.date ? diffDays(race.date, todayKey()) : null;
  const weeksOut = daysOut !== null ? Math.max(0, Math.ceil(daysOut / 7)) : null;

  return (
    <>
      <section className="card" style={{ ['--mod' as string]: ACCENT }}>
        <SectionHead title={race.name} sub={race.date ? `${fmtDate(race.date)} · ${daysOut} days out` : 'No race date set yet'} />
        <div className="grid grid-3 tight-mobile" style={{ gap: 'var(--sp-3)' }}>
          <StatTile label="This week" value={`${stats.runKmThisWeek.toFixed(1)}`} caption="km run" small />
          <StatTile label="Longest run" value={`${stats.longestRun.toFixed(1)}`} caption="km, all time" small />
          <StatTile label="To go" value={`${Math.max(0, race.distanceKm - stats.longestRun).toFixed(1)}`} caption={`km short of ${race.distanceKm}`} small />
        </div>
      </section>

      <section className="card">
        <SectionHead title="Weekly distance" sub="Last 8 weeks" />
        <BarChart
          data={stats.runHistory.map((h) => ({ key: h.key, value: Math.round(h.value * 10) / 10, label: fmtDate(h.key) }))}
          color={ACCENT}
          highlightKey={weekStart()}
          formatValue={(n) => `${n} km`}
          ariaLabel="Kilometres run each week over the last eight weeks"
        />
      </section>

      {weeksOut !== null && weeksOut > 0 && (
        <section className="card card-sunken">
          <p className="t-sm t-sec">
            <strong>{weeksOut} week{weeksOut === 1 ? '' : 's'} out.</strong>{' '}
            A standard build adds about 10% of weekly volume at a time and takes the long run up to
            roughly {Math.min(race.distanceKm, 18)} km before a two-week taper. Your longest so far is{' '}
            {stats.longestRun.toFixed(1)} km.
          </p>
        </section>
      )}

      <section className="card">
        <SectionHead title="Race details" />
        <div className="grid grid-2" style={{ gap: 'var(--sp-3)' }}>
          <Field label="Race">
            <input
              className="input" value={race.name}
              onChange={(e) => update((s) => ({ ...s, fitness: { ...s.fitness, race: { ...s.fitness.race, name: e.target.value } } }))}
            />
          </Field>
          <Field label="Date">
            <input
              className="input" type="date" value={race.date ?? ''}
              onChange={(e) => update((s) => ({ ...s, fitness: { ...s.fitness, race: { ...s.fitness.race, date: e.target.value || undefined } } }))}
            />
          </Field>
          <Field label="Distance (km)">
            <input
              className="input" type="number" min={1} step={0.1} value={race.distanceKm}
              onChange={(e) => update((s) => ({ ...s, fitness: { ...s.fitness, race: { ...s.fitness.race, distanceKm: Number(e.target.value) || 21.1 } } }))}
            />
          </Field>
          <Field label="Target time">
            <input
              className="input" placeholder="1:55:00" value={race.targetTime ?? ''}
              onChange={(e) => update((s) => ({ ...s, fitness: { ...s.fitness, race: { ...s.fitness.race, targetTime: e.target.value || undefined } } }))}
            />
          </Field>
        </div>
      </section>
    </>
  );
}

function ActivityForm({ onClose, onSave }: { onClose: () => void; onSave: (a: Omit<Activity, 'id'>) => void }) {
  const [type, setType] = useState<string>('MMA');
  const [minutes, setMinutes] = useState('60');
  const [date, setDate] = useState(todayKey());
  const [distance, setDistance] = useState('');
  const [rpe, setRpe] = useState('');
  const [notes, setNotes] = useState('');
  const isRun = type === 'Run' || type === 'Long run' || type === 'Cycling' || type === 'Swim';

  return (
    <Modal
      title="Log a session"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-accent"
            style={{ ['--mod' as string]: ACCENT }}
            onClick={() => onSave({
              date,
              type,
              minutes: Math.max(1, Number(minutes) || 0),
              distanceKm: distance ? Number(distance) : undefined,
              rpe: rpe ? Number(rpe) : undefined,
              notes: notes.trim() || undefined,
            })}
          >
            Log it
          </button>
        </>
      }
    >
      <div className="stack-3">
        <Field label="What did you do">
          <div className="row-2 wrap">
            {ACTIVITY_TYPES.map((a) => (
              <button key={a.label} type="button" className="chip" aria-pressed={type === a.label} onClick={() => setType(a.label)}>
                {a.label}
              </button>
            ))}
          </div>
        </Field>
        <div className="grid grid-2" style={{ gap: 'var(--sp-3)' }}>
          <Field label="Minutes">
            <input className="input" type="number" min={1} value={minutes} onChange={(e) => setMinutes(e.target.value)} />
          </Field>
          <Field label="Date">
            <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          {isRun && (
            <Field label="Distance (km)">
              <input className="input" type="number" min={0} step={0.1} value={distance} onChange={(e) => setDistance(e.target.value)} />
            </Field>
          )}
          <Field label="Effort (RPE 1–10)">
            <input className="input" type="number" min={1} max={10} value={rpe} onChange={(e) => setRpe(e.target.value)} />
          </Field>
        </div>
        <Field label="Notes">
          <textarea className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Sparring rounds felt sharp; left knee a bit sore" />
        </Field>
      </div>
    </Modal>
  );
}

/* ---------------- coach prompting ---------------- */

function buildCoachSystem(state: ReturnType<typeof useApp>['state']): string {
  const s = fitnessStats(state);
  const recent = state.fitness.activities
    .slice(-14)
    .map((a) => `${a.date}: ${a.type}, ${a.minutes}min${a.distanceKm ? `, ${a.distanceKm}km` : ''}${a.rpe ? `, RPE ${a.rpe}` : ''}`)
    .join('\n') || 'nothing logged yet';

  const race = state.fitness.race;
  const daysOut = race.date ? diffDays(race.date, todayKey()) : null;

  return `You are the user's training coach inside their habit-tracking app. You are talking to one athlete whose real training log is below. Be direct, specific and practical. Give concrete sessions with numbers, not generic advice. Keep replies under about 200 words unless asked for a full plan.

WEEKLY QUOTAS
- MMA: ${s.targets.mma} sessions/week (done this week: ${s.mma})
- Lifting or calisthenics: ${s.targets.strength} sessions/week (done: ${s.strength})
- Total fitness sessions: ${s.targets.total}/week (done: ${s.total})
- That leaves ${s.flexTarget} flexible slots for running, basketball or anything else (used: ${s.flexDone})

RACE GOAL
- ${race.name}, ${race.distanceKm} km${race.targetTime ? `, target time ${race.targetTime}` : ''}
- ${race.date ? `Race date ${race.date}, ${daysOut} days away` : 'No race date set'}
- Longest run logged: ${s.longestRun.toFixed(1)} km. Distance this week: ${s.runKmThisWeek.toFixed(1)} km.

RECENT SESSIONS (most recent last)
${recent}

Today is ${todayKey()}. Account for the fact that MMA is hard on the legs when you place runs. If they are behind on quotas, say what to do about it rather than scolding. You are not a doctor: if they describe pain that sounds like injury, say so plainly and suggest they get it looked at.`;
}

function offlineFitnessReply(input: string, state: ReturnType<typeof useApp>['state']): string {
  const s = fitnessStats(state);
  const q = input.toLowerCase();
  const gaps: string[] = [];
  if (s.mma < s.targets.mma) gaps.push(`${s.targets.mma - s.mma} MMA`);
  if (s.strength < s.targets.strength) gaps.push(`${s.targets.strength - s.strength} lifting/calisthenics`);
  if (s.flexDone < s.flexTarget) gaps.push(`${s.flexTarget - s.flexDone} flexible (runs, basketball)`);

  if (q.includes('half') || q.includes('marathon') || q.includes('run')) {
    const race = state.fitness.race;
    const short = Math.max(0, race.distanceKm - s.longestRun);
    return [
      `Longest run so far: ${s.longestRun.toFixed(1)} km — ${short.toFixed(1)} km short of ${race.distanceKm}.`,
      `This week you've covered ${s.runKmThisWeek.toFixed(1)} km.`,
      race.date ? `Race is ${diffDays(race.date, todayKey())} days out.` : 'No race date set yet — add one under the Half marathon tab.',
      'A safe build adds roughly 10% of weekly volume at a time, with one long run a week and every fourth week easier.',
    ].join('\n');
  }

  if (gaps.length === 0) {
    return `You're at ${s.total} of ${s.targets.total} sessions and every quota is met. Anything else this week is a bonus — an easy run or mobility is the low-cost option.`;
  }

  return [
    `You're at ${s.total} of ${s.targets.total} sessions this week.`,
    `Still owed: ${gaps.join(', ')}.`,
    s.mma < s.targets.mma
      ? 'Priority is MMA — it is the hardest to make up late in the week since classes are scheduled.'
      : 'Strength is the one to prioritise; runs are easier to slot in anywhere.',
    '',
    'Add an Anthropic API key in Settings for a real conversation.',
  ].join('\n');
}
