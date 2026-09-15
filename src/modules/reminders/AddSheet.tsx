import { useRef, useState } from 'react';
import { MODULES, REMIND_UNITS, type ModuleId, type Reminder, type RemindUnit, type Repeat } from '../../lib/schema';
import { AIError, askJSON, isAIConfigured } from '../../lib/ai';
import { todayKey } from '../../lib/date';
import { uid } from '../../lib/id';
import { useApp } from '../../state/context';
import { Modal } from '../../components/ui/Modal';
import { Field } from '../../components/ui/Field';
import { NumberInput } from '../../components/ui/NumberInput';
import { MicButton } from '../../components/ui/Dictation';
import { appendPhrase } from '../../lib/speech';
import { Icons } from '../../components/layout/Icons';

interface Parsed {
  title?: string;
  date?: string;
  time?: string;
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
  reminder, defaultModule, onClose, onSave, onResolve, onDelete,
}: {
  /** null for a new one. */
  reminder: Reminder | null;
  /** Which module a new one belongs to — set when it is being added from
   *  inside that module, or while the list is filtered to it. */
  defaultModule?: ModuleId;
  onClose: () => void;
  onSave: (r: Reminder) => void;
  /** Present only for a follow-up: the one action that actually closes it. */
  onResolve?: () => void;
  onDelete?: () => void;
}) {
  const { state } = useApp();
  const [title, setTitle] = useState(reminder?.title ?? '');
  const [notes, setNotes] = useState(reminder?.notes ?? '');
  const [repeat, setRepeat] = useState<Repeat>(reminder?.repeat ?? 'Once');
  const [date, setDate] = useState(reminder?.date ?? '');
  const [time, setTime] = useState(reminder?.time ?? '');
  // Read only: nothing new sets an interval, but one saved before still shows
  // its cadence in the note offering to end it.
  const everyDays = String(reminder?.everyDays ?? 21);
  const [module, setModule] = useState<ModuleId | ''>(reminder?.module ?? defaultModule ?? '');
  const [remindOn, setRemindOn] = useState(Boolean(reminder?.remindEvery));
  const [remindN, setRemindN] = useState(reminder?.remindEvery?.n ?? 1);
  const [remindUnit, setRemindUnit] = useState<RemindUnit>(reminder?.remindEvery?.unit ?? 'days');
  const [followUp, setFollowUp] = useState(Boolean(reminder?.followUp));

  const carriesDetail = Boolean(
    reminder && (reminder.date || reminder.time || reminder.notes || reminder.module
      || reminder.remindEvery || reminder.followUp || reminder.repeat !== 'Once'),
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
Return {"title": string, "date": "YYYY-MM-DD" | null, "time": "HH:MM" 24-hour | null, "notes": string | null}.
The title is short and imperative — "Call the client", not "I need to call the client".
Resolve relative dates against today.
If no date is mentioned, leave date null; a to-do is allowed to have no date.
If no time is mentioned, leave time null; do not invent one.
Ignore anything about how often — a to-do happens once.`,
        `Today is ${todayKey()} (${new Date().toLocaleDateString(undefined, { weekday: 'long' })}).
They said: ${text}`,
      );

      if (parsed.title?.trim()) setTitle(parsed.title.trim());
      if (parsed.notes) setNotes(parsed.notes);
      if (parsed.date) setDate(parsed.date);
      if (parsed.time) setTime(parsed.time);
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
      remindEvery: remindOn ? { n: Math.max(1, Math.round(remindN)), unit: remindUnit } : undefined,
      followUp: followUp || undefined,
      touches: reminder?.touches,
      lastDone: reminder?.lastDone,
      module: module || undefined,
      done: false,
      createdAt: reminder?.createdAt ?? todayKey(),
    });
  };

  return (
    <Modal
      title={reminder ? 'To-do' : 'Add a to-do'}
      onClose={onClose}
      footer={
        <>
          {onDelete && <button className="btn btn-danger" style={{ marginRight: 'auto' }} onClick={onDelete}>Delete</button>}
          {onResolve && <button className="btn" onClick={onResolve}>Got a reply</button>}
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
              {/* Made before to-dos became one-time things. Rather than let it
                  keep rolling forward invisibly with no way to say so, it says
                  so, and offers the one button that ends it. */}
              {repeat !== 'Once' && (
                <div className="legacyrepeat">
                  <p className="t-sm">
                    This one repeats <b>{repeat === 'Every N days' ? `every ${Math.max(1, Number(everyDays) || 1)} days` : repeat.toLowerCase()}</b>.
                    To-dos are one-time now — a thing that comes round again belongs in Habits.
                  </p>
                  <button type="button" className="btn btn-sm" onClick={() => setRepeat('Once')}>Make it one-time</button>
                </div>
              )}

              <Field label="Complete by" hint="Both optional. Leave them blank and it just sits on the list.">
                <div className="row-2 wrap">
                  <input className="input" style={{ maxWidth: 170 }} type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Complete by date" />
                  <input className="input" style={{ maxWidth: 130 }} type="time" value={time} onChange={(e) => setTime(e.target.value)} aria-label="Complete by time" />
                  {(date || time) && (
                    <button type="button" className="link-btn" onClick={() => { setDate(''); setTime(''); }}>Clear</button>
                  )}
                </div>
              </Field>

              <Field
                label="Remind me"
                hint={remindOn
                  ? 'Every so often until you mark it done — being late is when you most want telling.'
                  : 'Off. You will still be nudged on the day it is due.'}
              >
                <div className="row-2 wrap">
                  <button
                    type="button"
                    className="chip"
                    aria-pressed={remindOn}
                    onClick={() => setRemindOn((v) => !v)}
                  >
                    {remindOn ? 'On' : 'Off'}
                  </button>
                  {remindOn && (
                    <>
                      <span className="t-sm t-muted">every</span>
                      <NumberInput
                        style={{ maxWidth: 90 }}
                        min={1}
                        max={999}
                        value={remindN}
                        onChange={setRemindN}
                        aria-label="How many"
                      />
                      <select
                        className="select"
                        style={{ maxWidth: 130 }}
                        value={remindUnit}
                        onChange={(e) => setRemindUnit(e.target.value as RemindUnit)}
                        aria-label="Minutes, hours or days"
                      >
                        {REMIND_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </>
                  )}
                </div>
              </Field>

              <Field
                label="Waiting on someone"
                hint={followUp
                  ? 'Ticking it records the chase and brings it back. Only a reply closes it.'
                  : 'For a to-do that is not finished until someone else answers.'}
              >
                <button
                  type="button"
                  className="chip"
                  aria-pressed={followUp}
                  onClick={() => setFollowUp((v) => !v)}
                >
                  {followUp ? 'Yes — chase until they reply' : 'No'}
                </button>
                {followUp && (reminder?.touches?.length ?? 0) > 0 && (
                  <p className="t-xs t-muted" style={{ marginTop: 'var(--sp-2)' }}>
                    Chased {reminder?.touches?.length} time{reminder?.touches?.length === 1 ? '' : 's'},
                    last on {reminder?.touches?.[reminder.touches.length - 1]}.
                  </p>
                )}
              </Field>

              <Field label="Notes">
                <textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything worth remembering with it" />
              </Field>

              <Field label="Module" hint="Which part of your life it belongs to. Already set when you add from inside a module.">
                <select className="select" value={module} onChange={(e) => setModule(e.target.value as ModuleId | '')}>
                  <option value="">None</option>
                  {/* Every module but this one. A to-do belonging to the
                      to-do list says nothing — the list is already all of them. */}
                  {MODULES.filter((m) => m.id !== 'reminders').map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </Field>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
