import { useState } from 'react';
import type { Reminder } from '../lib/schema';
import { dueList, toICS, type DueReminder } from '../lib/reminders';
import { fmtDate, todayKey } from '../lib/date';
import { downloadFile } from '../lib/storage';
import { useApp } from '../state/context';
import { Icons } from '../components/layout/Icons';
import { SwipeRow } from '../components/ui/SwipeRow';
import { Fab } from '../components/ui/Fab';
import { AddSheet } from './reminders/AddSheet';

/**
 * A list of things you have to do, and one button to add to it.
 *
 * This screen was five stacked cards — a capture box, a "talk or write" pair,
 * and a titled panel per bucket — plus a paragraph explaining Apple's calendar
 * policy, before you reached a single to-do. All of it was real, and all of it
 * was in the way. The list is now the page: the buckets are thin labels rather
 * than panels, and everything you might do to a reminder lives on the reminder
 * or behind the plus.
 */
export function Reminders() {
  const { state, update, toast } = useApp();
  const [editing, setEditing] = useState<Reminder | 'new' | null>(null);

  const due = dueList(state);
  const today = todayKey();

  /* Four buckets, in the order they deserve attention. Empty ones do not
     appear at all — a heading over nothing is just noise. */
  const groups: { label: string; items: DueReminder[] }[] = [
    { label: 'Overdue', items: due.filter((d) => d.overdue) },
    { label: 'Today', items: due.filter((d) => !d.undated && !d.overdue && d.due === today) },
    { label: 'Later', items: due.filter((d) => !d.undated && !d.overdue && d.due > today) },
    { label: 'Anytime', items: due.filter((d) => d.undated) },
  ].filter((g) => g.items.length > 0);

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
    toast('Saved');
  };

  /** Ticking it off. A repeating one rolls forward rather than vanishing. */
  const complete = (r: Reminder) => {
    update((s) => ({
      ...s,
      reminders: {
        items: s.reminders.items.map((x) => {
          if (x.id !== r.id) return x;
          return x.repeat === 'Once' ? { ...x, done: true } : { ...x, lastDone: todayKey() };
        }),
      },
    }));
    toast(r.repeat === 'Once' ? 'Done' : 'Done — the clock resets');
  };

  const remove = (r: Reminder) => {
    const keep = state.reminders.items;
    update((s) => ({ ...s, reminders: { items: s.reminders.items.filter((x) => x.id !== r.id) } }));
    setEditing(null);
    toast('Deleted', undefined, {
      label: 'Undo',
      run: () => update((s) => ({ ...s, reminders: { items: keep } })),
    });
  };

  /* Everything with a real next date — which includes interval reminders, whose
     date is computed from the last time rather than stored. Filtering on
     `r.date` here quietly dropped every "every N days" one from the export. */
  const dated = due.filter((d) => !d.undated).map((d) => d.reminder);

  return (
    <div className="stack todo-page">
      {groups.length === 0 ? (
        <p className="todo-empty">
          Nothing to do.<br />
          <span className="t-muted">Press the plus to write something down.</span>
        </p>
      ) : (
        groups.map((g) => (
          <section key={g.label}>
            <h2 className="todo-group">{g.label}<span>{g.items.length}</span></h2>
            <ul className="todo">
              {g.items.map((d) => (
                <li key={d.reminder.id}>
                  <SwipeRow onDelete={() => remove(d.reminder)} label={d.reminder.title}>
                    <TodoRow due={d} onTick={() => complete(d.reminder)} onOpen={() => setEditing(d.reminder)} />
                  </SwipeRow>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      {/* One quiet way out to a calendar, for the dated ones only. It used to
          be a button plus three lines explaining that Apple has no calendar
          API — true, and not something to read every time you open a list. */}
      {dated.length > 0 && (
        <button
          className="link-btn todo-export"
          onClick={() => {
            downloadFile('plane-reminders.ics', toICS(dated), 'text/calendar');
            toast('Calendar file downloaded');
          }}
        >
          Add the dated ones to a calendar
        </button>
      )}

      <Fab onClick={() => setEditing('new')} label="Add a reminder" color="var(--mod-reminders)">
        {Icons.plus()}
      </Fab>

      {editing && (
        <AddSheet
          reminder={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSave={save}
          onDelete={editing === 'new' ? undefined : () => remove(editing)}
        />
      )}
    </div>
  );
}

/** Title, a circle to tick it off, and a second line only when there is
 *  something to say on it. */
function TodoRow({ due, onTick, onOpen }: { due: DueReminder; onTick: () => void; onOpen: () => void }) {
  const { reminder: r } = due;

  /* An interval reminder is answering "how long has it been", so it says that
     rather than a date — "27 days ago · every 21" tells you you are overdue
     and by how much in one read. Everything else is a date. */
  const when = r.repeat === 'Every N days'
    ? (due.sinceLast === null ? 'never done' : `${due.sinceLast} days ago`)
    : due.undated ? null
      : due.daysAway === 0 ? 'Today'
        : due.daysAway === 1 ? 'Tomorrow'
          : due.daysAway === -1 ? 'Yesterday'
            : fmtDate(due.due);

  const meta = [
    when,
    r.repeat === 'Every N days' ? null : r.time || null,
    r.repeat === 'Once' ? null
      : r.repeat === 'Every N days' ? `every ${Math.max(1, r.everyDays ?? 7)} days`
        : r.repeat.toLowerCase(),
  ].filter(Boolean).join(' · ');

  return (
    <div className={`todo-row${due.overdue ? ' is-late' : ''}`}>
      <button className="todo-tick" onClick={onTick} aria-label={`Mark ${r.title} done`}>
        <span aria-hidden>{Icons.check()}</span>
      </button>
      <button className="todo-open" onClick={onOpen}>
        <span className="todo-title">{r.title}</span>
        {meta && <span className="todo-meta">{meta}</span>}
      </button>
    </div>
  );
}
