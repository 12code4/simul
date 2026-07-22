// The full mutable game state lives in one serializable object tree — no
// classes, no closures. This keeps save/load, debugging, and determinism
// tractable. All in-run randomness flows through RunState.rng (seeded);
// Math.random is only ever used to pick a fresh seed for a new run.

import { config } from "./config";
import { createRng, type Rng } from "./rng";
import { loadMeta, type MetaState } from "./meta";
import { generateSector, type SectorState } from "./sector";
import type { ModId } from "./mods";
import { CARDS, createStarterCaster, type CardId, type Caster } from "./cards";

export const MAX_CASTERS = 2;

export type Phase = "title" | "playing" | "draft" | "paused" | "gameover" | "victory";

/** Player stats for the current run: base + meta upgrades, mutated by mods. */
export interface RunStats {
  maxSpeed: number;
  accel: number;
  drag: number;
  dashCharges: number;
  dashRecharge: number;
  dashDuration: number;
  pickupRadius: number;
  iframeMult: number;
  /** Demolition Sync mod: explosions can't hurt the player. */
  demolition: boolean;
}

export interface PlayerState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  faceX: number;
  faceY: number;
  dashTimer: number;
  dashX: number;
  dashY: number;
  charges: number;
  recharge: number;
  iframes: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
}

export interface Outcome {
  won: boolean;
  banked: number;
  sectorReached: number;
  time: number;
  kills: number;
}

export interface RunState {
  seed: number;
  rng: Rng;
  sectorIndex: number;
  integrity: number;
  maxIntegrity: number;
  flux: number;
  /** Hazards destroyed this run (cards, fire, explosions, coolant). */
  kills: number;
  mods: ModId[];
  /** The player's decks (up to MAX_CASTERS); swap in play with Q. */
  casters: Caster[];
  activeCaster: number;
  /** Unequipped cards, edited into the casters between sectors. */
  inventory: CardId[];
  stats: RunStats;
  player: PlayerState;
  sector: SectorState;
  particles: Particle[];
  camX: number;
  camY: number;
  shake: number;
  /** Accumulated play time (excludes menus/draft), in seconds. */
  time: number;
}

/** Dev/testing hooks read from the URL (?seed=hex&sector=1-5&deck=a,b,c). */
export interface DevParams {
  seed: number | null;
  sector: number | null;
  /** Starting deck override for the first caster (comma-separated card ids). */
  deck: CardId[] | null;
}

/** Selection state for the between-sector deck editor (click-click swaps). */
export interface EditSelection {
  zone: "slot" | "inv";
  /** Which caster row, for slot selections. */
  caster: number;
  index: number;
}

export interface GameState {
  phase: Phase;
  meta: MetaState;
  run: RunState | null;
  draftOptions: ModId[] | null;
  menuIndex: number;
  /** Mod picked on the sector-clear screen; applied on continue. */
  chosenMod: number | null;
  editSel: EditSelection | null;
  outcome: Outcome | null;
  /** Wall-clock-ish UI time for menu pulses; advances every update. */
  uiTime: number;
  dev: DevParams;
}

function readDevParams(): DevParams {
  try {
    const params = new URLSearchParams(window.location.search);
    const seedRaw = params.get("seed");
    const sectorRaw = params.get("sector");
    const deckRaw = params.get("deck");
    const seed = seedRaw !== null ? Number.parseInt(seedRaw, 16) : NaN;
    const sector = sectorRaw !== null ? Number.parseInt(sectorRaw, 10) : NaN;
    let deck: CardId[] | null = null;
    if (deckRaw) {
      const ids = deckRaw.split(",").filter((id): id is CardId => id in CARDS);
      if (ids.length > 0) deck = ids;
    }
    return {
      seed: Number.isFinite(seed) ? seed >>> 0 : null,
      sector: Number.isFinite(sector) ? Math.min(5, Math.max(1, sector)) : null,
      deck,
    };
  } catch {
    return { seed: null, sector: null, deck: null };
  }
}

export function createInitialState(): GameState {
  return {
    phase: "title",
    meta: loadMeta(),
    run: null,
    draftOptions: null,
    menuIndex: 0,
    chosenMod: null,
    editSel: null,
    outcome: null,
    uiTime: 0,
    dev: readDevParams(),
  };
}

export function computeRunStats(meta: MetaState): RunStats {
  const thrust = 1 + 0.06 * meta.thrusters;
  let recharge = config.dash.rechargeTime;
  if (meta.capacitor >= 1) recharge *= 0.8;
  if (meta.capacitor >= 3) recharge *= 0.8;
  return {
    maxSpeed: config.player.maxSpeed * thrust,
    accel: config.player.accel * thrust,
    drag: config.player.drag,
    dashCharges: config.dash.charges + (meta.capacitor >= 2 ? 1 : 0),
    dashRecharge: recharge,
    dashDuration: config.dash.duration,
    pickupRadius: config.player.pickupRadius,
    iframeMult: 1,
    demolition: false,
  };
}

function makePlayer(sector: SectorState, stats: RunStats): PlayerState {
  return {
    x: sector.spawn.x,
    y: sector.spawn.y,
    vx: 0,
    vy: 0,
    faceX: 1,
    faceY: 0,
    dashTimer: 0,
    dashX: 1,
    dashY: 0,
    charges: stats.dashCharges,
    recharge: 0,
    iframes: 1.2, // spawn grace so nothing cheap-shots a fresh sector
  };
}

export function createRun(meta: MetaState, seed: number): RunState {
  const rng = createRng(seed);
  const stats = computeRunStats(meta);
  const maxIntegrity = Math.min(
    config.player.integrityCap,
    config.player.baseIntegrity + meta.hull,
  );
  const sector = generateSector(rng, 0);
  return {
    seed,
    rng,
    sectorIndex: 0,
    integrity: maxIntegrity,
    maxIntegrity,
    flux: 0,
    kills: 0,
    mods: [],
    casters: [createStarterCaster()],
    activeCaster: 0,
    inventory: [],
    stats,
    player: makePlayer(sector, stats),
    sector,
    particles: [],
    camX: sector.spawn.x,
    camY: sector.spawn.y,
    shake: 0,
    time: 0,
  };
}

/** Advance the run into a (newly generated) sector and reset the player. */
export function enterSector(run: RunState, index: number): void {
  run.sectorIndex = index;
  run.sector = generateSector(run.rng, index);
  run.player = makePlayer(run.sector, run.stats);
  run.particles = [];
  run.camX = run.sector.spawn.x;
  run.camY = run.sector.spawn.y;
  run.shake = 0;
}
