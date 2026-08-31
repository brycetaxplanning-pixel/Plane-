import { useState } from 'react';
import { useTabParam } from '../lib/router';
import { MEAL_SLOTS, type Meal, type MealSlot, type Vitals } from '../lib/schema';
import { XP } from '../lib/gamification';
import { fmtDate, fmtDateLong, todayKey } from '../lib/date';
import { uid } from '../lib/id';
import {
  averageLogged, calorieSeries, dayTotals, healthSummary, latest, proteinSeries,
  sleepSeries, weightChange, weightSeries,
} from '../lib/health';
import { useApp } from '../state/context';
import { Modal } from '../components/ui/Modal';
import { EmptyState, Field, SectionHead } from '../components/ui/Field';
import { DictateInput } from '../components/ui/Dictation';
import { BarChart } from '../components/charts/BarChart';
import { Sparkline } from '../components/charts/Sparkline';
import { StatTile } from '../components/charts/StatTile';
import { Ring } from '../components/charts/Ring';
import { Bloodwork } from './health/Bloodwork';

const ACCENT = 'var(--mod-health)';

/** Fourteen dates do not fit across a phone as "Aug 31", and the month is the
 *  same for most of them anyway. The hover readout still carries the full one. */
const dayLabel = (key: string): string => String(Number(key.slice(-2)));

export function Health() {
  const { state } = useApp();
  const [tab, setTab] = useTabParam(['today', 'body', 'blood'] as const, 'today');
  const h = healthSummary(state);

  return (
    <div className="stack">
      <div className="tabs" role="tablist">
        <button className="tab" role="tab" aria-selected={tab === 'today'} onClick={() => setTab('today')}>Today</button>
        <button className="tab" role="tab" aria-selected={tab === 'body'} onClick={() => setTab('body')}>Body</button>
        <button className="tab" role="tab" aria-selected={tab === 'blood'} onClick={() => setTab('blood')}>
          Bloodwork{h.flaggedCount ? ` (${h.flaggedCount})` : ''}
        </button>
      </div>

      {tab === 'today' && <Today />}
      {tab === 'body' && <Body />}
      {tab === 'blood' && <Bloodwork />}
    </div>
  );
}

/* ---------------- today ---------------- */

function Today() {
  const { state, update, reward, toast } = useApp();
  const [logging, setLogging] = useState<Meal | 'new' | null>(null);
  const [targetsOpen, setTargetsOpen] = useState(false);
  const meals = state.health.meals;
  const targets = state.health.targets;
  const today = dayTotals(meals);
  const todays = meals.filter((m) => m.date === todayKey());

  const protein = proteinSeries(meals);
  const calories = calorieSeries(meals);
  const proteinAvg = averageLogged(protein);

  const saveMeal = (m: Meal) => {
    const isNew = !meals.some((x) => x.id === m.id);
    const apply = (s: typeof state) => ({
      ...s,
      health: {
        ...s.health,
        meals: isNew ? [...s.health.meals, m] : s.health.meals.map((x) => (x.id === m.id ? m : x)),
      },
    });
    if (isNew) reward('health', XP.meal, `Logged ${m.name}`, apply);
    else {
      update(apply);
      toast('Meal updated');
    }
    setLogging(null);
  };

  const removeMeal = (id: string) => {
    update((s) => ({ ...s, health: { ...s.health, meals: s.health.meals.filter((m) => m.id !== id) } }));
    setLogging(null);
    toast('Meal removed');
  };

  return (
    <>
      <section className="card" style={{ ['--mod' as string]: ACCENT }}>
        <SectionHead
          title="Today"
          sub={fmtDateLong(todayKey())}
          action={<button className="btn btn-sm" onClick={() => setTargetsOpen(true)}>Targets</button>}
        />
        <div className="hero-split">
          <div className="hero-figure">
            <Ring
              value={targets.protein ? today.protein / targets.protein : 0}
              color={ACCENT}
              size={104}
              stroke={9}
              label={`${Math.round(today.protein)}`}
              caption={targets.protein ? `of ${targets.protein}g` : 'g protein'}
            />
          </div>
          <div className="hero-body stack-2">
            <StatTile
              label="Calories"
              value={today.calories ? Math.round(today.calories).toLocaleString() : '—'}
              caption={targets.calories ? `of ${targets.calories.toLocaleString()} logged` : 'no target set'}
            />
            <button
              className="btn btn-accent btn-lg btn-block"
              style={{ ['--mod' as string]: ACCENT }}
              onClick={() => setLogging('new')}
            >
              + Log food
            </button>
          </div>
        </div>
      </section>

      <section className="card">
        <SectionHead
          title="Logged today"
          sub={`${todays.length} item${todays.length === 1 ? '' : 's'}`}
        />
        {todays.length === 0 ? (
          <EmptyState icon="🍽️" title="Nothing logged yet today" hint="Name it and put in what you know — a meal with only the protein filled in still counts." />
        ) : (
          <div className="stack-2">
            {MEAL_SLOTS.filter((slot) => todays.some((m) => m.slot === slot)).map((slot) => (
              <div key={slot}>
                <p className="viz-sub" style={{ margin: '0 0 4px' }}>{slot}</p>
                {todays.filter((m) => m.slot === slot).map((m) => (
                  <button key={m.id} className="rowitem" style={{ textAlign: 'left', cursor: 'pointer', width: '100%' }} onClick={() => setLogging(m)}>
                    <span className="grow" style={{ minWidth: 0 }}>
                      <span className="t-sm t-bold truncate" style={{ display: 'block' }}>{m.name}</span>
                      <span className="t-xs t-muted">
                        {[
                          m.calories ? `${Math.round(m.calories)} kcal` : null,
                          m.protein ? `${Math.round(m.protein)}g protein` : null,
                          m.carbs ? `${Math.round(m.carbs)}g carbs` : null,
                          m.fat ? `${Math.round(m.fat)}g fat` : null,
                        ].filter(Boolean).join(' · ') || 'no numbers entered'}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card">
        <SectionHead
          title="Protein, last 14 days"
          sub={proteinAvg.days ? `${Math.round(proteinAvg.avg)}g average across the ${proteinAvg.days} days you logged` : 'nothing logged yet'}
        />
        <BarChart
          data={protein.map((d) => ({ key: d.key, value: d.value, label: dayLabel(d.key) }))}
          color={ACCENT}
          target={targets.protein}
          targetLabel={targets.protein ? `Target (${targets.protein}g)` : undefined}
          highlightKey={todayKey()}
          ariaLabel="Protein logged each day for the last fourteen days against the daily target"
        />
      </section>

      {targets.calories !== undefined && (
        <section className="card">
          <SectionHead title="Calories, last 14 days" sub={`Target is ${targets.calories.toLocaleString()} a day`} />
          <BarChart
            data={calories.map((d) => ({ key: d.key, value: d.value, label: dayLabel(d.key) }))}
            color={ACCENT}
            target={targets.calories}
            targetLabel={`Target (${targets.calories.toLocaleString()})`}
            highlightKey={todayKey()}
            ariaLabel="Calories logged each day for the last fourteen days against the daily target"
          />
        </section>
      )}

      {logging && (
        <MealForm
          meal={logging === 'new' ? null : logging}
          onClose={() => setLogging(null)}
          onSave={saveMeal}
          onDelete={logging === 'new' ? undefined : () => removeMeal((logging as Meal).id)}
        />
      )}

      {targetsOpen && <TargetsForm onClose={() => setTargetsOpen(false)} />}
    </>
  );
}

const MEAL_SUGGESTIONS: Record<MealSlot, string[]> = {
  Breakfast: ['Eggs and oats', 'Protein shake', 'Greek yoghurt and berries'],
  Lunch: ['Chicken and rice', 'Steak salad', 'Leftovers'],
  Dinner: ['Steak and potatoes', 'Salmon and greens', 'Ground beef and pasta'],
  Snack: ['Protein bar', 'Cottage cheese', 'Handful of nuts'],
};

function MealForm({
  meal, onClose, onSave, onDelete,
}: {
  meal: Meal | null;
  onClose: () => void;
  onSave: (m: Meal) => void;
  onDelete?: () => void;
}) {
  const [slot, setSlot] = useState<MealSlot>(meal?.slot ?? guessSlot());
  const [name, setName] = useState(meal?.name ?? '');
  const [calories, setCalories] = useState(meal?.calories !== undefined ? String(meal.calories) : '');
  const [protein, setProtein] = useState(meal?.protein !== undefined ? String(meal.protein) : '');
  const [carbs, setCarbs] = useState(meal?.carbs !== undefined ? String(meal.carbs) : '');
  const [fat, setFat] = useState(meal?.fat !== undefined ? String(meal.fat) : '');

  const num = (v: string) => (v.trim() === '' ? undefined : Number(v) || 0);

  return (
    <Modal
      title={meal ? 'Edit food' : 'Log food'}
      onClose={onClose}
      footer={
        <>
          {onDelete && <button className="btn btn-ghost" onClick={onDelete}>Delete</button>}
          <span className="grow" />
          <button className="btn" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-accent"
            style={{ ['--mod' as string]: ACCENT }}
            disabled={!name.trim()}
            onClick={() =>
              onSave({
                id: meal?.id ?? uid('meal'),
                date: meal?.date ?? todayKey(),
                slot,
                name: name.trim(),
                calories: num(calories),
                protein: num(protein),
                carbs: num(carbs),
                fat: num(fat),
              })
            }
          >
            Save
          </button>
        </>
      }
    >
      <div className="stack-2">
        <div className="pillbar">
          {MEAL_SLOTS.map((s) => (
            <button key={s} className={`chip${slot === s ? ' is-on' : ''}`} onClick={() => setSlot(s)}>{s}</button>
          ))}
        </div>

        <DictateInput
          label="What was it"
          value={name}
          onChange={setName}
          placeholder="Steak and rice"
          suggestions={MEAL_SUGGESTIONS[slot]}
          autoFocus={!meal}
        />

        <div className="grid grid-2" style={{ gap: 'var(--sp-3)' }}>
          <Field label="Protein (g)"><input className="input" inputMode="decimal" value={protein} onChange={(e) => setProtein(e.target.value)} placeholder="—" /></Field>
          <Field label="Calories"><input className="input" inputMode="decimal" value={calories} onChange={(e) => setCalories(e.target.value)} placeholder="—" /></Field>
          <Field label="Carbs (g)"><input className="input" inputMode="decimal" value={carbs} onChange={(e) => setCarbs(e.target.value)} placeholder="—" /></Field>
          <Field label="Fat (g)"><input className="input" inputMode="decimal" value={fat} onChange={(e) => setFat(e.target.value)} placeholder="—" /></Field>
        </div>
        <p className="t-xs t-muted">
          Leave anything you do not know empty. A blank field stays blank — it is never counted as a zero you did not enter.
        </p>
      </div>
    </Modal>
  );
}

function guessSlot(): MealSlot {
  const h = new Date().getHours();
  if (h < 11) return 'Breakfast';
  if (h < 16) return 'Lunch';
  if (h < 21) return 'Dinner';
  return 'Snack';
}

function TargetsForm({ onClose }: { onClose: () => void }) {
  const { state, update, toast } = useApp();
  const t = state.health.targets;
  const [protein, setProtein] = useState(t.protein !== undefined ? String(t.protein) : '');
  const [calories, setCalories] = useState(t.calories !== undefined ? String(t.calories) : '');
  const [sleepHours, setSleep] = useState(t.sleepHours !== undefined ? String(t.sleepHours) : '');
  const [weight, setWeight] = useState(t.weight !== undefined ? String(t.weight) : '');
  const [unit, setUnit] = useState(state.health.weightUnit);

  const num = (v: string) => (v.trim() === '' ? undefined : Number(v) || 0);

  return (
    <Modal
      title="Targets"
      onClose={onClose}
      footer={
        <>
          <span className="grow" />
          <button className="btn" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-accent"
            style={{ ['--mod' as string]: ACCENT }}
            onClick={() => {
              update((s) => ({
                ...s,
                health: {
                  ...s.health,
                  weightUnit: unit,
                  targets: {
                    protein: num(protein), calories: num(calories),
                    sleepHours: num(sleepHours), weight: num(weight),
                  },
                },
              }));
              toast('Targets saved');
              onClose();
            }}
          >
            Save
          </button>
        </>
      }
    >
      <div className="stack-2">
        <Field label="Protein a day (g)" hint="Leave empty for no target — the ring then just counts what you logged.">
          <input className="input" inputMode="decimal" value={protein} onChange={(e) => setProtein(e.target.value)} placeholder="—" />
        </Field>
        <Field label="Calories a day"><input className="input" inputMode="decimal" value={calories} onChange={(e) => setCalories(e.target.value)} placeholder="—" /></Field>
        <Field label="Sleep a night (hours)"><input className="input" inputMode="decimal" value={sleepHours} onChange={(e) => setSleep(e.target.value)} placeholder="—" /></Field>
        <Field label={`Goal weight (${unit})`}><input className="input" inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="—" /></Field>
        <Field label="Weigh in" hint="Nothing is converted — readings are stored exactly as you type them, so switching later relabels rather than recalculates.">
          <div className="pillbar">
            {(['lb', 'kg'] as const).map((u) => (
              <button key={u} className={`chip${unit === u ? ' is-on' : ''}`} onClick={() => setUnit(u)}>{u}</button>
            ))}
          </div>
        </Field>
      </div>
    </Modal>
  );
}

/* ---------------- body ---------------- */

function Body() {
  const { state, update, reward, toast } = useApp();
  const [logging, setLogging] = useState<Vitals | 'new' | null>(null);
  const vitals = state.health.vitals;
  const unit = state.health.weightUnit;
  const targets = state.health.targets;

  const weights = weightSeries(vitals);
  const change = weightChange(vitals);
  const sleep = sleepSeries(vitals);
  const sleepAvg = averageLogged(sleep);
  const bp = latest(vitals, 'systolic');
  const hr = latest(vitals, 'restingHr');

  const saveVitals = (v: Vitals) => {
    const isNew = !vitals.some((x) => x.id === v.id);
    const apply = (s: typeof state) => ({
      ...s,
      health: {
        ...s.health,
        vitals: isNew ? [...s.health.vitals, v] : s.health.vitals.map((x) => (x.id === v.id ? v : x)),
      },
    });
    if (isNew) reward('health', XP.vitals, 'Logged a weigh-in', apply);
    else {
      update(apply);
      toast('Reading updated');
    }
    setLogging(null);
  };

  return (
    <>
      <section className="card" style={{ ['--mod' as string]: ACCENT }}>
        <SectionHead
          title="Where you are"
          sub={weights.length ? `Last weighed ${fmtDateLong(weights[weights.length - 1].key)}` : 'Nothing recorded yet'}
          action={<button className="btn btn-sm" onClick={() => setLogging('new')}>+ Reading</button>}
        />
        <div className="grid grid-3" style={{ gap: 'var(--sp-3)' }}>
          <StatTile
            label="Weight"
            value={weights.length ? `${weights[weights.length - 1].value} ${unit}` : '—'}
            caption={
              change
                ? `${change.delta > 0 ? '+' : ''}${change.delta.toFixed(1)} ${unit} over the last month`
                : weights.length === 1 ? 'one reading — no trend yet' : 'not recorded'
            }
          />
          <StatTile
            label="Resting heart rate"
            value={hr?.restingHr !== undefined ? `${hr.restingHr}` : '—'}
            caption={hr ? `bpm, ${fmtDate(hr.date)}` : 'not recorded'}
          />
          <StatTile
            label="Blood pressure"
            value={bp?.systolic !== undefined && bp.diastolic !== undefined ? `${bp.systolic}/${bp.diastolic}` : '—'}
            caption={bp ? fmtDate(bp.date) : 'not recorded'}
          />
        </div>
        {targets.weight !== undefined && weights.length > 0 && (
          <p className="t-sm t-sec" style={{ marginTop: 'var(--sp-3)' }}>
            {Math.abs(weights[weights.length - 1].value - targets.weight).toFixed(1)} {unit}{' '}
            {weights[weights.length - 1].value > targets.weight ? 'above' : 'below'} your goal of {targets.weight} {unit}.
          </p>
        )}
      </section>

      {weights.length >= 2 && (
        <section className="card">
          <SectionHead title="Weight over time" sub={`${weights.length} readings`} />
          <Sparkline
            data={weights.map((w) => ({ key: w.key, value: w.value }))}
            color={ACCENT}
            ariaLabel="Weight at each weigh-in, oldest first"
          />
        </section>
      )}

      <section className="card">
        <SectionHead
          title="Sleep, last 14 nights"
          sub={sleepAvg.days ? `${sleepAvg.avg.toFixed(1)}h average across the ${sleepAvg.days} nights you logged` : 'nothing logged yet'}
        />
        <BarChart
          data={sleep.map((d) => ({ key: d.key, value: d.value, label: dayLabel(d.key) }))}
          color={ACCENT}
          target={targets.sleepHours}
          targetLabel={targets.sleepHours ? `Target (${targets.sleepHours}h)` : undefined}
          highlightKey={todayKey()}
          ariaLabel="Hours slept each night for the last fourteen nights against the target"
        />
      </section>

      {vitals.length > 0 && (
        <section className="card">
          <SectionHead title="Every reading" sub={`${vitals.length} logged`} />
          <div className="stack-2">
            {[...vitals].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 12).map((v) => (
              <button key={v.id} className="rowitem" style={{ textAlign: 'left', cursor: 'pointer', width: '100%' }} onClick={() => setLogging(v)}>
                <span className="grow" style={{ minWidth: 0 }}>
                  <span className="t-sm t-bold" style={{ display: 'block' }}>{fmtDateLong(v.date)}</span>
                  <span className="t-xs t-muted">
                    {[
                      v.weight !== undefined ? `${v.weight} ${unit}` : null,
                      v.restingHr !== undefined ? `${v.restingHr} bpm` : null,
                      v.systolic !== undefined && v.diastolic !== undefined ? `${v.systolic}/${v.diastolic}` : null,
                      v.sleepHours !== undefined ? `${v.sleepHours}h sleep` : null,
                    ].filter(Boolean).join(' · ') || 'notes only'}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {logging && (
        <VitalsForm
          vitals={logging === 'new' ? null : logging}
          unit={unit}
          onClose={() => setLogging(null)}
          onSave={saveVitals}
          onDelete={
            logging === 'new'
              ? undefined
              : () => {
                  const id = (logging as Vitals).id;
                  update((s) => ({ ...s, health: { ...s.health, vitals: s.health.vitals.filter((x) => x.id !== id) } }));
                  setLogging(null);
                  toast('Reading removed');
                }
          }
        />
      )}
    </>
  );
}

function VitalsForm({
  vitals, unit, onClose, onSave, onDelete,
}: {
  vitals: Vitals | null;
  unit: 'lb' | 'kg';
  onClose: () => void;
  onSave: (v: Vitals) => void;
  onDelete?: () => void;
}) {
  const [date, setDate] = useState(vitals?.date ?? todayKey());
  const [weight, setWeight] = useState(vitals?.weight !== undefined ? String(vitals.weight) : '');
  const [hr, setHr] = useState(vitals?.restingHr !== undefined ? String(vitals.restingHr) : '');
  const [sys, setSys] = useState(vitals?.systolic !== undefined ? String(vitals.systolic) : '');
  const [dia, setDia] = useState(vitals?.diastolic !== undefined ? String(vitals.diastolic) : '');
  const [sleep, setSleep] = useState(vitals?.sleepHours !== undefined ? String(vitals.sleepHours) : '');
  const [notes, setNotes] = useState(vitals?.notes ?? '');

  const num = (v: string) => (v.trim() === '' ? undefined : Number(v) || 0);
  const empty = [weight, hr, sys, dia, sleep].every((v) => v.trim() === '') && !notes.trim();

  return (
    <Modal
      title={vitals ? 'Edit reading' : 'New reading'}
      onClose={onClose}
      footer={
        <>
          {onDelete && <button className="btn btn-ghost" onClick={onDelete}>Delete</button>}
          <span className="grow" />
          <button className="btn" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-accent"
            style={{ ['--mod' as string]: ACCENT }}
            disabled={empty}
            onClick={() =>
              onSave({
                id: vitals?.id ?? uid('vit'),
                date,
                weight: num(weight),
                restingHr: num(hr),
                systolic: num(sys),
                diastolic: num(dia),
                sleepHours: num(sleep),
                notes: notes.trim() || undefined,
              })
            }
          >
            Save
          </button>
        </>
      }
    >
      <div className="stack-2">
        <Field label="Date"><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <div className="grid grid-2" style={{ gap: 'var(--sp-3)' }}>
          <Field label={`Weight (${unit})`}><input className="input" inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="—" /></Field>
          <Field label="Sleep (hours)"><input className="input" inputMode="decimal" value={sleep} onChange={(e) => setSleep(e.target.value)} placeholder="—" /></Field>
          <Field label="Resting HR (bpm)"><input className="input" inputMode="decimal" value={hr} onChange={(e) => setHr(e.target.value)} placeholder="—" /></Field>
          <Field label="Blood pressure">
            <div className="row-2">
              <input className="input" inputMode="decimal" value={sys} onChange={(e) => setSys(e.target.value)} placeholder="sys" aria-label="Systolic" />
              <input className="input" inputMode="decimal" value={dia} onChange={(e) => setDia(e.target.value)} placeholder="dia" aria-label="Diastolic" />
            </div>
          </Field>
        </div>
        <DictateInput label="Notes" value={notes} onChange={setNotes} placeholder="Anything worth remembering" textarea rows={2} />
        <p className="t-xs t-muted">Fill in only what you measured. Empty fields are left empty, not stored as zero.</p>
      </div>
    </Modal>
  );
}
