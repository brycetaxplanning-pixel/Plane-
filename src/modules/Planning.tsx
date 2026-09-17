import { useState } from 'react';
import { useTabParam } from '../lib/router';
import { CHANNELS, DEAL_STAGES, type Business, type Channel, type Deal, type DealStage } from '../lib/schema';
import { rankOf } from '../lib/gamification';
import { dowLabel, fmtDate, fmtRange, todayKey, weekEnd, weekStart } from '../lib/date';
import { uid } from '../lib/id';
import { fmtMoney } from '../lib/finance';
import { useApp } from '../state/context';
import { planningStats } from '../state/selectors';
import { DictateInput } from '../components/ui/Dictation';
import { Ideas } from './business/Ideas';
import { Modal } from '../components/ui/Modal';
import { OutreachCounter } from './business/OutreachCounter';
import { EmptyState, Field, SectionHead } from '../components/ui/Field';
import { BarChart } from '../components/charts/BarChart';
import { Ring } from '../components/charts/Ring';
import { StatTile } from '../components/charts/StatTile';
import { Icons, type IconName } from '../components/layout/Icons';
import { MarkPicker } from '../components/ui/MarkPicker';
import { NumberInput } from '../components/ui/NumberInput';

const ACCENT = 'var(--mod-planning)';

export function Planning() {
  const { state, update, toast } = useApp();
  const businesses = state.planning.businesses.filter((b) => !b.archived);
  const [tab, setTab] = useTabParam(['planning', 'ideas'] as const, 'planning');
  const [activeId, setActiveId] = useState(() => businesses[0]?.id ?? '');
  const [editingBiz, setEditingBiz] = useState<Business | 'new' | null>(null);
  const [dealOpen, setDealOpen] = useState<Deal | 'new' | null>(null);
  // A link that names a tab has already picked for you — notifications and
  // the coach both deep-link straight into the ideas list, and landing on the
  // picker instead would drop them at a grid with no idea why they were sent.
  const [picked, setPicked] = useState(() => tab === 'ideas');
  const [chartOpen, setChartOpen] = useState(false);

  const active = businesses.find((b) => b.id === activeId) ?? businesses[0];
  const stats = planningStats(state, active?.id);



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

  /* Nothing is open until a card is picked, which is what makes this read
     like the home screen rather than a page that happens to have tabs. */
  if (!picked) {
    return (
      <div className="stack">
        <div className="launch-grid">
          {businesses.map((b, i) => {
            const bs = planningStats(state, b.id);
            const pct = bs.target ? Math.min(1, bs.count / bs.target) : 0;
            return (
              <button
                key={b.id}
                className={`mtile mtile-${rankOf(pct)}`}
                onClick={() => { setTab('planning'); setActiveId(b.id); setPicked(true); }}
                style={{
                  ['--mod' as string]: ACCENT,
                  animationDelay: `${i * 45}ms`,
                  ['--foil-delay' as string]: `${i * -520}ms`,
                }}
              >
                <span className="mtile-foil" aria-hidden><i /></span>
                <span className="mtile-id" aria-hidden>{String(i + 1).padStart(2, '0')}</span>
                {pct >= 1 && (
                  <span className="mtile-medal" title={`${b.name}: this week's target is met`}>
                    <span className="sr-only">Target met.</span>
                    {Icons.check()}
                  </span>
                )}
                <span className="glyph">{b.icon ? Icons[b.icon]() : Icons.briefcase()}</span>
                <span className="mtile-name">{b.name}</span>
                <span className="mtile-stat">
                  <b>{bs.target ? `${bs.count}/${bs.target}` : String(bs.count)}</b>
                  <span className="mtile-cap">outreach</span>
                </span>
                <span className="mtile-meter" aria-hidden><i style={{ width: `${pct * 100}%` }} /></span>
              </button>
            );
          })}

          <button
            className="mtile mtile-alt"
            onClick={() => { setTab('ideas'); setPicked(true); }}
            style={{ animationDelay: `${businesses.length * 45}ms` }}
          >
            <span className="glyph">{Icons.bulb()}</span>
            <span className="mtile-name">Business ideas</span>
            <span className="mtile-stat"><b>{state.planning.ideas.length}</b><span className="mtile-cap">noted</span></span>
          </button>

          <button
            className="mtile mtile-alt"
            onClick={() => setEditingBiz('new')}
            style={{ animationDelay: `${(businesses.length + 1) * 45}ms` }}
          >
            <span className="glyph">{Icons.plus()}</span>
            <span className="mtile-name">Add a business</span>
          </button>
        </div>

        {editingBiz && (
          <BusinessForm
            business={editingBiz === 'new' ? null : editingBiz}
            onClose={() => setEditingBiz(null)}
            onSave={saveBusiness}
          />
        )}
      </div>
    );
  }

  return (
    <div className="stack">
      {/* The same small back link the header uses to leave a module. It was
          written as .link-btn.backline, and .backline had no CSS at all — an
          inline SVG with nothing constraining it expands to fill its box, so
          the chevron grew to the height of the screen. */}
      <button className="backlink" style={{ alignSelf: 'flex-start' }} onClick={() => setPicked(false)}>
        <span aria-hidden style={{ width: 15, height: 15, display: 'inline-flex' }}>{Icons.back()}</span>
        All businesses
      </button>

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
            {/* The number itself, changeable. Logging people one at a time is
                still there below for a business that wants the names; this is
                for the one whose names live somewhere else. */}
            {active && <OutreachCounter business={active} logged={stats.logged} />}
            {stats.logged > 0 && stats.counted > 0 && (
              <p className="counter-split">
                {stats.counted} counted by hand · {stats.logged} from logged contacts
              </p>
            )}
            {/* The chart is a thing you go and look at, not something
                taking up the screen every time you open the module. */}
            <button className="link-btn" style={{ alignSelf: 'center' }} onClick={() => setChartOpen(true)}>
              See the numbers over time
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
        </section>
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
          title={active?.name ?? 'This business'}
          sub="Each business keeps its own target and its own pipeline"
          action={<button className="btn btn-sm" onClick={() => setEditingBiz(active ?? 'new')}>Edit</button>}
        />
        <div className="row-2 wrap">
          <Field label="Weekly outreach target" hint="Set it to zero for a business that does not do outreach.">
            <NumberInput
              style={{ maxWidth: 120 }}
              min={0}
              value={active?.weeklyTarget ?? 0}
              onChange={(weeklyTarget) => {
                if (!active) return;
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

      {chartOpen && (
        <Modal title="Outreach over time" onClose={() => setChartOpen(false)}>
          <div className="stack-3">
            <div>
              <h4 className="t-up" style={{ color: 'var(--text-muted)' }}>This week, by day</h4>
              <BarChart
                data={stats.byDay.map((d) => ({ key: d.key, value: d.value, label: dowLabel(d.key) }))}
                color={ACCENT}
                height={120}
              />
            </div>
            <div>
              <h4 className="t-up" style={{ color: 'var(--text-muted)' }}>Last 8 weeks</h4>
              <BarChart
                data={stats.history.map((h) => ({ key: h.key, value: h.value, label: fmtDate(h.key) }))}
                color={ACCENT}
                height={140}
                target={stats.target || undefined}
              />
            </div>
            <p className="t-xs t-muted">
              The weekly bars carry whatever you counted that week. The daily ones
              only show contacts logged with a date, so a week entered as one
              number sits on the week and not on any day.
            </p>
          </div>
        </Modal>
      )}

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
  // Undefined means "never said", which is every business saved before this
  // existed, and is treated as all of them.
  const [channels, setChannels] = useState<Channel[]>(business?.channels ?? [...CHANNELS]);

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
              // All of them is the same as not having an opinion, so it is
              // stored as not having one rather than as a list to maintain.
              channels: channels.length === 0 || channels.length === CHANNELS.length ? undefined : channels,
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
        <Field
          label="How it reaches people"
          hint={channels.length === 1
            ? `Every contact is logged as ${channels[0]} without asking.`
            : 'Leave one selected and logging stops asking which it was.'}
        >
          <div className="row-2 wrap">
            {CHANNELS.map((c) => (
              <button
                key={c}
                type="button"
                className="chip"
                aria-pressed={channels.includes(c)}
                onClick={() => setChannels((l) => (l.includes(c) ? l.filter((x) => x !== c) : [...l, c]))}
              >
                {c}
              </button>
            ))}
          </div>
        </Field>
        <DictateInput label="Notes" value={notes} onChange={setNotes} textarea rows={3} placeholder="What it is, who it is for" />
      </div>
    </Modal>
  );
}
