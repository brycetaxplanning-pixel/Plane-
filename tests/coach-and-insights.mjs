import { chromium } from 'playwright';
const BASE = process.env.PLANE_URL ?? 'http://localhost:4173';
const problems = [];
const ok = (l) => console.log('  PASS ' + l);
const bad = (l, d) => { problems.push(`${l}: ${d}`); console.log('  FAIL ' + l + ' — ' + d); };

const browser = await chromium.launch();
async function ctxPage(seed = true) {
  const ctx = await browser.newContext({ viewport: { width: 460, height: 950 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') problems.push('console: ' + m.text()); });
  if (seed) {
    await page.goto(BASE + '#/settings', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Load sample data' }).click();
    await page.getByRole('button', { name: 'Load it' }).click();
    await page.waitForTimeout(700);
  }
  return { ctx, page };
}
const read = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('plane.state.v1') || '{}'));

console.log('\n1. The tutor states what is missing rather than failing silently');
{
  const { ctx, page } = await ctxPage();
  await page.goto(BASE + '#/spanish', { waitUntil: 'networkidle' });
  await page.getByRole('tab', { name: 'AI tutor' }).click();
  await page.waitForTimeout(400);
  (await page.getByText('needs an Anthropic API key').count()) > 0
    ? ok('says a key is needed when none is set') : bad('key notice', 'missing');
  (await page.getByRole('button', { name: /Start talking/ }).isDisabled())
    ? ok('start is disabled without a key') : bad('start', 'enabled anyway');
  const caps = await page.evaluate(() => ({
    hear: 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window,
    speak: 'speechSynthesis' in window,
    voices: (window.speechSynthesis?.getVoices?.() ?? []).filter((v) => v.lang.toLowerCase().startsWith('es')).length,
  }));
  console.log(`   (browser: hear=${caps.hear} speak=${caps.speak} spanish voices=${caps.voices})`);
  if (caps.voices === 0) {
    (await page.getByText(/No Spanish voice is installed/).count()) > 0
      ? ok('warns when the device has no Spanish voice') : bad('voice notice', 'missing');
  }
  await ctx.close();
}

console.log('\n2. The tutor sends a voice-shaped brief and logs the session');
{
  const { ctx, page } = await ctxPage();
  let sent = null;
  await page.route('https://api.anthropic.com/**', async (route) => {
    sent = route.request().postDataJSON?.() ?? null;
    // The SDK's SSE decoder needs the `event:` line, not just `data:`.
    const frame = (type, obj) => `event: ${type}\ndata: ${JSON.stringify(obj)}\n\n`;
    const body = frame('message_start', { type: 'message_start', message: { id: 'm', type: 'message', role: 'assistant', model: 'claude-opus-5', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } } })
      + frame('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } })
      + frame('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Hola, ¿qué tal tu semana? [fix] Use the past tense there.' } })
      + frame('content_block_stop', { type: 'content_block_stop', index: 0 })
      + frame('message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 9 } })
      + frame('message_stop', { type: 'message_stop' });
    await route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream' }, body });
  });
  await page.goto(BASE + '#/settings', { waitUntil: 'networkidle' });
  await page.getByPlaceholder('sk-ant-…').fill('sk-ant-test');
  await page.waitForTimeout(400);
  await page.goto(BASE + '#/spanish', { waitUntil: 'networkidle' });
  await page.getByRole('tab', { name: 'AI tutor' }).click();
  await page.getByRole('button', { name: /Start talking/ }).click();
  await page.waitForTimeout(3000);

  if (!sent) bad('tutor request', 'nothing sent');
  else {
    /voice call/.test(sent.system) ? ok('the brief tells it this is spoken, not written') : bad('brief', 'no voice framing');
    /no markdown, no lists, no emoji/.test(sent.system) ? ok('it is told to write for the ear') : bad('brief', 'formatting rules missing');
    /missing accents and mistranscribed words/.test(sent.system) ? ok('it expects speech-recognition noise') : bad('brief', 'transcription note missing');
    /starting with exactly \[fix\]/.test(sent.system) ? ok('the correction convention is specified') : bad('brief', 'fix convention missing');
    /Intermediate/.test(sent.system) ? ok('the level is carried through') : bad('brief', 'level missing');
  }
  const bubble = await page.locator('.bubble-ai').first().innerText();
  /Hola, ¿qué tal tu semana\?/.test(bubble) ? ok('the Spanish is shown') : bad('transcript', bubble);
  /Use the past tense there\./.test(bubble) ? ok('the correction is split out and shown separately') : bad('fix split', bubble);
  /\[fix\]/.test(bubble) ? bad('fix marker', 'the raw marker leaked into the transcript') : ok('the raw marker never reaches the user');

  await page.getByRole('button', { name: /End and log it/ }).click();
  await page.waitForTimeout(600);
  const st = await read(page);
  const tooShort = st.spanish.sessions.filter((x) => x.platform === 'AI tutor').length === 0;
  tooShort ? ok('a sub-minute session is not logged as study time') : bad('logging', 'logged a session under a minute');
  await ctx.close();
}

console.log('\n3. The weekly plan: locked lines, open slots and rollover');
{
  const { ctx, page } = await ctxPage();
  await page.goto(BASE + '#/fitness', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  const bar = await page.locator('.ticks').innerText();
  /Weightlifting/.test(bar) && /MMA/.test(bar) ? ok('locked lines are listed') : bad('rows', bar);
  /Anything/.test(bar) ? ok('the leftover slots get a row of their own') : bad('open', bar);
  const st = await read(page);
  const committed = st.fitness.plan.filter((p) => p.locked || p.week).reduce((n, p) => n + p.perWeek, 0);
  const open = st.fitness.targets.total - committed;
  new RegExp(`${open}`).test(bar) ? ok(`open count is total minus commitments (12 - ${committed} = ${open})`) : bad('open maths', bar);

  // A one-week line must not survive into next week; a locked one must.
  const rolled = await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('plane.state.v1'));
    const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const today = new Date();
    const shift = (today.getDay() + 6) % 7;
    const thisMon = new Date(today); thisMon.setDate(today.getDate() - shift);
    const nextMon = new Date(thisMon); nextMon.setDate(thisMon.getDate() + 7);
    const next = iso(nextMon);
    return {
      locked: s.fitness.plan.filter((p) => p.locked).map((p) => p.activity),
      carriesOver: s.fitness.plan.filter((p) => p.locked || p.week === next).map((p) => p.activity),
    };
  });
  rolled.carriesOver.length === rolled.locked.length && rolled.carriesOver.includes('Weightlifting')
    ? ok('only locked lines carry into next week') : bad('rollover', JSON.stringify(rolled));

  // Ticking a box is the whole point of the plan: one tap logs a session of
  // that activity today, and tapping a full one takes the last one back.
  {
    const row = page.locator('.tickrow').filter({ hasText: 'Weightlifting' }).first();
    const before = (await read(page)).fitness.activities.filter((a) => a.type === 'Weightlifting').length;
    await row.locator('.tick:not(.is-done)').first().click();
    await page.waitForTimeout(400);
    const mid = (await read(page)).fitness.activities.filter((a) => a.type === 'Weightlifting');
    mid.length === before + 1 ? ok('a tick logs a session') : bad('tick', `${before} -> ${mid.length}`);
    mid[mid.length - 1]?.date === new Date().toISOString().slice(0, 10)
      ? ok('dated today') : bad('tick date', JSON.stringify(mid[mid.length - 1]));

    await row.locator('.tick.is-done').last().click();
    await page.waitForTimeout(400);
    const after = (await read(page)).fitness.activities.filter((a) => a.type === 'Weightlifting').length;
    after === before ? ok('and unticking takes it back') : bad('untick', `expected ${before}, got ${after}`);
  }

  await page.getByRole('button', { name: '+ Add' }).click();
  await page.locator('.modal-body').getByRole('button', { name: 'Swim', exact: true }).click();
  await page.locator('.modal-body input[type="checkbox"]').uncheck();
  await page.getByRole('button', { name: 'Save' }).click();
  await page.waitForTimeout(500);
  const after = await read(page);
  const swim = after.fitness.plan.find((p) => p.activity === 'Swim');
  swim && swim.locked === false && swim.week ? ok('an unticked line is stored for this week only') : bad('one-off', JSON.stringify(swim));
  await ctx.close();
}

console.log('\n4. Suggestions for the open slots');
{
  const { ctx, page } = await ctxPage();
  // Clear this week so slots are genuinely open; a full week should show none.
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const today = new Date();
    const shift = (today.getDay() + 6) % 7;
    const mon = new Date(today); mon.setDate(today.getDate() - shift);
    const s = JSON.parse(localStorage.getItem('plane.state.v1'));
    s.fitness.activities = s.fitness.activities.filter((a) => a.date < iso(mon));
    localStorage.setItem('plane.state.v1', JSON.stringify(s));
  });
  await page.goto(BASE + '#/fitness', { waitUntil: 'networkidle' });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  const card = page.locator('.card', { hasText: 'Ideas for the open slots' });
  (await card.count()) > 0 ? ok('suggestions appear while slots are open') : bad('suggestions', 'card missing');
  const text = await card.innerText();
  /once this week/.test(text) ? ok('each is framed as a single session') : bad('framing', text.slice(0, 120));
  const planned = (await read(page)).fitness.plan.map((p) => p.activity);
  planned.some((a) => new RegExp(`${a} once this week`).test(text))
    ? bad('suggestions', 'suggested something already in the plan')
    : ok('nothing already planned is suggested');

  // A week with the slots already filled should not nag.
  await page.evaluate(() => {
    const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const today = new Date();
    const s = JSON.parse(localStorage.getItem('plane.state.v1'));
    for (let i = 0; i < 8; i++) s.fitness.activities.push({ id: `fill${i}`, date: iso(today), type: 'Basketball', minutes: 60 });
    localStorage.setItem('plane.state.v1', JSON.stringify(s));
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  (await page.locator('.card', { hasText: 'Ideas for the open slots' }).count()) === 0
    ? ok('suggestions disappear once the slots are filled') : bad('suggestions', 'still nagging on a full week');
  await ctx.close();
}

console.log('\n5. Screen time as a ceiling habit');
{
  const { ctx, page } = await ctxPage();
  await page.goto(BASE + '#/habits', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  const row = page.locator('.habit', { hasText: 'Screen time' });
  (await row.count()) > 0 ? ok('screen time is a habit like any other') : bad('habit', 'missing');
  /cap 3h/.test(await row.innerText()) ? ok('it shows as a cap, not a target') : bad('cap label', await row.innerText());

  await row.getByRole('button', { name: 'Done' }).click();
  await page.locator('.modal-body input[type="number"]').fill('1.5');
  await page.getByRole('button', { name: 'Log it' }).click();
  await page.waitForTimeout(500);
  let st = await read(page);
  let log = st.habits.logs.filter((l) => l.amount === 1.5).at(-1);
  log?.met === true ? ok('1.5h against a 3h cap counts as met') : bad('under', JSON.stringify(log));

  await page.locator('.habit', { hasText: 'Screen time' }).getByRole('button', { name: 'Undo' }).click();
  await page.waitForTimeout(300);
  await page.locator('.habit', { hasText: 'Screen time' }).getByRole('button', { name: 'Done' }).click();
  await page.locator('.modal-body input[type="number"]').fill('6');
  await page.getByRole('button', { name: 'Log it' }).click();
  await page.waitForTimeout(500);
  st = await read(page);
  log = st.habits.logs.filter((l) => l.amount === 6).at(-1);
  log?.met === false ? ok('6h against a 3h cap is a miss') : bad('over', JSON.stringify(log));

  await page.goto(BASE + '#/coach', { waitUntil: 'networkidle' });
  await page.getByRole('tab', { name: 'Analysis' }).click();
  await page.waitForTimeout(500);
  const sink = page.locator('.card', { hasText: 'Where the hours went' });
  (await sink.count()) > 0 ? ok('it surfaces in the analysis') : bad('analysis card', 'missing');
  const body = await sink.innerText();
  /over your own 3h-a-day cap/.test(body)
    ? ok('a heavy logged day reads as over, not under') : bad('overage', body.replace(/\n/g, ' | ').slice(0, 200));
  /the week lands around/.test(body)
    ? ok('it projects the week from the days actually logged') : bad('projection', body.replace(/\n/g, ' | ').slice(0, 200));
  /no public API for Screen Time/.test(body) ? ok('it is honest that the number is typed in') : bad('honesty', 'missing');
  await ctx.close();
}

await browser.close();
console.log(problems.length ? `\n${problems.length} PROBLEM(S):\n` + problems.join('\n') : '\nAll checks passed.');
process.exit(problems.length ? 1 : 0);
