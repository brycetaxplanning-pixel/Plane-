/**
 * Keeping the data alive.
 *
 * Everything this app knows sits in one browser's localStorage. That is fine
 * until it isn't: Safari evicts storage for sites you have not opened in about
 * a week, clearing site data wipes it, and a lost phone takes it with it. There
 * is no server holding a copy.
 *
 * Two things help, and both are here. Asking the browser to mark the storage
 * persistent exempts it from routine eviction. And an export, taken now and
 * then, is the only thing that survives the phone.
 */

import type { AppState } from './schema';
import { diffDays, todayKey, type DateKey } from './date';

/** Past this, the reminder starts appearing. */
export const BACKUP_DUE_DAYS = 14;

export interface StorageHealth {
  /** True when the browser has promised not to evict this origin. */
  persisted: boolean;
  /** Whether asking is even possible here. */
  canAsk: boolean;
  usedBytes: number | null;
  quotaBytes: number | null;
}

export async function storageHealth(): Promise<StorageHealth> {
  const s = typeof navigator !== 'undefined' ? navigator.storage : undefined;
  if (!s) return { persisted: false, canAsk: false, usedBytes: null, quotaBytes: null };

  const persisted = typeof s.persisted === 'function' ? await s.persisted().catch(() => false) : false;
  let usedBytes: number | null = null;
  let quotaBytes: number | null = null;
  if (typeof s.estimate === 'function') {
    const est = await s.estimate().catch(() => null);
    usedBytes = est?.usage ?? null;
    quotaBytes = est?.quota ?? null;
  }

  return { persisted, canAsk: typeof s.persist === 'function', usedBytes, quotaBytes };
}

/**
 * Asks the browser to keep this origin's data. Chrome grants it silently once
 * the app is installed or used enough; Safari grants it on installation to the
 * home screen. A refusal is not an error — it just means the export matters
 * more.
 */
export async function requestPersistence(): Promise<boolean> {
  const s = typeof navigator !== 'undefined' ? navigator.storage : undefined;
  if (!s || typeof s.persist !== 'function') return false;
  try {
    return await s.persist();
  } catch {
    return false;
  }
}

/** How much there is to lose, in round numbers. */
export function whatIsAtStake(s: AppState): { items: number; oldest: DateKey | null } {
  const dates: DateKey[] = [];
  let items = 0;

  const count = (n: number, first?: DateKey) => {
    items += n;
    if (first) dates.push(first);
  };

  const earliest = (list: { date?: DateKey; createdAt?: DateKey }[]): DateKey | undefined =>
    list.map((x) => x.date ?? x.createdAt).filter((d): d is DateKey => Boolean(d)).sort()[0];

  count(s.work.projects.length, earliest(s.work.projects));
  count(s.planning.outreach.length, earliest(s.planning.outreach));
  count(s.spanish.sessions.length, earliest(s.spanish.sessions));
  count(s.fitness.activities.length, earliest(s.fitness.activities));
  count(s.finance.transactions.length, earliest(s.finance.transactions));
  count(s.habits.logs.length, earliest(s.habits.logs));
  count(s.notes.items.length);
  count(s.health.meals.length + s.health.vitals.length + s.health.panels.length, earliest(s.health.vitals));
  count(s.dating.outings.length, earliest(s.dating.outings));
  count(s.xp.length, earliest(s.xp));

  return { items, oldest: dates.sort()[0] ?? null };
}

export interface BackupStatus {
  /** Null when there has never been one. */
  lastExport: DateKey | null;
  daysSince: number | null;
  due: boolean;
  items: number;
  /** How far back the log goes, so the warning can say what is at risk. */
  oldest: DateKey | null;
}

export function backupStatus(s: AppState): BackupStatus {
  const last = s.settings.lastExport ?? null;
  const stake = whatIsAtStake(s);
  const daysSince = last ? diffDays(todayKey(), last) : null;

  return {
    lastExport: last,
    daysSince,
    // Nothing logged yet is nothing to lose, so it stays quiet until there is.
    due: stake.items >= 20 && (daysSince === null || daysSince >= BACKUP_DUE_DAYS),
    items: stake.items,
    oldest: stake.oldest,
  };
}

export const backupFilename = (): string => `plane-backup-${todayKey()}.json`;

/**
 * What is actually taking up the space, biggest first.
 *
 * Worth knowing because the answer is usually one thing. Goal photos used to
 * be that thing — stored inline, a handful of them was most of the budget —
 * which is why they now live in IndexedDB and are not counted here.
 */
export function spaceByPart(s: AppState): { label: string; bytes: number }[] {
  const size = (v: unknown): number => {
    try {
      return new Blob([JSON.stringify(v ?? null)]).size;
    } catch {
      return 0;
    }
  };

  return [
    // Photos are in IndexedDB, not in this blob — they are reported by the
    // Backups card separately, because they do not compete for this space.
    { label: 'Transactions', bytes: size(s.finance.transactions) },
    { label: 'Notes', bytes: size(s.notes.items) },
    { label: 'Health log', bytes: size(s.health.meals) + size(s.health.vitals) + size(s.health.panels) },
    { label: 'Habit log', bytes: size(s.habits.logs) },
    { label: 'Training log', bytes: size(s.fitness.activities) },
    { label: 'Conversations', bytes: size(s.coach.chat) + size(s.fitness.chat) + size(s.finance.chat) + size(s.spanish.tutorChat) },
    { label: 'Notifications', bytes: size(s.notifications.items) },
    { label: 'XP history', bytes: size(s.xp) },
  ]
    .filter((p) => p.bytes > 0)
    .sort((a, b) => b.bytes - a.bytes);
}
