// Tags: freie Schlagworte zum Kategorisieren und Filtern (Pattern und Arrangements).
// Vergleiche ignorieren Groß-/Kleinschreibung, angezeigt wird die zuerst vergebene Schreibweise.

export const TAG_LIMITS = {
  tagMax: 24, // Zeichen je Tag
  tagsMax: 12, // Tags je Eintrag
};

const key = (tag) => tag.toLocaleLowerCase('de');

export const sameTag = (a, b) => key(a) === key(b);

export function normalizeTag(value) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, TAG_LIMITS.tagMax) : '';
}

// Entfernt leere und doppelte Tags und begrenzt die Anzahl.
export function normalizeTags(input) {
  const out = [];
  const seen = new Set();
  for (const raw of Array.isArray(input) ? input : []) {
    const tag = normalizeTag(raw);
    if (!tag || seen.has(key(tag))) continue;
    seen.add(key(tag));
    out.push(tag);
    if (out.length >= TAG_LIMITS.tagsMax) break;
  }
  return out;
}

// Alle vorkommenden Tags einer Liste, alphabetisch.
export function collectTags(items) {
  const byKey = new Map();
  for (const item of items) {
    for (const tag of item.tags ?? []) if (!byKey.has(key(tag))) byKey.set(key(tag), tag);
  }
  return [...byKey.values()].sort((a, b) => a.localeCompare(b, 'de', { sensitivity: 'base' }));
}

// Ein Eintrag passt zum Filter, wenn er alle aktiven Tags trägt.
export function matchesTags(item, active) {
  if (!active.length) return true;
  const own = new Set((item.tags ?? []).map(key));
  return active.every((tag) => own.has(key(tag)));
}

// Tag im Filter an- bzw. abwählen.
export function toggleTag(active, tag) {
  return active.some((t) => sameTag(t, tag)) ? active.filter((t) => !sameTag(t, tag)) : [...active, tag];
}
