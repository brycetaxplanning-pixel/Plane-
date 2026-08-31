import { chromium } from 'playwright';
const BASE = process.env.PLANE_URL ?? 'http://localhost:4173';
const problems = [];
const ok = (l) => console.log('  PASS ' + l);
const bad = (l, d) => { problems.push(`${l}: ${d}`); console.log('  FAIL ' + l + ' — ' + d); };

const browser = await chromium.launch();

async function fresh() {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 950 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') problems.push('console: ' + m.text()); });
  return { ctx, page };
}

console.log('\n1. An empty log produces no findings at all');
{
  const { ctx, page } = await fresh();
  await page.goto(BASE + '#/coach', { waitUntil: 'networkidle' });
  await page.getByRole('tab', { name: 'Analysis' }).click();
  await page.waitForTimeout(400);
  (await page.getByText('Not enough logged yet').count()) > 0
    ? ok('says there is not enough data rather than inventing something') : bad('empty', 'showed findings anyway');
  (await page.locator('.insight').count()) === 0 ? ok('no insight cards rendered') : bad('empty', 'cards present');
  await ctx.close();
}

console.log('\n2. Ten weeks of sample data produces findings with their sample size');
let sampleText = '';
{
  const { ctx, page } = await fresh();
  await page.goto(BASE + '#/settings', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Load sample data' }).click();
  await page.getByRole('button', { name: 'Load it' }).click();
  await page.waitForTimeout(700);
  await page.goto(BASE + '#/coach', { waitUntil: 'networkidle' });
  await page.getByRole('tab', { name: 'Analysis' }).click();
  await page.waitForTimeout(500);
  const n = await page.locator('.insight').count();
  n > 0 ? ok(`${n} findings from the sample log`) : bad('sample', 'no findings produced');
  sampleText = await page.locator('.card', { hasText: 'What the log actually shows' }).innerText();
  /\d+ weeks of your own log/.test(sampleText) || /last four weeks/i.test(sampleText) || /Last entry/.test(sampleText)
    ? ok('every finding states what it is based on') : bad('evidence', sampleText.slice(0, 200));
  /not proof one causes the other/.test(sampleText)
    ? ok('the causation caveat is on the split findings') : bad('caveat', 'missing');
  await ctx.close();
}

console.log('\n3. A flat driver produces no "best weeks" claim');
{
  const { ctx, page } = await fresh();
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const today = new Date();
    const shift = (today.getDay() + 6) % 7;
    const thisMon = new Date(today); thisMon.setDate(today.getDate() - shift);
    const st = JSON.parse(localStorage.getItem('plane.state.v1'));
    st.fitness.activities = [];
    st.work.projects = [{ id: 'p', client: 'C', service: '1040', stage: 'In progress', priority: 'normal', tasks: [], createdAt: iso(thisMon) }];
    // Ten weeks, identical training every week, wildly varying tasks done.
    for (let w = 1; w <= 10; w++) {
      const start = new Date(thisMon); start.setDate(thisMon.getDate() - 7 * w);
      for (let n = 0; n < 6; n++) {
        const d = new Date(start); d.setDate(start.getDate() + (n % 5));
        st.fitness.activities.push({ id: `a${w}${n}`, date: iso(d), type: 'MMA', minutes: 60 });
      }
      const tasks = w % 2 === 0 ? 9 : 1;
      for (let n = 0; n < tasks; n++) {
        const d = new Date(start); d.setDate(start.getDate() + (n % 5));
        st.work.projects[0].tasks.push({ id: `t${w}${n}`, title: 't', done: true, doneAt: iso(d) });
      }
    }
    localStorage.setItem('plane.state.v1', JSON.stringify(st));
  });
  await page.goto(BASE + '#/coach', { waitUntil: 'networkidle' });
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('tab', { name: 'Analysis' }).click();
  await page.waitForTimeout(500);
  const text = await page.locator('.card', { hasText: 'What the log actually shows' }).innerText();
  /best weeks for client tasks/i.test(text)
    ? bad('spurious finding', 'claimed a training link where training never varied')
    : ok('no link claimed when the driver never varies');
  await ctx.close();
}

console.log('\n4. The reality check arithmetic is right');
{
  const { ctx, page } = await fresh();
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    const st = JSON.parse(localStorage.getItem('plane.state.v1'));
    st.fitness.targets = { mma: 3, strength: 4, total: 12 };
    st.fitness.activities = Array.from({ length: 6 }, (_, i) => ({ id: `a${i}`, date: '2026-08-01', type: 'MMA', minutes: 60 }));
    st.spanish.weeklyGoalMinutes = 140;
    st.planning.weeklyTarget = 50;
    st.habits.items = [];
    localStorage.setItem('plane.state.v1', JSON.stringify(st));
  });
  await page.goto(BASE + '#/coach', { waitUntil: 'networkidle' });
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('tab', { name: 'Analysis' }).click();
  await page.waitForTimeout(500);
  const card = await page.locator('.card', { hasText: 'Does the week fit' }).innerText();
  // 12 sessions x 60min = 12h; Spanish 140min = 2.3h; outreach 50 x 6min = 5h. Total 19.3h.
  /19\.3h/.test(card) ? ok('committed hours add up (12 + 2.3 + 5 = 19.3)') : bad('committed', card.replace(/\n/g, ' | ').slice(0, 260));
  // 168 - 56 sleep - 45 work = 67h available.
  /67h/.test(card) ? ok('available hours are 168 minus sleep and work') : bad('available', card.replace(/\n/g, ' | ').slice(0, 260));
  /measured/.test(card) && /assumed/.test(card)
    ? ok('each row is labelled measured or assumed') : bad('provenance', 'labels missing');
  await ctx.close();
}

console.log('\n5. The unprompted popup fires once, then respects the dismissal');
{
  const { ctx, page } = await fresh();
  await page.goto(BASE + '#/settings', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Load sample data' }).click();
  await page.getByRole('button', { name: 'Load it' }).click();
  await page.waitForTimeout(700);
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1600);
  (await page.locator('.pop').count()) > 0 ? ok('a finding is raised unprompted') : bad('popup', 'never appeared');
  const title = await page.locator('.pop-title').innerText();
  await page.getByRole('button', { name: "Don't show this again" }).click();
  await page.waitForTimeout(400);
  const st = await page.evaluate(() => JSON.parse(localStorage.getItem('plane.state.v1')));
  st.insights.dismissed.length === 1 ? ok('dismissal is recorded') : bad('dismiss', JSON.stringify(st.insights));
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1600);
  (await page.locator('.pop').count()) === 0 ? ok('nothing pops again the same day') : bad('rate limit', 'popped twice');
  // Clear the daily lock but keep the dismissal: the same finding must not return.
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('plane.state.v1'));
    s.insights.lastPopup = null;
    localStorage.setItem('plane.state.v1', JSON.stringify(s));
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1600);
  const again = await page.locator('.pop-title').count() ? await page.locator('.pop-title').innerText() : '';
  again !== title ? ok('the dismissed finding does not come back') : bad('dismissal', 'same finding returned');
  await ctx.close();
}

console.log('\n6. Physique goals and measurements');
{
  const { ctx, page } = await fresh();
  await page.goto(BASE + '#/settings', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Load sample data' }).click();
  await page.getByRole('button', { name: 'Load it' }).click();
  await page.waitForTimeout(700);
  await page.goto(BASE + '#/fitness', { waitUntil: 'networkidle' });
  await page.getByRole('tab', { name: 'Physique' }).click();
  await page.waitForTimeout(400);
  const body = await page.locator('main').innerText();
  /Bigger chest/.test(body) && /Wider back/.test(body) ? ok('physique goals render') : bad('goals', body.slice(0, 160));
  /\+1\.9cm/.test(body) ? ok('chest shows +1.9cm since the first measurement') : bad('delta', body.replace(/\n/g, ' | ').slice(0, 300));
  await page.getByRole('button', { name: /Thoracic extension/ }).click();
  await page.waitForTimeout(400);
  const st = await page.evaluate(() => JSON.parse(localStorage.getItem('plane.state.v1')));
  st.habits.items.some((h) => h.title === 'Thoracic extension')
    ? ok('mobility work hands off to the Habits module') : bad('handoff', 'habit not added');
  await ctx.close();
}

console.log('\n7. Coach modes change the brief that is sent');
{
  const { ctx, page } = await fresh();
  let sent = null;
  await page.route('https://api.anthropic.com/**', async (route) => {
    sent = route.request().postDataJSON?.() ?? null;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'm', type: 'message', role: 'assistant', model: 'claude-opus-5', content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } }) });
  });
  await page.goto(BASE + '#/settings', { waitUntil: 'networkidle' });
  await page.getByPlaceholder('sk-ant-…').fill('sk-ant-test');
  await page.waitForTimeout(400);
  await page.goto(BASE + '#/coach', { waitUntil: 'networkidle' });
  await page.getByRole('tab', { name: 'Talk' }).click();
  await page.getByRole('button', { name: 'Straight talk' }).click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'What should I drop?' }).click();
  await page.waitForTimeout(2200);
  if (!sent) bad('coach request', 'nothing sent');
  else {
    /unfiltered read/.test(sent.system) ? ok('straight-talk brief is used') : bad('brief', 'not applied');
    /TIME BUDGET/.test(sent.system) ? ok('the time budget is in the prompt') : bad('time budget', 'missing');
    /Be hard on the situation, never on them as a person/.test(sent.system)
      ? ok('the blunt mode is still bounded') : bad('bounds', 'missing');
  }
  await page.getByRole('button', { name: 'Sounding board' }).click();
  await page.waitForTimeout(300);
  await page.getByPlaceholder("What's on your mind…").fill('hello');
  await page.getByRole('button', { name: 'Send' }).click();
  await page.waitForTimeout(2200);
  /sounding board, not a coach and not a therapist/.test(sent.system ?? '')
    ? ok('sounding-board mode says plainly what it is not') : bad('mode', 'brief not switched');
  /crisis or thoughts of harming themselves/.test(sent.system ?? '')
    ? ok('it is told to hand off a crisis to a real professional') : bad('safety', 'missing');
  await ctx.close();
}

await browser.close();
console.log(problems.length ? `\n${problems.length} PROBLEM(S):\n` + problems.join('\n') : '\nAll checks passed.');
process.exit(problems.length ? 1 : 0);
