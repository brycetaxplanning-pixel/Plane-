/**
 * Generates the PWA icons as real PNGs with no image dependencies:
 * rasterise a few polygons by hand, then deflate the scanlines into a
 * minimal PNG. Run with `npm run icons`.
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { Buffer } from 'node:buffer';

const BG = [0x2a, 0x78, 0xd6];
const INK = [0xff, 0xff, 0xff];
const SS = 3; // supersampling factor per axis

/** Paper plane, in a 0–1 unit square. */
const BODY = [[0.10, 0.50], [0.90, 0.14], [0.52, 0.86], [0.42, 0.60]];
const WING = [[0.42, 0.60], [0.52, 0.86], [0.34, 0.78]];

const inside = (poly, x, y) => {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
};

const roundedSquare = (x, y, r) => {
  const cx = Math.min(Math.max(x, r), 1 - r);
  const cy = Math.min(Math.max(y, r), 1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r ** 2 || (x >= r && x <= 1 - r) || (y >= r && y <= 1 - r);
};

function render(size, { maskable = false } = {}) {
  const rows = [];
  // A maskable icon must survive a circular crop, so the mark is inset and the
  // background fills the whole square.
  const inset = maskable ? 0.20 : 0.0;
  const radius = maskable ? 0.5 : 0.22;

  for (let py = 0; py < size; py++) {
    const row = Buffer.alloc(1 + size * 4);
    row[0] = 0; // filter type: none
    for (let px = 0; px < size; px++) {
      let bg = 0;
      let ink = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const x = (px + (sx + 0.5) / SS) / size;
          const y = (py + (sy + 0.5) / SS) / size;
          if (!roundedSquare(x, y, radius)) continue;
          bg++;
          const mx = (x - inset) / (1 - inset * 2);
          const my = (y - inset) / (1 - inset * 2);
          if (mx >= 0 && mx <= 1 && my >= 0 && my <= 1 && (inside(BODY, mx, my) || inside(WING, mx, my))) ink++;
        }
      }
      const samples = SS * SS;
      const alpha = Math.round((bg / samples) * 255);
      const inkMix = bg ? ink / bg : 0;
      const off = 1 + px * 4;
      for (let c = 0; c < 3; c++) row[off + c] = Math.round(BG[c] * (1 - inkMix) + INK[c] * inkMix);
      row[off + 3] = alpha;
    }
    rows.push(row);
  }
  return Buffer.concat(rows);
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size, opts) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // colour type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(render(size, opts), { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync('public/icons', { recursive: true });
const targets = [
  ['public/icons/icon-192.png', 192, {}],
  ['public/icons/icon-512.png', 512, {}],
  ['public/icons/icon-maskable-512.png', 512, { maskable: true }],
  ['public/icons/apple-touch-icon.png', 180, { maskable: true }],
];
for (const [path, size, opts] of targets) {
  writeFileSync(path, png(size, opts));
  console.log(`wrote ${path} (${size}px)`);
}
