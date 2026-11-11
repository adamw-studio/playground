import { useLayoutEffect, useRef, useState, type DragEvent, type PointerEvent, type RefObject } from 'react';
import type { ViewMode } from '../engine/params';
import { useSpring } from './useSpring';

interface Props {
  rasterRef: RefObject<HTMLCanvasElement>;
  vectorRef: RefObject<HTMLCanvasElement>;
  aspect: number;
  view: ViewMode;
  split: number;
  status: string | null;
  onResize: (width: number, height: number) => void;
  onDrag: (dx: number, dy: number) => void;
  onSplit: (split: number) => void;
  onFile: (file: File) => void;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * One rounded viewport holding the raster study with the vector study stacked on top.
 * The vector layer is revealed by a spring-driven wipe: hidden (original), full (vector),
 * or up to the divider (split). Drags pan the composition; dropped images replace the source.
 */
export function Stage({ rasterRef, vectorRef, aspect, view, split, status, onResize, onDrag, onSplit, onFile }: Props) {
  const stage = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const divider = useRef<HTMLDivElement>(null);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);
  const [dropping, setDropping] = useState(false);

  useLayoutEffect(() => {
    const el = stage.current!;
    const fit = () => {
      const vp = viewport.current;
      if (!vp) return;
      const { width, height } = el.getBoundingClientRect();
      const w = Math.min(width, height * aspect);
      const h = w / aspect;
      vp.style.width = `${w}px`;
      vp.style.height = `${h}px`;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      onResize(Math.round(w * dpr), Math.round(h * dpr));
    };
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    fit();
    return () => observer.disconnect();
  }, [aspect, onResize]);

  // Left edge of the vector layer, as a fraction of the width.
  const wipe = view === 'original' ? 1 : view === 'vector' ? 0 : split;
  useSpring(wipe, (x) => {
    const pct = `${clamp(x, 0, 1) * 100}%`;
    if (vectorRef.current) vectorRef.current.style.clipPath = `inset(0 0 0 ${pct})`;
    if (divider.current) divider.current.style.left = pct;
  });

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    lastPoint.current = { x: e.clientX, y: e.clientY };
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const prev = lastPoint.current;
    if (!prev) return;
    const rect = e.currentTarget.getBoundingClientRect();
    onDrag((e.clientX - prev.x) / rect.width, (e.clientY - prev.y) / rect.height);
    lastPoint.current = { x: e.clientX, y: e.clientY };
  };

  const endDrag = () => {
    lastPoint.current = null;
  };

  const onDividerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onDividerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    const rect = viewport.current!.getBoundingClientRect();
    onSplit(clamp((e.clientX - rect.left) / rect.width, 0.04, 0.96));
  };

  const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer.types).includes('Files');

  return (
    <div className="stage" ref={stage}>
      <div
        ref={viewport}
        className={`viewport${dropping ? ' is-dropping' : ''}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDragOver={(e) => {
          if (!hasFiles(e)) return;
          e.preventDefault();
          setDropping(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropping(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDropping(false);
          const file = e.dataTransfer.files[0];
          if (file) onFile(file);
        }}
      >
        <canvas ref={rasterRef} className="layer" />
        <canvas ref={vectorRef} className="layer layer-vector" />
        <div
          ref={divider}
          className={`divider${view === 'split' ? ' is-visible' : ''}`}
          onPointerDown={onDividerDown}
          onPointerMove={onDividerMove}
        >
          <i />
        </div>
        {view === 'split' && (
          <>
            <span className="tag tag-left">original</span>
            <span className="tag tag-right">vector</span>
          </>
        )}
        <span className={`status${status ? ' is-visible' : ''}`}>{status}</span>
        <div className="drop-hint">drop image to replace</div>
      </div>
    </div>
  );
}
