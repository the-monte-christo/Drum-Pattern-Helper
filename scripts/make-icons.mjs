// Erzeugt die PWA-Icons (PNG + SVG) ohne externe Abhängigkeiten.
// Motiv: Step-Raster mit drei Layer-Zeilen in den App-Farben.
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';

const OUT = new URL('../public/icons/', import.meta.url);
mkdirSync(OUT, { recursive: true });

const BG = [17, 19, 22];
const CELL = [40, 45, 53];
const ROWS = [
  { color: [51, 214, 198], on: [1, 0, 1, 0] }, // Hi-Hat
  { color: [255, 92, 147], on: [0, 1, 0, 1] }, // Snare
  { color: [255, 138, 61], on: [1, 0, 0, 1] }, // Kick
];

// Geometrie in Einheiten eines 100er-Rasters; `safe` verkleinert das Motiv für maskable Icons.
function shapes(safe) {
  const s = safe ? 0.72 : 1;
  const o = (100 - 100 * s) / 2;
  const list = [];
  if (!safe) list.push({ x: 0, y: 0, w: 100, h: 100, r: 22, c: BG });
  const cell = 15 * s;
  const gap = 4.5 * s;
  const gridW = 4 * cell + 3 * gap;
  const x0 = o + (100 * s - gridW) / 2;
  const y0 = o + (100 * s - (3 * cell + 2 * gap)) / 2;
  ROWS.forEach((row, r) =>
    row.on.forEach((on, i) =>
      list.push({ x: x0 + i * (cell + gap), y: y0 + r * (cell + gap), w: cell, h: cell, r: 3.5 * s, c: on ? row.color : CELL }),
    ),
  );
  return list;
}

function inside(px, py, { x, y, w, h, r }) {
  if (px < x || px > x + w || py < y || py > y + h) return false;
  const cx = Math.min(Math.max(px, x + r), x + w - r);
  const cy = Math.min(Math.max(py, y + r), y + h - r);
  return (px - cx) ** 2 + (py - cy) ** 2 <= r * r;
}

function render(size, { safe = false } = {}) {
  const list = shapes(safe);
  const SS = 4; // Supersampling für weiche Kanten
  const rgba = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = ((x + (sx + 0.5) / SS) / size) * 100;
          const py = ((y + (sy + 0.5) / SS) / size) * 100;
          let c = safe ? BG : null;
          for (const s of list) if (inside(px, py, s)) c = s.c;
          if (c) {
            r += c[0]; g += c[1]; b += c[2]; a += 255;
          }
        }
      }
      const n = SS * SS;
      const i = (y * size + x) * 4;
      const cov = a / n;
      rgba[i] = cov ? Math.round((r / n) * (255 / cov)) : 0;
      rgba[i + 1] = cov ? Math.round((g / n) * (255 / cov)) : 0;
      rgba[i + 2] = cov ? Math.round((b / n) * (255 / cov)) : 0;
      rgba[i + 3] = Math.round(cov);
    }
  }
  return rgba;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size, opts) {
  const rgba = render(size, opts);
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // Bittiefe
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function svg() {
  const hex = (c) => `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
  const rects = shapes(false)
    .map((s) => `<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" rx="${s.r}" fill="${hex(s.c)}"/>`)
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${rects}</svg>\n`;
}

writeFileSync(new URL('icon-192.png', OUT), png(192));
writeFileSync(new URL('icon-512.png', OUT), png(512));
writeFileSync(new URL('apple-touch-icon.png', OUT), png(180, { safe: true }));
writeFileSync(new URL('icon-maskable-512.png', OUT), png(512, { safe: true }));
writeFileSync(new URL('icon.svg', OUT), svg());
console.log('Icons erzeugt in public/icons/');
