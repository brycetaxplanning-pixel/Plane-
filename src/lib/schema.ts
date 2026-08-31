import type { DateKey } from './date';
import type { SkinId } from './themes';

export const SCHEMA_VERSION = 1;

export type ModuleId = 'work' | 'planning' | 'spanish' | 'fitness' | 'finance' | 'coach';

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

export interface Outreach {
  id: string;
  date: DateKey;
  name: string;
  channel: Channel;
  outcome: Outcome;
  notes?: string;
}

export const DEAL_STAGES = ['Lead', 'Contacted', 'Meeting set', 'Proposal', 'Won', 'Lost'] as const;
export type DealStage = (typeof DEAL_STAGES)[number];

export interface Deal {
  id: string;
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

export interface TutorConfig {
  level: TutorLevel;
  topic: string;
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

export interface RaceGoal {
  name: string;
  date?: DateKey;
  distanceKm: number;
  targetTime?: string;
}

export interface FitnessTargets {
  mma: number;
  strength: number;
  total: number;
}

/* ------------------------------------------------------------------ */
/* Module 5 — Finances                                                 */
/* ------------------------------------------------------------------ */

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
/* Module 6 — Life Coach                                               */
/* ------------------------------------------------------------------ */

export interface Goal {
  id: string;
  title: string;
  module?: ModuleId;
  target?: string;
  due?: DateKey;
  done: boolean;
  createdAt: DateKey;
}

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
  planning: { weeklyTarget: number; outreach: Outreach[]; deals: Deal[] };
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
  };
  finance: {
    budgets: Record<string, number>;
    categories: string[];
    transactions: Transaction[];
    rules: VendorRule[];
    chat: ChatMessage[];
    accounts: InvestmentAccount[];
    projection: Projection;
  };
  coach: { goals: Goal[]; checkIns: CheckIn[]; chat: ChatMessage[] };
}

/* ------------------------------------------------------------------ */

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
    planning: { weeklyTarget: 50, outreach: [], deals: [] },
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
    },
    finance: {
      budgets: {},
      categories: [...DEFAULT_CATEGORIES],
      transactions: [],
      rules: [],
      chat: [],
      accounts: [],
      projection: { years: 20, returnPct: 8, inflationPct: 3, real: false, monthlyOverride: null },
    },
    coach: { goals: [], checkIns: [], chat: [] },
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
    planning: { ...base.planning, ...(s.planning ?? {}), outreach: s.planning?.outreach ?? [], deals: s.planning?.deals ?? [] },
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
    },
    coach: {
      ...base.coach,
      ...(s.coach ?? {}),
      goals: s.coach?.goals ?? [],
      checkIns: s.coach?.checkIns ?? [],
      chat: s.coach?.chat ?? [],
    },
  };
}

export const MODULES: { id: ModuleId; num: number; name: string; blurb: string; icon: string; color: string }[] = [
  { id: 'work',     num: 1, name: 'Abitos Tax Prep', blurb: 'Client projects and what has to ship',   icon: '📁', color: 'var(--mod-work)' },
  { id: 'planning', num: 2, name: 'Bryce Tax Planning', blurb: 'S-corp outreach and pipeline',        icon: '🎯', color: 'var(--mod-planning)' },
  { id: 'spanish',  num: 3, name: 'Spanish',         blurb: 'italki, Babbel and time on the clock',    icon: '🇪🇸', color: 'var(--mod-spanish)' },
  { id: 'fitness',  num: 4, name: 'Fitness',         blurb: 'MMA, lifting, half marathon, AI coach',   icon: '🏃', color: 'var(--mod-fitness)' },
  { id: 'finance',  num: 5, name: 'Finances',        blurb: 'Budget, spend by category, transactions', icon: '💵', color: 'var(--mod-finance)' },
  { id: 'coach',    num: 6, name: 'Life Coach',      blurb: 'Goals, check-ins and a thinking partner', icon: '🧭', color: 'var(--mod-coach)' },
];
