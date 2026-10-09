import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TAG_LIMITS, collectTags, matchesTags, normalizeTags, toggleTag } from '../shared/tags.js';
import {
  ARRANGEMENT_LIMITS,
  appendItem,
  createArrangement,
  normalizeArrangement,
  removeItem,
  removePatternRefs,
  resolveItems,
  swapItems,
} from '../shared/arrangement.js';

test('normalizeTags kürzt, entfernt Doppelte (ohne Groß/klein) und begrenzt die Anzahl', () => {
  assert.deepEqual(normalizeTags(['  Rock  ', 'ROCK', 'Odd   Time', 42, '']), ['Rock', 'Odd Time']);
  assert.equal(normalizeTags(['x'.repeat(99)])[0].length, TAG_LIMITS.tagMax);
  const many = Array.from({ length: 30 }, (_, i) => `t${i}`);
  assert.equal(normalizeTags(many).length, TAG_LIMITS.tagsMax);
  assert.deepEqual(normalizeTags('kein Array'), []);
});

test('collectTags sammelt alphabetisch, matchesTags verlangt alle aktiven Tags', () => {
  const items = [{ tags: ['Rock', 'Anfänger'] }, { tags: ['rock', 'Funk'] }, { tags: [] }];
  assert.deepEqual(collectTags(items), ['Anfänger', 'Funk', 'Rock']);
  assert.equal(items.filter((i) => matchesTags(i, ['ROCK'])).length, 2);
  assert.equal(items.filter((i) => matchesTags(i, ['Rock', 'Funk'])).length, 1);
  assert.equal(items.filter((i) => matchesTags(i, [])).length, 3);
  assert.deepEqual(toggleTag(['Rock'], 'rock'), []);
  assert.deepEqual(toggleTag(['Rock'], 'Funk'), ['Rock', 'Funk']);
});

test('Arrangement: anhängen, tauschen, entfernen', () => {
  let a = createArrangement();
  a = appendItem(appendItem(appendItem(a, 1), 2), 1);
  assert.deepEqual(a.items, [1, 2, 1]);
  a = swapItems(a, 0, 1);
  assert.deepEqual(a.items, [2, 1, 1]);
  assert.equal(swapItems(a, 2, 3), a);
  a = removeItem(a, 1);
  assert.deepEqual(a.items, [2, 1]);
  a = removePatternRefs(appendItem(a, 2), 2);
  assert.deepEqual(a.items, [1]);
});

test('Arrangement: Obergrenze und Normalisierung', () => {
  let a = createArrangement({ items: new Array(ARRANGEMENT_LIMITS.itemsMax).fill(1) });
  assert.equal(appendItem(a, 2), a);
  const n = normalizeArrangement({ name: '  ', items: [1, '2', -3, 1.5, 'x', 4], tags: ['A', 'a'] });
  assert.deepEqual(n, { name: 'Neues Arrangement', tags: ['A'], items: [1, 2, 4] });
});

test('resolveItems überspringt fehlende Pattern und behält die Position', () => {
  const byId = new Map([
    [1, { id: 1 }],
    [3, { id: 3 }],
  ]);
  const entries = resolveItems({ items: [1, 2, 3] }, byId);
  assert.deepEqual(
    entries.map((e) => [e.index, e.pattern.id]),
    [
      [0, 1],
      [2, 3],
    ],
  );
});
