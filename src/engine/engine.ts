import { NUMERIC, SPRUNG_KEYS, type Frame, type Params, type SprungKey } from './params';
import { BACKGROUND, Renderer } from './renderer';
import type { Source } from './source';
import type { VectorArt } from '../vector/types';
import { VectorRenderer } from '../vector/vectorRenderer';

interface Spring {
  x: number;
  v: number;
}

export interface EngineStats {
  time: number;
  active: number;
  total: number;
  peakVelocity: number;
  frameMs: number;
  vectorMs: number;
  copies: number;
  /** Vector layer resolution as a fraction of display resolution. */
  quality: number;
  width: number;
  height: number;
}

const SUBSTEP = 1 / 240;
/** Internal resolution steps for the vector layer while it animates under heavy load. */
const QUALITY_STEPS = [1, 0.8, 0.65, 0.5];
/** Long-side size of vector PNG exports. */
const VECTOR_EXPORT_SIDE = 5600;

/**
 * Shared motion core. Owns the clock and the springs, and drives two independent
 * renderers: the raster study and the vector study. The UI only hands it target params.
 */
export class StudyEngine {
  readonly stats: EngineStats = {
    time: 0,
    active: 0,
    total: SPRUNG_KEYS.length,
    peakVelocity: 0,
    frameMs: 0,
    vectorMs: 0,
    copies: 0,
    quality: 1,
    width: 0,
    height: 0,
  };

  private rasterCtx: CanvasRenderingContext2D;
  private vectorCtx: CanvasRenderingContext2D;
  private raster = new Renderer();
  private vector = new VectorRenderer();
  private source: Source | null = null;
  private art: VectorArt | null = null;
  private params: Params;
  private springs = {} as Record<SprungKey, Spring>;
  private time = 0;
  private raf = 0;
  private last = 0;
  private dirty = true;
  private quality = 0;

  constructor(
    private rasterCanvas: HTMLCanvasElement,
    private vectorCanvas: HTMLCanvasElement,
    params: Params,
  ) {
    const r = rasterCanvas.getContext('2d');
    const v = vectorCanvas.getContext('2d');
    if (!r || !v) throw new Error('Canvas 2D unavailable');
    this.rasterCtx = r;
    this.vectorCtx = v;
    this.params = params;
    this.snap();
  }

  setSource(source: Source) {
    this.source = source;
    this.dirty = true;
  }

  setArt(art: VectorArt | null) {
    this.art = art;
    this.dirty = true;
  }

  setParams(params: Params) {
    this.params = params;
    this.dirty = true;
  }

  resize(width: number, height: number) {
    this.stats.width = width;
    this.stats.height = height;
    if (this.rasterCanvas.width !== width || this.rasterCanvas.height !== height) {
      this.rasterCanvas.width = width;
      this.rasterCanvas.height = height;
    }
    this.sizeVector(1);
    this.dirty = true;
  }

  /** Sets the vector canvas's backing size as a fraction of the display size (CSS size is unchanged). */
  private sizeVector(fraction: number): boolean {
    const w = Math.max(1, Math.round(this.stats.width * fraction));
    const h = Math.max(1, Math.round(this.stats.height * fraction));
    if (this.vectorCanvas.width === w && this.vectorCanvas.height === h) return false;
    this.vectorCanvas.width = w;
    this.vectorCanvas.height = h;
    return true;
  }

  /** Steps resolution down when animated frames are slow, and back up when there is headroom. */
  private adapt(ms: number) {
    if (ms > 26 && this.quality < QUALITY_STEPS.length - 1) this.quality++;
    else if (ms < 9 && this.quality > 0) this.quality--;
  }

  /** Jump every spring to its target and rewind the clock. */
  resetMotion() {
    this.time = 0;
    this.snap();
    this.dirty = true;
  }

  start() {
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.tick);
  }

  stop() {
    cancelAnimationFrame(this.raf);
  }

  /** The raster study at source resolution. */
  async exportRasterPNG(transparent: boolean): Promise<Blob | null> {
    const source = this.source;
    if (!source) return null;
    const canvas = document.createElement('canvas');
    canvas.width = source.width;
    canvas.height = source.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    new Renderer().render(ctx, source, this.frame(), canvas.width, canvas.height, transparent ? null : BACKGROUND);
    return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  }

  /** The vector study rasterized at high resolution — vectors are resolution independent. */
  async exportVectorPNG(transparent: boolean): Promise<Blob | null> {
    const art = this.art;
    if (!art) return null;
    const { w, h } = this.exportSize(art, VECTOR_EXPORT_SIDE);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    new VectorRenderer().render(ctx, art, this.frame(), w, h, transparent ? null : BACKGROUND, true);
    return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  }

  /** The visible vector composition — every transform and distortion baked into path data. */
  exportSVG(transparent: boolean): string | null {
    const art = this.art;
    if (!art) return null;
    return this.vector.toSVG(art, this.frame(), art.width, art.height, transparent ? null : BACKGROUND);
  }

  vectorExportSize(): { w: number; h: number } | null {
    return this.art ? this.exportSize(this.art, VECTOR_EXPORT_SIDE) : null;
  }

  private exportSize(art: VectorArt, side: number) {
    const k = side / Math.max(art.width, art.height);
    return { w: Math.round(art.width * k), h: Math.round(art.height * k) };
  }

  private snap() {
    for (const key of SPRUNG_KEYS) this.springs[key] = { x: this.params[key], v: 0 };
  }

  private frame(): Frame {
    const values = {} as Record<SprungKey, number>;
    for (const key of SPRUNG_KEYS) values[key] = this.springs[key].x;
    const p = this.params;
    return { ...values, mirror: p.mirror, wrap: p.wrap, kaleido: p.kaleido, render: p.render, spin: p.spin, time: this.time };
  }

  /** Integrates all springs; returns how many are still moving. */
  private step(dt: number): number {
    const { stiffness: k, damping: c } = this.params;
    const steps = Math.max(1, Math.ceil(dt / SUBSTEP));
    const h = dt / steps;
    let active = 0;
    let peak = 0;

    for (const key of SPRUNG_KEYS) {
      const s = this.springs[key];
      const target = this.params[key];
      const range = NUMERIC[key].max - NUMERIC[key].min;
      const eps = range * 1e-5;
      if (s.x === target && s.v === 0) continue;

      for (let i = 0; i < steps; i++) {
        s.v += (-k * (s.x - target) - c * s.v) * h;
        s.x += s.v * h;
      }
      if (Math.abs(s.x - target) < eps && Math.abs(s.v) < eps * 10) {
        s.x = target;
        s.v = 0;
      } else {
        active++;
        peak = Math.max(peak, Math.abs(s.v) / range);
      }
    }

    this.stats.active = active;
    this.stats.peakVelocity = peak;
    return active;
  }

  private tick = (now: number) => {
    this.raf = requestAnimationFrame(this.tick);
    const dt = Math.min((now - this.last) / 1000, 1 / 20);
    this.last = now;

    const moving = this.step(dt) > 0;
    const p = this.params;
    if (p.playing) this.time += dt * p.speed;
    this.stats.time = this.time;

    const sp = this.springs;
    const rasterAnimated = p.playing && (sp.waveAmp.x > 0 || sp.noise.x > 0 || sp.displacement.x > 0);
    const vectorAnimated =
      p.playing &&
      (rasterAnimated || sp.organic.x > 0 || sp.breathe.x > 0 || (p.spin !== 0 && p.speed > 0));

    // Hidden layers only redraw on parameter changes, never for animation.
    const rasterShown = p.view === 'original' || p.view === 'split';
    const vectorShown = p.view === 'vector' || p.view === 'split';
    const drawRaster = this.source && (this.dirty || (rasterShown && (moving || rasterAnimated)));
    const vectorLive = vectorShown && (moving || vectorAnimated);
    // Animated frames may run at reduced resolution; anything still renders sharp once motion settles.
    const settling = !vectorLive && this.sizeVector(1);
    if (vectorLive && this.sizeVector(QUALITY_STEPS[this.quality])) this.dirty = true;
    const drawVector = this.art && (this.dirty || vectorLive || settling);
    if (!drawRaster && !drawVector) return;

    const frame = this.frame();
    if (drawRaster) {
      const t0 = performance.now();
      this.raster.render(this.rasterCtx, this.source!, frame, this.rasterCanvas.width, this.rasterCanvas.height);
      this.stats.frameMs = performance.now() - t0;
    }
    if (drawVector) {
      const t0 = performance.now();
      this.vector.render(this.vectorCtx, this.art!, frame, this.vectorCanvas.width, this.vectorCanvas.height, BACKGROUND);
      this.stats.vectorMs = performance.now() - t0;
      this.stats.copies = this.vector.lastStats.copies;
      if (vectorLive) this.adapt(this.stats.vectorMs);
      else this.quality = 0;
      this.stats.quality = this.vectorCanvas.width / Math.max(1, this.stats.width);
    }
    this.dirty = false;
  };
}
