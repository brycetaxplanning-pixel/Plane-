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

  s.planning.ideas = [
    {
      id: uid('idea'), title: 'Clips channel for finance YouTubers', stage: 'Spark', effort: 'Easy start',
      summary: 'Cut long-form financial analysis into clips the creators never post themselves',
      detail: 'The good financial-analysis channels publish 40-minute videos and never cut them down. Nobody is serving the clip audience for them. Sit in the middle: cut the clips, post them, split revenue or negotiate a licence. Start with three channels, confirm the rights position before anything else.',
      nextStep: 'Pick three channels and check what their terms allow',
      createdAt: addDays(today, -12),
    },
    {
      id: uid('idea'), title: 'International tax prep and planning', stage: 'Building', effort: 'Real project',
      summary: 'Expat and cross-border returns — already taking whatever work comes in',
      detail: 'Currently reactive: whoever finds me, I take. Worth deciding on one niche (US citizens abroad, or inbound founders) and building around it.',
      nextStep: 'Pick one niche and write the offer',
      createdAt: addDays(today, -40),
    },
    {
      id: uid('idea'), title: '401(k) rollover into personal custody', stage: 'Spark', effort: 'Heavy lift',
      summary: 'Move retirement money out of the big custodians and into the individual\u2019s own control',
      detail: 'The complicated one. The idea is helping people roll a 401(k) out of Fidelity and the other large custodians into an arrangement they actually control. Needs the custody, compliance and licensing questions answered before it is anything more than a thought. Writing the detail down so the reasoning survives until I come back to it.',
      createdAt: addDays(today, -8),
    },
  ];

  s.notes.items = [
    {
      id: uid('note'), kind: 'List', title: 'To do', tags: ['admin'], pinned: true,
      body: '', createdAt: addDays(today, -3), updatedAt: Date.now(),
      items: [
        { id: uid('it'), text: 'Make an Instagram for the flaxseed gel', done: false },
        { id: uid('it'), text: 'Chase Marisol for the Schwab 1099-B', done: true },
        { id: uid('it'), text: 'Book a sparring session', done: false },
      ],
    },
    {
      id: uid('note'), kind: 'List', title: 'Content ideas', tags: ['tax', 'content'], pinned: false,
      body: '', createdAt: addDays(today, -6), updatedAt: Date.now() - 86400000,
      items: [
        { id: uid('it'), text: 'S-corp election explained in 60 seconds', done: false },
        { id: uid('it'), text: 'What "reasonable salary" actually means', done: false },
        { id: uid('it'), text: 'Three write-offs people always miss', done: false },
      ],
    },
    {
      id: uid('note'), kind: 'Journal', title: 'Long week', tags: [], pinned: false,
      body: 'Busy week on the Halvorsen file. Training felt heavy — legs still cooked from Tuesday sparring and I have not been getting to bed on time. Need to front-load outreach on Monday instead of leaving it to Thursday again.',
      createdAt: addDays(today, -2), updatedAt: Date.now() - 172800000,
    },
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
