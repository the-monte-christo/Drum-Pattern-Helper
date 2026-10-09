import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { buildApp } from '../server/app.js';
import { LAYERS, createPattern } from '../shared/pattern.js';

async function setup(t, opts = {}) {
  const app = await buildApp({ dbFile: ':memory:', ...opts });
  t.after(() => app.close());
  return app;
}

test('leere Datenbank wird mit Demo-Pattern befüllt', async (t) => {
  const app = await setup(t);
  const res = await app.inject('/api/patterns');
  assert.equal(res.statusCode, 200);
  assert.deepEqual(
    res.json().map((p) => [p.name, p.bpm]),
    [['Paradiddle', 155], ['6 Stroke-Roll', 120], ['Beat 1', 130]],
  );
});

test('CRUD-Zyklus', async (t) => {
  const app = await setup(t, { seed: false });

  const created = await app.inject({ method: 'POST', url: '/api/patterns', payload: createPattern({ name: 'Groove' }) });
  assert.equal(created.statusCode, 201);
  const { id } = created.json();

  const updated = await app.inject({
    method: 'PUT',
    url: `/api/patterns/${id}`,
    payload: { ...created.json(), bpm: 142, beats: 3 },
  });
  assert.equal(updated.statusCode, 200);
  assert.equal(updated.json().bpm, 142);
  assert.equal(updated.json().layers[0].hits.length, 3);

  const fetched = await app.inject(`/api/patterns/${id}`);
  assert.equal(fetched.json().bpm, 142);

  assert.equal((await app.inject({ method: 'DELETE', url: `/api/patterns/${id}` })).statusCode, 204);
  assert.equal((await app.inject(`/api/patterns/${id}`)).statusCode, 404);
  assert.equal((await app.inject({ method: 'PUT', url: `/api/patterns/${id}`, payload: {} })).statusCode, 404);
});

test('Tags werden gespeichert und normalisiert', async (t) => {
  const app = await setup(t, { seed: false });
  const res = await app.inject({
    method: 'POST',
    url: '/api/patterns',
    payload: { ...createPattern({ name: 'Groove' }), tags: [' Funk ', 'funk', 'Übung'] },
  });
  assert.deepEqual(res.json().tags, ['Funk', 'Übung']);
});

test('Arrangements: CRUD, nur vorhandene Pattern, Aufräumen beim Löschen eines Pattern', async (t) => {
  const app = await setup(t, { seed: false });
  const make = async (name) =>
    (await app.inject({ method: 'POST', url: '/api/patterns', payload: createPattern({ name }) })).json().id;
  const a = await make('A');
  const b = await make('B');

  const created = await app.inject({
    method: 'POST',
    url: '/api/arrangements',
    payload: { name: 'Song', tags: ['Live'], items: [a, b, 999, a] },
  });
  assert.equal(created.statusCode, 201);
  const arr = created.json();
  assert.deepEqual(arr.items, [a, b, a]);
  assert.deepEqual(arr.tags, ['Live']);

  const updated = await app.inject({ method: 'PUT', url: `/api/arrangements/${arr.id}`, payload: { ...arr, items: [b, a] } });
  assert.deepEqual(updated.json().items, [b, a]);

  assert.equal((await app.inject({ method: 'DELETE', url: `/api/patterns/${a}` })).statusCode, 204);
  assert.deepEqual((await app.inject(`/api/arrangements/${arr.id}`)).json().items, [b]);

  assert.equal((await app.inject({ method: 'DELETE', url: `/api/arrangements/${arr.id}` })).statusCode, 204);
  assert.equal((await app.inject(`/api/arrangements/${arr.id}`)).statusCode, 404);
});

test('leere Datenbank bekommt ein Demo-Arrangement', async (t) => {
  const app = await setup(t);
  const [warmup] = (await app.inject('/api/arrangements')).json();
  assert.equal(warmup.name, 'Warm-up');
  assert.equal(warmup.items.length, 4);
});

test('alte Datenbank ohne Tags wird nachgerüstet, alte Pattern bekommen neue Layer', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'dph-migrate-'));
  const file = join(dir, 'old.db');
  const db = new DatabaseSync(file);
  db.exec(`CREATE TABLE patterns (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, beats INTEGER NOT NULL, bpm INTEGER NOT NULL,
    layers TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL DEFAULT '')`);
  db.prepare('INSERT INTO patterns (name, beats, bpm, layers) VALUES (?, ?, ?, ?)').run(
    'Alt',
    4,
    100,
    JSON.stringify([{ key: 'snare', volume: 0.5, subdivisions: [1, 1, 1, 1], hits: [[1], [0], [1], [0]] }]),
  );
  db.close();

  const app = await setup(t, { dbFile: file });
  t.after(() => rmSync(dir, { recursive: true, force: true })); // erst nach app.close (Windows sperrt offene Dateien)
  const [p] = (await app.inject('/api/patterns')).json();
  assert.equal(p.name, 'Alt');
  assert.deepEqual(p.tags, []);
  assert.equal(p.layers.length, LAYERS.length);
  assert.deepEqual(p.layers.find((l) => l.key === 'snare').hits, [[1], [0], [1], [0]]);
  const saved = await app.inject({ method: 'PUT', url: `/api/patterns/${p.id}`, payload: { ...p, tags: ['Neu'] } });
  assert.deepEqual(saved.json().tags, ['Neu']);
});

test('ungültige ID wird abgelehnt', async (t) => {
  const app = await setup(t, { seed: false });
  assert.equal((await app.inject('/api/patterns/abc')).statusCode, 400);
});

test('unbekannte API-Route liefert JSON-404', async (t) => {
  const app = await setup(t, { seed: false });
  const res = await app.inject('/api/nope');
  assert.equal(res.statusCode, 404);
  assert.ok(res.json().error);
});

test('liefert Frontend mit passenden Cache-Headern und SPA-Fallback', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'dph-static-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, 'assets'));
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>DPH</title>');
  writeFileSync(join(dir, 'assets', 'app-abc123.js'), 'console.log(1)');
  writeFileSync(join(dir, 'sw.js'), '//sw');

  const app = await setup(t, { seed: false, staticDir: dir });

  const index = await app.inject('/');
  assert.equal(index.statusCode, 200);
  assert.equal(index.headers['cache-control'], 'no-cache');

  const asset = await app.inject('/assets/app-abc123.js');
  assert.equal(asset.statusCode, 200);
  assert.match(asset.headers['cache-control'], /immutable/);

  assert.equal((await app.inject('/sw.js')).headers['cache-control'], 'no-cache');

  const deep = await app.inject('/irgendwo/tief');
  assert.equal(deep.statusCode, 200);
  assert.match(deep.body, /DPH/);

  assert.equal((await app.inject('/assets/alt-zzz999.js')).statusCode, 404);
});
