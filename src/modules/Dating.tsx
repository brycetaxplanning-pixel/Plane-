import { useState } from 'react';
import { DATING_STATUS, type DatingStatus, type Outing, type Person } from '../lib/schema';
import { XP } from '../lib/gamification';
import { fmtMoney } from '../lib/finance';
import { fmtDateFull, relativeDay, todayKey } from '../lib/date';
import { uid } from '../lib/id';
import { datingStats, shareOfBudget } from '../lib/dating';
import { useApp } from '../state/context';
import { Modal } from '../components/ui/Modal';
import { EmptyState, Field, SectionHead } from '../components/ui/Field';
import { DictateInput } from '../components/ui/Dictation';
import { StatTile } from '../components/charts/StatTile';

const ACCENT = 'var(--mod-dating)';

const statusClass = (s: DatingStatus) =>
  s === 'Seeing' ? 'status status-good'
  : s === 'Talking' ? 'status status-neutral'
  : 'status status-neutral';

export function Dating() {
  const { state, update, reward, toast } = useApp();
  const cur = state.settings.currency;
  const stats = datingStats(state);
  const budget = shareOfBudget(state);

  const [editingPerson, setEditingPerson] = useState<Person | 'new' | null>(null);
  const [logging, setLogging] = useState<Person | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const savePerson = (p: Person) => {
    update((s) => ({
      ...s,
      dating: {
        ...s.dating,
        people: s.dating.people.some((x) => x.id === p.id)
          ? s.dating.people.map((x) => (x.id === p.id ? p : x))
          : [...s.dating.people, p],
      },
    }));
    setEditingPerson(null);
    toast('Saved');
  };

  const removePerson = (id: string) => {
    update((s) => ({
      ...s,
      dating: {
        people: s.dating.people.filter((p) => p.id !== id),
        outings: s.dating.outings.filter((o) => o.personId !== id),
      },
    }));
    setEditingPerson(null);
    toast('Removed, along with everything logged against them');
  };

  const saveOuting = (o: Outing) => {
    reward('dating', XP.outing, `Logged ${o.what}`, (s) => ({
      ...s,
      dating: { ...s.dating, outings: [...s.dating.outings, o] },
    }));
    setLogging(null);
  };

  if (state.dating.people.length === 0) {
    return (
      <div className="stack">
        <Privacy />
        <section className="card">
          <EmptyState
            icon="🌹"
            title="Nobody tracked yet"
            hint="Add someone by first name or initials, then log what you actually spend."
          />
          <button className="btn btn-accent btn-lg btn-block" style={{ ['--mod' as string]: ACCENT }} onClick={() => setEditingPerson('new')}>
            + Add someone
          </button>
        </section>
        {editingPerson && <PersonForm person={null} onClose={() => setEditingPerson(null)} onSave={savePerson} />}
      </div>
    );
  }

  return (
    <div className="stack">
      <section className="card" style={{ ['--mod' as string]: ACCENT }}>
        <SectionHead title="What it comes to" sub="Everything logged, across everyone" />
        <div className="grid grid-3" style={{ gap: 'var(--sp-3)' }}>
          <StatTile
            label="Spent"
            value={fmtMoney(stats.totalSpend, cur)}
            caption={`${fmtMoney(stats.monthSpend, cur)} this month`}
          />
          <StatTile
            label="Per outing"
            value={stats.perOuting !== null ? fmtMoney(stats.perOuting, cur) : '—'}
            caption={`${stats.totalOutings} logged`}
          />
          <StatTile
            label="Per night together"
            value={stats.perNight !== null ? fmtMoney(stats.perNight, cur) : '—'}
            caption={stats.totalNights ? `${stats.totalNights} logged` : 'none logged'}
          />
        </div>

        {budget && (
          <p className="t-sm t-sec" style={{ marginTop: 'var(--sp-3)' }}>
            {fmtMoney(budget.spend, cur)} this month is {Math.round(budget.pct * 100)}% of your{' '}
            {fmtMoney(budget.budget, cur)} monthly budget.
          </p>
        )}
      </section>

      {stats.rows.map((row) => {
        const isOpen = open === row.person.id;
        return (
          <section key={row.person.id} className="card" style={{ ['--mod' as string]: ACCENT }}>
            <div className="row-2" style={{ alignItems: 'flex-start' }}>
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="row-2" style={{ gap: 6 }}>
                  <h3 className="t-md t-bold">{row.person.label}</h3>
                  <span className={statusClass(row.person.status)}>{row.person.status}</span>
                </div>
                <p className="t-xs t-muted">
                  {row.person.metAt ? `Met: ${row.person.metAt} · ` : ''}
                  {row.lastSeen ? `last seen ${relativeDay(row.lastSeen)}` : 'nothing logged yet'}
                </p>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setEditingPerson(row.person)}>Edit</button>
            </div>

            {row.person.notes && <p className="t-sm t-sec" style={{ marginTop: 'var(--sp-2)' }}>{row.person.notes}</p>}

            <div className="grid grid-3" style={{ gap: 'var(--sp-3)', marginTop: 'var(--sp-3)' }}>
              <StatTile label="Spent" value={fmtMoney(row.spend, cur)} caption={`${row.outings.length} outing${row.outings.length === 1 ? '' : 's'}`} />
              <StatTile
                label="Per outing"
                value={row.perOuting !== null ? fmtMoney(row.perOuting, cur) : '—'}
                caption={row.outings.length ? 'average' : 'nothing logged'}
              />
              <StatTile
                label="Per night"
                value={row.perNight !== null ? fmtMoney(row.perNight, cur) : '—'}
                caption={row.nights ? `${row.nights} logged` : 'none logged'}
              />
            </div>

            <div className="row-2 wrap" style={{ marginTop: 'var(--sp-3)' }}>
              <button className="btn btn-accent" style={{ ['--mod' as string]: ACCENT }} onClick={() => setLogging(row.person)}>
                + Log an outing
              </button>
              {row.outings.length > 0 && (
                <button className="btn" onClick={() => setOpen(isOpen ? null : row.person.id)}>
                  {isOpen ? 'Hide' : `Show ${row.outings.length}`}
                </button>
              )}
            </div>

            {isOpen && (
              <div className="stack-2" style={{ marginTop: 'var(--sp-3)' }}>
                {row.outings.map((o) => (
                  <div key={o.id} className="rowitem">
                    <span className="grow" style={{ minWidth: 0 }}>
                      <span className="t-sm t-bold truncate" style={{ display: 'block' }}>{o.what}</span>
                      <span className="t-xs t-muted">
                        {fmtDateFull(o.date)}{o.intimate ? ' · stayed over' : ''}{o.notes ? ` · ${o.notes}` : ''}
                      </span>
                    </span>
                    <span className="t-sm t-num">{fmtMoney(o.cost, cur)}</span>
                    <button
                      className="btn btn-ghost btn-icon"
                      aria-label={`Remove ${o.what}`}
                      onClick={() => {
                        update((s) => ({ ...s, dating: { ...s.dating, outings: s.dating.outings.filter((x) => x.id !== o.id) } }));
                        toast('Removed');
                      }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        );
      })}

      <button className="btn btn-block" onClick={() => setEditingPerson('new')}>+ Add someone</button>

      <Privacy />

      {editingPerson && (
        <PersonForm
          person={editingPerson === 'new' ? null : editingPerson}
          onClose={() => setEditingPerson(null)}
          onSave={savePerson}
          onDelete={editingPerson === 'new' ? undefined : () => removePerson((editingPerson as Person).id)}
        />
      )}

      {logging && <OutingForm person={logging} onClose={() => setLogging(null)} onSave={saveOuting} />}
    </div>
  );
}

function Privacy() {
  return (
    <section className="card card-sunken">
      <p className="t-sm t-sec" style={{ margin: 0 }}>
        This is the one part of the app holding information about someone who never agreed to be in it, so it asks for
        as little as it can: a first name or initials, and what you spent. It is stored on this device like everything
        else, and it is in the export — worth knowing before you send that file anywhere.
      </p>
    </section>
  );
}

function PersonForm({
  person, onClose, onSave, onDelete,
}: {
  person: Person | null;
  onClose: () => void;
  onSave: (p: Person) => void;
  onDelete?: () => void;
}) {
  const [label, setLabel] = useState(person?.label ?? '');
  const [metAt, setMetAt] = useState(person?.metAt ?? '');
  const [status, setStatus] = useState<DatingStatus>(person?.status ?? 'Talking');
  const [notes, setNotes] = useState(person?.notes ?? '');

  return (
    <Modal
      title={person ? 'Edit' : 'Add someone'}
      onClose={onClose}
      footer={
        <>
          {onDelete && <button className="btn btn-danger" style={{ marginRight: 'auto' }} onClick={onDelete}>Delete</button>}
          <button className="btn" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-accent"
            style={{ ['--mod' as string]: ACCENT }}
            disabled={!label.trim()}
            onClick={() =>
              onSave({
                id: person?.id ?? uid('per'),
                label: label.trim(),
                metAt: metAt.trim() || undefined,
                status,
                notes: notes.trim() || undefined,
                startedAt: person?.startedAt ?? todayKey(),
              })
            }
          >
            Save
          </button>
        </>
      }
    >
      <div className="stack-2">
        <Field label="Name" hint="A first name or initials. There is no field for a surname or a number, on purpose.">
          <input className="input" value={label} autoFocus onChange={(e) => setLabel(e.target.value)} placeholder="Sam, or S.M." />
        </Field>
        <Field label="Where you met">
          <input className="input" value={metAt} onChange={(e) => setMetAt(e.target.value)} placeholder="Hinge, the gym, a friend" />
        </Field>
        <Field label="Where it is">
          <div className="pillbar">
            {DATING_STATUS.map((s) => (
              <button key={s} className={`chip${status === s ? ' is-on' : ''}`} onClick={() => setStatus(s)}>{s}</button>
            ))}
          </div>
        </Field>
        <DictateInput label="Notes" value={notes} onChange={setNotes} placeholder="Anything worth remembering" textarea rows={2} />
      </div>
    </Modal>
  );
}

const WHAT_SUGGESTIONS = ['Dinner', 'Drinks', 'Coffee', 'Movie', 'Stayed in', 'Weekend away'];

function OutingForm({ person, onClose, onSave }: { person: Person; onClose: () => void; onSave: (o: Outing) => void }) {
  const { state } = useApp();
  const cur = state.settings.currency;
  const [date, setDate] = useState(todayKey());
  const [what, setWhat] = useState('');
  const [cost, setCost] = useState('');
  const [intimate, setIntimate] = useState(false);
  const [notes, setNotes] = useState('');

  return (
    <Modal
      title={`Outing with ${person.label}`}
      onClose={onClose}
      footer={
        <>
          <span className="grow" />
          <button className="btn" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-accent"
            style={{ ['--mod' as string]: ACCENT }}
            disabled={!what.trim()}
            onClick={() =>
              onSave({
                id: uid('out'),
                personId: person.id,
                date,
                what: what.trim(),
                cost: Number(cost) || 0,
                intimate: intimate || undefined,
                notes: notes.trim() || undefined,
              })
            }
          >
            Save
          </button>
        </>
      }
    >
      <div className="stack-2">
        <Field label="Date"><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <DictateInput label="What it was" value={what} onChange={setWhat} suggestions={WHAT_SUGGESTIONS} placeholder="Dinner at the Thai place" autoFocus />
        <Field label={`What you spent (${cur})`} hint="Your share. Zero is fine — a night in still counts as an outing.">
          <input className="input" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="0" />
        </Field>
        <label className="row-2" style={{ cursor: 'pointer' }}>
          <input type="checkbox" className="checkbox" checked={intimate} onChange={(e) => setIntimate(e.target.checked)} />
          <span className="t-sm">Stayed over — counts toward the per-night figure</span>
        </label>
        <DictateInput label="Notes" value={notes} onChange={setNotes} placeholder="Optional" textarea rows={2} />
      </div>
    </Modal>
  );
}
