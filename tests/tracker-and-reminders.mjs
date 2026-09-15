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
  // Speech is the only way in now — the sheet is one field with a microphone
  // on it, and a spoken sentence is what asks to be taken apart. So stand a
  // recogniser up in place of the browser's and drive the real path, rather
  // than testing a typed shortcut that no longer ships.
  await page.addInitScript(() => {
    class FakeRecognition {
      start() {
        setTimeout(() => {
          this.onstart?.();
          setTimeout(() => {
            const said = window.__said ?? '';
            const result = [{ transcript: said }];
            result.isFinal = true;
            this.onresult?.({ resultIndex: 0, results: [result] });
          }, 40);
        }, 10);
      }
      stop() { setTimeout(() => this.onend?.(), 10); }
      abort() {}
    }
    window.SpeechRecognition = FakeRecognition;
  });
  await page.goto(BASE + '#/reminders', { waitUntil: 'networkidle' });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(400);

  await page.locator('.fab').click();
  await page.waitForTimeout(300);
  await page.evaluate(() => { window.__said = 'remind me to call the client at 6:30 on Thursday'; });
  const micBtn = page.locator('.modal-body .mic');
  await micBtn.click();                 // starts listening, and the phrase lands
  await page.waitForTimeout(400);
  await micBtn.click();                 // ends the spell, which is what parses it
  await page.waitForTimeout(2500);
  if (!sent) bad('parse', 'no request sent');
  else {
    /Turn a spoken sentence into a reminder/.test(sent.system) ? ok('a parsing brief is sent') : bad('brief', 'missing');
    // A to-do happens once, so the brief no longer offers a repeat at all and
    // says to disregard anything spoken about frequency — otherwise "call him
    // every Tuesday" comes back as a recurring to-do the form cannot express.
    /Ignore anything about how often/.test(sent.system)
      ? ok('it is told a to-do happens once') : bad('brief', 'the one-time instruction is missing');
    /Every N days/.test(sent.system)
      ? bad('brief', 'still offers a repeating shape') : ok('and is offered no repeating shape');
    /do not invent one/.test(sent.system) ? ok('it is told not to invent a time') : bad('brief', 'guard missing');
    /Today is \d{4}-\d{2}-\d{2}/.test(sent.messages[0].content) ? ok('today is given so relative dates resolve') : bad('context', 'no date');
  }
  const title = await page.getByPlaceholder('Type what you need to do').inputValue();
  title === 'Call the client' ? ok('the parsed title lands in the form') : bad('title', title);
  // The fold opens on the result, so what it decided is visible rather than
  // saved behind your back.
  const time = await page.locator('.modal-body input[type="time"]').inputValue();
  time === '18:30' ? ok('and the parsed time, with the fold opened on it') : bad('time', time);
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

console.log('\n9. A to-do is one-time, and says how often to nudge');
{
  const { ctx, page } = await seeded();
  await page.goto(BASE + '#/reminders', { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  await page.locator('.fab').click();
  await page.waitForTimeout(300);
  await page.locator('.askline-input').fill('Send the engagement letter');
  await page.getByRole('button', { name: /Add more detail/ }).click();
  await page.waitForTimeout(300);

  // A thing that comes round again is a habit, so the fold does not ask how
  // often the to-do itself happens — only how often to be nudged about it.
  const fold = await page.locator('.modal-body').innerText();
  /How often/i.test(fold) ? bad('frequency', 'still asks how often the to-do repeats') : ok('it does not ask how often the to-do repeats');
  /Complete by/i.test(fold) ? ok('it asks when it must be done by') : bad('complete by', fold.slice(0, 160));
  /Remind me/i.test(fold) ? ok('and how often to nudge') : bad('remind', fold.slice(0, 160));

  await page.getByRole('button', { name: /^(On|Off)$/ }).click();
  await page.waitForTimeout(250);
  await page.getByLabel('How many').fill('30');
  await page.getByLabel('Minutes, hours or days').selectOption('minutes');
  await page.getByLabel('Complete by date').fill('2026-09-15');
  await page.getByRole('button', { name: 'Save' }).click();
  await page.waitForTimeout(600);

  const made = (await read(page)).reminders.items.find((r) => r.title === 'Send the engagement letter');
  made?.repeat === 'Once' ? ok('what it saves is a one-time to-do') : bad('repeat', made?.repeat);
  made?.date === '2026-09-15' ? ok('with the date it must be done by') : bad('date', made?.date);
  JSON.stringify(made?.remindEvery) === '{"n":30,"unit":"minutes"}'
    ? ok('and a nudge every 30 minutes') : bad('remindEvery', JSON.stringify(made?.remindEvery));

  const row = await page.locator('.todo-row', { hasText: 'Send the engagement letter' }).innerText();
  /nudged every 30 minutes/.test(row) ? ok('the row says so out loud') : bad('row', row.replace(/\n/g, ' | '));
  await ctx.close();
}

console.log('\n10. A minute-by-minute nudge cannot take the whole schedule');
{
  const { ctx, page } = await seeded();
  await page.goto(BASE + '#/settings', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  // Nothing but one impatient to-do. Over a fortnight a one-minute cadence is
  // twenty thousand wakes, and the schedule holds a hundred in total — without
  // a per-item cap this one would silence every other notification in the app.
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('plane.state.v1'));
    s.reminders.items = [{
      id: 'rem_nag', title: 'Chase the K-1', repeat: 'Once', done: false,
      createdAt: '2026-09-01', remindEvery: { n: 1, unit: 'minutes' },
    }];
    s.work.projects = []; s.habits.items = []; s.habits.logs = [];
    s.fitness.race = { name: 'x', distanceKm: 5 };
    localStorage.setItem('plane.state.v1', JSON.stringify(s));
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  const n = Number(await page.evaluate(() => {
    const el = [...document.querySelectorAll('section.card')].find((c) => /app closed/.test(c.textContent));
    return /(\d+) things? would be scheduled/.exec(el.textContent)?.[1];
  }));
  n > 0 ? ok(`an undated to-do asking to be nudged is scheduled (${n})`) : bad('nudge', 'nothing scheduled');
  n <= 20 ? ok('and one to-do cannot flood the schedule') : bad('cap', `${n} wakes from one to-do`);
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
  // Match the tile's own name element, not any text anywhere in the tile: the
  // seed carries a note called "To do", so a loose text match on the launcher
  // finds the Notes card first.
  const card = page.locator('.mtile').filter({ has: page.locator('.mtile-name', { hasText: /^To Do$/ }) }).first();
  (await card.count()) === 1 ? ok('it has a launcher card of its own') : bad('card', 'not on the launcher');
  // read after the add, so the new to-do is already counted.
  const open = after.reminders.items.filter((r) => !r.done).length;
  const face = await card.innerText();
  new RegExp(`\\b${open}\\b[\\s\\S]*to do`, 'i').test(face)
    ? ok(`counting what is open (${open})`) : bad('count', face);
  await ctx.close();
}

console.log('\n11. A follow-up comes back until they answer');
{
  const { ctx, page } = await seeded();
  await page.goto(BASE + '#/work', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  const pop = page.locator('.pop button').first();
  if (await pop.count()) await pop.click().catch(() => {});
  await page.waitForTimeout(300);

  // The module's to-do corner: a label, a plus, and a way to see the rest.
  (await page.locator('.modtodo-label').innerText()).trim().toUpperCase() === 'TO DO'
    ? ok('every module has a to-do corner') : bad('corner', 'missing');
  (await page.locator('.modtodo-btn').count()) === 2
    ? ok('with one button to add and one to show them') : bad('buttons', 'wrong number');

  await page.getByLabel('Add a to-do here').click();
  await page.waitForTimeout(400);
  await page.locator('.askline-input').fill('Follow up with Halvorsen');
  await page.getByRole('button', { name: /Add more detail/ }).click();
  await page.waitForTimeout(300);
  await page.locator('.modal-body').getByRole('button', { name: /^(No|Yes — chase)$/ }).click();
  await page.waitForTimeout(250);
  await page.getByRole('button', { name: 'Save' }).click();
  await page.waitForTimeout(700);

  const find = async () => (await read(page)).reminders.items.find((r) => r.title === 'Follow up with Halvorsen');
  let r = await find();
  r?.followUp === true ? ok('it can be marked as waiting on someone') : bad('followUp', JSON.stringify(r));

  // The whole point: doing it does not finish it.
  await page.getByLabel(/Show the .* to-do/).click();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: /Chased Follow up with Halvorsen again/ }).click();
  await page.waitForTimeout(700);
  r = await find();
  r?.done === false ? ok('chasing it does not close it') : bad('closed', 'it was marked done');
  (r?.touches ?? []).length === 1 ? ok('and the chase is counted') : bad('touches', JSON.stringify(r?.touches));
  r?.date && r.date > todayISO() ? ok('and it comes back on its own') : bad('reschedule', String(r?.date));
  (await page.getByRole('dialog').locator('.todo-row', { hasText: 'Follow up with Halvorsen' }).count()) > 0
    ? ok('so it is still on the list') : bad('vanished', 'it left the list');

  // Only a reply ends it.
  await page.getByRole('dialog').locator('.todo-open', { hasText: 'Follow up with Halvorsen' }).click();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'Got a reply' }).click();
  await page.waitForTimeout(700);
  (await find())?.done === true ? ok('a reply is what closes it') : bad('resolve', 'still open');
  await ctx.close();
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

await browser.close();
console.log(problems.length ? `\n${problems.length} PROBLEM(S):\n` + problems.join('\n') : '\nAll checks passed.');
process.exit(problems.length ? 1 : 0);
