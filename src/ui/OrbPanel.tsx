import { useState } from 'react';
import {
  ORB_NUMERIC,
  MAX_STOPS,
  MIN_STOPS,
  type Backdrop,
  type ImageField,
  type LiquidColorKey,
  type OrbLayout,
  type OrbMaterial,
  type OrbNumericKey,
  type OrbParams,
  type PaletteSource,
} from '../orbs/params';
import { ORB_DEFAULTS, type OrbPreset } from '../orbs/presets';
import type { OrbStats } from '../orbs/engine';
import { formatNumber } from './format';
import { ParamSlider } from './ParamSlider';
import { Section } from './Section';
import { Field, Icon, Readout, RoundButton, Segmented, Switch } from './controls';

interface Props {
  orb: OrbParams;
  palette: string[];
  stats: OrbStats;
  presets: { builtIn: OrbPreset[]; liquid: OrbPreset[]; saved: OrbPreset[] };
  activePreset: string | null;
  sourceName: string;
  error: string | null;
  transparent: boolean;
  exporting: string | null;
  set: <K extends keyof OrbParams>(key: K, value: OrbParams[K]) => void;
  setPalette: (colors: string[]) => void;
  setTransparent: (v: boolean) => void;
  onPreset: (preset: OrbPreset) => void;
  onDeletePreset: (index: number) => void;
  onSavePreset: () => void;
  onExportPreset: () => void;
  onRandomize: () => void;
  onShufflePalette: () => void;
  onVariations: () => void;
  onResetField: () => void;
  onResetEquilibrium: () => void;
  onMaterial: (material: OrbMaterial) => void;
  onUpload: () => void;
  onExportPNG: (scale: number) => void;
  onExportWebM: () => void;
}

const SOURCES: { value: PaletteSource; label: string }[] = [
  { value: 'manual', label: 'manual' },
  { value: 'image', label: 'image' },
];

const FIELDS: { value: ImageField; label: string }[] = [
  { value: 'off', label: 'off' },
  { value: 'color', label: 'color' },
  { value: 'warp', label: 'warp' },
];

const LAYOUTS: { value: OrbLayout; label: string }[] = [
  { value: 'single', label: 'one' },
  { value: 'scatter', label: 'scatter' },
  { value: 'grid', label: 'grid' },
  { value: 'overlap', label: 'overlap' },
];

const MATERIALS: { value: OrbMaterial; label: string }[] = [
  { value: 'gradient', label: 'gradient' },
  { value: 'liquid', label: 'liquid' },
];

const BACKDROPS: { value: Backdrop; label: string }[] = [
  { value: 'studio', label: 'studio' },
  { value: 'image', label: 'image' },
];

const SCALES = [
  { value: '1', label: '1×' },
  { value: '2', label: '2×' },
  { value: '4', label: '4×' },
];

const strip = (colors: string[]) => `linear-gradient(90deg, ${colors.join(', ')})`;

/** Swatch strip for a preset: its palette, or for liquid materials its environment and body colours. */
function presetStrip(p: OrbPreset) {
  if (p.params.material === 'liquid') {
    const q = { ...ORB_DEFAULTS, ...p.params };
    return strip([q.envTop, q.glassTint, q.liquidColor, q.rimColor, q.envBottom]);
  }
  return strip(p.params.palette ?? []);
}

/** A single colour, edited with the system picker. */
function ColorRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="row">
      <span className="row-label">{label}</span>
      <span className="row-actions">
        <span className="row-value">{value}</span>
        <label className="swatch" style={{ background: value }} title={value}>
          <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
        </label>
      </span>
    </div>
  );
}

/** Editable colour stops: each swatch opens the system colour picker. */
function Swatches({ colors, onChange }: { colors: string[]; onChange: (c: string[]) => void }) {
  return (
    <div className="swatches">
      {colors.map((c, i) => (
        <label key={i} className="swatch" style={{ background: c }} title={c}>
          <input
            type="color"
            value={c}
            onChange={(e) => {
              const next = [...colors];
              next[i] = e.target.value;
              onChange(next);
            }}
          />
        </label>
      ))}
    </div>
  );
}

export function OrbPanel(props: Props) {
  const { orb, set, stats } = props;
  const [scale, setScale] = useState('2');
  const single = orb.layout === 'single';
  const liquid = orb.material === 'liquid';
  const color = (key: LiquidColorKey, label: string) => (
    <ColorRow label={label} value={orb[key]} onChange={(v) => set(key, v)} />
  );

  const param = (key: OrbNumericKey, muted = false) => (
    <ParamSlider
      def={ORB_NUMERIC[key]}
      value={orb[key]}
      defaultValue={ORB_DEFAULTS[key]}
      muted={muted}
      onChange={(v) => set(key, v)}
    />
  );

  return (
    <>
      {props.error && <div className="notice-row">webgl2 unavailable — {props.error}</div>}

      <Field label="material">
        <Segmented value={orb.material} options={MATERIALS} onChange={props.onMaterial} />
      </Field>

      <Section title="Presets" note={liquid ? 'liquid' : 'orb'}>
        <div className="presets">
          {(liquid ? props.presets.liquid : props.presets.builtIn).map((p, i) => (
            <button
              key={p.name}
              className={`preset${props.activePreset === p.name ? ' on' : ''}`}
              onClick={() => props.onPreset(p)}
            >
              <i style={{ background: presetStrip(p) }} />
              <span>
                {String(i + 1).padStart(2, '0')} {p.name}
              </span>
            </button>
          ))}
          {props.presets.saved.map((p, i) =>
            (p.params.material ?? 'gradient') !== orb.material ? null : (
            <div key={`${p.name}-${i}`} className={`preset is-saved${props.activePreset === p.name ? ' on' : ''}`}>
              <button className="preset-apply" onClick={() => props.onPreset(p)}>
                <i style={{ background: presetStrip(p) }} />
                <span>{p.name}</span>
              </button>
              <button className="preset-delete" aria-label={`Delete ${p.name}`} onClick={() => props.onDeletePreset(i)}>
                <Icon.close />
              </button>
            </div>
            ),
          )}
        </div>
        <div className="sliders sliders-after-row">{param('seed')}</div>
        <Field label="randomize · save · json">
          <span className="row-actions">
            <RoundButton label="Randomize" onClick={props.onRandomize}>
              <Icon.shuffle />
            </RoundButton>
            <RoundButton label="Save as preset" onClick={props.onSavePreset}>
              <Icon.save />
            </RoundButton>
            <RoundButton label="Download preset as JSON" onClick={props.onExportPreset}>
              <Icon.download />
            </RoundButton>
          </span>
        </Field>
      </Section>

      {liquid ? (
        <>
          <Section title="Material">
            <div className="sliders">
              {param('ior')}
              {param('roughness')}
              {param('transmission')}
              {param('fresnel')}
              {param('dispersion')}
              {param('density')}
              {param('clearcoat')}
              {param('normalDistort')}
            </div>
            {color('glassTint', 'glass tint')}
          </Section>

          <Section title="Liquid">
            <div className="sliders">
              {param('fill')}
              {param('viscosity', orb.fill === 0)}
              {param('meniscus', orb.fill === 0)}
              {param('waveAmp', orb.fill === 0)}
              {param('waveFreq', orb.fill === 0)}
              {param('slosh', orb.fill === 0)}
              {param('liquidAbsorb', orb.fill === 0)}
            </div>
            {color('liquidColor', 'absorption colour')}
          </Section>

          <Section title="Shape" note="liquid">
            <div className="sliders">
              {param('radius')}
              {param('tension')}
              {param('elasticity')}
              {param('restSpeed')}
              {param('wobble')}
              {param('wobbleFreq')}
              {param('stretchX')}
              {param('stretchY')}
              {param('breathing')}
              {param('posX')}
              {param('posY')}
            </div>
          </Section>

          <Section title="Light">
            <div className="sliders">
              {param('lightX')}
              {param('lightY')}
              {param('reflection')}
              {param('specular')}
              {param('rim')}
              {param('edgeLight')}
              {param('bloom')}
              {param('exposure')}
            </div>
            {color('rimColor', 'rim colour')}
          </Section>

          <Section title="Environment">
            <Field label="backdrop">
              <Segmented value={orb.backdrop} options={BACKDROPS} onChange={(v) => set('backdrop', v)} />
            </Field>
            {orb.backdrop === 'image' && (
              <Field label={<span className="truncate" title={props.sourceName}>{props.sourceName}</span>}>
                <RoundButton label="Upload image" onClick={props.onUpload}>
                  <Icon.upload />
                </RoundButton>
              </Field>
            )}
            <div className="sliders sliders-after-row">
              {param('horizon', orb.backdrop === 'image')}
              {param('band', orb.backdrop === 'image')}
              {param('grid', orb.backdrop === 'image')}
              {param('beam', orb.backdrop === 'image')}
              {param('grain')}
            </div>
            {color('envTop', 'sky')}
            {color('envHorizon', 'horizon')}
            {color('envBottom', 'ground')}
          </Section>
        </>
      ) : (
        <>
          <Section title="Shape">
            <div className="sliders">
              {param('radius')}
              {param('aspect')}
              {param('edge')}
              {param('distortion')}
              {param('posX')}
              {param('posY')}
            </div>
          </Section>

          <Section title="Color">
            <Field label="palette">
              <Segmented value={orb.paletteSource} options={SOURCES} onChange={(v) => set('paletteSource', v)} />
            </Field>
            <div className="row palette-row">
              <Swatches colors={props.palette} onChange={props.setPalette} />
              <span className="row-actions">
                <RoundButton
                  label="Remove colour stop"
                  disabled={props.palette.length <= MIN_STOPS}
                  onClick={() => props.setPalette(props.palette.slice(0, -1))}
                >
                  <Icon.minus />
                </RoundButton>
                <RoundButton
                  label="Add colour stop"
                  disabled={props.palette.length >= MAX_STOPS}
                  onClick={() => props.setPalette([...props.palette, props.palette[props.palette.length - 1]])}
                >
                  <Icon.plus />
                </RoundButton>
                <RoundButton label="Randomize palette" onClick={props.onShufflePalette}>
                  <Icon.shuffle />
                </RoundButton>
              </span>
            </div>
            {orb.paletteSource === 'image' && (
              <Field label={<span className="truncate" title={props.sourceName}>from {props.sourceName}</span>}>
                <RoundButton label="Upload image" onClick={props.onUpload}>
                  <Icon.upload />
                </RoundButton>
              </Field>
            )}
            <div className="sliders sliders-after-row">
              {param('blend')}
              {param('contrast')}
              {param('saturation')}
              {param('brightness')}
              {param('hueShift')}
            </div>
            <Field label="image field">
              <Segmented value={orb.imageField} options={FIELDS} onChange={(v) => set('imageField', v)} />
            </Field>
            <div className="sliders sliders-after-row">{param('imageInfluence', orb.imageField === 'off')}</div>
          </Section>

          <Section title="Texture">
            <div className="sliders">
              {param('grain')}
              {param('grainScale')}
              {param('frequency')}
              {param('complexity')}
              {param('warp')}
              {param('softness')}
              {param('dither')}
            </div>
          </Section>

          <Section title="Depth">
            <div className="sliders">
              {param('lightX')}
              {param('lightY')}
              {param('lightIntensity')}
              {param('shadowSoftness')}
              {param('shading')}
              {param('depth')}
            </div>
          </Section>

        </>
      )}

      <Section title="Motion">
        <div className="sliders">
          {param('speed')}
          {param('flow')}
          {param('turbulence')}
          {param('morph')}
          {param('loop')}
        </div>
        <Field label={orb.playing ? 'clock running' : 'frozen'}>
          <RoundButton label={orb.playing ? 'Freeze' : 'Play'} onClick={() => set('playing', !orb.playing)}>
            {orb.playing ? <Icon.pause /> : <Icon.play />}
          </RoundButton>
        </Field>
        <Readout label="loop phase" value={formatNumber(stats.phase, 4)} />
        <Readout label="frame" value={formatNumber(stats.frameMs, 2)} unit="ms" />
        {liquid ? (
          <Field label="reset to equilibrium">
            <RoundButton label="Reset to equilibrium" onClick={props.onResetEquilibrium}>
              <Icon.reset />
            </RoundButton>
          </Field>
        ) : (
          <Field label="re-centre colour field">
            <RoundButton label="Re-centre colour field" onClick={props.onResetField}>
              <Icon.reset />
            </RoundButton>
          </Field>
        )}
      </Section>

      <Section title="Composition" note="orb">
        <Field label="layout">
          <Segmented value={orb.layout} options={LAYOUTS} onChange={(v) => set('layout', v)} />
        </Field>
        <div className="sliders sliders-after-row">
          {param('count', single)}
          {param('spacing', single)}
          {param('sizeVariance', single)}
        </div>
        <Field label="independent colour seeds" muted={single}>
          <Switch label="independent colour seeds" value={orb.independent} onChange={(v) => set('independent', v)} />
        </Field>
        <Field label="generate variations">
          <RoundButton label="Generate variations" onClick={props.onVariations}>
            <Icon.grid />
          </RoundButton>
        </Field>
      </Section>

      <div className="panel-foot">
        <Field label="transparent background">
          <Switch label="transparent background" value={props.transparent} onChange={props.setTransparent} />
        </Field>
        <Field label={props.exporting === 'png' ? 'rendering…' : `export png ${1200 * Number(scale)}²`}>
          <span className="row-actions">
            <Segmented value={scale} options={SCALES} onChange={setScale} />
            <RoundButton label="Export PNG" disabled={!!props.exporting} onClick={() => props.onExportPNG(Number(scale))}>
              <Icon.download />
            </RoundButton>
          </span>
        </Field>
        <Field
          label={
            stats.recording !== null
              ? `recording ${Math.round(stats.recording * 100)}%`
              : `export webm · one loop ${formatNumber(orb.loop, 1)}s`
          }
        >
          <RoundButton label="Record one loop as WebM" disabled={!!props.exporting} onClick={props.onExportWebM}>
            <Icon.download />
          </RoundButton>
        </Field>
      </div>
    </>
  );
}
