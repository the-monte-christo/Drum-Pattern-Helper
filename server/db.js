import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { demoPatterns, normalizePattern } from '../shared/pattern.js';

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS patterns (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT    NOT NULL,
    beats      INTEGER NOT NULL,
    bpm        INTEGER NOT NULL,
    layers     TEXT    NOT NULL,
    created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );
`;

function toPattern(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    beats: row.beats,
    bpm: row.bpm,
    layers: JSON.parse(row.layers),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function openStore(file, { seed = true } = {}) {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;');
  db.exec(SCHEMA);

  const stmts = {
    list: db.prepare('SELECT * FROM patterns ORDER BY id'),
    get: db.prepare('SELECT * FROM patterns WHERE id = ?'),
    count: db.prepare('SELECT COUNT(*) AS n FROM patterns'),
    insert: db.prepare(
      'INSERT INTO patterns (name, beats, bpm, layers) VALUES (?, ?, ?, ?) RETURNING *',
    ),
    update: db.prepare(
      `UPDATE patterns
         SET name = ?, beats = ?, bpm = ?, layers = ?,
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE id = ? RETURNING *`,
    ),
    remove: db.prepare('DELETE FROM patterns WHERE id = ?'),
  };

  const store = {
    list: () => stmts.list.all().map(toPattern),
    get: (id) => toPattern(stmts.get.get(id)),
    create(input) {
      const p = normalizePattern(input);
      return toPattern(stmts.insert.get(p.name, p.beats, p.bpm, JSON.stringify(p.layers)));
    },
    update(id, input) {
      const p = normalizePattern(input);
      return toPattern(stmts.update.get(p.name, p.beats, p.bpm, JSON.stringify(p.layers), id));
    },
    remove: (id) => stmts.remove.run(id).changes > 0,
    close: () => db.close(),
  };

  if (seed && stmts.count.get().n === 0) {
    for (const p of demoPatterns()) store.create(p);
  }

  return store;
}
