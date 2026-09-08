import { Timeline } from './tracker/Timeline';

/**
 * Everything with a date on it, from every module, on one line.
 *
 * It used to carry a Reminders tab as well. Reminders are a module of their
 * own now — a to-do you cannot find is a to-do you do not write down — and
 * dated ones still appear on the timeline below, which is the one view that
 * is genuinely about dates rather than about a list.
 */
export function Tracker() {
  return (
    <div className="stack">
      <Timeline />
    </div>
  );
}
