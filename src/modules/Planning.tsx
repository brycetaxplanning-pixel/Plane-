import { useState } from 'react';
import { useTabParam } from '../lib/router';
import { CHANNELS, DEAL_STAGES, OUTCOMES, type Business, type Channel, type Deal, type DealStage, type Outcome } from '../lib/schema';
import { XP } from '../lib/gamification';
import { dowLabel, fmtDate, fmtRange, todayKey, weekEnd, weekStart } from '../lib/date';
import { uid } from '../lib/id';
import { fmtMoney } from '../lib/finance';
import { useApp } from '../state/context';
import { planningStats } from '../state/selectors';
import { DictateInput } from '../components/ui/Dictation';
import { Ideas } from './business/Ideas';
import { Modal } from '../components/ui/Modal';
import { EmptyState, Field, SectionHead } from '../components/ui/Field';
import { BarChart } from '../components/charts/BarChart';
import { Ring } from '../components/charts/Ring';
import { StatTile } from '../components/charts/StatTile';
import { Tabs, panelProps } from '../components/ui/Tabs';
import { Icons, type IconName } from '../components/layout/Icons';
import { MarkPicker } from '../components/ui/MarkPicker';

const ACCENT = 'var(--mod-planning)';

export function Planning() {
  const { state, update, reward, toast } = useApp();
  const businesses = state.planning.businesses.filter((b) => !b.archived);
  const [tab, setTab] = useTabParam(['planning', 'ideas'] as const, 'planning');
  const [activeId, setActiveId] = useState(() => businesses[0]?.id ?? '');
  const [editingBiz, setEditingBiz] = useState<Business | 'new' | null>(null);
  const [logging, setLogging] = useState(false);
  const [dealOpen, setDealOpen] = useState<Deal | 'new' | null>(null);
  const [showAll, setShowAll] = useState(false);

  const active = businesses.find((b) => b.id === activeId) ?? businesses[0];
  const stats = planningStats(state, active?.id);

  /** A business with no target and no history has nothing to chart. */
  const showCharts = stats.target > 0 || stats.outreach.length > 0;

  const thisWeek = stats.outreach
    .filter((o) => weekStart(o.date) === weekStart())
    .sort((a, b) => b.date.localeCompare(a.date));

  const saveBusiness = (b: Business) => {
    update((s) => ({
      ...s,
      planning: {
        ...s.planning,
        businesses: s.planning.businesses.some((x) => x.id === b.id)
          ? s.planning.businesses.map((x) => (x.id === b.id ? b : x))
          : [...s.planning.businesses, b],
      },
    }));
    setActiveId(b.id);
    setEditingBiz(null);
    toast('Business saved');
  };

  if (businesses.length === 0) {
    return (
      <div className="stack">
        <EmptyState
          icon={Icons.building()}
          title="No businesses set up"
          hint="Each one keeps its own outreach target and its own pipeline."
        />
        <button className="btn btn-accent btn-lg" style={{ ['--mod' as string]: ACCENT }} onClick={() => setEditingBiz('new')}>
          + Add a business
        </button>
        {editingBiz && <BusinessForm business={null} onClose={() => setEditingBiz(null)} onSave={saveBusiness} />}
      </div>
    );
  }

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
            { id: uid('out'), businessId: active?.id, date: todayKey(), name: name.trim(), channel, outcome, notes: notes.trim() || undefined },
          ],
        },
      }),
    );
    setLogging(false);
  };

  return (
    <div className="stack">
      {/* One row, two kinds of tab: a business, or the idea list. They are
          flattened onto one key so the row behaves as a single tablist. */}
      <Tabs
        idBase="business"
        label="Businesses and ideas"
        active={tab === 'ideas' ? 'ideas' : `biz-${active?.id ?? ''}`}
        onChange={(id) => {
          if (id === 'ideas') { setTab('ideas'); return; }
          setTab('planning');
          setActiveId(id.replace(/^biz-/, ''));
        }}
        tabs={[
          ...businesses.map((b) => ({ id: `biz-${b.id}`, label: b.name })),
          { id: 'ideas', label: `Ideas${state.planning.ideas.length ? ` (${state.planning.ideas.length})` : ''}` },
        ]}
      />

      <div className="stack" {...panelProps('business', tab === 'ideas' ? 'ideas' : `biz-${active?.id ?? ''}`)}>
      {tab === 'ideas' && <Ideas />}

      {tab === 'planning' && (
      <>
      {stats.target > 0 ? (
      <section className="card" style={{ ['--mod' as string]: ACCENT }}>
        <SectionHead
          title={`${active?.name ?? 'This week'} — outreach`}
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
      ) : (
        <section className="card" style={{ ['--mod' as string]: ACCENT }}>
          <SectionHead
            title={active?.name ?? 'This business'}
            sub="No outreach target set — the counter is hidden"
          />
          {active?.notes && <p className="t-sm t-sec">{active.notes}</p>}
          <button className="btn btn-accent" style={{ ['--mod' as string]: ACCENT, marginTop: 'var(--sp-3)' }} onClick={() => setLogging(true)}>
            + Log a contact anyway
          </button>
        </section>
      )}

      {showCharts && (
      <>
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
      </>
      )}

      <section className="card">
        <SectionHead
          title="Pipeline"
          sub={`${stats.openDeals.length} open · ${fmtMoney(stats.pipelineValue, state.settings.currency)} in play`}
          action={<button className="btn btn-sm" onClick={() => setDealOpen('new')}>+ Deal</button>}
        />
        {stats.deals.length === 0 ? (
          <EmptyState icon={Icons.target()} title="No deals tracked yet" hint="Add a prospect once a conversation turns into something real." />
        ) : (
          <div className="stack-2">
            {[...stats.deals]
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
          <EmptyState
            icon={Icons.phone()}
            title="Nothing logged yet this week"
            hint={stats.target > 0 ? `Every call, email and DM counts toward the ${stats.target}.` : 'Log a contact here if this business ever needs one.'}
          />
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
                        <span className="btn-glyph" aria-hidden>{Icons.close()}</span>
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
        <SectionHead
          title={active?.name ?? 'This business'}
          sub="Each business keeps its own target and its own pipeline"
          action={<button className="btn btn-sm" onClick={() => setEditingBiz(active ?? 'new')}>Edit</button>}
        />
        <div className="row-2 wrap">
          <Field label="Weekly outreach target" hint="Set it to zero for a business that does not do outreach.">
            <input
              className="input"
              style={{ maxWidth: 120 }}
              type="number"
              min={0}
              value={active?.weeklyTarget ?? 0}
              onChange={(e) => {
                if (!active) return;
                const weeklyTarget = Math.max(0, Number(e.target.value) || 0);
                update((s) => ({
                  ...s,
                  planning: {
                    ...s.planning,
                    businesses: s.planning.businesses.map((b) => (b.id === active.id ? { ...b, weeklyTarget } : b)),
                  },
                }));
              }}
            />
          </Field>
        </div>
        <button className="btn btn-sm" style={{ marginTop: 'var(--sp-3)' }} onClick={() => setEditingBiz('new')}>
          + Add another business
        </button>
      </section>

      </>
      )}

      {editingBiz && (
        <BusinessForm
          business={editingBiz === 'new' ? null : editingBiz}
          onClose={() => setEditingBiz(null)}
          onDelete={editingBiz === 'new' || businesses.length < 2 ? undefined : () => {
            const id = (editingBiz as Business).id;
            update((s) => ({
              ...s,
              planning: {
                ...s.planning,
                businesses: s.planning.businesses.filter((b) => b.id !== id),
                // Its outreach and deals stay, unassigned, rather than being
                // deleted along with it.
                outreach: s.planning.outreach.map((o) => (o.businessId === id ? { ...o, businessId: undefined } : o)),
                deals: s.planning.deals.map((d) => (d.businessId === id ? { ...d, businessId: undefined } : d)),
              },
            }));
            setActiveId(businesses.find((b) => b.id !== id)?.id ?? '');
            setEditingBiz(null);
            toast('Business removed — its history was kept');
          }}
          onSave={saveBusiness}
        />
      )}

      {logging && <OutreachForm onClose={() => setLogging(false)} onSave={logOutreach} />}

      {dealOpen && (
        <DealForm
          deal={dealOpen === 'new' ? null : dealOpen}
          businessId={active?.id}
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
  deal, businessId, onClose, onSave, onDelete,
}: {
  deal: Deal | null;
  businessId?: string;
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
              businessId: deal?.businessId ?? businessId,
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

function BusinessForm({
  business, onClose, onSave, onDelete,
}: {
  business: Business | null;
  onClose: () => void;
  onSave: (b: Business) => void;
  onDelete?: () => void;
}) {
  const [name, setName] = useState(business?.name ?? '');
  const [icon, setIcon] = useState<IconName | undefined>(business?.icon);
  const [weeklyTarget, setWeeklyTarget] = useState(String(business?.weeklyTarget ?? 50));
  const [notes, setNotes] = useState(business?.notes ?? '');

  return (
    <Modal
      title={business ? 'Edit business' : 'New business'}
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
              id: business?.id ?? uid('biz'),
              name: name.trim(),
              icon,
              weeklyTarget: Math.max(0, Number(weeklyTarget) || 0),
              notes: notes.trim() || undefined,
              createdAt: business?.createdAt ?? todayKey(),
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
            <DictateInput label="Name" value={name} onChange={setName} placeholder="Flaxseed gel" autoFocus />
          </div>
        </div>
        <Field label="Weekly outreach target" hint="Zero for a business that does not run outreach.">
          <input className="input" style={{ maxWidth: 120 }} type="number" min={0} value={weeklyTarget} onChange={(e) => setWeeklyTarget(e.target.value)} />
        </Field>
        <DictateInput label="Notes" value={notes} onChange={setNotes} textarea rows={3} placeholder="What it is, who it is for" />
      </div>
    </Modal>
  );
}
