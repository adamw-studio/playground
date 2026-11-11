import type { MirrorMode } from './params';
import { hash2, signedNoise } from './noise';

/** Everything the renderer needs for one frame. All lengths are normalized to the frame. */
export interface FrameState {
  scale: number;
  offsetX: number;
  offsetY: number;
  rotation: number;
  repeatX: number;
  repeatY: number;
  mirror: MirrorMode;
  wrap: boolean;
  gridCols: number;
  gridRows: number;
  displacement: number;
  waveAmp: number;
  waveFreq: number;
  noise: number;
  time: number;
}

export const BACKGROUND = '#f2f1ed';

/** Extra border rendered around the frame so displaced slices never sample empty pixels. */
const MARGIN = 0.22;
const MAX_UNIT = 4096;

function makeCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  return canvas;
}

function context(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D unavailable');
  ctx.imageSmoothingQuality = 'high';
  return ctx;
}

function ensureSize(canvas: HTMLCanvasElement, w: number, h: number) {
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Three-stage, resolution-independent pipeline:
 *   1. pattern — scale / offset / rotation / repeat / mirror into an oversized layer
 *   2. strips  — wave + noise shift horizontal slices of that layer
 *   3. cells   — the grid samples the layer per cell, displaced by animated noise
 * A renderer owns its scratch canvases, so the live view and an export can each have one.
 */
export class Renderer {
  private unit = makeCanvas();
  private unitKey = '';
  private layerA = makeCanvas();
  private layerB = makeCanvas();

  render(target: CanvasRenderingContext2D, image: HTMLImageElement, s: FrameState, W: number, H: number) {
    const m = Math.ceil(Math.max(W, H) * MARGIN);
    const bw = W + 2 * m;
    const bh = H + 2 * m;
    ensureSize(this.layerA, bw, bh);

    this.drawPattern(context(this.layerA), image, s, W, H, m, bw, bh);

    let source = this.layerA;
    if (s.waveAmp > 1e-5 || s.noise > 1e-5) {
      ensureSize(this.layerB, bw, bh);
      this.drawStrips(this.layerA, context(this.layerB), s, W, H, m, bw, bh);
      source = this.layerB;
    }

    this.drawCells(target, source, s, W, H, m);
  }

  /** One repeat cell (2×2 when mirrored), sized to its on-screen footprint. */
  private buildUnit(image: HTMLImageElement, mirror: MirrorMode, tileW: number, tileH: number) {
    const mx = mirror === 'x' || mirror === 'xy';
    const my = mirror === 'y' || mirror === 'xy';
    const uw = clamp(Math.round(tileW), 1, mx ? MAX_UNIT / 2 : MAX_UNIT);
    const uh = clamp(Math.round(tileH), 1, my ? MAX_UNIT / 2 : MAX_UNIT);
    const key = `${uw}|${uh}|${mirror}|${image.src}`;
    if (key !== this.unitKey) {
      this.unitKey = key;
      ensureSize(this.unit, uw * (mx ? 2 : 1), uh * (my ? 2 : 1));
      const u = context(this.unit);
      for (let qy = 0; qy < (my ? 2 : 1); qy++) {
        for (let qx = 0; qx < (mx ? 2 : 1); qx++) {
          u.save();
          u.translate(qx ? 2 * uw : 0, qy ? 2 * uh : 0);
          u.scale(qx ? -1 : 1, qy ? -1 : 1);
          u.drawImage(image, 0, 0, uw, uh);
          u.restore();
        }
      }
    }
    return { uw, uh };
  }

  private drawPattern(
    ctx: CanvasRenderingContext2D,
    image: HTMLImageElement,
    s: FrameState,
    W: number,
    H: number,
    m: number,
    bw: number,
    bh: number,
  ) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = BACKGROUND;
    ctx.fillRect(0, 0, bw, bh);

    const blockW = W * s.scale;
    const blockH = H * s.scale;
    const tileW = blockW / Math.max(1, s.repeatX);
    const tileH = blockH / Math.max(1, s.repeatY);
    const { uw, uh } = this.buildUnit(image, s.mirror, tileW, tileH);

    const pattern = ctx.createPattern(this.unit, 'repeat');
    if (!pattern) return;
    pattern.setTransform(new DOMMatrix().scale(tileW / uw, tileH / uh));

    ctx.translate(m + W / 2 + s.offsetX * W, m + H / 2 + s.offsetY * H);
    ctx.rotate((s.rotation * Math.PI) / 180);
    ctx.translate(-blockW / 2, -blockH / 2);
    ctx.fillStyle = pattern;

    if (s.wrap) {
      const reach = Math.hypot(bw, bh) + Math.abs(s.offsetX * W) + Math.abs(s.offsetY * H);
      ctx.fillRect(blockW / 2 - reach, blockH / 2 - reach, reach * 2, reach * 2);
    } else {
      ctx.fillRect(0, 0, blockW, blockH);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  private drawStrips(
    source: HTMLCanvasElement,
    ctx: CanvasRenderingContext2D,
    s: FrameState,
    W: number,
    H: number,
    m: number,
    bw: number,
    bh: number,
  ) {
    ctx.fillStyle = BACKGROUND;
    ctx.fillRect(0, 0, bw, bh);

    const stripH = Math.max(1, Math.round(H / 520));
    const limit = m * 0.98;
    const t = s.time;
    const amp = s.waveAmp * W;
    const k = (2 * Math.PI * s.waveFreq) / H;
    const drift = s.noise * W * 0.03;
    const glitchAmp = s.noise * W * 0.09;
    const glitchRate = s.noise * 0.12;
    const tick = Math.floor(t * 8);

    for (let y = 0; y < bh; y += stripH) {
      const h = Math.min(stripH, bh - y);
      const py = y + h / 2 - m;
      const fy = py / H;
      let dx = amp * Math.sin(k * py + t * 2.2);
      if (drift > 0) {
        dx += drift * signedNoise(fy * 18, t * 0.7);
        const band = Math.floor(fy * 90);
        if (hash2(band, tick) < glitchRate) dx += glitchAmp * (hash2(band + 911, tick) * 2 - 1);
      }
      ctx.drawImage(source, 0, y, bw, h, clamp(dx, -limit, limit), y, bw, h);
    }
  }

  private drawCells(
    ctx: CanvasRenderingContext2D,
    source: HTMLCanvasElement,
    s: FrameState,
    W: number,
    H: number,
    m: number,
  ) {
    ctx.imageSmoothingQuality = 'high';
    ctx.fillStyle = BACKGROUND;
    ctx.fillRect(0, 0, W, H);

    const cols = Math.max(1, Math.round(s.gridCols));
    const rows = Math.max(1, Math.round(s.gridRows));
    const d = s.displacement;
    if (cols * rows === 1 && d < 1e-5) {
      ctx.drawImage(source, m, m, W, H, 0, 0, W, H);
      return;
    }

    const t = s.time * 0.25;
    const limit = m * 0.98;
    for (let r = 0; r < rows; r++) {
      const y0 = Math.round((r * H) / rows);
      const ch = Math.round(((r + 1) * H) / rows) - y0;
      for (let c = 0; c < cols; c++) {
        const x0 = Math.round((c * W) / cols);
        const cw = Math.round(((c + 1) * W) / cols) - x0;
        const dx = clamp(d * signedNoise(c * 3.17 + r * 11.3, t) * cw * 0.5, -limit, limit);
        const dy = clamp(d * signedNoise(c * 7.9 + r * 5.1 + 101.7, t + 37.2) * ch * 0.5, -limit, limit);
        ctx.drawImage(source, m + x0 - dx, m + y0 - dy, cw, ch, x0, y0, cw, ch);
      }
    }
  }
}
