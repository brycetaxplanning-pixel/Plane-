import { useEffect, useState } from 'react';
import { useTabParam } from '../lib/router';
import type { StudySession } from '../lib/schema';
import { XP } from '../lib/gamification';
import { dowLabel, fmtDate, fmtDuration, todayKey } from '../lib/date';
import { uid } from '../lib/id';
import { useApp } from '../state/context';
import { spanishStats } from '../state/selectors';
import { Tutor } from './spanish/Tutor';
import { Modal } from '../components/ui/Modal';
import { EmptyState, Field, SectionHead } from '../components/ui/Field';
import { BarChart } from '../components/charts/BarChart';
import { Ring } from '../components/charts/Ring';
import { StatTile } from '../components/charts/StatTile';
import { Tabs, panelProps } from '../components/ui/Tabs';
import { Icons } from '../components/layout/Icons';

const ACCENT = 'var(--mod-spanish)';
const KINDS: StudySession['kind'][] = ['Lesson', 'Self study', 'Listening', 'Conversation', 'Reading'];

export function Spanish() {
  const { state, update, reward, toast } = useApp();
  const stats = spanishStats(state);
  const [logging, setLogging] = useState<number | null>(null);
  const [tab, setTab] = useTabParam(['practice', 'tutor'] as const, 'practice');

  const logSession = (minutes: number, platform: string, kind: StudySession['kind'], notes: string) => {
    if (minutes <= 0) return;
    reward('spanish', Math.max(2, Math.round((minutes / 10) * XP.spanishPerTenMin)), `${minutes} min of Spanish`, (s) => ({
      ...s,
      spanish: {
        ...s.spanish,
        sessions: [
          ...s.spanish.sessions,
          { id: uid('sp'), date: todayKey(), minutes, platform, kind, notes: notes.trim() || undefined },
        ],
      },
    }));
    setLogging(null);
  };

  const recent = [...state.spanish.sessions].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);
  const platforms = Object.entries(stats.byPlatform).sort((a, b) => b[1] - a[1]);

  return (
    <div className="stack">
      <Tabs
        idBase="spanish"
        label="Spanish sections"
        active={tab}
        onChange={setTab}
        tabs={[{ id: 'practice', label: 'Practice' }, { id: 'tutor', label: 'AI tutor' }]}
      />

      <div className="stack" {...panelProps('spanish', tab)}>
      {tab === 'tutor' && <Tutor />}

      {tab === 'practice' && (
      <>
      <section className="card" style={{ ['--mod' as string]: ACCENT }}>
        <SectionHead title="Go practice" sub="Opens in a new tab — come back and log the time" />
        <div className="grid grid-2" style={{ gap: 'var(--sp-3)' }}>
          {state.spanish.links.map((l) => (
            <a
              key={l.id}
              className="btn btn-accent btn-lg"
              style={{ ['--mod' as string]: ACCENT }}
              href={l.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              {l.label} ↗
            </a>
          ))}
        </div>
      </section>

      <section className="card">
        <div className="hero-split">
          <div className="hero-figure"><Ring
            value={stats.dailyGoal ? stats.todayMinutes / stats.dailyGoal : 0}
            color={ACCENT}
            size={92}
            stroke={8}
            label={`${stats.todayMinutes}m`}
            caption={`of ${stats.dailyGoal}m`}
          /></div>
          <div className="hero-body grid grid-3 tight-mobile" style={{ gap: 'var(--sp-3)' }}>
            <StatTile label="This week" value={fmtDuration(stats.weekMinutes)} caption={`goal ${fmtDuration(stats.weeklyGoal)}`} small />
            <StatTile label="All time" value={`${stats.hours.toFixed(1)}h`} caption={`${state.spanish.sessions.length} sessions`} small />
            <StatTile label="Days this week" value={`${stats.daysStudiedThisWeek}/7`} caption="studied" small />
          </div>
        </div>
      </section>

      <Timer onLog={(m) => setLogging(m)} />

      <section className="card">
        <SectionHead title="Minutes a day" sub="Last 14 days" />
        <BarChart
          data={stats.byDay.map((d) => ({ key: d.key, value: d.value, label: dowLabel(d.key)[0] }))}
          color={ACCENT}
          target={stats.dailyGoal}
          targetLabel={`Daily goal (${stats.dailyGoal}m)`}
          highlightKey={todayKey()}
          formatValue={(n) => `${n}m`}
          ariaLabel="Spanish minutes logged each day over the last fourteen days"
        />
      </section>

      {platforms.length > 0 && (
        <section className="card">
          <SectionHead title="Where the hours went" />
          <div className="table-scroll">
            <table className="table">
              <thead><tr><th>Platform</th><th className="num">Time</th><th className="num">Share</th></tr></thead>
              <tbody>
                {platforms.map(([name, mins]) => (
                  <tr key={name}>
                    <td>{name}</td>
                    <td className="num">{fmtDuration(mins)}</td>
                    <td className="num t-muted">{Math.round((mins / Math.max(1, stats.allMinutes)) * 100)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="card">
        <SectionHead
          title="Recent sessions"
          action={<button className="btn btn-sm btn-accent" style={{ ['--mod' as string]: ACCENT }} onClick={() => setLogging(0)}>+ Log time</button>}
        />
        {recent.length === 0 ? (
          <EmptyState icon={Icons.chat()} title="No sessions logged yet" hint="Twenty minutes today is a start." />
        ) : (
          <div className="stack-2">
            {recent.map((s) => (
              <div key={s.id} className="rowitem">
                <span className="grow" style={{ minWidth: 0 }}>
                  <span className="t-sm t-bold">{fmtDuration(s.minutes)} · {s.platform}</span>
                  <span className="t-xs t-muted" style={{ display: 'block' }}>
                    {fmtDate(s.date)} · {s.kind}{s.notes ? ` · ${s.notes}` : ''}
                  </span>
                </span>
                <button
                  className="link-btn"
                  onClick={() => {
                    update((st) => ({ ...st, spanish: { ...st.spanish, sessions: st.spanish.sessions.filter((x) => x.id !== s.id) } }));
                    toast('Session removed');
                  }}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card">
        <SectionHead title="Goals and links" />
        <div className="grid grid-2" style={{ gap: 'var(--sp-3)' }}>
          <Field label="Daily goal (minutes)">
            <input
              className="input" type="number" min={0}
              value={state.spanish.dailyGoalMinutes}
              onChange={(e) => update((s) => ({ ...s, spanish: { ...s.spanish, dailyGoalMinutes: Math.max(0, Number(e.target.value) || 0) } }))}
            />
          </Field>
          <Field label="Weekly goal (minutes)">
            <input
              className="input" type="number" min={0}
              value={state.spanish.weeklyGoalMinutes}
              onChange={(e) => update((s) => ({ ...s, spanish: { ...s.spanish, weeklyGoalMinutes: Math.max(0, Number(e.target.value) || 0) } }))}
            />
          </Field>
        </div>
        <div className="stack-2" style={{ marginTop: 'var(--sp-3)' }}>
          {state.spanish.links.map((l) => (
            <div className="row-2" key={l.id}>
              <input
                className="input" style={{ maxWidth: 130 }} value={l.label}
                onChange={(e) => update((s) => ({
                  ...s, spanish: { ...s.spanish, links: s.spanish.links.map((x) => (x.id === l.id ? { ...x, label: e.target.value } : x)) },
                }))}
              />
              <input
                className="input grow" value={l.url}
                onChange={(e) => update((s) => ({
                  ...s, spanish: { ...s.spanish, links: s.spanish.links.map((x) => (x.id === l.id ? { ...x, url: e.target.value } : x)) },
                }))}
              />
            </div>
          ))}
          <button
            className="btn btn-sm"
            onClick={() => update((s) => ({
              ...s, spanish: { ...s.spanish, links: [...s.spanish.links, { id: uid('lnk'), label: 'New link', url: 'https://' }] },
            }))}
          >
            + Add link
          </button>
        </div>
      </section>

      </>
      )}

      {logging !== null && (
        <LogForm initialMinutes={logging} platforms={state.spanish.links.map((l) => l.label)} onClose={() => setLogging(null)} onSave={logSession} />
      )}
      </div>
    </div>
  );
}

/** A stopwatch for a session in progress. Wall-clock based, so it stays
 *  accurate if the tab is backgrounded and the interval is throttled. */
function Timer({ onLog }: { onLog: (minutes: number) => void }) {
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (startedAt === null) return;
    const tick = () => setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const ss = String(elapsed % 60).padStart(2, '0');

  return (
    <section className="card" style={{ ['--mod' as string]: ACCENT }}>
      <div className="spread">
        <div>
          <span className="tile-label">Session timer</span>
          <div className="tile-value" style={{ fontVariantNumeric: 'tabular-nums' }}>{mm}:{ss}</div>
        </div>
        <div className="row-2">
          {startedAt === null ? (
            <button className="btn btn-accent" style={{ ['--mod' as string]: ACCENT }} onClick={() => { setElapsed(0); setStartedAt(Date.now()); }}>
              Start
            </button>
          ) : (
            <>
              <button
                className="btn btn-accent"
                style={{ ['--mod' as string]: ACCENT }}
                onClick={() => {
                  const minutes = Math.max(1, Math.round(elapsed / 60));
                  setStartedAt(null);
                  onLog(minutes);
                }}
              >
                Stop &amp; log
              </button>
              <button className="btn btn-ghost" onClick={() => { setStartedAt(null); setElapsed(0); }}>Discard</button>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function LogForm({
  initialMinutes, platforms, onClose, onSave,
}: {
  initialMinutes: number;
  platforms: string[];
  onClose: () => void;
  onSave: (minutes: number, platform: string, kind: StudySession['kind'], notes: string) => void;
}) {
  const [minutes, setMinutes] = useState(String(initialMinutes || 20));
  const [platform, setPlatform] = useState(platforms[0] ?? 'italki');
  const [kind, setKind] = useState<StudySession['kind']>('Lesson');
  const [notes, setNotes] = useState('');
  const options = [...new Set([...platforms, 'Podcast', 'Tutor', 'Other'])];

  return (
    <Modal
      title="Log Spanish time"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-accent"
            style={{ ['--mod' as string]: ACCENT }}
            onClick={() => onSave(Math.max(1, Number(minutes) || 0), platform, kind, notes)}
          >
            Log it
          </button>
        </>
      }
    >
      <div className="stack-3">
        <Field label="Minutes">
          <input className="input" type="number" min={1} value={minutes} onChange={(e) => setMinutes(e.target.value)} autoFocus />
        </Field>
        <Field label="Quick pick">
          <div className="row-2 wrap">
            {[10, 15, 20, 30, 45, 60].map((m) => (
              <button key={m} type="button" className="chip" aria-pressed={Number(minutes) === m} onClick={() => setMinutes(String(m))}>{m}m</button>
            ))}
          </div>
        </Field>
        <Field label="Platform">
          <select className="select" value={platform} onChange={(e) => setPlatform(e.target.value)}>
            {options.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </Field>
        <Field label="Type">
          <div className="row-2 wrap">
            {KINDS.map((k) => (
              <button key={k} type="button" className="chip" aria-pressed={kind === k} onClick={() => setKind(k)}>{k}</button>
            ))}
          </div>
        </Field>
        <Field label="Notes">
          <textarea className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Past subjunctive, still shaky on ojalá" />
        </Field>
      </div>
    </Modal>
  );
}
