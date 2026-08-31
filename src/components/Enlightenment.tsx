import { createPortal } from 'react-dom';
import { fmtRange } from '../lib/date';
import { addDays, type DateKey } from '../lib/date';
import { Icons } from './layout/Icons';

/** Shown once, the first time the app opens after a perfect week. */
export function EnlightenmentModal({ week, onClose }: { week: DateKey; onClose: () => void }) {
  return createPortal(
    <div className="modal-backdrop enl-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal enl" role="dialog" aria-modal="true" aria-label="Enlightenment reached">
        <div className="enl-scene" aria-hidden>
          <span className="enl-wave" />
          <span className="enl-wave" />
          <span className="enl-wave" />
          <MeditatorGlyph />
        </div>

        <div className="enl-body">
          <p className="enl-kicker">Enlightenment reached</p>
          <h2 className="enl-title">Not one thing missed</h2>
          <p className="t-sm t-sec">
            Every daily habit, every day, and every weekly habit — {fmtRange(week, addDays(week, 6))}.
            You wear the mark next to your name all week. Miss anything this week and it's gone.
          </p>
          <button className="btn btn-primary btn-lg btn-block" style={{ marginTop: 'var(--sp-4)' }} onClick={onClose}>
            Keep it going
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Original figure — a seated silhouette, with the brainwaves supplied by the
 *  animated rings behind it. */
function MeditatorGlyph() {
  return (
    <svg className="enl-figure" viewBox="0 0 120 100" role="presentation">
      <circle cx="60" cy="30" r="11" fill="currentColor" />
      <path d="M60 43c-10 0-17 7-19 16-1 5-6 7-13 8 8 5 19 8 32 8s24-3 32-8c-7-1-12-3-13-8-2-9-9-16-19-16Z" fill="currentColor" />
      <path d="M24 76c6-5 20-8 36-8s30 3 36 8c-9 6-22 9-36 9s-27-3-36-9Z" fill="currentColor" opacity="0.55" />
    </svg>
  );
}

/** The worn badge. One award only — a row of them would mean nothing. */
export function EnlightenedBadge({ compact }: { compact?: boolean }) {
  return (
    <span className={`enl-badge${compact ? ' is-compact' : ''}`} title="Enlightenment — a perfect habit week">
      <span className="enl-mark" aria-hidden>{Icons.lotus()}</span>
      {!compact && <span>Enlightened</span>}
    </span>
  );
}
