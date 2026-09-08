import { useState } from 'react';
import type { Reminder } from '../lib/schema';
import { todayKey } from '../lib/date';
import { uid } from '../lib/id';
import { useApp } from '../state/context';
import { Icons } from '../components/layout/Icons';
import { ReminderList } from './reminders/List';

/**
 * The whole module exists because "add a thing I need to do" was three taps
 * deep inside another module's second tab, which is the same as not existing.
 *
 * So the first thing on the screen is a box and a button, and a reminder with
 * no date is a first-class thing rather than a half-filled form — a date is
 * something you add later, if it turns out to have one.
 */
export function Reminders() {
  const { update, toast } = useApp();
  const [title, setTitle] = useState('');

  const add = () => {
    const text = title.trim();
    if (!text) return;
    const reminder: Reminder = {
      id: uid('rem'),
      title: text,
      repeat: 'Once',
      done: false,
      createdAt: todayKey(),
    };
    update((s) => ({ ...s, reminders: { items: [...s.reminders.items, reminder] } }));
    setTitle('');
    toast('Added');
  };

  return (
    <div className="stack">
      <section className="card" style={{ ['--mod' as string]: 'var(--mod-reminders)' }}>
        <form
          className="quickadd"
          onSubmit={(e) => { e.preventDefault(); add(); }}
        >
          <input
            className="input quickadd-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Something you need to do"
            aria-label="Something you need to do"
            enterKeyHint="done"
            autoComplete="off"
          />
          <button
            type="submit"
            className="btn btn-accent quickadd-add"
            style={{ ['--mod' as string]: 'var(--mod-reminders)' }}
            disabled={!title.trim()}
            aria-label="Add"
          >
            <span className="btn-glyph" aria-hidden>{Icons.plus()}</span>
          </button>
        </form>
        <p className="t-xs t-muted" style={{ marginTop: 'var(--sp-2)' }}>
          No date needed. Add one later if it turns out to have a deadline.
        </p>
      </section>

      <ReminderList />
    </div>
  );
}
