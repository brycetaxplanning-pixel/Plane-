import { useState } from 'react';
import type { ModuleId, Reminder } from '../../lib/schema';
import { dueList } from '../../lib/reminders';
import { todayKey } from '../../lib/date';
import { useApp } from '../../state/context';
import { SwipeRow } from '../ui/SwipeRow';
import { AddSheet } from '../../modules/reminders/AddSheet';
import { TodoRow } from '../../modules/Reminders';
import { Icons } from './Icons';

/**
 * A module's own slice of the one to-do list.
 *
 * There is no second store behind this. A to-do has carried an optional module
 * since the day it was written, so "the work to-dos" is a filter, not a copy —
 * which means adding one here and adding one in the To Do module with Work
 * chosen produce exactly the same record, and neither can drift from the other.
 *
 * Rendered by the shell for every module rather than pasted into eleven
 * screens, so a module cannot quietly end up without one.
 */
export function ModuleTodos({ id }: { id: ModuleId }) {
  const { state, update, toast } = useApp();
  const [editing, setEditing] = useState<Reminder | 'new' | null>(null);

  const mine = dueList(state).filter((d) => d.reminder.module === id);

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

  const complete = (r: Reminder) => {
    const before = state.reminders.items;
    update((s) => ({
      ...s,
      reminders: {
        items: s.reminders.items.map((x) => {
          if (x.id !== r.id) return x;
          return x.repeat === 'Once' ? { ...x, done: true } : { ...x, lastDone: todayKey() };
        }),
      },
    }));
    toast('Done', undefined, {
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

  return (
    <section className="card modtodo">
      <div className="card-head">
        <h3>To do</h3>
        {/* Named, not just "Add": a module screen usually has an Add of its
            own — Finance has one — and two buttons with the same word on one
            screen is a guess for anyone reading it out or driving it. */}
        <button className="btn btn-sm" onClick={() => setEditing('new')}>
          <span className="btn-glyph" aria-hidden>{Icons.plus()}</span> Add to-do
        </button>
      </div>

      {mine.length === 0 ? (
        <p className="t-sm t-muted">Nothing outstanding here.</p>
      ) : (
        <ul className="todo">
          {mine.map((d) => (
            <li key={d.reminder.id}>
              <SwipeRow onDelete={() => remove(d.reminder)} label={d.reminder.title}>
                {/* No module tag: every row in here would carry the same one. */}
                <TodoRow due={d} showModule={false} onTick={() => complete(d.reminder)} onOpen={() => setEditing(d.reminder)} />
              </SwipeRow>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <AddSheet
          reminder={editing === 'new' ? null : editing}
          defaultModule={id}
          onClose={() => setEditing(null)}
          onSave={save}
          onDelete={editing === 'new' ? undefined : () => remove(editing)}
        />
      )}
    </section>
  );
}
