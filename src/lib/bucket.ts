import type { AppState, BucketItem } from './schema';
import { fromKey, todayKey, type DateKey } from './date';

/**
 * The line at the top of the bucket list.
 *
 * One a day, the same one all day, a different one tomorrow. The point of it is
 * not encouragement — the list does not need cheering on, it needs somebody to
 * say out loud that the window is not open forever. So these are blunt, they
 * are about time rather than about achievement, and none of them congratulates
 * you for having written something down.
 *
 * Picked off the date rather than at random, so it does not reshuffle every
 * time the screen is opened, and so two openings an hour apart do not argue.
 */
const LINES: string[] = [
  'You only live once. Start doing more cool shit.',
  'You will never have less responsibility than you do today.',
  'You cannot skydive at 50 with a family in the car.',
  'Nobody gets to the end wishing they had stayed in more.',
  'The body you would need for half of this list has an expiry date.',
  'Waiting for the right time is how the list gets read at a funeral.',
  'You have roughly 4,000 weeks. This is one of them.',
  'The money comes back. The years do not.',
  'Every year you put one off, it gets harder, not easier.',
  'A list is not a plan. Pick one and put a date on it.',
  'The version of you who does this has to start somewhere. Start here.',
  'Someday is not a day of the week.',
  'You will not regret the cost. You will regret the not going.',
  'Ten years from now you will wish you had gone ten years ago.',
];

export function bucketLine(day: DateKey = todayKey()): string {
  // Days since the epoch, so it advances by exactly one each midnight.
  const n = Math.floor(fromKey(day).getTime() / 86_400_000);
  return LINES[((n % LINES.length) + LINES.length) % LINES.length];
}

/** How many lines there are, for the test that proves they rotate. */
export const bucketLineCount = LINES.length;

export interface BucketStats {
  open: BucketItem[];
  done: BucketItem[];
  /** Share crossed off. A list you have finished is a life well spent. */
  progress: number;
}

export function bucketStats(s: AppState): BucketStats {
  const items = s.bucket?.items ?? [];
  const done = items.filter((i) => i.done);
  return {
    open: items.filter((i) => !i.done),
    done,
    progress: items.length ? done.length / items.length : 0,
  };
}
