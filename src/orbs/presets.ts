import type { OrbParams } from './params';

/** The shared base every preset starts from. */
export const ORB_DEFAULTS: OrbParams = {
  material: 'gradient',
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
  ior: 1.45,
  roughness: 0.12,
  transmission: 0.92,
  fresnel: 1,
  dispersion: 0.2,
  density: 0.35,
  clearcoat: 0.5,
  normalDistort: 0.04,
  fill: 0,
  viscosity: 0.5,
  meniscus: 0.35,
  waveAmp: 0.35,
  waveFreq: 2.4,
  slosh: 0.5,
  liquidAbsorb: 1.2,
  tension: 0.6,
  elasticity: 0.5,
  wobble: 0.12,
  wobbleFreq: 1.8,
  stretchX: 1,
  stretchY: 1,
  breathing: 0.25,
  restSpeed: 0.35,
  reflection: 1,
  specular: 0.6,
  rim: 0.5,
  edgeLight: 0.8,
  bloom: 0.12,
  exposure: 0,
  backdrop: 'studio',
  horizon: 0.15,
  band: 0.4,
  grid: 0,
  beam: 0,
  glassTint: '#eef1f6',
  liquidColor: '#5a7a92',
  rimColor: '#ffffff',
  envTop: '#2a3044',
  envHorizon: '#c9d4e4',
  envBottom: '#0d0f14',
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

/** Liquid-glass materials. Same parameterized renderer; only the values differ. */
export const LIQUID_PRESETS: OrbPreset[] = [
  {
    name: 'frosted liquid',
    params: {
      material: 'liquid',
      envTop: '#eceef2', envHorizon: '#ffffff', envBottom: '#7f838d', horizon: 0.3, band: 0.15, grid: 0.6, beam: 0,
      glassTint: '#e9ebf0', ior: 1.22, roughness: 0.42, transmission: 0.8, fresnel: 0.8, dispersion: 0.3, density: 0.3,
      clearcoat: 0.35, normalDistort: 0.04,
      fill: 0, stretchX: 1.6, stretchY: 0.9, wobble: 0.22, wobbleFreq: 1.5, tension: 0.7, breathing: 0.35,
      reflection: 0.75, specular: 0.45, rim: 0.2, rimColor: '#ffffff', edgeLight: 1.0, bloom: 0, exposure: 0.05,
      grain: 0.05, dither: 0, radius: 0.27,
    },
  },
  {
    name: 'mercury water',
    params: {
      material: 'liquid',
      envTop: '#1a2029', envHorizon: '#9db3c4', envBottom: '#040507', horizon: 0.5, band: 0, grid: 0, beam: 0.65,
      glassTint: '#cfd8e0', ior: 1.33, roughness: 0.38, transmission: 0.6, fresnel: 1.0, dispersion: 0.08, density: 0.25,
      clearcoat: 0.4, normalDistort: 0.03,
      fill: 0.5, meniscus: 0.5, waveAmp: 0.5, waveFreq: 2.2, slosh: 0.55, viscosity: 0.55,
      liquidColor: '#4c6a82', liquidAbsorb: 1.5,
      wobble: 0.06, tension: 0.8, breathing: 0.2,
      reflection: 0.9, specular: 0.5, rim: 0.55, rimColor: '#dfe8f2', edgeLight: 0.7, bloom: 0.3, exposure: 0.1,
      grain: 0.06, dither: 0,
    },
  },
  {
    name: 'sunset refraction',
    params: {
      material: 'liquid',
      envTop: '#2b3356', envHorizon: '#ffb085', envBottom: '#0e0c14', horizon: 0.0, band: 0.9, grid: 0, beam: 0,
      glassTint: '#f6f3f0', ior: 1.9, roughness: 0.03, transmission: 1, fresnel: 1.1, dispersion: 0.15, density: 0.08,
      clearcoat: 0.8, normalDistort: 0,
      fill: 0, wobble: 0.04, tension: 0.9, breathing: 0.15,
      reflection: 1, specular: 0.1, rim: 0.85, rimColor: '#ffc6a2', edgeLight: 1.3, bloom: 0.08, exposure: 0,
      grain: 0.04, dither: 0, radius: 0.4,
    },
  },
  {
    name: 'chromatic plasma',
    params: {
      material: 'liquid',
      envTop: '#020205', envHorizon: '#3d6bff', envBottom: '#000000', horizon: 0.02, band: 0, grid: 0, beam: 0,
      glassTint: '#ffffff', ior: 1.7, roughness: 0.06, transmission: 1, fresnel: 1.4, dispersion: 0.95, density: 0.1,
      clearcoat: 0.3, normalDistort: 0,
      fill: 0.38, meniscus: 0.4, waveAmp: 0.35, waveFreq: 1.8, slosh: 0.45, viscosity: 0.4,
      liquidColor: '#ff9be0', liquidAbsorb: 0.8,
      wobble: 0.1, tension: 0.6, breathing: 0.3,
      reflection: 0.8, specular: 0.15, rim: 2, rimColor: '#ff6a24', edgeLight: 1.6, bloom: 0.8, exposure: 0.3,
      grain: 0.28, dither: 0,
    },
  },
  {
    name: 'electric glass',
    params: {
      material: 'liquid',
      envTop: '#000000', envHorizon: '#62d6ff', envBottom: '#000000', horizon: 0.2, band: 0, grid: 0, beam: 0,
      glassTint: '#1d48ff', ior: 1.6, roughness: 0.08, transmission: 0.88, fresnel: 1.3, dispersion: 0.25, density: 2.2,
      clearcoat: 0.9, normalDistort: 0.05,
      fill: 0, wobble: 0.08, tension: 0.7, breathing: 0.2,
      reflection: 1.4, specular: 0.9, rim: 1.0, rimColor: '#3fe0ff', edgeLight: 1.0, bloom: 0.22, exposure: 0.15,
      grain: 0.04, dither: 0,
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
  backdrop: current.backdrop,
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
