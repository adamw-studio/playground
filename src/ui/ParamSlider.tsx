import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { quantize, type NumericDef } from '../engine/params';
import { formatNumber } from './format';
import { useSpring } from './useSpring';

interface Props {
  def: NumericDef;
  value: number;
  defaultValue: number;
  onChange: (value: number) => void;
  /** Dimmed when the parameter does not apply to the current view or mode. */
  muted?: boolean;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/**
 * Label left, mono value right; the gray fill is the value. Drag anywhere on the bar,
 * click the number to type, double-click the label to reset. The fill eases on a spring.
 */
export function ParamSlider({ def, value, defaultValue, onChange, muted = false }: Props) {
  const bar = useRef<HTMLDivElement>(null);
  const fill = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const range = def.max - def.min;
  const zero = def.min < 0 && def.max > 0 ? -def.min / range : 0;

  useSpring(clamp01((value - def.min) / range), (f) => {
    const el = fill.current;
    if (!el) return;
    el.style.left = `${Math.min(f, zero) * 100}%`;
    el.style.width = `${Math.abs(f - zero) * 100}%`;
    el.dataset.edge = f >= zero ? 'right' : 'left';
  });

  const setFromX = (clientX: number) => {
    const rect = bar.current!.getBoundingClientRect();
    onChange(quantize(def.min + clamp01((clientX - rect.left) / rect.width) * range, def));
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    setFromX(e.clientX);
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) setFromX(e.clientX);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const dir = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[e.key];
    if (!dir) return;
    e.preventDefault();
    onChange(quantize(value + dir * def.step * (e.shiftKey ? 10 : 1), def));
  };

  const commit = (text: string) => {
    const parsed = parseFloat(text.replace('−', '-'));
    if (Number.isFinite(parsed)) onChange(quantize(parsed, def));
    setEditing(false);
  };

  return (
    <div
      ref={bar}
      className={`slider${dragging ? ' is-dragging' : ''}${value !== defaultValue ? ' is-changed' : ''}${muted ? ' is-muted' : ''}`}
      role="slider"
      tabIndex={0}
      aria-label={def.label}
      aria-valuemin={def.min}
      aria-valuemax={def.max}
      aria-valuenow={value}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={() => setDragging(false)}
      onPointerCancel={() => setDragging(false)}
      onKeyDown={onKeyDown}
    >
      <div className="slider-fill" ref={fill} />
      {zero > 0 && <div className="slider-zero" style={{ left: `${zero * 100}%` }} />}
      <span className="slider-label" onDoubleClick={() => onChange(defaultValue)} title="double-click to reset">
        {def.label}
      </span>
      {editing ? (
        <input
          className="slider-input"
          autoFocus
          defaultValue={value.toFixed(def.precision)}
          onFocus={(e) => e.currentTarget.select()}
          onPointerDown={(e) => e.stopPropagation()}
          onBlur={(e) => commit(e.currentTarget.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') commit(e.currentTarget.value);
            if (e.key === 'Escape') setEditing(false);
          }}
        />
      ) : (
        <span
          className="slider-value"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => setEditing(true)}
          title="click to type a value"
        >
          {formatNumber(value, def.precision)}
          <span className="unit">{def.unit ?? ''}</span>
        </span>
      )}
    </div>
  );
}
