/* Ma Cave — générateur des icônes PNG (apple-touch 180, maskable 192/512).
 * Node pur, zéro dépendance : rasterise la même scène vectorielle que icon.svg
 * (voûte en pierre + 3 bouteilles, charte bordeaux/crème/riesling).
 * Lancé par "npm run build" (prebuild) → public/*.png regénérés à chaque build. */
"use strict";
const { deflateSync } = require("zlib");
const { writeFileSync, mkdirSync } = require("fs");
const { dirname } = require("path");

const CREAM = [250, 246, 241], BOR1 = [138, 53, 71], BOR2 = [106, 40, 54];
const DARK = [82, 32, 44], GOLD = [217, 197, 137], LABEL = [122, 46, 62];
const W = 26, B = 94, R = 34; // murs gauche/droite de la voûte, rayon de l'arc

const lerp = (a, b, t) => [0, 1, 2].map(i => Math.round(a[i] + (b[i] - a[i]) * t));
const bg = y => lerp(BOR1, BOR2, Math.max(0, Math.min(1, y / 120)));
const hyp = Math.hypot;

function dseg(px, py, ax, ay, bx, by) {
  const vx = bx - ax, vy = by - ay, L = vx * vx + vy * vy;
  const t = L === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / L));
  return hyp(px - (ax + t * vx), py - (ay + t * vy));
}
function sdrr(px, py, cx, cy, hw, hh, r) {
  const dx = Math.abs(px - cx) - hw + r, dy = Math.abs(py - cy) - hh + r;
  return Math.min(Math.max(dx, dy), 0) + hyp(Math.max(dx, 0), Math.max(dy, 0)) - r;
}

const JOINTS = [[44.5, 30.6, 48.1, 35.8], [75.5, 30.6, 71.9, 35.8], [33.6, 43.4, 39.4, 46.4]];
const BOTTLES = [[45, CREAM], [60, GOLD], [75, CREAM]];

function scene(x, y) {
  let c = bg(y);
  if ((x - 60) ** 2 + (y - 58) ** 2 <= 45 * 45) c = lerp(c, CREAM, 0.05);
  const inside = (B <= y && y <= 94 && W <= x && x <= B) || (y < B && (x - 60) ** 2 + (y - B) ** 2 <= R * R);
  if (inside) c = DARK;
  let d = Math.min(dseg(x, y, W, 94, W, B), dseg(x, y, B, 94, B, B));
  if (y <= B) d = Math.min(d, Math.abs(hyp(x - 60, y - B) - R));
  if (d <= 1.7) c = CREAM;
  for (const [ax, ay, bx, by] of JOINTS) if (dseg(x, y, ax, ay, bx, by) <= 0.75) c = lerp(c, CREAM, 0.85);
  for (const [cx, col] of BOTTLES) {
    if (sdrr(x, y, cx, 81, 3.5, 11, 2) <= 0 || (cx - 1.4 <= x && x <= cx + 1.4 && 62 <= y && y <= 72)) c = col;
    if (sdrr(x, y, cx, 79.2, 2.3, 3.2, 0.8) <= 0) c = LABEL;
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
    raw[o++] = 0; // octet de filtre de la ligne
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

console.log("Icônes PWA :");
render(180, 1.0, "public/apple-touch-icon.png");
render(192, 0.74, "public/icon-192.png");
render(512, 0.74, "public/icon-512.png");
