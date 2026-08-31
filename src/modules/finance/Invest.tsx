import { useState } from 'react';
import { ACCOUNT_TYPES, type AccountType, type InvestmentAccount } from '../../lib/schema';
import { fmtMoney } from '../../lib/finance';
import { fmtCompact, monthlyTotal, projectSeries, scenarios, startingTotal } from '../../lib/invest';
import { todayKey } from '../../lib/date';
import { uid } from '../../lib/id';
import { useApp } from '../../state/context';
import { Modal } from '../../components/ui/Modal';
import { EmptyState, Field, SectionHead } from '../../components/ui/Field';
import { Slider } from '../../components/ui/Slider';
import { ProjectionChart } from '../../components/charts/ProjectionChart';
import { StatTile } from '../../components/charts/StatTile';
import { Icons } from '../../components/layout/Icons';

const ACCENT = 'var(--mod-finance)';
const RATES = [4, 6, 8, 10, 12];

export function Invest() {
  const { state, update, toast } = useApp();
  const cur = state.settings.currency;
  const accounts = state.finance.accounts;
  const p = state.finance.projection;
  const [editing, setEditing] = useState<InvestmentAccount | 'new' | null>(null);

  const principal = startingTotal(accounts);
  const monthly = p.monthlyOverride ?? monthlyTotal(accounts);
  const series = projectSeries(principal, monthly, p);
  const end = series[series.length - 1];
  const thisYear = new Date().getFullYear();

  const setProjection = (patch: Partial<typeof p>) =>
    update((s) => ({ ...s, finance: { ...s.finance, projection: { ...s.finance.projection, ...patch } } }));

  const saveAccount = (a: InvestmentAccount) =>
    update((s) => ({
      ...s,
      finance: {
        ...s.finance,
        accounts: s.finance.accounts.some((x) => x.id === a.id)
          ? s.finance.accounts.map((x) => (x.id === a.id ? a : x))
          : [...s.finance.accounts, a],
      },
    }));

  if (accounts.length === 0) {
    return (
      <section className="card" style={{ ['--mod' as string]: ACCENT }}>
        <SectionHead title="Investments" sub="Add what you're holding and watch it compound" />
        <EmptyState
          icon={Icons.trend()}
          title="No accounts yet"
          hint="Balances are typed in for now — nothing here talks to a bank or a broker."
        />
        <div className="row-2 wrap" style={{ marginTop: 'var(--sp-3)' }}>
          <button
            className="btn btn-accent"
            style={{ ['--mod' as string]: ACCENT }}
            onClick={() => {
              saveAccount({
                id: uid('acct'), name: 'Stock Account', type: 'Brokerage',
                balance: 80000, monthly: 0, updatedAt: todayKey(),
              });
              toast('Stock Account added — $80,000');
            }}
          >
            Add a $80,000 stock account
          </button>
          <button className="btn" onClick={() => setEditing('new')}>Add a different account</button>
        </div>
        {editing && <AccountForm account={null} onClose={() => setEditing(null)} onSave={(a) => { saveAccount(a); setEditing(null); }} />}
      </section>
    );
  }

  return (
    <>
      <section className="card" style={{ ['--mod' as string]: ACCENT }}>
        <SectionHead
          title="Projected value"
          sub={`${p.real ? "In today's money" : 'Nominal'} · ${p.returnPct}% a year`}
        />

        <div className="grid grid-3" style={{ gap: 'var(--sp-3)', marginBottom: 'var(--sp-4)' }}>
          <StatTile
            label={`In ${end.calendar}`}
            value={fmtCompact(end.balance, cur)}
            caption={`${p.years} year${p.years === 1 ? '' : 's'} from now`}
          />
          <StatTile
            label="You put in"
            value={fmtCompact(end.contributed, cur)}
            caption={`${fmtMoney(principal, cur)} today${monthly ? ` + ${fmtMoney(monthly, cur)}/mo` : ''}`}
            small
          />
          <StatTile
            label="Growth adds"
            value={fmtCompact(end.growth, cur)}
            caption={`${Math.round((end.growth / Math.max(1, end.contributed)) * 100)}% on top of what you paid in`}
            small
          />
        </div>

        <ProjectionChart data={series} currency={cur} color={ACCENT} />

        <div className="viz-legend" style={{ marginTop: 'var(--sp-4)' }}>
          <span><i className="viz-swatch" style={{ background: ACCENT, opacity: 0.62 }} />What you put in</span>
          <span><i className="viz-swatch" style={{ background: ACCENT, opacity: 0.26 }} />Growth on top</span>
        </div>
      </section>

      <section className="card" style={{ ['--mod' as string]: ACCENT }}>
        <SectionHead title="Play with it" sub="None of this is a prediction — they are assumptions you picked" />
        <div className="stack-3">
          <Slider
            label="How far out"
            value={p.years} min={1} max={40}
            display={`${p.years}y · ${thisYear + p.years}`}
            onChange={(years) => setProjection({ years })}
          />
          <Slider
            label="Annual return"
            value={p.returnPct} min={0} max={15} step={0.5}
            display={`${p.returnPct}%`}
            hint="The S&P 500's long-run average is roughly 10% nominal, about 7% after inflation — but any single decade can land far from that."
            onChange={(returnPct) => setProjection({ returnPct })}
          />
          <Slider
            label="Adding each month"
            value={monthly} min={0} max={10000} step={50}
            display={fmtMoney(monthly, cur)}
            hint={p.monthlyOverride === null ? 'Taken from your accounts.' : 'Overriding your accounts.'}
            onChange={(v) => setProjection({ monthlyOverride: v })}
          />

          <div className="spread wrap" style={{ gap: 'var(--sp-2)' }}>
            <label className="row-2" style={{ cursor: 'pointer' }}>
              <input
                className="checkbox"
                type="checkbox"
                checked={p.real}
                onChange={(e) => setProjection({ real: e.target.checked })}
              />
              <span className="t-sm">Show it in today's money ({p.inflationPct}% inflation)</span>
            </label>
            {p.monthlyOverride !== null && (
              <button className="link-btn" onClick={() => setProjection({ monthlyOverride: null })}>
                Use my accounts again
              </button>
            )}
          </div>
        </div>
      </section>

      <section className="card">
        <SectionHead title="If the return were different" sub={`Balance in ${end.calendar}`} />
        <div className="table-scroll">
          <table className="table">
            <thead><tr><th>Annual return</th><th className="num">In {end.calendar}</th><th className="num">vs {p.returnPct}%</th></tr></thead>
            <tbody>
              {scenarios(principal, monthly, p, RATES).map((row) => {
                const delta = row.balance - end.balance;
                return (
                  <tr key={row.rate} style={row.rate === p.returnPct ? { fontWeight: 650 } : undefined}>
                    <td>{row.rate}%</td>
                    <td className="num">{fmtCompact(row.balance, cur)}</td>
                    <td className={`num ${delta > 0.5 ? 't-good' : delta < -0.5 ? 't-crit' : 't-muted'}`}>
                      {Math.abs(delta) < 1 ? '—' : `${delta > 0 ? '+' : '−'}${fmtCompact(Math.abs(delta), cur)}`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <SectionHead
          title="Accounts"
          sub={`${fmtMoney(principal, cur)} across ${accounts.length} account${accounts.length === 1 ? '' : 's'}`}
          action={<button className="btn btn-sm" onClick={() => setEditing('new')}>+ Account</button>}
        />
        <div className="stack-2">
          {accounts.map((a) => (
            <button key={a.id} className="rowitem" style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => setEditing(a)}>
              <span className="grow" style={{ minWidth: 0 }}>
                <span className="t-sm t-bold truncate" style={{ display: 'block' }}>{a.name}</span>
                <span className="t-xs t-muted">
                  {a.type}{a.monthly ? ` · ${fmtMoney(a.monthly, cur)}/mo` : ''}
                  {a.linked ? ' · linked' : ' · entered by hand'}
                </span>
              </span>
              <span className="t-sm t-num t-bold">{fmtMoney(a.balance, cur)}</span>
            </button>
          ))}
        </div>
        <p className="t-xs t-muted" style={{ marginTop: 'var(--sp-3)' }}>
          Balances are typed in, not synced. When you connect a broker later, the account record
          already carries a <code>linked</code> flag to mark which figures are live.
        </p>
      </section>

      {editing && (
        <AccountForm
          account={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onDelete={editing === 'new' ? undefined : () => {
            const id = (editing as InvestmentAccount).id;
            update((s) => ({ ...s, finance: { ...s.finance, accounts: s.finance.accounts.filter((x) => x.id !== id) } }));
            setEditing(null);
            toast('Account removed');
          }}
          onSave={(a) => { saveAccount(a); setEditing(null); toast('Account saved'); }}
        />
      )}
    </>
  );
}

function AccountForm({
  account, onClose, onSave, onDelete,
}: {
  account: InvestmentAccount | null;
  onClose: () => void;
  onSave: (a: InvestmentAccount) => void;
  onDelete?: () => void;
}) {
  const [name, setName] = useState(account?.name ?? '');
  const [type, setType] = useState<AccountType>(account?.type ?? 'Brokerage');
  const [balance, setBalance] = useState(String(account?.balance ?? ''));
  const [monthly, setMonthly] = useState(String(account?.monthly ?? ''));

  return (
    <Modal
      title={account ? 'Edit account' : 'New account'}
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
              id: account?.id ?? uid('acct'),
              name: name.trim(),
              type,
              balance: Math.max(0, Number(balance) || 0),
              monthly: Math.max(0, Number(monthly) || 0),
              linked: account?.linked,
              updatedAt: todayKey(),
            })}
          >
            Save
          </button>
        </>
      }
    >
      <div className="stack-3">
        <Field label="Account name">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Stock Account" autoFocus />
        </Field>
        <Field label="Type">
          <select className="select" value={type} onChange={(e) => setType(e.target.value as AccountType)}>
            {ACCOUNT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </Field>
        <div className="grid grid-2" style={{ gap: 'var(--sp-3)' }}>
          <Field label="Balance today">
            <input className="input" type="number" min={0} step="0.01" value={balance} onChange={(e) => setBalance(e.target.value)} placeholder="80000" />
          </Field>
          <Field label="Adding monthly">
            <input className="input" type="number" min={0} step="10" value={monthly} onChange={(e) => setMonthly(e.target.value)} placeholder="0" />
          </Field>
        </div>
      </div>
    </Modal>
  );
}
