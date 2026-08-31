import { chromium } from 'playwright';
const BASE = process.env.PLANE_URL ?? 'http://localhost:4173';
const problems = [];
const ok = (l) => console.log('  PASS ' + l);
const bad = (l, d) => { problems.push(`${l}: ${d}`); console.log('  FAIL ' + l + ' — ' + d); };

const browser = await chromium.launch();
async function seeded(width = 1100) {
  const ctx = await browser.newContext({ viewport: { width, height: 950 }, acceptDownloads: true });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') problems.push('console: ' + m.text()); });
  await page.goto(BASE + '#/settings', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Load sample data' }).click();
  await page.getByRole('button', { name: 'Load it' }).click();
  await page.waitForTimeout(700);
  return { ctx, page };
}
const read = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('plane.state.v1') || '{}'));

console.log('\n1. The timeline pulls dates from every module');
{
  const { ctx, page } = await seeded();
  await page.goto(BASE + '#/tracker', { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  const body = await page.locator('main').innerText();
  /Marisol Ortega/.test(body) ? ok('a client project appears') : bad('project', 'missing');
  /Dana Whitfield/.test(body) ? ok('a deal next step appears') : bad('deal', 'missing');
  /Client call with Halvorsen/.test(body) ? ok('a reminder appears') : bad('reminder', 'missing');
  (await page.locator('.tl-day').count()) === 7 ? ok('the week view shows all seven days, empty ones included') : bad('week', `${await page.locator('.tl-day').count()} days`);
  (await page.locator('.tl-day.is-today').count()) === 1 ? ok('today is marked') : bad('today', 'not marked');
  // A toggle button, not a tab: both choices show the same region over a
  // different span.
  await page.getByRole('button', { name: 'Next 5 weeks' }).click();
  await page.waitForTimeout(400);
  (await page.locator('.tl-day').count()) === 35 ? ok('the longer view shows 35 days') : bad('month', `${await page.locator('.tl-day').count()} days`);
  await ctx.close();
}

console.log('\n2. Overdue is separated from upcoming');
{
  const { ctx, page } = await seeded();
  await page.goto(BASE + '#/tracker', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  const late = page.locator('.card', { hasText: 'Already past' });
  (await late.count()) > 0 ? ok('a past-due section exists') : bad('overdue', 'missing');
  /Marisol Ortega/.test(await late.innerText()) ? ok('the 3-days-late project is in it') : bad('overdue item', await late.innerText());
  await ctx.close();
}

console.log('\n3. Interval reminders count from the last time, not a fixed date');
{
  const { ctx, page } = await seeded();
  await page.goto(BASE + '#/tracker?tab=reminders', { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  const haircut = page.locator('.rowitem', { hasText: 'Get a haircut' });
  const text = await haircut.innerText();
  /27 days since the last one/.test(text) ? ok('it reports days since the last one') : bad('interval label', text.replace(/\n/g, ' | '));
  /due every 21/.test(text) ? ok('and the interval it is meant to run on') : bad('interval', text.replace(/\n/g, ' | '));

  await haircut.getByRole('button', { name: 'Done' }).click();
  await page.waitForTimeout(500);
  const st = await read(page);
  const r = st.reminders.items.find((x) => x.title === 'Get a haircut');
  const today = await page.evaluate(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; });
  r.lastDone === today && r.done === false
    ? ok('marking it done resets the clock instead of deleting it') : bad('reset', JSON.stringify(r));
  await page.waitForTimeout(300);
  const after = await page.locator('.rowitem', { hasText: 'Get a haircut' }).innerText();
  /next in 21/.test(after) ? ok('and it schedules the next one 21 days out') : bad('reschedule', after.replace(/\n/g, ' | '));
  await ctx.close();
}

console.log('\n4. A one-off completes and leaves the list');
{
  const { ctx, page } = await seeded();
  await page.goto(BASE + '#/tracker?tab=reminders', { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  await page.locator('.rowitem', { hasText: 'Client call with Halvorsen' }).getByRole('button', { name: 'Done' }).click();
  await page.waitForTimeout(500);
  const st = await read(page);
  st.reminders.items.find((x) => x.title.startsWith('Client call')).done === true
    ? ok('a one-off is marked done') : bad('once', 'not completed');
  (await page.locator('.rowitem', { hasText: 'Client call with Halvorsen' }).count()) === 0
    ? ok('and disappears from the list') : bad('once', 'still listed');
  await ctx.close();
}

console.log('\n5. Calendar export produces a valid .ics');
{
  const { ctx, page } = await seeded();
  await page.goto(BASE + '#/tracker?tab=reminders', { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Add to calendar' }).click();
  const file = await dl;
  const text = await (await import('node:fs/promises')).readFile(await file.path(), 'utf8');
  /^BEGIN:VCALENDAR/.test(text) && /END:VCALENDAR\s*$/.test(text) ? ok('the file is a well-formed calendar') : bad('ics', text.slice(0, 120));
  (text.match(/BEGIN:VEVENT/g) ?? []).length === 4 ? ok('one event per open reminder') : bad('events', `${(text.match(/BEGIN:VEVENT/g) ?? []).length}`);
  /RRULE:FREQ=DAILY;INTERVAL=21/.test(text) ? ok('the 21-day interval becomes a repeat rule') : bad('rrule', 'interval rule missing');
  /RRULE:FREQ=MONTHLY/.test(text) ? ok('a monthly reminder becomes a monthly rule') : bad('rrule', 'monthly rule missing');
  /DTSTART:\d{8}T183000/.test(text) ? ok('a timed reminder carries its time') : bad('dtstart', 'time missing');
  /DTSTART;VALUE=DATE:\d{8}/.test(text) ? ok('an all-day reminder has no time') : bad('all day', 'missing');
  /SUMMARY:Get a haircut/.test(text) ? ok('titles are carried through') : bad('summary', 'missing');
  await ctx.close();
}

console.log('\n6. Spoken reminders are parsed into structure');
{
  const { ctx, page } = await seeded();
  let sent = null;
  await page.route('https://api.anthropic.com/**', async (route) => {
    sent = route.request().postDataJSON?.() ?? null;
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ id: 'm', type: 'message', role: 'assistant', model: 'claude-opus-5', stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 },
        content: [{ type: 'text', text: '{"title":"Call the client","date":null,"time":"18:30","repeat":"Once","everyDays":null,"notes":null}' }] }),
    });
  });
  await page.goto(BASE + '#/settings', { waitUntil: 'networkidle' });
  await page.getByPlaceholder('sk-ant-…').fill('sk-ant-test');
  await page.waitForTimeout(400);
  await page.goto(BASE + '#/tracker?tab=reminders', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /Talk a reminder/ }).click();
  await page.locator('.capture textarea').fill('remind me to call the client at 6:30 on Thursday');
  await page.getByRole('button', { name: 'Save' }).click();
  await page.waitForTimeout(2000);
  if (!sent) bad('parse', 'no request sent');
  else {
    /Turn a spoken sentence into a reminder/.test(sent.system) ? ok('a parsing brief is sent') : bad('brief', 'missing');
    /Every N days/.test(sent.system) ? ok('the interval shape is offered to it') : bad('brief', 'interval option missing');
    /do not invent one/.test(sent.system) ? ok('it is told not to invent a time') : bad('brief', 'guard missing');
    /Today is \d{4}-\d{2}-\d{2}/.test(sent.messages[0].content) ? ok('today is given so relative dates resolve') : bad('context', 'no date');
  }
  const title = await page.getByPlaceholder('Get a haircut').inputValue();
  title === 'Call the client' ? ok('the parsed title lands in the form') : bad('title', title);
  const time = await page.locator('.modal-body input[type="time"]').inputValue();
  time === '18:30' ? ok('and the parsed time') : bad('time', time);
  await ctx.close();
}

console.log('\n7. Reminders reach the notification log');
{
  const { ctx, page } = await seeded();
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  const st = await read(page);
  const fromReminders = st.notifications.items.filter((n) => n.key.startsWith('reminder:'));
  fromReminders.length > 0 ? ok(`${fromReminders.length} raised from overdue reminders`) : bad('notifications', 'none raised');
  fromReminders.every((n) => n.tab === 'reminders' && n.to === 'tracker')
    ? ok('they deep-link to the reminders tab') : bad('link', JSON.stringify(fromReminders[0]));
  await ctx.close();
}

await browser.close();
console.log(problems.length ? `\n${problems.length} PROBLEM(S):\n` + problems.join('\n') : '\nAll checks passed.');
process.exit(problems.length ? 1 : 0);
