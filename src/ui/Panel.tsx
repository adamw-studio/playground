import type { ReactNode } from 'react';
import { DEFAULTS, NUMERIC, type MirrorMode, type NumericKey, type Params, type RenderStyle, type TraceMode, type ViewMode } from '../engine/params';
import type { EngineStats } from '../engine/engine';
import { formatNumber } from './format';
import { ParamSlider } from './ParamSlider';
import { Section } from './Section';
import { Field, Icon, Readout, RoundButton, Segmented, Switch } from './controls';

export interface SourceInfo {
  name: string;
  size: [number, number] | null;
  isOriginal: boolean;
}

export interface VectorInfo {
  ready: boolean;
  tracing: boolean;
  shapes: number;
  points: number;
  traceMs: number;
  error: string | null;
}

interface Props {
  params: Params;
  stats: EngineStats;
  source: SourceInfo;
  vector: VectorInfo;
  transparent: boolean;
  exporting: string | null;
  vectorExportSize: string;
  set: <K extends keyof Params>(key: K, value: Params[K]) => void;
  setTransparent: (v: boolean) => void;
  onUpload: () => void;
  onRestoreOriginal: () => void;
  onTrace: () => void;
  onResetAll: () => void;
  onResetMotion: () => void;
  onExportPNG: () => void;
  onExportSVG: () => void;
  /** Panel content for the Gradient Orbs study, shown instead of the raster / vector sections. */
  orbContent: ReactNode;
}

const VIEWS: { value: ViewMode; label: string }[] = [
  { value: 'original', label: 'original' },
  { value: 'vector', label: 'vector' },
  { value: 'split', label: 'split' },
  { value: 'orbs', label: 'orbs' },
];

const MIRRORS: { value: MirrorMode; label: string }[] = [
  { value: 'none', label: '—' },
  { value: 'x', label: 'h' },
  { value: 'y', label: 'v' },
  { value: 'xy', label: 'hv' },
];

const TRACE_MODES: { value: TraceMode; label: string }[] = [
  { value: 'mono', label: 'mono' },
  { value: 'color', label: 'multi' },
];

const RENDER_STYLES: { value: RenderStyle; label: string }[] = [
  { value: 'fill', label: 'fill' },
  { value: 'line', label: 'line' },
  { value: 'both', label: 'both' },
];

const count = (n: number) => n.toLocaleString('en-US');

export function Panel(props: Props) {
  const { params, stats, source, vector, set } = props;
  const isRaster = params.view === 'original';
  const isVector = params.view === 'vector';

  const param = (key: NumericKey, muted = false) => (
    <ParamSlider
      def={NUMERIC[key]}
      value={params[key]}
      defaultValue={DEFAULTS[key]}
      muted={muted}
      onChange={(v) => set(key, v)}
    />
  );
  const size = source.size ? `${source.size[0]} × ${source.size[1]}` : '—';
  const traceLabel = vector.tracing ? 'tracing…' : vector.error ? 'trace failed — retry' : vector.ready ? 're-vectorize' : 'vectorize';

  return (
    <aside className="panel">
      <div className="panel-mode">
        <Segmented value={params.view} options={VIEWS} onChange={(v) => set('view', v)} />
      </div>

      {params.view === 'orbs' ? (
        props.orbContent
      ) : (
        <>
          <Section title="Source">
            <div className="sliders">
              {param('scale')}
              {param('offsetX')}
              {param('offsetY')}
            </div>
            <Field label={<span className="truncate" title={source.name}>{source.name}</span>}>
              <span className="row-actions">
                {!source.isOriginal && (
                  <RoundButton label="Restore original image" onClick={props.onRestoreOriginal}>
                    <Icon.reset />
                  </RoundButton>
                )}
                <RoundButton label="Upload image (JPG, PNG, WebP, HEIC)" onClick={props.onUpload}>
                  <Icon.upload />
                </RoundButton>
              </span>
            </Field>
            <Readout label="source w / h" value={size} unit="px" />
            <Readout label="canvas w / h" value={`${stats.width} × ${stats.height}`} unit="px" />
          </Section>

          <Section title="Vectorize">
            <Field label="mode">
              <Segmented value={params.traceMode} options={TRACE_MODES} onChange={(v) => set('traceMode', v)} />
            </Field>
            <div className="sliders sliders-after-row">
              {param('threshold', params.traceMode !== 'mono')}
              {param('detail')}
              {param('smoothing')}
              {param('colors', params.traceMode !== 'color')}
              {param('minArea')}
            </div>
            <Field label="invert">
              <Switch label="invert" value={params.invert} onChange={(v) => set('invert', v)} />
            </Field>
            <Field label="remove background">
              <Switch label="remove background" value={params.removeBg} onChange={(v) => set('removeBg', v)} />
            </Field>
            <Readout label="shapes / points" value={vector.ready ? `${count(vector.shapes)} / ${count(vector.points)}` : '—'} />
            <Readout label="trace" value={vector.ready ? formatNumber(vector.traceMs, 0) : '—'} unit={vector.ready ? 'ms' : undefined} />
            <Field label={traceLabel}>
              <RoundButton label="Vectorize" onClick={props.onTrace} disabled={vector.tracing}>
                <Icon.trace />
              </RoundButton>
            </Field>
          </Section>

          <Section title="Geometry" note="vector">
            <div className="sliders">
              {param('shapeScale', isRaster)}
              {param('shapeRotate', isRaster)}
              {param('strokeWidth', isRaster || params.render === 'fill')}
              {param('opacity', isRaster)}
            </div>
            <Field label="render" muted={isRaster}>
              <Segmented value={params.render} options={RENDER_STYLES} onChange={(v) => set('render', v)} />
            </Field>
          </Section>

          <Section title="Composition">
            <div className="sliders">
              {param('rotation')}
              {param('repeatX')}
              {param('repeatY')}
              {param('spacing', isRaster)}
              {param('randomness', isRaster)}
              {param('symmetry', isRaster)}
              {param('gridCols', isVector)}
              {param('gridRows', isVector)}
            </div>
            <Field label="mirror">
              <Segmented value={params.mirror} options={MIRRORS} onChange={(v) => set('mirror', v)} />
            </Field>
            <Field label="kaleidoscope" muted={isRaster}>
              <Switch label="kaleidoscope" value={params.kaleido} onChange={(v) => set('kaleido', v)} />
            </Field>
            <Field label="wrap edges">
              <Switch label="wrap edges" value={params.wrap} onChange={(v) => set('wrap', v)} />
            </Field>
          </Section>

          <Section title="Distortion">
            <div className="sliders">
              {param('displacement')}
              {param('waveAmp')}
              {param('waveFreq')}
              {param('noise')}
              {param('organic', isRaster)}
              {param('radial', isRaster)}
            </div>
          </Section>

          <Section title="Motion">
            <div className="sliders">
              {param('speed')}
              {param('spin', isRaster)}
              {param('breathe', isRaster)}
              {param('stiffness')}
              {param('damping')}
            </div>
            <Field label={params.playing ? 'clock running' : 'clock paused'}>
              <RoundButton label={params.playing ? 'Pause' : 'Play'} onClick={() => set('playing', !params.playing)}>
                {params.playing ? <Icon.pause /> : <Icon.play />}
              </RoundButton>
            </Field>
            <Readout label="time t" value={formatNumber(stats.time, 4)} unit="s" />
            <Readout label="springs active" value={`${stats.active} / ${stats.total}`} />
            <Readout label="peak velocity" value={formatNumber(stats.peakVelocity, 4)} unit="r/s" />
            <Readout label="frame raster" value={formatNumber(stats.frameMs, 2)} unit="ms" />
            <Readout
              label="frame vector"
              value={vector.ready ? `${formatNumber(stats.vectorMs, 2)}` : '—'}
              unit={vector.ready ? `ms · ${stats.copies}× · ${Math.round(stats.quality * 100)}%` : undefined}
            />
            <Field label="reset motion">
              <RoundButton label="Reset motion" onClick={props.onResetMotion}>
                <Icon.reset />
              </RoundButton>
            </Field>
          </Section>

          <div className="panel-foot">
            <Field label="reset all parameters">
              <RoundButton label="Reset all parameters" onClick={props.onResetAll}>
                <Icon.reset />
              </RoundButton>
            </Field>
            <Field label="transparent background">
              <Switch label="transparent background" value={props.transparent} onChange={props.setTransparent} />
            </Field>
            <Field label={props.exporting === 'png' ? 'rendering…' : `export png ${isRaster ? size : props.vectorExportSize}`}>
              <RoundButton label="Export PNG" onClick={props.onExportPNG} disabled={!!props.exporting}>
                <Icon.download />
              </RoundButton>
            </Field>
            <Field label={props.exporting === 'svg' ? 'writing…' : 'export svg'} muted={!vector.ready}>
              <RoundButton label="Export SVG" onClick={props.onExportSVG} disabled={!vector.ready || !!props.exporting}>
                <Icon.download />
              </RoundButton>
            </Field>
          </div>
        </>
      )}
    </aside>
  );
}
