// Generates placeholder PWA icons (solid brand square with a white "K") into public/.
// Run with `pnpm --filter @kanbit/web icons`. Output PNGs are committed.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const BRAND = [0x4f, 0x46, 0xe5];
const WHITE = [0xff, 0xff, 0xff];
const publicDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');

/** Distance from point (px, py) to segment (ax, ay)-(bx, by). */
function distanceToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/**
 * @param size icon edge in px
 * @param glyphScale fraction of the icon the "K" occupies (smaller for maskable safe zone)
 */
function renderIcon(size, glyphScale) {
  const png = new PNG({ width: size, height: size });
  const g = size * glyphScale;
  const left = (size - g * 0.7) / 2;
  const top = (size - g) / 2;
  const stroke = g * 0.09;
  // Strokes of the "K" in icon coordinates: stem, upper arm, lower leg.
  const stemX = left + stroke;
  const joinY = top + g * 0.55;
  const segments = [
    [stemX, top + stroke, stemX, top + g - stroke],
    [stemX, joinY, left + g * 0.7 - stroke, top + stroke],
    [left + g * 0.28, top + g * 0.45, left + g * 0.7 - stroke, top + g - stroke],
  ];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const inGlyph = segments.some(([ax, ay, bx, by]) => distanceToSegment(x + 0.5, y + 0.5, ax, ay, bx, by) <= stroke);
      const [r, gr, b] = inGlyph ? WHITE : BRAND;
      const i = (size * y + x) << 2;
      png.data[i] = r;
      png.data[i + 1] = gr;
      png.data[i + 2] = b;
      png.data[i + 3] = 0xff;
    }
  }
  return PNG.sync.write(png);
}

mkdirSync(publicDir, { recursive: true });
const icons = [
  ['pwa-192x192.png', 192, 0.6],
  ['pwa-512x512.png', 512, 0.6],
  // Maskable: keep the glyph inside the 80% safe zone.
  ['maskable-512x512.png', 512, 0.45],
  ['apple-touch-icon.png', 180, 0.6],
];
for (const [name, size, scale] of icons) {
  writeFileSync(join(publicDir, name), renderIcon(size, scale));
  console.log(`wrote public/${name}`);
}
