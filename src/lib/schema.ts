import type { DateKey } from './date';
import type { SkinId } from './themes';

export const SCHEMA_VERSION = 1;

export type ModuleId =
  | 'work' | 'planning' | 'spanish' | 'fitness' | 'finance'
  | 'habits' | 'goals' | 'notes' | 'coach' | 'health' | 'dating';

/* ------------------------------------------------------------------ */
/* Module 1 — Abitos Tax Prep (day job)                               */
/* ------------------------------------------------------------------ */

export const WORK_STAGES = [
  'Not started',
  'In progress',
  'Waiting on client',
  'In review',
  'Filed',
] as const;
export type WorkStage = (typeof WORK_STAGES)[number];

export const WORK_SERVICES = [
  '1040', '1120-S', '1065', '1120', 'Bookkeeping', 'Payroll', 'Extension', 'Amendment', 'Other',
] as const;
export type WorkService = (typeof WORK_SERVICES)[number];

export type Priority = 'low' | 'normal' | 'high';

export interface WorkTask {
  id: string;
  title: string;
  done: boolean;
  doneAt?: DateKey;
}

export interface WorkProject {
  id: string;
  client: string;
  service: WorkService;
  stage: WorkStage;
  priority: Priority;
  due?: DateKey;
  notes?: string;
  tasks: WorkTask[];
  createdAt: DateKey;
  completedAt?: DateKey;
}

/* ------------------------------------------------------------------ */
/* Module 2 — Bryce Tax Planning (outreach pipeline)                   */
/* ------------------------------------------------------------------ */

export const CHANNELS = ['Call', 'Email', 'LinkedIn', 'Text', 'In person', 'Referral'] as const;
export type Channel = (typeof CHANNELS)[number];

export const OUTCOMES = ['No answer', 'Conversation', 'Meeting booked', 'Not a fit', 'Closed'] as const;
export type Outcome = (typeof OUTCOMES)[number];

/** A business you run. Outreach and deals belong to one, so two ventures do
 *  not share a single pipeline or a single weekly target. */
export interface Business {
  id: string;
  name: string;
  emoji: string;
  /** Contacts a week for this business. Zero means it is not an outreach
   *  business at all — a product line, say — and the counter is hidden. */
  weeklyTarget: number;
  notes?: string;
  archived?: boolean;
  createdAt: DateKey;
}

export interface Outreach {
  id: string;
  businessId?: string;
  date: DateKey;
  name: string;
  channel: Channel;
  outcome: Outcome;
  notes?: string;
}

export const IDEA_STAGES = ['Spark', 'Exploring', 'Building', 'Live', 'Parked'] as const;
export type IdeaStage = (typeof IDEA_STAGES)[number];

export const IDEA_EFFORT = ['Easy start', 'Real project', 'Heavy lift'] as const;
export type IdeaEffort = (typeof IDEA_EFFORT)[number];

/** A business idea. `summary` is the one line you see in the list; `detail`
 *  is the long version for the ones that need explaining later. */
export interface BusinessIdea {
  id: string;
  title: string;
  summary?: string;
  detail?: string;
  stage: IdeaStage;
  effort: IdeaEffort;
  nextStep?: string;
  /** Steps the assistant drafted, so a plan survives closing the app. */
  steps?: { id: string; text: string; done: boolean }[];
  /** Set when the offer to help start it was waved away, so it comes back
   *  later rather than every time the tab is opened. */
  snoozedUntil?: DateKey;
  createdAt: DateKey;
}

export const DEAL_STAGES = ['Lead', 'Contacted', 'Meeting set', 'Proposal', 'Won', 'Lost'] as const;
export type DealStage = (typeof DEAL_STAGES)[number];

export interface Deal {
  id: string;
  businessId?: string;
  name: string;
  stage: DealStage;
  value: number;
  nextStep?: string;
  nextStepDate?: DateKey;
  createdAt: DateKey;
}

/* ------------------------------------------------------------------ */
/* Module 3 — Spanish                                                  */
/* ------------------------------------------------------------------ */

export interface StudyLink {
  id: string;
  label: string;
  url: string;
}

export type TutorLevel = 'Beginner' | 'Intermediate' | 'Advanced';

export const DIALECTS = [
  { id: 'es-ES', label: 'Spain' },
  { id: 'es-MX', label: 'Mexico' },
  { id: 'es-US', label: 'US Spanish' },
  { id: 'es-AR', label: 'Argentina' },
] as const;
export type Dialect = (typeof DIALECTS)[number]['id'];

export interface TutorConfig {
  level: TutorLevel;
  topic: string;
  dialect: Dialect;
  /** Playback speed of the tutor's voice; slower helps at lower levels. */
  speechRate: number;
  /** Keep listening after the tutor finishes speaking — the hands-free loop. */
  autoContinue: boolean;
  /** Mix English into corrections. Off means immersion. */
  translate: boolean;
}

export interface StudySession {
  id: string;
  date: DateKey;
  minutes: number;
  platform: string;
  kind: 'Lesson' | 'Self study' | 'Listening' | 'Conversation' | 'Reading';
  notes?: string;
}

/* ------------------------------------------------------------------ */
/* Module 4 — Fitness                                                  */
/* ------------------------------------------------------------------ */

/** `bucket` is what the weekly quotas count; `label` is what you did. */
export const ACTIVITY_TYPES = [
  { label: 'MMA',          bucket: 'mma' },
  { label: 'Jiu-jitsu',    bucket: 'mma' },
  { label: 'Boxing',       bucket: 'mma' },
  { label: 'Weightlifting', bucket: 'strength' },
  { label: 'Calisthenics', bucket: 'strength' },
  { label: 'Run',          bucket: 'other' },
  { label: 'Long run',     bucket: 'other' },
  { label: 'Basketball',   bucket: 'other' },
  { label: 'Cycling',      bucket: 'other' },
  { label: 'Swim',         bucket: 'other' },
  { label: 'Mobility',     bucket: 'other' },
  { label: 'Other',        bucket: 'other' },
] as const;

export type ActivityBucket = 'mma' | 'strength' | 'other';
export type ActivityLabel = (typeof ACTIVITY_TYPES)[number]['label'];

export const bucketOf = (label: string): ActivityBucket =>
  ACTIVITY_TYPES.find((a) => a.label === label)?.bucket ?? 'other';

export interface Activity {
  id: string;
  date: DateKey;
  type: string;
  minutes: number;
  distanceKm?: number;
  rpe?: number; // 1–10 perceived effort
  notes?: string;
}

/** A body measurement, logged over time. */
export interface Measurement {
  id: string;
  date: DateKey;
  /** Which measurement — chest, waist, and so on. Free text so anyone can
   *  track what they actually care about. */
  site: string;
  value: number;
  unit: string;
  note?: string;
}

export const PHYSIQUE_AREAS = ['Chest', 'Back', 'Shoulders', 'Arms', 'Legs', 'Core', 'Posture', 'Mobility', 'Body composition'] as const;
export type PhysiqueArea = (typeof PHYSIQUE_AREAS)[number];

/** A physique or movement goal. Some are measurable, some are qualitative —
 *  "stand up straighter" has no number and does not need one. */
export interface PhysiqueGoal {
  id: string;
  title: string;
  area: PhysiqueArea;
  /** Ties the goal to a measurement site so progress can be read off the log. */
  site?: string;
  target?: number;
  unit?: string;
  plan?: string;
  done: boolean;
  createdAt: DateKey;
}

export interface RaceGoal {
  name: string;
  date?: DateKey;
  distanceKm: number;
  targetTime?: string;
}

/** One line of the weekly plan: an activity and how many times a week.
 *  Locked lines carry over automatically; unlocked ones belong to the week
 *  they were added in and disappear afterwards. */
export interface PlanItem {
  id: string;
  activity: string;
  perWeek: number;
  locked: boolean;
  /** Set only on unlocked lines: the Monday of the week they apply to. */
  week?: DateKey;
  createdAt: DateKey;
}

export interface FitnessTargets {
  mma: number;
  strength: number;
  total: number;
}

/* ------------------------------------------------------------------ */
/* Module 5 — Finances                                                 */
/* ------------------------------------------------------------------ */

/** Money set aside for one named thing. Kept in Finances rather than in
 *  Goals because the honest question — can you actually afford it — can only
 *  be answered against real spend. */
export interface SavingGoal {
  id: string;
  name: string;
  emoji: string;
  /** What it costs in full. */
  target: number;
  /** What you can put in each month, as you have decided it. */
  monthly: number;
  /** The date you want it by. Without one there is no "behind" to be. */
  targetDate?: DateKey;
  /** Which preset it came from, so the follow-up questions can be tailored. */
  preset?: string;
  /** A goal in the Goals module this was created from. */
  goalId?: string;
  note?: string;
  createdAt: DateKey;
  /** Every deposit, including the "already saved" one made on day one.
   *  The balance is their sum — there is no second figure to disagree. */
  contributions: SavingDeposit[];
  /** Answers to the follow-up questions, kept so the coach can use them. */
  answers?: { question: string; answer: string }[];
  archived?: boolean;
}

export interface SavingDeposit {
  id: string;
  date: DateKey;
  amount: number;
  note?: string;
}

export const DEFAULT_CATEGORIES = [
  'Groceries', 'Meat', 'Restaurants', 'Entertainment', 'Shopping', 'Transport',
  'Housing', 'Utilities', 'Health', 'Fitness', 'Education', 'Travel',
  'Subscriptions', 'Business', 'Other',
] as const;

/** A transaction can be split across categories — one Amazon charge becomes
 *  $40 snorkel gear + $70 running shoes. Splits, when present, are the
 *  source of truth and must sum to the transaction amount. */
export interface Split {
  id: string;
  category: string;
  amount: number;
  note?: string;
}

export interface Transaction {
  id: string;
  date: DateKey;
  vendor: string;
  amount: number;          // positive = money out
  category?: string;       // ignored when splits are present
  splits?: Split[];
  note?: string;
  reviewed: boolean;
  source: 'manual' | 'import';
}

export const ACCOUNT_TYPES = ['Brokerage', '401(k)', 'Roth IRA', 'Traditional IRA', 'HSA', 'Crypto', 'Savings'] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export interface InvestmentAccount {
  id: string;
  name: string;
  type: AccountType;
  balance: number;
  /** What you add to this account every month. */
  monthly: number;
  note?: string;
  /** Set once a real connection replaces the manual figure. */
  linked?: boolean;
  updatedAt: DateKey;
}

/** The knobs behind the projection chart. Stored so the sliders come back
 *  where you left them. */
export interface Projection {
  years: number;
  returnPct: number;
  inflationPct: number;
  /** Show tomorrow's money in today's purchasing power. */
  real: boolean;
  /** What you add each month. `null` means "use the sum of the accounts",
   *  so editing an account keeps the projection honest by default. */
  monthlyOverride: number | null;
}

/** Matched case-insensitively against the vendor string. */
export interface VendorRule {
  id: string;
  pattern: string;
  category: string;
  /** Vendors that need a follow-up question rather than a silent category. */
  alwaysAsk?: boolean;
}

/* ------------------------------------------------------------------ */
/* Module 6 — Habits                                                   */
/* ------------------------------------------------------------------ */

export type Cadence = 'daily' | 'weekly';

/** How a habit is satisfied.
 *  - check: did it or didn't
 *  - amount: hit at least a number (protein, minutes)
 *  - before: happened no later than a clock time (in bed by 23:30) */
export type HabitKind = 'check' | 'amount' | 'before' | 'under';

export interface Habit {
  id: string;
  title: string;
  emoji: string;
  cadence: Cadence;
  kind: HabitKind;
  /** Weekly habits: how many times a week counts as done. */
  timesPerWeek?: number;
  /** amount: the floor to clear. under: the ceiling not to cross. */
  target?: number;
  unit?: string;
  /** before: 24h clock time, e.g. "23:30". */
  targetTime?: string;
  note?: string;
  archived?: boolean;
  createdAt: DateKey;
}

export interface HabitLog {
  id: string;
  habitId: string;
  date: DateKey;
  /** For amount and before habits this records whether the entry met the
   *  target, so history stays correct if the target later changes. */
  met: boolean;
  amount?: number;
  time?: string;
  note?: string;
}

/** How hard the app pushes when something slips. */
export type CoachTone = 'gentle' | 'direct' | 'drill';

/* ------------------------------------------------------------------ */
/* Module 7 — Goals                                                    */
/* ------------------------------------------------------------------ */

export const GOAL_KINDS = ['Purchase', 'Recurring cost', 'Training', 'Custom'] as const;
export type GoalKind = (typeof GOAL_KINDS)[number];

export interface Goal {
  id: string;
  title: string;
  kind: GoalKind;
  /** The picture. An emoji always; a photo when one has been added. */
  emoji: string;
  image?: string;
  /** One-off price (Purchase), e.g. a used car. */
  cost?: number;
  /** Per-month price (Recurring cost), or the monthly alternative to a
   *  purchase — "$24k cash, or $400/mo". */
  monthly?: number;
  /** Anything else that belongs on the cost line: "$3k up front". */
  costNote?: string;
  /** Training: how many weeks the plan takes. */
  weeks?: number;
  /** Progress, in whatever unit the goal counts in. */
  current?: number;
  target?: number;
  unit?: string;
  /** The third line: how you actually get there. */
  plan?: string;
  module?: ModuleId;
  due?: DateKey;
  done: boolean;
  notes?: string;
  createdAt: DateKey;
}

/* ------------------------------------------------------------------ */
/* Module 8 — Notes and journal                                        */
/* ------------------------------------------------------------------ */

export const NOTE_KINDS = ['Note', 'Journal', 'List'] as const;
export type NoteKind = (typeof NOTE_KINDS)[number];

export interface Note {
  id: string;
  kind: NoteKind;
  title: string;
  body: string;
  tags: string[];
  pinned: boolean;
  /** List notes keep their items separately so they can be ticked off. */
  items?: { id: string; text: string; done: boolean }[];
  createdAt: DateKey;
  updatedAt: number;
}

/* ------------------------------------------------------------------ */
/* Module 9 — Life Coach                                               */
/* ------------------------------------------------------------------ */

export interface CheckIn {
  id: string;
  date: DateKey;
  mood: number;        // 1–5
  energy: number;      // 1–5
  wins?: string;
  blockers?: string;
  focus?: string;
}

/* ------------------------------------------------------------------ */
/* Shared                                                             */
/* ------------------------------------------------------------------ */

export const REPEATS = ['Once', 'Daily', 'Weekly', 'Monthly', 'Every N days'] as const;
export type Repeat = (typeof REPEATS)[number];

/**
 * Something to be reminded about.
 *
 * Two shapes, because they answer different questions. A dated reminder fires
 * on a date — "meeting at 6:30 on Thursday". An interval reminder fires a
 * number of days after you last did the thing — "it has been three weeks
 * since a haircut" — so it drifts with reality instead of nagging on a fixed
 * calendar you have already fallen off.
 */
export interface Reminder {
  id: string;
  title: string;
  notes?: string;
  /** Dated reminders: when it is due. */
  date?: DateKey;
  /** 24h clock, optional — an all-day reminder has none. */
  time?: string;
  repeat: Repeat;
  /** For "Every N days", and for interval reminders. */
  everyDays?: number;
  /** Interval reminders count from here rather than from a fixed date. */
  lastDone?: DateKey;
  module?: ModuleId;
  done: boolean;
  createdAt: DateKey;
}

/** Anything the app wants to tell you about, whether or not you were looking.
 *  Sources are the modules themselves — a habit going red, a project past due,
 *  a finding in the log. External sources (a saved search for a car, say) will
 *  land here too once there is a server to run them. */
export interface AppNotification {
  id: string;
  /** Stable per condition, so the same thing is never raised twice. */
  key: string;
  kind: 'insight' | 'habit' | 'due' | 'award' | 'finance' | 'deal' | 'health' | 'system';
  module?: ModuleId;
  title: string;
  body?: string;
  /** Where tapping it goes: a module id, plus an optional tab inside it. */
  to?: string;
  tab?: string;
  /** An outside link, for findings that came from off the device. */
  href?: string;
  createdAt: number;
  read: boolean;
}

/** How the Life Coach answers. Same data, different job. */
export type CoachMode = 'coach' | 'therapist' | 'straight';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  at: number;
}

export interface XpEvent {
  id: string;
  date: DateKey;
  amount: number;
  reason: string;
  module: ModuleId | 'general';
}

export interface Badge {
  id: string;
  earnedAt: DateKey;
}

/* ---------------- Module 10: Health ---------------- */

/** The numbers a doctor asks about, as opposed to the training log. */
export interface Vitals {
  id: string;
  date: DateKey;
  /** In whatever unit `health.weightUnit` says. Stored as typed, never converted. */
  weight?: number;
  restingHr?: number;
  systolic?: number;
  diastolic?: number;
  sleepHours?: number;
  notes?: string;
}

export const MEAL_SLOTS = ['Breakfast', 'Lunch', 'Dinner', 'Snack'] as const;
export type MealSlot = (typeof MEAL_SLOTS)[number];

export interface Meal {
  id: string;
  date: DateKey;
  slot: MealSlot;
  name: string;
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
}

/** One line off a lab report. The range is the one printed on *your* report —
 *  labs differ, so a built-in range is only ever a starting suggestion. */
export interface BloodMarker {
  id: string;
  name: string;
  value: number;
  unit: string;
  low?: number;
  high?: number;
}

export interface BloodPanel {
  id: string;
  date: DateKey;
  lab?: string;
  notes?: string;
  markers: BloodMarker[];
}

export interface HealthTargets {
  weight?: number;
  calories?: number;
  protein?: number;
  sleepHours?: number;
}

/* ---------------- Module 11: Dating ---------------- */

export const DATING_STATUS = ['Talking', 'Seeing', 'Ended'] as const;
export type DatingStatus = (typeof DATING_STATUS)[number];

/**
 * Someone you are seeing, and what it costs.
 *
 * Deliberately thin on identity: a first name or initials and how you met, and
 * that is all the app asks for. This is the one module holding data about
 * another person who never agreed to be in it, so it stores the least that
 * still makes the numbers work.
 */
export interface Person {
  id: string;
  /** A first name or initials. The form says so and means it. */
  label: string;
  metAt?: string;
  status: DatingStatus;
  startedAt: DateKey;
  notes?: string;
  archived?: boolean;
}

export interface Outing {
  id: string;
  personId: string;
  date: DateKey;
  what: string;
  cost: number;
  /** Optional, and off unless you set it. Drives the cost-per figure. */
  intimate?: boolean;
  notes?: string;
}

export interface Settings {
  displayName: string;
  theme: 'system' | 'light' | 'dark';
  /** Visual skin. Skins other than 'classic' carry their own fixed scheme. */
  skin: SkinId;
  /** Rotate through the skins once every 24 hours. */
  skinRotation: boolean;
  /** Play a random animation when a task is checked off. */
  completionFx: boolean;
  anthropicApiKey: string;
  aiModel: string;
  currency: string;
}

export interface AppState {
  version: number;
  settings: Settings;
  xp: XpEvent[];
  badges: Badge[];
  activeDays: DateKey[];
  work: { projects: WorkProject[] };
  planning: {
    /** Kept as the fallback target for a business that has none of its own. */
    weeklyTarget: number;
    businesses: Business[];
    outreach: Outreach[];
    deals: Deal[];
    ideas: BusinessIdea[];
  };
  spanish: {
    dailyGoalMinutes: number;
    weeklyGoalMinutes: number;
    links: StudyLink[];
    sessions: StudySession[];
    tutor: TutorConfig;
    tutorChat: ChatMessage[];
  };
  fitness: {
    targets: FitnessTargets;
    race: RaceGoal;
    activities: Activity[];
    chat: ChatMessage[];
    measurements: Measurement[];
    physique: PhysiqueGoal[];
    plan: PlanItem[];
  };
  finance: {
    budgets: Record<string, number>;
    categories: string[];
    transactions: Transaction[];
    rules: VendorRule[];
    chat: ChatMessage[];
    accounts: InvestmentAccount[];
    projection: Projection;
    savingGoals: SavingGoal[];
    /** Take-home a month. Zero means not set — every affordability check
     *  says so rather than inventing a number. */
    monthlyIncome: number;
  };
  health: {
    targets: HealthTargets;
    weightUnit: 'lb' | 'kg';
    vitals: Vitals[];
    meals: Meal[];
    panels: BloodPanel[];
  };
  dating: { people: Person[]; outings: Outing[] };
  habits: { items: Habit[]; logs: HabitLog[]; tone: CoachTone };
  notes: { items: Note[] };
  /** Week-start keys for weeks where every habit was met, and the ones
   *  already celebrated so the popup only fires once. */
  awards: { enlightened: DateKey[]; acknowledged: DateKey[] };
  goals: { items: Goal[] };
  coach: { checkIns: CheckIn[]; chat: ChatMessage[]; mode: CoachMode };
  /** Which findings have been shown or waved away, so the app does not keep
   *  raising the same one. */
  insights: { dismissed: string[]; lastPopup: DateKey | null; enabled: boolean };
  notifications: { items: AppNotification[]; deviceAlerts: boolean };
  /** Set once this device has registered with a push server. The secret is a
   *  per-device token, not an account — losing it costs you one registration. */
  push: { server: string; deviceId: string; secret: string } | null;
  reminders: { items: Reminder[] };
}

/* ------------------------------------------------------------------ */

/** Every install starts with one business so the module is usable on day one;
 *  it is renameable, and more can be added beside it. */
function primaryBusiness(): Business {
  return {
    id: 'biz_primary',
    name: 'Bryce Tax Planning',
    emoji: '🎯',
    weeklyTarget: 50,
    createdAt: '2026-01-01',
  };
}

export function emptyState(): AppState {
  return {
    version: SCHEMA_VERSION,
    settings: {
      displayName: '',
      theme: 'system',
      skin: 'classic',
      skinRotation: false,
      completionFx: true,
      anthropicApiKey: '',
      aiModel: 'claude-opus-5',
      currency: 'USD',
    },
    xp: [],
    badges: [],
    activeDays: [],
    work: { projects: [] },
    planning: { weeklyTarget: 50, businesses: [primaryBusiness()], outreach: [], deals: [], ideas: [] },
    spanish: {
      dailyGoalMinutes: 20,
      weeklyGoalMinutes: 140,
      links: [
        { id: 'italki', label: 'italki', url: 'https://www.italki.com' },
        { id: 'babbel', label: 'Babbel', url: 'https://www.babbel.com' },
      ],
      sessions: [],
      tutor: {
        level: 'Intermediate',
        topic: 'Everyday conversation',
        dialect: 'es-MX',
        speechRate: 0.95,
        autoContinue: true,
        translate: true,
      },
      tutorChat: [],
    },
    fitness: {
      targets: { mma: 3, strength: 4, total: 12 },
      race: { name: 'Half marathon', distanceKm: 21.1 },
      activities: [],
      chat: [],
      measurements: [],
      physique: [],
      plan: [],
    },
    finance: {
      budgets: {},
      categories: [...DEFAULT_CATEGORIES],
      transactions: [],
      rules: [],
      chat: [],
      accounts: [],
      projection: { years: 20, returnPct: 8, inflationPct: 3, real: false, monthlyOverride: null },
      savingGoals: [],
      monthlyIncome: 0,
    },
    health: {
      targets: { protein: 180, sleepHours: 7 },
      weightUnit: 'lb',
      vitals: [],
      meals: [],
      panels: [],
    },
    dating: { people: [], outings: [] },
    habits: { items: [], logs: [], tone: 'direct' },
    notes: { items: [] },
    awards: { enlightened: [], acknowledged: [] },
    goals: { items: [] },
    coach: { checkIns: [], chat: [], mode: 'coach' },
    insights: { dismissed: [], lastPopup: null, enabled: true },
    notifications: { items: [], deviceAlerts: false },
    push: null,
    reminders: { items: [] },
  };
}

/** Fills in anything a stored payload predates, so an older save never
 *  crashes a newer build. Runs on every load, not only on version bumps. */
export function migrate(raw: unknown): AppState {
  const base = emptyState();
  if (!raw || typeof raw !== 'object') return base;
  const s = raw as Partial<AppState>;

  return {
    ...base,
    ...s,
    version: SCHEMA_VERSION,
    settings: { ...base.settings, ...(s.settings ?? {}) },
    xp: s.xp ?? [],
    badges: s.badges ?? [],
    activeDays: s.activeDays ?? [],
    work: { ...base.work, ...(s.work ?? {}), projects: s.work?.projects ?? [] },
    planning: migratePlanning(s.planning, base.planning),
    spanish: {
      ...base.spanish,
      ...(s.spanish ?? {}),
      links: s.spanish?.links?.length ? s.spanish.links : base.spanish.links,
      sessions: s.spanish?.sessions ?? [],
      tutor: { ...base.spanish.tutor, ...(s.spanish?.tutor ?? {}) },
      tutorChat: s.spanish?.tutorChat ?? [],
    },
    fitness: {
      ...base.fitness,
      ...(s.fitness ?? {}),
      targets: { ...base.fitness.targets, ...(s.fitness?.targets ?? {}) },
      race: { ...base.fitness.race, ...(s.fitness?.race ?? {}) },
      activities: s.fitness?.activities ?? [],
      chat: s.fitness?.chat ?? [],
      measurements: s.fitness?.measurements ?? [],
      physique: s.fitness?.physique ?? [],
      plan: s.fitness?.plan ?? [],
    },
    finance: {
      ...base.finance,
      ...(s.finance ?? {}),
      budgets: s.finance?.budgets ?? {},
      categories: s.finance?.categories?.length ? s.finance.categories : base.finance.categories,
      transactions: s.finance?.transactions ?? [],
      rules: s.finance?.rules ?? [],
      chat: s.finance?.chat ?? [],
      accounts: s.finance?.accounts ?? [],
      projection: { ...base.finance.projection, ...(s.finance?.projection ?? {}) },
      savingGoals: (s.finance?.savingGoals ?? []).map((g) => ({
        ...g,
        contributions: g.contributions ?? [],
      })),
      monthlyIncome: s.finance?.monthlyIncome ?? 0,
    },
    health: {
      ...base.health,
      ...(s.health ?? {}),
      targets: { ...base.health.targets, ...(s.health?.targets ?? {}) },
      weightUnit: s.health?.weightUnit ?? base.health.weightUnit,
      vitals: s.health?.vitals ?? [],
      meals: s.health?.meals ?? [],
      panels: (s.health?.panels ?? []).map((p) => ({ ...p, markers: p.markers ?? [] })),
    },
    dating: {
      people: s.dating?.people ?? [],
      outings: s.dating?.outings ?? [],
    },
    habits: {
      ...base.habits,
      ...(s.habits ?? {}),
      items: s.habits?.items ?? [],
      logs: s.habits?.logs ?? [],
    },
    notes: { items: s.notes?.items ?? [] },
    awards: {
      enlightened: s.awards?.enlightened ?? [],
      acknowledged: s.awards?.acknowledged ?? [],
    },
    // Goals used to live inside the coach slice; lift any legacy ones out so
    // an older save keeps them.
    goals: { items: s.goals?.items ?? liftLegacyGoals(raw) },
    coach: {
      ...base.coach,
      ...(s.coach ?? {}),
      checkIns: s.coach?.checkIns ?? [],
      chat: s.coach?.chat ?? [],
      mode: s.coach?.mode ?? 'coach',
    },
    insights: {
      dismissed: s.insights?.dismissed ?? [],
      lastPopup: s.insights?.lastPopup ?? null,
      enabled: s.insights?.enabled ?? true,
    },
    notifications: {
      items: s.notifications?.items ?? [],
      deviceAlerts: s.notifications?.deviceAlerts ?? false,
    },
    reminders: { items: s.reminders?.items ?? [] },
    push: s.push ?? null,
  };
}

/**
 * Outreach and deals used to sit directly under `planning` with one shared
 * target. Anything saved that way is given a first business to belong to, so
 * nothing is stranded outside the new structure.
 */
function migratePlanning(saved: AppState['planning'] | undefined, base: AppState['planning']): AppState['planning'] {
  const outreach = saved?.outreach ?? [];
  const deals = saved?.deals ?? [];
  const businesses = saved?.businesses ?? [];

  if (businesses.length > 0) {
    return { ...base, ...(saved ?? {}), businesses, outreach, deals, ideas: saved?.ideas ?? [] };
  }

  const first: Business = { ...primaryBusiness(), weeklyTarget: saved?.weeklyTarget ?? base.weeklyTarget };

  return {
    ...base,
    ...(saved ?? {}),
    businesses: [first],
    outreach: outreach.map((o) => ({ ...o, businessId: o.businessId ?? first.id })),
    deals: deals.map((d) => ({ ...d, businessId: d.businessId ?? first.id })),
    ideas: saved?.ideas ?? [],
  };
}

/** Legacy saves kept goals under `coach.goals` with a much thinner shape. */
function liftLegacyGoals(raw: unknown): Goal[] {
  const legacy = (raw as { coach?: { goals?: unknown[] } })?.coach?.goals;
  if (!Array.isArray(legacy)) return [];
  return legacy.map((g) => {
    const old = g as { id?: string; title?: string; module?: ModuleId; target?: string; due?: DateKey; done?: boolean; createdAt?: DateKey };
    return {
      id: old.id ?? `goal_${Math.random().toString(36).slice(2, 10)}`,
      title: old.title ?? 'Goal',
      kind: 'Custom' as GoalKind,
      emoji: '🎯',
      plan: old.target,
      module: old.module,
      due: old.due,
      done: Boolean(old.done),
      createdAt: old.createdAt ?? '2026-01-01',
    };
  });
}

export const MODULES: { id: ModuleId; num: number; name: string; blurb: string; icon: string; color: string }[] = [
  { id: 'work',     num: 1, name: 'Abitos Tax Prep', blurb: 'Client projects and what has to ship',   icon: '📁', color: 'var(--mod-work)' },
  { id: 'planning', num: 2, name: 'Business',          blurb: 'Outreach, pipeline and the idea list',  icon: '🎯', color: 'var(--mod-planning)' },
  { id: 'spanish',  num: 3, name: 'Spanish',         blurb: 'italki, Babbel and time on the clock',    icon: '🇪🇸', color: 'var(--mod-spanish)' },
  { id: 'fitness',  num: 4, name: 'Fitness',         blurb: 'MMA, lifting, half marathon, AI coach',   icon: '🏃', color: 'var(--mod-fitness)' },
  { id: 'finance',  num: 5, name: 'Finances',        blurb: 'Budget, saving goals, investing',    icon: '💵', color: 'var(--mod-finance)' },
  { id: 'habits',   num: 6, name: 'Habits',          blurb: 'Daily and weekly, and what is slipping',  icon: '🔁', color: 'var(--mod-habits)' },
  { id: 'goals',    num: 7, name: 'Goals',           blurb: 'What you are actually working toward',    icon: '🏁', color: 'var(--mod-goals)' },
  // Identity colour stops at eight hues. A ninth categorical hue cannot clear
  // the separation gate, so Notes is distinguished by texture and ink instead.
  { id: 'notes',    num: 8, name: 'Notes',           blurb: 'Journal, lists and everything else',      icon: '📝', color: 'var(--mod-notes)' },
  { id: 'coach',    num: 9, name: 'Life Coach',      blurb: 'Check-ins and a thinking partner',        icon: '🧭', color: 'var(--mod-coach)' },
  // Health shares the Fitness hue on purpose: both are the body, the eight
  // categorical slots are spent, and a tile is identified by its name and
  // number, not by colour alone.
  { id: 'health',   num: 10, name: 'Health',          blurb: 'Weight, food, sleep and bloodwork',       icon: '🩺', color: 'var(--mod-health)' },
  // Shares the Life Coach hue for the same reason Health shares Fitness's: the
  // eight categorical slots are spent, and these two sit in the same corner of
  // life. The name and number tell them apart.
  { id: 'dating',   num: 11, name: 'Dating',          blurb: 'Who you are seeing and what it costs',    icon: '🌹', color: 'var(--mod-dating)' },
];
