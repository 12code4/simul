// Seeded procedural generation of a sector: terrain (stamped into the
// substrate grid — destructible!), data shards, flux motes, autonomous
// hazards, canisters, card pickups, spawn point, and the exit gate. Placement
// is rejection sampling with clearance rules, deterministic per seed.

import { FOUND_FRAMES, type CardId, type CastMods, type FrameId } from "./cards";
import { config } from "./config";
import { clamp, dist, type Rect } from "./physics";
import { nextFloat, pick, range, shuffle, type Rng } from "./rng";
import {
  createSubstrate,
  solidInCircle,
  stampWallRect,
  SUB,
  type Substrate,
} from "./substrate";

export interface PointItem {
  x: number;
  y: number;
}

export type Hazard =
  | { kind: "drifter"; id: number; hp: number; x: number; y: number; vx: number; vy: number; r: number }
  | { kind: "seeker"; id: number; hp: number; x: number; y: number; vx: number; vy: number; r: number }
  | { kind: "sweeper"; id: number; hp: number; x: number; y: number; r: number; ax: number; ay: number; bx: number; by: number; phase: number; rate: number }
  | { kind: "pulsar"; id: number; hp: number; x: number; y: number; r: number; timer: number };

/** A card pickup in the world. */
export interface CardNode {
  x: number;
  y: number;
  card: CardId;
}

/** A caster-frame pickup in the world. */
export interface FrameNode {
  x: number;
  y: number;
  frame: FrameId;
}

/** A live projectile cast from the player's caster. */
export interface Projectile {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  dmg: number;
  card: CardId;
  life: number;
  bounces: number;
  pierce: boolean;
  homing: boolean;
  /** Trigger payloads: the card (+folded mods) cast when this one lands. */
  cargoCard: CardId | null;
  cargoMods: CastMods | null;
  /** Seconds until a timer trigger releases its cargo; -1 = on impact only. */
  triggerTimer: number;
  /** Frame damage bonus, inherited by cargo casts. */
  dmgBonus: number;
  /** Hazard ids already damaged (so pierce can't multi-hit per frame). */
  hitIds: number[];
}

export interface Canister {
  x: number;
  y: number;
  r: number;
  /** -1 = armed; >= 0 counts down to detonation. */
  fuse: number;
}

export interface Ring {
  x: number;
  y: number;
  age: number;
}

export interface Gate {
  x: number;
  y: number;
  r: number;
  open: boolean;
}

export interface SectorState {
  index: number;
  w: number;
  h: number;
  substrate: Substrate;
  shards: PointItem[];
  motes: PointItem[];
  hazards: Hazard[];
  canisters: Canister[];
  cardNodes: CardNode[];
  frameNodes: FrameNode[];
  projectiles: Projectile[];
  rings: Ring[];
  gate: Gate;
  spawn: PointItem;
  /** Monotonic id source for hazards spawned during play (heat). */
  nextId: number;
  heatTimer: number;
  heatSpawned: number;
  elapsed: number;
  shardTotal: number;
}

export function sectorDef(index: number) {
  return config.sectors[Math.min(index, config.sectors.length - 1)];
}

export function generateSector(rng: Rng, index: number): SectorState {
  const def = sectorDef(index);
  const w = def.w;
  const h = def.h;
  const margin = 60;

  const spawn: PointItem = { x: 110, y: h / 2 + range(rng, -h * 0.18, h * 0.18) };
  const gate: Gate = { x: w - 110, y: h * 0.25 + nextFloat(rng) * h * 0.5, r: 26, open: false };

  const substrate = createSubstrate(w, h);

  // Arena border: one cell of wall all around so the world stays sealed even
  // when explosions carve the interior (detonate never touches the border).
  const c = SUB.cellSize;
  stampWallRect(substrate, 0, 0, w, c);
  stampWallRect(substrate, 0, h - c, w, c);
  stampWallRect(substrate, 0, 0, c, h);
  stampWallRect(substrate, w - c, 0, c, h);

  // Interior walls, stamped into the grid so they can be destroyed in play.
  const wallRects: Rect[] = [];
  for (let i = 0; i < def.walls; i++) {
    for (let attempt = 0; attempt < 40; attempt++) {
      const ww = range(rng, 70, 190);
      const wh = range(rng, 70, 190);
      const rect: Rect = {
        x: range(rng, margin, w - margin - ww),
        y: range(rng, margin, h - margin - wh),
        w: ww,
        h: wh,
      };
      if (circleRect(spawn.x, spawn.y, 160, rect)) continue;
      if (circleRect(gate.x, gate.y, 150, rect)) continue;
      if (wallRects.some((o) => rectsOverlap(rect, o, 48))) continue;
      wallRects.push(rect);
      stampWallRect(substrate, rect.x, rect.y, rect.w, rect.h);
      break;
    }
  }

  // Card pickups: some in the open, some sealed inside destructible wall
  // rings ("caches"). Each cache gets a canister within reach — the key.
  const canisters: Canister[] = [];
  const cardNodes: CardNode[] = [];
  const cardPicks = rollCardPicks(rng, index, def.cardNodes + def.caches, def.caches);
  for (let i = 0; i < def.cardNodes + def.caches; i++) {
    const cached = i >= def.cardNodes;
    for (let attempt = 0; attempt < 40; attempt++) {
      const x = range(rng, 140, w - 140);
      const y = range(rng, 140, h - 140);
      if (dist(x, y, spawn.x, spawn.y) < 320) continue;
      if (dist(x, y, gate.x, gate.y) < 180) continue;
      if (solidInCircle(substrate, x, y, cached ? 60 : 26)) continue;
      if (cardNodes.some((n) => dist(n.x, n.y, x, y) < 260)) continue;
      cardNodes.push({ x, y, card: cardPicks[i] });
      if (cached) {
        stampCacheRing(substrate, x, y);
        // The key: a canister just outside the ring, at a deterministic angle.
        const a = nextFloat(rng) * Math.PI * 2;
        const kx = clamp(x + Math.cos(a) * 78, 40, w - 40);
        const ky = clamp(y + Math.sin(a) * 78, 40, h - 40);
        canisters.push({ x: kx, y: ky, r: config.canister.r, fuse: -1 });
      }
      break;
    }
  }

  for (let i = 0; i < def.canisters; i++) {
    for (let attempt = 0; attempt < 40; attempt++) {
      const x = range(rng, margin + 40, w - margin - 40);
      const y = range(rng, margin + 40, h - margin - 40);
      if (dist(x, y, spawn.x, spawn.y) < 300) continue;
      if (dist(x, y, gate.x, gate.y) < 160) continue;
      if (solidInCircle(substrate, x, y, 24)) continue;
      canisters.push({ x, y, r: config.canister.r, fuse: -1 });
      break;
    }
  }

  // Caster-frame pickups (sectors 2 and 4 guarantee one).
  const frameNodes: FrameNode[] = [];
  for (let i = 0; i < def.frames; i++) {
    for (let attempt = 0; attempt < 40; attempt++) {
      const x = range(rng, 160, w - 160);
      const y = range(rng, 160, h - 160);
      if (dist(x, y, spawn.x, spawn.y) < 360) continue;
      if (dist(x, y, gate.x, gate.y) < 200) continue;
      if (solidInCircle(substrate, x, y, 28)) continue;
      if (cardNodes.some((n) => dist(n.x, n.y, x, y) < 220)) continue;
      frameNodes.push({ x, y, frame: pick(rng, FOUND_FRAMES) });
      break;
    }
  }

  const shards: PointItem[] = [];
  for (let i = 0; i < def.shards; i++) {
    for (let attempt = 0; attempt < 80; attempt++) {
      const p: PointItem = { x: range(rng, 80, w - 80), y: range(rng, 80, h - 80) };
      if (dist(p.x, p.y, spawn.x, spawn.y) < 280) continue;
      if (dist(p.x, p.y, gate.x, gate.y) < 150) continue;
      if (solidInCircle(substrate, p.x, p.y, 34)) continue;
      if (shards.some((s) => dist(s.x, s.y, p.x, p.y) < 170)) continue;
      shards.push(p);
      break;
    }
  }

  const motes: PointItem[] = [];
  for (let i = 0; i < def.motes; i++) {
    for (let attempt = 0; attempt < 40; attempt++) {
      const p: PointItem = { x: range(rng, 50, w - 50), y: range(rng, 50, h - 50) };
      if (dist(p.x, p.y, spawn.x, spawn.y) < 120) continue;
      if (solidInCircle(substrate, p.x, p.y, 14)) continue;
      motes.push(p);
      break;
    }
  }

  const hz = config.hazards;
  const hazards: Hazard[] = [];

  for (let i = 0; i < def.drifters; i++) {
    placeMoving(rng, substrate, hazards, spawn, w, h, 300, (x, y) => {
      const speed = range(rng, hz.drifter.speedMin, hz.drifter.speedMax);
      const angle = nextFloat(rng) * Math.PI * 2;
      return {
        kind: "drifter",
        id: 0,
        hp: hz.drifter.hp,
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        r: range(rng, hz.drifter.rMin, hz.drifter.rMax),
      };
    });
  }

  for (let i = 0; i < def.seekers; i++) {
    placeMoving(rng, substrate, hazards, spawn, w, h, 460, (x, y) => ({
      kind: "seeker",
      id: 0,
      hp: hz.seeker.hp,
      x,
      y,
      vx: 0,
      vy: 0,
      r: hz.seeker.r,
    }));
  }

  for (let i = 0; i < def.sweepers; i++) {
    for (let attempt = 0; attempt < 40; attempt++) {
      const cx = range(rng, margin + 100, w - margin - 100);
      const cy = range(rng, margin + 100, h - margin - 100);
      if (dist(cx, cy, spawn.x, spawn.y) < 320) continue;
      if (solidInCircle(substrate, cx, cy, 30)) continue;
      const span = range(rng, hz.sweeper.spanMin, hz.sweeper.spanMax);
      const horizontal = nextFloat(rng) < 0.5;
      const ax = horizontal ? clamp(cx - span, margin, w - margin) : cx;
      const bx = horizontal ? clamp(cx + span, margin, w - margin) : cx;
      const ay = horizontal ? cy : clamp(cy - span, margin, h - margin);
      const by = horizontal ? cy : clamp(cy + span, margin, h - margin);
      hazards.push({
        kind: "sweeper",
        id: 0,
        hp: hz.sweeper.hp,
        x: cx,
        y: cy,
        r: hz.sweeper.r,
        ax,
        ay,
        bx,
        by,
        phase: nextFloat(rng) * Math.PI * 2,
        rate: range(rng, hz.sweeper.rateMin, hz.sweeper.rateMax),
      });
      break;
    }
  }

  for (let i = 0; i < def.pulsars; i++) {
    for (let attempt = 0; attempt < 40; attempt++) {
      const x = range(rng, margin + 60, w - margin - 60);
      const y = range(rng, margin + 60, h - margin - 60);
      if (dist(x, y, spawn.x, spawn.y) < 360) continue;
      if (dist(x, y, gate.x, gate.y) < 170) continue;
      if (solidInCircle(substrate, x, y, 26)) continue;
      hazards.push({ kind: "pulsar", id: 0, hp: hz.pulsar.hp, x, y, r: hz.pulsar.r, timer: range(rng, 0.8, hz.pulsar.cycle) });
      break;
    }
  }

  // Stable ids for damage tracking; heat spawns continue from nextId.
  hazards.forEach((hzd, i) => {
    hzd.id = i;
  });

  return {
    index,
    w,
    h,
    substrate,
    shards,
    motes,
    hazards,
    canisters,
    cardNodes,
    frameNodes,
    projectiles: [],
    rings: [],
    gate,
    spawn,
    nextId: hazards.length,
    heatTimer: def.heatInterval,
    heatSpawned: 0,
    elapsed: 0,
    shardTotal: shards.length,
  };
}

// --- placement helpers ------------------------------------------------------

function placeMoving(
  rng: Rng,
  substrate: Substrate,
  hazards: Hazard[],
  spawn: PointItem,
  w: number,
  h: number,
  spawnClearance: number,
  make: (x: number, y: number) => Hazard,
): void {
  const margin = 60;
  for (let attempt = 0; attempt < 40; attempt++) {
    const x = range(rng, margin, w - margin);
    const y = range(rng, margin, h - margin);
    if (dist(x, y, spawn.x, spawn.y) < spawnClearance) continue;
    if (solidInCircle(substrate, x, y, 20)) continue;
    hazards.push(make(x, y));
    return;
  }
}

/**
 * Pick cards for this sector's nodes. Sector 1 rolls payloads only (teach the
 * shots before the wrappers); later sectors roll the full pool. Caches (the
 * trailing picks) lean on the strongest cards so cracking them feels earned.
 */
function rollCardPicks(rng: Rng, index: number, count: number, cacheCount: number): CardId[] {
  const payloads: CardId[] = ["burst", "slug", "dart"];
  const full: CardId[] = ["burst", "slug", "dart", "sparktrigger", "timertrigger", "twin", "haste", "bounce", "pierce", "heavy", "multi", "blink"];
  const strong: CardId[] = ["sparktrigger", "timertrigger", "multi", "twin", "pierce", "blink", "heavy"];
  const pool = shuffle(rng, (index === 0 ? payloads : full).slice());
  const cachePool = shuffle(rng, strong.slice());
  const picks: CardId[] = [];
  for (let i = 0; i < count; i++) {
    // The trailing picks belong to caches (see the caller's placement loop).
    const fromCache = cachePool.length > 0 && i >= count - cacheCount;
    const src = fromCache ? cachePool : pool;
    const pick = src.pop();
    picks.push(pick ?? "bolt");
  }
  return picks;
}

/** A one-cell-thick destructible wall ring sealing a cache. */
function stampCacheRing(sub: Substrate, x: number, y: number): void {
  const c = SUB.cellSize;
  const inner = 30;
  const outer = 30 + c;
  const x0 = Math.floor((x - outer) / c);
  const y0 = Math.floor((y - outer) / c);
  const x1 = Math.floor((x + outer) / c);
  const y1 = Math.floor((y + outer) / c);
  for (let cy = y0; cy <= y1; cy++) {
    for (let cx = x0; cx <= x1; cx++) {
      if (cx <= 0 || cy <= 0 || cx >= sub.cols - 1 || cy >= sub.rows - 1) continue;
      const px = cx * c + c / 2;
      const py = cy * c + c / 2;
      const d = Math.hypot(px - x, py - y);
      if (d >= inner && d <= outer) {
        stampWallRect(sub, cx * c, cy * c, 1, 1);
      }
    }
  }
}

function rectsOverlap(a: Rect, b: Rect, gap: number): boolean {
  return (
    a.x < b.x + b.w + gap &&
    a.x + a.w + gap > b.x &&
    a.y < b.y + b.h + gap &&
    a.y + a.h + gap > b.y
  );
}

function circleRect(cx: number, cy: number, r: number, rect: Rect): boolean {
  const px = clamp(cx, rect.x, rect.x + rect.w);
  const py = clamp(cy, rect.y, rect.y + rect.h);
  const dx = cx - px;
  const dy = cy - py;
  return dx * dx + dy * dy < r * r;
}
