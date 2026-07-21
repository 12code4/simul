// Seeded procedural generation of a sector: walls, data shards, flux motes,
// autonomous hazards, spawn point, and the exit gate. Everything is placed by
// rejection sampling with clearance rules so layouts are always traversable
// (spawn and gate keep generous clear zones) and deterministic per seed.

import { config } from "./config";
import { circleRectOverlap, clamp, dist, type Rect } from "./physics";
import { nextFloat, range, type Rng } from "./rng";

export type Wall = Rect;

export interface PointItem {
  x: number;
  y: number;
}

export type Hazard =
  | { kind: "drifter"; x: number; y: number; vx: number; vy: number; r: number }
  | { kind: "seeker"; x: number; y: number; vx: number; vy: number; r: number }
  | { kind: "sweeper"; x: number; y: number; r: number; ax: number; ay: number; bx: number; by: number; phase: number; rate: number }
  | { kind: "pulsar"; x: number; y: number; r: number; timer: number };

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
  walls: Wall[];
  shards: PointItem[];
  motes: PointItem[];
  hazards: Hazard[];
  rings: Ring[];
  gate: Gate;
  spawn: PointItem;
  heatTimer: number;
  heatSpawned: number;
  elapsed: number;
  shardTotal: number;
}

export function sectorDef(index: number) {
  return config.sectors[Math.min(index, config.sectors.length - 1)];
}

function rectsOverlap(a: Rect, b: Rect, gap: number): boolean {
  return (
    a.x < b.x + b.w + gap &&
    a.x + a.w + gap > b.x &&
    a.y < b.y + b.h + gap &&
    a.y + a.h + gap > b.y
  );
}

function insideAnyWall(walls: Wall[], x: number, y: number, clearance: number): boolean {
  return walls.some((wl) => circleRectOverlap(x, y, clearance, wl));
}

export function generateSector(rng: Rng, index: number): SectorState {
  const def = sectorDef(index);
  const w = def.w;
  const h = def.h;
  const margin = 60;

  const spawn: PointItem = { x: 110, y: h / 2 + range(rng, -h * 0.18, h * 0.18) };
  const gate: Gate = { x: w - 110, y: h * 0.25 + nextFloat(rng) * h * 0.5, r: 26, open: false };

  const walls: Wall[] = [];
  for (let i = 0; i < def.walls; i++) {
    for (let attempt = 0; attempt < 40; attempt++) {
      const ww = range(rng, 80, 260);
      const wh = range(rng, 80, 260);
      const rect: Rect = {
        x: range(rng, margin, w - margin - ww),
        y: range(rng, margin, h - margin - wh),
        w: ww,
        h: wh,
      };
      if (circleRectOverlap(spawn.x, spawn.y, 160, rect)) continue;
      if (circleRectOverlap(gate.x, gate.y, 150, rect)) continue;
      if (walls.some((o) => rectsOverlap(rect, o, 48))) continue;
      walls.push(rect);
      break;
    }
  }

  const shards: PointItem[] = [];
  for (let i = 0; i < def.shards; i++) {
    for (let attempt = 0; attempt < 80; attempt++) {
      const p: PointItem = { x: range(rng, 80, w - 80), y: range(rng, 80, h - 80) };
      if (dist(p.x, p.y, spawn.x, spawn.y) < 280) continue;
      if (dist(p.x, p.y, gate.x, gate.y) < 150) continue;
      if (insideAnyWall(walls, p.x, p.y, 34)) continue;
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
      if (insideAnyWall(walls, p.x, p.y, 14)) continue;
      motes.push(p);
      break;
    }
  }

  const hz = config.hazards;
  const hazards: Hazard[] = [];

  for (let i = 0; i < def.drifters; i++) {
    for (let attempt = 0; attempt < 40; attempt++) {
      const x = range(rng, margin, w - margin);
      const y = range(rng, margin, h - margin);
      if (dist(x, y, spawn.x, spawn.y) < 300) continue;
      if (insideAnyWall(walls, x, y, 20)) continue;
      const speed = range(rng, hz.drifter.speedMin, hz.drifter.speedMax);
      const angle = nextFloat(rng) * Math.PI * 2;
      hazards.push({
        kind: "drifter",
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        r: range(rng, hz.drifter.rMin, hz.drifter.rMax),
      });
      break;
    }
  }

  for (let i = 0; i < def.seekers; i++) {
    for (let attempt = 0; attempt < 40; attempt++) {
      const x = range(rng, margin, w - margin);
      const y = range(rng, margin, h - margin);
      if (dist(x, y, spawn.x, spawn.y) < 460) continue;
      if (insideAnyWall(walls, x, y, 20)) continue;
      hazards.push({ kind: "seeker", x, y, vx: 0, vy: 0, r: hz.seeker.r });
      break;
    }
  }

  for (let i = 0; i < def.sweepers; i++) {
    for (let attempt = 0; attempt < 40; attempt++) {
      const cx = range(rng, margin + 100, w - margin - 100);
      const cy = range(rng, margin + 100, h - margin - 100);
      if (dist(cx, cy, spawn.x, spawn.y) < 320) continue;
      if (insideAnyWall(walls, cx, cy, 30)) continue;
      const span = range(rng, hz.sweeper.spanMin, hz.sweeper.spanMax);
      const horizontal = nextFloat(rng) < 0.5;
      const ax = horizontal ? clamp(cx - span, margin, w - margin) : cx;
      const bx = horizontal ? clamp(cx + span, margin, w - margin) : cx;
      const ay = horizontal ? cy : clamp(cy - span, margin, h - margin);
      const by = horizontal ? cy : clamp(cy + span, margin, h - margin);
      hazards.push({
        kind: "sweeper",
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
      if (insideAnyWall(walls, x, y, 26)) continue;
      hazards.push({ kind: "pulsar", x, y, r: hz.pulsar.r, timer: range(rng, 0.8, hz.pulsar.cycle) });
      break;
    }
  }

  return {
    index,
    w,
    h,
    walls,
    shards,
    motes,
    hazards,
    rings: [],
    gate,
    spawn,
    heatTimer: def.heatInterval,
    heatSpawned: 0,
    elapsed: 0,
    shardTotal: shards.length,
  };
}
