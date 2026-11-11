export type MirrorMode = 'none' | 'x' | 'y' | 'xy';

export interface Params {
  // source
  scale: number;
  offsetX: number;
  offsetY: number;
  // composition
  rotation: number;
  repeatX: number;
  repeatY: number;
  mirror: MirrorMode;
  wrap: boolean;
  gridCols: number;
  gridRows: number;
  // distortion
  displacement: number;
  waveAmp: number;
  waveFreq: number;
  noise: number;
  // motion
  playing: boolean;
  speed: number;
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
  scale: 1,
  offsetX: 0,
  offsetY: 0,
  rotation: 0,
  repeatX: 1,
  repeatY: 1,
  mirror: 'none',
  wrap: false,
  gridCols: 1,
  gridRows: 1,
  displacement: 0,
  waveAmp: 0,
  waveFreq: 3,
  noise: 0,
  playing: true,
  speed: 1,
  stiffness: 120,
  damping: 16,
};

const defs: NumericDef[] = [
  { key: 'scale', label: 'Scale', min: 0.1, max: 4, step: 0.01, precision: 2, unit: '×' },
  { key: 'offsetX', label: 'Offset X', min: -1, max: 1, step: 0.001, precision: 3 },
  { key: 'offsetY', label: 'Offset Y', min: -1, max: 1, step: 0.001, precision: 3 },
  { key: 'rotation', label: 'Rotation', min: -180, max: 180, step: 0.1, precision: 1, unit: '°' },
  { key: 'repeatX', label: 'Repeat X', min: 1, max: 12, step: 0.01, precision: 2 },
  { key: 'repeatY', label: 'Repeat Y', min: 1, max: 12, step: 0.01, precision: 2 },
  { key: 'gridCols', label: 'Grid Columns', min: 1, max: 24, step: 1, precision: 0 },
  { key: 'gridRows', label: 'Grid Rows', min: 1, max: 24, step: 1, precision: 0 },
  { key: 'displacement', label: 'Displacement', min: 0, max: 1, step: 0.001, precision: 3 },
  { key: 'waveAmp', label: 'Wave Amplitude', min: 0, max: 0.2, step: 0.001, precision: 3 },
  { key: 'waveFreq', label: 'Wave Frequency', min: 0, max: 24, step: 0.1, precision: 1 },
  { key: 'noise', label: 'Noise', min: 0, max: 1, step: 0.001, precision: 3 },
  { key: 'speed', label: 'Speed', min: 0, max: 4, step: 0.01, precision: 2, unit: '×' },
  { key: 'stiffness', label: 'Spring Stiffness', min: 10, max: 400, step: 1, precision: 0 },
  { key: 'damping', label: 'Spring Damping', min: 1, max: 60, step: 0.1, precision: 1 },
];

export const NUMERIC = Object.fromEntries(defs.map((d) => [d.key, d])) as Record<NumericKey, NumericDef>;

/** Visual parameters that ease toward their target through a spring. */
export const SPRUNG_KEYS = [
  'scale',
  'offsetX',
  'offsetY',
  'rotation',
  'repeatX',
  'repeatY',
  'gridCols',
  'gridRows',
  'displacement',
  'waveAmp',
  'waveFreq',
  'noise',
] as const satisfies readonly NumericKey[];

export type SprungKey = (typeof SPRUNG_KEYS)[number];

export function quantize(value: number, def: NumericDef): number {
  const clamped = Math.min(def.max, Math.max(def.min, value));
  const stepped = Math.round(clamped / def.step) * def.step;
  return Number(stepped.toFixed(def.precision));
}
