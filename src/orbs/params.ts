import type { NumericDef } from '../engine/params';

export type OrbLayout = 'single' | 'scatter' | 'grid' | 'overlap';
export type PaletteSource = 'manual' | 'image';
export type ImageField = 'off' | 'color' | 'warp';

export interface OrbParams {
  // shape
  radius: number;
  aspect: number;
  edge: number;
  distortion: number;
  posX: number;
  posY: number;
  // color
  palette: string[];
  paletteSource: PaletteSource;
  blend: number;
  contrast: number;
  saturation: number;
  brightness: number;
  hueShift: number;
  // texture
  grain: number;
  grainScale: number;
  frequency: number;
  complexity: number;
  warp: number;
  softness: number;
  dither: number;
  // depth
  lightX: number;
  lightY: number;
  lightIntensity: number;
  shadowSoftness: number;
  shading: number;
  depth: number;
  // motion
  playing: boolean;
  speed: number;
  flow: number;
  turbulence: number;
  morph: number;
  loop: number;
  // image field
  imageField: ImageField;
  imageInfluence: number;
  // composition
  layout: OrbLayout;
  count: number;
  spacing: number;
  sizeVariance: number;
  independent: boolean;
  seed: number;
}

export type OrbNumericKey = {
  [K in keyof OrbParams]: OrbParams[K] extends number ? K : never;
}[keyof OrbParams];

export type OrbDef = Omit<NumericDef, 'key'> & { key: OrbNumericKey };

const defs: OrbDef[] = [
  { key: 'radius', label: 'Radius', min: 0.05, max: 0.6, step: 0.001, precision: 3 },
  { key: 'aspect', label: 'Aspect Ratio', min: 0.4, max: 2.5, step: 0.01, precision: 2 },
  { key: 'edge', label: 'Edge Softness', min: 0.002, max: 0.6, step: 0.001, precision: 3 },
  { key: 'distortion', label: 'Circular Distortion', min: 0, max: 1, step: 0.001, precision: 3 },
  { key: 'posX', label: 'Position X', min: -0.5, max: 0.5, step: 0.001, precision: 3 },
  { key: 'posY', label: 'Position Y', min: -0.5, max: 0.5, step: 0.001, precision: 3 },
  { key: 'blend', label: 'Blending', min: 0, max: 1, step: 0.001, precision: 3 },
  { key: 'contrast', label: 'Contrast', min: 0.2, max: 2.5, step: 0.01, precision: 2 },
  { key: 'saturation', label: 'Saturation', min: 0, max: 2, step: 0.01, precision: 2 },
  { key: 'brightness', label: 'Brightness', min: 0.3, max: 1.6, step: 0.01, precision: 2 },
  { key: 'hueShift', label: 'Hue Shift', min: -180, max: 180, step: 0.5, precision: 1, unit: '°' },
  { key: 'grain', label: 'Grain', min: 0, max: 1, step: 0.001, precision: 3 },
  { key: 'grainScale', label: 'Grain Scale', min: 0.5, max: 6, step: 0.01, precision: 2, unit: 'px' },
  { key: 'frequency', label: 'Noise Frequency', min: 0.2, max: 6, step: 0.01, precision: 2 },
  { key: 'complexity', label: 'Noise Complexity', min: 1, max: 8, step: 0.01, precision: 2 },
  { key: 'warp', label: 'Domain Warp', min: 0, max: 2, step: 0.001, precision: 3 },
  { key: 'softness', label: 'Texture Softness', min: 0, max: 1, step: 0.001, precision: 3 },
  { key: 'dither', label: 'Dithering', min: 0, max: 1, step: 0.001, precision: 3 },
  { key: 'lightX', label: 'Light X', min: -1, max: 1, step: 0.001, precision: 3 },
  { key: 'lightY', label: 'Light Y', min: -1, max: 1, step: 0.001, precision: 3 },
  { key: 'lightIntensity', label: 'Light Intensity', min: 0, max: 1.5, step: 0.001, precision: 3 },
  { key: 'shadowSoftness', label: 'Shadow Softness', min: 0, max: 1, step: 0.001, precision: 3 },
  { key: 'shading', label: 'Surface Shading', min: 0, max: 1, step: 0.001, precision: 3 },
  { key: 'depth', label: 'Depth', min: 0, max: 1, step: 0.001, precision: 3 },
  { key: 'speed', label: 'Speed', min: 0, max: 4, step: 0.01, precision: 2, unit: '×' },
  { key: 'flow', label: 'Flow Direction', min: -180, max: 180, step: 0.5, precision: 1, unit: '°' },
  { key: 'turbulence', label: 'Turbulence', min: 0, max: 1, step: 0.001, precision: 3 },
  { key: 'morph', label: 'Morph', min: 0, max: 1.5, step: 0.001, precision: 3 },
  { key: 'loop', label: 'Loop Duration', min: 2, max: 30, step: 0.1, precision: 1, unit: 's' },
  { key: 'imageInfluence', label: 'Image Influence', min: 0, max: 1, step: 0.001, precision: 3 },
  { key: 'count', label: 'Count', min: 1, max: 16, step: 1, precision: 0 },
  { key: 'spacing', label: 'Spacing', min: 0, max: 0.8, step: 0.001, precision: 3 },
  { key: 'sizeVariance', label: 'Size Variance', min: 0, max: 1, step: 0.001, precision: 3 },
  { key: 'seed', label: 'Seed', min: 0, max: 9999, step: 1, precision: 0 },
];

export const ORB_NUMERIC = Object.fromEntries(defs.map((d) => [d.key, d])) as Record<OrbNumericKey, OrbDef>;

/** Values eased by springs every frame. Seed, count, loop and speed act immediately. */
export const ORB_SPRUNG = [
  'radius',
  'aspect',
  'edge',
  'distortion',
  'posX',
  'posY',
  'blend',
  'contrast',
  'saturation',
  'brightness',
  'hueShift',
  'grain',
  'grainScale',
  'frequency',
  'complexity',
  'warp',
  'softness',
  'dither',
  'lightX',
  'lightY',
  'lightIntensity',
  'shadowSoftness',
  'shading',
  'depth',
  'flow',
  'turbulence',
  'morph',
  'imageInfluence',
  'spacing',
  'sizeVariance',
] as const satisfies readonly OrbNumericKey[];

export type OrbSprungKey = (typeof ORB_SPRUNG)[number];

export const MAX_ORBS = 16;
export const MIN_STOPS = 3;
export const MAX_STOPS = 6;
