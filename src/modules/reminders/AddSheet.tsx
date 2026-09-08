import { useRef, useState } from 'react';
import { MODULES, REPEATS, type ModuleId, type Reminder, type Repeat } from '../../lib/schema';
import { AIError, askJSON, isAIConfigured } from '../../lib/ai';
import { todayKey } from '../../lib/date';
import { uid } from '../../lib/id';
import { useApp } from '../../state/context';
import { Modal } from '../../components/ui/Modal';
import { Field } from '../../components/ui/Field';
import { MicButton } from '../../components/ui/Dictation';
import { appendPhrase } from '../../lib/speech';
import { Icons } from '../../components/layout/Icons';

interface Parsed {
  title?: string;
  date?: string;
  time?: string;
  repeat?: Repeat;
  everyDays?: number;
  notes?: string;
}

/**
 * Write down one thing.
 *
 * The sheet opens as a single line and a Save button, because that is the
 * whole job nine times out of ten: you remember something, you put it down,
 * you get on. Dates, repeats, notes and which module it belongs to are all
 * real and all still here — they are just folded behind one press, so they
 * cost nothing to ignore.
 *
 * There is one field and a microphone on it, and that is the whole of the
 * talking story. It used to be a card offering "talk" or "write" before you
 * had decided you wanted either, and then a second button inside that to
 * actually start listening — two presses and a choice to answer a question
 * you had already answered.
 *
 * Speaking a sentence is itself the request to have it understood, so when a
 * spell of dictation ends the sentence is taken apart into fields and the fold
 * opens on the result. Typing stays literal: what you type is the title.
 *
 * An existing reminder that already carries detail opens with the fold already
 * open, so editing never hides what is set.
 */
export function AddSheet({
  reminder, defaultModule, onClose, onSave, onDelete,
}: {
  /** null for a new one. */
  reminder: Reminder | null;
  /** Which module a new one belongs to — set when it is being added from
   *  inside that module, or while the list is filtered to it. */
  defaultModule?: ModuleId;
  onClose: () => void;
  onSave: (r: Reminder) => void;
  onDelete?: () => void;
}) {
  const { state } = useApp();
  const [title, setTitle] = useState(reminder?.title ?? '');
  const [notes, setNotes] = useState(reminder?.notes ?? '');
  const [repeat, setRepeat] = useState<Repeat>(reminder?.repeat ?? 'Once');
  const [date, setDate] = useState(reminder?.date ?? '');
  const [time, setTime] = useState(reminder?.time ?? '');
  const [everyDays, setEveryDays] = useState(String(reminder?.everyDays ?? 21));
  const [module, setModule] = useState<ModuleId | ''>(reminder?.module ?? defaultModule ?? '');

  const carriesDetail = Boolean(
    reminder && (reminder.date || reminder.time || reminder.notes || reminder.module || reminder.repeat !== 'Once'),
  );
  const [open, setOpen] = useState(carriesDetail);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Whether the current text arrived by voice. Only a spoken sentence gets
   *  taken apart — typing what you want is not a request to reinterpret it. */
  const spoken = useRef(false);
  const titleRef = useRef(title);
  titleRef.current = title;

  const interval = repeat === 'Every N days';

  /** A recurring reminder counts from a date, so choosing one without a date
   *  would produce a repeat that never comes due. Today is the honest default
   *  and is the one they can see and change. */
  const pickRepeat = (r: Repeat) => {
    setRepeat(r);
    if (r !== 'Once' && r !== 'Every N days' && !date) setDate(todayKey());
  };

  /** A spoken sentence, taken apart into fields. Whatever it works out is put
   *  in the form with the fold open rather than saved behind your back — it is
   *  a first draft of the reminder, not a decision. */
  async function parseSpoken(text: string) {
    // Two words is a title, not a sentence with a date hidden in it. Sending
    // "call mum" to be parsed spends a request to be told it is "call mum".
    if (!isAIConfigured(state.settings) || text.trim().split(/\s+/).length < 4) return;

    setBusy(true);
    setError(null);
    try {
      const parsed = await askJSON<Parsed>(
        state.settings,
        `Turn a spoken sentence into a reminder.
Return {"title": string, "date": "YYYY-MM-DD" | null, "time": "HH:MM" 24-hour | null, "repeat": "Once"|"Daily"|"Weekly"|"Monthly"|"Every N days", "everyDays": number | null, "notes": string | null}.
The title is short and imperative — "Call the client", not "I need to call the client".
Resolve relative dates against today. If they describe a gap since the last time rather than a date — "every three weeks", "it has been a month since" — use "Every N days" with everyDays set, and leave date null.
If no date is mentioned, leave date null; a reminder is allowed to have no date.
If no time is mentioned, leave time null; do not invent one.`,
        `Today is ${todayKey()} (${new Date().toLocaleDateString(undefined, { weekday: 'long' })}).
They said: ${text}`,
      );

      if (parsed.title?.trim()) setTitle(parsed.title.trim());
      if (parsed.notes) setNotes(parsed.notes);
      if (parsed.repeat && REPEATS.includes(parsed.repeat)) setRepeat(parsed.repeat);
      if (parsed.date) setDate(parsed.date);
      if (parsed.time) setTime(parsed.time);
      if (parsed.everyDays) setEveryDays(String(parsed.everyDays));
      setOpen(true);
    } catch (err) {
      setError(err instanceof AIError ? [err.message, err.hint].filter(Boolean).join(' ') : 'Could not read that.');
    } finally {
      setBusy(false);
    }
  }

  const submit = () => {
    if (!title.trim()) return;
    onSave({
      id: reminder?.id ?? uid('rem'),
      title: title.trim(),
      notes: notes.trim() || undefined,
      repeat,
      // No date unless one was actually chosen. Defaulting this to today is
      // what used to stamp a deadline on everything you wrote down.
      date: interval ? undefined : (date || undefined),
      time: interval ? undefined : (time || undefined),
      everyDays: interval ? Math.max(1, Number(everyDays) || 1) : undefined,
      lastDone: reminder?.lastDone,
      module: module || undefined,
      done: false,
      createdAt: reminder?.createdAt ?? todayKey(),
    });
  };

  return (
    <Modal
      title={reminder ? 'Reminder' : 'Add a reminder'}
      onClose={onClose}
      footer={
        <>
          {onDelete && <button className="btn btn-danger" style={{ marginRight: 'auto' }} onClick={onDelete}>Delete</button>}
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={!title.trim() || busy} onClick={submit}>Save</button>
        </>
      }
    >
      {(
        <div className="stack-3">
          <div className="askline">
            <input
              className="input askline-input"
              value={title}
              onChange={(e) => { setTitle(e.target.value); spoken.current = false; }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }}
              placeholder="Type what you need to do"
              aria-label="What you need to do"
              enterKeyHint="done"
              autoComplete="off"
              autoFocus
            />
            {/* Renders nothing at all where speech is unavailable, so there is
                no dead button and no hole where one would have been. */}
            <MicButton
              size="lg"
              title="Talk instead of typing"
              onPhrase={(p) => { spoken.current = true; setTitle((t) => appendPhrase(t, p)); }}
              onDone={() => { if (spoken.current) void parseSpoken(titleRef.current); }}
            />
          </div>

          <div className="askfolds">
            <button type="button" className="disclose" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
              <span className={`disclose-mark${open ? ' is-open' : ''}`} aria-hidden>{Icons.chevron()}</span>
              {open ? 'Less detail' : 'Add more detail'}
            </button>
          </div>

          {busy && <p className="t-xs t-muted">Reading that…</p>}
          {error && <p className="t-xs t-crit">{error}</p>}

          {open && (
            <div className="stack-3">
              <Field label="How often">
                <div className="row-2 wrap">
                  {REPEATS.map((r) => (
                    <button key={r} type="button" className="chip" aria-pressed={repeat === r} onClick={() => pickRepeat(r)}>{r}</button>
                  ))}
                </div>
              </Field>

              {interval ? (
                <Field label="Every how many days" hint="Counts from the last time you marked it done, not from a fixed date.">
                  <input className="input" style={{ maxWidth: 110 }} type="number" min={1} value={everyDays} onChange={(e) => setEveryDays(e.target.value)} />
                </Field>
              ) : (
                <div className="grid grid-2" style={{ gap: 'var(--sp-3)' }}>
                  <Field label="Date" hint="Leave blank and it just sits on the list.">
                    <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                  </Field>
                  <Field label="Time" hint="Leave blank for all day.">
                    <input className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
                  </Field>
                </div>
              )}

              <Field label="Notes">
                <textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything worth remembering with it" />
              </Field>

              <Field label="Module">
                <select className="select" value={module} onChange={(e) => setModule(e.target.value as ModuleId | '')}>
                  <option value="">None</option>
                  {MODULES.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </Field>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
