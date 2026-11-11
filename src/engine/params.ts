export type MirrorMode = 'none' | 'x' | 'y' | 'xy';
export type ViewMode = 'original' | 'vector' | 'split';
export type TraceMode = 'mono' | 'color';
export type RenderStyle = 'fill' | 'line' | 'both';

export interface Params {
  view: ViewMode;
  // source
  scale: number;
  offsetX: number;
  offsetY: number;
  // vectorize (applied when tracing, never animated)
  traceMode: TraceMode;
  threshold: number;
  detail: number;
  smoothing: number;
  colors: number;
  minArea: number;
  invert: boolean;
  removeBg: boolean;
  // geometry (vector only)
  shapeScale: number;
  shapeRotate: number;
  strokeWidth: number;
  opacity: number;
  render: RenderStyle;
  // composition
  rotation: number;
  repeatX: number;
  repeatY: number;
  spacing: number;
  randomness: number;
  symmetry: number;
  kaleido: boolean;
  mirror: MirrorMode;
  wrap: boolean;
  gridCols: number;
  gridRows: number;
  // distortion
  displacement: number;
  waveAmp: number;
  waveFreq: number;
  noise: number;
  organic: number;
  radial: number;
  // motion
  playing: boolean;
  speed: number;
  spin: number;
  breathe: number;
  stiffness: number;
  damping: number;
}

export type NumericKey = {
  [K in keyof Params]: Params[K] extends number ? K : never;
}[keyof Params];

export interface NumericDef {
  key: NumericKey;
  label: string;
  min: number;
  max: number;
  step: number;
  precision: number;
  unit?: string;
}

export const DEFAULTS: Params = {
  view: 'original',
  scale: 1,
  offsetX: 0,
  offsetY: 0,
  traceMode: 'mono',
  threshold: 140,
  detail: 0.5,
  smoothing: 0.35,
  colors: 6,
  minArea: 8,
  invert: false,
  removeBg: true,
  shapeScale: 1,
  shapeRotate: 0,
  strokeWidth: 1,
  opacity: 1,
  render: 'fill',
  rotation: 0,
  repeatX: 1,
  repeatY: 1,
  spacing: 0,
  randomness: 0,
  symmetry: 1,
  kaleido: false,
  mirror: 'none',
  wrap: false,
  gridCols: 1,
  gridRows: 1,
  displacement: 0,
  waveAmp: 0,
  waveFreq: 3,
  noise: 0,
  organic: 0,
  radial: 0,
  playing: true,
  speed: 1,
  spin: 0,
  breathe: 0,
  stiffness: 120,
  damping: 16,
};

/** Tracing settings: changing them re-traces, so "reset all" and image swaps keep them. */
export const TRACE_KEYS = ['traceMode', 'threshold', 'detail', 'smoothing', 'colors', 'minArea', 'invert', 'removeBg'] as const;

const defs: NumericDef[] = [
  { key: 'scale', label: 'Scale', min: 0.1, max: 4, step: 0.01, precision: 2, unit: '×' },
  { key: 'offsetX', label: 'Offset X', min: -1, max: 1, step: 0.001, precision: 3 },
  { key: 'offsetY', label: 'Offset Y', min: -1, max: 1, step: 0.001, precision: 3 },
  { key: 'threshold', label: 'Threshold', min: 0, max: 255, step: 1, precision: 0 },
  { key: 'detail', label: 'Detail', min: 0, max: 1, step: 0.01, precision: 2 },
  { key: 'smoothing', label: 'Smoothing', min: 0, max: 1, step: 0.01, precision: 2 },
  { key: 'colors', label: 'Colors', min: 2, max: 16, step: 1, precision: 0 },
  { key: 'minArea', label: 'Minimum Area', min: 0, max: 400, step: 1, precision: 0, unit: 'px' },
  { key: 'shapeScale', label: 'Shape Scale', min: 0, max: 3, step: 0.01, precision: 2, unit: '×' },
  { key: 'shapeRotate', label: 'Shape Rotation', min: -180, max: 180, step: 0.1, precision: 1, unit: '°' },
  { key: 'strokeWidth', label: 'Stroke Width', min: 0, max: 12, step: 0.1, precision: 1, unit: 'px' },
  { key: 'opacity', label: 'Opacity', min: 0, max: 1, step: 0.01, precision: 2 },
  { key: 'rotation', label: 'Rotation', min: -180, max: 180, step: 0.1, precision: 1, unit: '°' },
  { key: 'repeatX', label: 'Repeat X', min: 1, max: 12, step: 0.01, precision: 2 },
  { key: 'repeatY', label: 'Repeat Y', min: 1, max: 12, step: 0.01, precision: 2 },
  { key: 'spacing', label: 'Spacing', min: 0, max: 0.9, step: 0.001, precision: 3 },
  { key: 'randomness', label: 'Randomness', min: 0, max: 1, step: 0.001, precision: 3 },
  { key: 'symmetry', label: 'Radial Symmetry', min: 1, max: 24, step: 1, precision: 0 },
  { key: 'gridCols', label: 'Grid Columns', min: 1, max: 24, step: 1, precision: 0 },
  { key: 'gridRows', label: 'Grid Rows', min: 1, max: 24, step: 1, precision: 0 },
  { key: 'displacement', label: 'Displacement', min: 0, max: 1, step: 0.001, precision: 3 },
  { key: 'waveAmp', label: 'Wave Amplitude', min: 0, max: 0.2, step: 0.001, precision: 3 },
  { key: 'waveFreq', label: 'Wave Frequency', min: 0, max: 24, step: 0.1, precision: 1 },
  { key: 'noise', label: 'Noise', min: 0, max: 1, step: 0.001, precision: 3 },
  { key: 'organic', label: 'Organic', min: 0, max: 1, step: 0.001, precision: 3 },
  { key: 'radial', label: 'Radial', min: -1, max: 1, step: 0.001, precision: 3 },
  { key: 'speed', label: 'Speed', min: 0, max: 4, step: 0.01, precision: 2, unit: '×' },
  { key: 'spin', label: 'Spin', min: -180, max: 180, step: 0.5, precision: 1, unit: '°' },
  { key: 'breathe', label: 'Breathe', min: 0, max: 1, step: 0.001, precision: 3 },
  { key: 'stiffness', label: 'Spring Stiffness', min: 10, max: 400, step: 1, precision: 0 },
  { key: 'damping', label: 'Spring Damping', min: 1, max: 60, step: 0.1, precision: 1 },
];

export const NUMERIC = Object.fromEntries(defs.map((d) => [d.key, d])) as Record<NumericKey, NumericDef>;

/** Visual parameters that ease toward their target through a spring. */
export const SPRUNG_KEYS = [
  'scale',
  'offsetX',
  'offsetY',
  'shapeScale',
  'shapeRotate',
  'strokeWidth',
  'opacity',
  'rotation',
  'repeatX',
  'repeatY',
  'spacing',
  'randomness',
  'symmetry',
  'gridCols',
  'gridRows',
  'displacement',
  'waveAmp',
  'waveFreq',
  'noise',
  'organic',
  'radial',
  'breathe',
] as const satisfies readonly NumericKey[];

export type SprungKey = (typeof SPRUNG_KEYS)[number];

/** The eased values for one frame, plus the discrete settings and the clock. */
export type Frame = Record<SprungKey, number> & {
  mirror: MirrorMode;
  wrap: boolean;
  kaleido: boolean;
  render: RenderStyle;
  spin: number;
  time: number;
};

export function quantize(value: number, def: NumericDef): number {
  const clamped = Math.min(def.max, Math.max(def.min, value));
  const stepped = Math.round(clamped / def.step) * def.step;
  return Number(stepped.toFixed(def.precision));
}
