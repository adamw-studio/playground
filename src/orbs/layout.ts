import { rng } from './color';
import { MAX_ORBS, type OrbLayout } from './params';

export interface OrbSlot {
  x: number;
  y: number;
  r: number;
  aspect: number;
  /** Per-orb offset into the noise field, so every orb is a distinct variation. */
  fx: number;
  fy: number;
  /** Shift along the palette ramp when orbs have independent colour seeds. */
  shift: number;
  rotation: number;
}

export interface LayoutInput {
  layout: OrbLayout;
  count: number;
  radius: number;
  aspect: number;
  posX: number;
  posY: number;
  spacing: number;
  sizeVariance: number;
  independent: boolean;
  seed: number;
}

/** Arranges orbs in frame units: a square from −0.5 to 0.5, y pointing down. */
export function layoutOrbs(p: LayoutInput): OrbSlot[] {
  const n = p.layout === 'single' ? 1 : Math.max(1, Math.min(MAX_ORBS, Math.round(p.count)));
  const rand = rng(p.seed * 31 + 5);
  const variation = () => ({
    fx: rand() * 97.3,
    fy: rand() * 61.7,
    shift: p.independent && n > 1 ? (rand() - 0.5) * 0.9 : 0,
    rotation: n > 1 ? (rand() - 0.5) * Math.PI : 0,
  });
  const vary = () => 1 - p.sizeVariance * 0.6 * rand();

  if (p.layout === 'single') {
    return [{ x: p.posX, y: p.posY, r: p.radius, aspect: p.aspect, ...variation(), rotation: 0 }];
  }

  const slots: OrbSlot[] = [];
  if (p.layout === 'grid') {
    const cols = Math.ceil(Math.sqrt(n));
    const rows = Math.ceil(n / cols);
    const cell = 0.92 / Math.max(cols, rows);
    for (let i = 0; i < n; i++) {
      const c = i % cols;
      const r = Math.floor(i / cols);
      const inRow = r === rows - 1 ? n - r * cols : cols;
      slots.push({
        x: p.posX + (c - (inRow - 1) / 2) * cell,
        y: p.posY + (r - (rows - 1) / 2) * cell,
        r: cell * 0.5 * (1 - p.spacing) * (p.radius / 0.36) * vary(),
        aspect: p.aspect,
        ...variation(),
      });
    }
  } else if (p.layout === 'overlap') {
    // A loose cluster on a golden-angle spiral; spacing pulls it apart.
    for (let i = 0; i < n; i++) {
      const a = i * 2.39996 + rand() * 0.4;
      const d = (0.08 + p.spacing * 0.45) * Math.sqrt((i + 0.5) / n);
      slots.push({
        x: p.posX + Math.cos(a) * d,
        y: p.posY + Math.sin(a) * d,
        r: p.radius * 0.7 * vary(),
        aspect: p.aspect,
        ...variation(),
      });
    }
  } else {
    // Scatter: random placement, rejecting heavy overlaps.
    const base = Math.min(0.45, (p.radius * 1.15) / Math.sqrt(n));
    for (let i = 0; i < n; i++) {
      const r = base * vary();
      let best = { x: 0, y: 0, score: -Infinity };
      for (let tries = 0; tries < 40; tries++) {
        const x = (rand() - 0.5) * (1 - 2 * r);
        const y = (rand() - 0.5) * (1 - 2 * r);
        let score = Infinity;
        for (const s of slots) score = Math.min(score, Math.hypot(s.x - p.posX - x, s.y - p.posY - y) - (s.r + r) * (1 + p.spacing));
        if (score > best.score) best = { x, y, score };
        if (score > 0) break;
      }
      slots.push({ x: p.posX + best.x, y: p.posY + best.y, r, aspect: p.aspect, ...variation() });
    }
  }
  // Larger orbs sit behind smaller ones.
  return slots.sort((a, b) => b.r - a.r);
}
