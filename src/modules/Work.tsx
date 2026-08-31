import { useMemo, useState } from 'react';
import {
  WORK_SERVICES, WORK_STAGES,
  type Priority, type WorkProject, type WorkService, type WorkStage,
} from '../lib/schema';
import { XP } from '../lib/gamification';
import { fmtDate, relativeDay, todayKey } from '../lib/date';
import { uid } from '../lib/id';
import { useApp } from '../state/context';
import { workStats } from '../state/selectors';
import { CompletionFx, useCompletionFx } from '../components/CompletionFx';
import { Modal } from '../components/ui/Modal';
import { EmptyState, Field } from '../components/ui/Field';
import { StatTile } from '../components/charts/StatTile';
import { Ring } from '../components/charts/Ring';
import { Icons } from '../components/layout/Icons';

const ACCENT = 'var(--mod-work)';

const stageStatus = (stage: WorkStage): string => {
  switch (stage) {
    case 'Filed': return 'status status-good';
    case 'Waiting on client': return 'status status-warning';
    case 'In review': return 'status status-serious';
    default: return 'status status-neutral';
  }
};

export function Work() {
  const { state, update, reward, toast } = useApp();
  const stats = workStats(state);
  const [filter, setFilter] = useState<'open' | WorkStage>('open');
  const [editing, setEditing] = useState<WorkProject | 'new' | null>(null);

  const projects = useMemo(() => {
    const list = filter === 'open'
      ? state.work.projects.filter((p) => p.stage !== 'Filed')
      : state.work.projects.filter((p) => p.stage === filter);
    return [...list].sort((a, b) => {
      const pri = { high: 0, normal: 1, low: 2 } as const;
      if (a.due && b.due && a.due !== b.due) return a.due.localeCompare(b.due);
      if (a.due && !b.due) return -1;
      if (!a.due && b.due) return 1;
      return pri[a.priority] - pri[b.priority];
    });
  }, [state.work.projects, filter]);

  const setStage = (project: WorkProject, stage: WorkStage) => {
    const filing = stage === 'Filed' && project.stage !== 'Filed';
    const apply = (s: typeof state) => ({
      ...s,
      work: {
        projects: s.work.projects.map((p) =>
          p.id === project.id
            ? { ...p, stage, completedAt: stage === 'Filed' ? todayKey() : undefined }
            : p),
      },
    });
    if (filing) reward('work', XP.workProject, `Filed ${project.client}`, apply);
    else update(apply);
  };

  const toggleTask = (projectId: string, taskId: string) => {
    const project = state.work.projects.find((p) => p.id === projectId);
    const task = project?.tasks.find((t) => t.id === taskId);
    if (!project || !task) return;

    const apply = (s: typeof state) => ({
      ...s,
      work: {
        projects: s.work.projects.map((p) =>
          p.id !== projectId ? p : {
            ...p,
            tasks: p.tasks.map((t) =>
              t.id !== taskId ? t : { ...t, done: !t.done, doneAt: !t.done ? todayKey() : undefined }),
          }),
      },
    });

    if (!task.done) reward('work', XP.workTask, `Done: ${task.title}`, apply);
    else update(apply);
  };

  const removeProject = (id: string) => {
    update((s) => ({ ...s, work: { projects: s.work.projects.filter((p) => p.id !== id) } }));
    toast('Project deleted');
  };

  return (
    <div className="stack">
      <section className="card" style={{ ['--mod' as string]: ACCENT }}>
        <div className="hero-split">
          <div className="hero-figure"><Ring
            value={stats.taskProgress}
            color={ACCENT}
            size={78}
            label={`${Math.round(stats.taskProgress * 100)}%`}
            caption="tasks"
          /></div>
          <div className="hero-body grid grid-3 tight-mobile" style={{ gap: 'var(--sp-3)' }}>
            <StatTile label="Open" value={stats.openCount} caption="projects" small />
            <StatTile
              label="Past due"
              value={stats.overdue.length}
              caption={stats.overdue.length ? 'needs attention' : 'all clear'}
              small
            />
            <StatTile label="Filed" value={stats.filedCount} caption="all time" small />
          </div>
        </div>
      </section>

      <div className="row-2 wrap">
        <button className={`chip${filter === 'open' ? ' is-on' : ''}`} onClick={() => setFilter('open')}>
          Open ({stats.openCount})
        </button>
        {WORK_STAGES.map((st) => (
          <button key={st} className={`chip${filter === st ? ' is-on' : ''}`} onClick={() => setFilter(st)}>
            {st} ({state.work.projects.filter((p) => p.stage === st).length})
          </button>
        ))}
        <button className="btn btn-accent btn-sm" style={{ ['--mod' as string]: ACCENT, marginLeft: 'auto' }} onClick={() => setEditing('new')}>
          + Project
        </button>
      </div>

      {projects.length === 0 ? (
        <EmptyState
          icon={Icons.folder()}
          title={filter === 'open' ? 'Nothing open' : `Nothing in ${filter}`}
          hint="Add a client project and the tasks it needs."
        />
      ) : (
        <div className="stack-3">
          {projects.map((p) => (
            <ProjectCard
              key={p.id}
              project={p}
              onStage={(st) => setStage(p, st)}
              onToggleTask={(taskId) => toggleTask(p.id, taskId)}
              onEdit={() => setEditing(p)}
              onDelete={() => removeProject(p.id)}
            />
          ))}
        </div>
      )}

      {editing && (
        <ProjectForm
          project={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSave={(project) => {
            update((s) => ({
              ...s,
              work: {
                projects: s.work.projects.some((p) => p.id === project.id)
                  ? s.work.projects.map((p) => (p.id === project.id ? project : p))
                  : [...s.work.projects, project],
              },
            }));
            toast(editing === 'new' ? 'Project added' : 'Project updated');
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function TaskRow({
  task, fxEnabled, onToggle,
}: {
  task: WorkProject['tasks'][number];
  fxEnabled: boolean;
  onToggle: () => void;
}) {
  // The effect plays first and the state change commits when it finishes, so
  // the row is animated away rather than yanked out from under it.
  const { effect, play } = useCompletionFx(fxEnabled, onToggle);

  return (
    <CompletionFx effect={effect}>
      <label className={`rowitem${task.done ? ' rowitem-done' : ''}`} style={{ cursor: 'pointer' }}>
        <input
          className="checkbox"
          type="checkbox"
          checked={task.done}
          onChange={() => (task.done ? onToggle() : play())}
        />
        <span className="rowitem-title grow t-sm">{task.title}</span>
      </label>
    </CompletionFx>
  );
}

function ProjectCard({
  project, onStage, onToggleTask, onEdit, onDelete,
}: {
  project: WorkProject;
  onStage: (s: WorkStage) => void;
  onToggleTask: (id: string) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { state } = useApp();
  const [open, setOpen] = useState(false);
  const done = project.tasks.filter((t) => t.done).length;
  const overdue = project.due && project.due < todayKey() && project.stage !== 'Filed';

  return (
    <article className={`card card-tight${project.stage === 'Filed' ? ' rowitem-done' : ''}`}>
      <div className="spread" style={{ alignItems: 'flex-start' }}>
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="row-2 wrap" style={{ marginBottom: 3 }}>
            <strong className="truncate">{project.client}</strong>
            <span className="chip chip-static">{project.service}</span>
            {project.priority === 'high' && <span className="status status-serious">High priority</span>}
          </div>
          <div className="row-2 wrap t-xs t-muted">
            <span className={stageStatus(project.stage)}>{project.stage}</span>
            {project.due && (
              <span className={overdue ? 't-crit t-bold' : ''}>
                Due {fmtDate(project.due)} · {relativeDay(project.due)}
              </span>
            )}
            {project.tasks.length > 0 && <span>{done}/{project.tasks.length} tasks</span>}
          </div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {open ? 'Hide' : 'Open'}
        </button>
      </div>

      {open && (
        <div className="stack-3" style={{ marginTop: 'var(--sp-3)' }}>
          <hr className="divider" />

          {project.notes && <p className="t-sm t-sec">{project.notes}</p>}

          {project.tasks.length > 0 ? (
            <div>
              {project.tasks.map((t) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  fxEnabled={state.settings.completionFx}
                  onToggle={() => onToggleTask(t.id)}
                />
              ))}
            </div>
          ) : (
            <p className="t-sm t-muted">No tasks yet — edit the project to add them.</p>
          )}

          <div className="field">
            <label>Stage</label>
            <select className="select" value={project.stage} onChange={(e) => onStage(e.target.value as WorkStage)}>
              {WORK_STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div className="row-2">
            <button className="btn btn-sm" onClick={onEdit}>Edit</button>
            <button className="btn btn-sm btn-danger" onClick={onDelete}>Delete</button>
          </div>
        </div>
      )}
    </article>
  );
}

function ProjectForm({
  project, onClose, onSave,
}: {
  project: WorkProject | null;
  onClose: () => void;
  onSave: (p: WorkProject) => void;
}) {
  const [client, setClient] = useState(project?.client ?? '');
  const [service, setService] = useState<WorkService>(project?.service ?? '1120-S');
  const [stage, setStage] = useState<WorkStage>(project?.stage ?? 'Not started');
  const [priority, setPriority] = useState<Priority>(project?.priority ?? 'normal');
  const [due, setDue] = useState(project?.due ?? '');
  const [notes, setNotes] = useState(project?.notes ?? '');
  const [tasks, setTasks] = useState(project?.tasks ?? []);
  const [newTask, setNewTask] = useState('');

  const submit = () => {
    if (!client.trim()) return;
    onSave({
      id: project?.id ?? uid('prj'),
      client: client.trim(),
      service, stage, priority,
      due: due || undefined,
      notes: notes.trim() || undefined,
      tasks,
      createdAt: project?.createdAt ?? todayKey(),
      completedAt: stage === 'Filed' ? (project?.completedAt ?? todayKey()) : undefined,
    });
  };

  return (
    <Modal
      title={project ? 'Edit project' : 'New project'}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-accent" style={{ ['--mod' as string]: ACCENT }} onClick={submit} disabled={!client.trim()}>
            Save
          </button>
        </>
      }
    >
      <div className="stack-3">
        <Field label="Client">
          <input className="input" value={client} onChange={(e) => setClient(e.target.value)} placeholder="Acme Holdings LLC" autoFocus />
        </Field>

        <div className="grid grid-2" style={{ gap: 'var(--sp-3)' }}>
          <Field label="Service">
            <select className="select" value={service} onChange={(e) => setService(e.target.value as WorkService)}>
              {WORK_SERVICES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Stage">
            <select className="select" value={stage} onChange={(e) => setStage(e.target.value as WorkStage)}>
              {WORK_STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Priority">
            <select className="select" value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
            </select>
          </Field>
          <Field label="Due date">
            <input className="input" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </Field>
        </div>

        <Field label="Notes">
          <textarea className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Missing K-1s, waiting on payroll reports…" />
        </Field>

        <Field label="Tasks">
          <div className="stack-2">
            {tasks.map((t) => (
              <div key={t.id} className="row-2">
                <span className="grow t-sm">{t.title}</span>
                <button className="link-btn" onClick={() => setTasks((list) => list.filter((x) => x.id !== t.id))}>Remove</button>
              </div>
            ))}
            <div className="row-2">
              <input
                className="input grow"
                value={newTask}
                placeholder="Add a task and press Enter"
                onChange={(e) => setNewTask(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newTask.trim()) {
                    e.preventDefault();
                    setTasks((list) => [...list, { id: uid('t'), title: newTask.trim(), done: false }]);
                    setNewTask('');
                  }
                }}
              />
            </div>
          </div>
        </Field>
      </div>
    </Modal>
  );
}
