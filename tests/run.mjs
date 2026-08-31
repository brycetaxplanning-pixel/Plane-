/**
 * Runs every suite in this directory against a freshly built copy of the app.
 *
 * These are end-to-end checks driven through the real UI: they click the actual
 * buttons, read the actual localStorage, and pull the network out from under
 * the app to see what it does. There is no unit-test layer under them because
 * the things worth protecting here are behaviours, not functions — that an
 * import cannot double a month, that a failed write is visible, that a schedule
 * uploads timestamps and nothing else.
 *
 *   npm test                  every suite
 *   npm test health backups   just the ones whose names match
 */

import { readdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const HERE = new URL('.', import.meta.url).pathname;
const PORT = Number(process.env.PLANE_PORT ?? 4173);
const BASE = `http://localhost:${PORT}`;

const run = (cmd, args, opts = {}) =>
  spawn(cmd, args, { stdio: 'pipe', cwd: `${HERE}..`, ...opts });

async function waitForServer(url, seconds = 40) {
  for (let i = 0; i < seconds * 4; i += 1) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch {
      // not up yet
    }
    await sleep(250);
  }
  return false;
}

const filters = process.argv.slice(2);
const suites = (await readdir(HERE))
  .filter((f) => f.endsWith('.mjs') && f !== 'run.mjs')
  .filter((f) => filters.length === 0 || filters.some((q) => f.includes(q)))
  .sort();

if (suites.length === 0) {
  console.error(filters.length ? `No suite matches ${filters.join(', ')}` : 'No suites found');
  process.exit(1);
}

// A preview of the production build, because the service worker only registers
// in a production build and three suites depend on it.
console.log(`Starting the preview server on ${PORT}…`);
const server = run('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort']);
const stop = () => { try { server.kill('SIGTERM'); } catch { /* already gone */ } };
process.on('exit', stop);
process.on('SIGINT', () => { stop(); process.exit(130); });

if (!(await waitForServer(BASE))) {
  console.error('The preview server never came up. Has `npm run build` been run?');
  stop();
  process.exit(1);
}

const failed = [];
const started = Date.now();

for (const suite of suites) {
  const name = suite.replace(/\.mjs$/, '');
  process.stdout.write(`\n── ${name}\n`);

  const code = await new Promise((resolve) => {
    const child = run('node', [`${HERE}${suite}`], {
      stdio: 'inherit',
      env: { ...process.env, PLANE_URL: BASE },
    });
    // Generous: the offline and large-import suites do real work.
    const killer = setTimeout(() => { child.kill('SIGKILL'); resolve(124); }, 300_000);
    child.on('exit', (c) => { clearTimeout(killer); resolve(c ?? 1); });
  });

  if (code !== 0) failed.push(`${name}${code === 124 ? ' (timed out)' : ''}`);
}

stop();

const mins = ((Date.now() - started) / 60_000).toFixed(1);
console.log(`\n${'─'.repeat(40)}`);
if (failed.length === 0) {
  console.log(`All ${suites.length} suites passed in ${mins} min.`);
} else {
  console.log(`${failed.length} of ${suites.length} suites failed in ${mins} min:`);
  for (const f of failed) console.log(`  - ${f}`);
}
process.exit(failed.length ? 1 : 0);
