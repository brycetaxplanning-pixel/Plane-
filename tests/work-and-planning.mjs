import { chromium } from 'playwright';
const BASE = process.env.PLANE_URL ?? 'http://localhost:4173';
const problems = [];
const ok = (l) => console.log('  PASS ' + l);
const bad = (l, d) => { problems.push(`${l}: ${d}`); console.log('  FAIL ' + l + ' — ' + d); };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 440, height: 950 } });
const page = await ctx.newPage();
page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') problems.push('console: ' + m.text()); });
const read = () => page.evaluate(() => JSON.parse(localStorage.getItem('plane.state.v1') || '{}'));

await page.goto(BASE, { waitUntil: 'networkidle' });
const speech = await page.evaluate(() => 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window);
console.log(`\n(this browser reports speech recognition: ${speech})`);

console.log('\n1. Dictation degrades instead of breaking');
await page.goto(BASE + '#/notes', { waitUntil: 'networkidle' });
await page.getByRole('button', { name: /Talk a note/ }).click();
await page.waitForTimeout(300);
const talkBtn = await page.getByRole('button', { name: /Hold the thought/ }).count();
if (speech) {
  talkBtn > 0 ? ok('press-to-talk offered where speech is available') : bad('talk button', 'supported but missing');
} else {
  talkBtn === 0 ? ok('no talk button where speech is unavailable') : bad('talk button', 'offered anyway');
  (await page.getByText(/can't do speech recognition/).count()) > 0
    ? ok('says so plainly and still offers typing') : bad('fallback copy', 'missing');
}
// The same panel must always accept typing, whichever branch applied.
(await page.locator('.capture textarea').count()) > 0 ? ok('typing works either way') : bad('textarea', 'missing');
await page.locator('.capture textarea').fill('Idea for the tax content series');
await page.getByRole('button', { name: 'Save' }).click();
await page.waitForTimeout(400);
let s = await read();
(s.notes?.items ?? []).length === 1 ? ok('typed capture saves as a note') : bad('capture save', JSON.stringify(s.notes));
s.notes.items[0].title === 'Idea for the tax content series' ? ok('first sentence becomes the title') : bad('title', s.notes.items[0].title);

console.log('\n2. A list note keeps tickable items');
await page.getByRole('button', { name: 'Write one' }).click();
await page.locator('.modal-body').getByRole('button', { name: 'List', exact: true }).click();
await page.getByPlaceholder('What is this about').fill('To do');
await page.waitForTimeout(200);
const seeded = await page.locator('.modal-body').getByRole('button', { name: /^\+ / }).count();
seeded > 0 ? ok(`typing a known list title offers ${seeded} starter items`) : bad('list suggestions', 'none offered');
await page.locator('.modal-body').getByRole('button', { name: /Make an Instagram/ }).click();
await page.getByRole('button', { name: 'Save' }).click();
await page.waitForTimeout(400);
s = await read();
const list = s.notes.items.find((n) => n.kind === 'List');
list?.items?.length === 1 ? ok('list item stored') : bad('list items', JSON.stringify(list?.items));
await page.locator('.note', { hasText: 'To do' }).locator('input.checkbox').first().check();
await page.waitForTimeout(400);
((await read()).notes.items.find((n) => n.kind === 'List').items[0].done) ? ok('ticking an item persists') : bad('tick', 'not saved');

console.log('\n3. Suggestion chips fill a field before you type');
await page.goto(BASE + '#/planning', { waitUntil: 'networkidle' });
await page.getByRole('tab', { name: /Ideas/ }).click();
await page.getByRole('button', { name: 'Write one' }).click();
await page.waitForTimeout(200);
await page.locator('.modal-body').getByRole('button', { name: 'Clips channel for finance YouTubers' }).click();
await page.waitForTimeout(200);
(await page.getByPlaceholder('Clips channel for finance YouTubers').inputValue()) === 'Clips channel for finance YouTubers'
  ? ok('a suggestion chip fills the field') : bad('suggestion', 'field not filled');
await page.getByRole('button', { name: 'Save' }).click();
await page.waitForTimeout(400);
s = await read();
(s.planning?.ideas ?? []).length === 1 ? ok('idea saved') : bad('idea save', JSON.stringify(s.planning?.ideas));

console.log('\n4. Enlightenment fires once for a perfect week');
await page.evaluate(() => {
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const today = new Date();
  const shift = (today.getDay() + 6) % 7;
  const thisMon = new Date(today); thisMon.setDate(today.getDate() - shift);
  const lastMon = new Date(thisMon); lastMon.setDate(thisMon.getDate() - 7);
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(lastMon); d.setDate(lastMon.getDate() + i); return iso(d); });
  const created = iso(new Date(lastMon.getTime() - 30 * 86400000));
  const st = JSON.parse(localStorage.getItem('plane.state.v1'));
  st.habits.items = [
    { id: 'h1', title: 'Stretch', emoji: '🧘', cadence: 'daily', kind: 'check', createdAt: created },
    { id: 'h2', title: 'Spar', emoji: '🥊', cadence: 'weekly', kind: 'check', timesPerWeek: 1, createdAt: created },
  ];
  st.habits.logs = [
    ...days.map((d, i) => ({ id: `l${i}`, habitId: 'h1', date: d, met: true })),
    { id: 'lw', habitId: 'h2', date: days[2], met: true },
  ];
  st.awards = { enlightened: [], acknowledged: [] };
  localStorage.setItem('plane.state.v1', JSON.stringify(st));
});
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(700);
(await page.getByText('Enlightenment reached').count()) > 0 ? ok('the popup fires for a perfect week') : bad('popup', 'did not appear');
await page.getByRole('button', { name: 'Keep it going' }).click();
await page.waitForTimeout(400);
(await page.locator('.enl-badge').count()) > 0 ? ok('badge is worn afterwards') : bad('badge', 'not shown');
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(700);
(await page.getByText('Enlightenment reached').count()) === 0 ? ok('it does not fire again on the next load') : bad('popup repeat', 'fired twice');

console.log('\n5. An imperfect week earns nothing');
await page.evaluate(() => {
  const st = JSON.parse(localStorage.getItem('plane.state.v1'));
  st.habits.logs = st.habits.logs.filter((l) => l.habitId !== 'h2');
  st.awards = { enlightened: [], acknowledged: [] };
  localStorage.setItem('plane.state.v1', JSON.stringify(st));
});
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(600);
(await page.getByText('Enlightenment reached').count()) === 0 ? ok('one missed weekly habit blocks the award') : bad('award', 'granted anyway');

console.log('\n6. The coach prices a spend against budget headroom');
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
await page.waitForTimeout(300);
await page.getByRole('button', { name: "I'm thinking about getting a massage" }).click();
await page.waitForTimeout(2500);
if (!sent) bad('coach request', 'nothing sent');
else {
  /CROSS-REFERENCE BEFORE YOU AGREE/.test(sent.system) ? ok('the cross-reference instruction is in the prompt') : bad('prompt', 'instruction missing');
  /Headroom left this month/.test(sent.system) ? ok('budget headroom is in the prompt') : bad('prompt', 'headroom missing');
  /MODULE 7 — Goals \(what money competes with\)/.test(sent.system) ? ok('goals are framed as what money competes with') : bad('prompt', 'goals framing missing');
  /MODULE 8 — Notes/.test(sent.system) ? ok('recent notes are in the prompt') : bad('prompt', 'notes missing');
}

await browser.close();
console.log(problems.length ? `\n${problems.length} PROBLEM(S):\n` + problems.join('\n') : '\nAll checks passed.');
process.exit(problems.length ? 1 : 0);
