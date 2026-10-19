// Generates installer/civsar-ttx.ico from the same mark as public/icon.svg, with no image
// libraries: shapes are drawn as signed-distance fields (which anti-alias for free) and written
// as classic 32-bit DIB entries, the format every Windows version accepts in an .ico.
//   node installer/make-icon.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SIZES = [16, 24, 32, 48, 64, 128, 256];

// palette from public/icon.svg
const BG = [0x0f, 0x17, 0x20], AMBER = [0xf5, 0x9e, 0x0b], RED = [0xef, 0x44, 0x44];

const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
// distance to a rounded rectangle centred on the canvas
const sdRoundRect = (x, y, hw, hh, r) => {
  const qx = Math.abs(x) - hw + r, qy = Math.abs(y) - hh + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
};
// distance to a line segment with round caps
const sdCapsule = (x, y, ax, ay, bx, by, r) => {
  const px = x - ax, py = y - ay, dx = bx - ax, dy = by - ay;
  const h = clamp((px * dx + py * dy) / (dx * dx + dy * dy));
  return Math.hypot(px - dx * h, py - dy * h) - r;
};

/** Paint one square icon; returns BGRA bytes, top-down. */
function render(S) {
  const px = 64 / S;                       // one device pixel, in the SVG's 64-unit space
  const aa = d => clamp(0.5 - d / px);     // coverage from a signed distance
  const out = Buffer.alloc(S * S * 4);
  for (let iy = 0; iy < S; iy++) for (let ix = 0; ix < S; ix++) {
    const x = (ix + 0.5) * px, y = (iy + 0.5) * px;             // 0..64
    let r = 0, g = 0, b = 0, a = 0;
    const over = (col, cov) => { if (cov <= 0) return; const k = clamp(cov);
      r = col[0] * k + r * (1 - k); g = col[1] * k + g * (1 - k); b = col[2] * k + b * (1 - k); a = k + a * (1 - k); };
    over(BG, aa(sdRoundRect(x - 32, y - 32, 32, 32, 14)));       // panel
    over(AMBER, aa(Math.abs(Math.hypot(x - 32, y - 32) - 18) - 2)); // ring, stroke-width 4
    for (const [ax, ay, bx, by] of [[32, 8, 32, 20], [32, 44, 32, 56], [8, 32, 20, 32], [44, 32, 56, 32]])
      over(AMBER, aa(sdCapsule(x, y, ax, ay, bx, by, 2)));       // crosshair ticks
    over(RED, aa(Math.hypot(x - 32, y - 32) - 5));               // centre
    const o = (iy * S + ix) * 4;
    out[o] = Math.round(b); out[o + 1] = Math.round(g); out[o + 2] = Math.round(r); out[o + 3] = Math.round(a * 255);
  }
  return out;
}

/** Wrap BGRA pixels as an ICO image entry: BITMAPINFOHEADER + bottom-up XOR + AND mask. */
function dibEntry(bgra, S) {
  const hdr = Buffer.alloc(40);
  hdr.writeUInt32LE(40, 0); hdr.writeInt32LE(S, 4); hdr.writeInt32LE(S * 2, 8);  // height counts both masks
  hdr.writeUInt16LE(1, 12); hdr.writeUInt16LE(32, 14); hdr.writeUInt32LE(0, 16);
  hdr.writeUInt32LE(S * S * 4, 20);
  const xor = Buffer.alloc(S * S * 4);
  for (let y = 0; y < S; y++) bgra.copy(xor, (S - 1 - y) * S * 4, y * S * 4, (y + 1) * S * 4); // flip
  const maskRow = Math.ceil(S / 32) * 4;                      // 1bpp, rows padded to 4 bytes
  return Buffer.concat([hdr, xor, Buffer.alloc(maskRow * S)]); // all-zero mask: alpha does the work
}

const images = SIZES.map(S => ({ S, data: dibEntry(render(S), S) }));
const head = Buffer.alloc(6 + 16 * images.length);
head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(images.length, 4);
let offset = head.length;
images.forEach((im, i) => {
  const e = 6 + i * 16;
  head[e] = im.S >= 256 ? 0 : im.S; head[e + 1] = im.S >= 256 ? 0 : im.S;   // 0 means 256
  head[e + 2] = 0; head[e + 3] = 0;
  head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6);
  head.writeUInt32LE(im.data.length, e + 8); head.writeUInt32LE(offset, e + 12);
  offset += im.data.length;
});
const ico = Buffer.concat([head, ...images.map(i => i.data)]);
const dest = path.join(HERE, 'civsar-ttx.ico');
fs.writeFileSync(dest, ico);
console.log(`wrote ${dest} — ${images.length} sizes (${SIZES.join(', ')}), ${(ico.length / 1024).toFixed(0)} KB`);
