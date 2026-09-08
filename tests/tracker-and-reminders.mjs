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
  await page.goto(BASE + '#/reminders', { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  const haircut = page.locator('.todo-row', { hasText: 'Get a haircut' });
  const text = await haircut.innerText();
  /27 days ago/.test(text) ? ok('it reports days since the last one') : bad('interval label', text.replace(/\n/g, ' | '));
  /every 21 days/.test(text) ? ok('and the interval it is meant to run on') : bad('interval', text.replace(/\n/g, ' | '));

  await haircut.getByRole('button', { name: /Mark .* done/ }).click();
  await page.waitForTimeout(500);
  const st = await read(page);
  const r = st.reminders.items.find((x) => x.title === 'Get a haircut');
  const today = await page.evaluate(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; });
  r.lastDone === today && r.done === false
    ? ok('marking it done resets the clock instead of deleting it') : bad('reset', JSON.stringify(r));
  await page.waitForTimeout(300);
  const after = await page.locator('.todo-row', { hasText: 'Get a haircut' }).innerText();
  /0 days ago[\s\S]*every 21 days/.test(after) ? ok('and the clock restarts from today') : bad('reschedule', after.replace(/\n/g, ' | '));
  await ctx.close();
}

console.log('\n4. A one-off completes and leaves the list');
{
  const { ctx, page } = await seeded();
  await page.goto(BASE + '#/reminders', { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  await page.locator('.todo-row', { hasText: 'Client call with Halvorsen' }).getByRole('button', { name: /Mark .* done/ }).click();
  await page.waitForTimeout(500);
  const st = await read(page);
  st.reminders.items.find((x) => x.title.startsWith('Client call')).done === true
    ? ok('a one-off is marked done') : bad('once', 'not completed');
  (await page.locator('.todo-row', { hasText: 'Client call with Halvorsen' }).count()) === 0
    ? ok('and disappears from the list') : bad('once', 'still listed');
  await ctx.close();
}

console.log('\n5. Calendar export produces a valid .ics');
{
  const { ctx, page } = await seeded();
  await page.goto(BASE + '#/reminders', { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: /Add the dated ones to a calendar/ }).click();
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
  await page.goto(BASE + '#/reminders', { waitUntil: 'networkidle' });
  // Talking is folded into the add sheet now: the plus, then "say it instead".
  await page.locator('.fab').click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: /Say it instead/ }).click();
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
  const title = await page.getByPlaceholder('Cancel the subscription').inputValue();
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
  fromReminders.every((n) => n.to === 'reminders')
    ? ok('they deep-link to the reminders module') : bad('link', JSON.stringify(fromReminders[0]));
  await ctx.close();
}

console.log('\n8. Reminders is a module you can dump things into');
{
  const { ctx, page } = await seeded();
  await page.goto(BASE + '#/reminders', { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);

  // A plus in the corner, one line, Save. No form and no date unless you ask
  // for one — this is the whole reason the module exists.
  await page.locator('.fab').click();
  await page.waitForTimeout(300);
  await page.locator('.askline-input').fill('Return the loaner monitor');
  await page.getByRole('button', { name: 'Save' }).click();
  await page.waitForTimeout(400);

  const st = await read(page);
  const made = st.reminders.items.find((r) => r.title === 'Return the loaner monitor');
  made ? ok('one box and one button adds a to-do') : bad('capture', 'not stored');
  made && made.date === undefined
    ? ok('and it carries no date') : bad('date', JSON.stringify(made));

  // dueList reports today for an undated reminder, so without the split these
  // showed under "Coming up" stamped with today's date — a deadline it never had.
  const body = await page.locator('main').innerText();
  /ANYTIME/i.test(body) ? ok('undated ones get a group of their own') : bad('group', body.slice(0, 160));
  // Ask which group it actually landed in rather than pattern-matching the
  // whole page: "Today" appears as a row's own date too, so a loose regex
  // across the body proves nothing.
  const group = await page.locator('section:has(> .todo-group)')
    .filter({ hasText: 'Return the loaner monitor' })
    .locator('.todo-group').innerText();
  /^ANYTIME/i.test(group.trim())
    ? ok('and are not listed as due today') : bad('misfiled', `filed under ${group.replace(/\n/g, ' ')}`);

  // It has no deadline, so nothing may invent one for it. dueList reports
  // today for these, which used to reach the notification log as "— today"
  // every morning and the push schedule as "it was due yesterday".
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  const after = await read(page);
  const nagged = after.notifications.items.filter((n) => n.title.includes('Return the loaner monitor'));
  nagged.length === 0 ? ok('an undated one raises no notification') : bad('nag', JSON.stringify(nagged[0]));

  await page.goto(BASE + '#/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  const card = page.locator('.mtile').filter({ hasText: 'TO DO' }).first();
  (await card.count()) === 1 ? ok('it has a launcher card of its own') : bad('card', 'not on the launcher');
  // read after the add, so the new to-do is already counted.
  const open = after.reminders.items.filter((r) => !r.done).length;
  const face = await card.innerText();
  new RegExp(`\\b${open}\\b[\\s\\S]*to do`, 'i').test(face)
    ? ok(`counting what is open (${open})`) : bad('count', face);
  await ctx.close();
}

await browser.close();
console.log(problems.length ? `\n${problems.length} PROBLEM(S):\n` + problems.join('\n') : '\nAll checks passed.');
process.exit(problems.length ? 1 : 0);
