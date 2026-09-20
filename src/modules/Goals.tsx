import { useEffect, useRef, useState } from 'react';
import { MODULES, type Goal, type GoalKind, type ModuleId } from '../lib/schema';
import { XP } from '../lib/gamification';
import { DEFAULT_UNIT, KIND_SHAPE, goalLines, goalProgress, goalProgressLabel, resizeImage } from '../lib/goals';
import { todayKey } from '../lib/date';
import { uid } from '../lib/id';
import { deleteImage, getImage, putImage } from '../lib/images';
import { useApp } from '../state/context';
import { goalStats } from '../state/selectors';
import { Modal } from '../components/ui/Modal';
import { EmptyState, Field, SectionHead } from '../components/ui/Field';
import { Icons, type IconName } from '../components/layout/Icons';
import { MarkPicker } from '../components/ui/MarkPicker';

const ACCENT = 'var(--mod-goals)';

const KIND_HINT: Record<GoalKind, string> = {
  Custom: 'Anything you want to count toward. Pick another only if it is really about money or a training block.',
  Purchase: 'Something you buy once — a car, a watch, a trip.',
  'Recurring cost': 'Something with a monthly price — an apartment, a gym, a lease.',
  Training: 'Something you train for over a number of weeks.',
};

/* Custom first, and first is the default. Most things worth wanting are not a
   car, and opening on Purchase meant every goal started by being asked what it
   cost. */
const KIND_ORDER: GoalKind[] = ['Custom', 'Purchase', 'Recurring cost', 'Training'];

export function Goals() {
  const { state, update, reward, toast } = useApp();
  const stats = goalStats(state);
  const [editing, setEditing] = useState<Goal | 'new' | null>(null);

  const save = async (goal: Goal) => {
    // The form hands back the photo inline; it is moved into the image store
    // here, by the same path an import takes, so the state blob never carries
    // a data URL.
    let next = goal;
    if (goal.image) {
      try {
        const id = await putImage(goal.image, goal.imageId);
        next = { ...goal, imageId: id, image: undefined };
      } catch {
        // No IndexedDB: keep it inline rather than lose the picture.
      }
    }

    const previous = state.goals.items.find((g) => g.id === goal.id);
    if (previous?.imageId && previous.imageId !== next.imageId) await deleteImage(previous.imageId);

    update((s) => ({
      ...s,
      goals: {
        ...s.goals,
        items: s.goals.items.some((g) => g.id === next.id)
          ? s.goals.items.map((g) => (g.id === next.id ? next : g))
          : [...s.goals.items, next],
      },
    }));
    setEditing(null);
    toast('Goal saved');
  };

  const finish = (goal: Goal) => {
    reward('goals', XP.goalDone, `Goal reached: ${goal.title}`, (s) => ({
      ...s,
      goals: { ...s.goals, items: s.goals.items.map((g) => (g.id === goal.id ? { ...g, done: true } : g)) },
    }));
  };

  if (state.goals.items.length === 0) {
    return (
      <div className="stack">
        <EmptyState
          icon={Icons.flag()}
          title="No goals yet"
          hint="A picture, what it costs, and how you get there. That is the whole card."
        />
        <button className="btn btn-accent btn-lg" style={{ ['--mod' as string]: ACCENT }} onClick={() => setEditing('new')}>
          + Add your first goal
        </button>
        {editing && <GoalForm goal={null} onClose={() => setEditing(null)} onSave={(g) => void save(g)} />}
      </div>
    );
  }

  return (
    <div className="stack">
      {/* Above the grid, not under it. Opening a module to put something down
          should not mean scrolling past everything already in it. */}
      <div className="cardtools">
        <span />
        <button className="cardtool" onClick={() => setEditing('new')} aria-label="Add a goal">
          <span aria-hidden>{Icons.plus()}</span>
        </button>
      </div>

      <div className="goal-grid">
        {stats.open.map((g) => (
          <GoalCard key={g.id} goal={g} onEdit={() => setEditing(g)} onFinish={() => finish(g)} />
        ))}
      </div>

      {stats.done.length > 0 && (
        <section className="card">
          <SectionHead title="Done" sub={`${stats.done.length} crossed off`} />
          <div className="stack-2">
            {stats.done.map((g) => (
              <div key={g.id} className="rowitem rowitem-done">
                <span className="goal-mark" aria-hidden>{Icons[g.icon ?? 'flag']()}</span>
                <span className="rowitem-title grow t-sm">{g.title}</span>
                <button
                  className="link-btn"
                  onClick={() => update((s) => ({ ...s, goals: { ...s.goals, items: s.goals.items.map((x) => (x.id === g.id ? { ...x, done: false } : x)) } }))}
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
            const gone = editing as Goal;
            // The photo goes with it; nothing else refers to it.
            if (gone.imageId) void deleteImage(gone.imageId);
            update((s) => ({ ...s, goals: { ...s.goals, items: s.goals.items.filter((g) => g.id !== gone.id) } }));
            setEditing(null);
            toast('Goal removed');
          }}
          onSave={(g) => void save(g)}
        />
      )}
    </div>
  );
}


/** Resolves a goal's photo out of the image store, falling back to the emoji —
 *  while it loads, and for good if it has gone missing. */
function GoalPhoto({ goal }: { goal: Goal }) {
  const src = useGoalImage(goal);
  return src
    ? <img src={src} alt="" />
    : <span className="goal-emoji" aria-hidden>{Icons[goal.icon ?? 'flag']()}</span>;
}

/** `image` is checked first so a state that has not been lifted yet — an import
 *  mid-flight, or a browser with no IndexedDB — still shows the picture. */
function useGoalImage(goal: Goal): string | undefined {
  const [src, setSrc] = useState<string | undefined>(goal.image);

  useEffect(() => {
    if (goal.image) { setSrc(goal.image); return; }
    if (!goal.imageId) { setSrc(undefined); return; }
    let live = true;
    void getImage(goal.imageId).then((d) => { if (live) setSrc(d ?? undefined); });
    return () => { live = false; };
  }, [goal.image, goal.imageId]);

  return src;
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
        <GoalPhoto goal={goal} />
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
        {lines.notes && (
          <p className="goal-line goal-notes">
            <span className="goal-key">Notes</span>
            {lines.notes}
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
  onSave: (g: Goal) => void | Promise<void>;
  onDelete?: () => void;
}) {
  const [title, setTitle] = useState(goal?.title ?? '');
  const [kind, setKind] = useState<GoalKind>(goal?.kind ?? 'Custom');
  const [icon, setIcon] = useState<IconName | undefined>(goal?.icon);
  // Seeded from the store when the goal already has a photo. It is handed back
  // inline on save and moved out again by the caller.
  const [image, setImage] = useState(goal?.image);
  useEffect(() => {
    if (goal?.image || !goal?.imageId) return;
    let live = true;
    void getImage(goal.imageId).then((d) => { if (live && d) setImage(d); });
    return () => { live = false; };
  }, [goal?.image, goal?.imageId]);
  const [cost, setCost] = useState(String(goal?.cost ?? ''));
  const [monthly, setMonthly] = useState(String(goal?.monthly ?? ''));
  const [costNote, setCostNote] = useState(goal?.costNote ?? '');
  const [weeks, setWeeks] = useState(String(goal?.weeks ?? ''));
  const [current, setCurrent] = useState(String(goal?.current ?? ''));
  const [target, setTarget] = useState(String(goal?.target ?? ''));
  const [unit, setUnit] = useState(goal?.unit ?? DEFAULT_UNIT[goal?.kind ?? 'Custom']);
  const [notes, setNotes] = useState(goal?.notes ?? '');
  const [plan, setPlan] = useState(goal?.plan ?? '');
  const [module, setModule] = useState<ModuleId | ''>(goal?.module ?? '');
  const [due, setDue] = useState(goal?.due ?? '');
  const [imgError, setImgError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const shape = KIND_SHAPE[kind];

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
              icon,
              image,
              imageId: image ? goal?.imageId : undefined,
              cost: shape.cost && cost ? Number(cost) : undefined,
              monthly: shape.monthly && monthly ? Number(monthly) : undefined,
              costNote: shape.costNote ? costNote.trim() || undefined : undefined,
              weeks: shape.weeks && weeks ? Number(weeks) : undefined,
              current: current ? Number(current) : undefined,
              target: target ? Number(target) : undefined,
              unit: unit.trim() || undefined,
              plan: plan.trim() || undefined,
              notes: notes.trim() || undefined,
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
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={shape.title} autoFocus />
        </Field>

        <Field label="Kind" hint={KIND_HINT[kind]}>
          <div className="row-2 wrap">
            {KIND_ORDER.map((k) => (
              <button key={k} type="button" className="chip" aria-pressed={kind === k} onClick={() => pickKind(k)}>{k}</button>
            ))}
          </div>
        </Field>

        <Field label="Picture" hint="A photo of the actual thing you want beats any mark — use one if you have it.">
          <div className="row-2 wrap">
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

        {!image && <MarkPicker value={icon} onChange={setIcon} label="Or pick a mark" />}

        {(shape.cost || shape.monthly) && (
          <div className="grid grid-2" style={{ gap: 'var(--sp-3)' }}>
            {shape.cost && (
              <Field label={shape.costLabel}>
                <input className="input" type="number" min={0} value={cost} onChange={(e) => setCost(e.target.value)} placeholder={shape.costHint} />
              </Field>
            )}
            {shape.monthly && (
              <Field label={shape.monthlyLabel}>
                <input className="input" type="number" min={0} value={monthly} onChange={(e) => setMonthly(e.target.value)} placeholder={shape.monthlyHint} />
              </Field>
            )}
          </div>
        )}

        {shape.weeks && (
          <Field label="Training window (weeks)">
            <input className="input" type="number" min={1} value={weeks} onChange={(e) => setWeeks(e.target.value)} placeholder="9" />
          </Field>
        )}

        {/* Only where there is a cost to say anything else about. It used to
            show on every kind, so a goal about posting on Instagram asked what
            else there was to know about its price. */}
        {shape.costNote && (
          <Field label="Anything else about the cost">
            <input className="input" value={costNote} onChange={(e) => setCostNote(e.target.value)} placeholder="or ~$3k down on a lease" />
          </Field>
        )}

        <Field label={shape.planLabel} hint="The one line that says what has to change.">
          <input className="input" value={plan} onChange={(e) => setPlan(e.target.value)} placeholder={shape.planHint} />
        </Field>

        {shape.progress && (
          <Field label={shape.progressLabel} hint="Optional. Fill these in and the card grows a bar.">
            <div className="grid grid-3 tight-mobile" style={{ gap: 'var(--sp-3)' }}>
              <Field label="So far"><input className="input" type="number" value={current} onChange={(e) => setCurrent(e.target.value)} placeholder={shape.currentHint} /></Field>
              <Field label="Out of"><input className="input" type="number" value={target} onChange={(e) => setTarget(e.target.value)} placeholder={shape.targetHint} /></Field>
              <Field label="Unit"><input className="input" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder={shape.unitHint} /></Field>
            </div>
          </Field>
        )}

        {/* The field the record always had and the form never asked for. It is
            where everything that is not a number goes — the ideas, the reasons,
            the things you want in front of you when you open this again. */}
        <Field label="Notes" hint="Anything you want to remember with it.">
          <textarea
            className="input"
            rows={4}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Content ideas, who to talk to, what worked last time"
          />
        </Field>

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
