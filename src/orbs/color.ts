/** Colour utilities: hex ⇄ sRGB ⇄ OKLab, palette generation, and palette extraction from images. */

export type RGB = [number, number, number];
export type Lab = [number, number, number];

export function hexToRgb(hex: string): RGB {
  const h = hex.replace('#', '');
  const v = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.padEnd(6, '0');
  return [parseInt(v.slice(0, 2), 16) / 255, parseInt(v.slice(2, 4), 16) / 255, parseInt(v.slice(4, 6), 16) / 255];
}

export function rgbToHex([r, g, b]: RGB): string {
  const c = (x: number) => Math.round(Math.min(1, Math.max(0, x)) * 255).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toSrgb = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.max(0, c) ** (1 / 2.4) - 0.055);

export function rgbToOklab([r, g, b]: RGB): Lab {
  const R = toLinear(r), G = toLinear(g), B = toLinear(b);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

export function oklabToRgb([L, a, b]: Lab): RGB {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    toSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    toSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    toSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

export const hexToOklab = (hex: string) => rgbToOklab(hexToRgb(hex));

export const hexToLinear = (hex: string): RGB => hexToRgb(hex).map(toLinear) as RGB;

/** Small deterministic PRNG (mulberry32). */
export function rng(seed: number) {
  let a = (seed * 2654435761) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A harmonious palette in OKLCh: a base hue with analogous / split / triadic companions. */
export function randomPalette(seed: number, count: number): string[] {
  const rand = rng(seed + 101);
  const base = rand() * Math.PI * 2;
  const schemes = [
    [0, 0.35, 0.7, -0.35, 1.05, -0.7],
    [0, Math.PI, 0.3, Math.PI + 0.3, -0.3, Math.PI - 0.3],
    [0, (2 * Math.PI) / 3, (4 * Math.PI) / 3, 0.25, (2 * Math.PI) / 3 + 0.25, -0.25],
    [0, 0.5, Math.PI * 0.85, 1.0, -0.4, Math.PI * 1.2],
  ];
  const offsets = schemes[Math.floor(rand() * schemes.length)];
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const h = base + offsets[i % offsets.length] + (rand() - 0.5) * 0.25;
    const L = 0.42 + rand() * 0.5;
    const C = 0.05 + rand() * 0.16;
    out.push(rgbToHex(oklabToRgb([L, C * Math.cos(h), C * Math.sin(h)])));
  }
  return sortByLightness(out);
}

export function sortByLightness(hexes: string[]): string[] {
  return [...hexes].sort((a, b) => hexToOklab(a)[0] - hexToOklab(b)[0]);
}

/** k-means in OKLab on a downsampled copy of the image; returns `count` colours, dark to light. */
export function extractPalette(source: CanvasImageSource & { width: number; height: number }, count: number, seed = 7): string[] {
  const size = 72;
  const k = size / Math.max(source.width, source.height);
  const w = Math.max(1, Math.round(source.width * k));
  const h = Math.max(1, Math.round(source.height * k));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(source, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h).data;

  const px: Lab[] = [];
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    px.push(rgbToOklab([data[i] / 255, data[i + 1] / 255, data[i + 2] / 255]));
  }
  if (!px.length) return randomPalette(seed, count);

  // k-means++ seeding, deterministic.
  const rand = rng(seed);
  const dist = (p: Lab, q: Lab) => (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2;
  const centers: Lab[] = [px[Math.floor(rand() * px.length)]];
  while (centers.length < count) {
    const d = px.map((p) => Math.min(...centers.map((c) => dist(p, c))));
    const total = d.reduce((a, b) => a + b, 0) || 1;
    let r = rand() * total;
    let idx = 0;
    while (idx < d.length - 1 && (r -= d[idx]) > 0) idx++;
    centers.push(px[idx]);
  }
  for (let iter = 0; iter < 10; iter++) {
    const sums = centers.map(() => [0, 0, 0, 0]);
    for (const p of px) {
      let best = 0, bd = Infinity;
      centers.forEach((c, i) => {
        const dd = dist(p, c);
        if (dd < bd) { bd = dd; best = i; }
      });
      const s = sums[best];
      s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; s[3]++;
    }
    sums.forEach((s, i) => {
      if (s[3]) centers[i] = [s[0] / s[3], s[1] / s[3], s[2] / s[3]];
    });
  }
  return sortByLightness(centers.map((c) => rgbToHex(oklabToRgb(c))));
}
