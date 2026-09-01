import { chromium } from 'playwright';
const BASE = process.env.PLANE_URL ?? 'http://localhost:4173';
const problems = [];
const ok = (label) => console.log('  PASS ' + label);
const bad = (label, detail) => { problems.push(`${label}: ${detail}`); console.log('  FAIL ' + label + ' — ' + detail); };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
const page = await ctx.newPage();
page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') problems.push('console: ' + m.text()); });

const readState = () => page.evaluate(() => JSON.parse(localStorage.getItem('plane.state.v1') || '{}'));

console.log('\n1. Outreach logging + XP');
await page.goto(BASE + '#/planning', { waitUntil: 'networkidle' });
await page.getByRole('button', { name: '+ Log outreach' }).click();
await page.getByPlaceholder('Name or business').fill('Test Prospect');
await page.getByRole('button', { name: 'LinkedIn', exact: true }).click();
await page.getByRole('button', { name: 'Meeting booked', exact: true }).click();
await page.getByRole('button', { name: 'Log it' }).click();
await page.waitForTimeout(500);
let s = await readState();
const out = s.planning?.outreach ?? [];
out.length === 1 && out[0].name === 'Test Prospect' && out[0].outcome === 'Meeting booked'
  ? ok('outreach persisted with channel + outcome') : bad('outreach persisted', JSON.stringify(out));
const xp = (s.xp ?? []).reduce((n, e) => n + e.amount, 0);
xp === 33 ? ok('XP = 8 base + 25 meeting bonus') : bad('XP award', `got ${xp}, expected 33`);
(await page.getByText('Meeting booked').count()) > 0 ? ok('entry shows in the week table') : bad('week table', 'entry not rendered');

console.log('\n2. Fitness session + quota maths');
await page.goto(BASE + '#/fitness', { waitUntil: 'networkidle' });
await page.getByRole('button', { name: '+ Log a session' }).click();
await page.getByRole('button', { name: 'Jiu-jitsu', exact: true }).click();
await page.getByRole('button', { name: 'Log it' }).click();
await page.waitForTimeout(500);
s = await readState();
(s.fitness?.activities ?? []).length === 1 ? ok('activity persisted') : bad('activity persisted', 'none stored');
// Jiu-jitsu buckets to mma, which the row's own label states.
const row = await page.locator('.rowitem', { hasText: 'Jiu-jitsu' }).first().innerText();
/MMA/.test(row) ? ok('Jiu-jitsu is bucketed as MMA, not "other"') : bad('MMA bucket', row.replace(/\n/g, ' | '));

console.log('\n3. Transaction rules + the review queue');
await page.goto(BASE + '#/finance', { waitUntil: 'networkidle' });
await page.getByRole('tab', { name: 'Rules' }).click();
await page.getByRole('button', { name: 'Add starter set' }).click();
await page.waitForTimeout(300);
await page.getByRole('tab', { name: 'Transactions' }).click();
await page.getByRole('button', { name: '+ Add' }).click();
await page.getByPlaceholder('Amazon').fill('AMAZON MKTPL 7F3');
await page.getByPlaceholder('110.00').fill('110');
await page.getByRole('button', { name: 'Add', exact: true }).click();
await page.waitForTimeout(400);
s = await readState();
const tx = (s.finance?.transactions ?? [])[0];
tx && tx.category === 'Shopping' && tx.reviewed === false
  ? ok('Amazon matched a rule but stayed unreviewed (always-ask)') : bad('always-ask rule', JSON.stringify(tx));

console.log('\n4. Splitting a charge into line items');
await page.getByRole('tab', { name: /^Review/ }).click();
await page.getByRole('button', { name: /AMAZON MKTPL 7F3/ }).click();
await page.getByRole('button', { name: '+ Add line' }).click();
await page.waitForTimeout(200);
const amounts = page.locator('.modal-body input[type="number"]');
await amounts.nth(0).fill('40');
await amounts.nth(1).fill('70');
await page.waitForTimeout(200);
(await page.getByText('Adds up').count()) > 0 ? ok('split remainder reconciles to zero') : bad('remainder', 'did not read "Adds up"');
const selects = page.locator('.modal-body select');
await selects.nth(0).selectOption('Entertainment');
await selects.nth(1).selectOption('Fitness');
await page.getByRole('button', { name: 'Save' }).click();
await page.waitForTimeout(500);
s = await readState();
const split = (s.finance?.transactions ?? [])[0];
split?.splits?.length === 2 && split.reviewed && split.splits[0].amount === 40 && split.splits[1].amount === 70
  ? ok('$110 stored as $40 + $70 across two categories') : bad('splits', JSON.stringify(split?.splits));

console.log('\n5. Split amounts land in the right budget categories');
await page.getByRole('tab', { name: 'Overview' }).click();
await page.waitForTimeout(400);
const body = await page.locator('.card').filter({ hasText: 'Where the money went' }).innerText();
/Entertainment[\s\S]*?\$40/.test(body) && /Fitness[\s\S]*?\$70/.test(body)
  ? ok('category totals reflect the split, not the raw charge') : bad('category rollup', body.replace(/\n+/g, ' | ').slice(0, 220));

console.log('\n6. Vendor question');
await page.getByPlaceholder('meat, amazon, doordash…').fill('amazon');
await page.waitForTimeout(300);
(await page.getByText('$110').count()) > 0 ? ok('"amazon" totals $110 this month') : bad('vendor query', 'no total shown');

console.log('\n7. Export / import round trip');
await page.goto(BASE + '#/settings', { waitUntil: 'networkidle' });
const before = JSON.stringify(await readState());
const dl = page.waitForEvent('download');
await page.getByRole('button', { name: 'Export JSON' }).click();
const file = await dl;
const path = await file.path();
const exported = await (await import('node:fs/promises')).readFile(path, 'utf8');
JSON.parse(exported).finance.transactions.length === 1 ? ok('export contains the data') : bad('export', 'transaction missing');
await page.getByRole('button', { name: 'Erase everything' }).click();
await page.getByRole('button', { name: 'Erase', exact: true }).click();
await page.waitForTimeout(400);
((await readState()).finance?.transactions ?? []).length === 0 ? ok('erase clears the data') : bad('erase', 'data survived');
await page.setInputFiles('input[type="file"][accept*="json"]', { name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(exported) });
await page.waitForTimeout(600);
JSON.stringify(await readState()) === before ? ok('import restores byte-identical state') : bad('import', 'restored state differs');

console.log('\n8. Reload persistence');
await page.goto(BASE + '#/planning', { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
(await page.getByText('Test Prospect').count()) > 0 ? ok('data survives a full reload') : bad('persistence', 'entry gone after reload');

console.log('\n9. Migration of an old payload');
await page.evaluate(() => localStorage.setItem('plane.state.v1', JSON.stringify({ version: 0, planning: { outreach: [] } })));
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(400);
const migrated = await readState();
// The point is that a missing slice is filled in with the shape it should
// have, not that the number happens to be any particular value — the weekly
// training target now starts unset, because it is yours to choose.
typeof migrated.fitness?.targets?.total === 'number' && migrated.finance?.categories?.length > 0
  ? ok('a partial legacy payload is filled in, not crashed on') : bad('migration', JSON.stringify(migrated).slice(0, 160));

await browser.close();
console.log(problems.length ? `\n${problems.length} PROBLEM(S):\n` + problems.join('\n') : '\nAll checks passed.');
process.exit(problems.length ? 1 : 0);
