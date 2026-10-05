// Gemeinsame Pattern-Logik für Client und Server.
// Ein Pattern hat eine globale Taktart (n/4) und pro Layer eine eigene
// Unterteilung jeder Zählzeit (Anzahl Platzhalter) samt gesetzter Schläge.

export const LAYERS = [
  { key: 'metro_high', label: 'Metronom High', short: 'M·Hi' },
  { key: 'metro_low', label: 'Metronom Low', short: 'M·Lo' },
  { key: 'hihat', label: 'Hi-Hat', short: 'HH' },
  { key: 'snare', label: 'Snare', short: 'SN' },
  { key: 'kick', label: 'Kick', short: 'BD' },
];

export const LAYER_KEYS = LAYERS.map((l) => l.key);

export const LIMITS = {
  beatsMin: 1,
  beatsMax: 16,
  bpmMin: 20,
  bpmMax: 300,
  subMin: 1,
  subMax: 12,
  nameMax: 60,
};

export const DEFAULT_VOLUME = 0.8;

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function toInt(value, fallback, min, max) {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? clamp(n, min, max) : fallback;
}

const isMetronome = (key) => key.startsWith('metro_');

function defaultSubdivision(key) {
  return isMetronome(key) ? 1 : 4;
}

// Metronom High klickt auf der 1, Metronom Low auf allen anderen Zählzeiten.
function defaultBeatHits(key, beat, sub) {
  const hits = new Array(sub).fill(0);
  if ((key === 'metro_high' && beat === 0) || (key === 'metro_low' && beat > 0)) hits[0] = 1;
  return hits;
}

export function createLayer(key, beats) {
  const sub = defaultSubdivision(key);
  return {
    key,
    volume: DEFAULT_VOLUME,
    muted: false,
    subdivisions: new Array(beats).fill(sub),
    hits: Array.from({ length: beats }, (_, b) => defaultBeatHits(key, b, sub)),
  };
}

export function createPattern({ name = 'Neues Pattern', beats = 4, bpm = 100 } = {}) {
  return {
    name,
    beats,
    bpm,
    layers: LAYERS.map((l) => createLayer(l.key, beats)),
  };
}

// Überträgt Schläge auf eine neue Unterteilung. Ein Schlag bleibt erhalten,
// wenn seine Position im Beat auch in der neuen Unterteilung existiert
// (z. B. 2 → 4: Schlag auf "+" wandert auf Platz 3).
export function resizeBeatHits(hits, to) {
  const from = hits.length;
  const out = new Array(to).fill(0);
  for (let j = 0; j < from; j++) {
    if (hits[j] && (j * to) % from === 0) out[(j * to) / from] = 1;
  }
  return out;
}

function mapLayer(pattern, key, fn) {
  return { ...pattern, layers: pattern.layers.map((l) => (l.key === key ? fn(l) : l)) };
}

export function setSubdivision(pattern, key, beat, sub) {
  const n = clamp(sub, LIMITS.subMin, LIMITS.subMax);
  return mapLayer(pattern, key, (l) => {
    if (l.subdivisions[beat] === n) return l;
    const subdivisions = l.subdivisions.slice();
    const hits = l.hits.slice();
    subdivisions[beat] = n;
    hits[beat] = resizeBeatHits(l.hits[beat], n);
    return { ...l, subdivisions, hits };
  });
}

export function setLayerSubdivisions(pattern, key, sub) {
  let next = pattern;
  for (let b = 0; b < pattern.beats; b++) next = setSubdivision(next, key, b, sub);
  return next;
}

export function toggleHit(pattern, key, beat, index) {
  return mapLayer(pattern, key, (l) => {
    const hits = l.hits.slice();
    hits[beat] = hits[beat].slice();
    hits[beat][index] = hits[beat][index] ? 0 : 1;
    return { ...l, hits };
  });
}

export function clearLayer(pattern, key) {
  return mapLayer(pattern, key, (l) => ({ ...l, hits: l.hits.map((h) => h.map(() => 0)) }));
}

export function updateLayer(pattern, key, changes) {
  return mapLayer(pattern, key, (l) => ({ ...l, ...changes }));
}

// Ändert die Taktart. Neue Zählzeiten übernehmen die Unterteilung der
// letzten bestehenden Zählzeit; das Metronom bekommt seinen Standardklick.
export function setBeats(pattern, beats) {
  const n = clamp(beats, LIMITS.beatsMin, LIMITS.beatsMax);
  if (n === pattern.beats) return pattern;
  const layers = pattern.layers.map((l) => {
    if (n < pattern.beats) {
      return { ...l, subdivisions: l.subdivisions.slice(0, n), hits: l.hits.slice(0, n) };
    }
    const subdivisions = l.subdivisions.slice();
    const hits = l.hits.slice();
    for (let b = pattern.beats; b < n; b++) {
      const sub = subdivisions[b - 1] ?? defaultSubdivision(l.key);
      subdivisions.push(sub);
      hits.push(isMetronome(l.key) ? defaultBeatHits(l.key, b, sub) : new Array(sub).fill(0));
    }
    return { ...l, subdivisions, hits };
  });
  return { ...pattern, beats: n, layers };
}

// Alle Schläge einer Zählzeit über alle Layer, als Bruchteil des Beats.
export function beatEvents(pattern, beat) {
  const events = [];
  for (const l of pattern.layers) {
    const sub = l.subdivisions[beat];
    const hits = l.hits[beat];
    if (!sub || !hits) continue;
    for (let i = 0; i < sub; i++) if (hits[i]) events.push({ key: l.key, frac: i / sub });
  }
  return events;
}

// Bringt beliebige Eingaben (API-Body, alte Datensätze) in eine gültige Form.
export function normalizePattern(input = {}) {
  const src = input && typeof input === 'object' ? input : {};
  const beats = toInt(src.beats, 4, LIMITS.beatsMin, LIMITS.beatsMax);
  const bpm = toInt(src.bpm, 100, LIMITS.bpmMin, LIMITS.bpmMax);
  const rawName = typeof src.name === 'string' ? src.name.trim().slice(0, LIMITS.nameMax) : '';
  const name = rawName || 'Neues Pattern';
  const given = Array.isArray(src.layers) ? src.layers : [];

  const layers = LAYER_KEYS.map((key) => {
    const raw = given.find((l) => l && l.key === key);
    const fallback = createLayer(key, beats);
    if (!raw) return fallback;
    const subdivisions = [];
    const hits = [];
    for (let b = 0; b < beats; b++) {
      const rawSub = Array.isArray(raw.subdivisions) ? raw.subdivisions[b] : undefined;
      const sub = toInt(rawSub, fallback.subdivisions[b], LIMITS.subMin, LIMITS.subMax);
      const rawHits = Array.isArray(raw.hits) && Array.isArray(raw.hits[b]) ? raw.hits[b] : [];
      subdivisions.push(sub);
      hits.push(Array.from({ length: sub }, (_, i) => (rawHits[i] ? 1 : 0)));
    }
    const volume = Number(raw.volume);
    return {
      key,
      volume: Number.isFinite(volume) ? clamp(volume, 0, 1) : DEFAULT_VOLUME,
      muted: Boolean(raw.muted),
      subdivisions,
      hits,
    };
  });

  return { name, beats, bpm, layers };
}

function hitsFromString(beats, sub, s) {
  // "x..." je Zählzeit, durch Leerzeichen getrennt
  const groups = s.split(' ');
  return Array.from({ length: beats }, (_, b) =>
    Array.from({ length: sub }, (_, i) => (groups[b]?.[i] === 'x' ? 1 : 0)),
  );
}

function demoLayer(key, beats, sub, pattern, volume = DEFAULT_VOLUME) {
  return { key, volume, muted: false, subdivisions: new Array(beats).fill(sub), hits: hitsFromString(beats, sub, pattern) };
}

export function demoPatterns() {
  const metro = (beats) => [createLayer('metro_high', beats), createLayer('metro_low', beats)];
  return [
    {
      name: 'Paradiddle',
      beats: 4,
      bpm: 155,
      layers: [
        ...metro(4),
        demoLayer('hihat', 4, 4, '.... .... .... ....'),
        demoLayer('snare', 4, 4, 'xxxx xxxx xxxx xxxx'),
        demoLayer('kick', 4, 4, 'x... .... x... ....'),
      ],
    },
    {
      name: '6 Stroke-Roll',
      beats: 4,
      bpm: 120,
      layers: [
        ...metro(4),
        demoLayer('hihat', 4, 2, '.. .. .. ..'),
        demoLayer('snare', 4, 6, 'xxxxxx xxxxxx xxxxxx xxxxxx'),
        demoLayer('kick', 4, 1, 'x . x .'),
      ],
    },
    {
      name: 'Beat 1',
      beats: 4,
      bpm: 130,
      layers: [
        ...metro(4),
        demoLayer('hihat', 4, 2, 'xx xx xx xx', 0.6),
        demoLayer('snare', 4, 1, '. x . x'),
        demoLayer('kick', 4, 2, 'x. .. xx ..'),
      ],
    },
  ];
}
