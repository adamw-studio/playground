import { hexToOklab } from './color';
import { layoutOrbs } from './layout';
import { MAX_ORBS, MAX_STOPS, ORB_NUMERIC, ORB_SPRUNG, type OrbParams, type OrbSprungKey } from './params';
import { OrbRenderer, type OrbFrame } from './renderer';

interface Spring {
  x: number;
  v: number;
}

export interface OrbStats {
  time: number;
  phase: number;
  frameMs: number;
  recording: number | null;
}

export const ORB_BACKGROUND: [number, number, number] = [0.969, 0.965, 0.953];
/** Square export side at 1×. */
const EXPORT_BASE = 1200;
const SUBSTEP = 1 / 240;
const STIFFNESS = 140;
const DAMPING = 19;

const step = (s: Spring, target: number, dt: number, k = STIFFNESS, c = DAMPING) => {
  const n = Math.max(1, Math.ceil(dt / SUBSTEP));
  const h = dt / n;
  for (let i = 0; i < n; i++) {
    s.v += (-k * (s.x - target) - c * s.v) * h;
    s.x += s.v * h;
  }
};

/**
 * The Gradient Orbs study: owns the WebGL canvas, a spring for every continuous
 * parameter (palette colours included), the looping clock and pointer physics.
 */
export class OrbEngine {
  readonly stats: OrbStats = { time: 0, phase: 0, frameMs: 0, recording: null };
  readonly error: string | null = null;

  private renderer: OrbRenderer | null = null;
  private params: OrbParams;
  private springs = {} as Record<OrbSprungKey, Spring>;
  private palette: Spring[] = [];
  private paletteTarget = new Float32Array(MAX_STOPS * 3);
  private stops = 4;
  private time = 0;
  private raf = 0;
  private last = 0;
  private active = false;
  private dirty = true;
  private field = { x: { x: 0, v: 0 }, y: { x: 0, v: 0 }, tx: 0, ty: 0 };
  private pointer = { x: 0, y: 0, strength: 0, vx: 0, vy: 0, lastT: 0, dragging: false, inside: false };
  private recordUntil: number | null = null;
  private onRecorded: (() => void) | null = null;

  constructor(
    private canvas: HTMLCanvasElement,
    params: OrbParams,
    palette: string[],
  ) {
    this.params = params;
    try {
      this.renderer = new OrbRenderer(canvas);
    } catch (err) {
      (this as { error: string | null }).error = String(err);
    }
    for (const key of ORB_SPRUNG) this.springs[key] = { x: params[key], v: 0 };
    this.setPalette(palette);
    for (let i = 0; i < MAX_STOPS * 3; i++) this.palette[i] = { x: this.paletteTarget[i], v: 0 };
  }

  setActive(active: boolean) {
    this.active = active;
    this.dirty = true;
  }

  setParams(params: OrbParams) {
    this.params = params;
    this.dirty = true;
  }

  /** Colour stops ease toward their new values; extra slots repeat the last colour. */
  setPalette(hexes: string[]) {
    const list = hexes.slice(0, MAX_STOPS);
    this.stops = Math.max(2, list.length);
    for (let i = 0; i < MAX_STOPS; i++) {
      const lab = hexToOklab(list[Math.min(i, list.length - 1)] ?? '#888888');
      this.paletteTarget.set(lab, i * 3);
    }
    this.dirty = true;
  }

  setImage(image: TexImageSource & { width: number; height: number }) {
    this.renderer?.setImage(image);
    this.dirty = true;
  }

  resize(width: number, height: number) {
    if (this.canvas.width === width && this.canvas.height === height) return;
    this.canvas.width = width;
    this.canvas.height = height;
    this.dirty = true;
  }

  resetTime() {
    this.time = 0;
    this.dirty = true;
  }

  // --- pointer: x / y in frame units (−0.5 … 0.5, y down) ---

  pointerDown(x: number, y: number) {
    Object.assign(this.pointer, { x, y, dragging: true, inside: true, lastT: performance.now() });
  }

  pointerMove(x: number, y: number) {
    const p = this.pointer;
    const now = performance.now();
    const dt = Math.max(1, now - p.lastT) / 1000;
    const dx = x - p.x;
    const dy = y - p.y;
    p.vx = p.vx * 0.6 + (dx / dt) * 0.4;
    p.vy = p.vy * 0.6 + (dy / dt) * 0.4;
    p.strength = Math.min(1, p.strength + Math.hypot(dx, dy) * 6);
    if (p.dragging) {
      // Drag carries the colour field with the hand, in noise-domain units.
      const k = this.params.frequency / Math.max(0.05, this.springs.radius.x);
      this.field.tx -= dx * k;
      this.field.ty -= dy * k;
    }
    Object.assign(p, { x, y, lastT: now, inside: true });
    this.dirty = true;
  }

  pointerUp() {
    this.pointer.dragging = false;
  }

  pointerLeave() {
    this.pointer.inside = false;
    this.pointer.dragging = false;
  }

  /** Re-centre the dragged colour field. */
  resetField() {
    this.field.tx = 0;
    this.field.ty = 0;
  }

  start() {
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.tick);
  }

  stop() {
    cancelAnimationFrame(this.raf);
    this.renderer?.dispose();
  }

  async exportPNG(scale: number, transparent: boolean): Promise<Blob | null> {
    const side = EXPORT_BASE * scale;
    const canvas = document.createElement('canvas');
    canvas.width = side;
    canvas.height = side;
    const r = new OrbRenderer(canvas, true);
    try {
      if (this.imageForExport) r.setImage(this.imageForExport);
      r.render(this.frame(), side, side, transparent ? null : ORB_BACKGROUND);
      return await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    } finally {
      r.dispose(true);
    }
  }

  private imageForExport: (TexImageSource & { width: number; height: number }) | null = null;
  setExportImage(image: TexImageSource & { width: number; height: number }) {
    this.imageForExport = image;
  }

  /** Records exactly one loop of the live canvas. Resolves with a WebM blob. */
  async recordWebM(): Promise<Blob> {
    const mimeType = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((t) =>
      MediaRecorder.isTypeSupported(t),
    );
    if (!mimeType || !this.canvas.captureStream) throw new Error('WebM recording is not supported in this browser');
    const stream = this.canvas.captureStream(60);
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 16_000_000 });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const stopped = new Promise<void>((resolve) => (recorder.onstop = () => resolve()));

    this.time = 0;
    this.recordUntil = this.params.loop;
    const done = new Promise<void>((resolve) => (this.onRecorded = resolve));
    recorder.start();
    await done;
    recorder.stop();
    await stopped;
    stream.getTracks().forEach((t) => t.stop());
    this.stats.recording = null;
    return new Blob(chunks, { type: 'video/webm' });
  }

  private frame(): OrbFrame {
    const s = (k: OrbSprungKey) => this.springs[k].x;
    const p = this.params;
    const slots = layoutOrbs({
      layout: p.layout,
      count: p.count,
      radius: s('radius'),
      aspect: s('aspect'),
      posX: s('posX'),
      posY: s('posY'),
      spacing: s('spacing'),
      sizeVariance: s('sizeVariance'),
      independent: p.independent,
      seed: p.seed,
    });
    const orbsA = new Float32Array(MAX_ORBS * 4);
    const orbsB = new Float32Array(MAX_ORBS * 4);
    slots.forEach((o, i) => {
      orbsA.set([o.x, o.y, o.r, o.aspect], i * 4);
      orbsB.set([o.fx + p.seed * 0.137, o.fy + p.seed * 0.071, o.shift, o.rotation], i * 4);
    });
    const ptr = this.pointer;
    return {
      orbsA,
      orbsB,
      count: slots.length,
      palette: Float32Array.from(this.palette.map((c) => c.x)),
      stops: this.stops,
      edge: s('edge'),
      distortion: s('distortion'),
      blend: s('blend'),
      contrast: s('contrast'),
      saturation: s('saturation'),
      brightness: s('brightness'),
      hueShift: s('hueShift'),
      grain: s('grain'),
      grainScale: s('grainScale'),
      frequency: s('frequency'),
      complexity: s('complexity'),
      warp: s('warp'),
      softness: s('softness'),
      dither: s('dither'),
      lightX: s('lightX'),
      lightY: s('lightY'),
      lightIntensity: s('lightIntensity'),
      shadowSoftness: s('shadowSoftness'),
      shading: s('shading'),
      depth: s('depth'),
      phase: (this.time / p.loop) % 1,
      flow: s('flow'),
      turbulence: s('turbulence'),
      morph: s('morph'),
      fieldX: this.field.x.x,
      fieldY: this.field.y.x,
      pointer: [ptr.x, ptr.y, ptr.strength],
      pointerVel: [Math.max(-4, Math.min(4, ptr.vx)), Math.max(-4, Math.min(4, ptr.vy))],
      imageMode: p.imageField === 'color' ? 1 : p.imageField === 'warp' ? 2 : 0,
      imageInfluence: s('imageInfluence'),
      seed: p.seed,
    };
  }

  private tick = (now: number) => {
    this.raf = requestAnimationFrame(this.tick);
    const dt = Math.min((now - this.last) / 1000, 1 / 20);
    this.last = now;

    let moving = false;
    for (const key of ORB_SPRUNG) {
      const s = this.springs[key];
      const target = this.params[key];
      if (s.x === target && s.v === 0) continue;
      step(s, target, dt);
      const eps = (ORB_NUMERIC[key].max - ORB_NUMERIC[key].min) * 1e-5;
      if (Math.abs(s.x - target) < eps && Math.abs(s.v) < eps * 10) Object.assign(s, { x: target, v: 0 });
      else moving = true;
    }
    this.palette.forEach((s, i) => {
      const target = this.paletteTarget[i];
      if (s.x === target && s.v === 0) return;
      step(s, target, dt, 90, 17);
      if (Math.abs(s.x - target) < 1e-5 && Math.abs(s.v) < 1e-4) Object.assign(s, { x: target, v: 0 });
      else moving = true;
    });
    const f = this.field;
    for (const [axis, target] of [[f.x, f.tx], [f.y, f.ty]] as const) {
      if (axis.x === target && axis.v === 0) continue;
      step(axis, target, dt, 70, 14);
      if (Math.abs(axis.x - target) < 1e-5 && Math.abs(axis.v) < 1e-4) Object.assign(axis, { x: target, v: 0 });
      else moving = true;
    }

    // Disturbance fades out once the hand stops.
    const ptr = this.pointer;
    ptr.strength *= Math.exp(-dt * (ptr.inside ? 1.6 : 4));
    ptr.vx *= Math.exp(-dt * 3);
    ptr.vy *= Math.exp(-dt * 3);
    if (ptr.strength < 1e-3) ptr.strength = 0;
    else moving = true;

    const recording = this.recordUntil !== null;
    const playing = this.params.playing || recording;
    if (playing) this.time += dt * (recording ? 1 : this.params.speed);
    if (recording) {
      this.stats.recording = Math.min(1, this.time / this.recordUntil!);
      if (this.time >= this.recordUntil!) {
        this.recordUntil = null;
        this.onRecorded?.();
        this.onRecorded = null;
      }
    }
    this.stats.time = this.time;
    this.stats.phase = (this.time / this.params.loop) % 1;

    if (!this.renderer || !this.active) return;
    if (!(this.dirty || moving || (playing && (this.params.speed > 0 || recording)))) return;
    const t0 = performance.now();
    this.renderer.render(this.frame(), this.canvas.width, this.canvas.height, ORB_BACKGROUND);
    this.stats.frameMs = performance.now() - t0;
    this.dirty = false;
  };
}
