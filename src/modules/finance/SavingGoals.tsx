import { useState } from 'react';
import type { SavingGoal } from '../../lib/schema';
import { fmtMoney } from '../../lib/finance';
import {
  GOAL_PRESETS, addMonths, capacity, cutCandidates, goalRow, goalRows, isDone,
  openQuestions, presetById, saved, verdict, type GoalPreset, type GoalRow,
} from '../../lib/budgetGoals';
import { fmtDateFull, fmtDateLong, fmtMonthYear, todayKey } from '../../lib/date';
import { uid } from '../../lib/id';
import { XP } from '../../lib/gamification';
import { useApp } from '../../state/context';
import { Modal } from '../../components/ui/Modal';
import { EmptyState, Field, SectionHead } from '../../components/ui/Field';
import { AIError, askJSON, isAIConfigured } from '../../lib/ai';
import { DictateInput } from '../../components/ui/Dictation';
import { StatTile } from '../../components/charts/StatTile';
import { Icons } from '../../components/layout/Icons';

const ACCENT = 'var(--mod-finance)';

export function SavingGoals() {
  const { state, update, reward, toast } = useApp();
  const cur = state.settings.currency;
  const rows = goalRows(state);
  const cap = capacity(state);

  const [picking, setPicking] = useState(false);
  const [editing, setEditing] = useState<SavingGoal | null>(null);
  const [depositing, setDepositing] = useState<SavingGoal | null>(null);
  const [asking, setAsking] = useState<SavingGoal | null>(null);
  const [incomeOpen, setIncomeOpen] = useState(false);

  const saveGoal = (g: SavingGoal) => {
    update((s) => ({
      ...s,
      finance: {
        ...s.finance,
        savingGoals: s.finance.savingGoals.some((x) => x.id === g.id)
          ? s.finance.savingGoals.map((x) => (x.id === g.id ? g : x))
          : [...s.finance.savingGoals, g],
      },
    }));
    setEditing(null);
    setPicking(false);
    toast('Goal saved');
  };

  const removeGoal = (id: string) => {
    update((s) => ({ ...s, finance: { ...s.finance, savingGoals: s.finance.savingGoals.filter((g) => g.id !== id) } }));
    setEditing(null);
    toast('Goal removed');
  };

  const deposit = (g: SavingGoal, amount: number, note: string) => {
    const willFinish = saved(g) + amount >= g.target && !isDone(g);
    reward(
      'finance',
      XP.savingDeposit + (willFinish ? XP.savingGoalFunded : 0),
      willFinish ? `${g.name} is fully funded` : `Put ${fmtMoney(amount, cur)} toward ${g.name}`,
      (s) => ({
        ...s,
        finance: {
          ...s.finance,
          savingGoals: s.finance.savingGoals.map((x) =>
            x.id === g.id
              ? { ...x, contributions: [...x.contributions, { id: uid('dep'), date: todayKey(), amount, note: note || undefined }] }
              : x,
          ),
        },
      }),
    );
    setDepositing(null);
  };

  const setIncome = (n: number) => {
    update((s) => ({ ...s, finance: { ...s.finance, monthlyIncome: n } }));
    setIncomeOpen(false);
    toast(n > 0 ? 'Take-home saved' : 'Take-home cleared');
  };

  return (
    <div className="stack">
      <section className="card" style={{ ['--mod' as string]: ACCENT }}>
        <SectionHead
          title="What the month can carry"
          sub="Everything here is measured against real spending, not a guess"
          action={<button className="btn btn-sm" onClick={() => setIncomeOpen(true)}>{cap.income > 0 ? 'Edit income' : '+ Income'}</button>}
        />
        <div className="grid grid-3" style={{ gap: 'var(--sp-3)' }}>
          <StatTile
            label="Take-home"
            value={cap.income > 0 ? fmtMoney(cap.income, cur) : '—'}
            caption={cap.income > 0 ? 'a month, as you entered it' : 'not set yet'}
          />
          <StatTile
            label="Average spend"
            value={cap.avgSpend > 0 ? fmtMoney(cap.avgSpend, cur) : '—'}
            caption={cap.avgSpend > 0 ? 'a month, from your logged transactions' : 'no transactions logged'}
          />
          <StatTile
            label={cap.free !== null && cap.free < 0 ? 'Over-promised' : 'Free after goals'}
            value={cap.free === null ? '—' : fmtMoney(Math.abs(cap.free), cur)}
            caption={
              cap.free === null
                ? 'add take-home to see this'
                : cap.free < 0
                  ? `goals ask for ${fmtMoney(cap.committed, cur)} a month`
                  : `after ${fmtMoney(cap.committed, cur)} a month of goals`
            }
          />
        </div>

        {cap.overcommitted && (
          <p className="callout callout-bad" style={{ marginTop: 'var(--sp-3)' }}>
            Your goals want {fmtMoney(cap.committed, cur)} a month and an average month leaves{' '}
            {fmtMoney(cap.surplus ?? 0, cur)}. One of the dates has to move, or one of the categories below has to give.
          </p>
        )}
      </section>

      {rows.length === 0 ? (
        <section className="card">
          <EmptyState
            icon={Icons.bank()}
            title="No saving goals yet"
            hint="Pick one of the presets — it fills in what it can from your own spending, then asks the questions worth answering."
          />
          <button className="btn btn-accent btn-lg btn-block" style={{ ['--mod' as string]: ACCENT }} onClick={() => setPicking(true)}>
            + Start a saving goal
          </button>
        </section>
      ) : (
        <>
          {rows.map((row) => (
            <GoalCard
              key={row.goal.id}
              row={row}
              onDeposit={() => setDepositing(row.goal)}
              onEdit={() => setEditing(row.goal)}
              onAnswer={() => setAsking(row.goal)}
            />
          ))}
          <button className="btn btn-block" onClick={() => setPicking(true)}>+ Another saving goal</button>
        </>
      )}

      {picking && <PresetPicker onClose={() => setPicking(false)} onPick={(g) => { setPicking(false); setEditing(g); }} />}

      {editing && (
        <GoalForm
          goal={editing}
          onClose={() => setEditing(null)}
          onSave={saveGoal}
          onDelete={state.finance.savingGoals.some((g) => g.id === editing.id) ? () => removeGoal(editing.id) : undefined}
        />
      )}

      {depositing && (
        <DepositForm
          goal={depositing}
          onClose={() => setDepositing(null)}
          onSave={(amount, note) => deposit(depositing, amount, note)}
        />
      )}

      {asking && <QuestionSheet goal={asking} onClose={() => setAsking(null)} onSave={saveGoal} />}

      {incomeOpen && <IncomeForm current={cap.income} onClose={() => setIncomeOpen(false)} onSave={setIncome} />}
    </div>
  );
}

/* ---------------- one goal ---------------- */

function GoalCard({
  row, onDeposit, onEdit, onAnswer,
}: {
  row: GoalRow;
  onDeposit: () => void;
  onEdit: () => void;
  onAnswer: () => void;
}) {
  const { state } = useApp();
  const cur = state.settings.currency;
  const g = row.goal;
  const v = verdict(state, row);
  const open = openQuestions(g);

  return (
    <section className="card" style={{ ['--mod' as string]: ACCENT }}>
      <div className="row-2" style={{ alignItems: 'flex-start' }}>
        <span className="goal-emoji" aria-hidden>{g.emoji}</span>
        <div className="grow" style={{ minWidth: 0 }}>
          <h3 className="t-md t-bold">{g.name}</h3>
          <p className="t-xs t-muted">
            {fmtMoney(row.balance, cur)} of {fmtMoney(g.target, cur)}
            {g.targetDate ? ` · wanted by ${fmtDateFull(g.targetDate)}` : ' · no date set'}
          </p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={onEdit}>Edit</button>
      </div>

      <div className="meter" style={{ marginTop: 'var(--sp-3)' }} role="img"
        aria-label={`${Math.round(row.pct * 100)} percent funded`}>
        <div className={`meter-fill tone-${v.tone}`} style={{ width: `${Math.max(2, row.pct * 100)}%` }} />
      </div>
      <div className="row-2 t-xs t-muted" style={{ marginTop: 4 }}>
        <span className="grow">{Math.round(row.pct * 100)}% funded</span>
        <span>{row.remaining > 0 ? `${fmtMoney(row.remaining, cur)} to go` : 'Funded'}</span>
      </div>

      <div className={`callout callout-${v.tone}`} style={{ marginTop: 'var(--sp-3)' }}>
        <strong className="t-sm">{v.headline}</strong>
        <p className="t-sm" style={{ margin: '4px 0 0' }}>{v.detail}</p>
        {v.cuts.length > 0 && (
          <p className="t-xs t-sec" style={{ margin: '8px 0 0' }}>
            Your biggest movable categories right now:{' '}
            {v.cuts.map((c) => `${c.category} (${fmtMoney(c.monthly, cur)}/mo)`).join(', ')}. Halving the first would free about{' '}
            {fmtMoney(v.cuts[0].freed, cur)} a month.
          </p>
        )}
      </div>

      <div className="grid grid-3" style={{ gap: 'var(--sp-3)', marginTop: 'var(--sp-3)' }}>
        <StatTile label="Putting in" value={g.monthly > 0 ? fmtMoney(g.monthly, cur) : '—'} caption="a month" />
        <StatTile
          label="Date needs"
          value={row.requiredMonthly !== null ? fmtMoney(row.requiredMonthly, cur) : '—'}
          caption={row.monthsLeft !== null ? `a month for ${row.monthsLeft} month${row.monthsLeft === 1 ? '' : 's'}` : 'no date set'}
        />
        <StatTile
          label="Lands"
          value={row.projectedDate ? fmtMonthYear(row.projectedDate) : '—'}
          caption={row.projectedMonths !== null ? 'at your current rate' : 'nothing going in'}
        />
      </div>

      <div className="row-2 wrap" style={{ marginTop: 'var(--sp-3)' }}>
        <button className="btn btn-accent" style={{ ['--mod' as string]: ACCENT }} onClick={onDeposit}>+ Add to it</button>
        <button className="btn" onClick={onAnswer}>
          {open.length > 0 ? `Answer the questions (${open.length})` : 'Review the questions'}
        </button>
      </div>

      {(g.answers ?? []).length > 0 && (
        <details className="details" style={{ marginTop: 'var(--sp-2)' }}>
          <summary className="t-sm">What you decided</summary>
          <div className="stack-2" style={{ marginTop: 'var(--sp-2)' }}>
            {(g.answers ?? []).map((a) => (
              <div key={a.question}>
                <p className="t-xs t-muted" style={{ margin: 0 }}>{a.question}</p>
                <p className="t-sm" style={{ margin: 0 }}>{a.answer}</p>
              </div>
            ))}
          </div>
        </details>
      )}

      {g.contributions.length > 0 && (
        <details className="details" style={{ marginTop: 'var(--sp-2)' }}>
          <summary className="t-sm">{g.contributions.length} deposit{g.contributions.length === 1 ? '' : 's'}</summary>
          <div className="stack-2" style={{ marginTop: 'var(--sp-2)' }}>
            {[...g.contributions].reverse().map((c) => (
              <div key={c.id} className="rowitem">
                <span className="grow t-sm">{fmtDateLong(c.date)}{c.note ? ` · ${c.note}` : ''}</span>
                <span className="t-sm t-num">{fmtMoney(c.amount, cur)}</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}

/* ---------------- preset picker ---------------- */

function PresetPicker({ onClose, onPick }: { onClose: () => void; onPick: (g: SavingGoal) => void }) {
  const { state } = useApp();
  const cur = state.settings.currency;
  const linkable = state.goals.items.filter((g) => (g.cost ?? 0) > 0 && !g.done);

  const fromPreset = (p: GoalPreset): SavingGoal => ({
    id: uid('sgoal'),
    name: p.id === 'custom' ? '' : p.name,
    emoji: p.emoji,
    target: p.suggest?.(state) ?? 0,
    monthly: 0,
    targetDate: addMonths(todayKey(), p.months ?? 12),
    preset: p.id,
    createdAt: todayKey(),
    contributions: [],
  });

  return (
    <Modal title="What are you saving for?" onClose={onClose}>
      <div className="stack-2">
        {GOAL_PRESETS.map((p) => {
          const suggested = p.suggest?.(state) ?? null;
          return (
            <button key={p.id} className="rowitem" style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => onPick(fromPreset(p))}>
              <span className="goal-emoji" aria-hidden>{p.emoji}</span>
              <span className="grow" style={{ minWidth: 0 }}>
                <span className="t-sm t-bold" style={{ display: 'block' }}>{p.name}</span>
                <span className="t-xs t-muted">
                  {p.blurb}
                  {suggested ? ` Suggests ${fmtMoney(suggested, cur)} — ${p.basis}` : ''}
                </span>
              </span>
            </button>
          );
        })}

        {linkable.length > 0 && (
          <>
            <p className="t-xs t-muted" style={{ marginTop: 'var(--sp-3)' }}>Or fund something already on your goals list:</p>
            {linkable.map((g) => (
              <button
                key={g.id}
                className="rowitem"
                style={{ textAlign: 'left', cursor: 'pointer' }}
                onClick={() =>
                  onPick({
                    id: uid('sgoal'),
                    name: g.title,
                    emoji: g.emoji,
                    target: g.cost ?? 0,
                    monthly: 0,
                    targetDate: addMonths(todayKey(), 12),
                    preset: 'custom',
                    goalId: g.id,
                    createdAt: todayKey(),
                    contributions: [],
                  })
                }
              >
                <span className="goal-emoji" aria-hidden>{g.emoji}</span>
                <span className="grow" style={{ minWidth: 0 }}>
                  <span className="t-sm t-bold" style={{ display: 'block' }}>{g.title}</span>
                  <span className="t-xs t-muted">{fmtMoney(g.cost ?? 0, cur)} — from Goals</span>
                </span>
              </button>
            ))}
          </>
        )}
      </div>
    </Modal>
  );
}

/* ---------------- forms ---------------- */

function GoalForm({
  goal, onClose, onSave, onDelete,
}: {
  goal: SavingGoal;
  onClose: () => void;
  onSave: (g: SavingGoal) => void;
  onDelete?: () => void;
}) {
  const { state } = useApp();
  const cur = state.settings.currency;
  const preset = presetById(goal.preset);
  const [name, setName] = useState(goal.name);
  const [emoji, setEmoji] = useState(goal.emoji);
  const [target, setTarget] = useState(String(goal.target || ''));
  const [monthly, setMonthly] = useState(String(goal.monthly || ''));
  const [date, setDate] = useState(goal.targetDate ?? '');
  const [note, setNote] = useState(goal.note ?? '');
  const [opening, setOpening] = useState('');

  const draft: SavingGoal = {
    ...goal,
    name: name.trim() || preset?.name || 'Saving goal',
    emoji: emoji.trim() || '🎯',
    target: Number(target) || 0,
    monthly: Number(monthly) || 0,
    targetDate: date || undefined,
    note: note.trim() || undefined,
  };
  const live = verdict(state, goalRow(draft));

  return (
    <Modal
      title={preset ? `${preset.emoji} ${preset.name}` : 'Saving goal'}
      onClose={onClose}
      footer={
        <>
          {onDelete && <button className="btn btn-ghost" onClick={onDelete}>Delete</button>}
          <span className="grow" />
          <button className="btn" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-accent"
            style={{ ['--mod' as string]: ACCENT }}
            onClick={() => {
              const start = Number(opening) || 0;
              onSave(
                start > 0
                  ? { ...draft, contributions: [...draft.contributions, { id: uid('dep'), date: todayKey(), amount: start, note: 'Already saved' }] }
                  : draft,
              );
            }}
          >
            Save goal
          </button>
        </>
      }
    >
      <div className="stack-2">
        <div className="row-2">
          <div style={{ width: 76 }}>
            <Field label="Icon"><input className="input" value={emoji} onChange={(e) => setEmoji(e.target.value)} maxLength={4} /></Field>
          </div>
          <div className="grow">
            <DictateInput label="Name" value={name} onChange={setName} placeholder="What you're saving for" autoFocus={!name} />
          </div>
        </div>

        <Field label={`What it costs (${cur})`} hint={preset?.basis && goal.target > 0 ? preset.basis : 'The full price, including the parts that are easy to forget.'}>
          <input className="input" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="0" />
        </Field>

        {goal.contributions.length === 0 && (
          <Field label={`Already put aside (${cur})`} hint="Optional — the balance you are starting from today.">
            <input className="input" inputMode="decimal" value={opening} onChange={(e) => setOpening(e.target.value)} placeholder="0" />
          </Field>
        )}

        <Field label="Wanted by" hint="Leave it empty if there is no real deadline — then there is nothing to be behind on.">
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>

        <Field label={`Putting in each month (${cur})`} hint="What you will actually move, not what you wish you could.">
          <input className="input" inputMode="decimal" value={monthly} onChange={(e) => setMonthly(e.target.value)} placeholder="0" />
        </Field>

        <DictateInput label="Note" value={note} onChange={setNote} placeholder="Anything worth remembering" textarea rows={2} />

        {draft.target > 0 && (
          <div className={`callout callout-${live.tone}`}>
            <strong className="t-sm">{live.headline}</strong>
            <p className="t-sm" style={{ margin: '4px 0 0' }}>{live.detail}</p>
          </div>
        )}
      </div>
    </Modal>
  );
}

function DepositForm({ goal, onClose, onSave }: { goal: SavingGoal; onClose: () => void; onSave: (amount: number, note: string) => void }) {
  const { state } = useApp();
  const cur = state.settings.currency;
  const [amount, setAmount] = useState(goal.monthly > 0 ? String(goal.monthly) : '');
  const [note, setNote] = useState('');
  const n = Number(amount) || 0;

  return (
    <Modal
      title={`Add to ${goal.name}`}
      onClose={onClose}
      footer={
        <>
          <span className="grow" />
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-accent" style={{ ['--mod' as string]: ACCENT }} disabled={n <= 0} onClick={() => onSave(n, note.trim())}>
            Add {n > 0 ? fmtMoney(n, cur) : ''}
          </button>
        </>
      }
    >
      <div className="stack-2">
        <Field label={`Amount (${cur})`} hint={goal.monthly > 0 ? `Your monthly amount is ${fmtMoney(goal.monthly, cur)}.` : undefined}>
          <input className="input" inputMode="decimal" value={amount} autoFocus onChange={(e) => setAmount(e.target.value)} placeholder="0" />
        </Field>
        <DictateInput label="Note" value={note} onChange={setNote} placeholder="Where it came from" />
      </div>
    </Modal>
  );
}

function IncomeForm({ current, onClose, onSave }: { current: number; onClose: () => void; onSave: (n: number) => void }) {
  const { state } = useApp();
  const [value, setValue] = useState(current > 0 ? String(current) : '');

  return (
    <Modal
      title="Monthly take-home"
      onClose={onClose}
      footer={
        <>
          <span className="grow" />
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-accent" style={{ ['--mod' as string]: ACCENT }} onClick={() => onSave(Number(value) || 0)}>Save</button>
        </>
      }
    >
      <Field
        label={`After tax, a month (${state.settings.currency})`}
        hint="Typed in, not pulled from anywhere. It is only used to work out what is left after an average month of spending."
      >
        <input className="input" inputMode="decimal" value={value} autoFocus onChange={(e) => setValue(e.target.value)} placeholder="0" />
      </Field>
    </Modal>
  );
}

/* ---------------- the follow-up questions ---------------- */

function QuestionSheet({ goal, onClose, onSave }: { goal: SavingGoal; onClose: () => void; onSave: (g: SavingGoal) => void }) {
  const { state } = useApp();
  const cur = state.settings.currency;
  const preset = presetById(goal.preset) ?? presetById('custom')!;
  const existing = new Map((goal.answers ?? []).map((a) => [a.question, a.answer]));
  // Questions already answered but not on the preset list came from Claude on
  // an earlier pass — they stay, so nothing you typed disappears.
  const carried = (goal.answers ?? []).map((a) => a.question).filter((q) => !preset.questions.includes(q));
  const [questions, setQuestions] = useState<string[]>([...preset.questions, ...carried]);
  const [answers, setAnswers] = useState<Record<string, string>>(
    Object.fromEntries([...preset.questions, ...carried].map((q) => [q, existing.get(q) ?? ''])),
  );
  const cuts = cutCandidates(state);
  const row = goalRow(goal);
  const cap = capacity(state);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  /** Claude gets the real numbers and is asked for questions, not advice —
   *  the answers are yours to write. */
  const deeper = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await askJSON<{ questions: string[] }>(
        state.settings,
        'You help someone think through a saving goal. You ask questions; you do not give advice and you do not answer them yourself.',
        `Saving goal: ${goal.name} (${preset.name}).
Costs ${fmtMoney(goal.target, cur)}, ${fmtMoney(row.balance, cur)} saved, ${fmtMoney(row.remaining, cur)} to go.
Putting in ${fmtMoney(goal.monthly, cur)} a month${goal.targetDate ? `, wanted by ${goal.targetDate}` : ', no deadline'}.
${row.requiredMonthly !== null ? `The date needs ${fmtMoney(row.requiredMonthly, cur)} a month.` : ''}
Take-home ${cap.income > 0 ? fmtMoney(cap.income, cur) : 'not given'} a month; average spending ${fmtMoney(cap.avgSpend, cur)} a month.
Biggest movable categories: ${cuts.map((c) => `${c.category} ${fmtMoney(c.monthly, cur)}/mo`).join(', ') || 'none logged'}.
Already asked: ${questions.join(' | ')}

Give three more questions, specific to these numbers, that are worth answering before committing to this. Shape: {"questions": ["...", "...", "..."]}`,
      );
      const fresh = (res.questions ?? []).filter((q) => typeof q === 'string' && q.trim() && !questions.includes(q)).slice(0, 3);
      if (fresh.length === 0) throw new AIError('No new questions came back.');
      setQuestions((qs) => [...qs, ...fresh]);
      setAnswers((a) => ({ ...a, ...Object.fromEntries(fresh.map((q) => [q, ''])) }));
    } catch (err) {
      setError(err instanceof AIError ? err.message : 'That did not go through. Try again in a moment.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={`${goal.emoji} ${goal.name} — the questions`}
      onClose={onClose}
      footer={
        <>
          <span className="grow" />
          <button className="btn" onClick={onClose}>Close</button>
          <button
            className="btn btn-accent"
            style={{ ['--mod' as string]: ACCENT }}
            onClick={() =>
              onSave({
                ...goal,
                answers: questions
                  .filter((q) => answers[q]?.trim())
                  .map((q) => ({ question: q, answer: answers[q].trim() })),
              })
            }
          >
            Save answers
          </button>
        </>
      }
    >
      <p className="t-sm t-sec">
        A preset picks the amount. These are the parts only you can answer — and they are what the coach reads when it
        asks whether a purchase fits.
      </p>
      <div className="stack-2" style={{ marginTop: 'var(--sp-3)' }}>
        {questions.map((q) => (
          <DictateInput
            key={q}
            label={q}
            value={answers[q] ?? ''}
            onChange={(v) => setAnswers((a) => ({ ...a, [q]: v }))}
            textarea
            rows={2}
          />
        ))}
      </div>
      <div className="row-2 wrap" style={{ marginTop: 'var(--sp-3)' }}>
        <button className="btn" onClick={() => void deeper()} disabled={busy || !isAIConfigured(state.settings)}>
          {busy ? 'Thinking…' : 'Ask for harder questions'}
        </button>
        {!isAIConfigured(state.settings) && (
          <span className="t-xs t-muted">Add an API key in Settings and Claude will read these numbers and ask three sharper ones.</span>
        )}
      </div>
      {error && <p className="t-xs t-crit">{error}</p>}

      {cuts.length > 0 && (
        <p className="t-xs t-muted" style={{ marginTop: 'var(--sp-3)' }}>
          For context, your biggest movable categories are{' '}
          {cuts.map((c) => `${c.category} at ${fmtMoney(c.monthly, cur)} a month`).join(', ')}.
        </p>
      )}
    </Modal>
  );
}
