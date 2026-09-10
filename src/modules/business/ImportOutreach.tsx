import { useRef, useState } from 'react';
import type { Business, Outreach } from '../../lib/schema';
import { parseOutreachCSV, outreachStats, UNSORTED, type OutreachImport } from '../../lib/outreachImport';
import { uid } from '../../lib/id';
import { useApp } from '../../state/context';
import { Field, SectionHead } from '../../components/ui/Field';
import { Modal } from '../../components/ui/Modal';
import { Icons } from '../../components/layout/Icons';

const pct = (n: number) => `${Math.round(n * 100)}%`;

/**
 * Bringing an outreach export into the log.
 *
 * Whatever is doing the reaching out — a bot, an agency, a spreadsheet you
 * keep by hand — knows who it contacted, and cannot put that here directly:
 * there is no server behind this app, so nothing outside the phone can write
 * to it. Every one of those tools exports a CSV, so the file is the seam.
 *
 * The file is read, shown back, and only written when you say so. A row
 * already in the log is recognised and skipped rather than added, so dropping
 * in a daily export — which repeats nearly all of yesterday's — counts each
 * person once.
 */
export function ImportOutreach({ business }: { business: Business | undefined }) {
  const { state, update, toast } = useApp();
  const file = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<OutreachImport | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mine = state.planning.outreach.filter((o) => !business || o.businessId === business.id);
  const stats = outreachStats(mine);
  // Only real industries are ranked; the unlabelled ones are counted separately.
  const named = stats.byIndustry.filter((r) => r.industry !== UNSORTED);
  const unsorted = stats.byIndustry.find((r) => r.industry === UNSORTED)?.n ?? 0;

  const read = async (f: File) => {
    setError(null);
    try {
      const text = await f.text();
      const parsed = parseOutreachCSV(text, mine, business?.channels?.[0] ?? 'LinkedIn');
      if (parsed.rows.length === 0 && parsed.duplicates === 0) {
        setError(
          parsed.skipped > 0
            ? `Nothing readable in ${f.name}. It needs a header row with a column for the person's name.`
            : `${f.name} looks empty.`,
        );
        return;
      }
      setName(f.name);
      setPreview(parsed);
    } catch {
      setError('That file could not be read.');
    }
  };

  const commit = () => {
    if (!preview) return;
    const added: Outreach[] = preview.rows.map((r) => ({
      id: uid('out'),
      businessId: business?.id,
      date: r.date,
      name: r.name,
      channel: r.channel,
      outcome: r.outcome,
      notes: r.notes,
      company: r.company,
      industry: r.industry,
      role: r.role,
      externalId: r.externalId,
    }));
    update((s) => ({ ...s, planning: { ...s.planning, outreach: [...s.planning.outreach, ...added] } }));
    toast(`${added.length} contact${added.length === 1 ? '' : 's'} imported`);
    setPreview(null);
  };

  return (
    <section className="card">
      <SectionHead
        title="Import outreach"
        sub="A CSV from whatever does the reaching out"
        action={
          <button className="btn btn-sm" onClick={() => file.current?.click()}>
            <span className="btn-glyph" aria-hidden>{Icons.outbox()}</span> Choose a file
          </button>
        }
      />

      <input
        ref={file}
        type="file"
        accept=".csv,text/csv,text/plain"
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void read(f);
          // Cleared so choosing the same file twice still fires a change.
          e.target.value = '';
        }}
      />

      {error && <p className="t-sm t-crit">{error}</p>}

      {stats.total > 0 ? (
        <>
          <div className="lifetime">
            <div className="lifetime-big">
              <b>{stats.total.toLocaleString()}</b>
              <span>people reached out to{stats.firstContact ? ` since ${stats.firstContact.slice(0, 7)}` : ''}</span>
            </div>
            <div className="lifetime-row">
              <span><b>{stats.conversations.toLocaleString()}</b> replied <i>{pct(stats.replyRate)}</i></span>
              <span><b>{stats.meetings.toLocaleString()}</b> meetings <i>{pct(stats.meetingRate)}</i></span>
            </div>
          </div>

          {named.length > 0 && (
            <>
              <h4 className="t-up" style={{ marginTop: 'var(--sp-4)', color: 'var(--text-muted)' }}>Which rooms answer</h4>
              <div className="stack-2" style={{ marginTop: 'var(--sp-2)' }}>
                {named.slice(0, 8).map((r) => (
                  <div className="indrow" key={r.industry}>
                    <span className="indrow-name truncate">{r.industry}</span>
                    <span className="indrow-bar" aria-hidden>
                      <i style={{ width: `${Math.max(2, (r.n / named[0].n) * 100)}%` }} />
                    </span>
                    <span className="indrow-n t-num">{r.n.toLocaleString()}</span>
                    <span className="indrow-rate t-num">{pct(r.replyRate)}</span>
                  </div>
                ))}
              </div>
              <p className="t-xs t-muted" style={{ marginTop: 'var(--sp-2)' }}>
                Reply rate per industry. An industry needs a few hundred contacts before
                its rate means much — below that it moves several points on one reply.
                {unsorted > 0 && ` ${unsorted.toLocaleString()} contacts carry no industry and are not ranked here.`}
              </p>
            </>
          )}
        </>
      ) : (
        <p className="t-sm t-muted">
          Nothing imported yet. The file needs a header row and a column for the person's
          name; company, industry, date, outcome and a profile link are all used when they
          are there.
        </p>
      )}

      {preview && (
        <Modal
          title={`Import ${name}`}
          onClose={() => setPreview(null)}
          footer={
            <>
              <button className="btn" onClick={() => setPreview(null)}>Cancel</button>
              <button className="btn btn-primary" disabled={preview.rows.length === 0} onClick={commit}>
                Import {preview.rows.length.toLocaleString()}
              </button>
            </>
          }
        >
          <div className="stack-3">
            <p className="t-sm">
              <b>{preview.rows.length.toLocaleString()}</b> new contact{preview.rows.length === 1 ? '' : 's'}.
              {preview.duplicates > 0 && <> <b>{preview.duplicates.toLocaleString()}</b> already logged, which will be left alone.</>}
              {preview.skipped > 0 && <> {preview.skipped.toLocaleString()} row{preview.skipped === 1 ? '' : 's'} had no name and cannot be used.</>}
            </p>

            <Field label="Columns it read" hint="Anything not listed was ignored.">
              <div className="row-2 wrap">
                {Object.entries(preview.columns).map(([field, header]) => (
                  <span className="chip chip-static" key={field}>{field} ← {header}</span>
                ))}
              </div>
            </Field>

            {preview.rows.length > 0 && (
              <Field label="First few">
                <div className="stack-2">
                  {preview.rows.slice(0, 5).map((r, i) => (
                    <div className="t-sm" key={i}>
                      <b>{r.name}</b>
                      {r.company && <span className="t-muted"> · {r.company}</span>}
                      {r.industry && <span className="t-muted"> · {r.industry}</span>}
                      <span className="t-muted"> · {r.date} · {r.outcome}</span>
                    </div>
                  ))}
                  {preview.rows.length > 5 && (
                    <p className="t-xs t-muted">and {(preview.rows.length - 5).toLocaleString()} more</p>
                  )}
                </div>
              </Field>
            )}
          </div>
        </Modal>
      )}
    </section>
  );
}
