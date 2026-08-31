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
      priority: 'normal', due: addDays(today, -3), createdAt: addDays(today, -30),
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
  const elapsedThisWeek = Math.max(0, diffDays(today, ws));
  s.planning.outreach = names.flatMap((name, i) =>
    Array.from({ length: i < 9 ? 2 : 1 }, (_, k) => ({
      id: uid('out'),
      date: addDays(ws, elapsedThisWeek === 0 ? 0 : (i + k) % (elapsedThisWeek + 1)),
      name: k === 0 ? name : `${name.split(' ')[0]}'s referral`,
      channel: channels[(i + k) % channels.length],
      outcome: outcomes[(i * 2 + k) % outcomes.length],
    })));

  s.planning.deals = [
    { id: uid('deal'), name: 'Dana Whitfield — S-corp election', stage: 'Proposal', value: 3200, nextStep: 'Send engagement letter', nextStepDate: today, createdAt: addDays(today, -9) },
    { id: uid('deal'), name: 'Riverbend Logistics — planning retainer', stage: 'Meeting set', value: 6000, nextStep: 'Discovery call', nextStepDate: addDays(today, 5), createdAt: addDays(today, -4) },
    { id: uid('deal'), name: 'Kestrel Design — entity restructure', stage: 'Won', value: 4500, createdAt: addDays(today, -25) },
  ];

  /* Ten weeks of history, with some weeks deliberately heavier than others.
     The analysis engine has to have real variation to find anything, and the
     sample should demonstrate a finding that is actually in the data rather
     than one written into the copy. Heavier training weeks here also carry
     more client work and more outreach. */
  const WEEK_QUALITY = [0.9, 0.4, 0.8, 0.35, 1.0, 0.5, 0.85, 0.45, 0.95, 0.75];
  const MMA_TYPES = ['MMA', 'Jiu-jitsu', 'Boxing'];
  const LIFT_TYPES = ['Weightlifting', 'Calisthenics'];
  const OTHER_TYPES = ['Run', 'Basketball', 'Cycling', 'Mobility'];

  const elapsed = Math.max(0, diffDays(today, ws));

  WEEK_QUALITY.forEach((quality, index) => {
    const weeksAgo = WEEK_QUALITY.length - 1 - index;
    const start = addDays(ws, -7 * weeksAgo);
    // The current week is only partly run, so only fill the days that exist.
    const lastDay = weeksAgo === 0 ? elapsed : 6;
    const sessions = Math.round(4 + quality * 8);

    for (let n = 0; n < sessions; n++) {
      const day = lastDay >= 0 ? n % (lastDay + 1) : 0;
      if (lastDay < 0) break;
      const bucket = n % 3 === 0 ? MMA_TYPES : n % 3 === 1 ? LIFT_TYPES : OTHER_TYPES;
      const type = bucket[n % bucket.length];
      const isRun = type === 'Run' || type === 'Cycling';
      const longRun = weeksAgo % 2 === 0 && n === sessions - 1;
      s.fitness.activities.push({
        id: uid('act'),
        date: addDays(start, day),
        type: longRun ? 'Long run' : type,
        minutes: longRun ? 70 + weeksAgo : 45 + ((n * 7) % 40),
        distanceKm: longRun ? 12 + quality * 6 : isRun ? 5 + quality * 4 : undefined,
        rpe: Math.min(10, 5 + Math.round(quality * 4)),
      });
    }

    // Client tasks finished. These go on the filed project so the live ones
    // keep their own short task lists.
    const archive = s.work.projects.find((p) => p.stage === 'Filed') ?? s.work.projects[0];
    const taskCount = Math.round(1 + quality * 6);
    for (let n = 0; n < taskCount && lastDay >= 0; n++) {
      archive.tasks.push({
        id: uid('t'),
        title: `Review pass ${weeksAgo}-${n}`,
        done: true,
        doneAt: addDays(start, n % (lastDay + 1)),
      });
    }

    // Outreach, in weeks before the current one (this week is seeded above).
    if (weeksAgo > 0) {
      const contacts = Math.round(14 + quality * 38);
      for (let n = 0; n < contacts; n++) {
        s.planning.outreach.push({
          id: uid('out'),
          date: addDays(start, n % 6),
          name: `${names[n % names.length]}`,
          channel: channels[n % channels.length],
          outcome: n % 9 === 0 ? 'Meeting booked' : outcomes[n % outcomes.length],
        });
      }
    }

    // Spanish, loosely tracking the same weeks.
    for (let d = 0; d <= Math.min(lastDay, 6); d++) {
      if ((d + weeksAgo) % 3 === 0) continue;
      s.spanish.sessions.push({
        id: uid('sp'),
        date: addDays(start, d),
        minutes: Math.round(10 + quality * 25),
        platform: d % 3 === 0 ? 'italki' : 'Babbel',
        kind: d % 3 === 0 ? 'Lesson' : 'Self study',
      });
    }

    // A check-in most weeks, running with the quality of the week.
    if (lastDay >= 2) {
      s.coach.checkIns.push({
        id: uid('ci'),
        date: addDays(start, 2),
        mood: Math.max(1, Math.min(5, Math.round(2 + quality * 3))),
        energy: Math.max(1, Math.min(5, Math.round(1.5 + quality * 3))),
      });
    }
  });

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
    { id: uid('hab'), title: 'Screen time',         emoji: '📱', cadence: 'daily',  kind: 'under',  target: 3, unit: 'h', createdAt: addDays(today, -30) },
    { id: uid('hab'), title: 'Call five friends',  emoji: '📱', cadence: 'weekly', kind: 'check',  timesPerWeek: 5, createdAt: addDays(today, -30) },
    { id: uid('hab'), title: 'Get some sun',       emoji: '🌞', cadence: 'weekly', kind: 'check',  timesPerWeek: 2, createdAt: addDays(today, -30) },
    { id: uid('hab'), title: 'Spar',               emoji: '🥊', cadence: 'weekly', kind: 'check',  timesPerWeek: 1, createdAt: addDays(today, -30) },
  ];

  // A fortnight of history with deliberate gaps, so green, yellow and red all
  // show up straight away rather than everything reading as failing.
  const [stretch, pray, protein, bed, screen, callFriends, sun, spar] = s.habits.items;
  for (let i = 13; i >= 0; i--) {
    const date = addDays(today, -i);
    // Pray: solid, including today — the green case.
    if (i !== 4) s.habits.logs.push({ id: uid('hl'), habitId: pray.id, date, met: true });
    // Stretch: done today but with a gap earlier in the fortnight.
    if (i === 0 || (i > 2 && i % 4 !== 0)) s.habits.logs.push({ id: uid('hl'), habitId: stretch.id, date, met: true, amount: 15 + (i % 3) * 5 });
    // Protein: missed the last two days — the red case.
    if (i > 1) s.habits.logs.push({ id: uid('hl'), habitId: protein.id, date, met: true, amount: 180 + (i % 5) * 8 });
    // Screen time: over the cap most days, which is the point of tracking it.
    if (i <= 6) {
      const hours = [4.8, 5.4, 3.1, 6.2, 4.1, 2.6, 5.0][i] ?? 4;
      s.habits.logs.push({ id: uid('hl'), habitId: screen.id, date, met: hours <= 3, amount: hours });
    }
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

  s.fitness.plan = [
    { id: uid('plan'), activity: 'Weightlifting', perWeek: 4, locked: true, createdAt: addDays(today, -60) },
    { id: uid('plan'), activity: 'MMA', perWeek: 3, locked: true, createdAt: addDays(today, -60) },
    { id: uid('plan'), activity: 'Run', perWeek: 1, locked: false, week: ws, createdAt: today },
  ];

  s.fitness.physique = [
    { id: uid('phy'), title: 'Bigger chest', area: 'Chest', site: 'Chest', target: 108, unit: 'cm', plan: 'Two pressing sessions a week, top set plus back-offs', done: false, createdAt: addDays(today, -60) },
    { id: uid('phy'), title: 'Wider back', area: 'Back', site: 'Shoulders', target: 128, unit: 'cm', plan: 'Row volume up, weighted pull-ups on the second session', done: false, createdAt: addDays(today, -60) },
    { id: uid('phy'), title: 'Straighter posture through the thoracic spine', area: 'Posture', plan: 'Daily thoracic extension and dead hangs; stop training through tight lats', done: false, createdAt: addDays(today, -30) },
  ];

  [
    ['Chest', 103.5, 104.2, 105.0, 105.4],
    ['Shoulders', 122.0, 122.8, 123.5, 124.1],
    ['Waist', 84.0, 83.4, 83.1, 82.6],
  ].forEach(([site, ...values]) => {
    values.forEach((value, i) => {
      s.fitness.measurements.push({
        id: uid('meas'),
        date: addDays(today, -63 + i * 21),
        site: site as string,
        value: value as number,
        unit: 'cm',
      });
    });
  });

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

  // A plausible XP ledger and streak so the dashboard has history.
  s.activeDays = Array.from({ length: 70 }, (_, i) => addDays(today, i - 69))
    .filter((_, i) => i % 8 !== 3);
  s.xp = s.activeDays.slice(-30).map((date, i) => ({
    id: uid('xp'), date, amount: 40 + ((i * 37) % 90), reason: 'Logged activity', module: 'general' as const,
  }));

  return s;
}
