import { chromium } from 'playwright';
const BASE = process.env.PLANE_URL ?? 'http://localhost:4173';
const problems = [];
const ok = (l) => console.log('  PASS ' + l);
const bad = (l, d) => { problems.push(`${l}: ${d}`); console.log('  FAIL ' + l + ' — ' + d); };

const browser = await chromium.launch();
async function open() {
  const ctx = await browser.newContext({ viewport: { width: 430, height: 950 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') problems.push('console: ' + m.text()); });
  await page.goto(BASE + '#/goals', { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  const pop = page.locator('.pop button').first();
  if (await pop.count()) await pop.click().catch(() => {});
  await page.waitForTimeout(200);
  return { ctx, page };
}
const read = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('plane.state.v1') || '{}'));
const labels = (form) => form.locator('.field > label').allInnerTexts()
  .then((xs) => xs.map((t) => t.trim()));

console.log('\n1. The form opens on Custom and asks Custom questions');
{
  const { ctx, page } = await open();
  await page.getByLabel('Add a goal').click();
  await page.waitForTimeout(300);
  const form = page.getByRole('dialog');

  (await form.locator('.chip[aria-pressed="true"]').innerText()).trim() === 'Custom'
    ? ok('Custom is what a new goal starts as') : bad('default', await form.locator('.chip[aria-pressed="true"]').innerText());

  const seen = await labels(form);
  // The gap: the record has always had notes and the form never asked for them,
  // so a goal made of words rather than numbers had nowhere to put them.
  seen.includes('Notes') ? ok('and it asks for notes') : bad('notes', seen.join(' | '));
  !seen.some((l) => /cost|per month|cash price|up front/i.test(l))
    ? ok('and asks nothing about money') : bad('money', seen.join(' | '));
  seen.includes('Count toward it') ? ok('its progress row is counted, not priced') : bad('progress', seen.join(' | '));
  await ctx.close();
}

console.log('\n2. Picking a kind changes the questions, not just which are hidden');
{
  const { ctx, page } = await open();
  await page.getByLabel('Add a goal').click();
  await page.waitForTimeout(300);
  const form = page.getByRole('dialog');
  const pick = async (k) => { await form.getByRole('button', { name: k, exact: true }).click(); await page.waitForTimeout(200); return labels(form); };

  const purchase = await pick('Purchase');
  purchase.includes('Cash price') && purchase.includes('Or per month')
    ? ok('Purchase asks a cash price and a monthly') : bad('purchase', purchase.join(' | '));
  purchase.includes('How you pay for it') ? ok('and the plan line is about paying for it') : bad('purchase plan', purchase.join(' | '));
  purchase.includes('Put aside so far') ? ok('and progress is what you have put aside') : bad('purchase progress', purchase.join(' | '));

  const training = await pick('Training');
  training.includes('Training window (weeks)') ? ok('Training asks for a window') : bad('training', training.join(' | '));
  training.includes('Sessions done') ? ok('and counts sessions') : bad('training progress', training.join(' | '));
  !training.includes('Anything else about the cost')
    ? ok('and is not asked about its price') : bad('training cost', training.join(' | '));

  const recurring = await pick('Recurring cost');
  recurring.includes('Up front') && recurring.includes('Per month')
    ? ok('Recurring asks up front and per month') : bad('recurring', recurring.join(' | '));
  !recurring.some((l) => /so far|out of/i.test(l))
    ? ok('and has no progress bar, having nothing to fill') : bad('recurring progress', recurring.join(' | '));

  // Notes are the one thing every kind asks for.
  for (const k of ['Custom', 'Purchase', 'Training', 'Recurring cost']) {
    const seen = await pick(k);
    if (!seen.includes('Notes')) { bad('notes', `${k} does not ask for notes`); break; }
    if (k === 'Recurring cost') ok('and every kind asks for notes');
  }
  await ctx.close();
}

console.log('\n3. Notes save, and come back where they can be read');
{
  const { ctx, page } = await open();
  await page.getByLabel('Add a goal').click();
  await page.waitForTimeout(300);
  const form = page.getByRole('dialog');
  await form.getByPlaceholder('Gain traction on Instagram').fill('Post more on Instagram');
  await form.getByLabel('Notes').fill('Content ideas: S-corp in 60s, write-offs people miss');
  await form.getByRole('button', { name: 'Save' }).click();
  await page.waitForTimeout(500);

  const saved = (await read(page)).goals.items.find((g) => g.title === 'Post more on Instagram');
  saved?.notes === 'Content ideas: S-corp in 60s, write-offs people miss'
    ? ok('what was typed is what was stored') : bad('save', JSON.stringify(saved));
  saved?.kind === 'Custom' ? ok('as a Custom goal, without being told to') : bad('kind', saved?.kind);

  const card = await page.locator('.goal').filter({ hasText: 'Post more on Instagram' }).innerText();
  /write-offs people miss/.test(card)
    ? ok('and it is on the card, which is where it was written to be read') : bad('card', card.replace(/\n/g, ' | '));
  await ctx.close();
}

console.log('\n4. The starter goal is there once, and once only');
{
  const { ctx, page } = await open();
  const titles = await page.locator('.goal-title').allInnerTexts();
  titles.some((t) => /Gain traction on Instagram/.test(t))
    ? ok('it is on the list without being asked for') : bad('starter', titles.join(' | '));

  const card = page.locator('.goal').filter({ hasText: 'Gain traction on Instagram' });
  /Content ideas/.test(await card.innerText())
    ? ok('with somewhere to put the ideas') : bad('notes', await card.innerText());

  await card.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.waitForTimeout(300);
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  await page.waitForTimeout(500);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  // Offered once. A starter goal that came back after being deleted would be
  // worse than never offering one.
  (await page.locator('.goal-title').allInnerTexts()).some((t) => /Gain traction/.test(t))
    ? bad('reoffered', 'it came back after being deleted') : ok('and deleting it is final');
  await ctx.close();
}

console.log('\n5. A save that already has goals gets it too, alongside its own');
{
  const ctx = await browser.newContext({ viewport: { width: 430, height: 950 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.setItem('plane.state.v1', JSON.stringify({
    version: 1,
    goals: { items: [{ id: 'g_old', title: 'Own a used Tesla', kind: 'Purchase', cost: 24000, done: false, createdAt: '2026-01-01' }] },
  })));
  await page.goto(BASE + '#/goals', { waitUntil: 'networkidle' });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  const titles = await page.locator('.goal-title').allInnerTexts();
  titles.some((t) => /Own a used Tesla/.test(t)) && titles.some((t) => /Gain traction/.test(t))
    ? ok('the existing goal is kept and the starter is added') : bad('merge', titles.join(' | '));
  await ctx.close();
}

await browser.close();
console.log(problems.length ? `\n${problems.length} PROBLEM(S):\n` + problems.join('\n') : '\nAll checks passed.');
process.exit(problems.length ? 1 : 0);
