// The substrate: a coarse material grid underlying every sector, simulated as
// a cellular automaton. This is the Noita-inspired layer — fire spreads across
// oil, coolant quenches fire into steam, acid dissolves walls. Terrain (walls)
// lives IN the grid, so the world itself is destructible.
//
// Determinism: the CA uses a hash of (cell index, tick) for randomness instead
// of RunState.rng, so material chaos never perturbs procedural generation and
// a run stays reproducible from its seed. Arrays are plain number[] to keep
// the state tree JSON-serializable (see CLAUDE.md).

import { clamp } from "./physics";

export const MAT = {
  empty: 0,
  wall: 1,
  coolant: 2,
  oil: 3,
  acid: 4,
  fire: 5,
  steam: 6,
  scorch: 7,
} as const;

export type MatId = (typeof MAT)[keyof typeof MAT];

// CA tuning. The sim steps at SIM_STEP intervals (10 Hz) — cheap, and the
// flicker cadence reads well; per-frame entity *sampling* stays continuous.
export const SUB = {
  cellSize: 16,
  simStep: 0.1,
  wallHp: 1.0, // seconds of adjacent acid contact to dissolve a wall cell
  oilFuel: 2.6, // how long an ignited oil cell burns
  flashFuel: 0.5, // fire conjured on non-fuel cells (explosions, trails)
  steamLife: 3.2,
  acidAmount: 4.0, // how much dissolving an acid cell can do before spending itself
  acidPower: 1.1, // wall-hp damage per second of adjacency
  fireSpreadChance: 0.5, // per neighbor per sim tick
} as const;

export interface Substrate {
  cell: number;
  cols: number;
  rows: number;
  /** Material id per cell (MAT.*). */
  mat: number[];
  /** Per-cell scalar: fire fuel, steam life, acid amount, or wall hp. */
  fuel: number[];
  simAccum: number;
  tick: number;
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
    fuel: new Array<number>(cols * rows).fill(0),
    simAccum: 0,
    tick: 0,
  };
}

/** Deterministic per-cell noise in [0, 1); stable across replays of a seed. */
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

function setCell(sub: Substrate, i: number, mat: number, fuel: number): void {
  sub.mat[i] = mat;
  sub.fuel[i] = fuel;
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
      setCell(sub, cy * sub.cols + cx, MAT.wall, SUB.wallHp);
    }
  }
}

/** Paint a fluid disc onto EMPTY cells only (never overwrites walls). */
export function paintPool(
  sub: Substrate,
  x: number,
  y: number,
  radius: number,
  mat: MatId,
  fuel: number,
): void {
  const c = sub.cell;
  const x0 = Math.max(0, Math.floor((x - radius) / c));
  const y0 = Math.max(0, Math.floor((y - radius) / c));
  const x1 = Math.min(sub.cols - 1, Math.floor((x + radius) / c));
  const y1 = Math.min(sub.rows - 1, Math.floor((y + radius) / c));
  for (let cy = y0; cy <= y1; cy++) {
    for (let cx = x0; cx <= x1; cx++) {
      const px = cx * c + c / 2;
      const py = cy * c + c / 2;
      const d2 = (px - x) * (px - x) + (py - y) * (py - y);
      if (d2 > radius * radius) continue;
      const i = cy * sub.cols + cx;
      // Roughen the pool edge deterministically so it reads organic.
      if (d2 > radius * radius * 0.55 && cellHash(i, 7) < 0.35) continue;
      if (sub.mat[i] === MAT.empty || sub.mat[i] === MAT.scorch) {
        setCell(sub, i, mat, fuel);
      }
    }
  }
}

/** Write fire at a world position (ignites oil properly, flashes elsewhere). */
export function igniteAt(sub: Substrate, x: number, y: number): void {
  const i = cellIndexAt(sub, x, y);
  const m = sub.mat[i];
  if (m === MAT.oil) setCell(sub, i, MAT.fire, SUB.oilFuel);
  else if (m === MAT.empty || m === MAT.scorch) setCell(sub, i, MAT.fire, SUB.flashFuel);
}

/** Write acid at a world position onto empty/scorch ground. */
export function spillAcidAt(sub: Substrate, x: number, y: number): void {
  const i = cellIndexAt(sub, x, y);
  const m = sub.mat[i];
  if (m === MAT.empty || m === MAT.scorch || m === MAT.oil) {
    setCell(sub, i, MAT.acid, SUB.acidAmount);
  }
}

/**
 * Splash a material disc — the impact effect of material payload cards.
 * Rules per material: coolant quenches fire to steam and coats ground/oil;
 * fire ignites oil and flashes on bare ground; acid coats ground and oil;
 * oil coats bare ground only. Walls are never overwritten (use detonate/acid
 * erosion for terrain damage).
 */
export function splashMaterial(
  sub: Substrate,
  x: number,
  y: number,
  radius: number,
  kind: "fire" | "coolant" | "acid" | "oil",
): void {
  const c = sub.cell;
  const x0 = Math.max(1, Math.floor((x - radius) / c));
  const y0 = Math.max(1, Math.floor((y - radius) / c));
  const x1 = Math.min(sub.cols - 2, Math.floor((x + radius) / c));
  const y1 = Math.min(sub.rows - 2, Math.floor((y + radius) / c));
  for (let cy = y0; cy <= y1; cy++) {
    for (let cx = x0; cx <= x1; cx++) {
      const px = cx * c + c / 2;
      const py = cy * c + c / 2;
      if ((px - x) * (px - x) + (py - y) * (py - y) > radius * radius) continue;
      const i = cy * sub.cols + cx;
      const m = sub.mat[i];
      if (kind === "coolant") {
        if (m === MAT.fire) setCell(sub, i, MAT.steam, SUB.steamLife);
        else if (m === MAT.empty || m === MAT.scorch || m === MAT.oil) {
          setCell(sub, i, MAT.coolant, 0);
        }
      } else if (kind === "fire") {
        if (m === MAT.oil) setCell(sub, i, MAT.fire, SUB.oilFuel);
        else if (m === MAT.empty || m === MAT.scorch) setCell(sub, i, MAT.fire, SUB.flashFuel);
      } else if (kind === "acid") {
        if (m === MAT.empty || m === MAT.scorch || m === MAT.oil) {
          setCell(sub, i, MAT.acid, SUB.acidAmount);
        }
      } else {
        if (m === MAT.empty || m === MAT.scorch) setCell(sub, i, MAT.oil, 0);
      }
    }
  }
}

/**
 * Explosion: carve terrain (walls included) inside carveRadius, ignite
 * flammables out to igniteRadius. Border cells stay so arenas remain sealed.
 */
export function detonate(
  sub: Substrate,
  x: number,
  y: number,
  carveRadius: number,
  igniteRadius: number,
): void {
  const c = sub.cell;
  const x0 = Math.max(1, Math.floor((x - igniteRadius) / c));
  const y0 = Math.max(1, Math.floor((y - igniteRadius) / c));
  const x1 = Math.min(sub.cols - 2, Math.floor((x + igniteRadius) / c));
  const y1 = Math.min(sub.rows - 2, Math.floor((y + igniteRadius) / c));
  for (let cy = y0; cy <= y1; cy++) {
    for (let cx = x0; cx <= x1; cx++) {
      const px = cx * c + c / 2;
      const py = cy * c + c / 2;
      const d = Math.hypot(px - x, py - y);
      const i = cy * sub.cols + cx;
      const m = sub.mat[i];
      if (d <= carveRadius) {
        // Blast zone: everything (walls, fluids) becomes scorched floor.
        setCell(sub, i, MAT.scorch, 0);
      } else if (d <= igniteRadius) {
        if (m === MAT.oil) setCell(sub, i, MAT.fire, SUB.oilFuel);
        else if ((m === MAT.empty || m === MAT.scorch) && cellHash(i, 13) < 0.3) {
          setCell(sub, i, MAT.fire, SUB.flashFuel);
        }
      }
    }
  }
}

/**
 * Advance the CA. Fire consumes fuel and spreads to oil; adjacent coolant
 * quenches fire into steam; acid erodes neighboring walls and spends itself;
 * steam fades. Reads from a snapshot so update order can't bias a tick.
 */
export function stepSubstrate(sub: Substrate, dt: number): void {
  sub.simAccum += dt;
  while (sub.simAccum >= SUB.simStep) {
    sub.simAccum -= SUB.simStep;
    sub.tick += 1;
    caTick(sub, SUB.simStep);
  }
}

function caTick(sub: Substrate, dt: number): void {
  const { cols, rows, mat, fuel } = sub;
  const prev = mat.slice();
  const t = sub.tick;

  for (let i = 0; i < prev.length; i++) {
    const m = prev[i];
    if (m === MAT.fire) {
      // Quench: any adjacent coolant beats fire.
      if (neighborHas(prev, cols, rows, i, MAT.coolant)) {
        setCell(sub, i, MAT.steam, SUB.steamLife);
        continue;
      }
      fuel[i] -= dt;
      if (fuel[i] <= 0) {
        setCell(sub, i, MAT.scorch, 0);
        continue;
      }
      // Spread into neighboring oil.
      spreadFire(sub, prev, cols, rows, i, t);
    } else if (m === MAT.acid) {
      let spent = 0;
      forNeighbors(cols, rows, i, (n) => {
        // The arena border ring is indestructible so the world stays sealed.
        const ncx = n % cols;
        const ncy = (n - ncx) / cols;
        if (ncx === 0 || ncy === 0 || ncx === cols - 1 || ncy === rows - 1) return;
        if (prev[n] === MAT.wall && mat[n] === MAT.wall) {
          fuel[n] -= SUB.acidPower * dt;
          spent += dt;
          if (fuel[n] <= 0) setCell(sub, n, MAT.empty, 0);
        }
      });
      if (spent > 0) {
        fuel[i] -= spent;
        if (fuel[i] <= 0) setCell(sub, i, MAT.scorch, 0);
      }
    } else if (m === MAT.steam) {
      fuel[i] -= dt;
      if (fuel[i] <= 0) setCell(sub, i, MAT.empty, 0);
    }
  }
}

function spreadFire(
  sub: Substrate,
  prev: number[],
  cols: number,
  rows: number,
  i: number,
  t: number,
): void {
  forNeighbors(cols, rows, i, (n) => {
    if (prev[n] === MAT.oil && sub.mat[n] === MAT.oil) {
      if (cellHash(n, t) < SUB.fireSpreadChance) {
        setCell(sub, n, MAT.fire, SUB.oilFuel);
      }
    }
  });
}

function forNeighbors(
  cols: number,
  rows: number,
  i: number,
  fn: (n: number) => void,
): void {
  const cx = i % cols;
  const cy = (i - cx) / cols;
  if (cx > 0) fn(i - 1);
  if (cx < cols - 1) fn(i + 1);
  if (cy > 0) fn(i - cols);
  if (cy < rows - 1) fn(i + cols);
}

function neighborHas(
  prev: number[],
  cols: number,
  rows: number,
  i: number,
  m: number,
): boolean {
  const cx = i % cols;
  const cy = (i - cx) / cols;
  return (
    (cx > 0 && prev[i - 1] === m) ||
    (cx < cols - 1 && prev[i + 1] === m) ||
    (cy > 0 && prev[i - cols] === m) ||
    (cy < rows - 1 && prev[i + cols] === m)
  );
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
