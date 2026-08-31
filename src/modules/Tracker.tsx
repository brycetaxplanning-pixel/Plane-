import { useTabParam } from '../lib/router';
import { Timeline } from './tracker/Timeline';
import { Reminders } from './tracker/Reminders';

/** Cross-module, so it has no data of its own and no identity colour —
 *  it sits with Progress and Settings rather than in the numbered modules. */
export function Tracker() {
  const [tab, setTab] = useTabParam(['timeline', 'reminders'] as const, 'timeline');

  return (
    <div className="stack">
      <div className="tabs" role="tablist">
        <button className="tab" role="tab" aria-selected={tab === 'timeline'} onClick={() => setTab('timeline')}>Timeline</button>
        <button className="tab" role="tab" aria-selected={tab === 'reminders'} onClick={() => setTab('reminders')}>Reminders</button>
      </div>

      {tab === 'timeline' && <Timeline />}
      {tab === 'reminders' && <Reminders />}
    </div>
  );
}
