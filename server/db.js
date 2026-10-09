import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { demoPatterns, normalizePattern } from '../shared/pattern.js';
import { normalizeArrangement } from '../shared/arrangement.js';

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS patterns (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT    NOT NULL,
    beats      INTEGER NOT NULL,
    bpm        INTEGER NOT NULL,
    layers     TEXT    NOT NULL,
    created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    tags       TEXT    NOT NULL DEFAULT '[]'
  );
  CREATE TABLE IF NOT EXISTS arrangements (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT    NOT NULL,
    tags       TEXT    NOT NULL DEFAULT '[]',
    items      TEXT    NOT NULL DEFAULT '[]',
    created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );
`;

// Ältere Datenbanken (vor Tags) nachrüsten.
function migrate(db) {
  const columns = db.prepare('PRAGMA table_info(patterns)').all().map((c) => c.name);
  if (!columns.includes('tags')) db.exec(`ALTER TABLE patterns ADD COLUMN tags TEXT NOT NULL DEFAULT '[]'`);
}

function toPattern(row) {
  if (!row) return null;
  // Alte Datensätze bekommen neue Layer und Felder über normalizePattern.
  const p = normalizePattern({ ...row, tags: JSON.parse(row.tags), layers: JSON.parse(row.layers) });
  return { id: row.id, ...p, createdAt: row.created_at, updatedAt: row.updated_at };
}

function toArrangement(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    tags: JSON.parse(row.tags),
    items: JSON.parse(row.items),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function openStore(file, { seed = true } = {}) {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;');
  db.exec(SCHEMA);
  migrate(db);

  const transaction = (fn) => {
    db.exec('BEGIN');
    try {
      const result = fn();
      db.exec('COMMIT');
      return result;
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  };

  const stmts = {
    patternList: db.prepare('SELECT * FROM patterns ORDER BY id'),
    patternGet: db.prepare('SELECT * FROM patterns WHERE id = ?'),
    patternIds: db.prepare('SELECT id FROM patterns'),
    patternCount: db.prepare('SELECT COUNT(*) AS n FROM patterns'),
    patternInsert: db.prepare(
      'INSERT INTO patterns (name, beats, bpm, tags, layers) VALUES (?, ?, ?, ?, ?) RETURNING *',
    ),
    patternUpdate: db.prepare(
      `UPDATE patterns
         SET name = ?, beats = ?, bpm = ?, tags = ?, layers = ?,
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE id = ? RETURNING *`,
    ),
    patternRemove: db.prepare('DELETE FROM patterns WHERE id = ?'),

    arrangementList: db.prepare('SELECT * FROM arrangements ORDER BY id'),
    arrangementGet: db.prepare('SELECT * FROM arrangements WHERE id = ?'),
    arrangementCount: db.prepare('SELECT COUNT(*) AS n FROM arrangements'),
    arrangementInsert: db.prepare('INSERT INTO arrangements (name, tags, items) VALUES (?, ?, ?) RETURNING *'),
    arrangementUpdate: db.prepare(
      `UPDATE arrangements
         SET name = ?, tags = ?, items = ?,
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE id = ? RETURNING *`,
    ),
    arrangementItems: db.prepare('UPDATE arrangements SET items = ? WHERE id = ?'),
    arrangementRemove: db.prepare('DELETE FROM arrangements WHERE id = ?'),
  };

  const patternArgs = (p) => [p.name, p.beats, p.bpm, JSON.stringify(p.tags), JSON.stringify(p.layers)];

  const patterns = {
    list: () => stmts.patternList.all().map(toPattern),
    get: (id) => toPattern(stmts.patternGet.get(id)),
    create: (input) => toPattern(stmts.patternInsert.get(...patternArgs(normalizePattern(input)))),
    update: (id, input) => toPattern(stmts.patternUpdate.get(...patternArgs(normalizePattern(input)), id)),
    // Gelöschte Pattern verschwinden auch aus allen Arrangements.
    remove: (id) =>
      transaction(() => {
        if (stmts.patternRemove.run(id).changes === 0) return false;
        for (const a of arrangements.list()) {
          if (a.items.includes(id)) {
            stmts.arrangementItems.run(JSON.stringify(a.items.filter((x) => x !== id)), a.id);
          }
        }
        return true;
      }),
  };

  // Arrangements verweisen nur auf vorhandene Pattern.
  const arrangementArgs = (input) => {
    const a = normalizeArrangement(input);
    const ids = new Set(stmts.patternIds.all().map((r) => r.id));
    return [a.name, JSON.stringify(a.tags), JSON.stringify(a.items.filter((id) => ids.has(id)))];
  };

  const arrangements = {
    list: () => stmts.arrangementList.all().map(toArrangement),
    get: (id) => toArrangement(stmts.arrangementGet.get(id)),
    create: (input) => toArrangement(stmts.arrangementInsert.get(...arrangementArgs(input))),
    update: (id, input) => toArrangement(stmts.arrangementUpdate.get(...arrangementArgs(input), id)),
    remove: (id) => stmts.arrangementRemove.run(id).changes > 0,
  };

  if (seed && stmts.patternCount.get().n === 0) {
    const created = demoPatterns().map((p) => patterns.create(p));
    if (stmts.arrangementCount.get().n === 0) {
      const [paradiddle, roll, beat] = created.map((p) => p.id);
      arrangements.create({ name: 'Warm-up', tags: ['Übung'], items: [paradiddle, roll, beat, beat] });
    }
  }

  return { patterns, arrangements, close: () => db.close() };
}
