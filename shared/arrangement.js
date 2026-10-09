// Arrangements: eine Abfolge („Strang“) von Pattern, die nacheinander je einen Takt lang gespielt werden.
// items enthält Pattern-IDs, dasselbe Pattern darf mehrfach vorkommen.

import { normalizeTags } from './tags.js';

export const ARRANGEMENT_LIMITS = {
  nameMax: 60,
  itemsMax: 128,
};

export function createArrangement({ name = 'Neues Arrangement', tags = [], items = [] } = {}) {
  return { name, tags, items };
}

export function normalizeArrangement(input = {}) {
  const src = input && typeof input === 'object' ? input : {};
  const rawName = typeof src.name === 'string' ? src.name.trim().slice(0, ARRANGEMENT_LIMITS.nameMax) : '';
  const items = (Array.isArray(src.items) ? src.items : [])
    .map(Number)
    .filter((id) => Number.isInteger(id) && id > 0)
    .slice(0, ARRANGEMENT_LIMITS.itemsMax);
  return { name: rawName || 'Neues Arrangement', tags: normalizeTags(src.tags), items };
}

// Hängt ein Pattern an die letzte freie Position an.
export function appendItem(arrangement, patternId) {
  if (arrangement.items.length >= ARRANGEMENT_LIMITS.itemsMax) return arrangement;
  return { ...arrangement, items: [...arrangement.items, patternId] };
}

export function swapItems(arrangement, i, j) {
  const items = arrangement.items.slice();
  if (items[i] === undefined || items[j] === undefined) return arrangement;
  [items[i], items[j]] = [items[j], items[i]];
  return { ...arrangement, items };
}

export function removeItem(arrangement, index) {
  return { ...arrangement, items: arrangement.items.filter((_, i) => i !== index) };
}

// Entfernt alle Verweise auf ein (gelöschtes) Pattern.
export function removePatternRefs(arrangement, patternId) {
  if (!arrangement.items.includes(patternId)) return arrangement;
  return { ...arrangement, items: arrangement.items.filter((id) => id !== patternId) };
}

// Löst die Pattern-IDs auf; Einträge ohne vorhandenes Pattern fallen weg.
// index ist die Position in arrangement.items (für Tauschen/Entfernen).
export function resolveItems(arrangement, patternsById) {
  const entries = [];
  arrangement.items.forEach((id, index) => {
    const pattern = patternsById.get(id);
    if (pattern) entries.push({ index, pattern });
  });
  return entries;
}
