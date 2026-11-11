import { DEFAULTS, NUMERIC, type MirrorMode, type NumericKey, type Params } from '../engine/params';
import type { EngineStats } from '../engine/engine';
import { formatNumber } from './format';
import { ParamSlider } from './ParamSlider';
import { Section } from './Section';
import { Field, Icon, Readout, RoundButton, Segmented, Switch } from './controls';

interface Props {
  params: Params;
  stats: EngineStats;
  imageSize: [number, number] | null;
  set: <K extends keyof Params>(key: K, value: Params[K]) => void;
  onResetAll: () => void;
  onResetMotion: () => void;
  onExport: () => void;
  exporting: boolean;
}

const MIRRORS: { value: MirrorMode; label: string }[] = [
  { value: 'none', label: '—' },
  { value: 'x', label: 'h' },
  { value: 'y', label: 'v' },
  { value: 'xy', label: 'hv' },
];

export function Panel({ params, stats, imageSize, set, onResetAll, onResetMotion, onExport, exporting }: Props) {
  const param = (key: NumericKey) => (
    <ParamSlider def={NUMERIC[key]} value={params[key]} defaultValue={DEFAULTS[key]} onChange={(v) => set(key, v)} />
  );
  const size = imageSize ? `${imageSize[0]} × ${imageSize[1]}` : '—';

  return (
    <aside className="panel">
      <Section title="Source">
        <div className="sliders">
          {param('scale')}
          {param('offsetX')}
          {param('offsetY')}
        </div>
        <Readout label="source w / h" value={size} unit="px" />
        <Readout label="canvas w / h" value={`${stats.width} × ${stats.height}`} unit="px" />
      </Section>

      <Section title="Composition">
        <div className="sliders">
          {param('rotation')}
          {param('repeatX')}
          {param('repeatY')}
          {param('gridCols')}
          {param('gridRows')}
        </div>
        <Field label="mirror">
          <Segmented value={params.mirror} options={MIRRORS} onChange={(v) => set('mirror', v)} />
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
        </div>
      </Section>

      <Section title="Motion">
        <div className="sliders">
          {param('speed')}
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
        <Readout label="frame" value={formatNumber(stats.frameMs, 2)} unit="ms" />
        <Field label="reset motion">
          <RoundButton label="Reset motion" onClick={onResetMotion}>
            <Icon.reset />
          </RoundButton>
        </Field>
      </Section>

      <div className="panel-foot">
        <Field label="reset all parameters">
          <RoundButton label="Reset all parameters" onClick={onResetAll}>
            <Icon.reset />
          </RoundButton>
        </Field>
        <Field label={exporting ? 'rendering…' : `export png ${size}`}>
          <RoundButton label="Export PNG" onClick={onExport} disabled={exporting}>
            <Icon.download />
          </RoundButton>
        </Field>
      </div>
    </aside>
  );
}
