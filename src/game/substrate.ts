// The substrate: a cell grid holding the sector's terrain. Walls live IN the
// grid, so the world is destructible — explosions carve it, leaving rubble.
// (v0.4: the material/liquid cellular automaton was removed by design — the
// grid is now purely terrain. See docs/DEVLOG.md.)
//
// Arrays are plain number[] to keep the state tree JSON-serializable.

import { clamp } from "./physics";

export const MAT = {
  empty: 0,
  wall: 1,
  /** Cosmetic floor stain left where terrain was blasted away. */
  rubble: 2,
} as const;

export type MatId = (typeof MAT)[keyof typeof MAT];

export const SUB = {
  cellSize: 16,
} as const;

export interface Substrate {
  cell: number;
  cols: number;
  rows: number;
  /** Material id per cell (MAT.*). */
  mat: number[];
}

export function createSubstrate(w: number, h: number): Substrate {
  const cell = SUB.cellSize;
  const cols = Math.ceil(w / cell);
  const rows = Math.ceil(h / cell);
  return {
    cell,
    cols,
    rows,
    mat: new Array<number>(cols * rows).fill(MAT.empty),
  };
}

/** Deterministic per-cell noise in [0, 1) — used for visual texture only. */
export function cellHash(i: number, t: number): number {
  const x = Math.sin(i * 127.1 + t * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export function cellIndexAt(sub: Substrate, x: number, y: number): number {
  const cx = clamp(Math.floor(x / sub.cell), 0, sub.cols - 1);
  const cy = clamp(Math.floor(y / sub.cell), 0, sub.rows - 1);
  return cy * sub.cols + cx;
}

/** Material at a world position. Out of bounds reads as wall. */
export function matAt(sub: Substrate, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= sub.cols * sub.cell || y >= sub.rows * sub.cell) {
    return MAT.wall;
  }
  return sub.mat[cellIndexAt(sub, x, y)];
}

/** Stamp a filled disc of wall cells. Used by generation for organic shapes. */
export function stampWallDisc(sub: Substrate, x: number, y: number, radius: number): void {
  const c = sub.cell;
  const x0 = clamp(Math.floor((x - radius) / c), 0, sub.cols - 1);
  const y0 = clamp(Math.floor((y - radius) / c), 0, sub.rows - 1);
  const x1 = clamp(Math.floor((x + radius) / c), 0, sub.cols - 1);
  const y1 = clamp(Math.floor((y + radius) / c), 0, sub.rows - 1);
  for (let cy = y0; cy <= y1; cy++) {
    for (let cx = x0; cx <= x1; cx++) {
      const px = cx * c + c / 2;
      const py = cy * c + c / 2;
      if ((px - x) * (px - x) + (py - y) * (py - y) <= radius * radius) {
        sub.mat[cy * sub.cols + cx] = MAT.wall;
      }
    }
  }
}

/** Stamp a world-space rect as walls. Used by generation. */
export function stampWallRect(
  sub: Substrate,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const c = sub.cell;
  const x0 = clamp(Math.floor(x / c), 0, sub.cols - 1);
  const y0 = clamp(Math.floor(y / c), 0, sub.rows - 1);
  const x1 = clamp(Math.ceil((x + w) / c) - 1, 0, sub.cols - 1);
  const y1 = clamp(Math.ceil((y + h) / c) - 1, 0, sub.rows - 1);
  for (let cy = y0; cy <= y1; cy++) {
    for (let cx = x0; cx <= x1; cx++) {
      sub.mat[cy * sub.cols + cx] = MAT.wall;
    }
  }
}

/**
 * Explosion: carve terrain (walls included) inside the radius, leaving rubble.
 * The outermost border ring is never carved so arenas stay sealed.
 */
export function detonate(sub: Substrate, x: number, y: number, carveRadius: number): void {
  const c = sub.cell;
  const x0 = Math.max(1, Math.floor((x - carveRadius) / c));
  const y0 = Math.max(1, Math.floor((y - carveRadius) / c));
  const x1 = Math.min(sub.cols - 2, Math.floor((x + carveRadius) / c));
  const y1 = Math.min(sub.rows - 2, Math.floor((y + carveRadius) / c));
  for (let cy = y0; cy <= y1; cy++) {
    for (let cx = x0; cx <= x1; cx++) {
      const px = cx * c + c / 2;
      const py = cy * c + c / 2;
      if (Math.hypot(px - x, py - y) <= carveRadius) {
        sub.mat[cy * sub.cols + cx] = MAT.rubble;
      }
    }
  }
}

// --- collision against wall cells ------------------------------------------

export interface SubHit {
  x: number;
  y: number;
  nx: number;
  ny: number;
}

/**
 * Resolve a circle against solid (wall) cells near it. Returns the corrected
 * position and the last contact normal, or null when free. Sequentially pushes
 * out of each overlapped cell — robust enough for cell-sized steps.
 */
export function resolveCircleSubstrate(
  sub: Substrate,
  x: number,
  y: number,
  r: number,
): SubHit | null {
  const c = sub.cell;
  let px = x;
  let py = y;
  let hit: SubHit | null = null;
  const x0 = Math.max(0, Math.floor((x - r) / c));
  const y0 = Math.max(0, Math.floor((y - r) / c));
  const x1 = Math.min(sub.cols - 1, Math.floor((x + r) / c));
  const y1 = Math.min(sub.rows - 1, Math.floor((y + r) / c));
  for (let cy = y0; cy <= y1; cy++) {
    for (let cx = x0; cx <= x1; cx++) {
      if (sub.mat[cy * sub.cols + cx] !== MAT.wall) continue;
      const rx = cx * c;
      const ry = cy * c;
      const qx = clamp(px, rx, rx + c);
      const qy = clamp(py, ry, ry + c);
      const dx = px - qx;
      const dy = py - qy;
      const d2 = dx * dx + dy * dy;
      if (d2 >= r * r) continue;
      if (d2 > 1e-9) {
        const d = Math.sqrt(d2);
        const nx = dx / d;
        const ny = dy / d;
        px = qx + nx * r;
        py = qy + ny * r;
        hit = { x: px, y: py, nx, ny };
      } else {
        // Center inside the cell: push straight up as a safe fallback.
        py = ry - r;
        hit = { x: px, y: py, nx: 0, ny: -1 };
      }
    }
  }
  if (hit) {
    hit.x = px;
    hit.y = py;
  }
  return hit;
}

/** True when any wall cell intersects the circle — generation clearance test. */
export function solidInCircle(sub: Substrate, x: number, y: number, r: number): boolean {
  const c = sub.cell;
  const x0 = Math.max(0, Math.floor((x - r) / c));
  const y0 = Math.max(0, Math.floor((y - r) / c));
  const x1 = Math.min(sub.cols - 1, Math.floor((x + r) / c));
  const y1 = Math.min(sub.rows - 1, Math.floor((y + r) / c));
  for (let cy = y0; cy <= y1; cy++) {
    for (let cx = x0; cx <= x1; cx++) {
      if (sub.mat[cy * sub.cols + cx] === MAT.wall) return true;
    }
  }
  return false;
}
