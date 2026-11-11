import type { TraceMode } from '../engine/params';

export interface TraceOptions {
  mode: TraceMode;
  threshold: number;
  detail: number;
  smoothing: number;
  colors: number;
  minArea: number;
  invert: boolean;
  removeBg: boolean;
}

/** One filled region: an outer contour followed by its holes, as flat [x0, y0, x1, y1, …] in source pixels. */
export interface VectorShape {
  contours: Float32Array[];
  cx: number;
  cy: number;
  seed: number;
}

export interface VectorLayer {
  color: [number, number, number];
  shapes: VectorShape[];
}

/** Traced geometry. Never mutated after tracing: every manipulation is applied on the way out. */
export interface VectorArt {
  sourceId: string;
  width: number;
  height: number;
  layers: VectorLayer[];
  shapeCount: number;
  pointCount: number;
  traceMs: number;
}

export interface TraceRequest {
  id: number;
  width: number;
  height: number;
  pixels: ArrayBuffer;
  /** Multiplier from working resolution back to source pixels. */
  scale: number;
  options: TraceOptions;
}

export interface RawLayer {
  color: [number, number, number];
  shapes: { contours: Float32Array[]; cx: number; cy: number }[];
}

export type TraceResponse =
  | { id: number; ok: true; layers: RawLayer[]; pointCount: number; ms: number }
  | { id: number; ok: false; error: string };
