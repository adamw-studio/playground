declare module 'imagetracerjs' {
  export interface TraceSegment {
    type: 'L' | 'Q';
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    x3?: number;
    y3?: number;
  }

  export interface TracePath {
    segments: TraceSegment[];
    boundingbox: [number, number, number, number];
    holechildren: number[];
    isholepath: boolean;
  }

  export interface TraceData {
    layers: TracePath[][];
    palette: { r: number; g: number; b: number; a: number }[];
    width: number;
    height: number;
  }

  interface ImageTracer {
    imagedataToTracedata(
      imgd: { width: number; height: number; data: Uint8ClampedArray },
      options: Record<string, unknown>,
    ): TraceData;
  }

  const tracer: ImageTracer;
  export default tracer;
}
