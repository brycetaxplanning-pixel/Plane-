import { useState } from 'react';
import { useTabParam } from '../lib/router';
import { CHANNELS, DEAL_STAGES, OUTCOMES, type Channel, type Deal, type DealStage, type Outcome } from '../lib/schema';
import { XP } from '../lib/gamification';
import { dowLabel, fmtDate, fmtRange, todayKey, weekEnd, weekStart } from '../lib/date';
import { uid } from '../lib/id';
import { fmtMoney } from '../lib/finance';
import { useApp } from '../state/context';
import { planningStats } from '../state/selectors';
import { Ideas } from './business/Ideas';
import { Modal } from '../components/ui/Modal';
import { EmptyState, Field, SectionHead } from '../components/ui/Field';
import { BarChart } from '../components/charts/BarChart';
import { Ring } from '../components/charts/Ring';
import { StatTile } from '../components/charts/StatTile';

const ACCENT = 'var(--mod-planning)';

export function Planning() {
  const { state, update, reward, toast } = useApp();
  const stats = planningStats(state);
  const [logging, setLogging] = useState(false);
  const [dealOpen, setDealOpen] = useState<Deal | 'new' | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [tab, setTab] = useTabParam(['planning', 'ideas'] as const, 'planning');

  const thisWeek = state.planning.outreach
    .filter((o) => weekStart(o.date) === weekStart())
    .sort((a, b) => b.date.localeCompare(a.date));

  const logOutreach = (name: string, channel: Channel, outcome: Outcome, notes: string) => {
    const hitTarget = stats.count + 1 === stats.target;
    const xp = XP.outreach + (outcome === 'Meeting booked' ? XP.outreachMeeting : 0) + (hitTarget ? XP.weeklyTargetHit : 0);
    reward(
      'planning',
      xp,
      hitTarget ? `Weekly target hit — ${stats.target} reached` : `Logged outreach: ${name}`,
      (s) => ({
        ...s,
        planning: {
          ...s.planning,
          outreach: [
            ...s.planning.outreach,
            { id: uid('out'), date: todayKey(), name: name.trim(), channel, outcome, notes: notes.trim() || undefined },
          ],
        },
      }),
    );
    setLogging(false);
  };

  return (
    <div className="stack">
      <div className="tabs" role="tablist">
        <button className="tab" role="tab" aria-selected={tab === 'planning'} onClick={() => setTab('planning')}>Tax planning</button>
        <button className="tab" role="tab" aria-selected={tab === 'ideas'} onClick={() => setTab('ideas')}>
          Ideas{state.planning.ideas.length ? ` (${state.planning.ideas.length})` : ''}
        </button>
      </div>

      {tab === 'ideas' && <Ideas />}

      {tab === 'planning' && (
      <>
      <section className="card" style={{ ['--mod' as string]: ACCENT }}>
        <SectionHead
          title="This week's S-corp outreach"
          sub={fmtRange(weekStart(), weekEnd())}
        />
        <div className="hero-split">
          <div className="hero-figure"><Ring
            value={stats.target ? stats.count / stats.target : 0}
            color={ACCENT}
            size={104}
            stroke={9}
            label={`${stats.count}`}
            caption={`of ${stats.target}`}
          /></div>
          <div className="hero-body stack-2">
            <StatTile
              label={stats.remaining > 0 ? 'Still to go' : 'Target'}
              value={stats.remaining > 0 ? stats.remaining : 'Hit'}
              caption={
                stats.remaining > 0
                  ? `${stats.perDayNeeded} a day for the ${stats.daysLeft} days left`
                  : `${stats.count} logged this week`
              }
            />
            <button
              className="btn btn-accent btn-lg btn-block"
              style={{ ['--mod' as string]: ACCENT }}
              onClick={() => setLogging(true)}
            >
              + Log outreach
            </button>
          </div>
        </div>
      </section>

      <section className="card">
        <SectionHead title="Outreach by day" sub={`${stats.meetings} meeting${stats.meetings === 1 ? '' : 's'} booked this week`} />
        <BarChart
          data={stats.byDay.map((d) => ({ key: d.key, value: d.value, label: dowLabel(d.key) }))}
          color={ACCENT}
          target={Math.ceil(stats.target / 7)}
          targetLabel={`Pace (${Math.ceil(stats.target / 7)}/day)`}
          highlightKey={todayKey()}
          ariaLabel="Outreach logged each day this week against the daily pace needed"
        />
      </section>

      <section className="card">
        <SectionHead title="Last 8 weeks" sub={`Target is ${stats.target} a week`} />
        <BarChart
          data={stats.history.map((h) => ({ key: h.key, value: h.value, label: fmtDate(h.key) }))}
          color={ACCENT}
          target={stats.target}
          targetLabel={`Weekly target (${stats.target})`}
          highlightKey={weekStart()}
          ariaLabel="Outreach per week over the last eight weeks against the weekly target"
        />
      </section>

      <section className="card">
        <SectionHead
          title="Pipeline"
          sub={`${stats.openDeals.length} open · ${fmtMoney(stats.pipelineValue, state.settings.currency)} in play`}
          action={<button className="btn btn-sm" onClick={() => setDealOpen('new')}>+ Deal</button>}
        />
        {state.planning.deals.length === 0 ? (
          <EmptyState icon="🎯" title="No deals tracked yet" hint="Add a prospect once a conversation turns into something real." />
        ) : (
          <div className="stack-2">
            {[...state.planning.deals]
              .sort((a, b) => DEAL_STAGES.indexOf(a.stage) - DEAL_STAGES.indexOf(b.stage))
              .map((d) => (
                <button key={d.id} className="rowitem" style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => setDealOpen(d)}>
                  <span className="grow" style={{ minWidth: 0 }}>
                    <span className="t-sm t-bold truncate" style={{ display: 'block' }}>{d.name}</span>
                    <span className="t-xs t-muted">
                      {d.stage}{d.nextStep ? ` · ${d.nextStep}` : ''}{d.nextStepDate ? ` (${fmtDate(d.nextStepDate)})` : ''}
                    </span>
                  </span>
                  <span className="t-sm t-num">{fmtMoney(d.value, state.settings.currency)}</span>
                </button>
              ))}
          </div>
        )}
      </section>

      <section className="card">
        <SectionHead
          title="Logged this week"
          sub={`${thisWeek.length} contact${thisWeek.length === 1 ? '' : 's'}`}
          action={thisWeek.length > 6 ? <button className="link-btn" onClick={() => setShowAll((v) => !v)}>{showAll ? 'Show less' : 'Show all'}</button> : undefined}
        />
        {thisWeek.length === 0 ? (
          <EmptyState icon="📞" title="Nothing logged yet this week" hint="Every call, email and DM counts toward the 50." />
        ) : (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr><th>Name</th><th className="hide-sm">Channel</th><th>Outcome</th><th>Day</th><th /></tr>
              </thead>
              <tbody>
                {(showAll ? thisWeek : thisWeek.slice(0, 6)).map((o) => (
                  <tr key={o.id}>
                    <td>{o.name}</td>
                    <td className="t-muted hide-sm">{o.channel}</td>
                    <td>
                      <span className={o.outcome === 'Meeting booked' ? 'status status-good' : o.outcome === 'Closed' ? 'status status-good' : 'status status-neutral'}>
                        {o.outcome}
                      </span>
                    </td>
                    <td className="t-muted">{dowLabel(o.date)}</td>
                    <td className="num">
                      <button
                        className="btn btn-ghost btn-icon"
                        aria-label={`Remove ${o.name}`}
                        title="Remove"
                        onClick={() => {
                          update((s) => ({ ...s, planning: { ...s.planning, outreach: s.planning.outreach.filter((x) => x.id !== o.id) } }));
                          toast('Entry removed');
                        }}
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card">
        <Field label="Weekly outreach target" hint="Fifty a week is the default; change it if the goal moves.">
          <input
            className="input"
            type="number"
            min={1}
            value={state.planning.weeklyTarget}
            onChange={(e) => update((s) => ({
              ...s,
              planning: { ...s.planning, weeklyTarget: Math.max(1, Number(e.target.value) || 1) },
            }))}
          />
        </Field>
      </section>

      </>
      )}

      {logging && <OutreachForm onClose={() => setLogging(false)} onSave={logOutreach} />}

      {dealOpen && (
        <DealForm
          deal={dealOpen === 'new' ? null : dealOpen}
          onClose={() => setDealOpen(null)}
          onDelete={dealOpen === 'new' ? undefined : () => {
            const id = (dealOpen as Deal).id;
            update((s) => ({ ...s, planning: { ...s.planning, deals: s.planning.deals.filter((d) => d.id !== id) } }));
            setDealOpen(null);
            toast('Deal removed');
          }}
          onSave={(deal) => {
            update((s) => ({
              ...s,
              planning: {
                ...s.planning,
                deals: s.planning.deals.some((d) => d.id === deal.id)
                  ? s.planning.deals.map((d) => (d.id === deal.id ? deal : d))
                  : [...s.planning.deals, deal],
              },
            }));
            setDealOpen(null);
            toast('Deal saved');
          }}
        />
      )}
    </div>
  );
}

function OutreachForm({
  onClose, onSave,
}: {
  onClose: () => void;
  onSave: (name: string, channel: Channel, outcome: Outcome, notes: string) => void;
}) {
  const [name, setName] = useState('');
  const [channel, setChannel] = useState<Channel>('Call');
  const [outcome, setOutcome] = useState<Outcome>('No answer');
  const [notes, setNotes] = useState('');

  return (
    <Modal
      title="Log outreach"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-accent"
            style={{ ['--mod' as string]: ACCENT }}
            onClick={() => onSave(name || 'Unnamed contact', channel, outcome, notes)}
          >
            Log it
          </button>
        </>
      }
    >
      <div className="stack-3">
        <Field label="Who">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name or business" autoFocus />
        </Field>
        <Field label="Channel">
          <div className="row-2 wrap">
            {CHANNELS.map((c) => (
              <button key={c} type="button" className="chip" aria-pressed={channel === c} onClick={() => setChannel(c)}>{c}</button>
            ))}
          </div>
        </Field>
        <Field label="Outcome">
          <div className="row-2 wrap">
            {OUTCOMES.map((o) => (
              <button key={o} type="button" className="chip" aria-pressed={outcome === o} onClick={() => setOutcome(o)}>{o}</button>
            ))}
          </div>
        </Field>
        <Field label="Notes">
          <textarea className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="S-corp election, ~$180k net, follow up Tuesday" />
        </Field>
      </div>
    </Modal>
  );
}

function DealForm({
  deal, onClose, onSave, onDelete,
}: {
  deal: Deal | null;
  onClose: () => void;
  onSave: (d: Deal) => void;
  onDelete?: () => void;
}) {
  const [name, setName] = useState(deal?.name ?? '');
  const [stage, setStage] = useState<DealStage>(deal?.stage ?? 'Lead');
  const [value, setValue] = useState(String(deal?.value ?? ''));
  const [nextStep, setNextStep] = useState(deal?.nextStep ?? '');
  const [nextStepDate, setNextStepDate] = useState(deal?.nextStepDate ?? '');

  return (
    <Modal
      title={deal ? 'Edit deal' : 'New deal'}
      onClose={onClose}
      footer={
        <>
          {onDelete && <button className="btn btn-danger" style={{ marginRight: 'auto' }} onClick={onDelete}>Delete</button>}
          <button className="btn" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-accent"
            style={{ ['--mod' as string]: ACCENT }}
            disabled={!name.trim()}
            onClick={() => onSave({
              id: deal?.id ?? uid('deal'),
              name: name.trim(),
              stage,
              value: Number(value) || 0,
              nextStep: nextStep.trim() || undefined,
              nextStepDate: nextStepDate || undefined,
              createdAt: deal?.createdAt ?? todayKey(),
            })}
          >
            Save
          </button>
        </>
      }
    >
      <div className="stack-3">
        <Field label="Prospect">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
        <div className="grid grid-2" style={{ gap: 'var(--sp-3)' }}>
          <Field label="Stage">
            <select className="select" value={stage} onChange={(e) => setStage(e.target.value as DealStage)}>
              {DEAL_STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Fee value">
            <input className="input" type="number" min={0} value={value} onChange={(e) => setValue(e.target.value)} placeholder="2500" />
          </Field>
        </div>
        <Field label="Next step">
          <input className="input" value={nextStep} onChange={(e) => setNextStep(e.target.value)} placeholder="Send proposal" />
        </Field>
        <Field label="Next step date">
          <input className="input" type="date" value={nextStepDate} onChange={(e) => setNextStepDate(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
