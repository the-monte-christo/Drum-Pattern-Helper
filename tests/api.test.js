import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from '../server/app.js';
import { createPattern } from '../shared/pattern.js';

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
