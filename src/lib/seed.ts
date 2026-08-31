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

  s.goals.items = [
    {
      id: uid('goal'), title: 'Own a used Tesla', kind: 'Purchase', emoji: '🚗',
      cost: 24000, monthly: 400, costNote: '≈$3k down on a lease',
      current: 6500, target: 24000, unit: '$',
      plan: 'Make $400 more a month, or put every S-corp close toward it',
      module: 'finance', done: false, createdAt: addDays(today, -50),
    },
    {
      id: uid('goal'), title: 'Move into a one-bedroom', kind: 'Recurring cost', emoji: '🏙️',
      monthly: 2500, costNote: 'plus ~$5k deposit and first month',
      plan: 'Needs about $600/mo more than the current budget clears',
      module: 'finance', done: false, createdAt: addDays(today, -20),
    },
    {
      id: uid('goal'), title: 'Run a half marathon', kind: 'Training', emoji: '🏃',
      weeks: 9, current: 3, target: 9, unit: 'weeks',
      plan: 'Four runs a week, long run up 10% each week, two-week taper',
      module: 'fitness', due: addDays(today, 63), done: false, createdAt: addDays(today, -30),
    },
    {
      id: uid('goal'), title: 'Hold a 10-minute conversation in Spanish', kind: 'Custom', emoji: '🗣️',
      current: 4, target: 10, unit: 'minutes',
      plan: 'Twenty minutes a day, one italki lesson a week',
      module: 'spanish', done: false, createdAt: addDays(today, -40),
    },
  ];

  s.habits.items = [
    { id: uid('hab'), title: 'Stretch',            emoji: '🧘', cadence: 'daily',  kind: 'amount', target: 15, unit: 'min', createdAt: addDays(today, -30) },
    { id: uid('hab'), title: 'Pray',               emoji: '🙏', cadence: 'daily',  kind: 'check',  createdAt: addDays(today, -30) },
    { id: uid('hab'), title: 'Hit protein',        emoji: '🥩', cadence: 'daily',  kind: 'amount', target: 180, unit: 'g', createdAt: addDays(today, -30) },
    { id: uid('hab'), title: 'In bed by 11:30',    emoji: '😴', cadence: 'daily',  kind: 'before', targetTime: '23:30', createdAt: addDays(today, -30) },
    { id: uid('hab'), title: 'Call five friends',  emoji: '📱', cadence: 'weekly', kind: 'check',  timesPerWeek: 5, createdAt: addDays(today, -30) },
    { id: uid('hab'), title: 'Get some sun',       emoji: '🌞', cadence: 'weekly', kind: 'check',  timesPerWeek: 2, createdAt: addDays(today, -30) },
    { id: uid('hab'), title: 'Spar',               emoji: '🥊', cadence: 'weekly', kind: 'check',  timesPerWeek: 1, createdAt: addDays(today, -30) },
  ];

  // A fortnight of history with deliberate gaps, so green, yellow and red all
  // show up straight away rather than everything reading as failing.
  const [stretch, pray, protein, bed, callFriends, sun, spar] = s.habits.items;
  for (let i = 13; i >= 0; i--) {
    const date = addDays(today, -i);
    // Pray: solid, including today — the green case.
    if (i !== 4) s.habits.logs.push({ id: uid('hl'), habitId: pray.id, date, met: true });
    // Stretch: done today but with a gap earlier in the fortnight.
    if (i === 0 || (i > 2 && i % 4 !== 0)) s.habits.logs.push({ id: uid('hl'), habitId: stretch.id, date, met: true, amount: 15 + (i % 3) * 5 });
    // Protein: missed the last two days — the red case.
    if (i > 1) s.habits.logs.push({ id: uid('hl'), habitId: protein.id, date, met: true, amount: 180 + (i % 5) * 8 });
    // Bed: missed yesterday — the yellow case — and late a few times before.
    if (i !== 1) {
      const late = i > 1 && i % 5 === 0;
      s.habits.logs.push({ id: uid('hl'), habitId: bed.id, date, met: !late, time: late ? '00:40' : '23:05' });
    }
  }

  // Weekly habits need history in earlier weeks, or every one of them reads as
  // a long-running miss on day one.
  for (let w = 1; w <= 5; w++) {
    const start = addDays(ws, -7 * w);
    // Friends: hit the target in most past weeks.
    if (w !== 2) for (let k = 0; k < 5; k++) s.habits.logs.push({ id: uid('hl'), habitId: callFriends.id, date: addDays(start, k), met: true });
    // Sun: steady.
    for (let k = 0; k < 2; k++) s.habits.logs.push({ id: uid('hl'), habitId: sun.id, date: addDays(start, k * 3), met: true });
    // Sparring: missed the last two weeks — the weekly red case.
    if (w > 2) s.habits.logs.push({ id: uid('hl'), habitId: spar.id, date: addDays(start, 2), met: true });
  }
  const elapsedDays = Math.max(0, diffDays(today, ws));
  for (let k = 0; k < 3; k++) {
    s.habits.logs.push({ id: uid('hl'), habitId: callFriends.id, date: addDays(ws, Math.min(k, elapsedDays)), met: true });
  }
  s.habits.logs.push({ id: uid('hl'), habitId: sun.id, date: ws, met: true });

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
