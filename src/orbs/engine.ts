import { hexToLinear, hexToOklab } from './color';
import { layoutOrbs } from './layout';
import { LIQUID_COLORS, MAX_ORBS, MAX_STOPS, ORB_NUMERIC, ORB_SPRUNG, type OrbParams, type OrbSprungKey } from './params';
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
  private colors: Spring[] = [];
  private colorTarget = new Float32Array(LIQUID_COLORS.length * 3);
  /** Liquid physics: drag stretch (frame units) and the internal liquid's tilt / bob. */
  private deform = { x: { x: 0, v: 0 }, y: { x: 0, v: 0 }, tx: 0, ty: 0, ox: 0, oy: 0 };
  private tilt = { x: 0, v: 0 };
  private bob = { x: 0, v: 0 };
  private lastDeformV = { x: 0, y: 0 };
  private lastPosV = { x: 0, y: 0 };
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
    this.setColors(params);
    for (let i = 0; i < this.colorTarget.length; i++) this.colors[i] = { x: this.colorTarget[i], v: 0 };
  }

  private setColors(p: OrbParams) {
    LIQUID_COLORS.forEach((key, i) => this.colorTarget.set(hexToLinear(p[key]), i * 3));
  }

  private get liquid() {
    return this.params.material === 'liquid';
  }

  /** Drop every physical disturbance and settle the liquid. */
  resetEquilibrium() {
    Object.assign(this.deform, { tx: 0, ty: 0 });
    for (const s of [this.deform.x, this.deform.y, this.tilt, this.bob]) Object.assign(s, { x: 0, v: 0 });
    this.resetField();
    this.time = 0;
    this.dirty = true;
  }

  setActive(active: boolean) {
    this.active = active;
    this.dirty = true;
  }

  setParams(params: OrbParams) {
    this.params = params;
    this.setColors(params);
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
    // Liquid: dragging stretches the body from wherever it was grabbed.
    this.deform.ox = x - this.deform.tx;
    this.deform.oy = y - this.deform.ty;
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
    if (p.dragging && this.liquid) {
      // Stretch toward the hand, limited by surface tension.
      const max = 0.42 - 0.28 * this.params.tension;
      const dx = x - this.deform.ox;
      const dy = y - this.deform.oy;
      const len = Math.hypot(dx, dy) * 1.4;
      const k = len > max ? max / len : 1;
      this.deform.tx = dx * 1.4 * k;
      this.deform.ty = dy * 1.4 * k;
    } else if (this.liquid) {
      // Hovering stirs the liquid a little.
      this.tilt.v += dx * 6 * this.params.slosh;
    } else if (p.dragging) {
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
    // Release: the body springs back and wobbles through rest.
    this.deform.tx = 0;
    this.deform.ty = 0;
  }

  pointerLeave() {
    this.pointer.inside = false;
    this.pointer.dragging = false;
    this.deform.tx = 0;
    this.deform.ty = 0;
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
      material: p.material === 'liquid' ? 1 : 0,
      glass: [s('ior'), s('roughness'), s('transmission'), s('fresnel')],
      glass2: [s('dispersion'), s('density'), s('clearcoat'), s('normalDistort')],
      liquid: [s('fill'), s('meniscus'), s('waveAmp'), s('waveFreq')],
      liquidAbsorb: s('liquidAbsorb'),
      slosh: [this.tilt.x, this.bob.x, Math.min(1, Math.abs(this.tilt.v) * 0.5 + Math.abs(this.tilt.x) * 2), p.slosh],
      shape: [s('wobble'), s('wobbleFreq'), s('tension'), s('breathing')],
      deform: [s('stretchX'), s('stretchY'), this.deform.x.x, this.deform.y.x],
      lightFx: [s('reflection'), s('rim'), s('bloom'), s('exposure')],
      lightFx2: [s('specular'), s('edgeLight')],
      env: [s('horizon'), s('band'), s('grid'), s('beam')],
      envImage: p.backdrop === 'image' ? 1 : 0,
      colors: Float32Array.from(this.colors.map((c) => c.x)),
    };
  }

  /**
   * Elastic body + sloshing liquid. Elasticity sets the stretch spring, return-to-rest its
   * damping (low = long wobble); viscosity damps the liquid, which lags behind the body
   * because it is driven by the body's acceleration, not its position.
   */
  private stepPhysics(dt: number): boolean {
    const p = this.params;
    const d = this.deform;
    const k = 40 + 280 * p.elasticity;
    const c = 2.5 + 20 * p.restSpeed;
    step(d.x, d.tx, dt, k, c);
    step(d.y, d.ty, dt, k, c);

    // The liquid feels the body's (and the orb's) acceleration.
    const pos = { x: this.springs.posX.v, y: this.springs.posY.v };
    const ax = (d.x.v - this.lastDeformV.x) + (pos.x - this.lastPosV.x) * 2;
    const ay = (d.y.v - this.lastDeformV.y) + (pos.y - this.lastPosV.y) * 2;
    this.lastDeformV = { x: d.x.v, y: d.y.v };
    this.lastPosV = pos;
    this.tilt.v -= ax * 2.2 * p.slosh;
    this.bob.v += ay * 0.8 * p.slosh;
    const cs = 0.6 + 9 * p.viscosity;
    step(this.tilt, 0, dt, 26, cs);
    step(this.bob, 0, dt, 30, cs * 1.2);
    this.tilt.x = Math.max(-1.2, Math.min(1.2, this.tilt.x));
    this.bob.x = Math.max(-0.4, Math.min(0.4, this.bob.x));

    const settled = (s: Spring) => Math.abs(s.x) < 1e-5 && Math.abs(s.v) < 1e-4;
    let moving = false;
    for (const s of [d.x, d.y, this.tilt, this.bob]) {
      if (settled(s) && s !== d.x && s !== d.y) Object.assign(s, { x: 0, v: 0 });
      else if (!settled(s)) moving = true;
    }
    if (Math.abs(d.x.x - d.tx) > 1e-5 || Math.abs(d.y.x - d.ty) > 1e-5) moving = true;
    return moving;
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
    this.colors.forEach((c, i) => {
      const target = this.colorTarget[i];
      if (c.x === target && c.v === 0) return;
      step(c, target, dt, 90, 17);
      if (Math.abs(c.x - target) < 1e-5 && Math.abs(c.v) < 1e-4) Object.assign(c, { x: target, v: 0 });
      else moving = true;
    });
    if (this.stepPhysics(dt)) moving = true;

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
