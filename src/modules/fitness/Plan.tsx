import { useState } from 'react';
import { ACTIVITY_TYPES, type PlanItem } from '../../lib/schema';
import { PLAN_PRESETS, suggestions, weekPlan } from '../../lib/fitplan';
import { todayKey, weekStart } from '../../lib/date';
import { XP } from '../../lib/gamification';
import { uid } from '../../lib/id';
import { useApp } from '../../state/context';
import { Modal } from '../../components/ui/Modal';
import { Field, SectionHead } from '../../components/ui/Field';
import { Icons } from '../../components/layout/Icons';

const ACCENT = 'var(--mod-fitness)';

/** A sensible length for a session ticked off in one tap. Everything is
 *  editable afterwards; this is only so a tick does not have to ask. */
const PRESET_MINUTES: Record<string, number> = {
  Weightlifting: 60, MMA: 90, Calisthenics: 45, Run: 40, 'Long run': 100,
  Cycling: 60, Swim: 45, Yoga: 45, Basketball: 90,
};

export function Plan() {
  const { state, update, reward, toast } = useApp();
  const plan = weekPlan(state);
  const week = weekStart();
  const [adding, setAdding] = useState<PlanItem | 'new' | null>(null);

  const addItem = (activity: string, perWeek: number, locked: boolean) => {
    update((s) => ({
      ...s,
      fitness: {
        ...s.fitness,
        plan: [...s.fitness.plan, {
          id: uid('plan'), activity, perWeek, locked,
          week: locked ? undefined : week,
          createdAt: todayKey(),
        }],
      },
    }));
    toast(locked ? `${activity} locked in every week` : `${activity} added for this week`);
  };

  const save = (item: PlanItem) => {
    update((s) => ({
      ...s,
      fitness: {
        ...s.fitness,
        plan: s.fitness.plan.some((p) => p.id === item.id)
          ? s.fitness.plan.map((p) => (p.id === item.id ? item : p))
          : [...s.fitness.plan, item],
      },
    }));
    setAdding(null);
  };

  const remove = (id: string) => {
    update((s) => ({ ...s, fitness: { ...s.fitness, plan: s.fitness.plan.filter((p) => p.id !== id) } }));
    toast('Removed from the plan');
  };

  /** One tap = one session of this activity, logged today. */
  const tick = (activity: string) => {
    const done = state.fitness.activities.filter(
      (a) => weekStart(a.date) === week && a.type === activity,
    ).length;
    const target = state.fitness.targets.total;
    const totalNow = state.fitness.activities.filter((a) => weekStart(a.date) === week).length;
    const completesWeek = target > 0 && totalNow + 1 === target;

    reward(
      'fitness',
      XP.fitnessSession + (completesWeek ? XP.weeklyTargetHit : 0),
      completesWeek ? `Week complete — ${target} sessions` : `Logged ${activity}`,
      (s) => ({
        ...s,
        fitness: {
          ...s.fitness,
          activities: [...s.fitness.activities, {
            id: uid('act'),
            date: todayKey(),
            type: activity,
            minutes: PRESET_MINUTES[activity] ?? 60,
          }],
        },
      }),
    );
    toast(`${activity} ${done + 1} logged`);
  };

  /** Tapping a filled box takes the most recent one back. */
  const untick = (activity: string) => {
    const mine = state.fitness.activities
      .filter((a) => weekStart(a.date) === week && a.type === activity)
      .sort((a, b) => a.date.localeCompare(b.date));
    const last = mine[mine.length - 1];
    if (!last) return;
    update((s) => ({
      ...s,
      fitness: { ...s.fitness, activities: s.fitness.activities.filter((a) => a.id !== last.id) },
    }));
    toast(`${activity} unticked`);
  };

  const setTotal = (total: number) =>
    update((s) => ({ ...s, fitness: { ...s.fitness, targets: { ...s.fitness.targets, total } } }));

  if (state.fitness.plan.length === 0) {
    return (
      <section className="card" style={{ ['--mod' as string]: ACCENT }}>
        <SectionHead
          title="Build the week"
          sub="Start with what you know you're doing. Everything else fills in as you go."
        />
        <Field label="How many sessions a week?" hint="Anything that counts as training — a class, a lift, a run, a game of basketball.">
          <input
            className="input"
            style={{ maxWidth: 120 }}
            type="number"
            min={1}
            max={30}
            value={state.fitness.targets.total}
            onChange={(e) => setTotal(Math.max(1, Number(e.target.value) || 1))}
          />
        </Field>

        <p className="t-sm t-sec" style={{ margin: 'var(--sp-4) 0 var(--sp-2)' }}>
          Lock in the ones that happen every week:
        </p>
        <div className="row-2 wrap">
          {PLAN_PRESETS.map((p) => (
            <button key={p.activity} className="chip" onClick={() => addItem(p.activity, p.perWeek, true)}>
              + {p.activity} ×{p.perWeek}
            </button>
          ))}
          <button className="chip" onClick={() => setAdding('new')}>+ Something else</button>
        </div>

        {adding && <PlanForm item={null} onClose={() => setAdding(null)} onSave={save} />}
      </section>
    );
  }

  return (
    <>
      <section className="card" style={{ ['--mod' as string]: ACCENT }}>
        <SectionHead
          title="This week's plan"
          sub={plan.target
            ? `${plan.total} of ${plan.target} sessions logged`
            : `${plan.total} logged — set a weekly total below`}
          action={<button className="btn btn-sm" onClick={() => setAdding('new')}>+ Add</button>}
        />

        {/* Every planned session is a box you tick as you finish it. That was
            the whole point of a plan and it was missing: the only way to move
            a count was to open a form and fill it in, which nobody does with a
            gym bag in one hand. A tick logs a session of that activity today;
            tapping a filled one takes the last one back. */}
        <div className="ticks">
          {plan.rows.map((r) => (
            <div className={`tickrow${r.met ? ' is-met' : ''}`} key={r.item.id}>
              <button
                className="tickrow-name"
                onClick={() => setAdding(r.item)}
                title={r.item.locked ? 'Locked in every week — tap to edit' : 'This week only — tap to edit'}
              >
                {r.item.locked && <span className="plan-lock" aria-hidden>{Icons.lock()}</span>}
                {r.item.activity}
              </button>

              <div className="tickrow-boxes">
                {Array.from({ length: r.item.perWeek }, (_, i) => {
                  const done = i < r.done;
                  return (
                    <button
                      key={i}
                      className={`tick${done ? ' is-done' : ''}`}
                      aria-pressed={done}
                      aria-label={`${r.item.activity}, session ${i + 1} of ${r.item.perWeek}`}
                      onClick={() => (done ? untick(r.item.activity) : tick(r.item.activity))}
                    >
                      <span aria-hidden>{Icons.check()}</span>
                    </button>
                  );
                })}
              </div>

              <span className="tickrow-count t-num">{Math.min(r.done, r.item.perWeek)}/{r.item.perWeek}</span>
            </div>
          ))}

          {plan.open > 0 && (
            <div className="tickrow is-open">
              <span className="tickrow-name">Anything</span>
              <div className="tickrow-boxes">
                {Array.from({ length: plan.open }, (_, i) => (
                  <span key={i} className={`tick${i < plan.openFilled ? ' is-done' : ''}`} aria-hidden>
                    <span>{Icons.check()}</span>
                  </span>
                ))}
              </div>
              <span className="tickrow-count t-num">{Math.min(plan.openFilled, plan.open)}/{plan.open}</span>
            </div>
          )}
        </div>

        <p className="t-xs t-muted" style={{ marginTop: 'var(--sp-3)' }}>
          {plan.committed >= plan.target
            ? 'The plan accounts for the whole week.'
            : `${plan.open} slot${plan.open === 1 ? '' : 's'} left over each week for whatever you feel like. Locked lines carry over on Monday; anything you add for one week does not.`}
        </p>
      </section>

      {plan.open > plan.openFilled && (
        <section className="card">
          <SectionHead title="Ideas for the open slots" sub="One session each — nothing you have to keep doing" />
          <div className="stack-2">
            {suggestions(state).map((s) => (
              <div key={s.activity} className="rowitem">
                <span className="grow" style={{ minWidth: 0 }}>
                  <span className="t-sm t-bold" style={{ display: 'block' }}>{s.activity} once this week</span>
                  <span className="t-xs t-muted">{s.reason}</span>
                </span>
                <button className="btn btn-sm" onClick={() => addItem(s.activity, 1, false)}>Add</button>
                <button
                  className="btn btn-sm btn-ghost"
                  title="Do it every week"
                  onClick={() => addItem(s.activity, 1, true)}
                >
                  <span className="btn-glyph" aria-hidden>{Icons.lock()}</span>
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="card">
        <SectionHead title="Weekly total" />
        <Field label="Sessions a week" hint="Anything that counts as training. The plan above splits this up.">
          <input
            className="input"
            style={{ maxWidth: 120 }}
            type="number"
            min={1}
            max={30}
            value={state.fitness.targets.total}
            onChange={(e) => setTotal(Math.max(1, Number(e.target.value) || 1))}
          />
        </Field>
      </section>

      {adding && (
        <PlanForm
          item={adding === 'new' ? null : adding}
          onClose={() => setAdding(null)}
          onDelete={adding === 'new' ? undefined : () => { remove((adding as PlanItem).id); setAdding(null); }}
          onSave={save}
        />
      )}
    </>
  );
}

function PlanForm({
  item, onClose, onSave, onDelete,
}: {
  item: PlanItem | null;
  onClose: () => void;
  onSave: (p: PlanItem) => void;
  onDelete?: () => void;
}) {
  const [activity, setActivity] = useState(item?.activity ?? 'Weightlifting');
  const [custom, setCustom] = useState('');
  const [perWeek, setPerWeek] = useState(String(item?.perWeek ?? 1));
  const [locked, setLocked] = useState(item?.locked ?? true);

  const name = activity === 'Other' ? custom.trim() : activity;

  return (
    <Modal
      title={item ? 'Edit plan line' : 'Add to the plan'}
      onClose={onClose}
      footer={
        <>
          {onDelete && <button className="btn btn-danger" style={{ marginRight: 'auto' }} onClick={onDelete}>Remove</button>}
          <button className="btn" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-accent"
            style={{ ['--mod' as string]: ACCENT }}
            disabled={!name}
            onClick={() => onSave({
              id: item?.id ?? uid('plan'),
              activity: name,
              perWeek: Math.max(1, Number(perWeek) || 1),
              locked,
              week: locked ? undefined : weekStart(),
              createdAt: item?.createdAt ?? todayKey(),
            })}
          >
            Save
          </button>
        </>
      }
    >
      <div className="stack-3">
        <Field label="What">
          <div className="row-2 wrap">
            {ACTIVITY_TYPES.map((a) => (
              <button key={a.label} type="button" className="chip" aria-pressed={activity === a.label} onClick={() => setActivity(a.label)}>
                {a.label}
              </button>
            ))}
          </div>
        </Field>

        {activity === 'Other' && (
          <Field label="Name it">
            <input className="input" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Pickleball" autoFocus />
          </Field>
        )}

        <Field label="How many times a week">
          <input className="input" style={{ maxWidth: 110 }} type="number" min={1} max={14} value={perWeek} onChange={(e) => setPerWeek(e.target.value)} />
        </Field>

        <label className="row-2" style={{ cursor: 'pointer' }}>
          <input className="checkbox" type="checkbox" checked={locked} onChange={(e) => setLocked(e.target.checked)} />
          <span className="t-sm">Same every week — carry this over automatically</span>
        </label>
        <p className="t-xs t-muted">
          Leave it unticked for a one-off. It applies to this week and then clears itself.
        </p>
      </div>
    </Modal>
  );
}
