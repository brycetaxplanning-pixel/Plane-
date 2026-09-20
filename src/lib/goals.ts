import type { Goal } from './schema';
import { fmtMoney } from './finance';
import { relativeDay } from './date';

/** The three lines the card shows, in the order they are read:
 *  what the goal is, what it costs, and how you get there. */
export interface GoalLines {
  cost: string | null;
  plan: string | null;
  /** Whatever was written down to be read back later. */
  notes: string | null;
  meta: string | null;
}

export function goalLines(goal: Goal, currency: string): GoalLines {
  const parts: string[] = [];

  if (goal.kind === 'Purchase') {
    if (goal.cost) parts.push(`${fmtMoney(goal.cost, currency)} cash`);
    if (goal.monthly) parts.push(`or ~${fmtMoney(goal.monthly, currency)}/mo`);
  } else if (goal.kind === 'Recurring cost') {
    if (goal.monthly) parts.push(`${fmtMoney(goal.monthly, currency)}/mo`);
    if (goal.cost) parts.push(`${fmtMoney(goal.cost, currency)} up front`);
  } else if (goal.kind === 'Training') {
    if (goal.weeks) parts.push(`${goal.weeks}-week training window`);
  }
  if (goal.costNote) parts.push(goal.costNote);

  return {
    cost: parts.length ? parts.join(' · ') : null,
    plan: goal.plan ?? null,
    notes: goal.notes ?? null,
    meta: goal.due ? `Target ${relativeDay(goal.due)}` : null,
  };
}

export const goalProgress = (goal: Goal): number | null => {
  if (!goal.target || goal.target <= 0) return null;
  return Math.max(0, Math.min(1, (goal.current ?? 0) / goal.target));
};

export function goalProgressLabel(goal: Goal, currency: string): string | null {
  if (!goal.target || goal.target <= 0) return null;
  const money = goal.unit === '$' || goal.unit === currency;
  const fmt = (n: number) => (money ? fmtMoney(n, currency) : `${n}${goal.unit ? ` ${goal.unit}` : ''}`);
  return `${fmt(goal.current ?? 0)} of ${fmt(goal.target)}`;
}

/**
 * What the form asks once a kind is picked.
 *
 * Not just which fields to show — what to call them and what to put in them.
 * The form used to be a purchase with the purchase bits hidden: a goal about
 * posting on Instagram still asked what it cost, and the progress row still
 * suggested 6500 out of 24000 in dollars, which is the shape of a car.
 *
 * Every kind names its own fields and carries its own examples, so picking one
 * changes the questions rather than just removing some of them.
 */
export interface KindShape {
  cost: boolean;
  monthly: boolean;
  costNote: boolean;
  weeks: boolean;
  progress: boolean;
  title: string;
  costLabel: string;
  costHint: string;
  monthlyLabel: string;
  monthlyHint: string;
  planLabel: string;
  planHint: string;
  progressLabel: string;
  currentHint: string;
  targetHint: string;
  unitHint: string;
}

export const KIND_SHAPE: Record<Goal['kind'], KindShape> = {
  Custom: {
    cost: false, monthly: false, costNote: false, weeks: false, progress: true,
    title: 'Gain traction on Instagram',
    costLabel: '', costHint: '', monthlyLabel: '', monthlyHint: '',
    planLabel: 'How you get there',
    planHint: 'Three reels a week, all on one topic',
    progressLabel: 'Count toward it',
    currentHint: '400', targetHint: '5000', unitHint: 'followers',
  },
  Purchase: {
    cost: true, monthly: true, costNote: true, weeks: false, progress: true,
    title: 'Own a used Tesla',
    costLabel: 'Cash price', costHint: '24000',
    monthlyLabel: 'Or per month', monthlyHint: '400',
    planLabel: 'How you pay for it',
    planHint: 'Make $400 more a month',
    progressLabel: 'Put aside so far',
    currentHint: '6500', targetHint: '24000', unitHint: '$',
  },
  'Recurring cost': {
    cost: true, monthly: true, costNote: true, weeks: false, progress: false,
    title: 'Move into a two-bed',
    costLabel: 'Up front', costHint: '3000',
    monthlyLabel: 'Per month', monthlyHint: '2200',
    planLabel: 'How you afford it',
    planHint: 'Get income to $7k a month',
    progressLabel: '', currentHint: '', targetHint: '', unitHint: '',
  },
  Training: {
    cost: false, monthly: false, costNote: false, weeks: true, progress: true,
    title: 'Run a sub-1:50 half',
    costLabel: '', costHint: '', monthlyLabel: '', monthlyHint: '',
    planLabel: 'How you train for it',
    planHint: 'Four runs a week, one of them long',
    progressLabel: 'Sessions done',
    currentHint: '8', targetHint: '36', unitHint: 'sessions',
  },
};

export const DEFAULT_UNIT: Record<Goal['kind'], string> = {
  Purchase: '$',
  'Recurring cost': '$',
  Training: 'sessions',
  Custom: '',
};

/**
 * Photos go into localStorage, so they are downscaled hard before being
 * stored — a phone photo is several megabytes and the whole origin gets
 * about five. 720px on the long edge at JPEG quality 0.72 lands well under
 * 150KB and still looks right on a card.
 */
export function resizeImage(file: File, maxEdge = 720, quality = 0.72): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Could not read that image.')); return; }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that image.')); };
    img.src = url;
  });
}
