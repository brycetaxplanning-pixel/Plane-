import { useState } from 'react';
import type { BucketItem } from '../lib/schema';
import { XP } from '../lib/gamification';
import { bucketLine, bucketStats } from '../lib/bucket';
import { fmtDate, todayKey } from '../lib/date';
import { uid } from '../lib/id';
import { useApp } from '../state/context';
import { Modal } from '../components/ui/Modal';
import { Field, SectionHead } from '../components/ui/Field';
import { MicButton } from '../components/ui/Dictation';
import { appendPhrase } from '../lib/speech';
import { SwipeRow } from '../components/ui/SwipeRow';
import { Icons } from '../components/layout/Icons';

const ACCENT = 'var(--mod-bucket)';

/**
 * The things you would regret never doing.
 *
 * A list, not a project tracker. Every item is a line of text and, behind one
 * press, whatever detail you felt like putting on it — same shape as a to-do,
 * because that is what these are: things you have not done. What they are not
 * is goals. A goal has a plan and a number and a quarter; this is the list you
 * raid when a window opens.
 *
 * The line at the top is the module talking. It changes once a day and it is
 * deliberately not encouraging — a bucket list does not suffer from a lack of
 * enthusiasm, it suffers from there always being a next year. So the line is
 * about time running, and it is the same line all day so that opening the
 * screen twice does not read as the app arguing with itself.
 */
export function Bucket() {
  const { state, update, reward, toast } = useApp();
  const stats = bucketStats(state);
  const [editing, setEditing] = useState<BucketItem | 'new' | null>(null);

  const save = (item: BucketItem) => {
    update((s) => ({
      ...s,
      bucket: {
        items: s.bucket.items.some((x) => x.id === item.id)
          ? s.bucket.items.map((x) => (x.id === item.id ? item : x))
          : [...s.bucket.items, item],
      },
    }));
    setEditing(null);
    toast('Saved');
  };

  /** Crossing one off is the only thing in here worth paying for. */
  const cross = (item: BucketItem) => {
    const before = state.bucket.items;
    reward('bucket', XP.bucketDone, `${item.title} — done`, (s) => ({
      ...s,
      bucket: {
        items: s.bucket.items.map((x) => (x.id === item.id ? { ...x, done: true, doneAt: todayKey() } : x)),
      },
    }));
    toast('Crossed off', undefined, {
      label: 'Undo',
      run: () => update((s) => ({ ...s, bucket: { items: before } })),
    });
  };

  const uncross = (item: BucketItem) => {
    update((s) => ({
      ...s,
      bucket: { items: s.bucket.items.map((x) => (x.id === item.id ? { ...x, done: false, doneAt: undefined } : x)) },
    }));
  };

  const remove = (item: BucketItem) => {
    const before = state.bucket.items;
    update((s) => ({ ...s, bucket: { items: s.bucket.items.filter((x) => x.id !== item.id) } }));
    setEditing(null);
    toast('Deleted', undefined, {
      label: 'Undo',
      run: () => update((s) => ({ ...s, bucket: { items: before } })),
    });
  };

  return (
    <div className="stack">
      {/* The module talking, and the way to add to the list, on one line. The
          plus is up here rather than under the list: opening this to put
          something down should not mean scrolling past everything already on
          it. */}
      <section className="card bucket-call" style={{ ['--mod' as string]: ACCENT }}>
        <div className="cardtools">
          <span />
          <button className="cardtool" onClick={() => setEditing('new')} aria-label="Add something to the list">
            <span aria-hidden>{Icons.plus()}</span>
          </button>
        </div>
        <p className="bucket-line">{bucketLine()}</p>
        <p className="t-xs t-muted">
          {stats.done.length} of {stats.done.length + stats.open.length} crossed off
        </p>
      </section>

      {stats.open.length === 0 && stats.done.length === 0 ? (
        <p className="todo-empty">
          Nothing on the list.<br />
          <span className="t-muted">Press the plus. One line is enough — the detail can wait.</span>
        </p>
      ) : (
        <>
          {stats.open.length > 0 && (
            <section className="card">
              <SectionHead title="Still to do" sub={`${stats.open.length} on the list`} />
              <ul className="todo">
                {stats.open.map((item) => (
                  <li key={item.id}>
                    <SwipeRow onDelete={() => remove(item)} label={item.title}>
                      <BucketRow item={item} onCross={() => cross(item)} onOpen={() => setEditing(item)} />
                    </SwipeRow>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {stats.done.length > 0 && (
            <section className="card">
              <SectionHead title="Done" sub={`${stats.done.length} you actually did`} />
              <ul className="todo">
                {stats.done.map((item) => (
                  <li key={item.id}>
                    <SwipeRow onDelete={() => remove(item)} label={item.title}>
                      <BucketRow item={item} onCross={() => uncross(item)} onOpen={() => setEditing(item)} />
                    </SwipeRow>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      {editing && (
        <BucketForm
          item={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSave={save}
          onDelete={editing === 'new' ? undefined : () => remove(editing)}
        />
      )}
    </div>
  );
}

/** A line, a circle to cross it off, and a second line only when there is
 *  something to say on it. */
function BucketRow({ item, onCross, onOpen }: { item: BucketItem; onCross: () => void; onOpen: () => void }) {
  const meta = [item.when || null, item.doneAt ? `done ${fmtDate(item.doneAt)}` : null]
    .filter(Boolean).join(' · ');

  return (
    <div className={`todo-row${item.done ? ' is-crossed' : ''}`}>
      <button
        className="todo-tick"
        onClick={onCross}
        aria-label={item.done ? `Put ${item.title} back on the list` : `Cross off ${item.title}`}
      >
        <span aria-hidden>{Icons.check()}</span>
      </button>
      <button className="todo-open" onClick={onOpen}>
        <span className="todo-title">{item.title}</span>
        {(meta || item.notes) && (
          <span className="todo-sub">
            <span className="todo-meta">{meta || item.notes}</span>
          </span>
        )}
      </button>
    </div>
  );
}

/** One line and a Save button, with everything else behind one press — the
 *  same bargain the to-do sheet strikes, for the same reason. */
function BucketForm({
  item, onClose, onSave, onDelete,
}: {
  item: BucketItem | null;
  onClose: () => void;
  onSave: (i: BucketItem) => void;
  onDelete?: () => void;
}) {
  const [title, setTitle] = useState(item?.title ?? '');
  const [notes, setNotes] = useState(item?.notes ?? '');
  const [when, setWhen] = useState(item?.when ?? '');
  const [open, setOpen] = useState(Boolean(item?.notes || item?.when));

  const submit = () => {
    if (!title.trim()) return;
    onSave({
      id: item?.id ?? uid('buck'),
      title: title.trim(),
      notes: notes.trim() || undefined,
      when: when.trim() || undefined,
      done: item?.done,
      doneAt: item?.doneAt,
      createdAt: item?.createdAt ?? todayKey(),
    });
  };

  return (
    <Modal
      title={item ? 'On the list' : 'Add to the list'}
      onClose={onClose}
      footer={
        <>
          {onDelete && <button className="btn btn-danger" style={{ marginRight: 'auto' }} onClick={onDelete}>Delete</button>}
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-accent" style={{ ['--mod' as string]: ACCENT }} disabled={!title.trim()} onClick={submit}>
            Save
          </button>
        </>
      }
    >
      <div className="stack-3">
        <div className="askline">
          <input
            className="input askline-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }}
            placeholder="Kitesurfing"
            aria-label="What you want to do"
            enterKeyHint="done"
            autoComplete="off"
            autoFocus
          />
          <MicButton size="lg" title="Talk instead of typing" onPhrase={(p) => setTitle((t) => appendPhrase(t, p))} />
        </div>

        <div className="askfolds">
          <button type="button" className="disclose" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
            <span className={`disclose-mark${open ? ' is-open' : ''}`} aria-hidden>{Icons.chevron()}</span>
            {open ? 'Less detail' : 'Add more detail'}
          </button>
        </div>

        {open && (
          <div className="stack-3">
            <Field label="Roughly when" hint="However you actually think about it — next winter, before 40, someday.">
              <input className="input" value={when} onChange={(e) => setWhen(e.target.value)} placeholder="Next winter" />
            </Field>
            <Field label="Notes">
              <textarea className="input" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Where, who with, what it would take" />
            </Field>
          </div>
        )}
      </div>
    </Modal>
  );
}
