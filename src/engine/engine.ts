import { NUMERIC, SPRUNG_KEYS, type Params, type SprungKey } from './params';
import { Renderer, type FrameState } from './renderer';

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
  width: number;
  height: number;
}

const SUBSTEP = 1 / 240;

/**
 * Owns the canvas and the requestAnimationFrame loop. The UI only ever hands it target
 * params; springs ease the rendered values toward them, and frames are skipped when idle.
 */
export class StudyEngine {
  readonly stats: EngineStats = {
    time: 0,
    active: 0,
    total: SPRUNG_KEYS.length,
    peakVelocity: 0,
    frameMs: 0,
    width: 0,
    height: 0,
  };

  private ctx: CanvasRenderingContext2D;
  private renderer = new Renderer();
  private image: HTMLImageElement | null = null;
  private params: Params;
  private springs = {} as Record<SprungKey, Spring>;
  private time = 0;
  private raf = 0;
  private last = 0;
  private dirty = true;

  constructor(
    private canvas: HTMLCanvasElement,
    params: Params,
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D unavailable');
    this.ctx = ctx;
    this.params = params;
    this.snap();
  }

  setImage(image: HTMLImageElement) {
    this.image = image;
    this.dirty = true;
  }

  setParams(params: Params) {
    this.params = params;
    this.dirty = true;
  }

  resize(width: number, height: number) {
    this.stats.width = width;
    this.stats.height = height;
    if (this.canvas.width === width && this.canvas.height === height) return;
    this.canvas.width = width;
    this.canvas.height = height;
    this.dirty = true;
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

  async exportPNG(): Promise<Blob | null> {
    const image = this.image;
    if (!image) return null;
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    new Renderer().render(ctx, image, this.frameState(), canvas.width, canvas.height);
    return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  }

  private snap() {
    for (const key of SPRUNG_KEYS) this.springs[key] = { x: this.params[key], v: 0 };
  }

  private frameState(): FrameState {
    const sp = this.springs;
    return {
      scale: sp.scale.x,
      offsetX: sp.offsetX.x,
      offsetY: sp.offsetY.x,
      rotation: sp.rotation.x,
      repeatX: sp.repeatX.x,
      repeatY: sp.repeatY.x,
      gridCols: sp.gridCols.x,
      gridRows: sp.gridRows.x,
      displacement: sp.displacement.x,
      waveAmp: sp.waveAmp.x,
      waveFreq: sp.waveFreq.x,
      noise: sp.noise.x,
      mirror: this.params.mirror,
      wrap: this.params.wrap,
      time: this.time,
    };
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

    const moving = this.step(dt);
    const sp = this.springs;
    const timeDriven = sp.waveAmp.x > 0 || sp.noise.x > 0 || sp.displacement.x > 0;
    if (this.params.playing) this.time += dt * this.params.speed;
    this.stats.time = this.time;

    if (!this.image || !(this.dirty || moving > 0 || (this.params.playing && timeDriven))) return;

    const t0 = performance.now();
    this.renderer.render(this.ctx, this.image, this.frameState(), this.canvas.width, this.canvas.height);
    this.stats.frameMs = performance.now() - t0;
    this.dirty = false;
  };
}
