import { bucketOf, type AppState, type ModuleId } from '../lib/schema';
import { inWeek, lastDays, lastWeeks, monthKey, todayKey, weekDays, weekStart, type DateKey } from '../lib/date';
import { needsReview } from '../lib/finance';

export interface ModuleSummary {
  id: ModuleId;
  /** 0–1 progress toward this module's weekly goal. */
  progress: number;
  /** The one number worth putting on the card. */
  headline: string;
  /** What the number is. */
  caption: string;
  /** Something that needs attention now, if anything. */
  nudge?: string;
}

/* ---------------- Module 1: Abitos Tax Prep ---------------- */

export function workStats(s: AppState) {
  const open = s.work.projects.filter((p) => p.stage !== 'Filed');
  const today = todayKey();
  const overdue = open.filter((p) => p.due && p.due < today);
  const dueThisWeek = open.filter((p) => p.due && inWeek(p.due));
  const waiting = open.filter((p) => p.stage === 'Waiting on client');
  const filedThisWeek = s.work.projects.filter((p) => p.completedAt && inWeek(p.completedAt));
  const allTasks = s.work.projects.flatMap((p) => p.tasks);
  const doneTasks = allTasks.filter((t) => t.done);
  return {
    open, overdue, dueThisWeek, waiting, filedThisWeek,
    taskProgress: allTasks.length ? doneTasks.length / allTasks.length : 0,
    taskCount: allTasks.length,
    doneTaskCount: doneTasks.length,
    openCount: open.length,
    filedCount: s.work.projects.filter((p) => p.stage === 'Filed').length,
  };
}

/* ---------------- Module 2: Bryce Tax Planning ---------------- */

export function planningStats(s: AppState) {
  const target = s.planning.weeklyTarget;
  const thisWeek = s.planning.outreach.filter((o) => inWeek(o.date));
  const byDay = weekDays().map((d) => ({
    key: d,
    value: s.planning.outreach.filter((o) => o.date === d).length,
  }));
  const history = lastWeeks(8).map((ws) => ({
    key: ws,
    value: s.planning.outreach.filter((o) => weekStart(o.date) === ws).length,
  }));
  const meetings = thisWeek.filter((o) => o.outcome === 'Meeting booked').length;
  const daysLeft = Math.max(0, 7 - byDay.filter((d) => d.key <= todayKey()).length + 1);
  const remaining = Math.max(0, target - thisWeek.length);
  return {
    target,
    count: thisWeek.length,
    remaining,
    meetings,
    byDay,
    history,
    /** How many a day is needed to still finish the week on target. */
    perDayNeeded: daysLeft > 0 ? Math.ceil(remaining / daysLeft) : remaining,
    daysLeft,
    openDeals: s.planning.deals.filter((d) => d.stage !== 'Won' && d.stage !== 'Lost'),
    pipelineValue: s.planning.deals
      .filter((d) => d.stage !== 'Lost')
      .reduce((sum, d) => sum + d.value, 0),
  };
}

/* ---------------- Module 3: Spanish ---------------- */

export function spanishStats(s: AppState) {
  const minutes = (keys: DateKey[]) =>
    s.spanish.sessions.filter((x) => keys.includes(x.date)).reduce((n, x) => n + x.minutes, 0);

  const week = weekDays();
  const todayMinutes = minutes([todayKey()]);
  const weekMinutes = minutes(week);
  const allMinutes = s.spanish.sessions.reduce((n, x) => n + x.minutes, 0);
  const byDay = lastDays(14).map((d) => ({
    key: d,
    value: s.spanish.sessions.filter((x) => x.date === d).reduce((n, x) => n + x.minutes, 0),
  }));
  const byPlatform: Record<string, number> = {};
  for (const x of s.spanish.sessions) byPlatform[x.platform] = (byPlatform[x.platform] ?? 0) + x.minutes;

  return {
    todayMinutes, weekMinutes, allMinutes, byDay, byPlatform,
    hours: allMinutes / 60,
    dailyGoal: s.spanish.dailyGoalMinutes,
    weeklyGoal: s.spanish.weeklyGoalMinutes,
    daysStudiedThisWeek: week.filter((d) => s.spanish.sessions.some((x) => x.date === d)).length,
  };
}

/* ---------------- Module 4: Fitness ---------------- */

export function fitnessStats(s: AppState) {
  const week = s.fitness.activities.filter((a) => inWeek(a.date));
  const mma = week.filter((a) => bucketOf(a.type) === 'mma').length;
  const strength = week.filter((a) => bucketOf(a.type) === 'strength').length;
  const total = week.length;
  const t = s.fitness.targets;

  /** Sessions left once MMA and strength quotas are met — the "five other
   *  things" that running and basketball fill. */
  const flexTarget = Math.max(0, t.total - t.mma - t.strength);
  const flexDone = Math.max(0, total - Math.min(mma, t.mma) - Math.min(strength, t.strength));

  const byDay = weekDays().map((d) => ({
    key: d,
    value: s.fitness.activities.filter((a) => a.date === d).length,
  }));
  const runKmThisWeek = week.reduce((n, a) => n + (a.distanceKm ?? 0), 0);
  const runHistory = lastWeeks(8).map((ws) => ({
    key: ws,
    value: s.fitness.activities
      .filter((a) => weekStart(a.date) === ws)
      .reduce((n, a) => n + (a.distanceKm ?? 0), 0),
  }));
  const longestRun = s.fitness.activities.reduce((m, a) => Math.max(m, a.distanceKm ?? 0), 0);

  return {
    mma, strength, total, flexDone, flexTarget, targets: t,
    byDay, runKmThisWeek, runHistory, longestRun,
    weekMinutes: week.reduce((n, a) => n + a.minutes, 0),
    remaining: Math.max(0, t.total - total),
  };
}

/* ---------------- Module 5: Finances ---------------- */

export function financeStats(s: AppState, month = monthKey()) {
  const inMonth = s.finance.transactions.filter((t) => monthKey(t.date) === month);
  const spent = inMonth.reduce((n, t) => n + t.amount, 0);
  const budgetTotal = Object.values(s.finance.budgets).reduce((n, v) => n + v, 0);
  const review = needsReview(s.finance.transactions);
  return {
    month, inMonth, spent, budgetTotal, review,
    reviewCount: review.length,
    remaining: budgetTotal - spent,
    pctOfBudget: budgetTotal > 0 ? spent / budgetTotal : 0,
  };
}

/* ---------------- Module 6: Life Coach ---------------- */

export function coachStats(s: AppState) {
  const openGoals = s.coach.goals.filter((g) => !g.done);
  const checkedInToday = s.coach.checkIns.some((c) => c.date === todayKey());
  const weekCheckIns = s.coach.checkIns.filter((c) => inWeek(c.date));
  const recent = [...s.coach.checkIns].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 14).reverse();
  return {
    openGoals, checkedInToday, weekCheckIns,
    moodTrend: recent.map((c) => ({ key: c.date, value: c.mood })),
    energyTrend: recent.map((c) => ({ key: c.date, value: c.energy })),
    doneGoals: s.coach.goals.filter((g) => g.done).length,
  };
}

/* ---------------- Dashboard roll-up ---------------- */

export function moduleSummaries(s: AppState): Record<ModuleId, ModuleSummary> {
  const work = workStats(s);
  const plan = planningStats(s);
  const esp = spanishStats(s);
  const fit = fitnessStats(s);
  const fin = financeStats(s);
  const coach = coachStats(s);

  return {
    work: {
      id: 'work',
      progress: work.taskProgress,
      headline: `${work.doneTaskCount}/${work.taskCount}`,
      caption: 'tasks done',
      nudge: work.overdue.length
        ? `${work.openCount} open · ${work.overdue.length} past due`
        : work.dueThisWeek.length
          ? `${work.openCount} open · ${work.dueThisWeek.length} due this week`
          : work.openCount
            ? `${work.openCount} open project${work.openCount === 1 ? '' : 's'}`
            : undefined,
    },
    planning: {
      id: 'planning',
      progress: plan.target ? plan.count / plan.target : 0,
      headline: `${plan.count}/${plan.target}`,
      caption: 'outreach',
      nudge: plan.remaining > 0 ? `${plan.perDayNeeded}/day to stay on pace` : 'weekly target hit',
    },
    spanish: {
      id: 'spanish',
      progress: esp.dailyGoal ? esp.todayMinutes / esp.dailyGoal : 0,
      headline: `${esp.todayMinutes}m`,
      caption: 'studied today',
      nudge: esp.todayMinutes >= esp.dailyGoal
        ? 'daily goal met'
        : `${esp.dailyGoal - esp.todayMinutes}m to today's goal`,
    },
    fitness: {
      id: 'fitness',
      progress: fit.targets.total ? fit.total / fit.targets.total : 0,
      headline: `${fit.total}/${fit.targets.total}`,
      caption: 'sessions',
      nudge: fit.mma < fit.targets.mma
        ? `${fit.targets.mma - fit.mma} MMA left`
        : fit.strength < fit.targets.strength
          ? `${fit.targets.strength - fit.strength} lifting left`
          : fit.remaining > 0 ? `${fit.remaining} to fill` : 'week complete',
    },
    finance: {
      id: 'finance',
      progress: Math.min(1, fin.pctOfBudget),
      headline: fin.budgetTotal ? `${Math.round(fin.pctOfBudget * 100)}%` : `${fin.inMonth.length}`,
      caption: fin.budgetTotal ? 'of budget' : 'transactions',
      nudge: fin.reviewCount ? `${fin.reviewCount} need a category` : undefined,
    },
    coach: {
      id: 'coach',
      progress: coach.weekCheckIns.length / 7,
      headline: `${coach.weekCheckIns.length}/7`,
      caption: 'check-ins',
      nudge: coach.checkedInToday
        ? `${coach.openGoals.length} open goal${coach.openGoals.length === 1 ? '' : 's'}`
        : 'no check-in yet today',
    },
  };
}
