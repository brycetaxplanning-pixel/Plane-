import type { Business } from '../../lib/schema';
import { weekStart } from '../../lib/date';
import { useApp } from '../../state/context';
import { NumberInput } from '../../components/ui/NumberInput';
import { Icons } from '../../components/layout/Icons';

/**
 * This week's outreach as one number you can change.
 *
 * Logging people one at a time is the wrong shape when the names already live
 * somewhere else — a bot's dashboard, a spreadsheet — and all that is wanted
 * here is the count and the trend. So: minus on the left, the number, plus on
 * the right, and the number itself is typeable for the days you did forty and
 * are entering them at once.
 *
 * It is stored against the Monday of the week, not the day, because the target
 * is weekly and a week's number is the thing being tracked. Nothing has to be
 * attributed to a particular day, so nothing has to guess one.
 */
export function OutreachCounter({ business, logged }: { business: Business; logged: number }) {
  const { update, toast } = useApp();
  const week = weekStart();
  const counted = business.countedOutreach?.[week] ?? 0;

  // The number on screen is the week's number, not the hand-counted slice of
  // it. Showing 0 beside a ring reading 24 would be two answers to one
  // question; stepping it moves the part that is yours to move, and typing a
  // total works back to what the hand count has to be for the total to be it.
  const total = logged + counted;

  const set = (n: number, say?: string) => {
    const next = Math.max(0, Math.round(n));
    update((s) => ({
      ...s,
      planning: {
        ...s.planning,
        businesses: s.planning.businesses.map((b) => (b.id === business.id
          ? { ...b, countedOutreach: { ...b.countedOutreach, [week]: next } }
          : b)),
      },
    }));
    if (say) toast(say);
  };

  return (
    <div className="counter">
      <button
        className="counter-step"
        onClick={() => set(counted - 1)}
        // The logged contacts are real records; the counter cannot argue them
        // away, so the floor is however many of those the week already has.
        disabled={counted === 0}
        aria-label="One fewer"
        title={counted === 0 && logged > 0 ? `${logged} are logged contacts and cannot be counted down` : undefined}
      >
        <span aria-hidden>{Icons.minus()}</span>
      </button>

      <NumberInput
        className="input counter-value"
        min={logged}
        max={99999}
        value={total}
        onChange={(n) => set(n - logged)}
        aria-label="Outreach this week"
      />

      <button className="counter-step" onClick={() => set(counted + 1)} aria-label="One more">
        <span aria-hidden>{Icons.plus()}</span>
      </button>
    </div>
  );
}
