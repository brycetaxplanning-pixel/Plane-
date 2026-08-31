import { useState } from 'react';
import type { Meal, Vitals } from '../../lib/schema';
import { parseCSV } from '../../lib/finance';
import {
  VITAL_FIELDS, emptyTotals, fromCSV, guessMapping, merge, scanApple,
  type ColumnMap, type MergeReport, type VitalField,
} from '../../lib/healthImport';
import { fmtDateFull, todayKey } from '../../lib/date';
import { uid } from '../../lib/id';
import { useApp } from '../../state/context';
import { Modal } from '../../components/ui/Modal';
import { Field } from '../../components/ui/Field';

const ACCENT = 'var(--mod-health)';

type Source = 'csv' | 'apple';

interface Staged {
  vitals: Vitals[];
  food: Meal[];
  skipped: number;
  /** Records read out of the file, for an Apple export where most are ignored. */
  scanned?: number;
}

export function ImportHealth({ onClose }: { onClose: () => void }) {
  const { state, update, toast } = useApp();
  const [source, setSource] = useState<Source>('csv');
  const [header, setHeader] = useState<string[] | null>(null);
  const [text, setText] = useState('');
  const [map, setMap] = useState<ColumnMap>({ date: null, fields: {} });
  const [staged, setStaged] = useState<Staged | null>(null);
  const [overwrite, setOverwrite] = useState(false);
  const [withFood, setWithFood] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const report: MergeReport | null = staged
    ? merge(state.health.vitals, staged.vitals, overwrite)
    : null;

  /* ---- CSV ---- */

  const readCSV = (raw: string, mapping?: ColumnMap) => {
    setError('');
    setText(raw);
    const table = parseCSV(raw);
    if (table.length < 2) {
      setHeader(null);
      setStaged(null);
      setError('That file has no rows under its header.');
      return;
    }
    const head = table[0];
    const m = mapping ?? guessMapping(head);
    setHeader(head);
    setMap(m);
    const parsed = fromCSV(raw, m);
    setStaged({ vitals: parsed.rows, food: [], skipped: parsed.skipped });
  };

  const remap = (patch: Partial<ColumnMap> | { field: VitalField; col: number | null }) => {
    let next: ColumnMap;
    if ('field' in patch) {
      const fields = { ...map.fields };
      if (patch.col === null) delete fields[patch.field];
      else fields[patch.field] = patch.col;
      next = { ...map, fields };
    } else {
      next = { ...map, ...patch };
    }
    setMap(next);
    if (text) readCSV(text, next);
  };

  /* ---- Apple Health ---- */

  const readApple = async (file: File) => {
    setBusy(true);
    setError('');
    try {
      const totals = emptyTotals();
      const reader = file.stream().pipeThrough(new TextDecoderStream()).getReader();
      let tail = '';
      // Streamed rather than read whole: a real export.xml runs to hundreds of
      // megabytes and would not survive being turned into one string.
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        tail = scanApple(tail + value, totals);
      }
      scanApple(tail, totals);

      const food: Meal[] = [...totals.food.entries()]
        .filter(([, v]) => v.calories > 0 || v.protein > 0)
        .map(([date, v]) => ({
          id: uid('meal'),
          date,
          slot: 'Snack' as const,
          name: 'Imported from Apple Health',
          calories: v.calories ? Math.round(v.calories) : undefined,
          protein: v.protein ? Math.round(v.protein) : undefined,
        }));

      const vitals = [...totals.vitals.values()].sort((a, b) => a.date.localeCompare(b.date));
      setStaged({ vitals, food, skipped: 0, scanned: totals.records });
      if (vitals.length === 0 && food.length === 0) {
        setError('Nothing this app tracks was found in that file. It should be the export.xml from inside the Apple Health export zip.');
      }
    } catch {
      setError('That file could not be read. Unzip the export first and pick export.xml.');
    } finally {
      setBusy(false);
    }
  };

  /* ---- commit ---- */

  const apply = () => {
    if (!report || !staged) return;
    const food = withFood ? staged.food : [];
    update((s) => {
      // A day that already has food logged is left alone: an imported daily
      // total next to meals you typed would double the day.
      const days = new Set(s.health.meals.map((m) => m.date));
      const fresh = food.filter((m) => !days.has(m.date));
      return {
        ...s,
        health: {
          ...s.health,
          vitals: report.vitals,
          meals: [...s.health.meals, ...fresh].sort((a, b) => a.date.localeCompare(b.date)),
        },
      };
    });
    toast(`Imported ${report.added} day${report.added === 1 ? '' : 's'}`);
    onClose();
  };

  const preview = staged?.vitals.slice(-6) ?? [];

  return (
    <Modal
      title="Import health data"
      onClose={onClose}
      footer={
        <>
          <span className="grow" />
          <button className="btn" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-accent"
            style={{ ['--mod' as string]: ACCENT }}
            disabled={!report || (report.added === 0 && report.filled === 0 && !(overwrite && report.conflicts))}
            onClick={apply}
          >
            Import
          </button>
        </>
      }
    >
      <div className="stack-3">
        <div className="pillbar">
          <button className={`chip${source === 'csv' ? ' is-on' : ''}`} onClick={() => { setSource('csv'); setStaged(null); }}>
            CSV
          </button>
          <button className={`chip${source === 'apple' ? ' is-on' : ''}`} onClick={() => { setSource('apple'); setStaged(null); }}>
            Apple Health
          </button>
        </div>

        {source === 'csv' ? (
          <>
            <Field
              label="CSV file"
              hint="Garmin Connect, Whoop, a spreadsheet — anything with a date column. You choose what the other columns mean below."
            >
              <input
                className="input"
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void file.text().then((t) => readCSV(t));
                }}
              />
            </Field>
            <Field label="…or paste it">
              <textarea
                className="textarea"
                style={{ minHeight: 90, fontFamily: 'ui-monospace, monospace', fontSize: 12 }}
                value={text}
                onChange={(e) => readCSV(e.target.value)}
              />
            </Field>

            {header && (
              <div className="stack-2">
                <p className="viz-sub" style={{ margin: 0 }}>What the columns are</p>
                <Field label="Date">
                  <select className="select" value={map.date ?? ''} onChange={(e) => remap({ date: e.target.value === '' ? null : Number(e.target.value) })}>
                    <option value="">— not in this file —</option>
                    {header.map((h, i) => <option key={`${h}-${i}`} value={i}>{h || `Column ${i + 1}`}</option>)}
                  </select>
                </Field>
                {VITAL_FIELDS.map((f) => (
                  <Field key={f.id} label={f.label}>
                    <select
                      className="select"
                      value={map.fields[f.id] ?? ''}
                      onChange={(e) => remap({ field: f.id, col: e.target.value === '' ? null : Number(e.target.value) })}
                    >
                      <option value="">— skip —</option>
                      {header.map((h, i) => <option key={`${h}-${i}`} value={i}>{h || `Column ${i + 1}`}</option>)}
                    </select>
                  </Field>
                ))}
              </div>
            )}
          </>
        ) : (
          <Field
            label="export.xml"
            hint="On the iPhone: Health → your picture → Export All Health Data. Unzip what it sends you and pick export.xml from inside. It is read here in the browser and nothing is uploaded."
          >
            <input
              className="input"
              type="file"
              accept=".xml,text/xml,application/xml"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void readApple(file);
              }}
            />
          </Field>
        )}

        {busy && <p className="t-sm t-sec">Reading the file…</p>}
        {error && <p className="t-xs t-crit">{error}</p>}

        {staged && report && (
          <div className="card card-sunken" style={{ padding: 'var(--sp-3)' }}>
            <p className="t-sm t-bold" style={{ margin: 0 }}>
              {staged.vitals.length} day{staged.vitals.length === 1 ? '' : 's'} of readings
              {staged.scanned ? ` from ${staged.scanned.toLocaleString()} records` : ''}
              {staged.skipped ? `, ${staged.skipped} row${staged.skipped === 1 ? '' : 's'} skipped` : ''}
            </p>
            <p className="t-sm t-sec" style={{ margin: '4px 0 0' }}>
              {report.added} new day{report.added === 1 ? '' : 's'}, {report.filled} gap
              {report.filled === 1 ? '' : 's'} filled in days you already have
              {report.conflicts ? `, and ${report.conflicts} value${report.conflicts === 1 ? '' : 's'} that disagree with what is stored` : ''}.
            </p>

            {report.conflicts > 0 && (
              <label className="row-2" style={{ marginTop: 'var(--sp-3)', cursor: 'pointer' }}>
                <input type="checkbox" className="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} />
                <span className="t-sm">Replace the {report.conflicts} value{report.conflicts === 1 ? '' : 's'} I already have</span>
              </label>
            )}

            {staged.food.length > 0 && (
              <label className="row-2" style={{ marginTop: 'var(--sp-2)', cursor: 'pointer' }}>
                <input type="checkbox" className="checkbox" checked={withFood} onChange={(e) => setWithFood(e.target.checked)} />
                <span className="t-sm">
                  Also bring in {staged.food.length} day{staged.food.length === 1 ? '' : 's'} of food totals (days you have already logged are left alone)
                </span>
              </label>
            )}

            {preview.length > 0 && (
              <div className="table-scroll" style={{ marginTop: 'var(--sp-3)', maxHeight: 180 }}>
                <table className="table">
                  <thead>
                    <tr><th>Date</th><th className="t-num">Weight</th><th className="t-num">RHR</th><th className="t-num">BP</th><th className="t-num">Sleep</th></tr>
                  </thead>
                  <tbody>
                    {preview.map((v) => (
                      <tr key={v.date}>
                        <td>{fmtDateFull(v.date)}</td>
                        <td className="t-num">{v.weight ?? '—'}</td>
                        <td className="t-num">{v.restingHr ?? '—'}</td>
                        <td className="t-num">{v.systolic !== undefined && v.diastolic !== undefined ? `${v.systolic}/${v.diastolic}` : '—'}</td>
                        <td className="t-num">{v.sleepHours ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="t-xs t-muted" style={{ marginTop: 4 }}>
                  The last {preview.length} of them, as they will be stored. Numbers are taken as written — nothing is
                  converted between pounds and kilos.
                </p>
              </div>
            )}
          </div>
        )}

        <p className="t-xs t-muted">
          Everything is read on this device. No file leaves the browser, and today is {fmtDateFull(todayKey())} if you
          want to check the dates landed where you expect.
        </p>
      </div>
    </Modal>
  );
}
