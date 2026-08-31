import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
const BASE = process.env.PLANE_URL ?? 'http://localhost:4173';
const FIX = new URL('./fixtures/', import.meta.url).pathname;
const problems = [];
const ok = (l) => console.log('  PASS ' + l);
const bad = (l, d) => { problems.push(`${l}: ${d}`); console.log('  FAIL ' + l + ' — ' + d); };

const browser = await chromium.launch();
async function open() {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 950 }, acceptDownloads: true });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') problems.push('console: ' + m.text()); });
  await page.goto(BASE + '#/goals', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  const pop = page.locator('.pop button[aria-label="Close"]').first();
  if (await pop.count()) await pop.click().catch(() => {});
  return { ctx, page };
}
const read = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('plane.state.v1') || '{}'));
const images = (page) => page.evaluate(() => new Promise((resolve) => {
  const req = indexedDB.open('plane-images', 1);
  req.onsuccess = () => {
    const db = req.result;
    if (!db.objectStoreNames.contains('images')) return resolve([]);
    const all = db.transaction('images', 'readonly').objectStore('images').getAll();
    all.onsuccess = () => resolve(all.result);
    all.onerror = () => resolve([]);
  };
  req.onerror = () => resolve([]);
}));

async function addGoalWithPhoto(page, title) {
  await page.getByRole('button', { name: /Add (your first goal|a goal)|\+ Goal/ }).first().click();
  const form = page.getByRole('dialog');
  await form.getByLabel('What is it').fill(title).catch(async () => {
    await form.locator('input.input').first().fill(title);
  });
  await form.locator('input[type=file]').setInputFiles(`${FIX}photo.png`);
  await page.waitForTimeout(700);
  await form.getByRole('button', { name: /^Save/ }).click();
  await page.waitForTimeout(700);
}

console.log('\n1. A photo goes to IndexedDB, not into the state blob');
{
  const { ctx, page } = await open();
  await addGoalWithPhoto(page, 'Used Tesla');
  const st = await read(page);
  const goal = st.goals.items.find((g) => g.title === 'Used Tesla');
  goal ? ok('the goal is stored') : bad('goal', 'not stored');
  goal?.imageId ? ok('with a reference to its photo') : bad('imageId', JSON.stringify(goal));
  !goal?.image ? ok('and no data URL in the state') : bad('inline', `${String(goal.image).length} chars inline`);

  const imgs = await images(page);
  imgs.length === 1 && imgs[0].id === goal.imageId
    ? ok(`the photo is in the image store (${Math.round(imgs[0].bytes / 1024)} kB)`) : bad('idb', JSON.stringify(imgs.map((i) => i.id)));
  const blob = JSON.stringify(st);
  !/data:image/.test(blob) ? ok('the whole state blob is free of image data') : bad('blob', 'a data URL is still in there');
  await ctx.close();
}

console.log('\n2. The card still shows the photo');
{
  const { ctx, page } = await open();
  await addGoalWithPhoto(page, 'Used Tesla');
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  const img = page.locator('.goal-cover img').first();
  (await img.count()) === 1 ? ok('an image renders on the card after a reload') : bad('render', 'no img element');
  const src = await img.getAttribute('src');
  /^data:image/.test(src ?? '') ? ok('resolved out of the store') : bad('src', String(src).slice(0, 60));
  await ctx.close();
}

console.log('\n3. A backup is still one self-contained file');
{
  const { ctx, page } = await open();
  await addGoalWithPhoto(page, 'Used Tesla');
  await page.goto(BASE + '#/settings', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  const download = page.waitForEvent('download');
  await page.locator('section.card').filter({ hasText: 'Backups' }).first()
    .getByRole('button', { name: 'Download a backup' }).click();
  const file = await download;
  const text = await readFile(await file.path(), 'utf8');
  const parsed = JSON.parse(text);
  const goal = parsed.goals.items.find((g) => g.title === 'Used Tesla');
  /^data:image/.test(goal?.image ?? '')
    ? ok('the photo is inlined into the backup') : bad('export', 'the photo is missing from the file');
  await ctx.close();
}

console.log('\n4. Erase and re-import brings the photo back');
{
  const { ctx, page } = await open();
  await addGoalWithPhoto(page, 'Used Tesla');
  await page.goto(BASE + '#/settings', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  const download = page.waitForEvent('download');
  await page.locator('section.card').filter({ hasText: 'Backups' }).first()
    .getByRole('button', { name: 'Download a backup' }).click();
  const path = await (await download).path();

  await page.evaluate(() => new Promise((resolve) => {
    localStorage.clear();
    const req = indexedDB.deleteDatabase('plane-images');
    req.onsuccess = req.onerror = req.onblocked = () => resolve(null);
  }));
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  (await read(page)).goals?.items?.length ? bad('erase', 'data survived the wipe') : ok('everything is wiped');

  await page.goto(BASE + '#/settings', { waitUntil: 'networkidle' });
  await page.locator('input[type=file][accept*="json"]').setInputFiles(path);
  await page.waitForTimeout(1500);

  const st = await read(page);
  const goal = st.goals.items.find((g) => g.title === 'Used Tesla');
  goal ? ok('the goal comes back') : bad('import', 'goal missing');
  goal?.imageId && !goal.image
    ? ok('and its photo is put back into the store, not left inline') : bad('absorb', JSON.stringify({ id: goal?.imageId, inline: Boolean(goal?.image) }));
  const imgs = await images(page);
  imgs.some((i) => i.id === goal.imageId) ? ok('the image store has it') : bad('idb', JSON.stringify(imgs.map((i) => i.id)));

  await page.goto(BASE + '#/goals', { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  (await page.locator('.goal-cover img').count()) >= 1
    ? ok('and the card shows the picture again') : bad('render', 'no image after import');
  await ctx.close();
}

console.log('\n5. An older save with inline photos is lifted on load');
{
  const { ctx, page } = await open();
  const dataUrl = 'data:image/png;base64,' + (await readFile(`${FIX}photo.png`)).toString('base64');
  await page.evaluate((img) => {
    const s = JSON.parse(localStorage.getItem('plane.state.v1') || '{}');
    s.goals = { items: [{ id: 'g_old', title: 'From an old save', kind: 'Purchase', emoji: '🚗', image: img, done: false, createdAt: '2026-01-01' }] };
    localStorage.setItem('plane.state.v1', JSON.stringify(s));
  }, dataUrl);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  const st = await read(page);
  const goal = st.goals.items.find((g) => g.id === 'g_old');
  goal?.imageId ? ok('the old inline photo gets an id') : bad('lift', JSON.stringify({ id: goal?.imageId }));
  !goal?.image ? ok('and is cleared out of the state') : bad('still inline', 'the data URL is still there');
  (await images(page)).some((i) => i.id === goal.imageId) ? ok('having been written to the store') : bad('idb', 'not written');
  (await page.locator('.goal-cover img').count()) >= 1 ? ok('and it still shows') : bad('render', 'lost the picture');
  await ctx.close();
}

console.log('\n6. Removing the photo, and deleting the goal, clean up after themselves');
{
  const { ctx, page } = await open();
  await addGoalWithPhoto(page, 'Used Tesla');
  let imgs = await images(page);
  const before = imgs.length;

  await page.locator('.goal-cover').first().click();
  let form = page.getByRole('dialog');
  await form.getByRole('button', { name: 'Remove' }).click();
  await form.getByRole('button', { name: /^Save/ }).click();
  await page.waitForTimeout(900);
  imgs = await images(page);
  imgs.length === before - 1 ? ok('removing the photo deletes it from the store') : bad('remove', `${imgs.length} left`);
  const st = await read(page);
  !st.goals.items[0].imageId ? ok('and the reference goes with it') : bad('ref', 'still referenced');

  await addGoalWithPhoto(page, 'Another one');
  await page.locator('.goal', { hasText: 'Another one' }).locator('.goal-cover').click();
  form = page.getByRole('dialog');
  await form.getByRole('button', { name: 'Delete' }).click();
  await page.waitForTimeout(900);
  (await images(page)).length === 0 ? ok('deleting the goal takes its photo too') : bad('delete', 'orphaned');
  await ctx.close();
}

await browser.close();
console.log(problems.length ? `\n${problems.length} PROBLEM(S):\n` + problems.join('\n') : '\nAll checks passed.');
process.exit(problems.length ? 1 : 0);
