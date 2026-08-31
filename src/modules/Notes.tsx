import { useMemo, useState } from 'react';
import { NOTE_KINDS, type Note, type NoteKind } from '../lib/schema';
import { XP } from '../lib/gamification';
import { fmtDate, todayKey } from '../lib/date';
import { uid } from '../lib/id';
import { useApp } from '../state/context';
import { Modal } from '../components/ui/Modal';
import { EmptyState, Field, SectionHead } from '../components/ui/Field';
import { DictateInput, VoiceCapture } from '../components/ui/Dictation';

const ACCENT = 'var(--mod-notes)';

/** Offered before the field is touched, so there is something to react to
 *  rather than a blank box. */
const TITLE_SUGGESTIONS: Record<NoteKind, string[]> = {
  Note: ['Brain dump', 'Client call notes', 'Something to remember'],
  Journal: ['How today went', 'What is on my mind', 'Weekly reflection'],
  List: ['To do', 'Content ideas', 'Things to buy', 'People to call back'],
};

const LIST_SEED: Record<string, string[]> = {
  'to do': ['Make an Instagram for the flaxseed gel', 'Follow up on the K-1s', 'Book a sparring session'],
  'content ideas': ['S-corp election explained in 60 seconds', 'What a reasonable salary actually means', 'Three write-offs people miss'],
};

export function Notes() {
  const { state, update, reward, toast } = useApp();
  const [editing, setEditing] = useState<Note | 'new' | null>(null);
  const [talking, setTalking] = useState(false);
  const [query, setQuery] = useState('');
  const [kindFilter, setKindFilter] = useState<NoteKind | 'All'>('All');

  const notes = useMemo(() => {
    const q = query.trim().toLowerCase();
    return state.notes.items
      .filter((n) => kindFilter === 'All' || n.kind === kindFilter)
      .filter((n) => !q || n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q) || n.tags.some((t) => t.toLowerCase().includes(q)))
      .sort((a, b) => (Number(b.pinned) - Number(a.pinned)) || (b.updatedAt - a.updatedAt));
  }, [state.notes.items, query, kindFilter]);

  const save = (note: Note) => {
    const isNew = !state.notes.items.some((n) => n.id === note.id);
    const apply = (s: typeof state) => ({
      ...s,
      notes: {
        items: isNew ? [note, ...s.notes.items] : s.notes.items.map((n) => (n.id === note.id ? note : n)),
      },
    });
    if (isNew) reward('notes', XP.note, 'Note saved', apply);
    else { update(apply); toast('Note updated'); }
    setEditing(null);
  };

  /** A spoken capture becomes a note with the first sentence as its title. */
  const saveSpoken = (text: string) => {
    const firstStop = text.search(/[.!?]\s/);
    const rawTitle = (firstStop > 0 && firstStop < 70 ? text.slice(0, firstStop) : text.slice(0, 70)).trim();
    reward('notes', XP.note, 'Captured a thought', (s) => ({
      ...s,
      notes: {
        items: [{
          id: uid('note'),
          kind: 'Note' as NoteKind,
          title: rawTitle || 'Untitled',
          body: text,
          tags: [],
          pinned: false,
          createdAt: todayKey(),
          updatedAt: Date.now(),
        }, ...s.notes.items],
      },
    }));
    setTalking(false);
  };

  return (
    <div className="stack">
      <section className="card" style={{ ['--mod' as string]: ACCENT }}>
        <SectionHead title="Get it out of your head" sub="Talk it in — no typing needed" />
        {talking ? (
          <VoiceCapture onDone={saveSpoken} placeholder="Start talking, or type here…">
            <button className="link-btn" onClick={() => setTalking(false)}>Cancel</button>
          </VoiceCapture>
        ) : (
          <div className="row-2 wrap">
            <button className="btn btn-primary btn-lg grow" onClick={() => setTalking(true)}>🎙 Talk a note</button>
            <button className="btn btn-lg" onClick={() => setEditing('new')}>Write one</button>
          </div>
        )}
      </section>

      {state.notes.items.length > 0 && (
        <>
          <div className="row-2 wrap">
            <input className="input grow" placeholder="Search notes" value={query} onChange={(e) => setQuery(e.target.value)} />
            {(['All', ...NOTE_KINDS] as const).map((k) => (
              <button key={k} className="chip" aria-pressed={kindFilter === k} onClick={() => setKindFilter(k)}>{k}</button>
            ))}
          </div>

          {notes.length === 0 ? (
            <EmptyState icon="🔍" title="Nothing matches" hint="Try a different word, or clear the filter." />
          ) : (
            <div className="note-grid">
              {notes.map((n) => (
                <NoteCard
                  key={n.id}
                  note={n}
                  onOpen={() => setEditing(n)}
                  onPin={() => update((s) => ({
                    ...s,
                    notes: { items: s.notes.items.map((x) => (x.id === n.id ? { ...x, pinned: !x.pinned } : x)) },
                  }))}
                  onToggleItem={(itemId) => update((s) => ({
                    ...s,
                    notes: {
                      items: s.notes.items.map((x) => (x.id !== n.id ? x : {
                        ...x,
                        updatedAt: Date.now(),
                        items: x.items?.map((i) => (i.id === itemId ? { ...i, done: !i.done } : i)),
                      })),
                    },
                  }))}
                />
              ))}
            </div>
          )}
        </>
      )}

      {state.notes.items.length === 0 && !talking && (
        <EmptyState
          icon="📝"
          title="Nothing written yet"
          hint="To-do lists, content ideas, a journal — whatever you'd otherwise put in your phone's notes app."
        />
      )}

      {editing && (
        <NoteForm
          note={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onDelete={editing === 'new' ? undefined : () => {
            const id = (editing as Note).id;
            update((s) => ({ ...s, notes: { items: s.notes.items.filter((n) => n.id !== id) } }));
            setEditing(null);
            toast('Note deleted');
          }}
          onSave={save}
        />
      )}
    </div>
  );
}

function NoteCard({
  note, onOpen, onPin, onToggleItem,
}: {
  note: Note;
  onOpen: () => void;
  onPin: () => void;
  onToggleItem: (id: string) => void;
}) {
  const open = note.items?.filter((i) => !i.done).length ?? 0;

  return (
    <article className={`note${note.pinned ? ' is-pinned' : ''}`}>
      <div className="spread" style={{ alignItems: 'flex-start' }}>
        <button className="note-title grow" onClick={onOpen}>{note.title || 'Untitled'}</button>
        <button className="note-pin" onClick={onPin} aria-pressed={note.pinned} aria-label={note.pinned ? 'Unpin' : 'Pin'}>
          {note.pinned ? '★' : '☆'}
        </button>
      </div>

      {note.kind === 'List' && note.items?.length ? (
        <ul className="note-list">
          {note.items.slice(0, 6).map((i) => (
            <li key={i.id}>
              <label className={i.done ? 'is-done' : undefined}>
                <input className="checkbox" type="checkbox" checked={i.done} onChange={() => onToggleItem(i.id)} />
                <span>{i.text}</span>
              </label>
            </li>
          ))}
          {note.items.length > 6 && <li className="t-xs t-muted">+{note.items.length - 6} more</li>}
        </ul>
      ) : (
        note.body && <p className="note-body" onClick={onOpen}>{note.body}</p>
      )}

      <div className="row-2 wrap note-foot">
        <span className="chip chip-static">{note.kind}</span>
        {note.kind === 'List' && <span className="t-xs t-muted">{open} left</span>}
        {note.tags.map((t) => <span key={t} className="chip chip-static">#{t}</span>)}
        <span className="t-xs t-muted" style={{ marginLeft: 'auto' }}>{fmtDate(note.createdAt)}</span>
      </div>
    </article>
  );
}

function NoteForm({
  note, onClose, onSave, onDelete,
}: {
  note: Note | null;
  onClose: () => void;
  onSave: (n: Note) => void;
  onDelete?: () => void;
}) {
  const [kind, setKind] = useState<NoteKind>(note?.kind ?? 'Note');
  const [title, setTitle] = useState(note?.title ?? '');
  const [body, setBody] = useState(note?.body ?? '');
  const [tags, setTags] = useState(note?.tags.join(', ') ?? '');
  const [items, setItems] = useState(note?.items ?? []);
  const [newItem, setNewItem] = useState('');

  const seed = LIST_SEED[title.trim().toLowerCase()];

  return (
    <Modal
      title={note ? 'Edit note' : 'New note'}
      onClose={onClose}
      footer={
        <>
          {onDelete && <button className="btn btn-danger" style={{ marginRight: 'auto' }} onClick={onDelete}>Delete</button>}
          <button className="btn" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-primary"
            disabled={!title.trim() && !body.trim()}
            onClick={() => onSave({
              id: note?.id ?? uid('note'),
              kind,
              title: title.trim() || body.trim().slice(0, 60),
              body,
              tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
              pinned: note?.pinned ?? false,
              items: kind === 'List' ? items : undefined,
              createdAt: note?.createdAt ?? todayKey(),
              updatedAt: Date.now(),
            })}
          >
            Save
          </button>
        </>
      }
    >
      <div className="stack-3">
        <Field label="Kind">
          <div className="row-2 wrap">
            {NOTE_KINDS.map((k) => (
              <button key={k} type="button" className="chip" aria-pressed={kind === k} onClick={() => setKind(k)}>{k}</button>
            ))}
          </div>
        </Field>

        <DictateInput
          label="Title"
          value={title}
          onChange={setTitle}
          placeholder="What is this about"
          suggestions={TITLE_SUGGESTIONS[kind]}
          autoFocus
        />

        {kind === 'List' ? (
          <Field label="Items">
            <div className="stack-2">
              {seed && items.length === 0 && (
                <div className="row-2 wrap">
                  {seed.map((t) => (
                    <button
                      key={t}
                      type="button"
                      className="chip"
                      onClick={() => setItems((l) => [...l, { id: uid('it'), text: t, done: false }])}
                    >
                      + {t}
                    </button>
                  ))}
                </div>
              )}
              {items.map((i) => (
                <div key={i.id} className="row-2">
                  <span className="grow t-sm">{i.text}</span>
                  <button className="link-btn" onClick={() => setItems((l) => l.filter((x) => x.id !== i.id))}>Remove</button>
                </div>
              ))}
              <DictateInput
                value={newItem}
                onChange={setNewItem}
                placeholder="Add an item, then press Enter"
              />
              <button
                className="btn btn-sm"
                disabled={!newItem.trim()}
                onClick={() => { setItems((l) => [...l, { id: uid('it'), text: newItem.trim(), done: false }]); setNewItem(''); }}
              >
                Add item
              </button>
            </div>
          </Field>
        ) : (
          <DictateInput
            label={kind === 'Journal' ? 'Entry' : 'Body'}
            value={body}
            onChange={setBody}
            textarea
            rows={7}
            placeholder="Talk or type…"
          />
        )}

        <Field label="Tags" hint="Comma separated.">
          <input className="input" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="taxes, content, flaxseed" />
        </Field>
      </div>
    </Modal>
  );
}
