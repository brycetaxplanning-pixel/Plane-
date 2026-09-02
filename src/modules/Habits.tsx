import { useState } from 'react';
import type { Cadence, CoachTone, Habit, HabitKind } from '../lib/schema';
import { XP } from '../lib/gamification';
import { dowLabel, todayKey } from '../lib/date';
import { meetsTarget, statusColor, statusIcon, weekCompletion, type HabitRow } from '../lib/habits';
import { uid } from '../lib/id';
import { useApp } from '../state/context';
import { habitStats } from '../state/selectors';
import { isEnlightened, thisWeekProgress } from '../lib/awards';
import { EnlightenedBadge } from '../components/Enlightenment';
import { Modal } from '../components/ui/Modal';
import { EmptyState, Field, SectionHead } from '../components/ui/Field';
import { BarChart } from '../components/charts/BarChart';
import { Ring } from '../components/charts/Ring';
import { StatTile } from '../components/charts/StatTile';
import { hoursAs, sinkTotals } from '../lib/insights';
import { Icons, type IconName } from '../components/layout/Icons';
import { MarkPicker } from '../components/ui/MarkPicker';
import { SwipeRow } from '../components/ui/SwipeRow';

const ACCENT = 'var(--mod-habits)';

/** The same fact in three registers, matching the tone set below. It states
 *  the number and stops — no lecture attached. */
function scold(tone: CoachTone, hours: number, asThings: string | null): string {
  const h = `${hours}h`;
  const like = asThings ? ` That is ${asThings}.` : '';
  if (tone === 'gentle') return `${h} over the cap so far.${like}`;
  if (tone === 'drill') return `${h} gone. Not lost — spent, by you, on purpose.${like}`;
  return `${h} past the cap since you started counting.${like}`;
}



const TONES: { id: CoachTone; label: string; blurb: string }[] = [
  { id: 'gentle', label: 'Gentle', blurb: 'Encouraging' },
  { id: 'direct', label: 'Direct', blurb: 'Says it straight' },
  { id: 'drill',  label: 'Drill sergeant', blurb: 'Gets on your case' },
];

export function Habits() {
  const { state, update, reward, toast } = useApp();
  const stats = habitStats(state);
  const [editing, setEditing] = useState<Habit | 'new' | null>(null);

  /** Removes the habit and its logs, and offers the whole lot straight back —
   *  a swipe is easy to do by accident and a habit carries its history. */
  const removeHabit = (habit: Habit) => {
    const logs = state.habits.logs.filter((l) => l.habitId === habit.id);
    update((s) => ({
      ...s,
      habits: {
        ...s.habits,
        items: s.habits.items.filter((h) => h.id !== habit.id),
        logs: s.habits.logs.filter((l) => l.habitId !== habit.id),
      },
    }));
    toast(`${habit.title} deleted`, undefined, {
      label: 'Undo',
      run: () => update((s) => ({
        ...s,
        habits: { ...s.habits, items: [...s.habits.items, habit], logs: [...s.habits.logs, ...logs] },
      })),
    });
  };
  const [logging, setLogging] = useState<HabitRow | null>(null);

  const commitLog = (habit: Habit, value: { amount?: number; time?: string }) => {
    const met = meetsTarget(habit, value);
    const today = todayKey();
    const xp = habit.cadence === 'weekly' ? XP.habitWeekly : XP.habitDone;

    const apply = (s: typeof state) => ({
      ...s,
      habits: {
        ...s.habits,
        logs: [
          // A daily habit has one entry a day; a weekly one can have several.
          ...s.habits.logs.filter((l) => !(l.habitId === habit.id && l.date === today && habit.cadence === 'daily')),
          { id: uid('hl'), habitId: habit.id, date: today, met, amount: value.amount, time: value.time },
        ],
      },
    });

    if (met) reward('habits', xp, `${habit.title} — done`, apply);
    else {
      update(apply);
      toast(`${habit.title} logged, but short of the target`);
    }
    setLogging(null);
  };

  const quickLog = (row: HabitRow) => {
    if (row.habit.kind === 'check') commitLog(row.habit, {});
    else setLogging(row);
  };

  const undoToday = (habit: Habit) => {
    const today = todayKey();
    update((s) => ({
      ...s,
      habits: { ...s.habits, logs: s.habits.logs.filter((l) => !(l.habitId === habit.id && l.date === today)) },
    }));
    toast('Today cleared');
  };

  if (state.habits.items.length === 0) {
    return (
      <div className="stack">
        <EmptyState
          icon={Icons.repeat()}
          title="No habits yet"
          hint="Daily things you want to do every day, weekly things you want to hit a few times a week."
        />
        <button className="btn btn-accent btn-lg" style={{ ['--mod' as string]: ACCENT }} onClick={() => setEditing('new')}>
          + Add your first habit
        </button>
        {editing && <HabitForm habit={null} onClose={() => setEditing(null)} onSave={(h) => {
          update((s) => ({ ...s, habits: { ...s.habits, items: [...s.habits.items, h] } }));
          setEditing(null);
        }} />}
      </div>
    );
  }

  const sinks = sinkTotals(state);

  return (
    <div className="stack">
      <section className="card" style={{ ['--mod' as string]: ACCENT }}>
        <div className="hero-split">
          <div className="hero-figure">
            <Ring
              value={stats.completion}
              color={ACCENT}
              size={92}
              stroke={8}
              label={`${stats.todayDone}/${stats.todayTotal}`}
              caption="today"
            />
          </div>
          <div className="hero-body stack-2">
            {stats.needsAttention.length === 0 ? (
              <p className="status status-good" style={{ alignSelf: 'flex-start' }}><span className="btn-glyph" aria-hidden>{Icons.check()}</span> Nothing is slipping</p>
            ) : (
              <>
                <p className="t-sm t-bold">{stats.needsAttention[0].nudge}</p>
                {stats.needsAttention.length > 1 && (
                  <p className="t-xs t-muted">
                    and {stats.needsAttention.length - 1} other
                    {stats.needsAttention.length === 2 ? ' needs' : 's need'} attention
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </section>

      {stats.daily.length > 0 && (
        <section className="card">
          <SectionHead title="Every day" sub={`${stats.todayDone} of ${stats.todayTotal} done today`} />
          <div className="stack-2">
            {stats.daily.map((row) => (
              <SwipeRow key={row.habit.id} label={row.habit.title} onDelete={() => removeHabit(row.habit)}>
                <HabitRowView row={row} onLog={() => quickLog(row)} onUndo={() => undoToday(row.habit)} onEdit={() => setEditing(row.habit)} />
              </SwipeRow>
            ))}
          </div>
        </section>
      )}

      {stats.weekly.length > 0 && (
        <section className="card">
          <SectionHead title="Every week" sub="Counts reset on Monday" />
          <div className="stack-2">
            {stats.weekly.map((row) => (
              <SwipeRow key={row.habit.id} label={row.habit.title} onDelete={() => removeHabit(row.habit)}>
                <HabitRowView row={row} onLog={() => quickLog(row)} onUndo={() => undoToday(row.habit)} onEdit={() => setEditing(row.habit)} />
              </SwipeRow>
            ))}
          </div>
        </section>
      )}

      <section className="card">
        <SectionHead
          title="Enlightenment"
          sub="Every daily habit every day, and every weekly habit, Monday to Sunday"
          action={isEnlightened(state) ? <EnlightenedBadge /> : undefined}
        />
        {(() => {
          const p = thisWeekProgress(state);
          const pct = p.total ? Math.round((p.met / p.total) * 100) : 0;
          return (
            <>
              <div className="xpbar"><i style={{ width: `${pct}%`, background: 'var(--seq-400)' }} /></div>
              <p className="t-xs t-muted" style={{ marginTop: 6 }}>
                {p.met} of {p.total} this week{p.met === p.total && p.total > 0 ? ' — perfect so far' : ''}
              </p>
            </>
          );
        })()}
      </section>

      {stats.daily.length > 0 && (
        <section className="card">
          <SectionHead title="Daily habits hit" sub="Share of your daily habits, last 7 days" />
          <BarChart
            data={weekCompletion(stats.rows).map((d) => ({ key: d.key, value: d.value, label: dowLabel(d.key) }))}
            color={ACCENT}
            target={100}
            targetLabel="All of them"
            highlightKey={todayKey()}
            formatValue={(n) => `${n}%`}
            ariaLabel="Percentage of daily habits completed each day this week"
          />
        </section>
      )}

      {sinks.length > 0 && (
        <section className="card">
          <SectionHead
            title="What it has cost so far"
            sub="Anything you capped, totalled up since you started logging it"
          />
          <div className="stack-4">
            {sinks.map((sink) => {
              const over = sink.hoursOver;
              const asThings = hoursAs(state, over);
              return (
                <div key={sink.habit.id} className="stack-2" style={{ marginBottom: 'var(--sp-4)' }}>
                  <div className="spread">
                    <span className="t-sm t-bold row-2" style={{ gap: 6 }}>
                      <span className="habit-mark" aria-hidden>
                        {sink.habit.icon ? Icons[sink.habit.icon]() : Icons.repeat()}
                      </span>
                      {sink.habit.title}
                    </span>
                    <span className="t-xs t-muted">
                      {sink.daysLogged} day{sink.daysLogged === 1 ? '' : 's'} logged · cap {sink.capPerDay}h
                    </span>
                  </div>

                  <div className="grid grid-3" style={{ gap: 'var(--sp-3)' }}>
                    <StatTile
                      label="Over the cap"
                      value={`${over}h`}
                      caption={`all time · ${sink.hoursOverThisMonth}h this month`}
                    />
                    <StatTile
                      label="Total on it"
                      value={`${sink.hoursTotal}h`}
                      caption={`${sink.averagePerDay}h a day on average`}
                    />
                    <StatTile
                      label="Under the cap"
                      value={`${sink.daysUnder}/${sink.daysLogged}`}
                      caption={sink.daysUnder === sink.daysLogged ? 'every logged day' : 'days you kept it down'}
                    />
                  </div>

                  {over > 0 && (
                    <div className="callout callout-warn">
                      <strong className="t-sm">{scold(state.habits.tone, over, asThings)}</strong>
                      {/* Three weeks before a yearly figure is offered: a rate
                          from five days is noise wearing a big number. */}
                      {sink.daysLogged >= 21 ? (
                        <p className="t-sm" style={{ margin: '4px 0 0' }}>
                          At this rate that is {sink.projectedYear}h a year over the cap you set yourself
                          {sink.projectedYear >= 24 ? ` — ${(sink.projectedYear / 24).toFixed(0)} whole days` : ''}.
                        </p>
                      ) : (
                        <p className="t-sm" style={{ margin: '4px 0 0' }}>
                          {21 - sink.daysLogged} more logged day{21 - sink.daysLogged === 1 ? '' : 's'} and this can
                          be read as a rate rather than a run of days.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <p className="t-xs t-muted">
            Only days you logged are counted. A day with nothing entered is left out rather than assumed to be zero, so
            these totals are a floor, not a guess.
          </p>
        </section>
      )}

      <section className="card">
        <SectionHead title="How hard should it push?" sub="Changes the wording here and how the Life Coach talks to you" />
        <div className="row-2 wrap">
          {TONES.map((t) => (
            <button
              key={t.id}
              className="chip"
              aria-pressed={state.habits.tone === t.id}
              onClick={() => update((s) => ({ ...s, habits: { ...s.habits, tone: t.id } }))}
            >
              {t.label}
            </button>
          ))}
        </div>
        <p className="t-xs t-muted" style={{ marginTop: 6 }}>
          {TONES.find((t) => t.id === state.habits.tone)?.blurb}
        </p>
      </section>

      <button className="btn btn-accent btn-lg btn-block" style={{ ['--mod' as string]: ACCENT }} onClick={() => setEditing('new')}>
        + Add a habit
      </button>

      {editing && (
        <HabitForm
          habit={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onDelete={editing === 'new' ? undefined : () => {
            const id = (editing as Habit).id;
            update((s) => ({
              ...s,
              habits: { ...s.habits, items: s.habits.items.filter((h) => h.id !== id), logs: s.habits.logs.filter((l) => l.habitId !== id) },
            }));
            setEditing(null);
            toast('Habit removed');
          }}
          onSave={(h) => {
            update((s) => ({
              ...s,
              habits: {
                ...s.habits,
                items: s.habits.items.some((x) => x.id === h.id) ? s.habits.items.map((x) => (x.id === h.id ? h : x)) : [...s.habits.items, h],
              },
            }));
            setEditing(null);
            toast('Habit saved');
          }}
        />
      )}

      {logging && (
        <LogForm
          row={logging}
          onClose={() => setLogging(null)}
          onSave={(value) => commitLog(logging.habit, value)}
        />
      )}
    </div>
  );
}

function HabitRowView({
  row, onLog, onUndo, onEdit,
}: {
  row: HabitRow;
  onLog: () => void;
  onUndo: () => void;
  onEdit: () => void;
}) {
  const weekly = row.habit.cadence === 'weekly';

  return (
    <div className="habit" style={{ ['--stat' as string]: statusColor(row.status) }}>
      <span className="habit-dot" aria-hidden>{Icons[statusIcon(row.status)]()}</span>

      <button className="habit-main" onClick={onEdit}>
        <span className="row-2" style={{ gap: 6 }}>
          <span className="habit-mark" aria-hidden>
            {row.habit.icon
              ? Icons[row.habit.icon]()
              : row.habit.cadence === 'weekly' ? Icons.calendar() : Icons.repeat()}
          </span>
          <span className="t-sm t-bold truncate">{row.habit.title}</span>
        </span>
        <span className="habit-sub">
          {row.statusLabel}
          {weekly
            ? ` · ${row.weekCount}/${row.weekTarget} this week`
            : row.daysSince !== null && row.daysSince > 0 ? ` · ${row.daysSince} day${row.daysSince === 1 ? '' : 's'} since` : ''}
          {row.habit.kind === 'amount' && row.habit.target ? ` · target ${row.habit.target}${row.habit.unit ?? ''}` : ''}
          {row.habit.kind === 'under' && row.habit.target ? ` · cap ${row.habit.target}${row.habit.unit ?? ''}` : ''}
          {row.habit.kind === 'before' && row.habit.targetTime ? ` · by ${row.habit.targetTime}` : ''}
        </span>
        {!weekly && (
          <span className="habit-week" aria-label="Last seven days">
            {row.last7.map((d) => (
              <i key={d.date} className={d.met ? 'is-met' : undefined} title={`${d.date}: ${d.met ? 'done' : 'missed'}`} />
            ))}
          </span>
        )}
      </button>

      {row.metNow && !weekly ? (
        <button className="btn btn-sm btn-ghost" onClick={onUndo}>Undo</button>
      ) : (
        <button className="btn btn-sm btn-accent" style={{ ['--mod' as string]: ACCENT }} onClick={onLog}>
          {weekly ? '+1' : 'Done'}
        </button>
      )}
    </div>
  );
}

function LogForm({
  row, onClose, onSave,
}: {
  row: HabitRow;
  onClose: () => void;
  onSave: (v: { amount?: number; time?: string }) => void;
}) {
  const { habit } = row;
  const [amount, setAmount] = useState(String(habit.target ?? ''));
  const [time, setTime] = useState(habit.targetTime ?? '23:00');

  return (
    <Modal
      title={habit.title}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-accent"
            style={{ ['--mod' as string]: ACCENT }}
            onClick={() => onSave(habit.kind === 'before' ? { time } : { amount: Number(amount) || 0 })}
          >
            Log it
          </button>
        </>
      }
    >
      {habit.kind === 'amount' || habit.kind === 'under' ? (
        <Field label={habit.kind === 'under'
          ? `How much? (cap ${habit.target}${habit.unit ?? ''})`
          : `How much? (target ${habit.target}${habit.unit ?? ''})`}>
          <input className="input" type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
        </Field>
      ) : (
        <Field label={`What time? (target ${habit.targetTime})`} hint="Anything before 5am counts as the night before.">
          <input className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} autoFocus />
        </Field>
      )}
    </Modal>
  );
}

function HabitForm({
  habit, onClose, onSave, onDelete,
}: {
  habit: Habit | null;
  onClose: () => void;
  onSave: (h: Habit) => void;
  onDelete?: () => void;
}) {
  const [title, setTitle] = useState(habit?.title ?? '');
  const [icon, setIcon] = useState<IconName | undefined>(habit?.icon);
  const [cadence, setCadence] = useState<Cadence>(habit?.cadence ?? 'daily');
  const [kind, setKind] = useState<HabitKind>(habit?.kind ?? 'check');
  const [timesPerWeek, setTimesPerWeek] = useState(String(habit?.timesPerWeek ?? 1));
  const [target, setTarget] = useState(String(habit?.target ?? ''));
  const [unit, setUnit] = useState(habit?.unit ?? '');
  const [targetTime, setTargetTime] = useState(habit?.targetTime ?? '23:30');

  return (
    <Modal
      title={habit ? 'Edit habit' : 'New habit'}
      onClose={onClose}
      footer={
        <>
          {onDelete && <button className="btn btn-danger" style={{ marginRight: 'auto' }} onClick={onDelete}>Delete</button>}
          <button className="btn" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-accent"
            style={{ ['--mod' as string]: ACCENT }}
            disabled={!title.trim()}
            onClick={() => onSave({
              id: habit?.id ?? uid('hab'),
              title: title.trim(),
              icon,
              cadence,
              kind,
              timesPerWeek: cadence === 'weekly' ? Math.max(1, Number(timesPerWeek) || 1) : undefined,
              target: kind === 'amount' || kind === 'under' ? Number(target) || 0 : undefined,
              unit: kind === 'amount' || kind === 'under' ? unit.trim() || undefined : undefined,
              targetTime: kind === 'before' ? targetTime : undefined,
              createdAt: habit?.createdAt ?? todayKey(),
            })}
          >
            Save
          </button>
        </>
      }
    >
      <div className="stack-3">
        <MarkPicker value={icon} onChange={setIcon} />
        <div className="row-2" style={{ alignItems: 'flex-end' }}>
          <div className="grow">
            <Field label="Habit">
              <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Stretch" autoFocus />
            </Field>
          </div>
        </div>

        <Field label="How often">
          <div className="row-2">
            <button type="button" className="chip" aria-pressed={cadence === 'daily'} onClick={() => setCadence('daily')}>Every day</button>
            <button type="button" className="chip" aria-pressed={cadence === 'weekly'} onClick={() => setCadence('weekly')}>Some days a week</button>
          </div>
        </Field>

        {cadence === 'weekly' && (
          <Field label="Times a week">
            <input className="input" type="number" min={1} max={7} value={timesPerWeek} onChange={(e) => setTimesPerWeek(e.target.value)} />
          </Field>
        )}

        <Field label="What counts as done">
          <div className="row-2 wrap">
            <button type="button" className="chip" aria-pressed={kind === 'check'} onClick={() => setKind('check')}>Just did it</button>
            <button type="button" className="chip" aria-pressed={kind === 'amount'} onClick={() => setKind('amount')}>Hit a number</button>
            <button type="button" className="chip" aria-pressed={kind === 'under'} onClick={() => setKind('under')}>Stay under a number</button>
            <button type="button" className="chip" aria-pressed={kind === 'before'} onClick={() => setKind('before')}>By a time</button>
          </div>
        </Field>

        {(kind === 'amount' || kind === 'under') && (
          <div className="grid grid-2" style={{ gap: 'var(--sp-3)' }}>
            <Field label={kind === 'under' ? 'No more than' : 'At least'}>
              <input className="input" type="number" min={0} value={target} onChange={(e) => setTarget(e.target.value)} placeholder={kind === 'under' ? '3' : '180'} />
            </Field>
            <Field label="Unit"><input className="input" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="g" /></Field>
          </div>
        )}

        {kind === 'before' && (
          <Field label="No later than">
            <input className="input" type="time" value={targetTime} onChange={(e) => setTargetTime(e.target.value)} />
          </Field>
        )}
      </div>
    </Modal>
  );
}
