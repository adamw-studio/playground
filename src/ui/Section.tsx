import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { RoundButton } from './controls';
import { GENTLE } from './useSpring';

interface Props {
  title: string;
  defaultOpen?: boolean;
  /** Short mono note beside the title, e.g. which view the section affects. */
  note?: string;
  children: ReactNode;
}

/** Collapsible group whose height follows a gently underdamped spring. */
export function Section({ title, defaultOpen = true, note, children }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const motion = useRef({ v: 0 });
  const mounted = useRef(false);

  useLayoutEffect(() => {
    const el = outer.current!;
    if (!mounted.current) {
      mounted.current = true;
      el.style.height = open ? 'auto' : '0px';
      return;
    }
    const target = open ? inner.current!.offsetHeight : 0;
    const m = motion.current;
    let x = el.getBoundingClientRect().height;
    let last = performance.now();
    let raf = 0;

    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 1 / 30);
      last = now;
      m.v += (-GENTLE.stiffness * (x - target) - GENTLE.damping * m.v) * dt;
      x += m.v * dt;
      if (Math.abs(x - target) < 0.5 && Math.abs(m.v) < 4) {
        m.v = 0;
        el.style.height = open ? 'auto' : '0px';
        return;
      }
      el.style.height = `${Math.max(0, x)}px`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [open]);

  return (
    <section className={`section${open ? ' is-open' : ''}`}>
      <header className="section-head" onClick={() => setOpen((o) => !o)}>
        <span>
          {title}
          {note && <em className="section-note">{note}</em>}
        </span>
        <RoundButton
          label={`${open ? 'Collapse' : 'Expand'} ${title}`}
          aria-expanded={open}
          onClick={(e) => {
            e.stopPropagation();
            setOpen((o) => !o);
          }}
        >
          <span className={`pm${open ? '' : ' is-plus'}`} />
        </RoundButton>
      </header>
      <div className="section-body" ref={outer}>
        <div ref={inner}>{children}</div>
      </div>
    </section>
  );
}
