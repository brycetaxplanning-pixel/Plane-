import { useMemo, useState } from 'react';
import { useTabParam } from '../lib/router';
import type { Split, Transaction, VendorRule } from '../lib/schema';
import { XP } from '../lib/gamification';
import { fmtDate, fmtMonth, lastMonths, monthKey, todayKey } from '../lib/date';
import { uid } from '../lib/id';
import {
  SEED_RULES, autoCategorize, fmtMoney, matchRule, monthTotal,
  newRows, parseStatement, spendByCategory, spendForVendor, splitsTotal,
} from '../lib/finance';
import { AIError, askJSON, isAIConfigured } from '../lib/ai';
import { goalRows } from '../lib/budgetGoals';
import { useApp } from '../state/context';
import { financeStats } from '../state/selectors';
import { Modal } from '../components/ui/Modal';
import { Tabs, panelProps } from '../components/ui/Tabs';
import { EmptyState, Field, SectionHead } from '../components/ui/Field';
import { Invest } from './finance/Invest';
import { SavingGoals } from './finance/SavingGoals';
import { BudgetBars, type BudgetRow } from '../components/charts/BudgetBars';
import { BarChart } from '../components/charts/BarChart';
import { StatTile } from '../components/charts/StatTile';

const ACCENT = 'var(--mod-finance)';

export function Finance() {
  const { state, update, toast } = useApp();
  const [month, setMonth] = useState(monthKey());
  const [tab, setTab] = useTabParam(['overview', 'goals', 'invest', 'review', 'transactions', 'rules'] as const, 'overview');
  const stats = financeStats(state, month);
  const cur = state.settings.currency;

  /** Goals whose date the current monthly amount will not make. */
  const behind = goalRows(state).filter((r) => r.status === 'behind' || r.status === 'stalled').length;

  const months = lastMonths(6);
  const trend = months.map((m) => ({ key: m, label: fmtMonth(m), value: monthTotal(state.finance.transactions, m) }));

  return (
    <div className="stack">
      <section className="card" style={{ ['--mod' as string]: ACCENT }}>
        <SectionHead
          title="Monthly spending"
          sub={fmtMonth(month)}
          action={
            <select className="select" style={{ width: 'auto' }} value={month} onChange={(e) => setMonth(e.target.value)}>
              {months.slice().reverse().map((m) => <option key={m} value={m}>{fmtMonth(m)}</option>)}
            </select>
          }
        />
        <div className="grid grid-3" style={{ gap: 'var(--sp-3)' }}>
          <StatTile label="Spent" value={fmtMoney(stats.spent, cur)} caption={`${stats.inMonth.length} transactions`} />
          <StatTile
            label={stats.budgetTotal ? 'Left in budget' : 'Budget'}
            value={stats.budgetTotal ? fmtMoney(stats.remaining, cur) : '—'}
            caption={stats.budgetTotal ? `of ${fmtMoney(stats.budgetTotal, cur)}` : 'set budgets below'}
          />
          <StatTile
            label="Need a category"
            value={stats.reviewCount}
            caption={stats.reviewCount ? 'tap Review' : 'all sorted'}
          />
        </div>
      </section>

      <Tabs
        idBase="finance"
        label="Finance sections"
        active={tab}
        onChange={setTab}
        tabs={[
          { id: 'overview', label: 'Overview' },
          { id: 'goals', label: `Saving${behind ? ` (${behind})` : ''}` },
          { id: 'invest', label: 'Invest' },
          { id: 'review', label: `Review${stats.reviewCount ? ` (${stats.reviewCount})` : ''}` },
          { id: 'transactions', label: 'Transactions' },
          { id: 'rules', label: 'Rules' },
        ]}
      />

      <div className="stack" {...panelProps('finance', tab)}>
      {tab === 'overview' && <Overview month={month} trend={trend} />}
      {tab === 'goals' && <SavingGoals />}
      {tab === 'invest' && <Invest />}
      {tab === 'review' && <ReviewQueue />}
      {tab === 'transactions' && <TransactionsPanel month={month} />}
      {tab === 'rules' && <RulesPanel />}
      </div>

      {tab === 'overview' && state.finance.transactions.length === 0 && (
        <section className="card card-sunken">
          <p className="t-sm t-sec">
            Nothing here yet. Import a CSV from your bank on the Transactions tab, or add a charge by hand —
            anything the app can't categorise on its own lands in Review, where it asks you what it was for.
          </p>
          <button className="btn btn-sm" style={{ marginTop: 'var(--sp-3) ' }} onClick={() => {
            update((s) => ({
              ...s,
              finance: { ...s.finance, rules: SEED_RULES.map((r) => ({ ...r, id: uid('rule') })) },
            }));
            toast(`${SEED_RULES.length} starter rules added`);
          }}>
            Add starter vendor rules
          </button>
        </section>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Overview({ month, trend }: { month: string; trend: { key: string; label: string; value: number }[] }) {
  const { state, update } = useApp();
  const cur = state.settings.currency;
  const spend = spendByCategory(state.finance.transactions, month);
  const [query, setQuery] = useState('');
  const [editBudgets, setEditBudgets] = useState(false);

  const rows: BudgetRow[] = useMemo(() => {
    const cats = new Set([...Object.keys(spend), ...Object.keys(state.finance.budgets)]);
    return [...cats]
      .map((c) => ({ category: c, spent: spend[c] ?? 0, budget: state.finance.budgets[c] ?? 0 }))
      .filter((r) => r.spent > 0 || r.budget > 0)
      .sort((a, b) => b.spent - a.spent);
  }, [spend, state.finance.budgets]);

  const queryTotal = query.trim() ? spendForVendor(state.finance.transactions, query.trim(), month) : null;
  const queryAll = query.trim() ? spendForVendor(state.finance.transactions, query.trim()) : null;

  return (
    <>
      <section className="card">
        <SectionHead title="Where the money went" sub={`${fmtMonth(month)} · spend against budget`} action={
          <button className="btn btn-sm" onClick={() => setEditBudgets(true)}>Set budgets</button>
        } />
        {rows.length === 0 ? (
          <EmptyState icon="💵" title="No spending recorded this month" />
        ) : (
          <BudgetBars rows={rows} format={(n) => fmtMoney(n, cur)} color={ACCENT} />
        )}
      </section>

      <section className="card">
        <SectionHead title="Ask about a vendor" sub="How much did I spend on meat? On Amazon?" />
        <input
          className="input"
          value={query}
          placeholder="meat, amazon, doordash…"
          onChange={(e) => setQuery(e.target.value)}
        />
        {queryTotal !== null && (
          <div className="grid grid-2" style={{ gap: 'var(--sp-3)', marginTop: 'var(--sp-3)' }}>
            <StatTile label={`"${query}" this month`} value={fmtMoney(queryTotal, cur)} small />
            <StatTile label="All time" value={fmtMoney(queryAll ?? 0, cur)} small />
          </div>
        )}
      </section>

      <section className="card">
        <SectionHead title="Monthly total" sub="Last 6 months" />
        <BarChart
          data={trend}
          color={ACCENT}
          highlightKey={month}
          formatValue={(n) => fmtMoney(n, cur)}
          ariaLabel="Total spending per month over the last six months"
        />
      </section>

      {editBudgets && (
        <Modal
          title="Monthly budgets"
          onClose={() => setEditBudgets(false)}
          footer={<button className="btn btn-accent" style={{ ['--mod' as string]: ACCENT }} onClick={() => setEditBudgets(false)}>Done</button>}
        >
          <div className="stack-2">
            {state.finance.categories.map((c) => (
              <div className="row-2" key={c}>
                <span className="grow t-sm">{c}</span>
                <input
                  className="input"
                  style={{ maxWidth: 120 }}
                  type="number"
                  min={0}
                  value={state.finance.budgets[c] ?? ''}
                  placeholder="0"
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    update((s) => {
                      const budgets = { ...s.finance.budgets };
                      if (!v) delete budgets[c];
                      else budgets[c] = v;
                      return { ...s, finance: { ...s.finance, budgets } };
                    });
                  }}
                />
              </div>
            ))}
          </div>
        </Modal>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* The review queue — this is the part that asks what a charge was for */
/* ------------------------------------------------------------------ */

function ReviewQueue() {
  const { state, reward, toast } = useApp();
  const queue = financeStats(state).review;
  const [active, setActive] = useState<Transaction | null>(null);

  if (queue.length === 0) {
    return <EmptyState icon="✅" title="Nothing to review" hint="Every transaction has a category." />;
  }

  return (
    <>
      <section className="card">
        <SectionHead title="What were these for?" sub={`${queue.length} to sort out`} />
        <div className="stack-2">
          {queue.slice(0, 25).map((t) => (
            <button key={t.id} className="rowitem" style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => setActive(t)}>
              <span className="grow" style={{ minWidth: 0 }}>
                <span className="t-sm t-bold truncate" style={{ display: 'block' }}>{t.vendor}</span>
                <span className="t-xs t-muted">
                  {fmtDate(t.date)}
                  {t.category ? ` · guessed ${t.category}` : ' · no guess'}
                </span>
              </span>
              <span className="t-sm t-num t-bold">{fmtMoney(t.amount, state.settings.currency)}</span>
            </button>
          ))}
        </div>
      </section>

      {active && (
        <SplitEditor
          tx={active}
          onClose={() => setActive(null)}
          onSave={(splits, category) => {
            reward('finance', XP.txReviewed, `Categorised ${active.vendor}`, (s) => ({
              ...s,
              finance: {
                ...s.finance,
                transactions: s.finance.transactions.map((t) =>
                  t.id !== active.id ? t : {
                    ...t,
                    splits: splits.length > 1 ? splits : undefined,
                    category: splits.length === 1 ? splits[0].category : category,
                    reviewed: true,
                  }),
              },
            }));
            setActive(null);
            toast('Sorted');
          }}
        />
      )}
    </>
  );
}

/** Splits one charge into named line items — the "$40 snorkel gear, $70 running
 *  shoes" case. Claude can turn a sentence into the lines when a key is set. */
function SplitEditor({
  tx, onClose, onSave,
}: {
  tx: Transaction;
  onClose: () => void;
  onSave: (splits: Split[], category?: string) => void;
}) {
  const { state } = useApp();
  const cur = state.settings.currency;
  const [splits, setSplits] = useState<Split[]>(
    tx.splits?.length
      ? tx.splits
      : [{ id: uid('sp'), category: tx.category ?? state.finance.categories[0], amount: tx.amount }],
  );
  const [describe, setDescribe] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const assigned = splitsTotal(splits);
  const remainder = Math.round((tx.amount - assigned) * 100) / 100;

  const setSplit = (id: string, patch: Partial<Split>) =>
    setSplits((list) => list.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  async function suggest() {
    if (!describe.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const result = await askJSON<{ splits: { category: string; amount: number; note?: string }[] }>(
        state.settings,
        `You split a single card charge into line items for a personal budgeting app.
Available categories: ${state.finance.categories.join(', ')}.
Pick the closest category for each item. Amounts must add up to the charge total.
Return {"splits":[{"category":string,"amount":number,"note":string}]}.`,
        `Charge: ${fmtMoney(tx.amount, cur)} at "${tx.vendor}" on ${tx.date}.
The user says it was: ${describe.trim()}`,
      );
      const next = (result.splits ?? [])
        .filter((s) => Number.isFinite(s.amount) && s.amount > 0)
        .map((s) => ({ id: uid('sp'), category: s.category, amount: Math.round(s.amount * 100) / 100, note: s.note }));
      if (next.length === 0) throw new AIError('No usable split came back.');
      setSplits(next);
    } catch (err) {
      setError(err instanceof AIError ? [err.message, err.hint].filter(Boolean).join(' ') : 'Could not read that.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={tx.vendor}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-accent"
            style={{ ['--mod' as string]: ACCENT }}
            disabled={splits.length === 0 || Math.abs(remainder) > 0.011}
            onClick={() => onSave(splits, splits[0]?.category)}
          >
            Save
          </button>
        </>
      }
    >
      <div className="stack-3">
        <div className="card card-sunken card-tight">
          <div className="spread">
            <span className="t-sm t-sec">{fmtDate(tx.date)}</span>
            <span className="t-bold t-num">{fmtMoney(tx.amount, cur)}</span>
          </div>
        </div>

        <Field label="What was it for?" hint="Plain English is fine: “$40 snorkel gear, $70 running shoes”.">
          <div className="row-2">
            <input
              className="input grow"
              value={describe}
              onChange={(e) => setDescribe(e.target.value)}
              placeholder="40 snorkel gear, 70 running shoes"
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void suggest(); } }}
            />
            <button className="btn" onClick={() => void suggest()} disabled={busy || !describe.trim() || !isAIConfigured(state.settings)}>
              {busy ? '…' : 'Split it'}
            </button>
          </div>
        </Field>
        {!isAIConfigured(state.settings) && (
          <p className="t-xs t-muted">Add an API key in Settings to turn that sentence into line items automatically — or just fill the rows in below.</p>
        )}
        {error && <p className="t-xs t-crit">{error}</p>}

        <div className="stack-2">
          {splits.map((s) => (
            <div className="row-2" key={s.id} style={{ alignItems: 'flex-start' }}>
              <select className="select grow" value={s.category} onChange={(e) => setSplit(s.id, { category: e.target.value })}>
                {state.finance.categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <input
                className="input"
                style={{ maxWidth: 100 }}
                type="number"
                step="0.01"
                value={s.amount}
                onChange={(e) => setSplit(s.id, { amount: Number(e.target.value) || 0 })}
              />
              {splits.length > 1 && (
                <button className="btn btn-ghost btn-icon" aria-label="Remove line" onClick={() => setSplits((l) => l.filter((x) => x.id !== s.id))}>✕</button>
              )}
            </div>
          ))}
          {splits.some((s) => s.note) && (
            <ul className="t-xs t-muted" style={{ margin: 0, paddingLeft: 18 }}>
              {splits.filter((s) => s.note).map((s) => <li key={s.id}>{s.category}: {s.note}</li>)}
            </ul>
          )}
        </div>

        <div className="spread">
          <button
            className="link-btn"
            onClick={() => setSplits((l) => [...l, { id: uid('sp'), category: state.finance.categories[0], amount: Math.max(0, remainder) }])}
          >
            + Add line
          </button>
          <span className={Math.abs(remainder) > 0.011 ? 't-sm t-crit t-num' : 't-sm t-good t-num'}>
            {Math.abs(remainder) > 0.011 ? `${fmtMoney(remainder, cur)} unassigned` : 'Adds up'}
          </span>
        </div>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */

function TransactionsPanel({ month }: { month: string }) {
  const { state, update, toast } = useApp();
  const cur = state.settings.currency;
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);

  const list = state.finance.transactions
    .filter((t) => monthKey(t.date) === month)
    .filter((t) => !search.trim() || t.vendor.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => b.date.localeCompare(a.date));

  return (
    <>
      <section className="card">
        <div className="row-2 wrap" style={{ marginBottom: 'var(--sp-3)' }}>
          <input className="input grow" placeholder="Search vendors" value={search} onChange={(e) => setSearch(e.target.value)} />
          <button className="btn btn-sm" onClick={() => setImporting(true)}>Import CSV</button>
          <button className="btn btn-sm btn-accent" style={{ ['--mod' as string]: ACCENT }} onClick={() => setAdding(true)}>+ Add</button>
        </div>

        {list.length === 0 ? (
          <EmptyState icon="🧾" title="No transactions" hint="Import a CSV from your bank or add one by hand." />
        ) : (
          <div className="table-scroll">
            <table className="table">
              <thead><tr><th>Date</th><th>Vendor</th><th>Category</th><th className="num">Amount</th></tr></thead>
              <tbody>
                {list.map((t) => (
                  <tr key={t.id} style={{ cursor: 'pointer' }} onClick={() => setEditing(t)}>
                    <td className="t-muted">{fmtDate(t.date)}</td>
                    <td className="truncate" style={{ maxWidth: 180 }}>{t.vendor}</td>
                    <td>
                      {t.splits?.length
                        ? <span className="chip chip-static">{t.splits.length} splits</span>
                        : t.reviewed
                          ? <span className="t-sec">{t.category ?? '—'}</span>
                          : <span className="status status-warning">Needs review</span>}
                    </td>
                    <td className="num">{fmtMoney(t.amount, cur)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {adding && (
        <AddTransaction
          onClose={() => setAdding(false)}
          onSave={(tx) => {
            update((s) => ({ ...s, finance: { ...s.finance, transactions: [...s.finance.transactions, tx] } }));
            setAdding(false);
            toast(tx.reviewed ? 'Transaction added' : 'Added — it needs a category');
          }}
        />
      )}

      {importing && <ImportCSV onClose={() => setImporting(false)} />}

      {editing && (
        <SplitEditor
          tx={editing}
          onClose={() => setEditing(null)}
          onSave={(splits, category) => {
            update((s) => ({
              ...s,
              finance: {
                ...s.finance,
                transactions: s.finance.transactions.map((t) =>
                  t.id !== editing.id ? t : {
                    ...t,
                    splits: splits.length > 1 ? splits : undefined,
                    category: splits.length === 1 ? splits[0].category : category,
                    reviewed: true,
                  }),
              },
            }));
            setEditing(null);
            toast('Updated');
          }}
        />
      )}
    </>
  );
}

function AddTransaction({ onClose, onSave }: { onClose: () => void; onSave: (t: Transaction) => void }) {
  const { state } = useApp();
  const [vendor, setVendor] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayKey());
  const [category, setCategory] = useState('');

  const guess = vendor.trim() ? matchRule(vendor, state.finance.rules) : null;

  return (
    <Modal
      title="Add a transaction"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-accent"
            style={{ ['--mod' as string]: ACCENT }}
            disabled={!vendor.trim() || !Number(amount)}
            onClick={() => {
              const auto = autoCategorize({ vendor, category: category || undefined }, state.finance.rules);
              onSave({
                id: uid('tx'),
                date,
                vendor: vendor.trim(),
                amount: Math.abs(Number(amount)),
                category: auto.category,
                reviewed: auto.reviewed,
                source: 'manual',
              });
            }}
          >
            Add
          </button>
        </>
      }
    >
      <div className="stack-3">
        <Field label="Vendor">
          <input className="input" value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="Amazon" autoFocus />
        </Field>
        {guess && (
          <p className="t-xs t-muted">
            Rule match: <strong>{guess.category}</strong>
            {guess.alwaysAsk ? ' — but this vendor always gets asked about, so it will land in Review.' : ''}
          </p>
        )}
        <div className="grid grid-2" style={{ gap: 'var(--sp-3)' }}>
          <Field label="Amount">
            <input className="input" type="number" step="0.01" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="110.00" />
          </Field>
          <Field label="Date">
            <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>
        <Field label="Category" hint="Leave blank to let the rules decide.">
          <select className="select" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">Auto</option>
            {state.finance.categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
      </div>
    </Modal>
  );
}

function ImportCSV({ onClose }: { onClose: () => void }) {
  const { state, update, toast } = useApp();
  const [text, setText] = useState('');
  const [preview, setPreview] = useState<ReturnType<typeof parseStatement> | null>(null);

  const run = (raw: string) => {
    setText(raw);
    setPreview(raw.trim() ? parseStatement(raw) : null);
  };

  // Worked out up front so the button can say how many are actually new — the
  // whole point of downloading a statement monthly is that most of it overlaps.
  const split = preview ? newRows(preview.rows, state.finance.transactions) : null;

  const commit = () => {
    if (!preview || !split) return;
    const txs: Transaction[] = split.fresh.map((r) => {
      const auto = autoCategorize({ vendor: r.vendor }, state.finance.rules);
      return {
        id: uid('tx'), date: r.date, vendor: r.vendor, amount: r.amount,
        category: auto.category, reviewed: auto.reviewed, source: 'import',
        fitid: r.fitid,
      };
    });
    update((s) => ({ ...s, finance: { ...s.finance, transactions: [...s.finance.transactions, ...txs] } }));
    toast(`Imported ${txs.length}${split.duplicates ? `, skipped ${split.duplicates} already there` : ''}`);
    onClose();
  };

  return (
    <Modal
      title="Import transactions"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-accent" style={{ ['--mod' as string]: ACCENT }} disabled={!split?.fresh.length} onClick={commit}>
            Import {split?.fresh.length ?? 0}
          </button>
        </>
      }
    >
      <div className="stack-3">
        <Field
          label="Statement file"
          hint="A CSV, or the QFX/OFX your bank offers under “Download for Quicken”. The Quicken file is the better one: it carries the bank’s own transaction ids, so re-importing an overlapping month cannot double anything."
        >
          <input
            className="input"
            type="file"
            accept=".csv,.ofx,.qfx,.qbo,text/csv,application/x-ofx,application/vnd.intu.qfx"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              void file.text().then(run);
            }}
          />
        </Field>
        <Field label="…or paste it">
          <textarea className="textarea" style={{ minHeight: 110, fontFamily: 'ui-monospace, monospace', fontSize: 12 }} value={text} onChange={(e) => run(e.target.value)} />
        </Field>
        {preview && split && (
          <div className="card card-sunken card-tight">
            <p className="t-sm t-bold">
              {split.fresh.length} new
              {split.duplicates ? `, ${split.duplicates} already imported` : ''}
              {preview.skipped ? `, ${preview.skipped} skipped` : ''}
            </p>
            <p className="t-xs t-muted" style={{ marginBottom: 'var(--sp-2)' }}>
              Read as {preview.format === 'ofx' ? 'a Quicken file' : 'a CSV'}, {preview.rows.length} row
              {preview.rows.length === 1 ? '' : 's'} in it.
              {preview.skipped ? ' Skipped rows are credits, refunds and anything without a date, vendor and amount.' : ''}
            </p>
            <div className="table-scroll" style={{ maxHeight: 170 }}>
              <table className="table">
                <tbody>
                  {split.fresh.slice(0, 8).map((r, i) => (
                    <tr key={i}><td className="t-muted">{r.date}</td><td className="truncate" style={{ maxWidth: 160 }}>{r.vendor}</td><td className="num">{fmtMoney(r.amount, state.settings.currency)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */

function RulesPanel() {
  const { state, update, toast } = useApp();
  const [pattern, setPattern] = useState('');
  const [category, setCategory] = useState(state.finance.categories[0]);
  const [alwaysAsk, setAlwaysAsk] = useState(false);

  const add = () => {
    if (!pattern.trim()) return;
    const rule: VendorRule = { id: uid('rule'), pattern: pattern.trim(), category, alwaysAsk: alwaysAsk || undefined };
    update((s) => ({ ...s, finance: { ...s.finance, rules: [...s.finance.rules, rule] } }));
    setPattern('');
    setAlwaysAsk(false);
    toast('Rule added');
  };

  return (
    <>
      <section className="card">
        <SectionHead
          title="Vendor rules"
          sub="Any transaction whose vendor contains the text gets that category. The longest match wins."
        />
        <div className="stack-2">
          <input className="input" value={pattern} onChange={(e) => setPattern(e.target.value)} placeholder="butcherbox" />
          <div className="row-2">
            <select className="select grow" value={category} onChange={(e) => setCategory(e.target.value)}>
              {state.finance.categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <button className="btn btn-accent" style={{ ['--mod' as string]: ACCENT }} onClick={add} disabled={!pattern.trim()}>Add</button>
          </div>
          <label className="row-2" style={{ cursor: 'pointer' }}>
            <input className="checkbox" type="checkbox" checked={alwaysAsk} onChange={(e) => setAlwaysAsk(e.target.checked)} />
            <span className="t-sm">Always ask what it was for (for vendors like Amazon that sell everything)</span>
          </label>
        </div>
      </section>

      <section className="card">
        <SectionHead
          title={`${state.finance.rules.length} rule${state.finance.rules.length === 1 ? '' : 's'}`}
          action={
            state.finance.rules.length === 0
              ? (
                <button
                  className="btn btn-sm"
                  onClick={() => {
                    update((s) => ({ ...s, finance: { ...s.finance, rules: SEED_RULES.map((r) => ({ ...r, id: uid('rule') })) } }));
                    toast(`${SEED_RULES.length} starter rules added`);
                  }}
                >
                  Add starter set
                </button>
              )
              : undefined
          }
        />
        {state.finance.rules.length === 0 ? (
          <EmptyState icon="⚙️" title="No rules yet" hint="Starter rules cover the usual grocery stores, gas stations and subscriptions." />
        ) : (
          <div className="table-scroll">
            <table className="table">
              <thead><tr><th>Contains</th><th>Category</th><th /></tr></thead>
              <tbody>
                {state.finance.rules.map((r) => (
                  <tr key={r.id}>
                    <td>
                      {r.pattern}
                      {r.alwaysAsk && <span className="chip chip-static" style={{ marginLeft: 6 }}>always ask</span>}
                    </td>
                    <td className="t-sec">{r.category}</td>
                    <td className="num">
                      <button
                        className="link-btn"
                        onClick={() => update((s) => ({ ...s, finance: { ...s.finance, rules: s.finance.rules.filter((x) => x.id !== r.id) } }))}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
