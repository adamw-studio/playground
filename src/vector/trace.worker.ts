/// <reference lib="webworker" />
import ImageTracer, { type TracePath } from 'imagetracerjs';
import type { RawLayer, TraceRequest, TraceResponse } from './types';

type RGB = [number, number, number];

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Mean colour of the outermost pixel ring — our guess at the background. */
function borderColor(data: Uint8ClampedArray, w: number, h: number): RGB {
  const acc = [0, 0, 0];
  let n = 0;
  const add = (x: number, y: number) => {
    const i = (y * w + x) * 4;
    acc[0] += data[i];
    acc[1] += data[i + 1];
    acc[2] += data[i + 2];
    n++;
  };
  for (let x = 0; x < w; x++) {
    add(x, 0);
    add(x, h - 1);
  }
  for (let y = 1; y < h - 1; y++) {
    add(0, y);
    add(w - 1, y);
  }
  return [acc[0] / n, acc[1] / n, acc[2] / n];
}

const luminance = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/** Flattens a traced path's line and quadratic segments into a closed polyline. */
function toPoints(path: TracePath): number[] {
  const pts: number[] = [];
  const segs = path.segments;
  if (!segs.length) return pts;
  pts.push(segs[0].x1, segs[0].y1);
  for (const s of segs) {
    if (s.type === 'L') {
      pts.push(s.x2, s.y2);
    } else {
      for (const t of [0.25, 0.5, 0.75, 1]) {
        const u = 1 - t;
        pts.push(u * u * s.x1 + 2 * u * t * s.x2 + t * t * s.x3!, u * u * s.y1 + 2 * u * t * s.y2 + t * t * s.y3!);
      }
    }
  }
  const n = pts.length;
  if (n >= 4 && pts[0] === pts[n - 2] && pts[1] === pts[n - 1]) pts.length = n - 2;
  return pts;
}

/** Ramer–Douglas–Peucker on a flat point list. */
function simplify(pts: number[], eps: number): number[] {
  const n = pts.length / 2;
  if (n < 4 || eps <= 0) return pts;
  const keep = new Uint8Array(n);
  keep[0] = keep[n - 1] = 1;
  const stack = [0, n - 1];
  const eps2 = eps * eps;
  while (stack.length) {
    const b = stack.pop()!;
    const a = stack.pop()!;
    const ax = pts[a * 2], ay = pts[a * 2 + 1];
    const dx = pts[b * 2] - ax, dy = pts[b * 2 + 1] - ay;
    const len2 = dx * dx + dy * dy || 1e-9;
    let max = 0, idx = -1;
    for (let i = a + 1; i < b; i++) {
      const px = pts[i * 2] - ax, py = pts[i * 2 + 1] - ay;
      const cross = px * dy - py * dx;
      const d2 = (cross * cross) / len2;
      if (d2 > max) {
        max = d2;
        idx = i;
      }
    }
    if (idx >= 0 && max > eps2) {
      keep[idx] = 1;
      stack.push(a, idx, idx, b);
    }
  }
  const out: number[] = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(pts[i * 2], pts[i * 2 + 1]);
  return out.length >= 6 ? out : pts;
}

function polygonArea(pts: number[]): number {
  let a = 0;
  for (let i = 0, n = pts.length; i < n; i += 2) {
    const j = (i + 2) % n;
    a += pts[i] * pts[j + 1] - pts[j] * pts[i + 1];
  }
  return Math.abs(a) / 2;
}

function trace(req: TraceRequest): { layers: RawLayer[]; pointCount: number } {
  const { width: w, height: h, scale, options: o } = req;
  const data = new Uint8ClampedArray(req.pixels);
  const n = w * h;

  if (o.invert) {
    for (let i = 0; i < n * 4; i += 4) {
      data[i] = 255 - data[i];
      data[i + 1] = 255 - data[i + 1];
      data[i + 2] = 255 - data[i + 2];
    }
  }

  const base = {
    ltres: lerp(3, 0.4, o.detail),
    qtres: lerp(3, 0.4, o.detail),
    pathomit: 4,
    rightangleenhance: true,
    blurradius: Math.round(o.smoothing * 4),
    blurdelta: 32,
    layering: 0,
    linefilter: false,
  };

  let input = data;
  let colors: RGB[];
  let background = -1;
  let tracerOptions: Record<string, unknown>;

  if (o.mode === 'mono') {
    // Binarize ourselves so the threshold is exact; keep each side's true mean colour.
    const bin = new Uint8ClampedArray(n * 4);
    const sum = [
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ];
    for (let p = 0, i = 0; p < n; p++, i += 4) {
      const dark = data[i + 3] > 127 && luminance(data[i], data[i + 1], data[i + 2]) < o.threshold;
      const k = dark ? 0 : 1;
      sum[k][0] += data[i];
      sum[k][1] += data[i + 1];
      sum[k][2] += data[i + 2];
      sum[k][3]++;
      const v = dark ? 0 : 255;
      bin[i] = bin[i + 1] = bin[i + 2] = v;
      bin[i + 3] = 255;
    }
    colors = sum.map((s, k) => (s[3] ? [s[0] / s[3], s[1] / s[3], s[2] / s[3]] : k ? [255, 255, 255] : [20, 20, 20])) as RGB[];
    const edge = borderColor(bin, w, h);
    background = edge[0] < 128 ? 0 : 1;
    input = bin;
    tracerOptions = {
      ...base,
      numberofcolors: 2,
      colorquantcycles: 1,
      pal: [
        { r: 0, g: 0, b: 0, a: 255 },
        { r: 255, g: 255, b: 255, a: 255 },
      ],
    };
  } else {
    tracerOptions = { ...base, numberofcolors: o.colors, colorsampling: 2, colorquantcycles: 3, mincolorratio: 0 };
    colors = [];
  }

  const traced = ImageTracer.imagedataToTracedata({ width: w, height: h, data: input }, tracerOptions);

  if (o.mode === 'color') {
    colors = traced.palette.map((c) => [c.r, c.g, c.b] as RGB);
    const edge = borderColor(data, w, h);
    let best = Infinity;
    colors.forEach((c, k) => {
      const d = (c[0] - edge[0]) ** 2 + (c[1] - edge[1]) ** 2 + (c[2] - edge[2]) ** 2;
      if (d < best) {
        best = d;
        background = k;
      }
    });
  }

  // Area threshold is expressed against a 1000px long side so it means the same at any detail level.
  const norm = (1000 / Math.max(w, h)) ** 2;
  const eps = 0.15 + o.smoothing * 1.6;
  let pointCount = 0;
  const layers: RawLayer[] = [];

  traced.layers.forEach((paths, k) => {
    if (o.removeBg && k === background) return;
    if (traced.palette[k]?.a !== undefined && traced.palette[k].a < 128) return;
    const shapes: RawLayer['shapes'] = [];
    for (const path of paths) {
      if (path.isholepath) continue;
      const outer = simplify(toPoints(path), eps);
      if (outer.length < 6 || polygonArea(outer) * norm < o.minArea) continue;
      const contours = [outer];
      for (const hi of path.holechildren) {
        const hole = simplify(toPoints(paths[hi]), eps);
        if (hole.length >= 6 && polygonArea(hole) * norm >= o.minArea) contours.push(hole);
      }
      const [x0, y0, x1, y1] = path.boundingbox;
      shapes.push({
        contours: contours.map((c) => {
          pointCount += c.length / 2;
          return Float32Array.from(c, (v) => v * scale);
        }),
        cx: ((x0 + x1) / 2) * scale,
        cy: ((y0 + y1) / 2) * scale,
      });
    }
    if (shapes.length) layers.push({ color: colors[k], shapes });
  });

  return { layers, pointCount };
}

self.onmessage = (e: MessageEvent<TraceRequest>) => {
  const t0 = performance.now();
  try {
    const { layers, pointCount } = trace(e.data);
    const transfer = layers.flatMap((l) => l.shapes.flatMap((s) => s.contours.map((c) => c.buffer)));
    const msg: TraceResponse = { id: e.data.id, ok: true, layers, pointCount, ms: performance.now() - t0 };
    (self as DedicatedWorkerGlobalScope).postMessage(msg, transfer);
  } catch (err) {
    const msg: TraceResponse = { id: e.data.id, ok: false, error: String(err) };
    (self as DedicatedWorkerGlobalScope).postMessage(msg);
  }
};
