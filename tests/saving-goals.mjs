import { chromium } from 'playwright';
const BASE = process.env.PLANE_URL ?? 'http://localhost:4173';
const problems = [];
const ok = (l) => console.log('  PASS ' + l);
const bad = (l, d) => { problems.push(`${l}: ${d}`); console.log('  FAIL ' + l + ' — ' + d); };

const browser = await chromium.launch();
async function open(seed = true, width = 1100) {
  const ctx = await browser.newContext({ viewport: { width, height: 950 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') problems.push('console: ' + m.text()); });
  await page.goto(BASE + '#/settings', { waitUntil: 'networkidle' });
  if (seed) {
    await page.getByRole('button', { name: 'Load sample data' }).click();
    await page.getByRole('button', { name: 'Load it' }).click();
    await page.waitForTimeout(600);
  }
  return { ctx, page };
}
const read = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('plane.state.v1') || '{}'));
const dismissPop = async (page) => {
  const close = page.locator('.pop button[aria-label="Close"]').first();
  if (await close.count()) await close.click().catch(() => {});
};

console.log('\n1. The Saving tab reads the real budget');
{
  const { ctx, page } = await open();
  await page.goto(BASE + '#/finance?tab=goals', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await dismissPop(page);
  const body = await page.locator('.stack').first().innerText();
  body.includes('Emergency fund') && body.includes('Tesla in cash')
    ? ok('both seeded goals show') : bad('goals missing', body.slice(0, 120));
  /take-home[\s\S]*\$9,200/i.test(body) ? ok('take-home is shown') : bad('take-home', 'not found');
  /average spend[\s\S]*\$1,\d\d\d/i.test(body)
    ? ok('average spend comes from logged transactions') : bad('average spend', 'not computed');
  await ctx.close();
}

console.log('\n2. The verdict is honest about a goal that will not make its date');
{
  const { ctx, page } = await open();
  await page.goto(BASE + '#/finance?tab=goals', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  await dismissPop(page);
  const cards = page.locator('section.card');
  const tesla = cards.filter({ hasText: 'Tesla in cash' }).first();
  const text = await tesla.innerText();
  /a month short of the date/.test(text) ? ok('it says how far short, in money') : bad('shortfall', text.slice(0, 140));
  // The projection is counted forward from *today*, so pinning it to a literal
  // month makes this suite fail on the first of whichever month tips it over —
  // which is exactly what happened, on a commit that changed no app code. What
  // the check is actually for is that the card names a landing month and that
  // the month is past the date the goal was wanted by, which is the whole point
  // of the section: the goal will not make its date.
  const landing = text.match(/gets there around ([A-Za-z]+ \d{4})/);
  const wanted = text.match(/wanted by ([A-Za-z]+ \d{1,2}, \d{4})/);
  if (!landing || !wanted) {
    bad('projection', text.slice(0, 200));
  } else if (Date.parse(landing[1]) > Date.parse(wanted[1])) {
    ok(`and when it actually lands at the current rate (${landing[1]}, past ${wanted[1]})`);
  } else {
    bad('projection', `lands ${landing[1]}, which is not after ${wanted[1]}`);
  }
  /movable categories/.test(text) ? ok('and where the money could come from') : bad('cuts', 'no cut suggestions');

  const fund = cards.filter({ hasText: 'Emergency fund' }).first();
  const ftext = await fund.innerText();
  /On pace/.test(ftext) ? ok('the funded-on-time goal reads as on pace') : bad('on pace', ftext.slice(0, 140));
  await ctx.close();
}

console.log('\n3. A deposit moves the balance and the projection');
{
  const { ctx, page } = await open();
  await page.goto(BASE + '#/finance?tab=goals', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  await dismissPop(page);
  const before = (await read(page)).finance.savingGoals.find((g) => g.name === 'Tesla in cash');
  const tesla = page.locator('section.card').filter({ hasText: 'Tesla in cash' }).first();
  await tesla.getByRole('button', { name: '+ Add to it' }).click();
  await page.getByRole('dialog').getByRole('textbox').first().fill('1200');
  await page.getByRole('button', { name: /^Add \$/ }).click();
  await page.waitForTimeout(400);
  const after = (await read(page)).finance.savingGoals.find((g) => g.name === 'Tesla in cash');
  after.contributions.length === before.contributions.length + 1
    ? ok('the deposit is stored') : bad('deposit', 'not stored');
  const sum = after.contributions.reduce((n, c) => n + c.amount, 0);
  sum === 8100 ? ok('the balance is the sum of deposits, not a second figure') : bad('balance', `sum was ${sum}`);
  const xp = (await read(page)).xp.some((x) => /Tesla in cash/.test(x.reason));
  xp ? ok('and it earns XP') : bad('xp', 'no xp entry');
  await ctx.close();
}

console.log('\n4. A preset fills in what it can from your own spending');
{
  const { ctx, page } = await open();
  await page.goto(BASE + '#/finance?tab=goals', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  await dismissPop(page);
  await page.getByRole('button', { name: '+ Another saving goal' }).click();
  const picker = page.getByRole('dialog');
  const emergency = picker.locator('button', { hasText: 'Emergency fund' }).first();
  const label = await emergency.innerText();
  /Suggests \$\d/.test(label) ? ok('the emergency-fund preset suggests an amount from real spend') : bad('suggestion', label);
  await picker.locator('button', { hasText: 'Business runway' }).first().click();
  await page.waitForTimeout(300);
  const form = page.getByRole('dialog');
  const cost = await form.locator('input').nth(2).inputValue();
  Number(cost) > 0 ? ok('and the form opens pre-filled') : bad('prefill', `cost was "${cost}"`);
  await ctx.close();
}

console.log('\n5. A new goal is saved with its opening balance');
{
  const { ctx, page } = await open();
  await page.goto(BASE + '#/finance?tab=goals', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  await dismissPop(page);
  await page.getByRole('button', { name: '+ Another saving goal' }).click();
  await page.getByRole('dialog').locator('button', { hasText: 'A trip' }).first().click();
  await page.waitForTimeout(300);
  const form = page.getByRole('dialog');
  await form.getByLabel('Name').fill('Japan');
  await form.getByLabel(/What it costs/).fill('4000');
  await form.getByLabel(/Already put aside/).fill('500');
  await form.getByLabel(/Putting in each month/).fill('250');
  await form.getByRole('button', { name: 'Save goal' }).click();
  await page.waitForTimeout(400);
  const g = (await read(page)).finance.savingGoals.find((x) => x.name === 'Japan');
  g ? ok('the goal is stored') : bad('save', 'goal not found');
  g && g.contributions.length === 1 && g.contributions[0].amount === 500
    ? ok('the opening balance became the first deposit') : bad('opening', JSON.stringify(g?.contributions));
  const card = page.locator('section.card').filter({ hasText: 'Japan' }).first();
  /13% funded/.test(await card.innerText()) ? ok('and the card shows it funded') : bad('percent', (await card.innerText()).slice(0, 120));
  await ctx.close();
}

console.log('\n6. Answers to the follow-up questions are kept');
{
  const { ctx, page } = await open();
  await page.goto(BASE + '#/finance?tab=goals', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  await dismissPop(page);
  const tesla = page.locator('section.card').filter({ hasText: 'Tesla in cash' }).first();
  await tesla.getByRole('button', { name: /questions/ }).click();
  const sheet = page.getByRole('dialog');
  await sheet.locator('textarea').first().fill('Cash. A lease is $400 I never see again.');
  await sheet.getByRole('button', { name: 'Save answers' }).click();
  await page.waitForTimeout(400);
  const g = (await read(page)).finance.savingGoals.find((x) => x.name === 'Tesla in cash');
  g.answers && g.answers.length === 1 && /never see again/.test(g.answers[0].answer)
    ? ok('the answer is stored against its question') : bad('answers', JSON.stringify(g.answers));
  const label = await page.locator('section.card').filter({ hasText: 'Tesla in cash' }).first().innerText();
  /Answer the questions \(2\)/.test(label) ? ok('and the count drops to the ones still open') : bad('count', label.match(/Answer[^\n]*/)?.[0]);
  await ctx.close();
}

console.log('\n7. Without a take-home figure it says so rather than guessing');
{
  const { ctx, page } = await open();
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('plane.state.v1'));
    s.finance.monthlyIncome = 0;
    localStorage.setItem('plane.state.v1', JSON.stringify(s));
  });
  await page.goto(BASE + '#/finance?tab=goals', { waitUntil: 'networkidle' });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await dismissPop(page);
  const body = await page.locator('.stack').first().innerText();
  /not set yet/.test(body) ? ok('the take-home tile says it is not set') : bad('income tile', body.slice(0, 160));
  /add take-home to see this/.test(body) ? ok('and the free-after-goals figure is not invented') : bad('free tile', 'invented a number');
  await ctx.close();
}

console.log('\n8. An older save with no saving goals still loads');
{
  const { ctx, page } = await open(false);
  await page.evaluate(() => {
    localStorage.setItem('plane.state.v1', JSON.stringify({
      version: 1,
      finance: { budgets: { Groceries: 400 }, transactions: [], categories: ['Groceries'], rules: [] },
    }));
  });
  await page.goto(BASE + '#/finance?tab=goals', { waitUntil: 'networkidle' });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  const st = await read(page);
  Array.isArray(st.finance.savingGoals) ? ok('savingGoals is filled in by the migration') : bad('migrate', 'missing');
  st.finance.monthlyIncome === 0 ? ok('and income defaults to unset') : bad('income', String(st.finance.monthlyIncome));
  const body = await page.locator('.stack').first().innerText();
  /No saving goals yet/.test(body) ? ok('and the empty state renders') : bad('empty', body.slice(0, 140));
  await ctx.close();
}

console.log('\n9. A behind goal reaches the notification list');
{
  const { ctx, page } = await open();
  // Notifications are merged when the app loads its state, so this needs a
  // reload after the sample data landed.
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  const st = await read(page);
  const hit = (st.notifications?.items ?? []).some((n) => /Tesla in cash is behind/.test(n.title));
  hit ? ok('the behind goal is raised once') : bad('notification', 'not raised');
  const dupes = (st.notifications?.items ?? []).filter((n) => /Tesla in cash is behind/.test(n.title)).length;
  dupes <= 1 ? ok('and only once') : bad('duplicates', `${dupes} copies`);
  await ctx.close();
}

await browser.close();
console.log(problems.length ? `\n${problems.length} PROBLEM(S):\n` + problems.join('\n') : '\nAll checks passed.');
process.exit(problems.length ? 1 : 0);
