import type { OrbParams } from './params';

/** The shared base every preset starts from. */
export const ORB_DEFAULTS: OrbParams = {
  radius: 0.36,
  aspect: 1,
  edge: 0.06,
  distortion: 0.12,
  posX: 0,
  posY: 0,
  palette: ['#5b5bd6', '#b9a3f0', '#f3b6d8', '#dfe6ff'],
  paletteSource: 'manual',
  blend: 0.75,
  contrast: 1,
  saturation: 1,
  brightness: 1,
  hueShift: 0,
  grain: 0.42,
  grainScale: 1.2,
  frequency: 1.0,
  complexity: 4,
  warp: 0.7,
  softness: 0.6,
  dither: 0,
  lightX: -0.45,
  lightY: -0.55,
  lightIntensity: 0.45,
  shadowSoftness: 0.6,
  shading: 0.4,
  depth: 0.35,
  playing: true,
  speed: 1,
  flow: 30,
  turbulence: 0.3,
  morph: 0.55,
  loop: 10,
  imageField: 'off',
  imageInfluence: 0.5,
  layout: 'single',
  count: 6,
  spacing: 0.18,
  sizeVariance: 0.35,
  independent: true,
  seed: 7,
};

export interface OrbPreset {
  name: string;
  params: Partial<OrbParams>;
}

export const BUILT_IN_PRESETS: OrbPreset[] = [
  {
    name: 'iridescent',
    params: {
      palette: ['#3d3fd8', '#7f7cf2', '#c8a7f2', '#f4b8d9', '#e9ecff'],
      blend: 0.85, contrast: 1.05, saturation: 1.1, brightness: 1.02,
      grain: 0.42, grainScale: 1.2, frequency: 0.9, complexity: 4, warp: 0.75, softness: 0.7, dither: 0,
      lightX: -0.4, lightY: -0.6, lightIntensity: 0.55, shadowSoftness: 0.7, shading: 0.3, depth: 0.4,
      turbulence: 0.25, morph: 0.6, flow: 35, seed: 7,
    },
  },
  {
    name: 'solar',
    params: {
      palette: ['#b3200e', '#f04a1c', '#ff8a3d', '#ffc2a0', '#ffe26b'],
      blend: 0.82, contrast: 1.2, saturation: 1.12, brightness: 1.02,
      grain: 0.58, grainScale: 1.6, frequency: 0.9, complexity: 4.5, warp: 0.6, softness: 0.62, dither: 0.03,
      lightX: 0.35, lightY: -0.5, lightIntensity: 0.6, shadowSoftness: 0.45, shading: 0.5, depth: 0.45,
      turbulence: 0.35, morph: 0.5, flow: -20, seed: 311,
    },
  },
  {
    name: 'dusk',
    params: {
      palette: ['#2a2427', '#5e1f2d', '#b0707e', '#d9a9ad', '#b8c9dc'],
      blend: 0.8, contrast: 1.1, saturation: 0.85, brightness: 0.95,
      grain: 0.48, grainScale: 1.3, frequency: 0.8, complexity: 4, warp: 0.5, softness: 0.72, dither: 0.04,
      lightX: -0.8, lightY: -0.2, lightIntensity: 0.35, shadowSoftness: 0.35, shading: 0.7, depth: 0.55,
      turbulence: 0.15, morph: 0.4, flow: 80, seed: 1203,
    },
  },
  {
    name: 'chromatic',
    params: {
      palette: ['#1a0dff', '#00c2ff', '#00e08a', '#ffe600', '#ff2fb3', '#ff5a1f'],
      blend: 0.7, contrast: 1.25, saturation: 1.35, brightness: 1.05,
      grain: 0.38, grainScale: 1.1, frequency: 1.5, complexity: 5.5, warp: 1.45, softness: 0.35, dither: 0.08,
      lightX: 0.2, lightY: -0.7, lightIntensity: 0.4, shadowSoftness: 0.6, shading: 0.25, depth: 0.3,
      turbulence: 0.75, morph: 0.95, flow: 140, seed: 4242,
    },
  },
  {
    name: 'monochrome',
    params: {
      palette: ['#0c0c0c', '#4a4a4a', '#9a9a9a', '#e6e6e6'],
      blend: 0.8, contrast: 1.2, saturation: 0, brightness: 1.0,
      grain: 0.85, grainScale: 1.8, frequency: 0.9, complexity: 5, warp: 0.65, softness: 0.62, dither: 0.3,
      lightX: -0.5, lightY: -0.5, lightIntensity: 0.3, shadowSoftness: 0.5, shading: 0.55, depth: 0.4,
      turbulence: 0.4, morph: 0.5, flow: 0, seed: 88,
    },
  },
];

export const applyPreset = (current: OrbParams, preset: OrbPreset): OrbParams => ({
  ...ORB_DEFAULTS,
  // Composition and playback are the user's working context; presets only restyle.
  layout: current.layout,
  count: current.count,
  spacing: current.spacing,
  sizeVariance: current.sizeVariance,
  independent: current.independent,
  playing: current.playing,
  imageField: current.imageField,
  imageInfluence: current.imageInfluence,
  ...preset.params,
  paletteSource: 'manual',
});

/** What a saved preset stores: the look, not the playback state. */
export function presetFrom(name: string, p: OrbParams): OrbPreset {
  const { playing: _playing, paletteSource: _source, ...rest } = p;
  return { name, params: rest };
}

const STORAGE_KEY = 'tile-study.orb-presets';

export function loadSavedPresets(): OrbPreset[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((p) => p && typeof p.name === 'string' && p.params) : [];
  } catch {
    return [];
  }
}

export function storeSavedPresets(list: OrbPreset[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // Storage can be unavailable (private mode); presets then last for this session only.
  }
}
