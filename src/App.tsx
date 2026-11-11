import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { StudyEngine, type EngineStats } from './engine/engine';
import { DEFAULTS, NUMERIC, quantize, type Params } from './engine/params';
import { Panel } from './ui/Panel';
import { Stage } from './ui/Stage';

const SOURCE_URL = '/tile.jpg';

function useEngineStats(engine: React.RefObject<StudyEngine | null>): EngineStats {
  const [stats, setStats] = useState<EngineStats>({
    time: 0,
    active: 0,
    total: 0,
    peakVelocity: 0,
    frameMs: 0,
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

export default function App() {
  const [params, setParams] = useState<Params>(DEFAULTS);
  const [aspect, setAspect] = useState(3 / 4);
  const [imageSize, setImageSize] = useState<[number, number] | null>(null);
  const [exporting, setExporting] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<StudyEngine | null>(null);
  const size = useRef<[number, number]>([1, 1]);
  const stats = useEngineStats(engineRef);

  useLayoutEffect(() => {
    const engine = new StudyEngine(canvasRef.current!, DEFAULTS);
    engine.resize(...size.current);
    engineRef.current = engine;
    engine.start();

    const image = new Image();
    image.src = SOURCE_URL;
    image.decode().then(() => {
      engine.setImage(image);
      setAspect(image.naturalWidth / image.naturalHeight);
      setImageSize([image.naturalWidth, image.naturalHeight]);
    });
    return () => {
      engine.stop();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    engineRef.current?.setParams(params);
  }, [params]);

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

  const onExport = async () => {
    const engine = engineRef.current;
    if (!engine) return;
    setExporting(true);
    try {
      const blob = await engine.exportPNG();
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tile-study-${Date.now()}.png`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
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

  return (
    <main className="app">
      <Stage canvasRef={canvasRef} aspect={aspect} onResize={onResize} onDrag={onDrag} />
      <Panel
        params={params}
        stats={stats}
        imageSize={imageSize}
        set={set}
        onResetAll={() => setParams(DEFAULTS)}
        onResetMotion={() => engineRef.current?.resetMotion()}
        onExport={onExport}
        exporting={exporting}
      />
      <p className="caption">drag to offset — space to hold the clock — double-click a label to reset</p>
    </main>
  );
}
