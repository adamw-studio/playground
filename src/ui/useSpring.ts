import { useLayoutEffect, useRef } from 'react';

export interface SpringConfig {
  stiffness: number;
  damping: number;
}

/** Snappy, barely underdamped — for direct-manipulation feedback. */
export const SNAPPY: SpringConfig = { stiffness: 520, damping: 40 };
/** Softer, with a hint of overshoot — for things that open and close. */
export const GENTLE: SpringConfig = { stiffness: 300, damping: 28 };

/**
 * Drives `apply` with a damped spring toward `target`, outside React's render cycle.
 * Velocity carries over when the target changes mid-flight, so motion stays continuous.
 */
export function useSpring(target: number, apply: (x: number) => void, config: SpringConfig = SNAPPY) {
  const state = useRef({ x: target, v: 0 });
  const applyRef = useRef(apply);
  applyRef.current = apply;

  useLayoutEffect(() => {
    applyRef.current(state.current.x);
  }, []);

  useLayoutEffect(() => {
    const s = state.current;
    const { stiffness: k, damping: c } = config;
    let last = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 1 / 30);
      last = now;
      s.v += (-k * (s.x - target) - c * s.v) * dt;
      s.x += s.v * dt;
      if (Math.abs(s.x - target) < 1e-4 && Math.abs(s.v) < 1e-3) {
        s.x = target;
        s.v = 0;
        applyRef.current(target);
        return;
      }
      applyRef.current(s.x);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, config]);
}
