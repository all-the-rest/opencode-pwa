/**
 * Generate real PWA icons (no new deps, Node built-ins only).
 *
 * Source of truth: public/pwa-icon.svg (dark rounded square + ">_" terminal
 * glyph). This script rasterizes the same motif: dark background, terminal
 * window panel with traffic-light dots, ">_" prompt glyph drawn as thick
 * vector strokes, plus a maskable variant with safe-zone padding.
 *
 * Outputs:
 * - public/pwa-192x192.png (purpose any)
 * - public/pwa-512x512.png (purpose any)
 * - public/pwa-maskable-512x512.png (purpose maskable)
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(rootDir, "public");

const BG = [29, 35, 42, 255]; // #1d232a
const PANEL = [15, 20, 25, 255]; // #0f1419
const BORDER = [58, 69, 82, 255];
const FG = [166, 173, 187, 255]; // #a6adbb (prompt ">")
const ACCENT = [94, 234, 212, 255]; // teal cursor "_"
const RED = [248, 113, 113, 255];
const YELLOW = [251, 191, 36, 255];
const GREEN = [52, 211, 153, 255];

// --- CRC32 (PNG chunks) -----------------------------------------------------
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n += 1) {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  crcTable[n] = c >>> 0;
}
function crc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) crc = crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}
function encodePng(width, height, rgba) {
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y += 1) {
    raw[y * (1 + width * 4)] = 0; // filter: none
    rgba.copy(raw, y * (1 + width * 4) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// --- drawing helpers ---------------------------------------------------------
function makeCanvas(size) {
  const buf = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i += 1) {
    buf[i * 4] = BG[0];
    buf[i * 4 + 1] = BG[1];
    buf[i * 4 + 2] = BG[2];
    buf[i * 4 + 3] = BG[3];
  }
  return buf;
}
function setPixel(buf, size, x, y, color) {
  if (x < 0 || y < 0 || x >= size || y >= size) return;
  const i = (y * size + x) * 4;
  buf[i] = color[0];
  buf[i + 1] = color[1];
  buf[i + 2] = color[2];
  buf[i + 3] = color[3];
}
function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}
function strokeLine(buf, size, ax, ay, bx, by, thickness, color) {
  const r = thickness / 2;
  const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - r - 1));
  const x1 = Math.min(size - 1, Math.ceil(Math.max(ax, bx) + r + 1));
  const y0 = Math.max(0, Math.floor(Math.min(ay, by) - r - 1));
  const y1 = Math.min(size - 1, Math.ceil(Math.max(ay, by) + r + 1));
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      if (distToSegment(x + 0.5, y + 0.5, ax, ay, bx, by) <= r) {
        setPixel(buf, size, x, y, color);
      }
    }
  }
}
function fillCircle(buf, size, cx, cy, radius, color) {
  const x0 = Math.max(0, Math.floor(cx - radius - 1));
  const x1 = Math.min(size - 1, Math.ceil(cx + radius + 1));
  const y0 = Math.max(0, Math.floor(cy - radius - 1));
  const y1 = Math.min(size - 1, Math.ceil(cy + radius + 1));
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= radius) setPixel(buf, size, x, y, color);
    }
  }
}
function fillRect(buf, size, x0, y0, x1, y1, color) {
  for (let y = Math.max(0, y0); y < Math.min(size, y1); y += 1) {
    for (let x = Math.max(0, x0); x < Math.min(size, x1); x += 1) {
      setPixel(buf, size, x, y, color);
    }
  }
}

function drawIcon(size, { maskable }) {
  const buf = makeCanvas(size);
  const s = size / 512;
  // Panel inset: maskable keeps a wide safe-zone margin so OS masks never
  // clip the glyph; regular icons use a tighter margin.
  const margin = maskable ? Math.round(size * 0.24) : Math.round(size * 0.13);
  const x0 = margin;
  const y0 = margin;
  const x1 = size - margin;
  const y1 = size - margin;
  const borderPx = Math.max(2, Math.round(4 * s));

  fillRect(buf, size, x0, y0, x1, y1, PANEL);
  // border
  fillRect(buf, size, x0, y0, x1, y0 + borderPx, BORDER);
  fillRect(buf, size, x0, y1 - borderPx, x1, y1, BORDER);
  fillRect(buf, size, x0, y0, x0 + borderPx, y1, BORDER);
  fillRect(buf, size, x1 - borderPx, y0, x1, y1, BORDER);

  const cx = size / 2;
  const cy = size / 2 + (maskable ? 0 : 8 * s);
  const glyphScale = maskable ? 0.72 : 1;

  // traffic-light dots (terminal window hint)
  const dotR = 11 * s * (maskable ? 0.8 : 1);
  const dotY = y0 + 34 * s;
  const dotX = x0 + 40 * s;
  const gap = 34 * s;
  fillCircle(buf, size, dotX, dotY, dotR, RED);
  fillCircle(buf, size, dotX + gap, dotY, dotR, YELLOW);
  fillCircle(buf, size, dotX + 2 * gap, dotY, dotR, GREEN);

  // ">_" prompt glyph, centered in the panel
  const u = 64 * s * glyphScale; // unit
  const thick = Math.max(3, Math.round(22 * s * (maskable ? 0.85 : 1)));
  const gx = cx - 0.32 * u;
  const gy = cy + 0.1 * u;
  // ">" chevron
  strokeLine(buf, size, gx - 0.9 * u, gy - 0.75 * u, gx - 0.1 * u, gy, thick, FG);
  strokeLine(buf, size, gx - 0.1 * u, gy, gx - 0.9 * u, gy + 0.75 * u, thick, FG);
  // "_" cursor
  strokeLine(buf, size, gx + 0.35 * u, gy + 0.75 * u, gx + 1.35 * u, gy + 0.75 * u, thick, ACCENT);

  return encodePng(size, size, buf);
}

const png192 = drawIcon(192, { maskable: false });
const png512 = drawIcon(512, { maskable: false });
const maskable512 = drawIcon(512, { maskable: true });

writeFileSync(join(outDir, "pwa-192x192.png"), png192);
writeFileSync(join(outDir, "pwa-512x512.png"), png512);
writeFileSync(join(outDir, "pwa-maskable-512x512.png"), maskable512);
console.log("wrote pwa-192x192.png, pwa-512x512.png, pwa-maskable-512x512.png");
