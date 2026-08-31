import { useTabParam } from '../lib/router';
import { Timeline } from './tracker/Timeline';
import { Reminders } from './tracker/Reminders';
import { Tabs, panelProps } from '../components/ui/Tabs';

/** Cross-module, so it has no data of its own and no identity colour —
 *  it sits with Progress and Settings rather than in the numbered modules. */
export function Tracker() {
  const [tab, setTab] = useTabParam(['timeline', 'reminders'] as const, 'timeline');

  return (
    <div className="stack">
      <Tabs
        idBase="tracker"
        label="Tracker sections"
        active={tab}
        onChange={setTab}
        tabs={[{ id: 'timeline', label: 'Timeline' }, { id: 'reminders', label: 'Reminders' }]}
      />

      <div className="stack" {...panelProps('tracker', tab)}>
        {tab === 'timeline' && <Timeline />}
        {tab === 'reminders' && <Reminders />}
      </div>
    </div>
  );
}
