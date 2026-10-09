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

  const api = (path) => page.evaluate(async (p) => (await fetch(p)).json(), path);
  const pressed = (sel) => page.$eval(sel, (e) => e.getAttribute('aria-pressed'));
  const count = (sel) => page.$$eval(sel, (els) => els.length);
  const clickLabel = (label) => page.click(`[aria-label="${label}"]`);

  // „Beat 1“ (Demo-Pattern, 130 BPM) auswählen
  await (await page.$$('.pattern-item'))[2].click();
  check('Pattern-Auswahl', (await page.$eval('.name-input', (e) => e.value)) === 'Beat 1');
  check('Alle 10 Layer sichtbar', (await count('.layer-grid .lane')) === 10);

  const snare0 = '.l-snare .beat[data-b="0"] .slot';
  await page.click(snare0);
  check('Platzhalter setzt Schlag', (await pressed(snare0)) === 'true');

  // Zweites Antippen → Ghost Note, drittes → leer
  const tom0 = '.l-tom_low .beat[data-b="0"] .slot';
  await page.click(tom0);
  await page.click(tom0);
  const ghostFill = await page.$eval(tom0, (e) => getComputedStyle(e).backgroundImage);
  check('Zweites Antippen → Ghost Note (halb gefüllt)', (await pressed(tom0)) === 'mixed' && ghostFill.includes('50%'));
  const tom1 = '.l-tom_low .beat[data-b="1"] .slot';
  for (let i = 0; i < 3; i++) await page.click(tom1);
  check('Drittes Antippen → leer', (await pressed(tom1)) === 'false');

  const kickBeat2 = (await page.$$('.editor-grid .l-kick .beat--editor'))[1];
  await (await kickBeat2.$$('.stepper-btn'))[1].click();
  const kickSlots = await count('.layer-grid .l-kick .beat[data-b="1"] .slot');
  check('Editor ändert Platzhalter (2 → 3)', kickSlots === 3, `${kickSlots} Slots`);

  // Layer im Editor ausblenden
  await page.click('.editor-grid .l-cowbell .toggle--eye');
  check('Layer ausblenden', (await count('.layer-grid .l-cowbell')) === 0 && (await count('.layer-grid .lane')) === 9);

  // Lautstärke-Spalte und Editor ein-/ausblenden
  await page.click('.pill-toggle');
  check('Lautstärke ausblenden', (await count('.layer-grid .lane-side')) === 0);
  await page.click('.pill-toggle');
  check('Lautstärke einblenden', (await count('.layer-grid .lane-side')) > 0);
  await page.click('.panel-collapse');
  check('Editor einklappen', (await count('.editor-grid')) === 0);
  await page.click('.panel-collapse');
  check('Editor ausklappen', (await count('.editor-grid')) === 1);

  // Tags vergeben und filtern
  await page.click('.tag-input');
  await page.keyboard.type('Funk');
  await page.keyboard.press('Enter');
  check('Tag hinzufügen', (await page.$$eval('.chip--static', (els) => els.map((e) => e.textContent))).includes('Funk'));
  const funkChip = await page.$$eval('.tag-filter .chip', (els) => els.findIndex((e) => e.textContent === 'Funk'));
  await (await page.$$('.tag-filter .chip'))[funkChip].click();
  check('Tag-Filter', (await count('.pattern-item')) === 1);
  await page.click('.chip--clear');
  check('Filter zurücksetzen', (await count('.pattern-item')) === 3);

  await setRange(page, '.tempo-slider', 96);
  const listBpm = await page.$$eval('.pattern-item-bpm', (els) => els[2].textContent);
  check('Tempo-Slider aktualisiert Liste', listBpm.startsWith('96'), listBpm);

  await sleep(900); // Speichern ist entprellt (350 ms)
  const saved = (await api('/api/patterns')).find((p) => p.name === 'Beat 1');
  const layer = (key) => saved.layers.find((l) => l.key === key);
  check('Gespeichert: Tempo', saved.bpm === 96, String(saved.bpm));
  check('Gespeichert: Schlag', layer('snare').hits[0][0] === 1);
  check('Gespeichert: Ghost Note', layer('tom_low').hits[0][0] === 2);
  check('Gespeichert: Unterteilung', layer('kick').subdivisions[1] === 3, JSON.stringify(layer('kick').subdivisions));
  check('Gespeichert: ausgeblendet', layer('cowbell').hidden === true);
  check('Gespeichert: Tags', JSON.stringify(saved.tags) === '["Groove","Funk"]', JSON.stringify(saved.tags));
  check('Status „Gespeichert“', (await page.$eval('.save-status', (e) => e.textContent)) === 'Gespeichert');

  await page.evaluate(() => (window.__starts = []));
  await page.click('.play-btn');
  await sleep(1600);
  const lcd = await page.$eval('.lcd-value', (e) => e.textContent);
  check('Playhead sichtbar', (await page.$eval('.playhead', (e) => e.style.opacity)) === '1');
  check('Aktuelle Zählzeit markiert', (await count('.ruler-beat.is-now')) === 1);
  await shot(page, 'tablet-playing');

  // Alle Starts müssen auf dem gemeinsamen Raster (Achtel, Triolen, Sechzehntel → 1/12 Beat) liegen.
  const starts = await page.evaluate(() => window.__starts);
  const unit = 60 / 96 / 12;
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

  await clickLabel('Tempo um 5 erhöhen');
  await clickLabel('Tempo um 5 erhöhen');
  await clickLabel('Tempo um 5 verringern');
  check('Tempo ±5', (await page.$eval('.bpm-readout', (e) => e.firstChild.textContent)) === '185');

  const beatsPlus = async () => (await page.$$('.header-row--controls .stepper .stepper-btn'))[1].click();
  await beatsPlus();
  check('Taktart 5/4', (await count('.ruler-beat')) === 5);

  // Mitscrollen: langer Takt auf schmalem Bildschirm
  for (let i = 0; i < 11; i++) await beatsPlus();
  await page.setViewport({ width: 900, height: 820, hasTouch: true });
  await setRange(page, '.tempo-slider', 300);
  await page.click('.play-btn');
  const scrollLeft = () => page.$eval('.layer-grid', (e) => e.parentElement.scrollLeft);
  let followed = false;
  for (let i = 0; i < 40 && !followed; i++) {
    await sleep(100);
    followed = (await scrollLeft()) > 0;
  }
  let returned = false;
  for (let i = 0; i < 60 && followed && !returned; i++) {
    await sleep(100);
    returned = (await scrollLeft()) === 0;
  }
  await page.click('.play-btn');
  check('Layer-Bereich scrollt mit und springt bei Wiederholung zurück', followed && returned, `${followed}/${returned}`);
  await page.setViewport({ width: 1180, height: 820, hasTouch: true });

  const before = await count('.pattern-item');
  await page.click('.list-head .btn');
  await sleep(300);
  check('Neues Pattern', (await count('.pattern-item')) === before + 1);
  await page.click('.icon-btn--danger');
  await sleep(300);
  check('Pattern löschen', (await count('.pattern-item')) === before);

  // Liste einklappen (großer Bildschirm)
  await page.click('.list-toggle');
  check('Liste einklappen', await page.$eval('.sidebar', (e) => getComputedStyle(e).display === 'none'));
  await page.click('.list-toggle');
  check('Liste ausklappen', await page.$eval('.sidebar', (e) => getComputedStyle(e).display !== 'none'));

  // Arrangement-Ebene
  await (await page.$$('.tab'))[1].click();
  await page.waitForSelector('.strand-item');
  check('Demo-Arrangement mit 4 Pattern', (await count('.strand-item')) === 4);
  const names = () => page.$$eval('.strand-name', (els) => els.map((e) => e.textContent));
  const [first, second] = await names();
  await page.click('.swap-btn');
  const swapped = await names();
  check('⇄ tauscht Nachbarn', swapped[0] === second && swapped[1] === first, swapped.join(', '));

  await (await page.$$('.segment'))[1].click();
  await page.click('.pattern-item--add');
  check('Pattern anhängen', (await count('.strand-item')) === 5);
  check('Anzahl im Arrangement', (await page.$eval('.pattern-item--add .count-badge', (e) => e.textContent)) === '2×');
  await shot(page, 'arrangement');

  await page.click('.strand-cell:last-child .strand-remove');
  check('Pattern aus Arrangement entfernen', (await count('.strand-item')) === 4);

  await page.click('.play-btn');
  await sleep(700);
  check('Arrangement spielt (aktuelles Pattern markiert)', (await count('.strand-item.is-now')) === 1);
  await shot(page, 'arrangement-playing');
  await page.click('.play-btn');

  await sleep(900);
  const [arr] = await api('/api/arrangements');
  const patternsNow = await api('/api/patterns');
  const nameOf = (id) => patternsNow.find((p) => p.id === id)?.name;
  check('Arrangement gespeichert', arr.items.map(nameOf).join(',') === swapped.join(','), arr.items.map(nameOf).join(','));

  await (await page.$$('.segment'))[0].click();
  await page.click('.tag-filter .chip');
  check('Arrangement-Tag-Filter', (await count('.pattern-item')) === 1);

  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  await (await page.$$('.tab'))[0].click();
  await sleep(200);
  await shot(page, 'phone');
  await page.click('.topbar .list-toggle');
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
