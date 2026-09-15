import { useState } from 'react';
import { MODULES, type ModuleId, type Reminder } from '../lib/schema';
import { chased, dueList, toICS, type DueReminder } from '../lib/reminders';
import { fmtDate, todayKey } from '../lib/date';
import { downloadFile } from '../lib/storage';
import { useApp } from '../state/context';
import { Icons } from '../components/layout/Icons';
import { SwipeRow } from '../components/ui/SwipeRow';
import { Fab } from '../components/ui/Fab';
import { AddSheet } from './reminders/AddSheet';

/**
 * Everything you owe yourself, from every module, on one list.
 *
 * A reminder and a to-do were never two things — both are something you have
 * not done, with a date if it has one and a module if it belongs to one — so
 * there is one list rather than two places to look and a decision to make
 * every time you think of something.
 *
 * Which module a to-do belongs to has been in the record all along and was
 * never shown. It is a tag on the row and a filter along the top now, so
 * "how much of this is work" is answered by looking.
 */
export function Reminders() {
  const { state, update, toast } = useApp();
  const [editing, setEditing] = useState<Reminder | 'new' | null>(null);
  const [only, setOnly] = useState<ModuleId | 'all'>('all');

  const all = dueList(state);
  const today = todayKey();

  /* One chip per module that actually has something open, in module order, so
     the row stays short and never offers a filter that would empty the list. */
  const counts = MODULES
    .map((m) => ({ module: m, n: all.filter((d) => d.reminder.module === m.id).length }))
    .filter((c) => c.n > 0);

  const due = only === 'all' ? all : all.filter((d) => d.reminder.module === only);

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

  /** Ticking it off. A repeating one rolls forward rather than vanishing.
   *
   *  Always undoable: something you finished by mis-tapping is worse than one
   *  you never wrote down, because it leaves the list looking done. */
  const complete = (r: Reminder) => {
    const before = state.reminders.items;
    update((s) => ({
      ...s,
      reminders: {
        items: s.reminders.items.map((x) => {
          if (x.id !== r.id) return x;
          // Chasing someone is not finishing it. It goes back on the list with
          // the chase recorded, and only a reply ends it.
          if (x.followUp) return chased(x);
          return x.repeat === 'Once' ? { ...x, done: true } : { ...x, lastDone: todayKey() };
        }),
      },
    }));
    const n = (r.touches?.length ?? 0) + 1;
    toast(
      r.followUp ? `Chased — ${n} time${n === 1 ? '' : 's'} now`
        : r.repeat === 'Once' ? 'Done' : 'Done — the clock resets',
      undefined,
      { label: 'Undo', run: () => update((s) => ({ ...s, reminders: { items: before } })) },
    );
  };

  /** They answered. This is the only thing that closes a follow-up. */
  const resolve = (r: Reminder) => {
    const before = state.reminders.items;
    update((s) => ({
      ...s,
      reminders: { items: s.reminders.items.map((x) => (x.id === r.id ? { ...x, done: true } : x)) },
    }));
    setEditing(null);
    toast('Closed — they got back to you', undefined, {
      label: 'Undo',
      run: () => update((s) => ({ ...s, reminders: { items: before } })),
    });
  };

  const remove = (r: Reminder) => {
    const before = state.reminders.items;
    update((s) => ({ ...s, reminders: { items: s.reminders.items.filter((x) => x.id !== r.id) } }));
    setEditing(null);
    toast('Deleted', undefined, {
      label: 'Undo',
      run: () => update((s) => ({ ...s, reminders: { items: before } })),
    });
  };

  /* Everything with a real next date — which includes interval reminders,
     whose date is worked out from the last time rather than stored. */
  const dated = all.filter((d) => !d.undated).map((d) => d.reminder);

  return (
    <div className="stack todo-page">
      {counts.length > 0 && (
        <div className="todo-filters" role="group" aria-label="Show one module only">
          <FilterChip on={only === 'all'} onClick={() => setOnly('all')} n={all.length}>All</FilterChip>
          {counts.map(({ module, n }) => (
            <FilterChip key={module.id} on={only === module.id} onClick={() => setOnly(module.id)} n={n} color={module.color}>
              {module.name}
            </FilterChip>
          ))}
        </div>
      )}

      {groups.length === 0 ? (
        <p className="todo-empty">
          {only === 'all' ? 'Nothing to do.' : `Nothing left in ${MODULES.find((m) => m.id === only)?.name}.`}<br />
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

      <Fab onClick={() => setEditing('new')} label="Add a to-do" color="var(--mod-reminders)">
        {Icons.plus()}
      </Fab>

      {editing && (
        <AddSheet
          reminder={editing === 'new' ? null : editing}
          // Adding while a module is filtered means adding to that module.
          defaultModule={only === 'all' ? undefined : only}
          onClose={() => setEditing(null)}
          onSave={save}
          onResolve={editing !== 'new' && editing.followUp ? () => resolve(editing) : undefined}
          onDelete={editing === 'new' ? undefined : () => remove(editing)}
        />
      )}
    </div>
  );
}

function FilterChip({
  on, onClick, n, color, children,
}: {
  on: boolean; onClick: () => void; n: number; color?: string; children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className="todo-chip"
      aria-pressed={on}
      onClick={onClick}
      style={color ? { ['--chip' as string]: color } : undefined}
    >
      {color && <i className="todo-chip-dot" aria-hidden />}
      {children}
      <b>{n}</b>
    </button>
  );
}

/** Title, a circle to tick it off, and a second line only when there is
 *  something to say on it. */
export function TodoRow({
  due, onTick, onOpen, showModule = true,
}: {
  due: DueReminder;
  onTick: () => void;
  onOpen: () => void;
  /** Off inside a module's own section, where every row would say the same. */
  showModule?: boolean;
}) {
  const { reminder: r } = due;
  const module = showModule ? MODULES.find((m) => m.id === r.module) : undefined;

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
    r.followUp && (r.touches?.length ?? 0) > 0
      ? `chased ${r.touches?.length}\u00d7`
      : null,
    when,
    r.repeat === 'Every N days' ? null : r.time || null,
    // A legacy repeat, still shown so a to-do that rolls forward never does it
    // silently. Nothing new can be given one.
    r.repeat === 'Once' ? null
      : r.repeat === 'Every N days' ? `every ${Math.max(1, r.everyDays ?? 7)} days`
        : r.repeat.toLowerCase(),
    r.remindEvery
      ? `nudged every ${r.remindEvery.n} ${r.remindEvery.n === 1 ? r.remindEvery.unit.replace(/s$/, '') : r.remindEvery.unit}`
      : null,
  ].filter(Boolean).join(' · ');

  return (
    <div className={`todo-row${due.overdue ? ' is-late' : ''}`}>
      <button
        className={`todo-tick${r.followUp ? ' is-chase' : ''}`}
        onClick={onTick}
        aria-label={r.followUp ? `Chased ${r.title} again` : `Mark ${r.title} done`}
        title={r.followUp ? 'Chased again — it comes back until they reply' : undefined}
      >
        <span aria-hidden>{r.followUp ? Icons.repeat() : Icons.check()}</span>
      </button>
      <button className="todo-open" onClick={onOpen}>
        <span className="todo-title">{r.title}</span>
        {(module || meta) && (
          <span className="todo-sub">
            {module && (
              <span className="todo-tag" style={{ ['--chip' as string]: module.color }}>
                <i aria-hidden />{module.name}
              </span>
            )}
            {meta && <span className="todo-meta">{meta}</span>}
          </span>
        )}
      </button>
    </div>
  );
}
