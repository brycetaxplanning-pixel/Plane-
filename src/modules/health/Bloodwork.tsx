import { useState } from 'react';
import type { BloodMarker, BloodPanel } from '../../lib/schema';
import { XP } from '../../lib/gamification';
import { fmtDateFull, todayKey } from '../../lib/date';
import { uid } from '../../lib/id';
import {
  MARKER_CATALOGUE, MARKER_GROUPS, flagged, markerHistory, markerNames,
  markerStatus, monthsSincePanel, sortedPanels, type MarkerStatus,
} from '../../lib/health';
import { useApp } from '../../state/context';
import { Modal } from '../../components/ui/Modal';
import { EmptyState, Field, SectionHead } from '../../components/ui/Field';
import { DictateInput } from '../../components/ui/Dictation';

const ACCENT = 'var(--mod-health)';

const STATUS_LABEL: Record<MarkerStatus, string> = {
  low: 'Below range',
  high: 'Above range',
  in: 'In range',
  unknown: 'No range entered',
};

const STATUS_CLASS: Record<MarkerStatus, string> = {
  low: 'status status-warning',
  high: 'status status-warning',
  in: 'status status-good',
  unknown: 'status status-neutral',
};

export function Bloodwork() {
  const { state, update, reward, toast } = useApp();
  const panels = sortedPanels(state.health.panels);
  const [editing, setEditing] = useState<BloodPanel | 'new' | null>(null);
  const [trend, setTrend] = useState<string | null>(null);
  const months = monthsSincePanel(state.health.panels);

  const savePanel = (p: BloodPanel) => {
    const isNew = !state.health.panels.some((x) => x.id === p.id);
    const apply = (s: typeof state) => ({
      ...s,
      health: {
        ...s.health,
        panels: isNew ? [...s.health.panels, p] : s.health.panels.map((x) => (x.id === p.id ? p : x)),
      },
    });
    if (isNew) reward('health', XP.bloodPanel, `Logged a panel from ${fmtDateFull(p.date)}`, apply);
    else {
      update(apply);
      toast('Panel updated');
    }
    setEditing(null);
  };

  return (
    <>
      <section className="card card-sunken">
        <p className="t-sm t-sec" style={{ margin: 0 }}>
          This is a logbook, not a diagnosis. A marker is only ever compared against the range printed on your own
          report, and nothing here interprets what a result means — that conversation belongs with your doctor.
        </p>
      </section>

      {panels.length === 0 ? (
        <section className="card" style={{ ['--mod' as string]: ACCENT }}>
          <EmptyState
            icon="🩸"
            title="No bloodwork entered yet"
            hint="Type in the lines you care about from your last report. Common markers come with their usual units and ranges filled in, which you can overwrite with the ones your lab printed."
          />
          <button className="btn btn-accent btn-lg btn-block" style={{ ['--mod' as string]: ACCENT }} onClick={() => setEditing('new')}>
            + Add a panel
          </button>
        </section>
      ) : (
        <>
          {months !== null && months >= 12 && (
            <section className="card">
              <div className="callout callout-warn">
                <strong className="t-sm">{months} months since your last panel</strong>
                <p className="t-sm" style={{ margin: '4px 0 0' }}>
                  The numbers below are from {fmtDateFull(panels[0].date)}. Worth booking another.
                </p>
              </div>
            </section>
          )}

          {panels.map((p) => (
            <PanelCard key={p.id} panel={p} onEdit={() => setEditing(p)} onTrend={setTrend} />
          ))}

          <button className="btn btn-block" onClick={() => setEditing('new')}>+ Add a panel</button>
        </>
      )}

      {editing && (
        <PanelForm
          panel={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSave={savePanel}
          onDelete={
            editing === 'new'
              ? undefined
              : () => {
                  const id = (editing as BloodPanel).id;
                  update((s) => ({ ...s, health: { ...s.health, panels: s.health.panels.filter((x) => x.id !== id) } }));
                  setEditing(null);
                  toast('Panel removed');
                }
          }
        />
      )}

      {trend && <TrendSheet name={trend} onClose={() => setTrend(null)} />}
    </>
  );
}

function PanelCard({ panel, onEdit, onTrend }: { panel: BloodPanel; onEdit: () => void; onTrend: (name: string) => void }) {
  const { state } = useApp();
  const out = flagged(panel);
  const names = markerNames(state.health.panels);

  return (
    <section className="card" style={{ ['--mod' as string]: ACCENT }}>
      <SectionHead
        title={fmtDateFull(panel.date)}
        sub={
          `${panel.markers.length} marker${panel.markers.length === 1 ? '' : 's'}` +
          (out.length ? ` · ${out.length} outside range` : panel.markers.length ? ' · all inside range' : '') +
          (panel.lab ? ` · ${panel.lab}` : '')
        }
        action={<button className="btn btn-sm" onClick={onEdit}>Edit</button>}
      />

      {panel.notes && <p className="t-sm t-sec">{panel.notes}</p>}

      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr><th>Marker</th><th className="t-num">Result</th><th>Range</th><th>Status</th></tr>
          </thead>
          <tbody>
            {panel.markers.map((m) => {
              const st = markerStatus(m);
              const many = names.includes(m.name) && markerHistory(state.health.panels, m.name).length > 1;
              return (
                <tr key={m.id}>
                  <td>
                    {many ? (
                      <button className="link-btn" onClick={() => onTrend(m.name)}>{m.name}</button>
                    ) : m.name}
                  </td>
                  <td className="t-num">{m.value} {m.unit}</td>
                  <td className="t-xs t-muted">{rangeLabel(m)}</td>
                  <td><span className={STATUS_CLASS[st]}>{STATUS_LABEL[st]}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const rangeLabel = (m: BloodMarker): string => {
  if (m.low !== undefined && m.high !== undefined) return `${m.low}–${m.high}`;
  if (m.low !== undefined) return `≥ ${m.low}`;
  if (m.high !== undefined) return `≤ ${m.high}`;
  return '—';
};

/** One marker across every panel, so a number can be read as a direction. */
function TrendSheet({ name, onClose }: { name: string; onClose: () => void }) {
  const { state } = useApp();
  const history = markerHistory(state.health.panels, name);

  return (
    <Modal title={name} onClose={onClose}>
      <div className="table-scroll">
        <table className="table">
          <thead><tr><th>Date</th><th className="t-num">Result</th><th>Range</th><th>Status</th></tr></thead>
          <tbody>
            {history.map(({ date, marker }) => (
              <tr key={`${date}-${marker.id}`}>
                <td>{fmtDateFull(date)}</td>
                <td className="t-num">{marker.value} {marker.unit}</td>
                <td className="t-xs t-muted">{rangeLabel(marker)}</td>
                <td><span className={STATUS_CLASS[markerStatus(marker)]}>{STATUS_LABEL[markerStatus(marker)]}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="t-xs t-muted" style={{ marginTop: 'var(--sp-3)' }}>
        Ranges are shown as they were entered for each panel, because a lab can change its own.
      </p>
    </Modal>
  );
}

function PanelForm({
  panel, onClose, onSave, onDelete,
}: {
  panel: BloodPanel | null;
  onClose: () => void;
  onSave: (p: BloodPanel) => void;
  onDelete?: () => void;
}) {
  const [date, setDate] = useState(panel?.date ?? todayKey());
  const [lab, setLab] = useState(panel?.lab ?? '');
  const [notes, setNotes] = useState(panel?.notes ?? '');
  const [markers, setMarkers] = useState<BloodMarker[]>(panel?.markers ?? []);
  const [group, setGroup] = useState(MARKER_GROUPS[0]);

  const addFromCatalogue = (name: string) => {
    const t = MARKER_CATALOGUE.find((m) => m.name === name);
    if (!t || markers.some((m) => m.name === name)) return;
    setMarkers((ms) => [...ms, { id: uid('mk'), name: t.name, value: 0, unit: t.unit, low: t.low, high: t.high }]);
  };

  const patch = (id: string, p: Partial<BloodMarker>) =>
    setMarkers((ms) => ms.map((m) => (m.id === id ? { ...m, ...p } : m)));

  const numOrUndef = (v: string) => (v.trim() === '' ? undefined : Number(v) || 0);

  return (
    <Modal
      title={panel ? 'Edit panel' : 'Add a panel'}
      onClose={onClose}
      footer={
        <>
          {onDelete && <button className="btn btn-ghost" onClick={onDelete}>Delete</button>}
          <span className="grow" />
          <button className="btn" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-accent"
            style={{ ['--mod' as string]: ACCENT }}
            disabled={markers.length === 0}
            onClick={() =>
              onSave({
                id: panel?.id ?? uid('panel'),
                date,
                lab: lab.trim() || undefined,
                notes: notes.trim() || undefined,
                markers: markers.filter((m) => m.name.trim()),
              })
            }
          >
            Save panel
          </button>
        </>
      }
    >
      <div className="stack-2">
        <Field label="Date drawn"><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Lab or clinic"><input className="input" value={lab} onChange={(e) => setLab(e.target.value)} placeholder="Optional" /></Field>

        <Field label="Add a marker" hint="Units and ranges are prefilled as a starting point. Overwrite them with the ones printed on your report — labs differ.">
          <select className="select" value={group} onChange={(e) => setGroup(e.target.value)}>
            {MARKER_GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </Field>
        <div className="row-2 wrap">
          {MARKER_CATALOGUE.filter((m) => m.group === group).map((m) => (
            <button
              key={m.name}
              className="chip"
              disabled={markers.some((x) => x.name === m.name)}
              onClick={() => addFromCatalogue(m.name)}
            >
              + {m.name}
            </button>
          ))}
        </div>
        <button
          className="link-btn"
          onClick={() => setMarkers((ms) => [...ms, { id: uid('mk'), name: '', value: 0, unit: '' }])}
        >
          + Something not on the list
        </button>

        {markers.length === 0 ? (
          <p className="t-xs t-muted">Pick the lines you actually care about — a panel does not have to be complete to be useful.</p>
        ) : (
          <div className="stack-3">
            {markers.map((m) => (
              <div key={m.id} className="card card-sunken" style={{ padding: 'var(--sp-3)' }}>
                <div className="row-2" style={{ alignItems: 'flex-start' }}>
                  <div className="grow">
                    <Field label="Marker">
                      <input className="input" value={m.name} onChange={(e) => patch(m.id, { name: e.target.value })} placeholder="Name on the report" />
                    </Field>
                  </div>
                  <button
                    className="btn btn-ghost btn-icon"
                    aria-label={`Remove ${m.name || 'marker'}`}
                    onClick={() => setMarkers((ms) => ms.filter((x) => x.id !== m.id))}
                  >
                    ✕
                  </button>
                </div>
                <div className="grid grid-2" style={{ gap: 'var(--sp-3)' }}>
                  <Field label="Result">
                    <input className="input" inputMode="decimal" value={String(m.value)} onChange={(e) => patch(m.id, { value: Number(e.target.value) || 0 })} />
                  </Field>
                  <Field label="Unit">
                    <input className="input" value={m.unit} onChange={(e) => patch(m.id, { unit: e.target.value })} placeholder="mg/dL" />
                  </Field>
                  <Field label="Range low">
                    <input className="input" inputMode="decimal" value={m.low !== undefined ? String(m.low) : ''} onChange={(e) => patch(m.id, { low: numOrUndef(e.target.value) })} placeholder="—" />
                  </Field>
                  <Field label="Range high">
                    <input className="input" inputMode="decimal" value={m.high !== undefined ? String(m.high) : ''} onChange={(e) => patch(m.id, { high: numOrUndef(e.target.value) })} placeholder="—" />
                  </Field>
                </div>
              </div>
            ))}
          </div>
        )}

        <DictateInput label="Notes" value={notes} onChange={setNotes} placeholder="What the doctor said, what to recheck" textarea rows={2} />
      </div>
    </Modal>
  );
}
