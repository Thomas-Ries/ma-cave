/* Ma Cave — générateur des icônes PNG (apple-touch 180, maskable 192/512).
 * Node pur, zéro dépendance : rasterise la même scène vectorielle que icon.svg,
 * c'est-à-dire l'icône du splash : voûte + 3 bouteilles EN TRAIT crème sur fond bordeaux.
 * Lancé par "npm run build" (prebuild) → public/*.png regénérés à chaque build. */
"use strict";
const { deflateSync } = require("zlib");
const { writeFileSync, mkdirSync } = require("fs");
const { dirname } = require("path");

const CREAM = [250, 246, 241], BOR1 = [138, 53, 71], BOR2 = [106, 40, 54];
const lerp = (a, b, t) => [0, 1, 2].map(i => Math.round(a[i] + (b[i] - a[i]) * t));
const bg = y => lerp(BOR1, BOR2, Math.max(0, Math.min(1, y / 120)));
const hyp = Math.hypot;
const STROKE = 3.75; /* demi-épaisseur du trait (7.5 / 2) */

/* distance point → segment */
function dseg(px, py, ax, ay, bx, by) {
  const vx = bx - ax, vy = by - ay, L = vx * vx + vy * vy;
  const t = L === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / L));
  return hyp(px - (ax + t * vx), py - (ay + t * vy));
}

/* cubique de Bézier échantillonnée en segments */
function cubic(p0, c1, c2, p3) {
  const out = [];
  const n = 10;
  let px = p0[0], py = p0[1];
  for (let i = 1; i <= n; i++) {
    const t = i / n, u = 1 - t;
    const x = u * u * u * p0[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * p3[0];
    const y = u * u * u * p0[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * p3[1];
    out.push([px, py, x, y]); px = x; py = y;
  }
  return out;
}

/* Les 7 sous-chemins de l'icône « cave », en coordonnées 120 (icône 24 × 5) */
const SEGS = [];
{
  const push = (...pts) => { for (let i = 0; i + 1 < pts.length; i += 2) SEGS.push([pts[i], pts[i + 1], pts[i + 2], pts[i + 3]]); };
  /* voûte */
  push(20, 105, 20, 52.5);
  SEGS.push(...cubic([20, 52.5], [20, 30.5], [38, 17.5], [60, 17.5]));
  SEGS.push(...cubic([60, 17.5], [82, 17.5], [100, 30.5], [100, 52.5]));
  push(100, 52.5, 100, 105);
  /* bouteille 1 : corps + goulot */
  push(34.5, 105, 34.5, 86);
  SEGS.push(...cubic([34.5, 86], [34.5, 82], [38, 78.5], [42, 78.5]));
  SEGS.push(...cubic([42, 78.5], [46, 78.5], [49.5, 82], [49.5, 86]));
  push(49.5, 86, 49.5, 105);
  push(39.5, 79, 39.5, 68, 44.5, 68, 44.5, 79);
  /* bouteille 2 (la grande du milieu) */
  push(52, 105, 52, 79);
  SEGS.push(...cubic([52, 79], [52, 74.5], [56, 71], [60, 71]));
  SEGS.push(...cubic([60, 71], [64, 71], [68, 74.5], [68, 79]));
  push(68, 79, 68, 105);
  push(57.5, 78, 57.5, 63.5, 62.5, 63.5, 62.5, 78);
  /* bouteille 3 */
  push(70.5, 105, 70.5, 86);
  SEGS.push(...cubic([70.5, 86], [70.5, 82], [74, 78.5], [78, 78.5]));
  SEGS.push(...cubic([78, 78.5], [82, 78.5], [85.5, 82], [85.5, 86]));
  push(85.5, 86, 85.5, 105);
  push(75.5, 79, 75.5, 68, 80.5, 68, 80.5, 79);
}
/* boîtes englobantes par groupes de 4 segments pour accélérer */
const BBOXES = [];
for (let i = 0; i < SEGS.length; i += 4) {
  const xs = [], ys = [];
  for (const s of SEGS.slice(i, i + 4)) { xs.push(s[0], s[2]); ys.push(s[1], s[3]); }
  BBOXES.push({ x0: Math.min(...xs) - 4, x1: Math.max(...xs) + 4, y0: Math.min(...ys) - 4, y1: Math.max(...ys) + 4, i0: i, n: Math.min(4, SEGS.length - i) });
}

function scene(x, y) {
  let c = bg(y);
  outer: for (const bb of BBOXES) {
    if (x < bb.x0 || x > bb.x1 || y < bb.y0 || y > bb.y1) continue;
    for (let k = 0; k < bb.n; k++) {
      const s = SEGS[bb.i0 + k];
      if (dseg(x, y, s[0], s[1], s[2], s[3]) <= STROKE) { c = CREAM; break outer; }
    }
  }
  return c;
}

let crcTable = null;
function crc32(buf) {
  if (!crcTable) { crcTable = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcTable[n] = c; } }
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const t = Buffer.from(type), d = Buffer.from(data);
  const len = Buffer.alloc(4); len.writeUInt32BE(d.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, d])));
  return Buffer.concat([len, t, d, crc]);
}

function render(size, scale, path) {
  const S = size / 120, raw = Buffer.alloc((size * 3 + 1) * size);
  let o = 0;
  for (let py = 0; py < size; py++) {
    raw[o++] = 0; // octet de filtre de la ligne (précède CHAQUE ligne de pixels)
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0;
      for (const fx of [0.25, 0.75]) for (const fy of [0.25, 0.75]) {
        const sx = (px + fx) / S, sy = (py + fy) / S;
        const [pr, pg, pb] = scene(60 + (sx - 60) / scale, 60 + (sy - 60) / scale);
        r += pr; g += pg; b += pb;
      }
      raw[o++] = r >> 2; raw[o++] = g >> 2; raw[o++] = b >> 2;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 2;
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 6 })), chunk("IEND", "")
  ]);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, png);
  console.log("  " + path + " " + size + "x" + size + " (" + (png.length / 1024).toFixed(1) + " Ko)");
}

console.log("Icônes PWA (trait « splash ») :");
render(180, 1.0, "public/apple-touch-icon.png");
render(192, 0.74, "public/icon-192.png");
render(512, 0.74, "public/icon-512.png");
