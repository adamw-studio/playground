import type { Frame } from '../engine/params';
import { hash2, signedNoise } from '../engine/noise';
import type { VectorArt, VectorLayer } from './types';

/** 2D affine matrix [a, b, c, d, e, f] — x' = a·x + c·y + e, y' = b·x + d·y + f. */
type Mat = [number, number, number, number, number, number];

const I: Mat = [1, 0, 0, 1, 0, 0];
const mul = (m: Mat, n: Mat): Mat => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];
const translate = (x: number, y: number): Mat => [1, 0, 0, 1, x, y];
const rotate = (a: number): Mat => [Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0];
const scale = (x: number, y: number = x): Mat => [x, 0, 0, y, 0, 0];
/** Reflection across the line through the origin at angle a. */
const reflect = (a: number): Mat => [Math.cos(2 * a), Math.sin(2 * a), Math.sin(2 * a), -Math.cos(2 * a), 0, 0];
const chain = (...ms: Mat[]) => ms.reduce(mul, I);

/** Upper bound on tile × symmetry copies per frame, so extreme settings stay interactive. */
const MAX_COPIES = 900;
const DEG = Math.PI / 180;

/** Receives the transformed geometry. Canvas drawing and SVG export are both visitors. */
export interface PathVisitor {
  beginSegment(clip: number[] | null): void;
  endSegment(): void;
  beginPath(layer: VectorLayer): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  closePath(): void;
  endPath(layer: VectorLayer): void;
}

export interface WalkStats {
  copies: number;
  points: number;
}

/**
 * Walks the traced geometry through composition (repeat, spacing, mirror, randomness,
 * radial / kaleidoscope), per-shape geometry (scale, rotation, displacement, spin) and
 * per-point distortion (organic warp, wave, noise, radial bulge), emitting real coordinates.
 */
export function walkVector(
  art: VectorArt,
  f: Frame,
  W: number,
  H: number,
  v: PathVisitor,
  /** Points closer than this (output px) to the previous one are skipped — level of detail for small copies. */
  minSegment = 0.6,
): WalkStats {
  const t = f.time;
  const cx = W / 2;
  const cy = H / 2;

  // Composition block, matching the raster study's scale / offset / rotation / repeat.
  const repX = Math.max(1, f.repeatX);
  const repY = Math.max(1, f.repeatY);
  const blockW = W * f.scale;
  const blockH = H * f.scale;
  const tw = blockW / repX;
  const th = blockH / repY;
  const block = chain(translate(cx + f.offsetX * W, cy + f.offsetY * H), rotate(f.rotation * DEG), translate(-blockW / 2, -blockH / 2));

  let i0 = 0;
  let i1 = Math.ceil(repX - 1e-6) - 1;
  let j0 = 0;
  let j1 = Math.ceil(repY - 1e-6) - 1;
  if (f.wrap) {
    // Tile indices that cover the whole frame once the block is rotated and offset.
    const inv = invert(block);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [x, y] of [[0, 0], [W, 0], [0, H], [W, H]]) {
      const lx = inv[0] * x + inv[2] * y + inv[4];
      const ly = inv[1] * x + inv[3] * y + inv[5];
      minX = Math.min(minX, lx); maxX = Math.max(maxX, lx);
      minY = Math.min(minY, ly); maxY = Math.max(maxY, ly);
    }
    i0 = Math.floor(minX / tw) - 1;
    i1 = Math.ceil(maxX / tw);
    j0 = Math.floor(minY / th) - 1;
    j1 = Math.ceil(maxY / th);
  }

  const segments = Math.max(1, Math.round(f.symmetry));
  const kaleido = f.kaleido && segments > 1;
  const theta = (2 * Math.PI) / segments;
  const tiles = (i1 - i0 + 1) * (j1 - j0 + 1);
  if (tiles * segments > MAX_COPIES) {
    // Trim the tile range symmetrically around its centre.
    const keep = Math.sqrt(MAX_COPIES / segments / tiles);
    const ci = (i0 + i1) / 2, hi = ((i1 - i0 + 1) * keep) / 2;
    const cj = (j0 + j1) / 2, hj = ((j1 - j0 + 1) * keep) / 2;
    i0 = Math.floor(ci - hi); i1 = Math.ceil(ci + hi);
    j0 = Math.floor(cj - hj); j1 = Math.ceil(cj + hj);
  }

  // Breathing gently modulates spacing and shape size over time.
  const pulse = Math.sin(t * 1.4);
  const spacing = Math.min(0.95, f.spacing + f.breathe * 0.2 * (0.5 + 0.5 * Math.sin(t * 0.9)));
  const shapeK = f.shapeScale * (1 + 0.3 * f.breathe * pulse);
  const spinA = (f.shapeRotate + f.spin * t) * DEG;
  const disp = f.displacement * Math.max(art.width, art.height) * 0.08;
  const mx = f.mirror === 'x' || f.mirror === 'xy';
  const my = f.mirror === 'y' || f.mirror === 'xy';
  const r = f.randomness;

  // Per-point distortion, in output pixels.
  const waveA = f.waveAmp * W;
  const waveK = (2 * Math.PI * f.waveFreq) / H;
  const waveT = t * 2.2;
  const noiseA = f.noise * W * 0.012;
  const noiseF = 60 / W;
  const orgA = f.organic * W * 0.07;
  const radK = f.radial;
  const radR = Math.hypot(W, H) / 2;
  const distort = waveA > 0 || noiseA > 0 || orgA > 0 || radK !== 0;

  // Copies whose bounds can't reach the visible area (or their kaleidoscope wedge) are skipped.
  const reach =
    waveA + noiseA + orgA + Math.max(W, H) * (Math.max(0, shapeK - 1) * 0.5 + r * 0.4 + f.displacement * 0.1);
  const cull = radK === 0;
  const minSeg2 = minSegment * minSegment;

  let px = 0;
  let py = 0;
  const project = (m: Mat, x: number, y: number) => {
    let X = m[0] * x + m[2] * y + m[4];
    let Y = m[1] * x + m[3] * y + m[5];
    if (distort) {
      if (orgA > 0) {
        const ox = signedNoise(X / W * 2.3 + t * 0.12, Y / H * 2.3);
        const oy = signedNoise(X / W * 2.3 + 17.1, Y / H * 2.3 - t * 0.12);
        X += orgA * ox;
        Y += orgA * oy;
      }
      if (waveA > 0) X += waveA * Math.sin(waveK * Y + waveT);
      if (noiseA > 0) {
        const nx = signedNoise(X * noiseF, Y * noiseF + t);
        const ny = signedNoise(X * noiseF + 31.7, Y * noiseF - t);
        X += noiseA * nx;
        Y += noiseA * ny;
      }
      if (radK !== 0) {
        const dx = X - cx, dy = Y - cy;
        const q = Math.min(1, Math.hypot(dx, dy) / radR);
        const k = Math.max(0, 1 + radK * (1 - q * q));
        X = cx + dx * k;
        Y = cy + dy * k;
      }
    }
    px = X;
    py = Y;
  };

  let copies = 0;
  let points = 0;

  for (let s = 0; s < segments; s++) {
    let radial: Mat;
    if (!kaleido) radial = chain(translate(cx, cy), rotate(s * theta), translate(-cx, -cy));
    else if (s % 2 === 0) radial = chain(translate(cx, cy), rotate(s * theta), translate(-cx, -cy));
    else radial = chain(translate(cx, cy), rotate((s - 1) * theta), reflect(theta), translate(-cx, -cy));

    const clip = kaleido ? wedge(cx, cy, s * theta, (s + 1) * theta, radR * 2.2) : null;
    const [bx0, by0, bx1, by1] = clip ? bounds(clip, 0, 0, W, H) : [0, 0, W, H];
    v.beginSegment(clip);

    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const h1 = hash2(i * 92821 + 7, j * 68917 + 3);
        const h2 = hash2(i * 3571 + 11, j * 1879 + 5);
        const h3 = hash2(i * 6007 + 13, j * 8111 + 17);
        const h4 = hash2(i * 4229 + 19, j * 2797 + 23);
        const fx = mx && (i & 1) ? -1 : 1;
        const fy = my && (j & 1) ? -1 : 1;
        const k = (1 - spacing) * (1 + r * (h2 * 2 - 1) * 0.5);
        const copy = chain(
          radial,
          block,
          translate((i + 0.5) * tw + r * (h3 * 2 - 1) * tw * 0.5, (j + 0.5) * th + r * (h4 * 2 - 1) * th * 0.5),
          rotate(r * (h1 * 2 - 1) * Math.PI),
          scale((fx * k * tw) / art.width, (fy * k * th) / art.height),
          translate(-art.width / 2, -art.height / 2),
        );
        if (cull) {
          const [x0, y0, x1, y1] = boxOf(copy, art.width, art.height);
          if (x1 < bx0 - reach || x0 > bx1 + reach || y1 < by0 - reach || y0 > by1 + reach) continue;
        }
        copies++;

        for (const layer of art.layers) {
          v.beginPath(layer);
          for (const shape of layer.shapes) {
            const dx = disp ? disp * signedNoise(shape.seed * 1.37, t * 0.25) : 0;
            const dy = disp ? disp * signedNoise(shape.seed * 1.37 + 71.3, t * 0.25 + 9.1) : 0;
            const m =
              shapeK === 1 && spinA === 0 && !disp
                ? copy
                : chain(copy, translate(shape.cx + dx, shape.cy + dy), rotate(spinA), scale(shapeK), translate(-shape.cx, -shape.cy));
            for (const c of shape.contours) {
              project(m, c[0], c[1]);
              v.moveTo(px, py);
              let lx = px;
              let ly = py;
              let emitted = 1;
              const last = c.length - 2;
              for (let q = 2; q < c.length; q += 2) {
                project(m, c[q], c[q + 1]);
                const ddx = px - lx;
                const ddy = py - ly;
                if (q !== last && ddx * ddx + ddy * ddy < minSeg2) continue;
                v.lineTo(px, py);
                lx = px;
                ly = py;
                emitted++;
              }
              v.closePath();
              points += emitted;
            }
          }
          v.endPath(layer);
        }
      }
    }
    v.endSegment();
  }
  return { copies, points };
}

/** Axis-aligned bounds of a w×h rectangle under m. */
function boxOf(m: Mat, w: number, h: number): [number, number, number, number] {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of [[0, 0], [w, 0], [0, h], [w, h]]) {
    const X = m[0] * x + m[2] * y + m[4];
    const Y = m[1] * x + m[3] * y + m[5];
    x0 = Math.min(x0, X); x1 = Math.max(x1, X);
    y0 = Math.min(y0, Y); y1 = Math.max(y1, Y);
  }
  return [x0, y0, x1, y1];
}

/** Bounds of a flat polygon, intersected with the frame. */
function bounds(pts: number[], fx0: number, fy0: number, fx1: number, fy1: number): [number, number, number, number] {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < pts.length; i += 2) {
    x0 = Math.min(x0, pts[i]); x1 = Math.max(x1, pts[i]);
    y0 = Math.min(y0, pts[i + 1]); y1 = Math.max(y1, pts[i + 1]);
  }
  return [Math.max(x0, fx0), Math.max(y0, fy0), Math.min(x1, fx1), Math.min(y1, fy1)];
}

function invert(m: Mat): Mat {
  const det = m[0] * m[3] - m[1] * m[2];
  return [
    m[3] / det,
    -m[1] / det,
    -m[2] / det,
    m[0] / det,
    (m[2] * m[5] - m[3] * m[4]) / det,
    (m[1] * m[4] - m[0] * m[5]) / det,
  ];
}

/** Pie-slice polygon used to clip kaleidoscope segments. */
function wedge(cx: number, cy: number, a0: number, a1: number, radius: number): number[] {
  const pts = [cx, cy];
  const steps = Math.max(2, Math.ceil((a1 - a0) / (Math.PI / 8)));
  for (let k = 0; k <= steps; k++) {
    const a = a0 + ((a1 - a0) * k) / steps;
    pts.push(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius);
  }
  return pts;
}

const rgb = (c: [number, number, number], k = 1) =>
  `rgb(${Math.round(c[0] * k)},${Math.round(c[1] * k)},${Math.round(c[2] * k)})`;

/** Stroke width is set against a 600px-wide frame so it reads the same on screen and in exports. */
const strokePx = (f: Frame, W: number) => (f.strokeWidth * W) / 600;

/** Live view: draws the walked geometry straight into a 2D canvas. */
export class CanvasVisitor implements PathVisitor {
  constructor(
    private ctx: CanvasRenderingContext2D,
    private f: Frame,
    W: number,
  ) {
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.lineWidth = strokePx(f, W);
    ctx.globalAlpha = Math.max(0, Math.min(1, f.opacity));
  }

  beginSegment(clip: number[] | null) {
    this.ctx.save();
    if (clip) {
      this.ctx.beginPath();
      this.ctx.moveTo(clip[0], clip[1]);
      for (let i = 2; i < clip.length; i += 2) this.ctx.lineTo(clip[i], clip[i + 1]);
      this.ctx.closePath();
      this.ctx.clip();
    }
  }

  endSegment() {
    this.ctx.restore();
  }

  beginPath() {
    this.ctx.beginPath();
  }

  moveTo(x: number, y: number) {
    this.ctx.moveTo(x, y);
  }

  lineTo(x: number, y: number) {
    this.ctx.lineTo(x, y);
  }

  closePath() {
    this.ctx.closePath();
  }

  endPath(layer: VectorLayer) {
    const { ctx, f } = this;
    if (f.render !== 'line') {
      ctx.fillStyle = rgb(layer.color);
      ctx.fill('evenodd');
    }
    if (f.render !== 'fill' && f.strokeWidth > 0) {
      ctx.strokeStyle = rgb(layer.color, f.render === 'both' ? 0.55 : 1);
      ctx.stroke();
    }
  }
}

/** Export: the same walk, serialized as SVG path data. */
export class SvgVisitor implements PathVisitor {
  private defs: string[] = [];
  private body: string[] = [];
  private d: string[] = [];
  private clipId = 0;

  constructor(
    private f: Frame,
    private W: number,
  ) {}

  beginSegment(clip: number[] | null) {
    if (!clip) {
      this.body.push('<g>');
      return;
    }
    const id = `k${this.clipId++}`;
    const pts = [];
    for (let i = 0; i < clip.length; i += 2) pts.push(`${clip[i].toFixed(1)},${clip[i + 1].toFixed(1)}`);
    this.defs.push(`<clipPath id="${id}"><polygon points="${pts.join(' ')}"/></clipPath>`);
    this.body.push(`<g clip-path="url(#${id})">`);
  }

  endSegment() {
    this.body.push('</g>');
  }

  beginPath() {
    this.d = [];
  }

  moveTo(x: number, y: number) {
    this.d.push(`M${x.toFixed(2)} ${y.toFixed(2)}`);
  }

  lineTo(x: number, y: number) {
    this.d.push(`L${x.toFixed(2)} ${y.toFixed(2)}`);
  }

  closePath() {
    this.d.push('Z');
  }

  endPath(layer: VectorLayer) {
    if (!this.d.length) return;
    const { f } = this;
    const fill = f.render === 'line' ? 'none' : rgb(layer.color);
    const stroke =
      f.render !== 'fill' && f.strokeWidth > 0
        ? ` stroke="${rgb(layer.color, f.render === 'both' ? 0.55 : 1)}" stroke-width="${strokePx(f, this.W).toFixed(2)}" stroke-linejoin="round" stroke-linecap="round"`
        : '';
    this.body.push(`<path d="${this.d.join('')}" fill="${fill}" fill-rule="evenodd"${stroke}/>`);
  }

  toString(W: number, H: number, background: string | null): string {
    const bg = background ? `<rect width="${W}" height="${H}" fill="${background}"/>` : '';
    const opacity = Math.max(0, Math.min(1, this.f.opacity));
    return [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
      this.defs.length ? `<defs>${this.defs.join('')}</defs>` : '',
      bg,
      `<g opacity="${opacity.toFixed(3)}">`,
      ...this.body,
      '</g></svg>',
    ].join('\n');
  }
}

export class VectorRenderer {
  lastStats: WalkStats = { copies: 0, points: 0 };

  render(ctx: CanvasRenderingContext2D, art: VectorArt, f: Frame, W: number, H: number, background: string | null) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (background) {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, W, H);
    } else {
      ctx.clearRect(0, 0, W, H);
    }
    this.lastStats = walkVector(art, f, W, H, new CanvasVisitor(ctx, f, W));
    ctx.restore();
  }

  toSVG(art: VectorArt, f: Frame, W: number, H: number, background: string | null): string {
    const visitor = new SvgVisitor(f, W);
    walkVector(art, f, W, H, visitor, 0.25);
    return visitor.toString(W, H, background);
  }
}
