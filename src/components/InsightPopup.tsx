import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Insight } from '../lib/insights';
import { routeOf } from '../lib/router';

/**
 * The unprompted one. Slides in a moment after the app settles rather than
 * blocking the screen — it is an observation, not a decision to make.
 * Rate-limited to one a day upstream, and only ever raised when a finding
 * clears the strength floor.
 */
export function InsightPopup({
  insight, onDismiss, onSnooze,
}: {
  insight: Insight;
  onDismiss: () => void;
  onSnooze: () => void;
}) {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setShown(true), 900);
    return () => clearTimeout(t);
  }, []);

  if (!shown) return null;

  return createPortal(
    <aside className="pop" role="status" aria-live="polite">
      <div className="pop-head">
        <span className="pop-kicker">Something I noticed</span>
        <button className="btn btn-ghost btn-icon" aria-label="Close" onClick={onSnooze}>✕</button>
      </div>
      <h3 className="pop-title">{insight.title}</h3>
      <p className="t-sm t-sec">{insight.body}</p>
      <p className="t-xs t-muted" style={{ marginTop: 6 }}>{insight.evidence}</p>
      <div className="row-2" style={{ marginTop: 'var(--sp-3)' }}>
        <a className="btn btn-sm btn-primary" href={routeOf('coach')} onClick={onSnooze}>See the rest</a>
        <button className="btn btn-sm btn-ghost" onClick={onDismiss}>Don't show this again</button>
      </div>
    </aside>,
    document.body,
  );
}
