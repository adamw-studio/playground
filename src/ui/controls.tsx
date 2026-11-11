import type { ButtonHTMLAttributes, ReactNode } from 'react';

/** Mono label/value row with a hairline separator, as in a lab readout. */
export function Readout({ label, value, unit }: { label: string; value: ReactNode; unit?: string }) {
  return (
    <div className="row">
      <span className="row-label">{label}</span>
      <span className="row-value">
        {value}
        {unit && <span className="unit">{unit}</span>}
      </span>
    </div>
  );
}

export function Field({ label, children, muted }: { label: ReactNode; children: ReactNode; muted?: boolean }) {
  return (
    <div className={`row${muted ? ' is-muted' : ''}`}>
      <span className="row-label">{label}</span>
      {children}
    </div>
  );
}

interface RoundButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
}

/** The small black disc used for every discrete action. */
export function RoundButton({ label, children, ...rest }: RoundButtonProps) {
  return (
    <button className="round" aria-label={label} title={label} {...rest}>
      {children}
    </button>
  );
}

interface SegmentedProps<T extends string> {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}

export function Segmented<T extends string>({ value, options, onChange }: SegmentedProps<T>) {
  return (
    <div className="segmented" role="radiogroup">
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={o.value === value}
          className={o.value === value ? 'on' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Switch({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      className={`switch${value ? ' on' : ''}`}
      role="switch"
      aria-checked={value}
      aria-label={label}
      onClick={() => onChange(!value)}
    >
      <i />
    </button>
  );
}

const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round' as const };

export const Icon = {
  play: () => (
    <svg width="10" height="10" viewBox="0 0 10 10">
      <path d="M3 2.2v5.6L7.8 5z" fill="currentColor" />
    </svg>
  ),
  pause: () => (
    <svg width="10" height="10" viewBox="0 0 10 10">
      <path d="M3.5 2.5v5M6.5 2.5v5" {...stroke} />
    </svg>
  ),
  reset: () => (
    <svg width="10" height="10" viewBox="0 0 10 10">
      <path d="M2.4 5a2.6 2.6 0 1 0 .8-1.9M2.4 1.9v1.6H4" {...stroke} strokeLinejoin="round" />
    </svg>
  ),
  upload: () => (
    <svg width="10" height="10" viewBox="0 0 10 10">
      <path d="M5 7.2v-5M2.8 4.2 5 2l2.2 2.2M2.4 8.4h5.2" {...stroke} strokeLinejoin="round" />
    </svg>
  ),
  trace: () => (
    <svg width="10" height="10" viewBox="0 0 10 10">
      <path d="M2 7.6 4 3.4l2 2.6 2-3.6" {...stroke} strokeLinejoin="round" />
    </svg>
  ),
  download: () => (
    <svg width="10" height="10" viewBox="0 0 10 10">
      <path d="M5 1.8v5M2.8 4.8 5 7l2.2-2.2M2.4 8.4h5.2" {...stroke} strokeLinejoin="round" />
    </svg>
  ),
};
