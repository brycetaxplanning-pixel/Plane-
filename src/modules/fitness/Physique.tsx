import { useMemo, useState } from 'react';
import { PHYSIQUE_AREAS, type Measurement, type PhysiqueArea, type PhysiqueGoal } from '../../lib/schema';
import { fmtDate, todayKey } from '../../lib/date';
import { uid } from '../../lib/id';
import { useApp } from '../../state/context';
import { Modal } from '../../components/ui/Modal';
import { EmptyState, Field, SectionHead } from '../../components/ui/Field';
import { DictateInput } from '../../components/ui/Dictation';
import { Sparkline } from '../../components/charts/Sparkline';
import { StatTile } from '../../components/charts/StatTile';
import { Icons } from '../../components/layout/Icons';

const ACCENT = 'var(--mod-fitness)';

/** Offered before anything is typed, so the field is not a blank box. */
const GOAL_SUGGESTIONS = [
  'Bigger chest',
  'Wider back',
  'Straighter posture',
  'Fewer adhesions through the lats',
  'Better overhead mobility',
];

const SITE_SUGGESTIONS = ['Chest', 'Shoulders', 'Waist', 'Arm', 'Thigh', 'Weight'];

/** Routines that belong in the Habits module rather than here — offered as a
 *  one-tap hand-off so the tracking lives where the streaks are. */
const MOBILITY_HABITS = [
  { title: 'Thoracic extension', icon: 'spine', minutes: 10 },
  { title: 'Hip flexor stretch', icon: 'leg', minutes: 10 },
  { title: 'Foam roll', icon: 'roller', minutes: 15 },
  { title: 'Dead hangs', icon: 'bar', minutes: 5 },
] as const;

export function Physique() {
  const { state, update, toast } = useApp();
  const [goalOpen, setGoalOpen] = useState<PhysiqueGoal | 'new' | null>(null);
  const [measuring, setMeasuring] = useState(false);

  const bySite = useMemo(() => {
    const map = new Map<string, Measurement[]>();
    for (const m of state.fitness.measurements) {
      const list = map.get(m.site) ?? [];
      list.push(m);
      map.set(m.site, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.date.localeCompare(b.date));
    return map;
  }, [state.fitness.measurements]);

  const goals = state.fitness.physique.filter((g) => !g.done);
  const existingHabits = new Set(state.habits.items.map((h) => h.title.toLowerCase()));

  /** Adds the habit, or takes it away again if it is already there. The
   *  button used to add and then disable itself, so a tap you did not mean to
   *  make put a daily habit in another module with no way back from here. */
  const toggleMobilityHabit = (h: (typeof MOBILITY_HABITS)[number]) => {
    const existing = state.habits.items.find((x) => x.title.toLowerCase() === h.title.toLowerCase());
    if (existing) {
      const logs = state.habits.logs.filter((l) => l.habitId === existing.id);
      update((s) => ({
        ...s,
        habits: {
          ...s.habits,
          items: s.habits.items.filter((x) => x.id !== existing.id),
          logs: s.habits.logs.filter((l) => l.habitId !== existing.id),
        },
      }));
      toast(`${h.title} removed from your daily habits`, undefined, {
        label: 'Undo',
        run: () => update((s) => ({
          ...s,
          habits: { ...s.habits, items: [...s.habits.items, existing], logs: [...s.habits.logs, ...logs] },
        })),
      });
      return;
    }
    update((s) => ({
      ...s,
      habits: {
        ...s.habits,
        items: [...s.habits.items, {
          id: uid('hab'), title: h.title,
          cadence: 'daily' as const, kind: 'amount' as const,
          target: h.minutes, unit: 'min', createdAt: todayKey(),
        }],
      },
    }));
    toast(`${h.title} added to your daily habits`);
  };

  return (
    <>
      <section className="card" style={{ ['--mod' as string]: ACCENT }}>
        <SectionHead
          title="Physique and movement"
          sub="What you want the body to do, and the numbers that show it moving"
          action={<button className="btn btn-sm" onClick={() => setGoalOpen('new')}>+ Goal</button>}
        />
        {goals.length === 0 ? (
          <EmptyState
            icon={Icons.arm()}
            title="No physique goals yet"
            hint="Bigger chest, wider back, straighter posture — measurable or not, both work."
          />
        ) : (
          <div className="stack-2">
            {goals.map((g) => {
              const series = g.site ? bySite.get(g.site) ?? [] : [];
              const latest = series.at(-1);
              const first = series[0];
              const delta = latest && first ? latest.value - first.value : null;
              return (
                <button key={g.id} className="rowitem" style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => setGoalOpen(g)}>
                  <span className="grow" style={{ minWidth: 0 }}>
                    <span className="t-sm t-bold truncate" style={{ display: 'block' }}>{g.title}</span>
                    <span className="t-xs t-muted">
                      {g.area}
                      {g.site && latest ? ` · ${g.site} ${latest.value}${latest.unit}` : ''}
                      {g.target ? ` · target ${g.target}${g.unit ?? ''}` : ''}
                      {g.plan ? ` · ${g.plan}` : ''}
                    </span>
                  </span>
                  {delta !== null && Math.abs(delta) > 0.01 && (
                    <span className={delta > 0 ? 't-sm t-good t-num' : 't-sm t-num t-muted'}>
                      {delta > 0 ? '+' : ''}{Math.round(delta * 10) / 10}{latest?.unit}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </section>

      <section className="card">
        <SectionHead
          title="Measurements"
          sub="Tape and scale, whenever you take them"
          action={<button className="btn btn-sm btn-accent" style={{ ['--mod' as string]: ACCENT }} onClick={() => setMeasuring(true)}>+ Log</button>}
        />
        {bySite.size === 0 ? (
          <EmptyState icon={Icons.ruler()} title="Nothing measured yet" hint="Two points a month is enough to see a direction." />
        ) : (
          <div className="grid grid-2" style={{ gap: 'var(--sp-4)' }}>
            {[...bySite.entries()].map(([site, list]) => {
              const latest = list.at(-1)!;
              const first = list[0];
              const delta = latest.value - first.value;
              return (
                <div key={site}>
                  <StatTile
                    label={site}
                    value={`${latest.value}${latest.unit}`}
                    caption={list.length > 1
                      ? `${delta > 0 ? '+' : ''}${Math.round(delta * 10) / 10}${latest.unit} since ${fmtDate(first.date)}`
                      : `logged ${fmtDate(latest.date)}`}
                    small
                  />
                  {list.length > 1 && (
                    <Sparkline
                      data={list.map((m) => ({ key: m.id, value: m.value, label: fmtDate(m.date) }))}
                      color={ACCENT}
                      height={38}
                      formatValue={(n) => `${n}${latest.unit}`}
                      ariaLabel={`${site} over time`}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="card">
        <SectionHead
          title="Add a daily habit"
          sub="Mobility only counts if it happens most days, so these are tracked in Habits, not here. Tap to add one — tap again to take it off."
        />
        <div className="row-2 wrap">
          {MOBILITY_HABITS.map((h) => {
            const on = existingHabits.has(h.title.toLowerCase());
            return (
              <button
                key={h.title}
                className={`chip mob-chip${on ? ' is-on' : ''}`}
                aria-pressed={on}
                onClick={() => toggleMobilityHabit(h)}
              >
                <span className="mob-mark" aria-hidden>{on ? Icons.check() : Icons.plus()}</span>
                <span className="mob-mark" aria-hidden>{Icons[h.icon]()}</span>
                {h.title}
              </button>
            );
          })}
        </div>
        <p className="t-xs t-muted" style={{ marginTop: 'var(--sp-3)' }}>
          Tracking is all this does. Persistent adhesions, disc pain or a posture problem that hurts is
          worth putting in front of a physio rather than an app.
        </p>
      </section>

      {goalOpen && (
        <GoalForm
          goal={goalOpen === 'new' ? null : goalOpen}
          sites={[...bySite.keys()]}
          onClose={() => setGoalOpen(null)}
          onDelete={goalOpen === 'new' ? undefined : () => {
            const id = (goalOpen as PhysiqueGoal).id;
            update((s) => ({ ...s, fitness: { ...s.fitness, physique: s.fitness.physique.filter((g) => g.id !== id) } }));
            setGoalOpen(null);
            toast('Goal removed');
          }}
          onSave={(g) => {
            update((s) => ({
              ...s,
              fitness: {
                ...s.fitness,
                physique: s.fitness.physique.some((x) => x.id === g.id)
                  ? s.fitness.physique.map((x) => (x.id === g.id ? g : x))
                  : [...s.fitness.physique, g],
              },
            }));
            setGoalOpen(null);
            toast('Goal saved');
          }}
        />
      )}

      {measuring && (
        <MeasureForm
          sites={[...new Set([...bySite.keys(), ...SITE_SUGGESTIONS])]}
          onClose={() => setMeasuring(false)}
          onSave={(m) => {
            update((s) => ({ ...s, fitness: { ...s.fitness, measurements: [...s.fitness.measurements, m] } }));
            setMeasuring(false);
            toast('Measurement logged');
          }}
        />
      )}
    </>
  );
}

function GoalForm({
  goal, sites, onClose, onSave, onDelete,
}: {
  goal: PhysiqueGoal | null;
  sites: string[];
  onClose: () => void;
  onSave: (g: PhysiqueGoal) => void;
  onDelete?: () => void;
}) {
  const [title, setTitle] = useState(goal?.title ?? '');
  const [area, setArea] = useState<PhysiqueArea>(goal?.area ?? 'Chest');
  const [site, setSite] = useState(goal?.site ?? '');
  const [target, setTarget] = useState(String(goal?.target ?? ''));
  const [unit, setUnit] = useState(goal?.unit ?? 'cm');
  const [plan, setPlan] = useState(goal?.plan ?? '');

  return (
    <Modal
      title={goal ? 'Edit physique goal' : 'New physique goal'}
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
              id: goal?.id ?? uid('phy'),
              title: title.trim(),
              area,
              site: site || undefined,
              target: target ? Number(target) : undefined,
              unit: target ? unit : undefined,
              plan: plan.trim() || undefined,
              done: goal?.done ?? false,
              createdAt: goal?.createdAt ?? todayKey(),
            })}
          >
            Save
          </button>
        </>
      }
    >
      <div className="stack-3">
        <DictateInput
          label="The goal"
          value={title}
          onChange={setTitle}
          placeholder="Wider back"
          suggestions={goal ? undefined : GOAL_SUGGESTIONS}
          autoFocus
        />
        <Field label="Area">
          <select className="select" value={area} onChange={(e) => setArea(e.target.value as PhysiqueArea)}>
            {PHYSIQUE_AREAS.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </Field>
        <Field label="Measurement to track it by" hint="Optional — a posture goal has no tape measure.">
          <select className="select" value={site} onChange={(e) => setSite(e.target.value)}>
            <option value="">None</option>
            {[...new Set([...sites, ...SITE_SUGGESTIONS])].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
        {site && (
          <div className="grid grid-2" style={{ gap: 'var(--sp-3)' }}>
            <Field label="Target"><input className="input" type="number" step="0.1" value={target} onChange={(e) => setTarget(e.target.value)} /></Field>
            <Field label="Unit"><input className="input" value={unit} onChange={(e) => setUnit(e.target.value)} /></Field>
          </div>
        )}
        <DictateInput label="How you get there" value={plan} onChange={setPlan} placeholder="Row volume up, two pull sessions a week" />
      </div>
    </Modal>
  );
}

function MeasureForm({
  sites, onClose, onSave,
}: {
  sites: string[];
  onClose: () => void;
  onSave: (m: Measurement) => void;
}) {
  const [site, setSite] = useState(sites[0] ?? 'Chest');
  const [value, setValue] = useState('');
  const [unit, setUnit] = useState('cm');
  const [date, setDate] = useState(todayKey());

  return (
    <Modal
      title="Log a measurement"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-accent"
            style={{ ['--mod' as string]: ACCENT }}
            disabled={!Number(value)}
            onClick={() => onSave({ id: uid('meas'), date, site, value: Number(value), unit })}
          >
            Log it
          </button>
        </>
      }
    >
      <div className="stack-3">
        <Field label="What">
          <select className="select" value={site} onChange={(e) => setSite(e.target.value)}>
            {sites.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
        <div className="grid grid-3 tight-mobile" style={{ gap: 'var(--sp-3)' }}>
          <Field label="Value"><input className="input" type="number" step="0.1" value={value} onChange={(e) => setValue(e.target.value)} autoFocus /></Field>
          <Field label="Unit"><input className="input" value={unit} onChange={(e) => setUnit(e.target.value)} /></Field>
          <Field label="Date"><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        </div>
      </div>
    </Modal>
  );
}
