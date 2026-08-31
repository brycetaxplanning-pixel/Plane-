import type { Goal } from './schema';
import { fmtMoney } from './finance';
import { relativeDay } from './date';

/** The three lines the card shows, in the order they are read:
 *  what the goal is, what it costs, and how you get there. */
export interface GoalLines {
  cost: string | null;
  plan: string | null;
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

/** Fields that make sense for each kind, so the form only asks what matters. */
export const kindFields = (kind: Goal['kind']) => ({
  cost: kind === 'Purchase' || kind === 'Recurring cost',
  monthly: kind === 'Purchase' || kind === 'Recurring cost',
  weeks: kind === 'Training',
  progress: kind !== 'Recurring cost',
});

export const DEFAULT_UNIT: Record<Goal['kind'], string> = {
  Purchase: '$',
  'Recurring cost': '$',
  Training: 'weeks',
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
