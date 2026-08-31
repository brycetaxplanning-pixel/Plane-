import { useEffect, useState } from 'react';
import { backupFilename, backupStatus, requestPersistence, storageHealth, type StorageHealth } from '../lib/backup';
import { imageBytes } from '../lib/images';
import { downloadFile, exportBundle } from '../lib/storage';
import { fmtDateFull, todayKey } from '../lib/date';
import { useApp } from '../state/context';
import { SectionHead } from './ui/Field';

const mb = (bytes: number): string => `${(bytes / 1_048_576).toFixed(1)} MB`;

/** The honest version of "your data is safe": it says exactly how it is not. */
export function BackupCard() {
  const { state, update, toast } = useApp();
  const status = backupStatus(state);
  const [health, setHealth] = useState<StorageHealth | null>(null);
  const [asking, setAsking] = useState(false);
  const [photos, setPhotos] = useState<number | null>(null);

  useEffect(() => {
    void storageHealth().then(setHealth);
    void imageBytes().then(setPhotos);
  }, []);

  const backup = async () => {
    downloadFile(backupFilename(), await exportBundle(state));
    update((s) => ({ ...s, settings: { ...s.settings, lastExport: todayKey() } }));
    toast('Backup downloaded');
  };

  const ask = async () => {
    setAsking(true);
    const granted = await requestPersistence();
    setHealth(await storageHealth());
    setAsking(false);
    toast(granted ? 'The browser will keep this data' : 'The browser would not promise it — keep exporting');
  };

  return (
    <section className="card">
      <SectionHead
        title="Backups"
        sub="Nothing here is stored anywhere but this browser"
      />

      {status.due && (
        <div className="callout callout-warn" style={{ marginBottom: 'var(--sp-3)' }}>
          <strong className="t-sm">
            {status.lastExport
              ? `${status.daysSince} days since your last backup`
              : 'You have never taken a backup'}
          </strong>
          <p className="t-sm" style={{ margin: '4px 0 0' }}>
            {status.items.toLocaleString()} logged entries
            {status.oldest ? `, going back to ${fmtDateFull(status.oldest)}` : ''}, in one browser and nowhere else.
          </p>
        </div>
      )}

      <p className="t-sm t-sec">
        Clearing your browsing data wipes it. So does losing the phone. Safari also evicts storage for sites you have
        not opened in about a week, which is the one that catches people out — an app you check daily is fine, an app
        you leave for a fortnight may come back empty.
      </p>

      <div className="row-2 wrap" style={{ marginTop: 'var(--sp-3)' }}>
        <button className="btn btn-primary" onClick={() => void backup()}>Download a backup</button>
        {health?.canAsk && !health.persisted && (
          <button className="btn" disabled={asking} onClick={() => void ask()}>
            {asking ? 'Asking…' : 'Ask the browser to keep it'}
          </button>
        )}
      </div>

      <p className="t-xs t-muted" style={{ marginTop: 'var(--sp-3)' }}>
        {status.lastExport
          ? `Last backup ${fmtDateFull(status.lastExport)}. `
          : 'No backup taken yet. '}
        {health === null
          ? ''
          : health.persisted
            ? 'The browser has marked this storage persistent, so it will not be evicted to free space. '
            : health.canAsk
              ? 'This storage is not marked persistent, so the browser may evict it to free space. '
              : 'This browser cannot promise to keep the storage. '}
        {health?.usedBytes !== null && health?.usedBytes !== undefined
          ? `Using ${mb(health.usedBytes)}${health.quotaBytes ? ` of about ${mb(health.quotaBytes)}` : ''}.`
          : ''}
        {photos ? ` Goal photos take ${mb(photos)} of that, held outside the main store so they cannot crowd it out.` : ''}
      </p>
    </section>
  );
}
