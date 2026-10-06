// End-to-End-Test im echten Browser (puppeteer-core + lokal installiertes Chrome/Edge/Chromium).
// Startet einen eigenen Server mit temporärer Datenbank, setzt `npm run build` voraus.
//
//   npm run build && npm run test:e2e
//   CHROME_PATH=/pfad/zu/chrome npm run test:e2e
//   E2E_SCREENSHOTS=./shots npm run test:e2e     # Screenshots (Tablet, Telefon, hell/dunkel)

import puppeteer from 'puppeteer-core';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from '../server/app.js';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const shotsDir = process.env.E2E_SCREENSHOTS && resolve(process.env.E2E_SCREENSHOTS);

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean);

const executablePath = CHROME_CANDIDATES.find((p) => existsSync(p));
if (!executablePath) {
  console.error('Kein Chrome/Chromium gefunden. Pfad per CHROME_PATH angeben.');
  process.exit(1);
}
if (!existsSync(join(root, 'dist', 'index.html'))) {
  console.error('dist/ fehlt – zuerst `npm run build` ausführen.');
  process.exit(1);
}

const tmp = mkdtempSync(join(tmpdir(), 'dph-e2e-'));
const app = await buildApp({ dbFile: join(tmp, 'drums.db'), staticDir: join(root, 'dist') });
await app.listen({ port: 0, host: '127.0.0.1' });
const BASE = `http://127.0.0.1:${app.server.address().port}/`;

const results = [];
const errors = [];
const check = (name, ok, detail = '') => results.push({ name, ok, detail });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = async (page, name) => {
  if (!shotsDir) return;
  mkdirSync(shotsDir, { recursive: true });
  await page.screenshot({ path: join(shotsDir, `${name}.png`) });
};
const setRange = (page, selector, value) =>
  page.$eval(
    selector,
    (el, v) => {
      el.value = String(v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    },
    value,
  );

const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  // Auf Linux-CI-Runnern steht die Chrome-Sandbox (User Namespaces) nicht immer zur Verfügung.
  args: ['--autoplay-policy=no-user-gesture-required', ...(process.env.CI ? ['--no-sandbox'] : [])],
});

try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`));
  page.on('dialog', (d) => d.accept());
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
  await page.setViewport({ width: 1180, height: 820, hasTouch: true });

  // Oszillator-Starts mitschneiden, um das Timing zu prüfen.
  // (AudioBufferSourceNode hat ein eigenes start() und wird hier nicht erfasst.)
  await page.evaluateOnNewDocument(() => {
    window.__starts = [];
    const orig = AudioScheduledSourceNode.prototype.start;
    AudioScheduledSourceNode.prototype.start = function (when = 0, ...rest) {
      window.__starts.push(when);
      return orig.call(this, when, ...rest);
    };
  });

  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await page.waitForSelector('.pattern-item');
  await shot(page, 'tablet-dark');

  // „Beat 1“ (Demo-Pattern, 130 BPM) auswählen
  await (await page.$$('.pattern-item'))[2].click();
  check('Pattern-Auswahl', (await page.$eval('.name-input', (e) => e.value)) === 'Beat 1');

  await page.click('.l-snare .beat[data-b="0"] .slot');
  check(
    'Platzhalter setzt Schlag',
    (await page.$eval('.l-snare .beat[data-b="0"] .slot', (e) => e.getAttribute('aria-pressed'))) === 'true',
  );

  const kickBeat2 = (await page.$$('.editor-grid .l-kick .beat--editor'))[1];
  await (await kickBeat2.$$('.stepper-btn'))[1].click();
  const kickSlots = await page.$$eval('.layer-grid .l-kick .beat[data-b="1"] .slot', (els) => els.length);
  check('Editor ändert Platzhalter (2 → 3)', kickSlots === 3, `${kickSlots} Slots`);

  await setRange(page, '.tempo-slider', 96);
  const listBpm = await page.$$eval('.pattern-item-bpm', (els) => els[2].textContent);
  check('Tempo-Slider aktualisiert Liste', listBpm.startsWith('96'), listBpm);

  await sleep(900); // Speichern ist entprellt (350 ms)
  const saved = await page.evaluate(async () =>
    (await (await fetch('/api/patterns')).json()).find((p) => p.name === 'Beat 1'),
  );
  const layer = (key) => saved.layers.find((l) => l.key === key);
  check('Gespeichert: Tempo', saved.bpm === 96, String(saved.bpm));
  check('Gespeichert: Schlag', layer('snare').hits[0][0] === 1);
  check('Gespeichert: Unterteilung', layer('kick').subdivisions[1] === 3, JSON.stringify(layer('kick').subdivisions));
  check('Status „Gespeichert“', (await page.$eval('.save-status', (e) => e.textContent)) === 'Gespeichert');

  await page.evaluate(() => (window.__starts = []));
  await page.click('.play-btn');
  await sleep(1600);
  const lcd = await page.$eval('.lcd-value', (e) => e.textContent);
  check('Playhead sichtbar', (await page.$eval('.playhead', (e) => e.style.opacity)) === '1');
  check('Aktuelle Zählzeit markiert', (await page.$$('.ruler-beat.is-now')).length === 1);
  await shot(page, 'tablet-playing');

  // Alle Starts müssen auf dem gemeinsamen Raster (Achtel + Triolen → 1/6 Beat) liegen.
  const starts = await page.evaluate(() => window.__starts);
  const unit = 60 / 96 / 6;
  const t0 = Math.min(...starts);
  const off = starts.filter((t) => {
    const x = (t - t0) / unit;
    return Math.abs(x - Math.round(x)) > 0.01;
  });
  check('Audio-Timing auf Raster', starts.length > 5 && off.length === 0, `${starts.length} Starts, ${off.length} daneben`);

  await setRange(page, '.tempo-slider', 180);
  await sleep(800);
  const lcd2 = await page.$eval('.lcd-value', (e) => e.textContent);
  check('Wiedergabe läuft nach Tempowechsel', lcd2 !== lcd, `${lcd} → ${lcd2}`);

  await page.keyboard.press('Space');
  await sleep(200);
  check('Leertaste stoppt', (await page.$eval('.play-btn', (e) => e.textContent)).includes('Abspielen'));

  await (await page.$$('.header-row--controls .stepper .stepper-btn'))[1].click();
  check('Taktart 5/4', (await page.$$('.ruler-beat')).length === 5);

  const before = (await page.$$('.pattern-item')).length;
  await page.click('.list-head .btn');
  await sleep(300);
  check('Neues Pattern', (await page.$$('.pattern-item')).length === before + 1);
  await page.click('.icon-btn--danger');
  await sleep(300);
  check('Pattern löschen', (await page.$$('.pattern-item')).length === before);

  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  await sleep(200);
  await shot(page, 'phone');
  await page.click('.pattern-header .drawer-open');
  await sleep(350);
  check('Schublade öffnet (Telefon)', await page.$eval('.sidebar', (e) => e.classList.contains('is-open')));
  await shot(page, 'phone-drawer');

  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
  await page.setViewport({ width: 820, height: 1180, hasTouch: true });
  await page.reload({ waitUntil: 'networkidle0' });
  await shot(page, 'tablet-portrait-light');
  check('Service Worker registriert', await page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration())));
} finally {
  await browser.close();
  await app.close();
  rmSync(tmp, { recursive: true, force: true });
}

for (const r of results) console.log(`${r.ok ? '✔' : '✖'} ${r.name}${r.detail ? ` – ${r.detail}` : ''}`);
if (errors.length) console.log(`\nJS-Fehler im Browser:\n${errors.join('\n')}`);
if (shotsDir) console.log(`\nScreenshots: ${shotsDir}`);
const failed = results.filter((r) => !r.ok).length + errors.length;
console.log(`\n${results.length - results.filter((r) => !r.ok).length}/${results.length} bestanden`);
process.exit(failed ? 1 : 0);
