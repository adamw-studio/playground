import type { Frame } from '../engine/params';
import { hash2, signedNoise } from '../engine/noise';
import type { VectorArt, VectorLayer, VectorShape } from './types';

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
const MAX_SPRITE = 4096;
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

/** Everything derived from one frame's parameters, shared by every output path. */
interface Derived {
  t: number;
  cx: number;
  cy: number;
  shapeK: number;
  spinA: number;
  disp: number;
  /** Base output-px-per-art-px of one copy (before randomness). */
  copyScaleX: number;
  copyScaleY: number;
  waveA: number;
  waveK: number;
  noiseA: number;
  noiseF: number;
  orgA: number;
  radK: number;
  radR: number;
  /** True when per-point distortion is active — geometry must then be walked point by point. */
  distort: boolean;
}

interface Segment {
  clip: number[] | null;
  copies: Mat[];
}

function derive(art: VectorArt, f: Frame, W: number, H: number): Derived {
  const t = f.time;
  const spacing = Math.min(0.95, f.spacing + f.breathe * 0.2 * (0.5 + 0.5 * Math.sin(t * 0.9)));
  const waveA = f.waveAmp * W;
  const noiseA = f.noise * W * 0.012;
  const orgA = f.organic * W * 0.07;
  return {
    t,
    cx: W / 2,
    cy: H / 2,
    // Breathing gently modulates spacing and shape size over time.
    shapeK: f.shapeScale * (1 + 0.3 * f.breathe * Math.sin(t * 1.4)),
    spinA: (f.shapeRotate + f.spin * t) * DEG,
    disp: f.displacement * Math.max(art.width, art.height) * 0.08,
    copyScaleX: ((1 - spacing) * W * f.scale) / Math.max(1, f.repeatX) / art.width,
    copyScaleY: ((1 - spacing) * H * f.scale) / Math.max(1, f.repeatY) / art.height,
    waveA,
    waveK: (2 * Math.PI * f.waveFreq) / H,
    noiseA,
    noiseF: 60 / W,
    orgA,
    radK: f.radial,
    radR: Math.hypot(W, H) / 2,
    distort: waveA > 0 || noiseA > 0 || orgA > 0 || f.radial !== 0,
  };
}

/**
 * Composition: repeat (finite block or wrapped), spacing, mirror, randomness, and
 * radial / kaleidoscope segments. Returns one affine matrix per visible copy.
 */
function planCopies(art: VectorArt, f: Frame, W: number, H: number, d: Derived): Segment[] {
  const { cx, cy } = d;
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
    const [x0, y0, x1, y1] = boxOf(invert(block), W, H);
    i0 = Math.floor(x0 / tw) - 1;
    i1 = Math.ceil(x1 / tw);
    j0 = Math.floor(y0 / th) - 1;
    j1 = Math.ceil(y1 / th);
  }

  const count = Math.max(1, Math.round(f.symmetry));
  const kaleido = f.kaleido && count > 1;
  const theta = (2 * Math.PI) / count;
  const tiles = (i1 - i0 + 1) * (j1 - j0 + 1);
  if (tiles * count > MAX_COPIES) {
    // Trim the tile range symmetrically around its centre.
    const keep = Math.sqrt(MAX_COPIES / count / tiles);
    const ci = (i0 + i1) / 2, hi = ((i1 - i0 + 1) * keep) / 2;
    const cj = (j0 + j1) / 2, hj = ((j1 - j0 + 1) * keep) / 2;
    i0 = Math.floor(ci - hi); i1 = Math.ceil(ci + hi);
    j0 = Math.floor(cj - hj); j1 = Math.ceil(cj + hj);
  }

  const r = f.randomness;
  const mx = f.mirror === 'x' || f.mirror === 'xy';
  const my = f.mirror === 'y' || f.mirror === 'xy';
  // Copies whose bounds can't reach the visible area (or their kaleidoscope wedge) are skipped.
  const reach = d.waveA + d.noiseA + d.orgA + Math.max(W, H) * (Math.max(0, d.shapeK - 1) * 0.5 + r * 0.4 + f.displacement * 0.1);
  const cull = d.radK === 0;

  const segments: Segment[] = [];
  for (let s = 0; s < count; s++) {
    let radial: Mat;
    if (kaleido && s % 2 === 1) radial = chain(translate(cx, cy), rotate((s - 1) * theta), reflect(theta), translate(-cx, -cy));
    else radial = chain(translate(cx, cy), rotate(s * theta), translate(-cx, -cy));

    const clip = kaleido ? wedge(cx, cy, s * theta, (s + 1) * theta, d.radR * 2.2) : null;
    const [bx0, by0, bx1, by1] = clip ? bounds(clip, 0, 0, W, H) : [0, 0, W, H];
    const copies: Mat[] = [];

    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const h1 = hash2(i * 92821 + 7, j * 68917 + 3);
        const h2 = hash2(i * 3571 + 11, j * 1879 + 5);
        const h3 = hash2(i * 6007 + 13, j * 8111 + 17);
        const h4 = hash2(i * 4229 + 19, j * 2797 + 23);
        const fx = mx && (i & 1) ? -1 : 1;
        const fy = my && (j & 1) ? -1 : 1;
        const k = 1 + r * (h2 * 2 - 1) * 0.5;
        const copy = chain(
          radial,
          block,
          translate((i + 0.5) * tw + r * (h3 * 2 - 1) * tw * 0.5, (j + 0.5) * th + r * (h4 * 2 - 1) * th * 0.5),
          rotate(r * (h1 * 2 - 1) * Math.PI),
          scale(fx * k * d.copyScaleX, fy * k * d.copyScaleY),
          translate(-art.width / 2, -art.height / 2),
        );
        if (cull) {
          const [x0, y0, x1, y1] = boxOf(copy, art.width, art.height);
          if (x1 < bx0 - reach || x0 > bx1 + reach || y1 < by0 - reach || y0 > by1 + reach) continue;
        }
        copies.push(copy);
      }
    }
    segments.push({ clip, copies });
  }
  return segments;
}

/** Per-shape transform in art space: scale and rotation about the shape's centre, plus displacement. */
function shapeMatrix(shape: VectorShape, d: Derived): Mat | null {
  if (d.shapeK === 1 && d.spinA === 0 && !d.disp) return null;
  const dx = d.disp ? d.disp * signedNoise(shape.seed * 1.37, d.t * 0.25) : 0;
  const dy = d.disp ? d.disp * signedNoise(shape.seed * 1.37 + 71.3, d.t * 0.25 + 9.1) : 0;
  return chain(translate(shape.cx + dx, shape.cy + dy), rotate(d.spinA), scale(d.shapeK), translate(-shape.cx, -shape.cy));
}

/**
 * Walks the traced geometry through composition, per-shape geometry and per-point
 * distortion (organic warp, wave, noise, radial bulge), emitting real coordinates.
 */
export function walkVector(
  art: VectorArt,
  f: Frame,
  W: number,
  H: number,
  v: PathVisitor,
  /** Points closer than this (output px) to the previous one are skipped — level of detail for small copies. */
  minSegment = 1,
): WalkStats {
  const d = derive(art, f, W, H);
  const segments = planCopies(art, f, W, H, d);
  const { t, cx, cy, waveA, waveK, noiseA, noiseF, orgA, radK, radR, distort } = d;
  const waveT = t * 2.2;
  const minSeg2 = minSegment * minSegment;
  const locals = art.layers.map((l) => l.shapes.map((s) => shapeMatrix(s, d)));

  let px = 0;
  let py = 0;
  const project = (m: Mat, x: number, y: number) => {
    let X = m[0] * x + m[2] * y + m[4];
    let Y = m[1] * x + m[3] * y + m[5];
    if (distort) {
      if (orgA > 0) {
        const ox = signedNoise((X / W) * 2.3 + t * 0.12, (Y / H) * 2.3);
        const oy = signedNoise((X / W) * 2.3 + 17.1, (Y / H) * 2.3 - t * 0.12);
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
        const dx = X - cx;
        const dy = Y - cy;
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
  for (const seg of segments) {
    v.beginSegment(seg.clip);
    for (const copy of seg.copies) {
      copies++;
      art.layers.forEach((layer, li) => {
        v.beginPath(layer);
        layer.shapes.forEach((shape, si) => {
          const local = locals[li][si];
          const m = local ? mul(copy, local) : copy;
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
        });
        v.endPath(layer);
      });
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

function paintLayer(ctx: CanvasRenderingContext2D, layer: VectorLayer, f: Frame) {
  if (f.render !== 'line') {
    ctx.fillStyle = rgb(layer.color);
    ctx.fill('evenodd');
  }
  if (f.render !== 'fill' && f.strokeWidth > 0) {
    ctx.strokeStyle = rgb(layer.color, f.render === 'both' ? 0.55 : 1);
    ctx.stroke();
  }
}

function tracePolygon(ctx: CanvasRenderingContext2D, pts: number[]) {
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.closePath();
}

/** Live view with distortion: draws the walked geometry straight into a 2D canvas. */
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
      tracePolygon(this.ctx, clip);
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
    paintLayer(this.ctx, layer, this.f);
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
  private sprite = document.createElement('canvas');
  private spriteKey = '';

  /**
   * Live canvas render. With per-point distortion active, the full geometry is walked.
   * Otherwise every copy is the same geometry under an affine transform, so one copy is
   * drawn as vectors into a sprite at the copy's on-screen resolution and placed per copy.
   * `exact` always walks the full geometry (used for high-resolution PNG export).
   */
  render(
    ctx: CanvasRenderingContext2D,
    art: VectorArt,
    f: Frame,
    W: number,
    H: number,
    background: string | null,
    exact = false,
  ) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (background) {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, W, H);
    } else {
      ctx.clearRect(0, 0, W, H);
    }
    const d = derive(art, f, W, H);
    if (d.distort || exact) {
      this.lastStats = walkVector(art, f, W, H, new CanvasVisitor(ctx, f, W), exact ? 0.25 : 1);
    } else {
      this.lastStats = this.renderInstanced(ctx, art, f, W, H, d);
    }
    ctx.restore();
  }

  private renderInstanced(ctx: CanvasRenderingContext2D, art: VectorArt, f: Frame, W: number, H: number, d: Derived): WalkStats {
    const segments = planCopies(art, f, W, H, d);
    const base = Math.max(Math.abs(d.copyScaleX), Math.abs(d.copyScaleY), 1e-4);
    const side = Math.max(art.width, art.height);
    const pad = side * (Math.max(0, d.shapeK - 1) * 0.5 + f.displacement * 0.1) + strokePx(f, W) / base;
    // Sprite px per art px: enough for the largest copy, capped.
    const q = Math.min(base * (1 + 0.5 * f.randomness), MAX_SPRITE / (side + 2 * pad));
    const sw = Math.ceil((art.width + 2 * pad) * q);
    const sh = Math.ceil((art.height + 2 * pad) * q);

    const key = [art.sourceId, art.shapeCount, art.pointCount, sw, sh, q.toFixed(4), d.shapeK.toFixed(5), d.spinA.toFixed(5), d.disp ? d.t.toFixed(4) : 0, f.displacement, f.render, f.strokeWidth.toFixed(3), W].join('|');
    if (key !== this.spriteKey) {
      this.spriteKey = key;
      const sprite = this.sprite;
      if (sprite.width !== sw || sprite.height !== sh) {
        sprite.width = sw;
        sprite.height = sh;
      }
      const sc = sprite.getContext('2d')!;
      sc.setTransform(1, 0, 0, 1, 0, 0);
      sc.clearRect(0, 0, sw, sh);
      sc.setTransform(q, 0, 0, q, pad * q, pad * q);
      sc.lineJoin = 'round';
      sc.lineCap = 'round';
      sc.lineWidth = strokePx(f, W) / base;
      for (const layer of art.layers) {
        sc.beginPath();
        for (const shape of layer.shapes) {
          const m = shapeMatrix(shape, d) ?? I;
          for (const c of shape.contours) {
            sc.moveTo(m[0] * c[0] + m[2] * c[1] + m[4], m[1] * c[0] + m[3] * c[1] + m[5]);
            for (let i = 2; i < c.length; i += 2) sc.lineTo(m[0] * c[i] + m[2] * c[i + 1] + m[4], m[1] * c[i] + m[3] * c[i + 1] + m[5]);
            sc.closePath();
          }
        }
        paintLayer(sc, layer, f);
      }
    }

    ctx.imageSmoothingQuality = 'high';
    ctx.globalAlpha = Math.max(0, Math.min(1, f.opacity));
    const toArt = chain(scale(1 / q), translate(-pad * q, -pad * q));
    let copies = 0;
    for (const seg of segments) {
      ctx.save();
      if (seg.clip) {
        tracePolygon(ctx, seg.clip);
        ctx.clip();
      }
      for (const copy of seg.copies) {
        const m = mul(copy, toArt);
        ctx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
        ctx.drawImage(this.sprite, 0, 0);
        copies++;
      }
      ctx.restore();
    }
    return { copies, points: art.pointCount };
  }

  toSVG(art: VectorArt, f: Frame, W: number, H: number, background: string | null): string {
    const visitor = new SvgVisitor(f, W);
    walkVector(art, f, W, H, visitor, 0.25);
    return visitor.toString(W, H, background);
  }
}
