import { backupFilename, spaceByPart } from '../lib/backup';
import { downloadFile, exportBundle } from '../lib/storage';
import { todayKey } from '../lib/date';
import { useApp } from '../state/context';

const kb = (bytes: number): string =>
  bytes > 1_048_576 ? `${(bytes / 1_048_576).toFixed(1)} MB` : `${Math.round(bytes / 1024)} kB`;

/**
 * Shown when a write to storage failed.
 *
 * Deliberately not a toast. What is on screen is ahead of what is stored, and
 * every further change widens the gap, so this stays until a write succeeds.
 */
export function SaveError() {
  const { state, saveError, toast } = useApp();
  if (!saveError) return null;

  const parts = spaceByPart(state).slice(0, 3);

  return (
    <div className="savebar" role="alert">
      <div className="container">
        <strong className="t-sm">
          {saveError === 'full'
            ? 'This browser’s storage is full — nothing since is being saved.'
            : 'Changes are not being saved to this browser.'}
        </strong>
        <p className="t-sm" style={{ margin: '4px 0 0' }}>
          What you are looking at is only in memory. Take a backup now, before closing the tab.
          {saveError === 'full' && parts.length > 0 && (
            <> Most of the space is {parts.map((p) => `${p.label} (${kb(p.bytes)})`).join(', ')}.</>
          )}
        </p>
        <div className="row-2 wrap" style={{ marginTop: 'var(--sp-2)' }}>
          <button
            className="btn btn-sm"
            onClick={async () => {
              // Straight off state, not through storage — storage is the thing
              // that is broken. The photos come from IndexedDB, which is not.
              downloadFile(
                backupFilename(),
                await exportBundle({ ...state, settings: { ...state.settings, lastExport: todayKey() } }),
              );
              toast('Backup downloaded');
            }}
          >
            Download a backup now
          </button>
          <a className="btn btn-sm" href="#/settings">Free up space</a>
        </div>
      </div>
    </div>
  );
}
