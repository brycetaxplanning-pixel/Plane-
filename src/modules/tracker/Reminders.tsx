import { useState } from 'react';
import { MODULES, REPEATS, type ModuleId, type Reminder, type Repeat } from '../../lib/schema';
import { dueLabel, dueList, googleCalendarUrl, toICS } from '../../lib/reminders';
import { AIError, askJSON, isAIConfigured } from '../../lib/ai';
import { downloadFile } from '../../lib/storage';
import { todayKey } from '../../lib/date';
import { uid } from '../../lib/id';
import { useApp } from '../../state/context';
import { Modal } from '../../components/ui/Modal';
import { EmptyState, Field, SectionHead } from '../../components/ui/Field';
import { DictateInput, VoiceCapture } from '../../components/ui/Dictation';

const SUGGESTIONS = [
  'Haircut',
  'Call mum',
  'Change the car oil',
  'Renew the gym membership',
  'Back up the app data',
];

interface Parsed {
  title?: string;
  date?: string;
  time?: string;
  repeat?: Repeat;
  everyDays?: number;
  notes?: string;
}

export function Reminders() {
  const { state, update, toast } = useApp();
  const due = dueList(state);
  const [editing, setEditing] = useState<Reminder | 'new' | null>(null);
  const [talking, setTalking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const overdue = due.filter((d) => d.overdue);
  const soon = due.filter((d) => !d.overdue);

  const save = (r: Reminder) => {
    update((s) => ({
      ...s,
      reminders: {
        items: s.reminders.items.some((x) => x.id === r.id)
          ? s.reminders.items.map((x) => (x.id === r.id ? r : x))
          : [...s.reminders.items, r],
      },
    }));
    setEditing(null);
    toast('Reminder saved');
  };

  /** Marks it done. A repeating one rolls forward rather than disappearing. */
  const complete = (r: Reminder) => {
    update((s) => ({
      ...s,
      reminders: {
        items: s.reminders.items.map((x) => {
          if (x.id !== r.id) return x;
          if (x.repeat === 'Once') return { ...x, done: true };
          return { ...x, lastDone: todayKey() };
        }),
      },
    }));
    toast(r.repeat === 'Once' ? 'Done' : 'Done — the clock resets');
  };

  /** Turns a spoken sentence into a structured reminder. */
  async function parseSpoken(text: string) {
    setTalking(false);
    if (!isAIConfigured(state.settings)) {
      setEditing({
        id: uid('rem'), title: text.slice(0, 80), repeat: 'Once',
        date: todayKey(), done: false, createdAt: todayKey(),
      });
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const parsed = await askJSON<Parsed>(
        state.settings,
        `Turn a spoken sentence into a reminder.
Return {"title": string, "date": "YYYY-MM-DD" | null, "time": "HH:MM" 24-hour | null, "repeat": "Once"|"Daily"|"Weekly"|"Monthly"|"Every N days", "everyDays": number | null, "notes": string | null}.
The title is short and imperative — "Call the client", not "I need to call the client".
Resolve relative dates against today. If they describe a gap since the last time rather than a date — "every three weeks", "it has been a month since" — use "Every N days" with everyDays set, and leave date null.
If no time is mentioned, leave time null; do not invent one.`,
        `Today is ${todayKey()} (${new Date().toLocaleDateString(undefined, { weekday: 'long' })}).
They said: ${text}`,
      );

      setEditing({
        id: uid('rem'),
        title: parsed.title?.trim() || text.slice(0, 80),
        notes: parsed.notes ?? undefined,
        date: parsed.repeat === 'Every N days' ? undefined : (parsed.date ?? todayKey()),
        time: parsed.time ?? undefined,
        repeat: REPEATS.includes(parsed.repeat as Repeat) ? (parsed.repeat as Repeat) : 'Once',
        everyDays: parsed.everyDays ?? undefined,
        done: false,
        createdAt: todayKey(),
      });
    } catch (err) {
      setError(err instanceof AIError ? [err.message, err.hint].filter(Boolean).join(' ') : 'Could not read that.');
      setEditing({ id: uid('rem'), title: text.slice(0, 80), repeat: 'Once', date: todayKey(), done: false, createdAt: todayKey() });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section className="card">
        <SectionHead title="Remind me" sub="Say it — dates and repeats are worked out for you" />
        {talking ? (
          <VoiceCapture
            onDone={(t) => void parseSpoken(t)}
            placeholder="Meeting at 6:30 on Thursday with the client…"
          >
            <button className="link-btn" onClick={() => setTalking(false)}>Cancel</button>
          </VoiceCapture>
        ) : (
          <div className="row-2 wrap">
            <button className="btn btn-primary btn-lg grow" disabled={busy} onClick={() => setTalking(true)}>
              {busy ? 'Working it out…' : '🎙 Talk a reminder'}
            </button>
            <button className="btn btn-lg" onClick={() => setEditing('new')}>Write one</button>
          </div>
        )}
        {error && <p className="t-xs t-crit" style={{ marginTop: 'var(--sp-2)' }}>{error}</p>}
      </section>

      {overdue.length > 0 && (
        <section className="card">
          <SectionHead title="Overdue" sub={`${overdue.length} waiting`} />
          <div className="stack-2">
            {overdue.map((d) => (
              <ReminderRow key={d.reminder.id} due={d} onDone={() => complete(d.reminder)} onEdit={() => setEditing(d.reminder)} overdue />
            ))}
          </div>
        </section>
      )}

      <section className="card">
        <SectionHead
          title="Coming up"
          sub={soon.length ? `${soon.length} scheduled` : undefined}
          action={
            state.reminders.items.length > 0 ? (
              <button
                className="btn btn-sm"
                onClick={() => {
                  downloadFile('plane-reminders.ics', toICS(state.reminders.items.filter((r) => !r.done)), 'text/calendar');
                  toast('Calendar file downloaded');
                }}
              >
                Add to calendar
              </button>
            ) : undefined
          }
        />
        {soon.length === 0 ? (
          <EmptyState icon="⏰" title="Nothing scheduled" hint="Haircuts, oil changes, the things you forget until they are overdue." />
        ) : (
          <div className="stack-2">
            {soon.map((d) => (
              <ReminderRow key={d.reminder.id} due={d} onDone={() => complete(d.reminder)} onEdit={() => setEditing(d.reminder)} />
            ))}
          </div>
        )}
        {state.reminders.items.length > 0 && (
          <p className="t-xs t-muted" style={{ marginTop: 'var(--sp-3)' }}>
            Opening the downloaded file adds these to Apple Calendar or Outlook, and they sync onward
            from there. Apple has no calendar API for apps, so a file is the route.
          </p>
        )}
      </section>

      {editing && (
        <ReminderForm
          reminder={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onDelete={editing === 'new' || !state.reminders.items.some((x) => x.id === (editing as Reminder).id) ? undefined : () => {
            const id = (editing as Reminder).id;
            update((s) => ({ ...s, reminders: { items: s.reminders.items.filter((x) => x.id !== id) } }));
            setEditing(null);
            toast('Reminder removed');
          }}
          onSave={save}
        />
      )}
    </>
  );
}

function ReminderRow({
  due, onDone, onEdit, overdue,
}: {
  due: ReturnType<typeof dueList>[number];
  onDone: () => void;
  onEdit: () => void;
  overdue?: boolean;
}) {
  const module = MODULES.find((m) => m.id === due.reminder.module);
  return (
    <div className="rowitem" style={overdue ? { borderLeft: '3px solid var(--status-critical)' } : undefined}>
      <button className="grow" style={{ background: 'none', border: 0, textAlign: 'left', cursor: 'pointer', minWidth: 0 }} onClick={onEdit}>
        <span className="t-sm t-bold truncate" style={{ display: 'block' }}>{due.reminder.title}</span>
        <span className={overdue ? 't-xs t-crit' : 't-xs t-muted'}>
          {dueLabel(due)}{module ? ` · ${module.name}` : ''}
        </span>
      </button>
      <a
        className="btn btn-sm btn-ghost"
        href={googleCalendarUrl(due.reminder)}
        target="_blank"
        rel="noopener noreferrer"
        title="Add to Google Calendar"
      >
        📅
      </a>
      <button className="btn btn-sm" onClick={onDone}>Done</button>
    </div>
  );
}

function ReminderForm({
  reminder, onClose, onSave, onDelete,
}: {
  reminder: Reminder | null;
  onClose: () => void;
  onSave: (r: Reminder) => void;
  onDelete?: () => void;
}) {
  const [title, setTitle] = useState(reminder?.title ?? '');
  const [notes, setNotes] = useState(reminder?.notes ?? '');
  const [repeat, setRepeat] = useState<Repeat>(reminder?.repeat ?? 'Once');
  const [date, setDate] = useState(reminder?.date ?? todayKey());
  const [time, setTime] = useState(reminder?.time ?? '');
  const [everyDays, setEveryDays] = useState(String(reminder?.everyDays ?? 21));
  const [module, setModule] = useState<ModuleId | ''>(reminder?.module ?? '');

  const interval = repeat === 'Every N days';

  return (
    <Modal
      title={reminder ? 'Reminder' : 'New reminder'}
      onClose={onClose}
      footer={
        <>
          {onDelete && <button className="btn btn-danger" style={{ marginRight: 'auto' }} onClick={onDelete}>Delete</button>}
          <button className="btn" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-primary"
            disabled={!title.trim()}
            onClick={() => onSave({
              id: reminder?.id ?? uid('rem'),
              title: title.trim(),
              notes: notes.trim() || undefined,
              repeat,
              date: interval ? undefined : date,
              time: interval ? undefined : (time || undefined),
              everyDays: interval ? Math.max(1, Number(everyDays) || 1) : undefined,
              lastDone: reminder?.lastDone,
              module: module || undefined,
              done: false,
              createdAt: reminder?.createdAt ?? todayKey(),
            })}
          >
            Save
          </button>
        </>
      }
    >
      <div className="stack-3">
        <DictateInput
          label="Remind me to"
          value={title}
          onChange={setTitle}
          placeholder="Get a haircut"
          suggestions={reminder ? undefined : SUGGESTIONS}
          autoFocus
        />

        <Field label="How often">
          <div className="row-2 wrap">
            {REPEATS.map((r) => (
              <button key={r} type="button" className="chip" aria-pressed={repeat === r} onClick={() => setRepeat(r)}>{r}</button>
            ))}
          </div>
        </Field>

        {interval ? (
          <Field label="Every how many days" hint="Counts from the last time you marked it done, not from a fixed date.">
            <input className="input" style={{ maxWidth: 110 }} type="number" min={1} value={everyDays} onChange={(e) => setEveryDays(e.target.value)} />
          </Field>
        ) : (
          <div className="grid grid-2" style={{ gap: 'var(--sp-3)' }}>
            <Field label="Date"><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
            <Field label="Time" hint="Leave blank for all day."><input className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} /></Field>
          </div>
        )}

        <DictateInput label="Notes" value={notes} onChange={setNotes} textarea rows={3} placeholder="Anything worth remembering with it" />

        <Field label="Module">
          <select className="select" value={module} onChange={(e) => setModule(e.target.value as ModuleId | '')}>
            <option value="">None</option>
            {MODULES.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </Field>
      </div>
    </Modal>
  );
}
