import { useRef, useState } from 'react';
import { GOAL_KINDS, MODULES, type Goal, type GoalKind, type ModuleId } from '../lib/schema';
import { XP } from '../lib/gamification';
import { DEFAULT_UNIT, goalLines, goalProgress, goalProgressLabel, kindFields, resizeImage } from '../lib/goals';
import { todayKey } from '../lib/date';
import { uid } from '../lib/id';
import { useApp } from '../state/context';
import { goalStats } from '../state/selectors';
import { Modal } from '../components/ui/Modal';
import { EmptyState, Field, SectionHead } from '../components/ui/Field';

const ACCENT = 'var(--mod-goals)';

const KIND_HINT: Record<GoalKind, string> = {
  Purchase: 'Something you buy once — a car, a watch, a trip.',
  'Recurring cost': 'Something with a monthly price — an apartment, a gym, a lease.',
  Training: 'Something you train for over a number of weeks.',
  Custom: 'Anything else you want to count toward.',
};

export function Goals() {
  const { state, update, reward, toast } = useApp();
  const stats = goalStats(state);
  const [editing, setEditing] = useState<Goal | 'new' | null>(null);

  const save = (goal: Goal) => {
    update((s) => ({
      ...s,
      goals: {
        items: s.goals.items.some((g) => g.id === goal.id)
          ? s.goals.items.map((g) => (g.id === goal.id ? goal : g))
          : [...s.goals.items, goal],
      },
    }));
    setEditing(null);
    toast('Goal saved');
  };

  const finish = (goal: Goal) => {
    reward('goals', XP.goalDone, `Goal reached: ${goal.title}`, (s) => ({
      ...s,
      goals: { items: s.goals.items.map((g) => (g.id === goal.id ? { ...g, done: true } : g)) },
    }));
  };

  if (state.goals.items.length === 0) {
    return (
      <div className="stack">
        <EmptyState
          icon="🏁"
          title="No goals yet"
          hint="A picture, what it costs, and how you get there. That is the whole card."
        />
        <button className="btn btn-accent btn-lg" style={{ ['--mod' as string]: ACCENT }} onClick={() => setEditing('new')}>
          + Add your first goal
        </button>
        {editing && <GoalForm goal={null} onClose={() => setEditing(null)} onSave={save} />}
      </div>
    );
  }

  return (
    <div className="stack">
      <div className="goal-grid">
        {stats.open.map((g) => (
          <GoalCard key={g.id} goal={g} onEdit={() => setEditing(g)} onFinish={() => finish(g)} />
        ))}
      </div>

      <button className="btn btn-accent btn-lg btn-block" style={{ ['--mod' as string]: ACCENT }} onClick={() => setEditing('new')}>
        + Add a goal
      </button>

      {stats.done.length > 0 && (
        <section className="card">
          <SectionHead title="Done" sub={`${stats.done.length} crossed off`} />
          <div className="stack-2">
            {stats.done.map((g) => (
              <div key={g.id} className="rowitem rowitem-done">
                <span aria-hidden style={{ fontSize: 18 }}>{g.emoji}</span>
                <span className="rowitem-title grow t-sm">{g.title}</span>
                <button
                  className="link-btn"
                  onClick={() => update((s) => ({ ...s, goals: { items: s.goals.items.map((x) => (x.id === g.id ? { ...x, done: false } : x)) } }))}
                >
                  Reopen
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {editing && (
        <GoalForm
          goal={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onDelete={editing === 'new' ? undefined : () => {
            const id = (editing as Goal).id;
            update((s) => ({ ...s, goals: { items: s.goals.items.filter((g) => g.id !== id) } }));
            setEditing(null);
            toast('Goal removed');
          }}
          onSave={save}
        />
      )}
    </div>
  );
}

function GoalCard({ goal, onEdit, onFinish }: { goal: Goal; onEdit: () => void; onFinish: () => void }) {
  const { state } = useApp();
  const cur = state.settings.currency;
  const lines = goalLines(goal, cur);
  const progress = goalProgress(goal);
  const progressLabel = goalProgressLabel(goal, cur);
  const module = MODULES.find((m) => m.id === goal.module);

  return (
    <article className="goal" style={{ ['--mod' as string]: module?.color ?? ACCENT }}>
      <button className="goal-cover" onClick={onEdit} aria-label={`Edit ${goal.title}`}>
        {goal.image
          ? <img src={goal.image} alt="" />
          : <span className="goal-emoji" aria-hidden>{goal.emoji}</span>}
      </button>

      <div className="goal-body">
        <h3 className="goal-title">{goal.title}</h3>

        {lines.cost && (
          <p className="goal-line">
            <span className="goal-key">Expected cost</span>
            {lines.cost}
          </p>
        )}
        {lines.plan && (
          <p className="goal-line">
            <span className="goal-key">How to get there</span>
            {lines.plan}
          </p>
        )}

        {progress !== null && (
          <div className="goal-progress">
            <div className="goal-bar"><i style={{ width: `${progress * 100}%` }} /></div>
            <span className="t-xs t-muted t-num">{progressLabel}</span>
          </div>
        )}

        <div className="spread" style={{ marginTop: 'auto', paddingTop: 'var(--sp-2)' }}>
          <span className="t-xs t-muted">
            {module ? module.name : goal.kind}
            {lines.meta ? ` · ${lines.meta}` : ''}
          </span>
          <div className="row-2">
            <button className="btn btn-sm btn-ghost" onClick={onEdit}>Edit</button>
            <button className="btn btn-sm" onClick={onFinish}>Done</button>
          </div>
        </div>
      </div>
    </article>
  );
}

function GoalForm({
  goal, onClose, onSave, onDelete,
}: {
  goal: Goal | null;
  onClose: () => void;
  onSave: (g: Goal) => void;
  onDelete?: () => void;
}) {
  const [title, setTitle] = useState(goal?.title ?? '');
  const [kind, setKind] = useState<GoalKind>(goal?.kind ?? 'Purchase');
  const [emoji, setEmoji] = useState(goal?.emoji ?? '🏁');
  const [image, setImage] = useState(goal?.image);
  const [cost, setCost] = useState(String(goal?.cost ?? ''));
  const [monthly, setMonthly] = useState(String(goal?.monthly ?? ''));
  const [costNote, setCostNote] = useState(goal?.costNote ?? '');
  const [weeks, setWeeks] = useState(String(goal?.weeks ?? ''));
  const [current, setCurrent] = useState(String(goal?.current ?? ''));
  const [target, setTarget] = useState(String(goal?.target ?? ''));
  const [unit, setUnit] = useState(goal?.unit ?? DEFAULT_UNIT[goal?.kind ?? 'Purchase']);
  const [plan, setPlan] = useState(goal?.plan ?? '');
  const [module, setModule] = useState<ModuleId | ''>(goal?.module ?? '');
  const [due, setDue] = useState(goal?.due ?? '');
  const [imgError, setImgError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const fields = kindFields(kind);

  const pickKind = (k: GoalKind) => {
    setKind(k);
    if (!goal) setUnit(DEFAULT_UNIT[k]);
  };

  return (
    <Modal
      title={goal ? 'Edit goal' : 'New goal'}
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
              id: goal?.id ?? uid('goal'),
              title: title.trim(),
              kind,
              emoji: emoji.trim() || '🏁',
              image,
              cost: fields.cost && cost ? Number(cost) : undefined,
              monthly: fields.monthly && monthly ? Number(monthly) : undefined,
              costNote: costNote.trim() || undefined,
              weeks: fields.weeks && weeks ? Number(weeks) : undefined,
              current: current ? Number(current) : undefined,
              target: target ? Number(target) : undefined,
              unit: unit.trim() || undefined,
              plan: plan.trim() || undefined,
              module: module || undefined,
              due: due || undefined,
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
        <Field label="What is the goal">
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Own a used Tesla" autoFocus />
        </Field>

        <Field label="Kind" hint={KIND_HINT[kind]}>
          <div className="row-2 wrap">
            {GOAL_KINDS.map((k) => (
              <button key={k} type="button" className="chip" aria-pressed={kind === k} onClick={() => pickKind(k)}>{k}</button>
            ))}
          </div>
        </Field>

        <Field label="Picture" hint="An emoji, or a photo of the actual thing you want.">
          <div className="row-2 wrap">
            <input className="input" style={{ width: 64, textAlign: 'center' }} value={emoji} maxLength={2} onChange={(e) => setEmoji(e.target.value)} />
            <button className="btn btn-sm" onClick={() => fileRef.current?.click()}>{image ? 'Replace photo' : 'Add a photo'}</button>
            {image && <button className="btn btn-sm btn-ghost" onClick={() => setImage(undefined)}>Remove</button>}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setImgError(null);
                resizeImage(file).then(setImage).catch((err) => setImgError(err.message));
                e.target.value = '';
              }}
            />
          </div>
          {image && <img src={image} alt="" style={{ marginTop: 8, borderRadius: 'var(--r-md)', maxHeight: 120 }} />}
          {imgError && <span className="t-xs t-crit">{imgError}</span>}
        </Field>

        {(fields.cost || fields.monthly) && (
          <div className="grid grid-2" style={{ gap: 'var(--sp-3)' }}>
            {fields.cost && (
              <Field label={kind === 'Recurring cost' ? 'Up front' : 'Cash price'}>
                <input className="input" type="number" min={0} value={cost} onChange={(e) => setCost(e.target.value)} placeholder="24000" />
              </Field>
            )}
            {fields.monthly && (
              <Field label="Per month">
                <input className="input" type="number" min={0} value={monthly} onChange={(e) => setMonthly(e.target.value)} placeholder="400" />
              </Field>
            )}
          </div>
        )}

        {fields.weeks && (
          <Field label="Training window (weeks)">
            <input className="input" type="number" min={1} value={weeks} onChange={(e) => setWeeks(e.target.value)} placeholder="9" />
          </Field>
        )}

        <Field label="Anything else about the cost">
          <input className="input" value={costNote} onChange={(e) => setCostNote(e.target.value)} placeholder="or ~$3k down on a lease" />
        </Field>

        <Field label="How you get there" hint="The one line that says what has to change.">
          <input className="input" value={plan} onChange={(e) => setPlan(e.target.value)} placeholder="Make $400 more a month" />
        </Field>

        {fields.progress && (
          <div className="grid grid-3 tight-mobile" style={{ gap: 'var(--sp-3)' }}>
            <Field label="So far"><input className="input" type="number" value={current} onChange={(e) => setCurrent(e.target.value)} placeholder="6500" /></Field>
            <Field label="Out of"><input className="input" type="number" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="24000" /></Field>
            <Field label="Unit"><input className="input" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="$" /></Field>
          </div>
        )}

        <div className="grid grid-2" style={{ gap: 'var(--sp-3)' }}>
          <Field label="Module">
            <select className="select" value={module} onChange={(e) => setModule(e.target.value as ModuleId | '')}>
              <option value="">None</option>
              {MODULES.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </Field>
          <Field label="Target date">
            <input className="input" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </Field>
        </div>
      </div>
    </Modal>
  );
}
