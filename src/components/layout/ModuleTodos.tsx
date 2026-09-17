import { useState } from 'react';
import type { ModuleId, Reminder } from '../../lib/schema';
import { chased, dueList } from '../../lib/reminders';
import { todayKey } from '../../lib/date';
import { useApp } from '../../state/context';
import { SwipeRow } from '../ui/SwipeRow';
import { Modal } from '../ui/Modal';
import { AddSheet } from '../../modules/reminders/AddSheet';
import { TodoRow } from '../../modules/Reminders';
import { Icons } from './Icons';
import { useCurrentSubLevel } from './SubLevel';

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
 *
 * A module with parts — Business, with a business each — gets one list per
 * part. Sharing one list between two businesses meant opening the second and
 * being handed the first one's work; a to-do written inside a business carries
 * its id and only comes back there. At the module's own top level, above the
 * parts, the list is all of them.
 *
 * It is a corner, not a card. A full list at the foot of every screen was a
 * second list competing with the module's own work; what is wanted there is
 * the two things you came for — put one down, or see what is outstanding —
 * and each opens over the page rather than pushing it further down.
 */
export function ModuleTodos({ id }: { id: ModuleId }) {
  const { state, update, toast } = useApp();
  const [editing, setEditing] = useState<Reminder | 'new' | null>(null);
  const [listing, setListing] = useState(false);
  const sub = useCurrentSubLevel();

  const mine = dueList(state)
    .filter((d) => d.reminder.module === id)
    .filter((d) => !sub || d.reminder.sub === sub.id);

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
          if (x.followUp) return chased(x);
          return x.repeat === 'Once' ? { ...x, done: true } : { ...x, lastDone: todayKey() };
        }),
      },
    }));
    toast('Done', undefined, {
      label: 'Undo',
      run: () => update((s) => ({ ...s, reminders: { items: before } })),
    });
  };

  /** They answered. The only thing that closes a follow-up. */
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

  const open = mine.length;

  return (
    <section className="modtodo">
      <span className="modtodo-label">To Do</span>
      <div className="modtodo-acts">
        <button className="modtodo-btn" onClick={() => setEditing('new')} aria-label="Add a to-do here">
          <span aria-hidden>{Icons.plus()}</span>
        </button>
        <button
          className="modtodo-btn"
          onClick={() => setListing(true)}
          aria-label={`Show the ${open} to-do${open === 1 ? '' : 's'} here`}
        >
          <span aria-hidden>{Icons.checklist()}</span>
          {open > 0 && <b>{open}</b>}
        </button>
      </div>

      {listing && (
        <Modal title="To do here" onClose={() => setListing(false)}>
          {mine.length === 0 ? (
            <p className="t-sm t-muted">Nothing outstanding in this module.</p>
          ) : (
            <ul className="todo">
              {mine.map((d) => (
                <li key={d.reminder.id}>
                  <SwipeRow onDelete={() => remove(d.reminder)} label={d.reminder.title}>
                    {/* No module tag: every row in here carries the same one. */}
                    <TodoRow due={d} showModule={false} onTick={() => complete(d.reminder)} onOpen={() => setEditing(d.reminder)} />
                  </SwipeRow>
                </li>
              ))}
            </ul>
          )}
        </Modal>
      )}

      {editing && (
        <AddSheet
          reminder={editing === 'new' ? null : editing}
          defaultModule={id}
          defaultSub={sub?.id}
          onClose={() => setEditing(null)}
          onSave={save}
          onResolve={editing !== 'new' && editing.followUp ? () => resolve(editing) : undefined}
          onDelete={editing === 'new' ? undefined : () => remove(editing)}
        />
      )}
    </section>
  );
}
