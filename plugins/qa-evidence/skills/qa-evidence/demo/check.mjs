#!/usr/bin/env node
// Self-check: runs both drivers against demo/app.html in a throwaway headless
// Chrome and asserts the verdicts they exist to produce. Exit 0 = all held.
//   node demo/check.mjs            (CHROME=/path/to/chrome to override)
// Touches no other browser: own profile in a temp dir, own port.
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const HERE = dirname(fileURLToPath(import.meta.url));
const TOOLS = join(HERE, '..', 'tools');
const CHROME = process.env.CHROME || [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
].find(existsSync);
if (!CHROME) { console.error('no Chrome found, set CHROME=/path/to/chrome'); process.exit(2); }

const PORT = 9300 + Math.floor(Math.random() * 500);
const profile = mkdtempSync(join(tmpdir(), 'qa-evidence-check-'));
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  '--no-first-run', '--allow-file-access-from-files', 'about:blank'], { stdio: 'ignore' });
chrome.unref();
const cleanup = () => { chrome.kill('SIGKILL'); rmSync(profile, { recursive: true, force: true }); };
process.on('exit', cleanup);

for (let i = 0; i < 50; i++) {
  try { await fetch(`http://127.0.0.1:${PORT}/json/version`); break; }
  catch { await new Promise(r => setTimeout(r, 200)); }
}

const run = (...args) => {
  const r = spawnSync(process.execPath, args, { cwd: join(HERE, '..'), env: { ...process.env, CDP_PORT: String(PORT) }, encoding: 'utf8' });
  process.stderr.write(r.stderr || ''); process.stdout.write(r.stdout || '');
  return r.status;
};

// sweep: probed cells on the real page, invalid cells on the wrong-id page
assert.equal(run(join(TOOLS, 'sweep.mjs'), 'demo/sweep.config.mjs', 'demo/out/sweep.json'), 0);
const { cells } = JSON.parse(readFileSync(join(HERE, 'out/sweep.json'), 'utf8'));
assert.equal(cells['projects@free'].status, 'ok');
assert.equal(cells['projects@pro'].probe.exportButton, true, 'pro shows Export');
assert.equal(cells['projects@free'].probe.exportButton, false, 'free does not');
assert.equal(cells['projects@free'].probe.renderedRows, 5, 'settled past the skeleton');
assert.equal(cells['projects@free'].probe.emptyTextPresent, true, 'the invisible empty state is in innerText');
assert.equal(cells['projects@free'].probe.emptyTextVisible, false, 'and it is not visible');
assert.notEqual(cells['broken@free'].status, 'ok', 'wrong page is not a measurement');

// shots: one job per status
assert.equal(run(join(TOOLS, 'shots.mjs'), 'demo/jobs.mjs'), 1, 'shots exits 1 when any job is not OK');
const report = Object.fromEntries(JSON.parse(readFileSync(join(HERE, 'out/shots-report.json'), 'utf8')).map(r => [r.file, r.status]));
assert.deepEqual(report, { 'split-boxes.png': 'OFFSCREEN', 'table-pro.png': 'OK', 'tooltip.png': 'OK', 'wrong-id.png': 'MISS' });

// review page builds from the demo findings
assert.equal(run(join(TOOLS, 'review.mjs'), 'demo/findings.json', '-o', 'demo/out/review.html'), 0);
console.log('\ncheck: all verdicts held');
process.exit(0);
