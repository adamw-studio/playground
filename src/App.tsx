import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { StudyEngine, type EngineStats } from './engine/engine';
import { DEFAULTS, NUMERIC, TRACE_KEYS, quantize, type Params } from './engine/params';
import { ACCEPT, isSupportedImage, loadSourceFile, loadSourceUrl, type Source } from './engine/source';
import { Tracer } from './vector/tracer';
import type { TraceOptions, VectorArt } from './vector/types';
import { Panel } from './ui/Panel';
import { Stage } from './ui/Stage';

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

  const rasterRef = useRef<HTMLCanvasElement>(null);
  const vectorRef = useRef<HTMLCanvasElement>(null);
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
    if (!source || (params.view === 'original' && !artRef.current)) return;
    const id = window.setTimeout(() => runTrace(false), artRef.current ? 280 : 0);
    return () => window.clearTimeout(id);
  }, [source, optionsKey, params.view, runTrace]);

  const set = useCallback(<K extends keyof Params>(key: K, value: Params[K]) => {
    setParams((p) => ({ ...p, [key]: value }));
  }, []);

  const onResize = useCallback((w: number, h: number) => {
    size.current = [w, h];
    engineRef.current?.resize(w, h);
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
      setParams((p) => ({ ...p, playing: !p.playing }));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const exportSize = engineRef.current?.vectorExportSize();
  const status =
    notice ??
    (tracing ? 'tracing…' : params.view !== 'original' && traceError ? 'trace failed' : null);

  return (
    <main className="app">
      <Stage
        rasterRef={rasterRef}
        vectorRef={vectorRef}
        aspect={source ? source.width / source.height : 3 / 4}
        view={params.view}
        split={split}
        status={status}
        onResize={onResize}
        onDrag={onDrag}
        onSplit={setSplit}
        onFile={onFile}
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
