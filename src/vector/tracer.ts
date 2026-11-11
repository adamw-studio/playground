import type { Source } from '../engine/source';
import type { TraceOptions, TraceRequest, TraceResponse, VectorArt } from './types';

/** Working resolution for tracing, from the Detail setting. */
const workingSide = (detail: number) => Math.round(320 + detail * 1080);

/**
 * Main-thread client for the tracing worker. Tracing is expensive, so it only ever
 * happens on demand; animation works on the returned geometry.
 */
export class Tracer {
  private worker = new Worker(new URL('./trace.worker.ts', import.meta.url), { type: 'module' });
  private seq = 0;
  private pending = new Map<number, (r: TraceResponse) => void>();

  constructor() {
    this.worker.onmessage = (e: MessageEvent<TraceResponse>) => {
      this.pending.get(e.data.id)?.(e.data);
      this.pending.delete(e.data.id);
    };
  }

  async trace(source: Source, options: TraceOptions): Promise<VectorArt> {
    const k = Math.min(1, workingSide(options.detail) / Math.max(source.width, source.height));
    const w = Math.max(8, Math.round(source.width * k));
    const h = Math.max(8, Math.round(source.height * k));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source.canvas, 0, 0, w, h);
    const pixels = ctx.getImageData(0, 0, w, h).data.buffer;

    const id = ++this.seq;
    const req: TraceRequest = { id, width: w, height: h, pixels, scale: source.width / w, options };
    const res = await new Promise<TraceResponse>((resolve) => {
      this.pending.set(id, resolve);
      this.worker.postMessage(req, [pixels]);
    });
    if (!res.ok) throw new Error(res.error);

    let seed = 0;
    const layers = res.layers.map((l) => ({
      color: l.color,
      shapes: l.shapes.map((s) => ({ ...s, seed: seed++ })),
    }));
    return {
      sourceId: source.id,
      width: source.width,
      height: source.height,
      layers,
      shapeCount: seed,
      pointCount: res.pointCount,
      traceMs: res.ms,
    };
  }

  dispose() {
    this.worker.terminate();
  }
}
