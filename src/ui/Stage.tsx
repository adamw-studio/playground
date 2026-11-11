import { useLayoutEffect, useRef, type PointerEvent, type RefObject } from 'react';

interface Props {
  canvasRef: RefObject<HTMLCanvasElement>;
  aspect: number;
  onResize: (width: number, height: number) => void;
  onDrag: (dx: number, dy: number) => void;
}

/** Fits the canvas to the available area at the image's aspect, and turns drags into normalized offsets. */
export function Stage({ canvasRef, aspect, onResize, onDrag }: Props) {
  const stage = useRef<HTMLDivElement>(null);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);

  useLayoutEffect(() => {
    const el = stage.current!;
    const fit = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const { width, height } = el.getBoundingClientRect();
      const w = Math.min(width, height * aspect);
      const h = w / aspect;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      onResize(Math.round(w * dpr), Math.round(h * dpr));
    };
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    fit();
    return () => observer.disconnect();
  }, [aspect, canvasRef, onResize]);

  const onPointerDown = (e: PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    lastPoint.current = { x: e.clientX, y: e.clientY };
  };

  const onPointerMove = (e: PointerEvent<HTMLCanvasElement>) => {
    const prev = lastPoint.current;
    if (!prev) return;
    const rect = e.currentTarget.getBoundingClientRect();
    onDrag((e.clientX - prev.x) / rect.width, (e.clientY - prev.y) / rect.height);
    lastPoint.current = { x: e.clientX, y: e.clientY };
  };

  const end = () => {
    lastPoint.current = null;
  };

  return (
    <div className="stage" ref={stage}>
      <canvas
        ref={canvasRef}
        className="canvas"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={end}
        onPointerCancel={end}
      />
    </div>
  );
}
