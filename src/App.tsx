import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { StudyEngine, type EngineStats } from './engine/engine';
import { DEFAULTS, NUMERIC, TRACE_KEYS, quantize, type Params } from './engine/params';
import { ACCEPT, isSupportedImage, loadSourceFile, loadSourceUrl, type Source } from './engine/source';
import { Tracer } from './vector/tracer';
import type { TraceOptions, VectorArt } from './vector/types';
import { Panel } from './ui/Panel';
import { Stage } from './ui/Stage';
import { OrbPanel } from './ui/OrbPanel';
import { OrbEngine, type OrbStats } from './orbs/engine';
import { extractPalette, randomPalette, rng } from './orbs/color';
import type { OrbParams } from './orbs/params';
import {
  BUILT_IN_PRESETS,
  ORB_DEFAULTS,
  applyPreset,
  loadSavedPresets,
  presetFrom,
  storeSavedPresets,
  type OrbPreset,
} from './orbs/presets';

const ORIGINAL_URL = `${import.meta.env.BASE_URL}tile.jpg`;
const ORIGINAL_NAME = 'tile.jpg';

function useEngineStats(engine: React.RefObject<StudyEngine | null>): EngineStats {
  const [stats, setStats] = useState<EngineStats>({
    time: 0,
    active: 0,
    total: 0,
    peakVelocity: 0,
    frameMs: 0,
    vectorMs: 0,
    copies: 0,
    quality: 1,
    width: 0,
    height: 0,
  });
  useEffect(() => {
    const id = window.setInterval(() => {
      if (engine.current) setStats({ ...engine.current.stats });
    }, 120);
    return () => window.clearInterval(id);
  }, [engine]);
  return stats;
}

function useOrbStats(engine: React.RefObject<OrbEngine | null>, active: boolean): OrbStats {
  const [stats, setStats] = useState<OrbStats>({ time: 0, phase: 0, frameMs: 0, recording: null });
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => {
      if (engine.current) setStats({ ...engine.current.stats });
    }, 120);
    return () => window.clearInterval(id);
  }, [engine, active]);
  return stats;
}

const INITIAL_ORB = applyPreset(ORB_DEFAULTS, BUILT_IN_PRESETS[0]);

/** Seeded variation on the current look: new palette, field and texture, same composition. */
function randomizeOrb(o: OrbParams): OrbParams {
  const seed = Math.floor(Math.random() * 10000);
  const r = rng(seed);
  const between = (a: number, b: number, d = 3) => Number((a + (b - a) * r()).toFixed(d));
  return {
    ...o,
    seed,
    palette: randomPalette(seed, 3 + Math.floor(r() * 4)),
    paletteSource: 'manual',
    blend: between(0.5, 0.95),
    contrast: between(0.9, 1.45, 2),
    saturation: between(0.85, 1.25, 2),
    hueShift: 0,
    grain: between(0.15, 0.6),
    frequency: between(0.8, 2.4, 2),
    complexity: between(3.5, 7, 2),
    warp: between(0.3, 1.6),
    turbulence: between(0.1, 0.7),
    morph: between(0.3, 1),
    distortion: between(0, 0.35),
    softness: between(0.2, 0.7),
    dither: r() < 0.3 ? between(0.05, 0.35) : 0,
    lightX: between(-0.9, 0.9),
    lightY: between(-0.9, 0.1),
    depth: between(0.2, 0.6),
    shading: between(0.2, 0.65),
    flow: between(-180, 180, 1),
  };
}

/** Tracing settings survive resets and image swaps; everything else returns to defaults. */
const keepTraceSettings = (p: Params): Params => ({
  ...DEFAULTS,
  ...Object.fromEntries(TRACE_KEYS.map((k) => [k, p[k]])),
  view: p.view,
});

const traceOptions = (p: Params): TraceOptions => ({
  mode: p.traceMode,
  threshold: p.threshold,
  detail: p.detail,
  smoothing: p.smoothing,
  colors: p.colors,
  minArea: p.minArea,
  invert: p.invert,
  removeBg: p.removeBg,
});

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function App() {
  const [params, setParams] = useState<Params>(DEFAULTS);
  const [source, setSource] = useState<Source | null>(null);
  const [art, setArt] = useState<VectorArt | null>(null);
  const [tracing, setTracing] = useState(false);
  const [traceError, setTraceError] = useState<string | null>(null);
  const [split, setSplit] = useState(0.5);
  const [transparent, setTransparent] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [orb, setOrb] = useState<OrbParams>(INITIAL_ORB);
  const [imagePalette, setImagePalette] = useState<string[] | null>(null);
  const [savedPresets, setSavedPresets] = useState<OrbPreset[]>(loadSavedPresets);
  const [activePreset, setActivePreset] = useState<string | null>(BUILT_IN_PRESETS[0].name);

  const rasterRef = useRef<HTMLCanvasElement>(null);
  const vectorRef = useRef<HTMLCanvasElement>(null);
  const orbRef = useRef<HTMLCanvasElement>(null);
  const orbEngineRef = useRef<OrbEngine | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const engineRef = useRef<StudyEngine | null>(null);
  const tracerRef = useRef<Tracer | null>(null);
  const originalRef = useRef<Source | null>(null);
  const sourceRef = useRef<Source | null>(null);
  const paramsRef = useRef(params);
  const artRef = useRef<VectorArt | null>(null);
  const traceSeq = useRef(0);
  const tracedKey = useRef('');
  const size = useRef<[number, number]>([1, 1]);
  const stats = useEngineStats(engineRef);
  const orbView = params.view === 'orbs';
  const orbStats = useOrbStats(orbEngineRef, orbView);
  const orbPalette = orb.paletteSource === 'image' && imagePalette ? imagePalette : orb.palette;

  paramsRef.current = params;
  artRef.current = art;

  const flash = useCallback((message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice((n) => (n === message ? null : n)), 2600);
  }, []);

  const applySource = useCallback((next: Source) => {
    sourceRef.current = next;
    traceSeq.current++; // drop any trace still in flight for the previous image
    tracedKey.current = '';
    engineRef.current?.setSource(next);
    setSource(next);
    setArt(null);
    setTracing(false);
    setTraceError(null);
    setParams(keepTraceSettings);
    engineRef.current?.resetMotion();
  }, []);

  useLayoutEffect(() => {
    const engine = new StudyEngine(rasterRef.current!, vectorRef.current!, DEFAULTS);
    engine.resize(...size.current);
    engineRef.current = engine;
    engine.start();
    const tracer = new Tracer();
    tracerRef.current = tracer;

    let alive = true;
    loadSourceUrl(ORIGINAL_URL, ORIGINAL_NAME).then((src) => {
      if (!alive) return;
      originalRef.current = src;
      applySource(src);
    });
    return () => {
      alive = false;
      engine.stop();
      tracer.dispose();
      engineRef.current = null;
      tracerRef.current = null;
    };
  }, [applySource]);

  useEffect(() => {
    engineRef.current?.setParams(params);
  }, [params]);

  // --- Gradient Orbs study ---
  useLayoutEffect(() => {
    const engine = new OrbEngine(orbRef.current!, INITIAL_ORB, INITIAL_ORB.palette);
    engine.resize(...size.current);
    orbEngineRef.current = engine;
    engine.start();
    return () => {
      engine.stop();
      orbEngineRef.current = null;
    };
  }, []);

  useEffect(() => {
    orbEngineRef.current?.setActive(orbView);
  }, [orbView]);

  useEffect(() => {
    orbEngineRef.current?.setParams(orb);
  }, [orb]);

  const paletteKey = orbPalette.join(',');
  useEffect(() => {
    orbEngineRef.current?.setPalette(paletteKey.split(','));
  }, [paletteKey]);

  // The current image feeds the orb as a texture and as a palette source.
  const stopCount = orb.palette.length;
  useEffect(() => {
    if (!source) return;
    orbEngineRef.current?.setImage(source.canvas);
    orbEngineRef.current?.setExportImage(source.canvas);
    setImagePalette(extractPalette(source.canvas, stopCount));
  }, [source, stopCount]);

  const setOrbKey = useCallback(<K extends keyof OrbParams>(key: K, value: OrbParams[K]) => {
    setOrb((o) => ({ ...o, [key]: value }));
    if (key !== 'playing') setActivePreset(null);
  }, []);

  const setOrbPalette = useCallback((colors: string[]) => {
    // Editing image-derived colours turns them into a manual palette.
    setOrb((o) => ({ ...o, palette: colors, paletteSource: 'manual' }));
    setActivePreset(null);
  }, []);

  const onOrbPointer = useCallback((kind: 'down' | 'move' | 'up' | 'leave', x: number, y: number) => {
    const engine = orbEngineRef.current;
    if (!engine) return;
    if (kind === 'down') engine.pointerDown(x, y);
    else if (kind === 'move') engine.pointerMove(x, y);
    else if (kind === 'up') engine.pointerUp();
    else engine.pointerLeave();
  }, []);

  const savePreset = () => {
    const name = `custom ${String(savedPresets.length + 1).padStart(2, '0')}`;
    const next = [...savedPresets, presetFrom(name, { ...orb, palette: orbPalette })];
    setSavedPresets(next);
    storeSavedPresets(next);
    setActivePreset(name);
    flash(`saved ${name}`);
  };

  const deletePreset = (index: number) => {
    const next = savedPresets.filter((_, i) => i !== index);
    setSavedPresets(next);
    storeSavedPresets(next);
  };

  const exportPresetJSON = () => {
    const preset = presetFrom(activePreset ?? `orb ${orb.seed}`, { ...orb, palette: orbPalette });
    download(new Blob([JSON.stringify(preset, null, 2)], { type: 'application/json' }), `orb-preset-${orb.seed}.json`);
  };

  const onOrbExportPNG = async (scale: number) => {
    const engine = orbEngineRef.current;
    if (!engine) return;
    setExporting('png');
    try {
      const blob = await engine.exportPNG(scale, transparent);
      if (blob) download(blob, `orb-${orb.seed}-${scale}x-${Date.now()}.png`);
    } catch (err) {
      flash(`export failed — ${String(err).slice(0, 60)}`);
    } finally {
      setExporting(null);
    }
  };

  const onOrbExportWebM = async () => {
    const engine = orbEngineRef.current;
    if (!engine) return;
    setExporting('webm');
    try {
      const blob = await engine.recordWebM();
      download(blob, `orb-${orb.seed}-loop-${Date.now()}.webm`);
    } catch (err) {
      flash(String(err instanceof Error ? err.message : err).toLowerCase());
    } finally {
      setExporting(null);
    }
  };

  useEffect(() => {
    engineRef.current?.setArt(art);
  }, [art]);

  const runTrace = useCallback(async (force: boolean) => {
    const src = sourceRef.current;
    const tracer = tracerRef.current;
    if (!src || !tracer) return;
    const options = traceOptions(paramsRef.current);
    const key = `${src.id}|${JSON.stringify(options)}`;
    if (!force && key === tracedKey.current) return;
    tracedKey.current = key;
    const seq = ++traceSeq.current;
    setTracing(true);
    setTraceError(null);
    try {
      const result = await tracer.trace(src, options);
      if (seq === traceSeq.current) setArt(result);
    } catch (err) {
      if (seq === traceSeq.current) {
        tracedKey.current = '';
        setTraceError(String(err));
      }
    } finally {
      if (seq === traceSeq.current) setTracing(false);
    }
  }, []);

  // Trace on first entry into vector / split, and re-trace (debounced) when trace settings change.
  const optionsKey = JSON.stringify(traceOptions(params));
  useEffect(() => {
    const wantsVector = params.view === 'vector' || params.view === 'split';
    if (!source || (!wantsVector && !artRef.current)) return;
    const id = window.setTimeout(() => runTrace(false), artRef.current ? 280 : 0);
    return () => window.clearTimeout(id);
  }, [source, optionsKey, params.view, runTrace]);

  const set = useCallback(<K extends keyof Params>(key: K, value: Params[K]) => {
    setParams((p) => ({ ...p, [key]: value }));
  }, []);

  const onResize = useCallback((w: number, h: number) => {
    size.current = [w, h];
    engineRef.current?.resize(w, h);
    orbEngineRef.current?.resize(w, h);
  }, []);

  const onDrag = useCallback((dx: number, dy: number) => {
    setParams((p) => ({
      ...p,
      offsetX: quantize(p.offsetX + dx, NUMERIC.offsetX),
      offsetY: quantize(p.offsetY + dy, NUMERIC.offsetY),
    }));
  }, []);

  const onFile = useCallback(
    (file: File) => {
      if (!isSupportedImage(file)) {
        flash('use a jpg, png, webp or heic image');
        return;
      }
      if (/\.hei[cf]$/i.test(file.name) || file.type.includes('hei')) setNotice('decoding heic…');
      loadSourceFile(file)
        .then((src) => {
          setNotice(null);
          applySource(src);
        })
        .catch(() => flash('could not read that image'));
    },
    [applySource, flash],
  );

  const baseName = (source?.name ?? 'study').replace(/\.[^.]+$/, '');

  const onExportPNG = async () => {
    const engine = engineRef.current;
    if (!engine) return;
    setExporting('png');
    try {
      const vector = params.view !== 'original' && art;
      const blob = vector ? await engine.exportVectorPNG(transparent) : await engine.exportRasterPNG(transparent);
      if (blob) download(blob, `${baseName}-${vector ? 'vector' : 'study'}-${Date.now()}.png`);
    } finally {
      setExporting(null);
    }
  };

  const onExportSVG = () => {
    const engine = engineRef.current;
    if (!engine) return;
    setExporting('svg');
    // Let the label repaint before the (synchronous) serialization runs.
    window.setTimeout(() => {
      try {
        const svg = engine.exportSVG(transparent);
        if (svg) download(new Blob([svg], { type: 'image/svg+xml' }), `${baseName}-vector-${Date.now()}.svg`);
      } finally {
        setExporting(null);
      }
    }, 30);
  };

  // Space toggles the clock, unless typing in a field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || (e.target as HTMLElement).closest('input, button, [role=slider]')) return;
      e.preventDefault();
      if (paramsRef.current.view === 'orbs') setOrb((o) => ({ ...o, playing: !o.playing }));
      else setParams((p) => ({ ...p, playing: !p.playing }));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const exportSize = engineRef.current?.vectorExportSize();
  const status =
    notice ??
    (orbView ? null : tracing ? 'tracing…' : params.view !== 'original' && traceError ? 'trace failed' : null);

  return (
    <main className="app">
      <Stage
        rasterRef={rasterRef}
        vectorRef={vectorRef}
        orbRef={orbRef}
        aspect={orbView ? 1 : source ? source.width / source.height : 3 / 4}
        view={params.view}
        split={split}
        status={status}
        onResize={onResize}
        onDrag={onDrag}
        onSplit={setSplit}
        onFile={onFile}
        onOrbPointer={onOrbPointer}
      />
      <Panel
        params={params}
        stats={stats}
        source={{
          name: source?.name ?? '—',
          size: source ? [source.width, source.height] : null,
          isOriginal: !source || source === originalRef.current,
        }}
        vector={{
          ready: !!art,
          tracing,
          shapes: art?.shapeCount ?? 0,
          points: art?.pointCount ?? 0,
          traceMs: art?.traceMs ?? 0,
          error: traceError,
        }}
        transparent={transparent}
        exporting={exporting}
        vectorExportSize={exportSize ? `${exportSize.w} × ${exportSize.h}` : '—'}
        set={set}
        setTransparent={setTransparent}
        onUpload={() => fileRef.current?.click()}
        onRestoreOriginal={() => originalRef.current && applySource(originalRef.current)}
        onTrace={() => runTrace(true)}
        onResetAll={() => setParams(keepTraceSettings)}
        onResetMotion={() => engineRef.current?.resetMotion()}
        onExportPNG={onExportPNG}
        onExportSVG={onExportSVG}
        orbContent={
          <OrbPanel
            orb={orb}
            palette={orbPalette}
            stats={orbStats}
            presets={{ builtIn: BUILT_IN_PRESETS, saved: savedPresets }}
            activePreset={activePreset}
            sourceName={source?.name ?? '—'}
            error={orbEngineRef.current?.error ?? null}
            transparent={transparent}
            exporting={exporting}
            set={setOrbKey}
            setPalette={setOrbPalette}
            setTransparent={setTransparent}
            onPreset={(p) => {
              setOrb((o) => applyPreset(o, p));
              setActivePreset(p.name);
            }}
            onDeletePreset={deletePreset}
            onSavePreset={savePreset}
            onExportPreset={exportPresetJSON}
            onRandomize={() => {
              setOrb(randomizeOrb);
              setActivePreset(null);
            }}
            onShufflePalette={() => setOrbPalette(randomPalette(Math.floor(Math.random() * 1e5), orbPalette.length))}
            onVariations={() => {
              setOrb((o) => ({ ...o, layout: 'grid', count: 9, independent: true, spacing: 0.14, seed: Math.floor(Math.random() * 10000) }));
              setActivePreset(null);
            }}
            onResetField={() => orbEngineRef.current?.resetField()}
            onUpload={() => fileRef.current?.click()}
            onExportPNG={onOrbExportPNG}
            onExportWebM={onOrbExportWebM}
          />
        }
      />
      <input
        ref={fileRef}
        type="file"
        accept={ACCEPT}
        hidden
        onChange={(e) => {
          const file = e.currentTarget.files?.[0];
          if (file) onFile(file);
          e.currentTarget.value = '';
        }}
      />
      <p className="caption">drag to offset — drop an image to replace — space to hold the clock</p>
    </main>
  );
}
