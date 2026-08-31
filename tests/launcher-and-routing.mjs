import { chromium } from 'playwright';
const BASE = process.env.PLANE_URL ?? 'http://localhost:4173';
const problems = [];
const ok = (l) => console.log('  PASS ' + l);
const bad = (l, d) => { problems.push(`${l}: ${d}`); console.log('  FAIL ' + l + ' — ' + d); };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 430, height: 950 } });
const page = await ctx.newPage();
page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') problems.push('console: ' + m.text()); });
const read = () => page.evaluate(() => JSON.parse(localStorage.getItem('plane.state.v1') || '{}'));

console.log('\n1. Launcher is the root and drills into a module');
await page.goto(BASE, { waitUntil: 'networkidle' });
const moduleTiles = await page.locator('.mtile:not(.mtile-alt)').count();
const allTiles = await page.locator('.mtile').count();
moduleTiles === 11 && allTiles === 14 ? ok('eleven module buttons plus Tracker, Progress and Settings') : bad('launcher tiles', `${moduleTiles} modules / ${allTiles} total`);
await page.locator('.mtile', { hasText: 'Habits' }).click();
await page.waitForTimeout(400);
(await page.getByRole('heading', { name: 'Habits' }).count()) > 0 ? ok('pressing a tile opens the module') : bad('drill in', 'Habits heading not found');
(await page.locator('.backlink').count()) > 0 ? ok('a way back to the launcher exists') : bad('back link', 'missing');

console.log('\n2. Habit creation and the check kind');
await page.getByRole('button', { name: '+ Add your first habit' }).click();
await page.getByPlaceholder('Stretch').fill('Cold shower');
await page.getByRole('button', { name: 'Save' }).click();
await page.waitForTimeout(400);
let s = await read();
(s.habits?.items ?? []).length === 1 ? ok('habit saved') : bad('habit saved', JSON.stringify(s.habits));
(await page.getByText('Not started').count()) > 0 ? ok('a brand-new habit reads "Not started", not "missed"') : bad('new status', 'wrong label');
await page.getByRole('button', { name: 'Done', exact: true }).click();
await page.waitForTimeout(400);
s = await read();
(s.habits?.logs ?? []).length === 1 && s.habits.logs[0].met ? ok('logging marks it met') : bad('log', JSON.stringify(s.habits?.logs));
(await page.getByText('Done today').count()) > 0 ? ok('status flips to done') : bad('status', 'still not done');
const xp1 = (s.xp ?? []).reduce((n, e) => n + e.amount, 0);
xp1 === 6 ? ok('XP awarded for the habit') : bad('habit XP', `got ${xp1}`);

console.log('\n3. An amount habit only counts when it clears the target');
await page.getByRole('button', { name: '+ Add a habit' }).click();
await page.getByPlaceholder('Stretch').fill('Protein');
await page.getByRole('button', { name: 'Hit a number' }).click();
await page.getByPlaceholder('180').fill('180');
await page.getByRole('button', { name: 'Save' }).click();
await page.waitForTimeout(400);
await page.locator('.habit', { hasText: 'Protein' }).getByRole('button', { name: 'Done' }).click();
await page.locator('.modal-body input[type="number"]').fill('120');
await page.getByRole('button', { name: 'Log it' }).click();
await page.waitForTimeout(400);
s = await read();
const short = s.habits.logs.find((l) => l.amount === 120);
short && short.met === false ? ok('120g against a 180g target is logged but not met') : bad('amount target', JSON.stringify(short));

console.log('\n4. A bed-time habit treats after-midnight as the night before');
await page.getByRole('button', { name: '+ Add a habit' }).click();
await page.getByPlaceholder('Stretch').fill('Bed by 11:30');
await page.getByRole('button', { name: 'By a time' }).click();
await page.locator('.modal-body input[type="time"]').fill('23:30');
await page.getByRole('button', { name: 'Save' }).click();
await page.waitForTimeout(400);
await page.locator('.habit', { hasText: 'Bed by 11:30' }).getByRole('button', { name: 'Done' }).click();
await page.locator('.modal-body input[type="time"]').fill('00:20');
await page.getByRole('button', { name: 'Log it' }).click();
await page.waitForTimeout(400);
s = await read();
const bed = s.habits.logs.find((l) => l.time === '00:20');
bed && bed.met === false ? ok('00:20 misses an 11:30 target rather than passing as "early"') : bad('bedtime wrap', JSON.stringify(bed));

console.log('\n5. Tone changes the wording');
await page.getByRole('button', { name: 'Drill sergeant' }).click();
await page.waitForTimeout(300);
(await read()).habits.tone === 'drill' ? ok('tone persisted') : bad('tone', 'not saved');

console.log('\n6. Goals: a purchase goal renders the three lines');
await page.goto(BASE + '#/goals', { waitUntil: 'networkidle' });
await page.getByRole('button', { name: '+ Add your first goal' }).click();
await page.getByPlaceholder('Own a used Tesla').fill('Own a used Tesla');
await page.getByPlaceholder('24000').first().fill('24000');
await page.getByPlaceholder('400', { exact: true }).fill('400');
await page.getByPlaceholder('Make $400 more a month').fill('Make $400 more a month');
await page.getByPlaceholder('6500').fill('6500');
await page.getByPlaceholder('24000').nth(1).fill('24000');
await page.getByRole('button', { name: 'Save' }).click();
await page.waitForTimeout(500);
const card = await page.locator('.goal').first().innerText();
/Own a used Tesla/.test(card) ? ok('title on the card') : bad('title', card.slice(0, 80));
/\$24,000 cash/.test(card) && /\$400\/mo/.test(card) ? ok('cost line shows cash and monthly') : bad('cost line', card.replace(/\n/g, ' | '));
/Make \$400 more a month/.test(card) ? ok('plan line shows how to get there') : bad('plan line', card.replace(/\n/g, ' | '));
/\$6,500 of \$24,000/.test(card) ? ok('progress reads in currency') : bad('progress', card.replace(/\n/g, ' | '));

console.log('\n7. Finishing a goal awards XP and moves it to Done');
const before = (await read()).xp.reduce((n, e) => n + e.amount, 0);
await page.locator('.goal').first().getByRole('button', { name: 'Done' }).click();
await page.waitForTimeout(500);
s = await read();
s.goals.items[0].done ? ok('goal marked done') : bad('goal done', 'still open');
s.xp.reduce((n, e) => n + e.amount, 0) - before === 120 ? ok('120 XP for finishing a goal') : bad('goal XP', `${s.xp.reduce((n, e) => n + e.amount, 0) - before}`);

console.log('\n8. Legacy save with goals under coach still loads');
await page.evaluate(() => localStorage.setItem('plane.state.v1', JSON.stringify({
  version: 1,
  coach: { goals: [{ id: 'g1', title: 'Old goal', done: false, createdAt: '2026-01-01', target: 'do the thing' }], checkIns: [], chat: [] },
})));
await page.goto(BASE + '#/goals', { waitUntil: 'networkidle' });
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(500);
(await page.getByText('Old goal').count()) > 0 ? ok('a goal saved under the old shape is lifted into the new module') : bad('migration', 'goal lost');
const migrated = await read();
migrated.goals.items[0]?.plan === 'do the thing' ? ok('its target text becomes the plan line') : bad('migration field', JSON.stringify(migrated.goals.items[0]));

await browser.close();
console.log(problems.length ? `\n${problems.length} PROBLEM(S):\n` + problems.join('\n') : '\nAll checks passed.');
process.exit(problems.length ? 1 : 0);
