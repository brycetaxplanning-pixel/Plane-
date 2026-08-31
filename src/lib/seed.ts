import { emptyState, type AppState } from './schema';
import { addDays, diffDays, todayKey, weekStart } from './date';
import { uid } from './id';
import { SEED_RULES, autoCategorize } from './finance';

/** A realistic week or two of history, so every chart and quota has something
 *  to draw before the user has logged anything themselves. Explicitly opt-in
 *  from Settings — a fresh install starts empty. */
export function sampleState(): AppState {
  const s = emptyState();
  const today = todayKey();
  const ws = weekStart();
  const rules = SEED_RULES.map((r) => ({ ...r, id: uid('rule') }));

  s.settings.displayName = 'Bryce';
  s.finance.rules = rules;

  s.work.projects = [
    {
      id: uid('prj'), client: 'Halvorsen Dental PC', service: '1120-S', stage: 'In progress',
      priority: 'high', due: addDays(today, 4), createdAt: addDays(today, -20),
      notes: 'Owner comp study still open.',
      tasks: [
        { id: uid('t'), title: 'Reconcile December bank feed', done: true, doneAt: addDays(today, -3) },
        { id: uid('t'), title: 'Confirm reasonable compensation', done: false },
        { id: uid('t'), title: 'Draft K-1s', done: false },
      ],
    },
    {
      id: uid('prj'), client: 'Marisol Ortega', service: '1040', stage: 'Waiting on client',
      priority: 'normal', due: addDays(today, -2), createdAt: addDays(today, -30),
      notes: 'Needs 1099-B from Schwab.',
      tasks: [{ id: uid('t'), title: 'Chase brokerage statements', done: false }],
    },
    {
      id: uid('prj'), client: 'Riverbend Logistics LLC', service: '1065', stage: 'In review',
      priority: 'normal', due: addDays(today, 9), createdAt: addDays(today, -14),
      tasks: [
        { id: uid('t'), title: 'Tie out partner capital', done: true, doneAt: addDays(today, -1) },
        { id: uid('t'), title: 'Partner review', done: false },
      ],
    },
    {
      id: uid('prj'), client: 'Kestrel Design Co', service: 'Bookkeeping', stage: 'Filed',
      priority: 'low', createdAt: addDays(today, -45), completedAt: addDays(today, -6),
      tasks: [{ id: uid('t'), title: 'Q4 close', done: true, doneAt: addDays(today, -6) }],
    },
  ];

  const names = ['Dana Whitfield', 'Ibrahim Sallam', 'Cole Prentice', 'Yuki Tanaka', 'Rosa Delgado',
    'Marcus Bell', 'Nina Petrova', 'Owen Hargrove', 'Priya Raman', 'Trent Kowalski',
    'Sofia Marchetti', 'Andre Dubois', 'Hana Suzuki', 'Liam O’Rourke', 'Grace Adeyemi'];
  const channels = ['Call', 'Email', 'LinkedIn', 'Text', 'Referral'] as const;
  const outcomes = ['No answer', 'Conversation', 'Meeting booked', 'Not a fit'] as const;

  // Only fill days that have actually happened — a demo should never show
  // outreach logged on a future date.
  const elapsed = Math.max(0, diffDays(today, ws));
  s.planning.outreach = names.flatMap((name, i) =>
    Array.from({ length: i < 9 ? 2 : 1 }, (_, k) => ({
      id: uid('out'),
      date: addDays(ws, elapsed === 0 ? 0 : (i + k) % (elapsed + 1)),
      name: k === 0 ? name : `${name.split(' ')[0]}'s referral`,
      channel: channels[(i + k) % channels.length],
      outcome: outcomes[(i * 2 + k) % outcomes.length],
    })));

  s.planning.deals = [
    { id: uid('deal'), name: 'Dana Whitfield — S-corp election', stage: 'Proposal', value: 3200, nextStep: 'Send engagement letter', nextStepDate: addDays(today, 2), createdAt: addDays(today, -9) },
    { id: uid('deal'), name: 'Riverbend Logistics — planning retainer', stage: 'Meeting set', value: 6000, nextStep: 'Discovery call', nextStepDate: addDays(today, 5), createdAt: addDays(today, -4) },
    { id: uid('deal'), name: 'Kestrel Design — entity restructure', stage: 'Won', value: 4500, createdAt: addDays(today, -25) },
  ];

  s.spanish.sessions = [12, 0, 25, 30, 20, 0, 45, 20, 15, 0, 30, 25, 20, 20]
    .map((minutes, i) => ({ minutes, i }))
    .filter((x) => x.minutes > 0)
    .map((x) => ({
      id: uid('sp'),
      date: addDays(today, x.i - 13),
      minutes: x.minutes,
      platform: x.i % 3 === 0 ? 'italki' : 'Babbel',
      kind: x.i % 3 === 0 ? ('Lesson' as const) : ('Self study' as const),
    }));

  const plan: [number, string, number, number | undefined][] = [
    [-13, 'MMA', 90, undefined], [-12, 'Weightlifting', 55, undefined], [-11, 'Run', 40, 6.5],
    [-10, 'MMA', 90, undefined], [-9, 'Calisthenics', 45, undefined], [-8, 'Long run', 75, 14],
    [-7, 'Basketball', 60, undefined],
    [-6, 'MMA', 90, undefined], [-5, 'Weightlifting', 60, undefined], [-4, 'Run', 35, 5.5],
    [-3, 'MMA', 90, undefined], [-2, 'Calisthenics', 40, undefined], [-1, 'Run', 50, 8.2],
    [0, 'Weightlifting', 55, undefined],
  ];
  s.fitness.activities = plan.map(([offset, type, minutes, km]) => ({
    id: uid('act'),
    date: addDays(today, offset),
    type,
    minutes,
    distanceKm: km,
    rpe: km && km > 10 ? 8 : 6,
  }));
  s.fitness.race = { name: 'Half marathon', date: addDays(today, 63), distanceKm: 21.1, targetTime: '1:55:00' };

  s.finance.budgets = {
    Groceries: 600, Meat: 200, Restaurants: 350, Entertainment: 150, Shopping: 250,
    Transport: 180, Housing: 2400, Utilities: 220, Fitness: 210, Education: 90, Subscriptions: 60,
  };

  const charges: [number, string, number][] = [
    [-1, 'AMAZON MKTPL*RT4YZ', 110], [-2, 'WHOLE FOODS MKT 342', 96.4], [-3, 'BUTCHERBOX', 142],
    [-4, 'ITALKI.COM', 60], [-5, 'SHELL OIL 574', 52.1], [-6, 'DOORDASH*THAI HOUSE', 38.75],
    [-7, 'NETFLIX.COM', 15.49], [-8, 'TRADER JOES #118', 71.2], [-9, 'AMC THEATRES', 34],
    [-10, 'GRACIE JIU JITSU ACADEMY', 185], [-11, 'TARGET T-2287', 88.3], [-12, 'COMCAST CABLE', 89.99],
    [-13, 'SPOTIFY USA', 11.99], [-14, 'VENMO PAYMENT', 65], [-15, 'CHIPOTLE 2210', 19.4],
    [-16, 'WHOLE FOODS MKT 342', 54.8], [-18, 'UBER EATS', 27.3], [-20, 'COSTCO WHSE #443', 231.6],
  ];
  s.finance.transactions = charges.map(([offset, vendor, amount]) => {
    const auto = autoCategorize({ vendor }, rules);
    return {
      id: uid('tx'), date: addDays(today, offset), vendor, amount,
      category: auto.category, reviewed: auto.reviewed, source: 'import' as const,
    };
  });

  s.finance.accounts = [
    { id: uid('acct'), name: 'Stock Account', type: 'Brokerage', balance: 80000, monthly: 1000, updatedAt: today },
    { id: uid('acct'), name: 'Roth IRA', type: 'Roth IRA', balance: 24500, monthly: 583, updatedAt: today },
  ];

  s.coach.goals = [
    { id: uid('goal'), title: 'Finish the half marathon under 1:55', module: 'fitness', target: 'Race day finish time', due: addDays(today, 63), done: false, createdAt: addDays(today, -30) },
    { id: uid('goal'), title: 'Sign 20 S-corp planning clients', module: 'planning', target: '20 signed engagements', done: false, createdAt: addDays(today, -60) },
    { id: uid('goal'), title: 'Hold a 10-minute conversation in Spanish', module: 'spanish', target: 'Unscripted, with a tutor', done: false, createdAt: addDays(today, -40) },
  ];
  s.coach.checkIns = [4, 3, 5, 4, 3, 4, 4].map((mood, i) => ({
    id: uid('ci'),
    date: addDays(today, i - 6),
    mood,
    energy: Math.max(1, Math.min(5, mood - (i % 2))),
  }));

  // A plausible XP ledger and streak so the dashboard has history.
  s.activeDays = Array.from({ length: 14 }, (_, i) => addDays(today, i - 13));
  s.xp = s.activeDays.map((date, i) => ({
    id: uid('xp'), date, amount: 40 + ((i * 37) % 90), reason: 'Logged activity', module: 'general' as const,
  }));

  return s;
}
