import { chromium } from 'playwright';
const BASE = process.env.PLANE_URL ?? 'http://localhost:4173';
const problems = [];
const ok = (l) => console.log('  PASS ' + l);
const bad = (l, d) => { problems.push(`${l}: ${d}`); console.log('  FAIL ' + l + ' — ' + d); };

const REPORT = `COMPREHENSIVE METABOLIC PANEL
Glucose, fasting      91    mg/dL    70-99
LDL Cholesterol      112    mg/dL    <100
HDL Cholesterol       55    mg/dL    >40
Vitamin D, 25-OH      34    ng/mL    30-100`;

const browser = await chromium.launch();
async function open({ reply, fail } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 950 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    // Test 4 deliberately serves 500s; the browser logs those itself.
    if (m.type() === 'error' && !(fail && /500/.test(m.text()))) problems.push('console: ' + m.text());
  });

  let sent = null;
  await page.route('https://api.anthropic.com/**', async (route) => {
    sent = route.request().postDataJSON();
    if (fail) {
      await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ type: 'error', error: { type: 'api_error', message: 'boom' } }) });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5',
        content: [{ type: 'text', text: reply }],
        stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 },
      }),
    });
  });

  await page.goto(BASE + '#/settings', { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('plane.state.v1') || '{}');
    s.settings = { ...(s.settings ?? {}), anthropicApiKey: 'sk-ant-test' };
    localStorage.setItem('plane.state.v1', JSON.stringify(s));
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
  return { ctx, page, sent: () => sent };
}
const read = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('plane.state.v1') || '{}'));

const GOOD = JSON.stringify({
  date: '2026-07-27',
  lab: 'Quest Diagnostics',
  markers: [
    { name: 'Glucose, fasting', value: 91, unit: 'mg/dL', low: 70, high: 99 },
    { name: 'LDL Cholesterol', value: 112, unit: 'mg/dL', low: null, high: 100 },
    { name: 'HDL Cholesterol', value: 55, unit: 'mg/dL', low: 40, high: null },
    { name: 'Vitamin D, 25-OH', value: 34, unit: 'ng/mL', low: 30, high: 100 },
  ],
});

async function openPanelForm(page) {
  await page.goto(BASE + '#/health?tab=blood', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  const pop = page.locator('.pop button[aria-label="Close"]').first();
  if (await pop.count()) await pop.click().catch(() => {});
  await page.getByRole('button', { name: '+ Add a panel' }).first().click();
  const form = page.getByRole('dialog');
  await form.getByText('Paste the report instead of typing it').click();
  return form;
}

console.log('\n1. A pasted report becomes rows you can check');
{
  const { ctx, page, sent } = await open({ reply: GOOD });
  const form = await openPanelForm(page);
  await form.getByLabel('Text from your lab report').fill(REPORT);
  await form.getByRole('button', { name: 'Read it into rows' }).click();
  await page.waitForTimeout(600);

  const body = sent();
  body && body.messages[0].content.includes('Glucose, fasting')
    ? ok('the pasted text is what gets sent') : bad('request', JSON.stringify(body).slice(0, 120));
  /transcribe|copy what is printed/i.test(body.system)
    ? ok('and it is asked to transcribe, not interpret') : bad('system', body.system.slice(0, 120));

  // The rows are inputs, so read their values rather than the panel's text.
  const names = await form.getByLabel('Marker', { exact: true }).evaluateAll((els) => els.map((e) => e.value));
  names.includes('Glucose, fasting') && names.includes('Vitamin D, 25-OH') && names.length === 4
    ? ok(`every marker comes back as an editable row (${names.length})`) : bad('rows', JSON.stringify(names));

  const dateVal = await form.getByLabel('Date drawn').inputValue();
  dateVal === '2026-07-27' ? ok('the date off the report is filled in') : bad('date', dateVal);
  const labVal = await form.getByLabel('Lab or clinic').inputValue();
  labVal === 'Quest Diagnostics' ? ok('and the lab') : bad('lab', labVal);

  await form.getByRole('button', { name: 'Save panel' }).click();
  await page.waitForTimeout(500);
  const st = await read(page);
  const p = st.health.panels.find((x) => x.date === '2026-07-27');
  p && p.markers.length === 4 ? ok('the panel saves with all four') : bad('save', JSON.stringify(p?.markers?.length));
  const ldl = p.markers.find((m) => /LDL/.test(m.name));
  ldl.high === 100 && ldl.low === undefined
    ? ok('"<100" becomes a high bound with no low') : bad('bounds', JSON.stringify(ldl));
  const card = page.locator('section.card').filter({ hasText: 'LDL Cholesterol' }).first();
  /Above range/.test(await card.innerText()) ? ok('and 112 against that reads as above range') : bad('status', 'not flagged');
  await ctx.close();
}

console.log('\n2. Nothing is saved until you press the button');
{
  const { ctx, page } = await open({ reply: GOOD });
  const form = await openPanelForm(page);
  await form.getByLabel('Text from your lab report').fill(REPORT);
  await form.getByRole('button', { name: 'Read it into rows' }).click();
  await page.waitForTimeout(600);
  const before = (await read(page)).health.panels.length;
  await form.getByRole('button', { name: 'Cancel' }).click();
  await page.waitForTimeout(300);
  (await read(page)).health.panels.length === before
    ? ok('closing without saving stores nothing') : bad('leak', 'a panel was stored');
  await ctx.close();
}

console.log('\n3. A bad reply is reported, not half-applied');
{
  const { ctx, page } = await open({ reply: '{"markers": [{"name": "", "value": "abc"}]}' });
  const form = await openPanelForm(page);
  await form.getByLabel('Text from your lab report').fill(REPORT);
  await form.getByRole('button', { name: 'Read it into rows' }).click();
  await page.waitForTimeout(600);
  const text = await form.innerText();
  /No markers could be read/.test(text) ? ok('a reply with no usable rows says so') : bad('error', text.slice(0, 200));
  const saveDisabled = await form.getByRole('button', { name: 'Save panel' }).isDisabled();
  saveDisabled ? ok('and there is nothing to save') : bad('save button', 'enabled with no markers');
  await ctx.close();
}

console.log('\n4. A failed call leaves the form usable');
{
  const { ctx, page } = await open({ reply: GOOD, fail: true });
  const form = await openPanelForm(page);
  await form.getByLabel('Text from your lab report').fill(REPORT);
  await form.getByRole('button', { name: 'Read it into rows' }).click();
  // The SDK retries a 500 twice with backoff before giving up.
  const err = form.locator('.t-crit');
  await err.waitFor({ timeout: 40000 });
  const text = await err.innerText();
  /try again/i.test(text) && !/\{"type"/.test(text)
    ? ok('the failure is explained in words, not raw API JSON') : bad('error text', text.slice(0, 200));
  await form.getByRole('button', { name: '+ HbA1c' }).click();
  await page.waitForTimeout(200);
  /HbA1c/.test(await form.innerText()) ? ok('and the by-hand path still works') : bad('fallback', 'catalogue broken');
  await ctx.close();
}

console.log('\n5. Without a key the paste path is closed off, not hidden');
{
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 950 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
  await page.goto(BASE + '#/health?tab=blood', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: '+ Add a panel' }).first().click();
  const form = page.getByRole('dialog');
  await form.getByText('Paste the report instead of typing it').click();
  await form.getByLabel('Text from your lab report').fill(REPORT);
  const disabled = await form.getByRole('button', { name: 'Read it into rows' }).isDisabled();
  disabled ? ok('the button is disabled') : bad('button', 'enabled without a key');
  /Needs an API key/.test(await form.innerText()) ? ok('and it says why') : bad('hint', 'no explanation');
  await ctx.close();
}

await browser.close();
console.log(problems.length ? `\n${problems.length} PROBLEM(S):\n` + problems.join('\n') : '\nAll checks passed.');
process.exit(problems.length ? 1 : 0);
