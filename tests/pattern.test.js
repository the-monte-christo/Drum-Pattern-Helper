import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  beatEvents,
  createPattern,
  normalizePattern,
  resizeBeatHits,
  setBeats,
  setSubdivision,
  toggleHit,
} from '../shared/pattern.js';

const layer = (p, key) => p.layers.find((l) => l.key === key);

test('neues Pattern: Metronom klickt High auf 1, Low auf 2–4', () => {
  const p = createPattern();
  assert.deepEqual(layer(p, 'metro_high').hits, [[1], [0], [0], [0]]);
  assert.deepEqual(layer(p, 'metro_low').hits, [[0], [1], [1], [1]]);
  assert.deepEqual(layer(p, 'snare').subdivisions, [4, 4, 4, 4]);
});

test('resizeBeatHits behält musikalisch passende Positionen', () => {
  assert.deepEqual(resizeBeatHits([1, 1], 4), [1, 0, 1, 0]);
  assert.deepEqual(resizeBeatHits([1, 0, 1, 0], 2), [1, 1]);
  assert.deepEqual(resizeBeatHits([1, 1, 1], 4), [1, 0, 0, 0]);
  assert.deepEqual(resizeBeatHits([0, 1, 1, 1], 3), [0, 0, 0]);
});

test('setSubdivision ändert nur die gewählte Zählzeit eines Layers', () => {
  let p = createPattern();
  p = toggleHit(p, 'snare', 1, 2);
  p = setSubdivision(p, 'snare', 1, 2);
  const sn = layer(p, 'snare');
  assert.deepEqual(sn.subdivisions, [4, 2, 4, 4]);
  assert.deepEqual(sn.hits[1], [0, 1]);
  assert.deepEqual(layer(p, 'kick').subdivisions, [4, 4, 4, 4]);
});

test('setBeats verlängert und kürzt alle Layer konsistent', () => {
  let p = setSubdivision(createPattern(), 'kick', 3, 3);
  p = setBeats(p, 6);
  assert.equal(p.beats, 6);
  assert.deepEqual(layer(p, 'kick').subdivisions, [4, 4, 4, 3, 3, 3]);
  assert.deepEqual(layer(p, 'metro_low').hits.at(-1), [1]);
  p = setBeats(p, 3);
  for (const l of p.layers) {
    assert.equal(l.subdivisions.length, 3);
    assert.equal(l.hits.length, 3);
  }
});

test('beatEvents liefert Bruchteile pro Layer (Triolen + Sechzehntel)', () => {
  let p = setSubdivision(createPattern(), 'snare', 0, 3);
  p = toggleHit(p, 'snare', 0, 1);
  p = toggleHit(p, 'kick', 0, 2);
  const ev = beatEvents(p, 0).filter((e) => e.key !== 'metro_high');
  assert.deepEqual(ev, [
    { key: 'snare', frac: 1 / 3 },
    { key: 'kick', frac: 0.5 },
  ]);
});

test('normalizePattern repariert ungültige Eingaben', () => {
  const p = normalizePattern({
    name: '   ',
    beats: 99,
    bpm: 'abc',
    layers: [{ key: 'snare', volume: 3, subdivisions: [0, 50], hits: [[1, 1], 'x'] }, { key: 'evil' }],
  });
  assert.equal(p.name, 'Neues Pattern');
  assert.equal(p.beats, 16);
  assert.equal(p.bpm, 100);
  assert.equal(p.layers.length, 5);
  const sn = layer(p, 'snare');
  assert.equal(sn.volume, 1);
  assert.deepEqual(sn.subdivisions.slice(0, 3), [1, 12, 4]);
  assert.deepEqual(sn.hits[0], [1]);
  assert.equal(sn.hits.length, 16);
});
