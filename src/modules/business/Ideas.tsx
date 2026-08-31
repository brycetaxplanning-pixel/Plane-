import { useEffect, useState } from 'react';
import { IDEA_EFFORT, IDEA_STAGES, type BusinessIdea, type IdeaEffort, type IdeaStage } from '../../lib/schema';
import { XP } from '../../lib/gamification';
import { AIError, askJSON, isAIConfigured } from '../../lib/ai';
import { addDays, diffDays, fmtDate, todayKey } from '../../lib/date';
import { uid } from '../../lib/id';
import { useApp } from '../../state/context';
import { Modal } from '../../components/ui/Modal';
import { EmptyState, Field, SectionHead } from '../../components/ui/Field';
import { DictateInput, VoiceCapture } from '../../components/ui/Dictation';

const ACCENT = 'var(--mod-planning)';

const IDEA_SUGGESTIONS = [
  'Clips channel for finance YouTubers',
  'International tax prep and planning',
  '401(k) rollover into personal custody',
  'Asset protection planning',
];

const stageClass = (s: IdeaStage) =>
  s === 'Live' ? 'status status-good'
  : s === 'Building' ? 'status status-serious'
  : s === 'Parked' ? 'status status-neutral'
  : 'status status-neutral';

const daysAgo = (key: string): string => {
  const n = diffDays(todayKey(), key);
  if (n <= 1) return 'yesterday';
  if (n < 14) return `${n} days ago`;
  if (n < 60) return `${Math.round(n / 7)} weeks ago`;
  return `${Math.round(n / 30)} months ago`;
};

/** The one idea worth pushing on: the oldest that has been written down and
 *  then left alone. Nothing that already has a plan, nothing waved away
 *  recently, and never more than one at a time. */
function stalest(ideas: BusinessIdea[]): BusinessIdea | null {
  const today = todayKey();
  const candidates = ideas
    // Only the ones genuinely sitting: something already at Building or Live
    // is underway, and Parked was a decision.
    .filter((i) => !i.steps?.length && (i.stage === 'Spark' || i.stage === 'Exploring'))
    .filter((i) => !i.snoozedUntil || i.snoozedUntil <= today)
    .filter((i) => diffDays(today, i.createdAt) >= 3)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return candidates[0] ?? null;
}

export function Ideas() {
  const { state, update, reward, toast } = useApp();
  const ideas = state.planning.ideas;
  const [editing, setEditing] = useState<BusinessIdea | 'new' | null>(null);
  const [talking, setTalking] = useState(false);
  /** Set when the offer is taken up, so the form drafts a plan on open
   *  instead of waiting to be asked a second time. */
  const [autoPlan, setAutoPlan] = useState(false);
  const offer = stalest(ideas);

  const snooze = (idea: BusinessIdea) => {
    update((s) => ({
      ...s,
      planning: {
        ...s.planning,
        ideas: s.planning.ideas.map((i) => (i.id === idea.id ? { ...i, snoozedUntil: addDays(todayKey(), 14) } : i)),
      },
    }));
    toast('Parked for a couple of weeks');
  };

  const add = (idea: BusinessIdea) => {
    const isNew = !ideas.some((i) => i.id === idea.id);
    const apply = (s: typeof state) => ({
      ...s,
      planning: {
        ...s.planning,
        ideas: isNew ? [...s.planning.ideas, idea] : s.planning.ideas.map((i) => (i.id === idea.id ? idea : i)),
      },
    });
    if (isNew) reward('planning', XP.idea, 'Idea captured', apply);
    else { update(apply); toast('Idea updated'); }
    setEditing(null);
  };

  /** Spoken capture: the first clause becomes the title, the rest the detail. */
  const saveSpoken = (text: string) => {
    const cut = text.search(/[.,;]\s/);
    const title = (cut > 0 && cut < 80 ? text.slice(0, cut) : text.slice(0, 80)).trim();
    add({
      id: uid('idea'),
      title: title || 'New idea',
      summary: undefined,
      detail: text,
      stage: 'Spark',
      effort: 'Real project',
      createdAt: todayKey(),
    });
    setTalking(false);
  };

  return (
    <>
      <section className="card" style={{ ['--mod' as string]: ACCENT }}>
        <SectionHead title="Business ideas" sub="Say it before you lose it" />
        {talking ? (
          <VoiceCapture onDone={saveSpoken} placeholder="Talk the idea through — what it is, who it's for…">
            <button className="link-btn" onClick={() => setTalking(false)}>Cancel</button>
          </VoiceCapture>
        ) : (
          <div className="row-2 wrap">
            <button className="btn btn-accent btn-lg grow" style={{ ['--mod' as string]: ACCENT }} onClick={() => setTalking(true)}>
              🎙 Talk an idea
            </button>
            <button className="btn btn-lg" onClick={() => setEditing('new')}>Write one</button>
          </div>
        )}
      </section>

      {offer && (
        <section className="card">
          <div className="insight">
            <span className="insight-icon" aria-hidden>🤝</span>
            <div className="grow" style={{ minWidth: 0 }}>
              <p className="insight-title">Let me help you out with "{offer.title}"</p>
              <p className="t-sm t-sec" style={{ margin: '0 0 var(--sp-3)' }}>
                Written down {daysAgo(offer.createdAt)} and nothing has happened since. I can break it into
                first actions you can actually tick off{isAIConfigured(state.settings) ? '' : ' — add an API key in Settings and I will draft them for you'}.
              </p>
              <div className="row-2 wrap">
                <button
                  className="btn btn-accent"
                  style={{ ['--mod' as string]: ACCENT }}
                  onClick={() => { setAutoPlan(true); setEditing(offer); }}
                >
                  Yes, help me start it
                </button>
                <button className="btn" onClick={() => snooze(offer)}>Not now</button>
              </div>
            </div>
          </div>
        </section>
      )}

      {ideas.length === 0 ? (
        <EmptyState icon="💡" title="No ideas logged" hint="The half-formed ones count. That is the point of writing them down." />
      ) : (
        <section className="card">
          <SectionHead title={`${ideas.length} idea${ideas.length === 1 ? '' : 's'}`} sub="Numbered in the order you had them" />
          <div className="stack-2">
            {ideas.map((idea, i) => (
              <button key={idea.id} className="rowitem" style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => setEditing(idea)}>
                <span className="idea-num">{i + 1}</span>
                <span className="grow" style={{ minWidth: 0 }}>
                  <span className="t-sm t-bold truncate" style={{ display: 'block' }}>{idea.title}</span>
                  <span className="t-xs t-muted truncate" style={{ display: 'block' }}>
                    {idea.summary || idea.detail?.slice(0, 90) || 'No description yet'}
                  </span>
                  <span className="row-2 wrap" style={{ marginTop: 4 }}>
                    <span className={stageClass(idea.stage)}>{idea.stage}</span>
                    <span className="chip chip-static">{idea.effort}</span>
                    {idea.steps?.length ? (
                      <span className="t-xs t-muted">{idea.steps.filter((s) => s.done).length}/{idea.steps.length} steps</span>
                    ) : null}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {editing && (
        <IdeaForm
          autoPlan={autoPlan}
          idea={editing === 'new' ? null : editing}
          onClose={() => { setEditing(null); setAutoPlan(false); }}
          onDelete={editing === 'new' ? undefined : () => {
            const id = (editing as BusinessIdea).id;
            update((s) => ({ ...s, planning: { ...s.planning, ideas: s.planning.ideas.filter((x) => x.id !== id) } }));
            setEditing(null);
            toast('Idea removed');
          }}
          onSave={add}
        />
      )}
    </>
  );
}

interface StartPlan {
  effort?: IdeaEffort;
  nextStep?: string;
  steps?: string[];
  risks?: string;
}

function IdeaForm({
  idea, autoPlan, onClose, onSave, onDelete,
}: {
  idea: BusinessIdea | null;
  /** Opened by taking up the offer, so the plan is drafted straight away. */
  autoPlan?: boolean;
  onClose: () => void;
  onSave: (i: BusinessIdea) => void;
  onDelete?: () => void;
}) {
  const { state } = useApp();
  const [title, setTitle] = useState(idea?.title ?? '');
  const [summary, setSummary] = useState(idea?.summary ?? '');
  const [detail, setDetail] = useState(idea?.detail ?? '');
  const [stage, setStage] = useState<IdeaStage>(idea?.stage ?? 'Spark');
  const [effort, setEffort] = useState<IdeaEffort>(idea?.effort ?? 'Real project');
  const [nextStep, setNextStep] = useState(idea?.nextStep ?? '');
  const [steps, setSteps] = useState(idea?.steps ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [risks, setRisks] = useState<string | null>(null);

  useEffect(() => {
    if (autoPlan && idea && isAIConfigured(state.settings)) void help();
    // Once, on open. Re-running when the draft state changes would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function help() {
    if (!title.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const plan = await askJSON<StartPlan>(
        state.settings,
        `You help someone actually start a business idea instead of leaving it on a list.
Return {"effort": "Easy start" | "Real project" | "Heavy lift", "nextStep": string, "steps": string[], "risks": string}.
"steps" is 4 to 7 concrete first actions, each doable in a sitting, in order, each starting with a verb. No generic advice like "do market research" — say exactly what to research and where.
"nextStep" is the single thing to do today, in under 12 words.
"risks" is one sentence on the thing most likely to kill it, including any licensing or regulatory issue if the idea touches finance, tax or investments.`,
        `Idea: ${title.trim()}
${summary.trim() ? `Summary: ${summary.trim()}` : ''}
${detail.trim() ? `Detail: ${detail.trim()}` : ''}
Context: the person is a tax professional who prepares returns for a firm and runs a small tax-planning practice on the side. They have limited free time.`,
      );

      if (plan.effort && IDEA_EFFORT.includes(plan.effort)) setEffort(plan.effort);
      if (plan.nextStep) setNextStep(plan.nextStep);
      if (plan.risks) setRisks(plan.risks);
      if (plan.steps?.length) {
        setSteps(plan.steps.map((text) => ({ id: uid('st'), text, done: false })));
        setStage((s) => (s === 'Spark' ? 'Exploring' : s));
      }
    } catch (err) {
      setError(err instanceof AIError ? [err.message, err.hint].filter(Boolean).join(' ') : 'Could not draft a plan.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={idea ? `Idea · ${idea.title}` : 'New idea'}
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
              id: idea?.id ?? uid('idea'),
              title: title.trim(),
              summary: summary.trim() || undefined,
              detail: detail.trim() || undefined,
              stage,
              effort,
              nextStep: nextStep.trim() || undefined,
              steps: steps.length ? steps : undefined,
              createdAt: idea?.createdAt ?? todayKey(),
            })}
          >
            Save
          </button>
        </>
      }
    >
      <div className="stack-3">
        <DictateInput
          label="The idea"
          value={title}
          onChange={setTitle}
          placeholder="Clips channel for finance YouTubers"
          suggestions={idea ? undefined : IDEA_SUGGESTIONS}
          autoFocus
        />

        <DictateInput label="One line" value={summary} onChange={setSummary} placeholder="Cut long-form finance videos into clips nobody else is posting" />

        <DictateInput
          label="The long version"
          value={detail}
          onChange={setDetail}
          textarea
          rows={5}
          placeholder="For the ones that need explaining when you come back to them in six months."
        />

        <div className="card card-sunken card-tight">
          <div className="spread wrap" style={{ gap: 'var(--sp-2)' }}>
            <div>
              <p className="t-sm t-bold">Want a hand starting this?</p>
              <p className="t-xs t-muted">Turns it into first actions you can tick off.</p>
            </div>
            <button
              className="btn btn-sm btn-accent"
              style={{ ['--mod' as string]: ACCENT }}
              disabled={busy || !title.trim() || !isAIConfigured(state.settings)}
              onClick={() => void help()}
            >
              {busy ? 'Thinking…' : 'Help me start it'}
            </button>
          </div>
          {!isAIConfigured(state.settings) && (
            <p className="t-xs t-muted" style={{ marginTop: 6 }}>Add an Anthropic API key in Settings to use this.</p>
          )}
          {error && <p className="t-xs t-crit" style={{ marginTop: 6 }}>{error}</p>}
          {risks && <p className="t-xs t-sec" style={{ marginTop: 6 }}><strong>Watch out:</strong> {risks}</p>}
        </div>

        {steps.length > 0 && (
          <Field label="First steps">
            <div className="stack-2">
              {steps.map((st) => (
                <label key={st.id} className={`rowitem${st.done ? ' rowitem-done' : ''}`} style={{ cursor: 'pointer' }}>
                  <input
                    className="checkbox"
                    type="checkbox"
                    checked={st.done}
                    onChange={() => setSteps((l) => l.map((x) => (x.id === st.id ? { ...x, done: !x.done } : x)))}
                  />
                  <span className="rowitem-title grow t-sm">{st.text}</span>
                </label>
              ))}
              <button className="link-btn" onClick={() => setSteps([])}>Clear the steps</button>
            </div>
          </Field>
        )}

        <DictateInput label="Next step" value={nextStep} onChange={setNextStep} placeholder="Pick three channels and check their clip rights" />

        <div className="grid grid-2" style={{ gap: 'var(--sp-3)' }}>
          <Field label="Stage">
            <select className="select" value={stage} onChange={(e) => setStage(e.target.value as IdeaStage)}>
              {IDEA_STAGES.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
          </Field>
          <Field label="How big a lift">
            <select className="select" value={effort} onChange={(e) => setEffort(e.target.value as IdeaEffort)}>
              {IDEA_EFFORT.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
          </Field>
        </div>

        {idea && <p className="t-xs t-muted">Captured {fmtDate(idea.createdAt)}</p>}
      </div>
    </Modal>
  );
}
